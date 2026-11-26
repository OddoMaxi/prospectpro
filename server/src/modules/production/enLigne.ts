/**
 * Souscription en ligne et cellule Canal digital (CDC § 7.5.10, 8.11 ; PROD-RG-070 à 073, COM-RG-071, 083 ;
 * CA-COM-14, 18 ; CA-PROD-17 ; CA-FIN-33).
 *
 * - La cellule est un intervenant de rôle CANAL_DIGITAL qui gère le bureau de type Canal digital : son code figure
 *   dans le numéro des polices souscrites en ligne ; elle n'a pas de compte de production.
 * - Le client s'identifie par son téléphone, vérifié par code SMS (REF-RG-002 : la fiche existante est reprise,
 *   une fiche très proche bloque l'inscription en ligne) ; il suit les étapes 1 à 7 du parcours (dossier canal EN_LIGNE).
 * - Étape 8 : paiement intégral par monnaie électronique avant l'émission ; à la confirmation de l'opérateur, le
 *   montant est porté aux encaissements en attente (EVT-23) et le dossier passe dans la corbeille de la cellule.
 * - La cellule contrôle et émet (EVT-03 depuis les encaissements en attente), ou rejette avec motif : remboursement
 *   automatique au client (EVT-24), aucune police.
 */
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger, interdit, nonTrouve } from '../../noyau/erreurs.js';
import { ajouterJours, aujourdhui, dateValide } from '../../noyau/dates.js';
import { journaliser } from '../../moteurs/audit.js';
import { attribuer } from '../../moteurs/numerotation.js';
import { notifier } from '../../moteurs/notifications.js';
import { publier } from '../../moteurs/evenements.js';
import { entier } from '../../moteurs/parametres.js';
import { comptabiliser } from '../comptabilite/moteur.js';
import { creerTiers } from '../referentiels/tiers.js';
import { creerBureau } from '../referentiels/bureaux.js';
import { creerIntervenant } from '../commercial/intervenants.js';
import { codeActif } from '../commercial/prescripteurs.js';
import { tresorerieDe } from '../finances/tresorerie.js';
import { confirmerVerificationTelephone, demanderVerificationTelephone } from '../documents/acceptation.js';
import { Refus } from '../auth/service.js';
import { lireDossier, schemaDonnees, type Dossier } from './dossiers.js';

const gnf = (n: number) => `${n.toLocaleString('fr-FR').replace(/ /g, ' ')} GNF`;

// ---------------------------------------------------------------- cellule Canal digital (§ 7.5.10)

/** Bureau Canal digital et intervenant de la cellule qui le gère. */
export async function canalDigital(q: Executant) {
  const r = (await q.query<{ bureau_id: string; code: string; intervenant_id: string }>(
    `SELECT b.id AS bureau_id, b.code, g.intervenant_id FROM bureau b JOIN bureau_gestionnaire g ON g.bureau_id = b.id AND g.date_fin IS NULL AND g.supprime_le IS NULL
       JOIN intervenant i ON i.id = g.intervenant_id AND i.role = 'CANAL_DIGITAL' AND i.statut = 'ACTIF'
      WHERE b.type = 'CANAL_DIGITAL' AND b.statut = 'ACTIF' AND b.supprime_le IS NULL ORDER BY b.code LIMIT 1`)).rows[0];
  if (!r) throw new ErreurMetier('CANAL_DIGITAL_ABSENT', 'La souscription en ligne n\'est pas ouverte : bureau et cellule Canal digital à créer', 503);
  return { bureauId: r.bureau_id, code: r.code, intervenantId: r.intervenant_id };
}

/** Création du bureau Canal digital et de sa cellule (Direction commerciale). */
export async function installerCanalDigital(q: Executant, acteur: Acteur, d: { code?: string; nom: string; adresse: string }) {
  const existe = await q.query(`SELECT 1 FROM bureau WHERE type = 'CANAL_DIGITAL' AND statut = 'ACTIF' AND supprime_le IS NULL`);
  exiger(!existe.rowCount, 'CANAL_DIGITAL_EXISTANT', 'Le bureau Canal digital existe déjà', 409);
  const bureau = await creerBureau(q, acteur, { code: d.code, nom: d.nom, type: 'CANAL_DIGITAL', adresse: d.adresse });
  const tiersId = await creerTiers(q, acteur, { nature: 'MORALE', nom: 'Cellule Canal digital', adresse: d.adresse });
  const intervenantId = await creerIntervenant(q, acteur, { tiersId, role: 'CANAL_DIGITAL' });
  await q.query('INSERT INTO bureau_gestionnaire (bureau_id, intervenant_id, date_debut) VALUES ($1,$2,current_date)', [bureau.id, intervenantId]);
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'bureau', objetId: bureau.id, apres: { canalDigital: true, intervenantId } });
  return { bureauId: bureau.id, code: bureau.code, intervenantId };
}

