/**
 * Comptes de production des agents (CDC § 7.4, 7.5.2, 7.5.3, 7.5.6 ; COM-RG-010 à 014, 020 à 025, 050 à 054 ;
 * DD compte_production_agent, mouvement_compte_production, approvisionnement_compte, demande_restitution).
 *
 * - Compte de garantie, jamais négatif (contrôle en base) ; chaque bureau a le sien ; aucune compensation entre bureaux.
 * - Seul un approvisionnement CONFIRMÉ augmente le solde et génère l'écriture EVT-01 et le reçu numéroté.
 * - Le débit (émission, renouvellement) verrouille le compte : deux opérations ne consomment jamais le même solde.
 * - Restitution : le compte est GELÉ dès la demande, le solde est figé ; la demande n'est recevable qu'une fois
 *   toutes les émissions du compte hors du délai d'annulation.
 */
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger, nonTrouve } from '../../noyau/erreurs.js';
import { journaliser } from '../../moteurs/audit.js';
import { entier, valeurParametre } from '../../moteurs/parametres.js';
import { attribuer } from '../../moteurs/numerotation.js';
import { notifier } from '../../moteurs/notifications.js';
import { publier } from '../../moteurs/evenements.js';
import { enregistrerOperation, soumettre } from '../../moteurs/validation.js';
import { genererDocument } from '../../moteurs/documents.js';
import { comptabiliser } from '../comptabilite/moteur.js';
import { normaliserNumero } from '../comptabilite/plan.js';
import { tresorerieDe, type Moyen } from '../finances/tresorerie.js';

export const OPERATION_RESTITUTION = 'RESTITUTION_COMPTE_PRODUCTION';
export type NatureMouvement = 'APPROVISIONNEMENT' | 'AFFECTATION_COMMISSION' | 'EMISSION' | 'RENOUVELLEMENT' | 'ANNULATION' | 'VERSEMENT_PROGRAMME' | 'FRAIS_HORS_PRIME' | 'RESTITUTION';
const DEBITS: NatureMouvement[] = ['EMISSION', 'RENOUVELLEMENT', 'VERSEMENT_PROGRAMME', 'FRAIS_HORS_PRIME', 'RESTITUTION'];

interface CompteProduction {
  id: string; bureau_id: string; bureau: string; intervenant_id: string; tiers_id: string; compte_auxiliaire_id: string; collectif_id: string;
  statut: 'ACTIF' | 'GELE' | 'CLOTURE'; motif_gel: string | null; solde: number; seuil_alerte: number | null; montant_minimum: number;
}

export async function lireCompteProduction(q: Executant, id: string, verrou = false): Promise<CompteProduction> {
  const r = await q.query<CompteProduction>(
    `SELECT cp.id, cp.bureau_id, b.code AS bureau, cp.intervenant_id, i.tiers_id, cp.compte_auxiliaire_id, a.collectif_id, cp.statut, cp.motif_gel,
            cp.solde::bigint AS solde, cp.seuil_alerte, cp.montant_minimum
       FROM compte_production_agent cp JOIN bureau b ON b.id = cp.bureau_id JOIN intervenant i ON i.id = cp.intervenant_id
       JOIN compte_auxiliaire a ON a.id = cp.compte_auxiliaire_id
      WHERE cp.id = $1 AND cp.supprime_le IS NULL${verrou ? ' FOR UPDATE OF cp' : ''}`, [id]);
  if (!r.rows[0]) throw nonTrouve('Compte de production');
  return { ...r.rows[0], solde: Number(r.rows[0].solde) };
}

export async function compteProductionDuBureau(q: Executant, bureauId: string) {
  const r = await q.query<{ id: string }>('SELECT id FROM compte_production_agent WHERE bureau_id = $1 AND supprime_le IS NULL', [bureauId]);
  if (!r.rows[0]) throw new ErreurMetier('COMPTE_PRODUCTION_ABSENT', 'Ce bureau n\'a pas de compte de production : il n\'a pas encore de gestionnaire', 422);
  return lireCompteProduction(q, r.rows[0].id);
}

