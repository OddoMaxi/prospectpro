/**
 * Cartes d'assuré (CDC § 9.5 ; SAN-RG-011 à 019 ; CA-SAN-01, 20 ; maquettes SA-04 et AS-02).
 *
 * - À l'émission d'une police santé (et à l'entrée d'un ayant droit), une carte par personne couverte : numéro
 *   police + rang (chapitre 6), numéro de série unique, jeton de QR code aléatoire sans donnée personnelle, vérifié
 *   en ligne et révocable. La carte numérique est immédiate ; la carte physique est produite sur demande.
 * - Droits de la carte : jamais recopiés, calculés à chaque vérification depuis la police (active, payée), la sortie
 *   de l'assuré et les motifs de blocage ; ils reprennent d'eux-mêmes au renouvellement, sans nouvelle carte.
 * - Production suivie (demandée, imprimée, remise) ; remise confirmée par le code de l'assuré (ou de son représentant).
 * - Perte ou vol : révocation immédiate et nouvelle carte numérique ; une nouvelle carte physique est facturée
 *   (frais paramétrés, sans commission, EVT-26) si le support perdu était physique.
 */
import { randomBytes } from 'node:crypto';
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger, nonTrouve } from '../../noyau/erreurs.js';
import { ajouterAnnees, age, aujourdhui } from '../../noyau/dates.js';
import { journaliser } from '../../moteurs/audit.js';
import { numeroCarte, prochaineValeur } from '../../moteurs/numerotation.js';
import { notifier } from '../../moteurs/notifications.js';
import { entier, valeurParametre } from '../../moteurs/parametres.js';
import { genererDocument } from '../../moteurs/documents.js';
import { comptabiliser } from '../comptabilite/moteur.js';
import { compteComptable, compteProductionDuBureau, lireCompteProduction, mouvementer } from '../commercial/comptesProduction.js';
import { tresorerieDe, type Moyen } from '../finances/tresorerie.js';
import { confirmerAcceptation, demanderAcceptation } from '../documents/acceptation.js';
import { motifsActifs } from '../droits/blocages.js';
import { Refus } from '../auth/service.js';

const gnf = (n: number) => `${n.toLocaleString('fr-FR').replace(/ /g, ' ')} GNF`;
const fr = (d: string) => d.slice(0, 10).split('-').reverse().join('/');
export const MOTIFS_POLICE: Record<string, string> = {
  ECHUE: 'Police échue : prime de renouvellement non payée', SUSPENDUE: 'Police suspendue pour non-paiement', EXPIREE: 'Police expirée',
  RESILIEE: 'Police résiliée', ANNULEE: 'Police annulée', PROPOSITION: 'Police non émise',
};

interface Carte {
  id: string; numero: string; numero_serie: string; jeton_qr: string; statut: string; production: string; police_assure_id: string; validite_support: string | null;
  remplace_carte_id: string | null; groupe_sanguin: string | null; lieu_retrait: string | null; motif_production: string | null;
  police_id: string; police: string; statut_police: string; souscripteur_id: string; tiers_id: string; assure: string; date_naissance: string | null; date_sortie: string | null; bureau_gestion_id: string;
}
const SELECT_CARTE = `
  SELECT c.id, c.numero, c.numero_serie, c.jeton_qr, c.statut, c.production, c.police_assure_id, c.validite_support::text, c.remplace_carte_id, c.groupe_sanguin, c.lieu_retrait, c.motif_production,
         p.id AS police_id, p.numero AS police, p.statut AS statut_police, p.souscripteur_id, pa.tiers_id, trim(COALESCE(t.prenoms, '') || ' ' || t.nom) AS assure,
         t.date_naissance::text, pa.date_sortie::text, p.bureau_gestion_id
    FROM carte_assure c JOIN police_assure pa ON pa.id = c.police_assure_id JOIN police p ON p.id = pa.police_id JOIN tiers t ON t.id = pa.tiers_id`;