// ---------------------------------------------------------------- identification (PROD-RG-071)

export interface Identite { nom: string; prenoms: string; dateNaissance: string; telephone: string; sexe?: 'M' | 'F' }

/** Le client donne son identité et son téléphone ; un code lui est envoyé. */
export async function identifier(q: Executant, acteur: Acteur, d: Identite) {
  exiger(dateValide(d.dateNaissance) && d.dateNaissance < aujourdhui(), 'DATE_INVALIDE', 'Date de naissance invalide');
  const telephone = d.telephone.replace(/[\s.-]/g, '');
  exiger(/^\+?\d{8,15}$/.test(telephone), 'TELEPHONE_INVALIDE', 'Numéro de téléphone invalide');
  let t = (await q.query<{ id: string; nature: string }>('SELECT id, nature FROM tiers WHERE telephone = $1 AND supprime_le IS NULL', [telephone])).rows[0];
  let nouveau = false;
  if (!t) {
    try {
      const id = await creerTiers(q, acteur, { nature: 'PHYSIQUE', nom: d.nom.trim().toUpperCase(), prenoms: d.prenoms.trim(), date_naissance: d.dateNaissance, sexe: d.sexe, telephone });
      t = { id, nature: 'PHYSIQUE' }; nouveau = true;
    } catch (e) {
      // REF-RG-002 : une fiche très proche existe déjà ; elle n'est jamais révélée en ligne
      if (e instanceof ErreurMetier && ['DOUBLON_PROBABLE', 'TIERS_EXISTANT'].includes(e.code)) {
        throw new ErreurMetier('IDENTIFICATION_IMPOSSIBLE', 'Nous ne pouvons pas finaliser votre inscription en ligne : contactez la Compagnie ou un bureau pour vérifier votre fiche', 409);
      }
      throw e;
    }
  }
  exiger(t.nature === 'PHYSIQUE', 'IDENTIFICATION_IMPOSSIBLE', 'La souscription en ligne est réservée aux personnes physiques');
  await demanderVerificationTelephone(q, acteur, t.id, { connexion: true });
  return { tiersId: t.id, nouveau };
}

/** Code reçu par SMS : téléphone vérifié, la session en ligne peut être ouverte. */
export async function confirmerIdentification(q: Executant, acteur: Acteur, tiersId: string, code: string) {
  const r = await confirmerVerificationTelephone(q, acteur, tiersId, code);
  if (r instanceof Refus) return r;
  const t = (await q.query<{ nom: string; prenoms: string | null }>('SELECT nom, prenoms FROM tiers WHERE id = $1', [tiersId])).rows[0]!;
  return { tiersId, nom: `${t.prenoms ?? ''} ${t.nom}`.trim() };
}

// ---------------------------------------------------------------- dossier du client (PROD-RG-070)

/** Le dossier appartient au client connecté et suit le canal en ligne. */
export async function dossierDuClient(q: Executant, tiersId: string, dossierId: string, verrou = false): Promise<Dossier> {
  const d = await lireDossier(q, dossierId, verrou);
  if (d.canal !== 'EN_LIGNE' || d.souscripteur_id !== tiersId) throw nonTrouve('Dossier de souscription');
  return d;
}