/** Séparation des tâches : le titulaire du compte (ou son collaborateur) ne confirme jamais un approvisionnement. */
async function exigerTiersDistinct(q: Executant, acteur: Acteur, cp: CompteProduction) {
  const r = await q.query(
    `SELECT 1 FROM utilisateur u JOIN intervenant i ON i.tiers_id = u.tiers_id
      WHERE u.id = $1 AND (i.id = $2 OR i.rattachement_id = $2)`, [acteur.utilisateurId, cp.intervenant_id]);
  if (r.rowCount) throw new ErreurMetier('INTERDIT', 'Un approvisionnement est confirmé par la caisse du siège ou la Trésorerie, jamais par l\'agent (COM-RG-012)', 403);
}

const gnf = (n: number) => `${n.toLocaleString('fr-FR').replace(/ /g, ' ')} GNF`;

/** Mouvement du compte (table en ajout seul) et nouveau solde, compte verrouillé. Refus si le solde ne couvre pas un débit. */
export async function mouvementer(q: Executant, acteur: Acteur, d: {
  compteId: string; nature: NatureMouvement; montant: number; reference: string; ecritureId: string; ignorerGel?: boolean;
}): Promise<{ solde: number }> {
  exiger(Number.isInteger(d.montant) && d.montant > 0, 'MONTANT_INVALIDE', 'Montant invalide');
  const cp = await lireCompteProduction(q, d.compteId, true);
  exiger(cp.statut === 'ACTIF' || d.ignorerGel, 'COMPTE_PRODUCTION_GELE',
    cp.statut === 'GELE' ? `Compte de production gelé (${cp.motif_gel === 'RESTITUTION' ? 'restitution demandée' : 'suspension'}) : aucune opération possible` : 'Compte de production clôturé');
  const debit = DEBITS.includes(d.nature);
  if (debit && cp.solde < d.montant) {
    throw new ErreurMetier('SOLDE_INSUFFISANT', `Solde insuffisant : il manque ${gnf(d.montant - cp.solde)}`, 422, { solde: cp.solde, manque: d.montant - cp.solde });
  }
  const solde = cp.solde + (debit ? -d.montant : d.montant);
  await q.query('UPDATE compte_production_agent SET solde = $2 WHERE id = $1', [cp.id, solde]);
  await q.query(
    `INSERT INTO mouvement_compte_production (compte_production_id, date_heure, nature, sens, montant, solde_apres, reference, ecriture_id, utilisateur_id)
     VALUES ($1, clock_timestamp(), $2, $3, $4, $5, $6, $7, $8)`,
    [cp.id, d.nature, debit ? 'D' : 'C', d.montant, solde, d.reference.slice(0, 40), d.ecritureId, acteur.utilisateurId]);
  // COM-RG-024 : alerte au passage sous le seuil choisi par l'agent
  if (debit && cp.seuil_alerte && cp.solde >= Number(cp.seuil_alerte) && solde < Number(cp.seuil_alerte)) {
    const t = (await q.query<{ telephone: string | null }>('SELECT telephone FROM tiers WHERE id = $1', [cp.tiers_id])).rows[0];
    if (t?.telephone) {
      await notifier(q, { tiersId: cp.tiers_id, code: 'COMPTE_PRODUCTION_SEUIL', canal: 'SMS', adresse: t.telephone, objet: { type: 'compte_production_agent', id: cp.id },
        variables: { bureau: cp.bureau, solde: gnf(solde) } }).catch(() => undefined);
    }
  }
  return { solde };
}

/** Compte comptable du compte de production (règle COMPTE_PRODUCTION des schémas). */
export const compteComptable = (cp: CompteProduction) => ({ compteId: cp.collectif_id, auxiliaireId: cp.compte_auxiliaire_id });

// ---------------------------------------------------------------- approvisionnements (COM-RG-010 à 014)