async function lireCarte(q: Executant, id: string, verrou = false): Promise<Carte> {
  const r = (await q.query<Carte>(`${SELECT_CARTE} WHERE c.id = $1 AND c.supprime_le IS NULL${verrou ? ' FOR UPDATE OF c' : ''}`, [id])).rows[0];
  if (!r) throw nonTrouve('Carte');
  return r;
}

async function nouveauSerie(q: Executant) {
  const annee = aujourdhui().slice(2, 4);
  const { valeur } = await prochaineValeur(q, 'CARTE_ASSURE_SERIE', annee, 999_999);
  return `S${annee}-${String(valeur).padStart(6, '0')}`;
}

/** La formule de la police comporte une garantie de frais de soins (police santé). */
async function estPoliceSante(q: Executant, policeId: string) {
  return !!(await q.query(`SELECT 1 FROM police p JOIN garantie g ON g.formule_id = p.formule_id AND g.supprime_le IS NULL WHERE p.id = $1 AND g.type IN ('FRAIS_SOINS', 'TELECONSULTATION') LIMIT 1`, [policeId])).rowCount;
}

/**
 * SAN-RG-011 : cartes manquantes d'une police santé (émission, ajout d'un ayant droit) ; sans effet pour une personne
 * qui a déjà une carte en cours. Au renouvellement, aucune nouvelle carte : les droits suivent la période payée.
 */
export async function creerCartes(q: Executant, acteur: Acteur, policeId: string) {
  if (!(await estPoliceSante(q, policeId))) return [];
  const manquants = (await q.query<{ id: string; rang_carte: string; numero: string }>(
    `SELECT pa.id, pa.rang_carte, p.numero FROM police_assure pa JOIN police p ON p.id = pa.police_id
      WHERE pa.police_id = $1 AND (pa.date_sortie IS NULL OR pa.date_sortie > current_date)
        AND NOT EXISTS (SELECT 1 FROM carte_assure c WHERE c.police_assure_id = pa.id AND c.statut <> 'REVOQUEE' AND c.supprime_le IS NULL) ORDER BY pa.rang_carte`, [policeId])).rows;
  const ids: string[] = [];
  for (const m of manquants) {
    const id = crypto.randomUUID(), serie = await nouveauSerie(q);
    await q.query(`INSERT INTO carte_assure (id, numero, police_assure_id, numero_serie, jeton_qr, statut, production) VALUES ($1,$2,$3,$4,$5,'ACTIVE','NUMERIQUE_SEULE')`,
      [id, numeroCarte(m.numero, Number(m.rang_carte)), m.id, serie, randomBytes(24).toString('base64url')]);
    await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'carte_assure', objetId: id, apres: { serie, police: m.numero, rang: m.rang_carte } });
    ids.push(id);
  }
  return ids;
}

// ---------------------------------------------------------------- droits de la carte (SAN-RG-012, 013, 018)

export interface EtatCarte { valide: boolean; etat: 'VALIDE' | 'BLOQUEE' | 'REVOQUEE'; motif: string | null }
async function etat(q: Executant, c: Carte, jour = aujourdhui()): Promise<EtatCarte> {
  if (c.statut === 'REVOQUEE') return { valide: false, etat: 'REVOQUEE', motif: 'Carte révoquée (remplacée)' };
  if (c.statut_police !== 'ACTIVE') return { valide: false, etat: 'BLOQUEE', motif: MOTIFS_POLICE[c.statut_police] ?? `Police ${c.statut_police.toLowerCase()}` };
  if (c.date_sortie && c.date_sortie <= jour) return { valide: false, etat: 'BLOQUEE', motif: 'Personne sortie du contrat' };
  const periode = await q.query(`SELECT 1 FROM police_periode WHERE police_id = $1 AND date_debut <= $2 AND date_fin >= $2`, [c.police_id, jour]);
  if (!periode.rowCount) return { valide: false, etat: 'BLOQUEE', motif: 'Aucune période de garantie payée à cette date' };
  const motifs = await motifsActifs(q, { tiersId: c.tiers_id, carteId: c.id });
  if (motifs.length) return { valide: false, etat: 'BLOQUEE', motif: motifs[0]!.libelle_prestataire };
  return { valide: true, etat: 'VALIDE', motif: null };
}