/** Ouverture (ou reprise) du dossier en ligne : produit individuel ou familial, code prescripteur facultatif. */
export async function ouvrirDossierEnLigne(q: Executant, acteur: Acteur, tiersId: string, d: { formuleId: string; codePrescripteur?: string }) {
  const c = await canalDigital(q);
  const f = (await q.query<{ produit_id: string; type_contrat: string; statut: string | null }>(
    `SELECT f.produit_id, p.type_contrat, p.date_fin_commercialisation::text AS statut FROM formule f JOIN produit p ON p.id = f.produit_id WHERE f.id = $1 AND f.supprime_le IS NULL`, [d.formuleId])).rows[0];
  if (!f) throw nonTrouve('Formule');
  exiger(f.type_contrat === 'INDIVIDUEL', 'PRODUIT_NON_DISPONIBLE', 'La souscription en ligne couvre les contrats individuels et familiaux (PROD-RG-070)');
  exiger(!f.statut || f.statut > aujourdhui(), 'PRODUIT_NON_DISPONIBLE', 'Produit fermé à la souscription');
  // Un seul dossier en ligne en cours par client : il est repris
  const encours = (await q.query<{ id: string; numero_dossier: string }>(
    `SELECT id, numero_dossier FROM dossier_souscription WHERE souscripteur_id = $1 AND canal = 'EN_LIGNE' AND statut IN ('BROUILLON', 'PAYE_A_EMETTRE') AND supprime_le IS NULL`, [tiersId])).rows[0];
  if (encours) return { id: encours.id, numero: encours.numero_dossier, repris: true };
  // COM-RG-083 : le code rattache la police à son prescripteur, sans réduction
  const code = d.codePrescripteur?.trim() ? await codeActif(q, d.codePrescripteur) : null;
  const id = crypto.randomUUID();
  const numero = await attribuer(q, acteur, { type: 'DOSSIER_SOUSCRIPTION', annee: Number(aujourdhui().slice(0, 4)) }, { type: 'dossier_souscription', id });
  const expire = ajouterJours(aujourdhui(), await entier(q, 'PROD_EXPIRATION_PROPOSITION_JOURS'));
  const donnees = { dateEffet: aujourdhui(), assures: [{ tiersId, qualite: 'ASSURE_PRINCIPAL' as const }], consentementsDeces: [], pieces: [] };
  await q.query(
    `INSERT INTO dossier_souscription (id, numero_dossier, canal, souscripteur_id, produit_id, formule_id, bureau_id, prepare_par_id, etape_courante, donnees, statut, expire_le, code_prescripteur_id)
     VALUES ($1,$2,'EN_LIGNE',$3,$4,$5,$6,$7,2,$8,'BROUILLON',$9,$10)`,
    [id, numero, tiersId, f.produit_id, d.formuleId, c.bureauId, c.intervenantId, JSON.stringify(donnees), expire, code?.id ?? null]);
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'dossier_souscription', objetId: id, apres: { numero, canal: 'EN_LIGNE', formuleId: d.formuleId, code: code ? d.codePrescripteur : null } });
  return { id, numero, repris: false };
}

/** Le client déclare un conjoint ou un enfant : fiche créée (contrôle des doublons), utilisable dans les données du dossier. */
export async function declarerPersonne(q: Executant, acteur: Acteur, tiersId: string, dossierId: string, p: { nom: string; prenoms: string; dateNaissance: string; sexe?: 'M' | 'F' }) {
  const d = await dossierDuClient(q, tiersId, dossierId, true);
  exiger(d.statut === 'BROUILLON', 'DOSSIER_CLOS', 'Dossier payé ou clos : il n\'est plus modifiable');
  exiger(dateValide(p.dateNaissance) && p.dateNaissance <= aujourdhui(), 'DATE_INVALIDE', 'Date de naissance invalide');
  try {
    return { tiersId: await creerTiers(q, acteur, { nature: 'PHYSIQUE', nom: p.nom.trim().toUpperCase(), prenoms: p.prenoms.trim(), date_naissance: p.dateNaissance, sexe: p.sexe }) };
  } catch (e) {
    if (e instanceof ErreurMetier && ['DOUBLON_PROBABLE', 'TIERS_EXISTANT'].includes(e.code)) {
      throw new ErreurMetier('PERSONNE_CONNUE', 'Cette personne est peut-être déjà enregistrée : la cellule Canal digital la rattachera à votre dossier, contactez-la', 409);
    }
    throw e;
  }
}

/** Les données du dossier ne citent que le client et les personnes déclarées dans ce dossier (pas d'accès aux autres fiches). */
export async function controlerPersonnesDuDossier(q: Executant, tiersId: string, dossierId: string, brut: unknown) {
  const x = schemaDonnees.parse(brut);
  const ids = new Set([...x.assures.map(a => a.tiersId), ...(x.beneficiaires?.liste ?? []).map(b => b.tiersId), ...x.pieces.map(p => p.tiersId)]);
  ids.delete(tiersId);
  if (!ids.size) return x;
  const declares = (await q.query<{ objet_id: string }>(
    `SELECT objet_id FROM journal_audit WHERE objet_type = 'tiers' AND objet_id = ANY($1) AND action = 'CREATION' AND horodatage > (SELECT cree_le FROM dossier_souscription WHERE id = $2)`,
    [[...ids], dossierId])).rows.map(r => r.objet_id);
  const connus = (await q.query<{ tiers_id: string }>(`SELECT DISTINCT (jsonb_array_elements(donnees->'assures')->>'tiersId') AS tiers_id FROM dossier_souscription WHERE id = $1`, [dossierId])).rows.map(r => r.tiers_id);
  for (const id of ids) if (!declares.includes(id) && !connus.includes(id)) throw interdit('Personne non déclarée dans ce dossier');
  return x;
}