export async function declarerApprovisionnement(q: Executant, acteur: Acteur, d: {
  compteId: string; moyen: Moyen; montant: number; banque?: string; referenceExterne?: string;
}) {
  exiger(Number.isInteger(d.montant) && d.montant > 0, 'MONTANT_INVALIDE', 'Montant en francs entiers, positif');
  const cp = await lireCompteProduction(q, d.compteId);
  exiger(cp.statut === 'ACTIF', 'COMPTE_PRODUCTION_GELE', 'Compte de production gelé ou clôturé : approvisionnement impossible (COM-RG-051)');
  if (d.moyen !== 'ESPECES_SIEGE') exiger(d.banque && d.referenceExterne?.trim(), 'REFERENCE_REQUISE', 'Banque ou opérateur et référence de l\'opération obligatoires');
  const deja = (await q.query<{ n: number }>(`SELECT count(*)::int n FROM approvisionnement_compte WHERE compte_production_id = $1 AND statut = 'CONFIRME'`, [cp.id])).rows[0]!.n;
  // COM-RG-011, CA-COM-24 : premier approvisionnement au moins égal au minimum paramétré
  if (!deja) {
    const minimum = await entier(q, 'COM_APPRO_MINIMUM');
    exiger(d.montant >= minimum, 'MINIMUM_NON_ATTEINT', `Premier approvisionnement : ${gnf(minimum)} au minimum (COM-RG-011)`);
  }
  await tresorerieDe(q, d.moyen, d.banque); // la banque ou l'opérateur doit exister
  const id = crypto.randomUUID();
  const numero = await attribuer(q, acteur, { type: 'RECU_APPROVISIONNEMENT', annee: new Date().getFullYear() }, { type: 'approvisionnement_compte', id });
  await q.query(
    `INSERT INTO approvisionnement_compte (id, numero_recu, compte_production_id, moyen, montant, reference_externe, statut) VALUES ($1,$2,$3,$4,$5,$6,'DECLARE')`,
    [id, numero, cp.id, d.moyen, d.montant, d.moyen === 'ESPECES_SIEGE' ? null : `${d.banque}:${d.referenceExterne}`])
    .catch(e => { if (e.code === '23505') throw new ErreurMetier('OPERATION_DEJA_DECLAREE', 'Cette opération bancaire ou de monnaie électronique est déjà enregistrée', 409); throw e; });
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'approvisionnement_compte', objetId: id, apres: { ...d, numero } });
  // COM-RG-012 : les espèces sont confirmées à la saisie par le caissier
  if (d.moyen === 'ESPECES_SIEGE') return { id, numero, ...(await confirmerApprovisionnement(q, acteur, id)) };
  return { id, numero, statut: 'DECLARE' as const };
}

/** COM-RG-012, 013 : confirmation (trésorerie au vu du relevé, ou notification de l'opérateur) ; solde, reçu, EVT-01. */
export async function confirmerApprovisionnement(q: Executant, acteur: Acteur, id: string) {
  const a = (await q.query<{ numero_recu: string; compte_production_id: string; moyen: Moyen; montant: number; reference_externe: string | null; statut: string }>(
    'SELECT numero_recu, compte_production_id, moyen, montant, reference_externe, statut FROM approvisionnement_compte WHERE id = $1 FOR UPDATE', [id])).rows[0];
  if (!a) throw nonTrouve('Approvisionnement');
  exiger(a.statut === 'DECLARE', 'DEJA_TRAITE', 'Approvisionnement déjà confirmé ou rejeté', 409);
  const cp = await lireCompteProduction(q, a.compte_production_id);
  await exigerTiersDistinct(q, acteur, cp);
  exiger(cp.statut === 'ACTIF', 'COMPTE_PRODUCTION_GELE', 'Compte de production gelé : cet approvisionnement est à rejeter, puis à rembourser (COM-RG-051)');
  const montant = Number(a.montant);
  const banque = a.reference_externe?.split(':')[0] ?? null;
  const tresorerie = await tresorerieDe(q, a.moyen, banque);
  const recu = await genererDocument(q, acteur, {
    modeleCode: 'RECU_APPROVISIONNEMENT', typeDocument: 'RECU_APPROVISIONNEMENT', objet: { type: 'approvisionnement_compte', id },
    variables: { numero: a.numero_recu, bureau: cp.bureau, montant: gnf(montant), moyen: a.moyen.replace(/_/g, ' ').toLowerCase(), solde: gnf(cp.solde + montant) },
  });
  const [ecriture] = await comptabiliser(q, acteur, {
    codeEvt: 'EVT-01', reference: a.numero_recu, pieceDocumentId: recu.id, libelle: { bureau: cp.bureau },
    montants: { MONTANT: montant }, comptes: { TRESORERIE: { compteId: tresorerie.compteId }, COMPTE_PRODUCTION: compteComptable(cp) },
  });
  const { solde } = await mouvementer(q, acteur, { compteId: cp.id, nature: 'APPROVISIONNEMENT', montant, reference: a.numero_recu, ecritureId: ecriture!.id });
  await q.query(`UPDATE approvisionnement_compte SET statut = 'CONFIRME', confirme_par = $2, confirme_le = now() WHERE id = $1`, [id, acteur.utilisateurId]);
  await journaliser(q, { ...acteur.trace(), action: 'VALIDATION', objetType: 'approvisionnement_compte', objetId: id, apres: { statut: 'CONFIRME', solde, piece: ecriture!.numero } });
  await publier(q, acteur, { type: 'DEPOT_CONFIRME', objet: { type: 'approvisionnement_compte', id }, charge: { compteProductionId: cp.id, montant, solde }, cleIdempotence: `approvisionnement:${id}:confirme` });
  const t = (await q.query<{ telephone: string | null }>('SELECT telephone FROM tiers WHERE id = $1', [cp.tiers_id])).rows[0];
  if (t?.telephone) {
    await notifier(q, { tiersId: cp.tiers_id, code: 'APPROVISIONNEMENT_CONFIRME', canal: 'SMS', adresse: t.telephone, objet: { type: 'approvisionnement_compte', id },
      variables: { numero: a.numero_recu, montant: gnf(montant), bureau: cp.bureau, solde: gnf(solde) } }).catch(() => undefined);
  }
  return { statut: 'CONFIRME' as const, solde, piece: ecriture!.numero, recuDocumentId: recu.id };
}