/**
 * Vérification d'une carte par son jeton (scan du QR code) ou son numéro : photo affichée depuis le serveur, état
 * des droits ; aucune donnée médicale (SAN-RG-018). Le détail des garanties et des soldes vient du moteur de droits.
 */
export async function verifierCarte(q: Executant, d: { jeton?: string; numero?: string }) {
  const c = (await q.query<Carte>(`${SELECT_CARTE} WHERE ${d.jeton ? 'c.jeton_qr = $1' : 'c.numero = $1'} AND c.supprime_le IS NULL ORDER BY (c.statut = 'REVOQUEE'), c.cree_le DESC LIMIT 1`, [d.jeton ?? d.numero])).rows[0];
  if (!c) throw new ErreurMetier('CARTE_INCONNUE', 'Carte inconnue', 404);
  const e = await etat(q, c);
  const photo = (await q.query<{ id: string }>(
    `SELECT doc.id FROM dossier_souscription ds, jsonb_array_elements(ds.donnees->'pieces') x JOIN document doc ON doc.id = (x->>'documentId')::uuid
      WHERE ds.police_id = $1 AND x->>'tiersId' = $2 AND x->>'type' = 'PHOTO' ORDER BY ds.cree_le DESC LIMIT 1`, [c.police_id, c.tiers_id])).rows[0];
  return { carteId: c.id, numero: c.numero, serie: c.numero_serie, assure: c.assure, age: c.date_naissance ? age(c.date_naissance, aujourdhui()) : null, police: c.police,
    tiersId: c.tiers_id, photoDocumentId: photo?.id ?? null, ...e };
}

// ---------------------------------------------------------------- carte physique (SAN-RG-011, 014, 015)

export type Paiement = { type: 'COMPTE_PRODUCTION' } | { type: 'PAIEMENT_DIRECT'; moyen: Moyen; banque?: string };

/** Frais hors prime (EVT-26, sans commission) payés comme une prime : compte de production du bureau ou paiement direct. */
async function facturerFrais(q: Executant, acteur: Acteur, c: Carte, montant: number, libelle: string, paiement: Paiement) {
  let tresorerie, journalTresorerie: string | undefined, cp = null;
  if (paiement.type === 'COMPTE_PRODUCTION') {
    cp = await lireCompteProduction(q, (await compteProductionDuBureau(q, c.bureau_gestion_id)).id, true);
    tresorerie = compteComptable(cp);
  } else {
    const t = await tresorerieDe(q, paiement.moyen, paiement.banque);
    tresorerie = { compteId: t.compteId }; journalTresorerie = t.journal;
  }
  const doc = await genererDocument(q, acteur, { modeleCode: 'QUITTANCE', typeDocument: 'QUITTANCE_FRAIS', objet: { type: 'carte_assure', id: c.id }, variables: {
    quittance: `FRAIS ${c.numero_serie}`, police: c.police, souscripteur: c.assure, date_effet: fr(aujourdhui()), date_fin: fr(aujourdhui()),
    mode_paiement: cp ? 'débit du compte de production du bureau' : paiement.type === 'PAIEMENT_DIRECT' ? paiement.moyen.toLowerCase().replace(/_/g, ' ') : '',
    lignes: [{ libelle, montant: gnf(montant) }, { libelle: 'Total', montant: gnf(montant) }],
  } });
  const [e] = await comptabiliser(q, acteur, { codeEvt: 'EVT-26', reference: `CARTE ${c.numero_serie}`, pieceDocumentId: doc.id, journalTresorerie,
    montants: { TOTAL: montant, ACCESSOIRES: montant }, comptes: { TRESORERIE: tresorerie, TAXES: [] } });
  if (cp) await mouvementer(q, acteur, { compteId: cp.id, nature: 'FRAIS_HORS_PRIME', montant, reference: c.numero_serie, ecritureId: e!.id });
  return { montant, ecritureId: e!.id };
}