// ---------------------------------------------------------------- paiement (PROD-RG-072, EVT-23)

/** Opérateurs de monnaie électronique proposés au client. */
export async function operateurs(q: Executant) {
  return (await q.query<{ code: string; nom: string }>(
    `SELECT b.code, b.nom FROM banque_operateur b JOIN compte c ON c.id = b.compte_id WHERE b.supprime_le IS NULL AND c.libelle ILIKE 'Monnaie électronique%' ORDER BY b.nom`)).rows;
}

/** Demande de paiement : récapitulatif accepté et montant égal à la prime ; la référence est transmise à l'opérateur. */
export async function demanderPaiement(q: Executant, tiersId: string, dossierId: string, d: { operateur: string; telephone: string }) {
  const x = await dossierDuClient(q, tiersId, dossierId);
  exiger(x.statut === 'BROUILLON', 'DOSSIER_CLOS', x.statut === 'PAYE_A_EMETTRE' ? 'Dossier déjà payé : il est en cours de vérification' : 'Dossier clos');
  exiger(x.expire_le >= aujourdhui(), 'DOSSIER_EXPIRE', 'Proposition expirée : recommencez la souscription');
  exiger(x.prime_totale !== null && x.acceptation_preuve_id, 'ACCEPTATION_REQUISE', 'Acceptez d\'abord le récapitulatif par le code reçu (étape 7)');
  exiger((await operateurs(q)).some(o => o.code === d.operateur), 'OPERATEUR_INCONNU', 'Opérateur de monnaie électronique inconnu');
  exiger(/^\+?\d{8,15}$/.test(d.telephone.replace(/[\s.-]/g, '')), 'TELEPHONE_INVALIDE', 'Numéro du portefeuille invalide');
  return { reference: x.numero_dossier, montant: x.prime_totale, operateur: d.operateur };
}

/**
 * Confirmation de l'opérateur (rappel de son interface) : paiement intégral porté aux encaissements en attente
 * (EVT-23) ; le dossier passe dans la corbeille de la cellule. Idempotente sur la référence de l'opérateur.
 */
export async function confirmerPaiement(q: Executant, acteur: Acteur, d: { reference: string; operateur: string; montant: number; referenceExterne: string }) {
  const deja = (await q.query<{ id: string }>('SELECT id FROM encaissement_attente WHERE moyen = $1 AND reference_externe = $2', [d.operateur, d.referenceExterne])).rows[0];
  if (deja) return { encaissementId: deja.id, dejaRecu: true };
  const dossier = (await q.query<{ id: string }>(`SELECT id FROM dossier_souscription WHERE numero_dossier = $1 AND canal = 'EN_LIGNE'`, [d.reference])).rows[0];
  if (!dossier) throw nonTrouve('Dossier de la référence de paiement');
  const x = await lireDossier(q, dossier.id, true);
  exiger(x.statut === 'BROUILLON' && x.acceptation_preuve_id, 'PAIEMENT_INATTENDU', 'Aucun paiement attendu pour ce dossier');
  exiger(Number.isInteger(d.montant) && d.montant === x.prime_totale, 'MONTANT_DIFFERENT', `Paiement intégral attendu : ${gnf(x.prime_totale!)} (PROD-RG-072)`);
  const t = await tresorerieDe(q, 'MONNAIE_ELECTRONIQUE', d.operateur);
  const id = crypto.randomUUID();
  const [e] = await comptabiliser(q, acteur, { codeEvt: 'EVT-23', reference: d.referenceExterne, pieceDocumentId: await recapitulatif(q, x.id), journalTresorerie: t.journal,
    libelle: { reference: d.referenceExterne }, montants: { MONTANT: d.montant }, comptes: { TRESORERIE: { compteId: t.compteId } } });
  await q.query(`INSERT INTO encaissement_attente (id, origine, payeur_tiers_id, montant, moyen, reference_externe, statut, ecriture_id) VALUES ($1,'SOUSCRIPTION_EN_LIGNE',$2,$3,$4,$5,'EN_ATTENTE',$6)`,
    [id, x.souscripteur_id, d.montant, d.operateur, d.referenceExterne, e!.id]);
  await q.query(`UPDATE dossier_souscription SET statut = 'PAYE_A_EMETTRE', encaissement_attente_id = $2, etape_courante = 8 WHERE id = $1`, [x.id, id]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'dossier_souscription', objetId: x.id, apres: { statut: 'PAYE_A_EMETTRE', paiement: d } });
  await publier(q, acteur, { type: 'ENCAISSEMENT_EN_ATTENTE_RECU', objet: { type: 'encaissement_attente', id }, charge: { dossier: x.numero_dossier, montant: d.montant }, cleIdempotence: `encaissement:${id}` });
  await publier(q, acteur, { type: 'DOSSIER_SOUSCRIPTION_A_VALIDER', objet: { type: 'dossier_souscription', id: x.id }, charge: { numero: x.numero_dossier, canal: 'EN_LIGNE' }, cleIdempotence: `dossier:${x.id}:paye` });
  const tel = (await q.query<{ telephone: string | null }>('SELECT telephone FROM tiers WHERE id = $1', [x.souscripteur_id])).rows[0]?.telephone;
  if (tel) await notifier(q, { tiersId: x.souscripteur_id, code: 'PAIEMENT_EN_LIGNE_RECU', canal: 'SMS', adresse: tel, objet: { type: 'dossier_souscription', id: x.id },
    variables: { montant: gnf(d.montant), dossier: x.numero_dossier } }).catch(() => undefined);
  return { encaissementId: id, dejaRecu: false };
}