export async function rejeterApprovisionnement(q: Executant, acteur: Acteur, id: string, motif: string) {
  exiger(motif?.trim(), 'MOTIF_REQUIS', 'Motif du rejet obligatoire');
  const cpId = (await q.query<{ compte_production_id: string }>('SELECT compte_production_id FROM approvisionnement_compte WHERE id = $1', [id])).rows[0]?.compte_production_id;
  if (!cpId) throw nonTrouve('Approvisionnement');
  await exigerTiersDistinct(q, acteur, await lireCompteProduction(q, cpId));
  const r = await q.query(`UPDATE approvisionnement_compte SET statut = 'REJETE', motif_rejet = $2, confirme_par = $3, confirme_le = now() WHERE id = $1 AND statut = 'DECLARE'`, [id, motif, acteur.utilisateurId]);
  exiger(r.rowCount, 'DEJA_TRAITE', 'Approvisionnement introuvable ou déjà traité', 409);
  await journaliser(q, { ...acteur.trace(), action: 'REJET', objetType: 'approvisionnement_compte', objetId: id, apres: { motif } });
}

export async function definirSeuilAlerte(q: Executant, acteur: Acteur, compteId: string, seuil: number | null) {
  exiger(seuil === null || (Number.isInteger(seuil) && seuil >= 0), 'SEUIL_INVALIDE', 'Seuil invalide');
  await q.query('UPDATE compte_production_agent SET seuil_alerte = $2 WHERE id = $1', [compteId, seuil]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'compte_production_agent', objetId: compteId, apres: { seuil_alerte: seuil } });
}

// ---------------------------------------------------------------- restitution (COM-RG-050 à 053)

/** Date à partir de laquelle plus aucune émission du compte n'est annulable (null : déjà le cas). */
export async function recevableA(q: Executant, compteId: string): Promise<Date | null> {
  const heures = await entier(q, 'COM_ANNULATION_ERREUR_HEURES');
  const r = await q.query<{ d: Date | null }>(
    `SELECT max(date_heure) + make_interval(hours => $2) AS d FROM mouvement_compte_production WHERE compte_production_id = $1 AND nature IN ('EMISSION', 'RENOUVELLEMENT')`,
    [compteId, heures]);
  const d = r.rows[0]?.d ? new Date(r.rows[0].d) : null;
  return d && d > new Date() ? d : null;
}