/** Frais d'une demande de carte physique : remplacement d'un support physique perdu ou volé, livraison. */
async function fraisDemande(q: Executant, c: Carte, lieu: string) {
  let remplacement = 0;
  if (c.remplace_carte_id) {
    const ancienne = (await q.query<{ production: string }>('SELECT production FROM carte_assure WHERE id = $1', [c.remplace_carte_id])).rows[0];
    if (ancienne && ['IMPRIMEE', 'REMISE'].includes(ancienne.production)) remplacement = await entier(q, 'SAN_FRAIS_REMPLACEMENT_CARTE');
  }
  const livraison = lieu === 'LIVRAISON' ? await entier(q, 'SAN_FRAIS_LIVRAISON_CARTE') : 0;
  return { remplacement, livraison, total: remplacement + livraison };
}

export async function demanderCartePhysique(q: Executant, acteur: Acteur, carteId: string, d: { lieu: 'BUREAU' | 'SIEGE' | 'LIVRAISON'; bureauId?: string; adresse?: string; office?: boolean; paiement?: Paiement }) {
  const c = await lireCarte(q, carteId, true);
  exiger(c.statut === 'ACTIVE', 'CARTE_REVOQUEE', 'Carte révoquée : demander le support de la nouvelle carte');
  exiger(c.production === 'NUMERIQUE_SEULE', 'DEJA_DEMANDEE', 'Une carte physique est déjà demandée ou produite pour ce numéro de série', 409);
  if (d.lieu === 'BUREAU') exiger(d.bureauId, 'BUREAU_REQUIS', 'Choisir le bureau de retrait');
  if (d.lieu === 'LIVRAISON') exiger(d.adresse?.trim(), 'ADRESSE_REQUISE', 'Adresse de livraison obligatoire');
  const frais = await fraisDemande(q, c, d.lieu);
  let paiement = null;
  if (frais.total > 0) {
    exiger(d.paiement, 'PAIEMENT_REQUIS', `Frais de ${gnf(frais.total)} à régler (${[frais.remplacement && 'remplacement', frais.livraison && 'livraison'].filter(Boolean).join(' et ')}) : au bureau ou au guichet`, 422);
    paiement = await facturerFrais(q, acteur, c, frais.total, `Carte ${c.numero} : ${[frais.remplacement && `remplacement ${gnf(frais.remplacement)}`, frais.livraison && `livraison ${gnf(frais.livraison)}`].filter(Boolean).join(', ')}`, d.paiement!);
  }
  const motif = d.office ? 'OFFICE' : c.motif_production?.startsWith('REMPLACEMENT') ? c.motif_production : 'DEMANDE_ASSURE';
  await q.query(`UPDATE carte_assure SET production = 'PHYSIQUE_DEMANDEE', motif_production = $2, lieu_retrait = $3, bureau_retrait_id = $4, adresse_livraison = $5, demandee_le = now() WHERE id = $1`,
    [carteId, motif, d.lieu, d.lieu === 'BUREAU' ? d.bureauId : null, d.lieu === 'LIVRAISON' ? d.adresse!.trim() : null]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'carte_assure', objetId: carteId, apres: { production: 'PHYSIQUE_DEMANDEE', lieu: d.lieu, frais: frais.total } });
  return { frais: frais.total, paiement };
}

