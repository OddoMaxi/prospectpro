/**
 * Avenants (CDC § 8.5, 8.8 ; PROD-RG-012, 013, 040, 043, 044 ; CA-PROD-07, 12).
 *
 * - Ajout d'un ayant droit : prime au prorata temporis au jour près jusqu'à l'échéance (jours réels / durée réelle
 *   de la période), payée comme à l'émission ; l'entrée prend effet au paiement, la carence s'applique au nouvel ayant droit.
 * - Changement de bénéficiaires : nouvelle version datée, confirmée par code à usage unique du souscripteur, sans
 *   incidence sur la prime ; un bénéficiaire qui a accepté ne voit pas sa quotité modifiée sans son accord écrit.
 */
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger, nonTrouve } from '../../noyau/erreurs.js';
import { aujourdhui } from '../../noyau/dates.js';
import { journaliser } from '../../moteurs/audit.js';
import { attribuer } from '../../moteurs/numerotation.js';
import { publier } from '../../moteurs/evenements.js';
import { genererDocument } from '../../moteurs/documents.js';
import { exigerFicheComplete } from '../referentiels/societe.js';
import { declarerMembre } from '../referentiels/foyer.js';
import { attribuerRole } from '../referentiels/roles.js';
import { comptabiliser, type CompteResolu } from '../comptabilite/moteur.js';
import { controlerQuotites, tarifer } from '../catalogue/service.js';
import { tresorerieDe, type Moyen } from '../finances/tresorerie.js';
import { compteComptable, compteProductionDuBureau, lireCompteProduction, mouvementer } from '../commercial/comptesProduction.js';
import { confirmerAcceptation, demanderAcceptation } from '../documents/acceptation.js';
import { Refus } from '../auth/service.js';
import { lirePoliceVie, type PoliceVie } from './renouvellement.js';

const gnf = (n: number) => `${n.toLocaleString('fr-FR').replace(/ /g, ' ')} GNF`;
const fr = (d: string) => d.split('-').reverse().join('/');
const jours = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;

/** Période en cours d'une police (la dernière). */
export async function periodeCourante(q: Executant, policeId: string) {
  const r = (await q.query<{ date_debut: string; date_fin: string }>(
    'SELECT date_debut::text, date_fin::text FROM police_periode WHERE police_id = $1 ORDER BY rang DESC LIMIT 1', [policeId])).rows[0];
  if (!r) throw nonTrouve('Période de la police');
  return r;
}

/** FIN-RG-077 : prorata au jour près, sur la durée réelle de la période (365 ou 366 jours). */
export function prorata(montantAnnuel: number, dateEffet: string, debut: string, fin: string): number {
  return Math.round(montantAnnuel * jours(dateEffet, fin) / jours(debut, fin));
}

export async function compteCommissions(q: Executant, intervenantId: string): Promise<CompteResolu> {
  const r = (await q.query<{ compte_auxiliaire_id: string; collectif_id: string }>(
    `SELECT tr.compte_auxiliaire_id, a.collectif_id FROM intervenant i JOIN tiers_role tr ON tr.tiers_id = i.tiers_id AND tr.role = i.role AND tr.date_fin IS NULL
       JOIN compte_auxiliaire a ON a.id = tr.compte_auxiliaire_id WHERE i.id = $1`, [intervenantId])).rows[0];
  if (!r) throw new ErreurMetier('COMPTE_COMMISSIONS_ABSENT', 'Intervenant sans compte de commissions à payer', 422);
  return { compteId: r.collectif_id, auxiliaireId: r.compte_auxiliaire_id };
}