export async function demanderRestitution(q: Executant, acteur: Acteur, d: {
  compteId: string; motif: 'FIN_ACTIVITE' | 'DEMANDE_MOTIVEE'; justification?: string; coordonneePaiementId: string; justificatifDocumentId?: string;
}) {
  if (d.motif === 'DEMANDE_MOTIVEE') exiger(d.justification?.trim(), 'JUSTIFICATION_REQUISE', 'Une demande motivée expose ses motifs');
  const cp = await lireCompteProduction(q, d.compteId, true);
  exiger(cp.statut === 'ACTIF' || (cp.statut === 'GELE' && cp.motif_gel === 'SUSPENSION'), 'DEMANDE_EN_COURS', 'Une restitution est déjà en cours ou le compte est clôturé', 409);
  // COM-RG-051, CA-COM-17 : recevable une fois toutes les émissions hors du délai d'annulation
  const a = await recevableA(q, cp.id);
  if (a) {
    throw new ErreurMetier('RESTITUTION_PREMATUREE',
      `Demande recevable à partir du ${a.toLocaleString('fr-FR', { timeZone: 'Africa/Conakry', dateStyle: 'short', timeStyle: 'short' })} : une émission est encore annulable`, 422, { recevableA: a.toISOString() });
  }
  const c = (await q.query<{ tiers_id: string; statut: string }>('SELECT tiers_id, statut FROM coordonnee_paiement WHERE id = $1 AND supprime_le IS NULL', [d.coordonneePaiementId])).rows[0];
  exiger(c && c.tiers_id === cp.tiers_id && c.statut === 'VERIFIEE', 'COORDONNEE_INVALIDE', 'Le compte de paiement doit être vérifié et au nom de l\'agent (COM-RG-052)');
  // Sommes dues à la Compagnie à la date de la demande : avoirs de commissions non imputés (sous-lot 2.5)
  const sommesDues = 0;
  await q.query(`UPDATE compte_production_agent SET statut = 'GELE', motif_gel = 'RESTITUTION' WHERE id = $1`, [cp.id]);
  const id = crypto.randomUUID();
  const demande = await soumettre(q, acteur, {
    typeOperation: OPERATION_RESTITUTION, objetType: 'demande_restitution', objetId: id, montant: cp.solde - sommesDues,
    donnees: { bureau: cp.bureau, soldeFige: cp.solde, sommesDues, montant: cp.solde - sommesDues, motif: d.motif },
  });
  await q.query(
    `INSERT INTO demande_restitution (id, compte_production_id, date_heure_demande, motif, justification, justificatif_document_id, solde_fige, sommes_dues, montant_restitue,
                                      coordonnee_paiement_id, demande_validation_id, statut, suite)
     VALUES ($1,$2,now(),$3,$4,$5,$6,$7,$8,$9,$10,'EN_ATTENTE',$11)`,
    [id, cp.id, d.motif, d.justification ?? null, d.justificatifDocumentId ?? null, cp.solde, sommesDues, cp.solde - sommesDues, d.coordonneePaiementId, demande.id,
      d.motif === 'FIN_ACTIVITE' ? 'CLOTURE' : 'REPRISE_ACTIVITE']);
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'demande_restitution', objetId: id, apres: { ...d, soldeFige: cp.solde } });
  return { id, demandeValidation: demande.id, soldeFige: cp.solde, montant: cp.solde - sommesDues };
}

enregistrerOperation(OPERATION_RESTITUTION, {
  administrative: false,
  // Validée par la Direction commerciale puis la DAF ; le paiement est exécuté par la Trésorerie (chaîne de paiement, sous-lot 2.6)
  async appliquer(q, demande, acteur) {
    await q.query(`UPDATE demande_restitution SET statut = 'VALIDE' WHERE id = $1`, [demande.objet_id]);
    await journaliser(q, { ...acteur.trace(), action: 'VALIDATION', objetType: 'demande_restitution', objetId: demande.objet_id, apres: { statut: 'VALIDE' } });
  },
  async rejeter(q, demande, acteur) {
    const r = (await q.query<{ compte_production_id: string }>(`UPDATE demande_restitution SET statut = 'REJETE' WHERE id = $1 RETURNING compte_production_id`, [demande.objet_id])).rows[0]!;
    await q.query(`UPDATE compte_production_agent SET statut = 'ACTIF', motif_gel = NULL WHERE id = $1 AND motif_gel = 'RESTITUTION'`, [r.compte_production_id]);
    await journaliser(q, { ...acteur.trace(), action: 'REJET', objetType: 'demande_restitution', objetId: demande.objet_id });
  },
});