/** Impression (file de production) : fiche d'impression, support valable 3 ans ; l'assuré est prévenu. */
export async function imprimerCarte(q: Executant, acteur: Acteur, carteId: string) {
  const c = await lireCarte(q, carteId, true);
  exiger(c.statut === 'ACTIVE' && c.production === 'PHYSIQUE_DEMANDEE', 'STATUT_INVALIDE', 'Seule une carte physique demandée et active est imprimée');
  const validite = ajouterAnnees(aujourdhui(), await entier(q, 'SAN_VALIDITE_CARTE_ANS'));
  const souscripteur = (await q.query<{ n: string }>(`SELECT trim(COALESCE(prenoms, '') || ' ' || nom) AS n FROM tiers WHERE id = $1`, [c.souscripteur_id])).rows[0]!.n;
  const doc = await genererDocument(q, acteur, { modeleCode: 'CARTE_ASSURE', typeDocument: 'CARTE_ASSURE', objet: { type: 'carte_assure', id: carteId }, variables: {
    assure: c.assure, carte: c.numero, police: c.police, souscripteur, serie: c.numero_serie, validite: fr(validite), jeton: c.jeton_qr,
    groupe: c.groupe_sanguin ? `Groupe sanguin : ${c.groupe_sanguin}` : '', annuaire: 'annuaire public des partenaires', telephone_compagnie: 'voir votre espace assuré',
  } });
  await q.query(`UPDATE carte_assure SET production = 'IMPRIMEE', validite_support = $2, imprimee_le = now() WHERE id = $1`, [carteId, validite]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'carte_assure', objetId: carteId, apres: { production: 'IMPRIMEE', document: doc.id, validite } });
  const dest = await destinataire(q, c);
  const bureau = c.lieu_retrait === 'BUREAU' ? (await q.query<{ nom: string }>('SELECT b.nom FROM carte_assure c JOIN bureau b ON b.id = c.bureau_retrait_id WHERE c.id = $1', [carteId])).rows[0]?.nom : null;
  if (dest.telephone) await notifier(q, { tiersId: dest.tiersId, code: 'CARTE_A_RETIRER', canal: 'SMS', adresse: dest.telephone, objet: { type: 'carte_assure', id: carteId },
    variables: { assure: c.assure, retrait: c.lieu_retrait === 'LIVRAISON' ? 'Elle vous sera livrée.' : `Retrait : ${bureau ?? 'au siège'}.` } }).catch(() => undefined);
  return { documentId: doc.id, validite };
}

/** Code de confirmation : l'assuré lui-même, ou le souscripteur pour un mineur ou un assuré sans téléphone (SAN-RG-015). */
async function destinataire(q: Executant, c: Carte) {
  const t = (await q.query<{ telephone: string | null; telephone_verifie: boolean | null }>('SELECT telephone, telephone_verifie FROM tiers WHERE id = $1', [c.tiers_id])).rows[0]!;
  const mineur = c.date_naissance ? age(c.date_naissance, aujourdhui()) < 18 : false;
  if (!mineur && t.telephone) return { tiersId: c.tiers_id, telephone: t.telephone };
  const s = (await q.query<{ telephone: string | null }>('SELECT telephone FROM tiers WHERE id = $1', [c.souscripteur_id])).rows[0]!;
  return { tiersId: c.souscripteur_id, telephone: s.telephone };
}

async function documentCarte(q: Executant, carteId: string) {
  const d = (await q.query<{ id: string }>(`SELECT id FROM document WHERE objet_type = 'carte_assure' AND objet_id = $1 AND type_document = 'CARTE_ASSURE' ORDER BY horodatage_scellement DESC LIMIT 1`, [carteId])).rows[0];
  if (!d) throw nonTrouve('Fiche d\'impression de la carte');
  return d.id;
}

export async function demanderRemise(q: Executant, acteur: Acteur, carteId: string) {
  const c = await lireCarte(q, carteId, true);
  exiger(c.production === 'IMPRIMEE' && c.statut === 'ACTIVE', 'STATUT_INVALIDE', 'La carte doit être imprimée avant sa remise');
  return demanderAcceptation(q, acteur, await documentCarte(q, carteId), (await destinataire(q, c)).tiersId);
}