async function recapitulatif(q: Executant, dossierId: string) {
  const r = (await q.query<{ id: string }>(`SELECT id FROM document WHERE objet_type = 'dossier_souscription' AND objet_id = $1 ORDER BY horodatage_scellement DESC LIMIT 1`, [dossierId])).rows[0];
  if (!r) throw nonTrouve('Récapitulatif du dossier');
  return r.id;
}

// ---------------------------------------------------------------- cellule : rejet et remboursement (EVT-24, CA-PROD-17)

export async function rejeterDossierEnLigne(q: Executant, acteur: Acteur, dossierId: string, motif: string) {
  exiger(motif?.trim(), 'MOTIF_REQUIS', 'Le rejet est motivé');
  const x = await lireDossier(q, dossierId, true);
  exiger(x.canal === 'EN_LIGNE', 'CANAL_INVALIDE', 'Dossier hors souscription en ligne');
  exiger(['BROUILLON', 'PAYE_A_EMETTRE'].includes(x.statut), 'STATUT_INVALIDE', 'Dossier déjà émis ou clos');
  let rembourse = 0;
  if (x.statut === 'PAYE_A_EMETTRE') {
    const ea = (await q.query<{ id: string; montant: string; moyen: string; reference_externe: string; statut: string }>(
      'SELECT id, montant, moyen, reference_externe, statut FROM encaissement_attente WHERE id = $1 FOR UPDATE', [x.encaissement_attente_id])).rows[0]!;
    exiger(ea.statut === 'EN_ATTENTE', 'ENCAISSEMENT_AFFECTE', 'Paiement déjà affecté');
    const t = await tresorerieDe(q, 'MONNAIE_ELECTRONIQUE', ea.moyen);
    // Remboursement automatique vers le portefeuille qui a payé (PROD-RG-072)
    await comptabiliser(q, acteur, { codeEvt: 'EVT-24', reference: `RMB ${ea.reference_externe}`, pieceDocumentId: await recapitulatif(q, x.id), journalTresorerie: t.journal,
      libelle: { reference: ea.reference_externe }, montants: { MONTANT: Number(ea.montant) }, comptes: { TRESORERIE: { compteId: t.compteId } } });
    await q.query(`UPDATE encaissement_attente SET statut = 'REMBOURSE' WHERE id = $1`, [ea.id]);
    await publier(q, acteur, { type: 'ENCAISSEMENT_EN_ATTENTE_REMBOURSE', objet: { type: 'encaissement_attente', id: ea.id }, charge: { dossier: x.numero_dossier, montant: Number(ea.montant) }, cleIdempotence: `encaissement:${ea.id}:rembourse` });
    rembourse = Number(ea.montant);
  }
  await q.query(`UPDATE dossier_souscription SET statut = 'REJETE', motif_rejet = $2 WHERE id = $1`, [dossierId, motif.slice(0, 300)]);
  await journaliser(q, { ...acteur.trace(), action: 'REJET', objetType: 'dossier_souscription', objetId: dossierId, apres: { motif, rembourse } });
  const tel = (await q.query<{ telephone: string | null }>('SELECT telephone FROM tiers WHERE id = $1', [x.souscripteur_id])).rows[0]?.telephone;
  if (tel) await notifier(q, { tiersId: x.souscripteur_id, code: 'DOSSIER_EN_LIGNE_REJETE', canal: 'SMS', adresse: tel, objet: { type: 'dossier_souscription', id: dossierId },
    variables: { dossier: x.numero_dossier, motif, remboursement: rembourse ? ` ${gnf(rembourse)} vous sont remboursés.` : '' } }).catch(() => undefined);
  return { rembourse };
}