/** Paiement d'une restitution validée (EVT-06) : le compte revient à zéro, puis ACTIF ou CLÔTURÉ (COM-RG-052, 053). */
export async function executerRestitution(q: Executant, acteur: Acteur, demandeId: string, d: { pieceDocumentId: string; banque: string }) {
  const r = (await q.query<{ compte_production_id: string; montant_restitue: number; statut: string; suite: string | null }>(
    'SELECT compte_production_id, montant_restitue, statut, suite FROM demande_restitution WHERE id = $1 FOR UPDATE', [demandeId])).rows[0];
  if (!r) throw nonTrouve('Demande de restitution');
  exiger(r.statut === 'VALIDE', 'NON_VALIDEE', 'La restitution n\'est payée qu\'après validation de la Direction commerciale et de la DAF');
  const cp = await lireCompteProduction(q, r.compte_production_id, true);
  const montant = Number(r.montant_restitue);
  const tresorerie = await tresorerieDe(q, 'BANQUE', d.banque);
  if (montant > 0) {
    const [ecriture] = await comptabiliser(q, acteur, {
      codeEvt: 'EVT-06', reference: `RESTITUTION ${cp.bureau}`, pieceDocumentId: d.pieceDocumentId, journalTresorerie: tresorerie.journal,
      montants: { MONTANT: montant }, comptes: { TRESORERIE: { compteId: tresorerie.compteId }, COMPTE_PRODUCTION: compteComptable(cp) },
    });
    await mouvementer(q, acteur, { compteId: cp.id, nature: 'RESTITUTION', montant, reference: `RESTITUTION ${cp.bureau}`, ecritureId: ecriture!.id, ignorerGel: true });
  }
  await q.query(`UPDATE compte_production_agent SET statut = $2, motif_gel = NULL WHERE id = $1`, [cp.id, r.suite === 'CLOTURE' ? 'CLOTURE' : 'ACTIF']);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'demande_restitution', objetId: demandeId, apres: { paye: montant } });
  await publier(q, acteur, { type: 'DEPOT_REMBOURSE', objet: { type: 'demande_restitution', id: demandeId }, charge: { montant }, cleIdempotence: `restitution:${demandeId}:payee` });
}

export async function releve(q: Executant, compteId: string, limite = 200) {
  return (await q.query(
    `SELECT m.date_heure, m.nature, m.sens, m.montant, m.solde_apres, m.reference, e.numero_piece
       FROM mouvement_compte_production m JOIN ecriture e ON e.id = m.ecriture_id WHERE m.compte_production_id = $1 ORDER BY m.date_heure DESC LIMIT $2`,
    [compteId, limite])).rows;
}

export async function listerComptesProduction(q: Executant, bureaux: string[] | null) {
  return (await q.query(
    `SELECT cp.id, b.code AS bureau, b.nom AS bureau_nom, cp.statut, cp.motif_gel, cp.solde, cp.seuil_alerte, a.code AS compte_auxiliaire,
            trim(t.nom || ' ' || COALESCE(t.prenoms, '')) AS agent, i.id AS intervenant_id,
            (SELECT count(*)::int FROM approvisionnement_compte x WHERE x.compte_production_id = cp.id AND x.statut = 'DECLARE') AS a_confirmer
       FROM compte_production_agent cp JOIN bureau b ON b.id = cp.bureau_id JOIN compte_auxiliaire a ON a.id = cp.compte_auxiliaire_id
       JOIN intervenant i ON i.id = cp.intervenant_id JOIN tiers t ON t.id = i.tiers_id
      WHERE cp.supprime_le IS NULL AND ($1::text[] IS NULL OR b.code = ANY($1)) ORDER BY b.code`, [bureaux])).rows;
}

/** FIN-RG-041 : la somme des comptes de production égale le solde du collectif en comptabilité (contrôle quotidien). */
export async function controlerCollectif(q: Executant) {
  const collectif = normaliserNumero(await valeurParametre(q, 'COLLECTIF_COMPTE_PRODUCTION'));
  const r = (await q.query<{ metier: number; comptable: number }>(
    `SELECT (SELECT COALESCE(sum(solde), 0) FROM compte_production_agent)::bigint AS metier,
            (SELECT COALESCE(sum(l.credit) - sum(l.debit), 0) FROM ligne_ecriture l JOIN ecriture e ON e.id = l.ecriture_id JOIN compte c ON c.id = l.compte_id
              WHERE c.numero = $1 AND e.statut = 'VALIDEE')::bigint AS comptable`, [collectif])).rows[0]!;
  return { metier: Number(r.metier), comptable: Number(r.comptable), ecart: Number(r.metier) - Number(r.comptable) };
}