export async function confirmerRemise(q: Executant, acteur: Acteur, carteId: string, code: string) {
  const c = await lireCarte(q, carteId, true);
  exiger(c.production === 'IMPRIMEE' && c.statut === 'ACTIVE', 'STATUT_INVALIDE', 'La carte doit être imprimée avant sa remise');
  const r = await confirmerAcceptation(q, acteur, { documentId: await documentCarte(q, carteId), signataireId: (await destinataire(q, c)).tiersId, code, assiste: true });
  if (r instanceof Refus) return r;
  await q.query(`UPDATE carte_assure SET production = 'REMISE', remise_preuve_id = $2, remise_le = now() WHERE id = $1`, [carteId, r.preuveId]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'carte_assure', objetId: carteId, apres: { production: 'REMISE' } });
  return { remise: true };
}

// ---------------------------------------------------------------- perte, vol (SAN-RG-014, 018)

/** Révocation immédiate (le jeton et le numéro de série cessent d'être valides) et nouvelle carte numérique. */
export async function declarerPerte(q: Executant, acteur: Acteur, carteId: string, motif: 'PERTE' | 'VOL') {
  const c = await lireCarte(q, carteId, true);
  exiger(c.statut !== 'REVOQUEE', 'DEJA_REVOQUEE', 'Carte déjà révoquée', 409);
  await q.query(`UPDATE carte_assure SET statut = 'REVOQUEE', revoquee_le = now(), motif_revocation = $2 WHERE id = $1`, [carteId, motif]);
  const id = crypto.randomUUID(), serie = await nouveauSerie(q);
  await q.query(
    `INSERT INTO carte_assure (id, numero, police_assure_id, numero_serie, jeton_qr, statut, production, remplace_carte_id, motif_production, groupe_sanguin)
     VALUES ($1,$2,$3,$4,$5,'ACTIVE','NUMERIQUE_SEULE',$6,$7,$8)`,
    [id, c.numero, c.police_assure_id, serie, randomBytes(24).toString('base64url'), carteId, motif === 'VOL' ? 'REMPLACEMENT_VOL' : 'REMPLACEMENT_PERTE', c.groupe_sanguin]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'carte_assure', objetId: carteId, apres: { statut: 'REVOQUEE', motif, remplacee_par: id } });
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'carte_assure', objetId: id, apres: { serie, remplace: c.numero_serie } });
  const dest = await destinataire(q, c);
  if (dest.telephone) await notifier(q, { tiersId: dest.tiersId, code: 'CARTE_REVOQUEE', canal: 'SMS', adresse: dest.telephone, objet: { type: 'carte_assure', id },
    variables: { carte: c.numero, assure: c.assure, motif: motif === 'VOL' ? 'vol déclaré' : 'perte déclarée' } }).catch(() => undefined);
  const frais = ['IMPRIMEE', 'REMISE'].includes(c.production) ? await entier(q, 'SAN_FRAIS_REMPLACEMENT_CARTE') : 0;
  return { nouvelleCarteId: id, serie, fraisCartePhysique: frais };
}

/** SAN-RG-017 : groupe sanguin déclaré par l'assuré, imprimé seulement avec son accord ; sans accord, aucune mention. */
export async function declarerGroupeSanguin(q: Executant, acteur: Acteur, carteId: string, d: { groupe: string | null; consentementImpression: boolean }) {
  const c = await lireCarte(q, carteId, true);
  exiger(c.statut === 'ACTIVE', 'CARTE_REVOQUEE', 'Carte révoquée');
  const groupe = d.groupe && d.consentementImpression ? d.groupe : null;
  await q.query('UPDATE carte_assure SET groupe_sanguin = $2 WHERE id = $1', [carteId, groupe]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'carte_assure', objetId: carteId, apres: { groupeSanguinImprime: !!groupe } });
}

// ---------------------------------------------------------------- consultation