/** CA-PROD-07 : ajout d'un conjoint ou d'un enfant en cours de période, prime au prorata, payée avant l'entrée. */
export async function ajouterAyantDroit(q: Executant, acteur: Acteur, policeId: string, d: {
  tiersId: string; qualite: 'CONJOINT' | 'ENFANT'; parentTiersId?: string; categorieEnfant?: 'A_CHARGE' | 'ETUDIANT' | 'HANDICAPE';
  paiement: PaiementAvenant;
}, jour = aujourdhui()) {
  const p = await lirePoliceVie(q, policeId, true);
  exiger(p.statut === 'ACTIVE', 'STATUT_INVALIDE', 'Un ayant droit s\'ajoute à une police active');
  await exigerFicheComplete(q);
  const periode = await periodeCourante(q, policeId);
  exiger(jour >= periode.date_debut && jour <= periode.date_fin, 'HORS_PERIODE', 'La date d\'entrée est dans la période en cours');
  const deja = await q.query('SELECT 1 FROM police_assure WHERE police_id = $1 AND tiers_id = $2 AND date_sortie IS NULL', [policeId, d.tiersId]);
  exiger(!deja.rowCount, 'DEJA_ASSURE', 'Cette personne est déjà assurée au contrat', 409);
  const principal = (await q.query<{ tiers_id: string }>(`SELECT tiers_id FROM police_assure WHERE police_id = $1 AND qualite = 'ASSURE_PRINCIPAL'`, [policeId])).rows[0]!;
  const t = (await q.query<{ date_naissance: string | null }>('SELECT date_naissance::text FROM tiers WHERE id = $1', [d.tiersId])).rows[0];
  exiger(t?.date_naissance, 'DATE_NAISSANCE_REQUISE', 'Date de naissance obligatoire');
  // Composition de la formule et foyer (REF-RG-007 à 009)
  const composition = (await q.query<{ composition: { conjointsMax: number; enfantsMax: number; personnesMax: number } }>('SELECT composition FROM formule WHERE id = $1', [p.formule_id])).rows[0]!.composition;
  const actuels = (await q.query<{ qualite: string }>('SELECT qualite FROM police_assure WHERE police_id = $1 AND date_sortie IS NULL', [policeId])).rows;
  exiger(actuels.length < composition.personnesMax, 'COMPOSITION_DEPASSEE', `Au plus ${composition.personnesMax} personnes sur cette formule`);
  exiger(actuels.filter(a => a.qualite === d.qualite).length < (d.qualite === 'CONJOINT' ? composition.conjointsMax : composition.enfantsMax), 'COMPOSITION_DEPASSEE', 'Composition de la formule atteinte');
  const lien = await q.query(`SELECT 1 FROM lien_foyer WHERE assure_principal_id = $1 AND membre_id = $2 AND date_fin IS NULL AND supprime_le IS NULL`, [principal.tiers_id, d.tiersId]);
  if (!lien.rowCount) await declarerMembre(q, acteur, { assurePrincipalId: principal.tiers_id, membreId: d.tiersId, lien: d.qualite, parentConjointId: d.parentTiersId, categorieEnfant: d.categorieEnfant, dateDebut: jour });

  // Prime annuelle du nouvel ayant droit au tarif de la période, puis prorata ; taxes au taux du produit sur la prime nette
  const annuel = await tarifer(q, p.formule_id, [{ qualite: d.qualite, dateNaissance: t.date_naissance }], periode.date_debut);
  const nette = prorata(annuel.lignes[0]!.primeNette, jour, periode.date_debut, periode.date_fin);
  const taxes = annuel.taxes.map(x => ({ ...x, montant: Math.round(nette * x.taux) }));
  const totale = nette + taxes.reduce((s, x) => s + x.montant, 0);

  const avenantId = crypto.randomUUID();
  const numero = await attribuer(q, acteur, { type: 'AVENANT', numeroPolice: p.numero }, { type: 'avenant', id: avenantId });
  const nom = (await q.query<{ n: string }>(`SELECT trim(nom || ' ' || COALESCE(prenoms, '')) AS n FROM tiers WHERE id = $1`, [d.tiersId])).rows[0]!.n;
  const { quittanceId, numeroQuittance } = await encaisserPrimeAvenant(q, acteur, p, {
    numeroAvenant: numero, libelle: `Avenant ${numero} : ajout de ${nom}, prime au prorata (${jours(jour, periode.date_fin)} jours)`,
    nette, taxes, debut: jour, fin: periode.date_fin, paiement: d.paiement,
  }, jour);

  // Entrée de l'ayant droit à la date du paiement : la carence court à partir de cette date (PROD-RG-040)
  const rang = (await q.query<{ r: number }>(`SELECT COALESCE(max(rang_carte::int), -1) + 1 AS r FROM police_assure WHERE police_id = $1`, [policeId])).rows[0]!.r;
  const pa = await q.query<{ id: string }>(`INSERT INTO police_assure (police_id, tiers_id, qualite, rang_carte, date_entree) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [policeId, d.tiersId, d.qualite, String(rang).padStart(2, '0'), jour]);
  const garanties = (await q.query<{ id: string; type: string; capital: number | null }>('SELECT id, type, capital FROM garantie WHERE formule_id = $1 AND supprime_le IS NULL', [p.formule_id])).rows;
  for (const g of garanties) {
    // Garantie décès : consentement de l'assuré requis (art. 193), recueilli par un avenant ultérieur
    const refus = g.type === 'DECES' ? 'Consentement écrit de l\'assuré à recueillir (art. 193)' : null;
    await q.query('INSERT INTO garantie_souscrite (police_assure_id, garantie_id, accordee, motif_refus, capital) VALUES ($1,$2,$3,$4,$5)', [pa.rows[0]!.id, g.id, !refus, refus, g.type === 'DECES' ? g.capital : null]);
  }
  const role = await q.query(`SELECT 1 FROM tiers_role WHERE tiers_id = $1 AND role = 'ASSURE' AND date_fin IS NULL`, [d.tiersId]);
  if (!role.rowCount) await attribuerRole(q, acteur, { tiersId: d.tiersId, role: 'ASSURE', dateDebut: jour });
  await q.query(`INSERT INTO avenant (id, numero, police_id, type, date_effet, description, difference_prime, quittance_id) VALUES ($1,$2,$3,'AJOUT_AYANT_DROIT',$4,$5,$6,$7)`,
    [avenantId, numero, policeId, jour, `Ajout de ${nom} (${d.qualite.toLowerCase()}), prime au prorata de ${jours(jour, periode.date_fin)} jours sur ${jours(periode.date_debut, periode.date_fin)}`, totale, quittanceId]);
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'avenant', objetId: avenantId, apres: { numero, police: p.numero, nette, totale } });
  await publier(q, acteur, { type: 'AVENANT_EMIS', objet: { type: 'avenant', id: avenantId }, charge: { police: p.numero, type: 'AJOUT_AYANT_DROIT', tiersId: d.tiersId }, cleIdempotence: `avenant:${avenantId}` });
  return { avenantId, numero, quittance: numeroQuittance, primeNette: nette, primeTotale: totale, joursCouverts: jours(jour, periode.date_fin) };
}

export type PaiementAvenant = { type: 'COMPTE_PRODUCTION' } | { type: 'PAIEMENT_DIRECT'; moyen: Moyen; banque?: string };
export interface TaxeCalculee { libelle: string; montant: number; compteId: string; codeTaxeId: string }

/**
 * PROD-RG-044 : prime d'un avenant encaissée par le compte de production (EVT-02) ou payée directement (EVT-03) :
 * quittance soldée, commissions selon la clé de répartition, débit du compte de production dans la même transaction.
 */
export async function encaisserPrimeAvenant(q: Executant, acteur: Acteur, p: PoliceVie, d: {
  numeroAvenant: string; libelle: string; nette: number; taxes: TaxeCalculee[]; debut: string; fin: string; paiement: PaiementAvenant;
}, jour = aujourdhui()) {
  const totale = d.nette + d.taxes.reduce((s, x) => s + x.montant, 0);
  let perception: CompteResolu, journalTresorerie: string | undefined, cp: Awaited<ReturnType<typeof lireCompteProduction>> | null = null, modePaiement: string;
  if (d.paiement.type === 'COMPTE_PRODUCTION') {
    cp = await lireCompteProduction(q, (await compteProductionDuBureau(q, p.bureau_gestion_id)).id, true);
    exiger(cp.statut === 'ACTIF', 'COMPTE_PRODUCTION_GELE', 'Compte de production gelé ou clôturé');
    if (cp.solde < totale) throw new ErreurMetier('SOLDE_INSUFFISANT', `Solde insuffisant : il manque ${gnf(totale - cp.solde)}`, 422, { manque: totale - cp.solde });
    perception = compteComptable(cp); modePaiement = 'DEPOT';
  } else {
    const tr = await tresorerieDe(q, d.paiement.moyen, d.paiement.banque);
    perception = { compteId: tr.compteId }; journalTresorerie = tr.journal; modePaiement = d.paiement.moyen === 'BANQUE' ? 'VIREMENT' : d.paiement.moyen;
  }
  const b = (await q.query<{ taux: string }>(`SELECT taux FROM bareme_commission WHERE produit_id = $1 AND role = 'AGENT_GENERAL' AND date_effet <= $2 AND supprime_le IS NULL ORDER BY date_effet DESC LIMIT 1`, [p.produit_id, jour])).rows[0];
  const intervenants = (await q.query<{ intervenant_id: string; cle_repartition: string }>(`SELECT intervenant_id, cle_repartition FROM police_intervenant WHERE police_id = $1 AND date_fin IS NULL ORDER BY cle_repartition DESC`, [p.id])).rows;
  const totalCom = Math.round(d.nette * Number(b?.taux ?? 0));
  const commissions = intervenants.map(i => ({ intervenantId: i.intervenant_id, montant: Math.round(totalCom * Number(i.cle_repartition)) }));
  const ecart = totalCom - commissions.reduce((s, x) => s + x.montant, 0);
  if (ecart && commissions[0]) commissions[0].montant += ecart;

  const quittanceId = crypto.randomUUID();
  const numeroQuittance = await attribuer(q, acteur, { type: 'QUITTANCE', codeBureau: p.bureau, annee: Number(jour.slice(0, 4)) }, { type: 'quittance', id: quittanceId });
  const docQuittance = await genererDocument(q, acteur, { modeleCode: 'QUITTANCE', typeDocument: 'QUITTANCE', objet: { type: 'police', id: p.id }, variables: {
    quittance: numeroQuittance, police: p.numero, souscripteur: (await q.query<{ n: string }>(`SELECT trim(nom || ' ' || COALESCE(prenoms, '')) AS n FROM tiers WHERE id = $1`, [p.souscripteur_id])).rows[0]!.n,
    date_effet: fr(d.debut), date_fin: fr(d.fin), mode_paiement: modePaiement === 'DEPOT' ? `débit du compte de production du bureau ${p.bureau}` : modePaiement.toLowerCase().replace(/_/g, ' '),
    lignes: [{ libelle: d.libelle, montant: gnf(d.nette) }, ...d.taxes.map(x => ({ libelle: x.libelle, montant: gnf(x.montant) })), { libelle: 'Total', montant: gnf(totale) }],
  } });
  const client = await compteClient(q, p.souscripteur_id);
  const branche = (await q.query<{ compte_primes_id: string }>('SELECT compte_primes_id FROM branche_comptable WHERE code = $1', [p.branche])).rows[0]!;
  const ecritures = await comptabiliser(q, acteur, {
    codeEvt: d.paiement.type === 'COMPTE_PRODUCTION' ? 'EVT-02' : 'EVT-03', reference: numeroQuittance, pieceDocumentId: docQuittance.id, journalTresorerie,
    libelle: { police: p.numero, bureau: p.bureau },
    montants: { PRIME_NETTE: d.nette, ACCESSOIRES: 0, PRIME_TOTALE: totale, COMMISSION: totalCom },
    comptes: { CLIENT: client, PRIMES_BRANCHE: { compteId: branche.compte_primes_id },
      TAXES: d.taxes.map(x => ({ compteId: x.compteId, montant: x.montant, codeTaxeId: x.codeTaxeId })), COMPTE_PRODUCTION: perception, TRESORERIE: perception,
      COMMISSIONS_A_PAYER: await Promise.all(commissions.filter(x => x.montant > 0).map(async x => ({ ...(await compteCommissions(q, x.intervenantId)), montant: x.montant }))) },
  });
  const emi = ecritures.find(e => e.journal === 'EMI')!, enc = ecritures.find(e => e.journal !== 'EMI' && e.journal !== 'COM')!, com = ecritures.find(e => e.journal === 'COM');
  await q.query(
    `INSERT INTO quittance (id, numero, police_id, type, periode_debut, periode_fin, prime_nette, accessoires, taxes, prime_totale, mode_paiement, statut, ecriture_constatation_id, ecriture_perception_id)
     VALUES ($1,$2,$3,'AVENANT',$4,$5,$6,0,$7,$8,$9,'SOLDEE',$10,$11)`,
    [quittanceId, numeroQuittance, p.id, d.debut, d.fin, d.nette, totale - d.nette, totale, modePaiement, emi.id, enc.id]);
  for (const x of commissions.filter(y => y.montant > 0)) {
    await q.query(`INSERT INTO commission (police_id, quittance_id, intervenant_id, type, assiette, taux, montant, statut, ecriture_id) VALUES ($1,$2,$3,'COMMISSION',$4,$5,$6,'DUE',$7)`,
      [p.id, quittanceId, x.intervenantId, d.nette, b?.taux ?? 0, x.montant, com!.id]);
  }
  if (cp) await mouvementer(q, acteur, { compteId: cp.id, nature: 'EMISSION', montant: totale, reference: d.numeroAvenant, ecritureId: enc.id });
  return { quittanceId, numeroQuittance, totale };
}

/** Auxiliaire du souscripteur (collectif des assurés). */
export async function compteClient(q: Executant, souscripteurId: string): Promise<CompteResolu> {
  const r = (await q.query<{ id: string; collectif_id: string }>(
    `SELECT a.id, a.collectif_id FROM tiers_role r JOIN compte_auxiliaire a ON a.id = r.compte_auxiliaire_id WHERE r.tiers_id = $1 AND r.role = 'SOUSCRIPTEUR' AND r.date_fin IS NULL`, [souscripteurId])).rows[0];
  if (!r) throw new ErreurMetier('COMPTE_CLIENT_ABSENT', 'Souscripteur sans compte client', 422);
  return { compteId: r.collectif_id, auxiliaireId: r.id };
}

// ---------------------------------------------------------------- bénéficiaires (PROD-RG-012, 013, 043)

interface Designation { versionId: string; version: number; beneficiaires: { id: string; tiers_id: string; quotite: number; rang: number; acceptant: boolean }[] }

async function designationEnVigueur(q: Executant, policeId: string): Promise<Designation | null> {
  const v = (await q.query<{ id: string; version: number }>('SELECT id, version FROM designation_version WHERE police_id = $1 AND police_assure_id IS NULL ORDER BY version DESC LIMIT 1', [policeId])).rows[0];
  if (!v) return null;
  const b = (await q.query<{ id: string; tiers_id: string; quotite: string; rang: number; acceptant: boolean }>('SELECT id, tiers_id, quotite, rang, acceptant FROM beneficiaire WHERE designation_version_id = $1', [v.id])).rows;
  return { versionId: v.id, version: v.version, beneficiaires: b.map(x => ({ ...x, quotite: Number(x.quotite) })) };
}

type ListeBeneficiaires = { tiersId: string; quotite: number; rang: number }[];

/** Étape 1 : avenant préparé, document présenté au souscripteur et code envoyé sur son téléphone. */
export async function preparerChangementBeneficiaires(q: Executant, acteur: Acteur, policeId: string, liste: ListeBeneficiaires) {
  const p = await lirePoliceVie(q, policeId, true);
  exiger(p.statut === 'ACTIVE', 'STATUT_INVALIDE', 'Police non active');
  controlerQuotites(liste.map(b => b.quotite));
  // PROD-RG-013, CA-PROD-12 : un bénéficiaire acceptant garde sa quotité, sauf accord écrit de sa part
  const actuelle = await designationEnVigueur(q, policeId);
  for (const a of actuelle?.beneficiaires.filter(b => b.acceptant) ?? []) {
    const n = liste.find(b => b.tiersId === a.tiers_id);
    if (!n || n.quotite !== a.quotite) {
      throw new ErreurMetier('ACCORD_BENEFICIAIRE_REQUIS', 'Un bénéficiaire a accepté sa désignation : sa quotité ne peut être modifiée sans son accord écrit (art. 201)', 422);
    }
  }
  const avenantId = crypto.randomUUID();
  const numero = await attribuer(q, acteur, { type: 'AVENANT', numeroPolice: p.numero }, { type: 'avenant', id: avenantId });
  const noms = new Map((await q.query<{ id: string; n: string }>(`SELECT id, trim(nom || ' ' || COALESCE(prenoms, '')) AS n FROM tiers WHERE id = ANY($1)`, [liste.map(b => b.tiersId)])).rows.map(r => [r.id, r.n]));
  await q.query(`INSERT INTO avenant (id, numero, police_id, type, date_effet, description, difference_prime) VALUES ($1,$2,$3,'BENEFICIAIRES',current_date,$4,0)`,
    [avenantId, numero, policeId, JSON.stringify(liste)]);
  const doc = await genererDocument(q, acteur, { modeleCode: 'AVENANT_BENEFICIAIRES', typeDocument: 'AVENANT', objet: { type: 'avenant', id: avenantId }, variables: {
    numero, police: p.numero, beneficiaires: liste.map(b => ({ nom: noms.get(b.tiersId) ?? '', quotite: `${b.quotite} %`, rang: b.rang })),
  } });
  const envoi = await demanderAcceptation(q, acteur, doc.id, p.souscripteur_id);
  return { avenantId, numero, documentId: doc.id, ...envoi };
}

/** Étape 2 : le code du souscripteur confirme la nouvelle version, en vigueur dès maintenant (PROD-RG-012). */
export async function confirmerChangementBeneficiaires(q: Executant, acteur: Acteur, avenantId: string, code: string) {
  const a = (await q.query<{ police_id: string; description: string; preuve_id: string | null; type: string }>('SELECT police_id, description, preuve_id, type FROM avenant WHERE id = $1 FOR UPDATE', [avenantId])).rows[0];
  if (!a) throw nonTrouve('Avenant');
  exiger(a.type === 'BENEFICIAIRES' && !a.preuve_id, 'DEJA_CONFIRME', 'Avenant déjà confirmé', 409);
  const p = await lirePoliceVie(q, a.police_id, true);
  const doc = (await q.query<{ id: string }>(`SELECT id FROM document WHERE objet_type = 'avenant' AND objet_id = $1 ORDER BY horodatage_scellement DESC LIMIT 1`, [avenantId])).rows[0]!;
  const r = await confirmerAcceptation(q, acteur, { documentId: doc.id, signataireId: p.souscripteur_id, code, assiste: true });
  if (r instanceof Refus) return r;
  const liste = JSON.parse(a.description) as ListeBeneficiaires;
  const precedente = await designationEnVigueur(q, a.police_id);
  const version = (precedente?.version ?? 0) + 1;
  const acceptants = new Set(precedente?.beneficiaires.filter(b => b.acceptant).map(b => b.tiers_id) ?? []);
  const v = await q.query<{ id: string }>(`INSERT INTO designation_version (police_id, version, mode, date_effet, preuve_id) VALUES ($1,$2,'NOMINATIVE',now(),$3) RETURNING id`, [a.police_id, version, r.preuveId]);
  for (const b of liste) {
    await q.query('INSERT INTO beneficiaire (designation_version_id, tiers_id, quotite, rang, acceptant) VALUES ($1,$2,$3,$4,$5)', [v.rows[0]!.id, b.tiersId, b.quotite, b.rang, acceptants.has(b.tiersId)]);
  }
  await q.query('UPDATE avenant SET preuve_id = $2 WHERE id = $1', [avenantId, r.preuveId]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'designation_version', objetId: v.rows[0]!.id, apres: { police: p.numero, version, liste } });
  await publier(q, acteur, { type: 'AVENANT_EMIS', objet: { type: 'avenant', id: avenantId }, charge: { police: p.numero, type: 'BENEFICIAIRES' }, cleIdempotence: `avenant:${avenantId}` });
  return { version };
}

/** PROD-RG-013, art. 201 : acceptation par un bénéficiaire, avec l'accord écrit du souscripteur (et de l'assuré s'il est différent). */
export async function enregistrerAcceptationBeneficiaire(q: Executant, acteur: Acteur, d: { policeId: string; tiersId: string; preuveBeneficiaireId: string; preuveSouscripteurId: string; preuveAssureId?: string }) {
  const des = await designationEnVigueur(q, d.policeId);
  const b = des?.beneficiaires.find(x => x.tiers_id === d.tiersId);
  if (!b) throw nonTrouve('Bénéficiaire de la désignation en vigueur');
  exiger(!b.acceptant, 'DEJA_ACCEPTANT', 'Ce bénéficiaire a déjà accepté', 409);
  const ids = [...new Set([d.preuveBeneficiaireId, d.preuveSouscripteurId, ...(d.preuveAssureId ? [d.preuveAssureId] : [])])];
  const preuves = await q.query('SELECT id FROM dossier_preuve WHERE id = ANY($1)', [ids]);
  exiger(preuves.rowCount === ids.length, 'PREUVE_INVALIDE', 'Accords écrits introuvables');
  await q.query('UPDATE beneficiaire SET acceptant = true WHERE id = $1', [b.id]);
  await q.query(`INSERT INTO acceptation_beneficiaire (beneficiaire_id, preuve_beneficiaire_id, preuve_souscripteur_id, preuve_assure_id, acceptee_le) VALUES ($1,$2,$3,$4,now())`,
    [b.id, d.preuveBeneficiaireId, d.preuveSouscripteurId, d.preuveAssureId ?? null]);
  await journaliser(q, { ...acteur.trace(), action: 'VALIDATION', objetType: 'beneficiaire', objetId: b.id, apres: { acceptant: true } });
}