// ---------------------------------------------------------------- consultation

/** Corbeille de la cellule : dossiers payés à émettre, puis dossiers en cours de saisie par les clients. */
export async function corbeilleCellule(q: Executant) {
  return (await q.query(
    `SELECT d.id, d.numero_dossier, d.statut, d.etape_courante, d.prime_totale, d.cree_le, d.expire_le, d.motif_rejet, trim(t.nom || ' ' || COALESCE(t.prenoms, '')) AS souscripteur, t.telephone,
            p.libelle AS produit, f.libelle AS formule, jsonb_array_length(d.donnees->'assures') AS personnes, cp.code AS code_prescripteur, ea.reference_externe, ea.moyen AS operateur,
            ea.cree_le AS paye_le, po.numero AS police
       FROM dossier_souscription d JOIN tiers t ON t.id = d.souscripteur_id JOIN produit p ON p.id = d.produit_id JOIN formule f ON f.id = d.formule_id
       LEFT JOIN code_prescripteur cp ON cp.id = d.code_prescripteur_id LEFT JOIN encaissement_attente ea ON ea.id = d.encaissement_attente_id LEFT JOIN police po ON po.id = d.police_id
      WHERE d.canal = 'EN_LIGNE' AND d.supprime_le IS NULL
      ORDER BY (d.statut = 'PAYE_A_EMETTRE') DESC, d.cree_le DESC LIMIT 300`)).rows;
}

/** Ce que voit le client : ses dossiers en ligne et ses polices. */
export async function espaceClient(q: Executant, tiersId: string) {
  const [dossiers, polices] = await Promise.all([
    q.query(`SELECT d.id, d.numero_dossier, d.statut, d.etape_courante, d.prime_totale, d.motif_rejet, d.expire_le, f.libelle AS formule, p.libelle AS produit, po.numero AS police
               FROM dossier_souscription d JOIN formule f ON f.id = d.formule_id JOIN produit p ON p.id = d.produit_id LEFT JOIN police po ON po.id = d.police_id
              WHERE d.souscripteur_id = $1 AND d.canal = 'EN_LIGNE' AND d.supprime_le IS NULL ORDER BY d.cree_le DESC`, [tiersId]),
    q.query(`SELECT po.id, po.numero, po.statut, pr.libelle AS produit, (SELECT max(date_fin) FROM police_periode pp WHERE pp.police_id = po.id) AS echeance
               FROM police po JOIN produit pr ON pr.id = po.produit_id WHERE po.souscripteur_id = $1 ORDER BY po.cree_le DESC`, [tiersId]),
  ]);
  return { dossiers: dossiers.rows, polices: polices.rows };
}

/** Offre en ligne : formules en vigueur des produits individuels et familiaux. */
export async function offre(q: Executant) {
  return (await q.query(
    `SELECT DISTINCT ON (f.produit_id, f.code) f.id, f.code, f.libelle, f.composition, f.accessoires, p.id AS produit_id, p.libelle AS produit, p.type_couverture, p.age_min, p.age_max, p.documents_exiges
       FROM formule f JOIN produit p ON p.id = f.produit_id
      WHERE p.type_contrat = 'INDIVIDUEL' AND p.supprime_le IS NULL AND f.supprime_le IS NULL AND p.date_effet <= current_date AND (p.date_fin_commercialisation IS NULL OR p.date_fin_commercialisation > current_date)
        AND f.date_effet <= current_date
      ORDER BY f.produit_id, f.code, f.date_effet DESC`)).rows;
}