export async function cartesDePolice(q: Executant, policeId: string) {
  const cartes = (await q.query<Carte & { demandee_le: string | null; imprimee_le: string | null; remise_le: string | null; revoquee_le: string | null; motif_revocation: string | null; rang: string }>(
    `${SELECT_CARTE.replace('p.bureau_gestion_id', 'p.bureau_gestion_id, c.demandee_le, c.imprimee_le, c.remise_le, c.revoquee_le, c.motif_revocation, pa.rang_carte AS rang')}
      WHERE p.id = $1 AND c.supprime_le IS NULL ORDER BY pa.rang_carte, c.cree_le DESC`, [policeId])).rows;
  return Promise.all(cartes.map(async c => ({ ...c, ...(await etat(q, c)) })));
}

/** File de production (SA-04) : cartes physiques demandées, imprimées à remettre, indicateurs. */
export async function fileProduction(q: Executant) {
  const file = (await q.query(
    `SELECT c.id, c.numero, c.numero_serie, c.production, c.motif_production, c.lieu_retrait, b.nom AS bureau, c.adresse_livraison, c.demandee_le, c.imprimee_le,
            trim(COALESCE(t.prenoms, '') || ' ' || t.nom) AS assure, p.numero AS police
       FROM carte_assure c JOIN police_assure pa ON pa.id = c.police_assure_id JOIN police p ON p.id = pa.police_id JOIN tiers t ON t.id = pa.tiers_id LEFT JOIN bureau b ON b.id = c.bureau_retrait_id
      WHERE c.statut = 'ACTIVE' AND c.production IN ('PHYSIQUE_DEMANDEE', 'IMPRIMEE') AND c.supprime_le IS NULL ORDER BY c.production, c.demandee_le`)).rows;
  const ind = (await q.query<{ demandees: number; imprimees: number; remises_mois: number; physiques: number; total: number }>(
    `SELECT count(*) FILTER (WHERE production = 'PHYSIQUE_DEMANDEE')::int AS demandees, count(*) FILTER (WHERE production = 'IMPRIMEE')::int AS imprimees,
            count(*) FILTER (WHERE production = 'REMISE' AND date_trunc('month', remise_le) = date_trunc('month', now()))::int AS remises_mois,
            count(*) FILTER (WHERE production <> 'NUMERIQUE_SEULE')::int AS physiques, count(*)::int AS total
       FROM carte_assure WHERE statut = 'ACTIVE' AND supprime_le IS NULL`)).rows[0]!;
  return { file, indicateurs: { ...ind, partPhysique: ind.total ? Math.round(100 * ind.physiques / ind.total) : 0 } };
}

/** Cartes numériques du client connecté (espace assuré, AS-02) : les siennes et celles des personnes de ses polices. */
export async function cartesDuClient(q: Executant, tiersId: string) {
  const cartes = (await q.query<Carte & { rang: string; souscripteur: string }>(
    `${SELECT_CARTE.replace('p.bureau_gestion_id', `p.bureau_gestion_id, pa.rang_carte AS rang, (SELECT trim(COALESCE(s.prenoms, '') || ' ' || s.nom) FROM tiers s WHERE s.id = p.souscripteur_id) AS souscripteur`)}
      WHERE (p.souscripteur_id = $1 OR pa.tiers_id = $1) AND c.statut = 'ACTIVE' AND c.supprime_le IS NULL ORDER BY p.numero, pa.rang_carte`, [tiersId])).rows;
  return Promise.all(cartes.map(async c => ({ id: c.id, numero: c.numero, serie: c.numero_serie, jeton: c.jeton_qr, assure: c.assure, rang: c.rang, police: c.police, souscripteur: c.souscripteur,
    production: c.production, validiteSupport: c.validite_support, groupeSanguin: c.groupe_sanguin, ...(await etat(q, c)) })));
}

/** La carte appartient au client connecté (souscripteur de la police ou personne couverte). */
export async function exigerCarteDuClient(q: Executant, tiersId: string, carteId: string) {
  const c = await lireCarte(q, carteId);
  if (c.souscripteur_id !== tiersId && c.tiers_id !== tiersId) throw nonTrouve('Carte');
}

export async function modeCartePhysique(q: Executant) { return valeurParametre(q, 'SAN_CARTE_PHYSIQUE'); }
