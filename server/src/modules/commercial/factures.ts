/**
 * Factures mensuelles de commissions (CDC § 7.5.5 ; COM-RG-042 à 045, 120, 121 ; CA-COM-20 à 22 ; DD facture_commission,
 * paiement_facture_commission, mandat_affectation_commission).
 *
 * - En fin de mois, une facture par intervenant (agent général, junior, prescripteur), au titre du mandat d'autofacturation,
 *   à partir des commissions acquises non encore facturées ; les reprises déjà facturées viennent en avoir (COM-RG-121).
 * - Le commercial l'émet par code à usage unique, ou dépose sa propre facture de même référence et même montant.
 * - Validation par la Direction commerciale, ou d'office sous le seuil paramétré (COM-RG-045).
 * - Paiement en une ou plusieurs fractions motivées, retenue à la source au prorata, par la chaîne de paiement (EVT-05),
 *   ou affectation du net au compte de production sur mandat de l'agent général (EVT-27).
 */
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger, nonTrouve } from '../../noyau/erreurs.js';
import { ajouterJours, aujourdhui } from '../../noyau/dates.js';
import { journaliser } from '../../moteurs/audit.js';
import { entier } from '../../moteurs/parametres.js';
import { attribuer } from '../../moteurs/numerotation.js';
import { notifier } from '../../moteurs/notifications.js';
import { publier } from '../../moteurs/evenements.js';
import { enregistrerOperation, soumettre } from '../../moteurs/validation.js';
import { genererDocument } from '../../moteurs/documents.js';
import { comptabiliser, type CompteResolu } from '../comptabilite/moteur.js';
import { confirmerAcceptation, demanderAcceptation } from '../documents/acceptation.js';
import { Refus } from '../auth/service.js';
import { enregistrerExecution, ordonnerPaiement } from '../finances/paiements.js';
import { compteComptable, lireCompteProduction, mouvementer } from './comptesProduction.js';

export const OPERATION_FACTURE = 'FACTURE_COMMISSION';
export const OPERATION_AFFECTATION = 'AFFECTATION_COMMISSION';
const gnf = (n: number) => `${n.toLocaleString('fr-FR').replace(/ /g, ' ')} GNF`;

interface Facture {
  id: string; numero: string; intervenant_id: string; mois: string; mode: string; montant_brut: number; avoir: number; retenue: number; net: number;
  montant_paye: number; statut: string; tiers_id: string; role: string; document_id: string | null;
}

export async function lireFacture(q: Executant, id: string, verrou = false): Promise<Facture> {
  const r = await q.query<Facture>(
    `SELECT f.*, i.tiers_id, i.role FROM facture_commission f JOIN intervenant i ON i.id = f.intervenant_id WHERE f.id = $1${verrou ? ' FOR UPDATE OF f' : ''}`, [id]);
  if (!r.rows[0]) throw nonTrouve('Facture de commissions');
  const f = r.rows[0];
  return { ...f, montant_brut: Number(f.montant_brut), avoir: Number(f.avoir), retenue: Number(f.retenue), net: Number(f.net), montant_paye: Number(f.montant_paye) };
}

/** Taux de retenue à la source applicable au type de tiers (FIN-RG-095) : code taxe RETENUE_SOURCE en vigueur. */
async function tauxRetenue(q: Executant, role: string, date: string): Promise<number> {
  const r = (await q.query<{ taux: string }>(
    `SELECT DISTINCT ON (code) taux FROM code_taxe WHERE type = 'RETENUE_SOURCE' AND (type_tiers IS NULL OR type_tiers = $1) AND date_effet <= $2 AND supprime_le IS NULL
      ORDER BY code, date_effet DESC`, [role, date])).rows;
  return r.reduce((s, x) => s + Number(x.taux), 0);
}


/** Fin de mois : une facture par intervenant pour ses commissions acquises non facturées (CA-COM-20). */
export async function etablirFactures(q: Executant, acteur: Acteur, mois: string) {
  exiger(/^\d{4}-(0[1-9]|1[0-2])$/.test(mois), 'MOIS_INVALIDE', 'Mois au format AAAA-MM');
  const fin = mois.endsWith('-12') ? `${mois.slice(0, 4)}-12-31` : ajouterJours(`${mois.slice(0, 4)}-${String(Number(mois.slice(5)) + 1).padStart(2, '0')}-01`, -1);
  const intervenants = await q.query<{ intervenant_id: string }>(
    `SELECT DISTINCT intervenant_id FROM commission WHERE facture_commission_id IS NULL AND statut = 'DUE' AND cree_le::date <= $1
     UNION SELECT DISTINCT c.intervenant_id FROM commission c JOIN facture_commission f ON f.id = c.facture_commission_id
      WHERE c.statut = 'REPRISE' AND f.mois < $2 AND c.modifie_le::date <= $1 AND to_char(c.modifie_le, 'YYYY-MM') = $2`, [fin, mois]);
  const etablies: { numero: string; intervenantId: string; brut: number; net: number }[] = [];
  for (const { intervenant_id } of intervenants.rows) {
    const existe = await q.query('SELECT 1 FROM facture_commission WHERE intervenant_id = $1 AND mois = $2', [intervenant_id, mois]);
    if (existe.rowCount) continue; // une facture par intervenant et par mois (DD 6.10)
    const lignes = (await q.query<{ id: string; montant: number; type: string; police: string; quittance: string }>(
      `SELECT c.id, c.montant, c.type, p.numero AS police, qt.numero AS quittance FROM commission c JOIN police p ON p.id = c.police_id JOIN quittance qt ON qt.id = c.quittance_id
        WHERE c.intervenant_id = $1 AND c.facture_commission_id IS NULL AND c.statut = 'DUE' AND c.cree_le::date <= $2 ORDER BY c.cree_le`, [intervenant_id, fin])).rows;
    const avoir = Number((await q.query<{ s: number }>(
      `SELECT COALESCE(sum(c.montant), 0)::bigint AS s FROM commission c JOIN facture_commission f ON f.id = c.facture_commission_id
        WHERE c.intervenant_id = $1 AND c.statut = 'REPRISE' AND f.mois < $2 AND to_char(c.modifie_le, 'YYYY-MM') = $2`, [intervenant_id, mois])).rows[0]!.s);
    const brut = lignes.reduce((s, l) => s + Number(l.montant), 0);
    if (brut - avoir <= 0) continue;
    const i = (await q.query<{ tiers_id: string; role: string; nom: string; telephone: string | null }>(
      `SELECT i.tiers_id, i.role, trim(t.nom || ' ' || COALESCE(t.prenoms, '')) AS nom, t.telephone FROM intervenant i JOIN tiers t ON t.id = i.tiers_id WHERE i.id = $1`, [intervenant_id])).rows[0]!;
    const retenue = Math.round((brut - avoir) * await tauxRetenue(q, i.role, fin));
    const net = brut - avoir - retenue;
    const id = crypto.randomUUID();
    const numero = await attribuer(q, acteur, { type: 'FACTURE_COMMISSION', annee: Number(mois.slice(0, 4)), mois: Number(mois.slice(5)) }, { type: 'facture_commission', id });
    const doc = await genererDocument(q, acteur, { modeleCode: 'FACTURE_COMMISSION', typeDocument: 'FACTURE_COMMISSION', objet: { type: 'facture_commission', id }, variables: {
      numero, intervenant: i.nom, mois: mois.split('-').reverse().join('/'), lignes: lignes.map(l => ({ police: l.police, quittance: l.quittance, nature: l.type === 'PRIME_ANTICIPATION' ? 'Prime anticipée' : 'Commission', montant: gnf(Number(l.montant)) })),
      brut: gnf(brut), avoir: gnf(avoir), retenue: gnf(retenue), net: gnf(net),
    } });
    await q.query(
      `INSERT INTO facture_commission (id, numero, intervenant_id, mois, mode, document_id, montant_brut, avoir, retenue, net, montant_paye, statut, valide_d_office)
       VALUES ($1,$2,$3,$4,'AUTOFACTURATION',$5,$6,$7,$8,$9,0,'ETABLIE',false)`, [id, numero, intervenant_id, mois, doc.id, brut, avoir, retenue, net]);
    await q.query(`UPDATE commission SET facture_commission_id = $2, statut = 'FACTUREE' WHERE id = ANY($1)`, [lignes.map(l => l.id), id]);
    await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'facture_commission', objetId: id, apres: { numero, mois, brut, avoir, retenue, net } });
    if (i.telephone) {
      await notifier(q, { tiersId: i.tiers_id, code: 'FACTURE_COMMISSION_ETABLIE', canal: 'SMS', adresse: i.telephone, objet: { type: 'facture_commission', id },
        variables: { numero, mois: mois.split('-').reverse().join('/'), net: gnf(net) } }).catch(() => undefined);
    }
    etablies.push({ numero, intervenantId: intervenant_id, brut, net });
  }
  return etablies;
}

/** Émission par code à usage unique du commercial : étape 1, envoi du code lié à la facture. */
export async function demanderEmission(q: Executant, acteur: Acteur, factureId: string) {
  const f = await lireFacture(q, factureId, true);
  exiger(f.statut === 'ETABLIE' || f.statut === 'CONTESTEE', 'STATUT_INVALIDE', 'Facture déjà émise');
  return demanderAcceptation(q, acteur, f.document_id!, f.tiers_id);
}

/** Facture reçue conforme : délai de paiement, puis validation d'office sous le seuil ou par la Direction commerciale. */
async function recevoir(q: Executant, acteur: Acteur, f: Facture, mode: 'AUTOFACTURATION' | 'FACTURE_DEPOSEE', documentId?: string) {
  const delai = await entier(q, 'COM_DELAI_PAIEMENT_FACTURE_JOURS');
  await q.query(`UPDATE facture_commission SET statut = 'EMISE', mode = $2::varchar, document_id = COALESCE($3::uuid, document_id),
                   emise_par_otp_le = CASE WHEN $2::varchar = 'AUTOFACTURATION' THEN now() END, recue_le = now(), date_limite_paiement = $4 WHERE id = $1`,
    [f.id, mode, documentId ?? null, ajouterJours(aujourdhui(), delai)]);
  const seuil = await entier(q, 'COM_SEUIL_VALIDATION_OFFICE');
  if (seuil > 0 && f.net < seuil) {
    await q.query(`UPDATE facture_commission SET statut = 'VALIDEE', valide_d_office = true WHERE id = $1`, [f.id]);
    await journaliser(q, { ...acteur.trace(), action: 'VALIDATION', objetType: 'facture_commission', objetId: f.id, apres: { valideDOffice: true } });
    return { statut: 'VALIDEE' as const };
  }
  const d = await soumettre(q, acteur, { typeOperation: OPERATION_FACTURE, objetType: 'facture_commission', objetId: f.id, montant: f.net, donnees: { numero: f.numero, mois: f.mois, net: f.net } });
  await q.query('UPDATE facture_commission SET demande_validation_id = $2 WHERE id = $1', [f.id, d.id]);
  return { statut: 'EMISE' as const, demandeValidation: d.id };
}

/** Émission par code : étape 2. */
export async function confirmerEmission(q: Executant, acteur: Acteur, factureId: string, code: string) {
  const f = await lireFacture(q, factureId, true);
  exiger(f.statut === 'ETABLIE' || f.statut === 'CONTESTEE', 'STATUT_INVALIDE', 'Facture déjà émise');
  const r = await confirmerAcceptation(q, acteur, { documentId: f.document_id!, signataireId: f.tiers_id, code, assiste: false });
  if (r instanceof Refus) return r;
  return recevoir(q, acteur, f, 'AUTOFACTURATION');
}

/** Variante : le commercial dépose sa propre facture, de même référence et de même montant (COM-RG-042). */
export async function deposerFacture(q: Executant, acteur: Acteur, factureId: string, d: { documentId: string; reference: string; montantNet: number }) {
  const f = await lireFacture(q, factureId, true);
  exiger(f.statut === 'ETABLIE' || f.statut === 'CONTESTEE', 'STATUT_INVALIDE', 'Facture déjà émise');
  exiger(d.reference === f.numero && d.montantNet === f.net, 'FACTURE_NON_CONFORME', `La facture déposée porte la référence ${f.numero} et le net de ${gnf(f.net)}`);
  return recevoir(q, acteur, f, 'FACTURE_DEPOSEE', d.documentId);
}

export async function contesterFacture(q: Executant, acteur: Acteur, factureId: string, motif: string) {
  exiger(motif?.trim(), 'MOTIF_REQUIS', 'Motif de la contestation obligatoire');
  const r = await q.query(`UPDATE facture_commission SET statut = 'CONTESTEE' WHERE id = $1 AND statut IN ('ETABLIE', 'EMISE')`, [factureId]);
  exiger(r.rowCount, 'STATUT_INVALIDE', 'Seule une facture établie ou émise se conteste');
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'facture_commission', objetId: factureId, apres: { statut: 'CONTESTEE', motif } });
}

enregistrerOperation(OPERATION_FACTURE, {
  administrative: false,
  async appliquer(q, demande, acteur) {
    await q.query(`UPDATE facture_commission SET statut = 'VALIDEE' WHERE id = $1 AND statut = 'EMISE'`, [demande.objet_id]);
    await journaliser(q, { ...acteur.trace(), action: 'VALIDATION', objetType: 'facture_commission', objetId: demande.objet_id });
  },
  async rejeter(q, demande, acteur) {
    await q.query(`UPDATE facture_commission SET statut = 'CONTESTEE' WHERE id = $1`, [demande.objet_id]);
    await journaliser(q, { ...acteur.trace(), action: 'REJET', objetType: 'facture_commission', objetId: demande.objet_id });
  },
});

// ---------------------------------------------------------------- paiement fractionné et affectation (COM-RG-043, 044, 120)

/** Brut et retenue déjà payés ou engagés (fractions exécutées, ordres validés, demandes en attente). */
async function engage(q: Executant, factureId: string): Promise<{ brut: number; retenue: number }> {
  const r = (await q.query<{ brut: number; retenue: number }>(
    `WITH x AS (
       SELECT montant AS brut, retenue FROM paiement_facture_commission WHERE facture_id = $1
       UNION ALL SELECT (v.donnees ->> 'brut')::bigint, (v.donnees ->> 'retenue')::bigint FROM demande_validation v
        WHERE v.statut = 'EN_ATTENTE' AND v.donnees ->> 'factureId' = $1::text AND v.type_operation IN ('PAIEMENT_COMMISSION', $2)
       UNION ALL SELECT (v.donnees ->> 'brut')::bigint, (v.donnees ->> 'retenue')::bigint FROM ordre_paiement o JOIN demande_validation v ON v.id = o.demande_validation_id
        WHERE o.statut = 'VALIDE' AND v.donnees ->> 'factureId' = $1::text)
     SELECT COALESCE(sum(brut), 0)::bigint AS brut, COALESCE(sum(retenue), 0)::bigint AS retenue FROM x`, [factureId, OPERATION_AFFECTATION])).rows[0]!;
  return { brut: Number(r.brut), retenue: Number(r.retenue) };
}

/** Retenue d'une fraction, au prorata ; la dernière fraction reçoit le reste, pour que la somme égale la retenue de la facture. */
function retenueFraction(f: Facture, brutFraction: number, dejaBrut: number, dejaRetenue: number): number {
  const payable = f.montant_brut - f.avoir;
  if (dejaBrut + brutFraction >= payable) return f.retenue - dejaRetenue;
  return Math.round(f.retenue * brutFraction / payable);
}

export async function payerFacture(q: Executant, acteur: Acteur, factureId: string, d: {
  montant: number; destination: 'VIREMENT' | 'MONNAIE_ELECTRONIQUE' | 'COMPTE_PRODUCTION'; coordonneeId?: string; motifFraction?: string;
}) {
  const f = await lireFacture(q, factureId, true);
  exiger(['VALIDEE', 'PARTIELLEMENT_PAYEE'].includes(f.statut), 'FACTURE_NON_VALIDEE', 'Seule une facture validée est payée');
  const payable = f.montant_brut - f.avoir;
  const dejaEngage = await engage(q, factureId);
  const reste = payable - dejaEngage.brut;
  exiger(Number.isInteger(d.montant) && d.montant > 0 && d.montant <= reste, 'MONTANT_INVALIDE', `Montant brut à payer : ${gnf(reste)} au plus`);
  if (d.montant < reste) exiger(d.motifFraction?.trim(), 'MOTIF_FRACTION_REQUIS', 'Le motif d\'un fractionnement est obligatoire (COM-RG-044)');
  const retenue = retenueFraction(f, d.montant, dejaEngage.brut, dejaEngage.retenue);
  const donnees = { factureId, numero: f.numero, brut: d.montant, retenue, net: d.montant - retenue, destination: d.destination, motifFraction: d.motifFraction ?? null };
  if (d.destination === 'COMPTE_PRODUCTION') {
    // COM-RG-120 : affectation sur mandat écrit de l'agent général ; juniors et prescripteurs sont toujours payés
    exiger(f.role === 'AGENT_GENERAL', 'AFFECTATION_IMPOSSIBLE', 'Seul un agent général affecte ses commissions à son compte de production');
    const m = (await q.query<{ id: string; compte_production_id: string }>(
      `SELECT id, compte_production_id FROM mandat_affectation_commission WHERE intervenant_id = $1 AND statut = 'ACTIF' AND revoque_le IS NULL
          AND (type = 'PERMANENT' OR facture_id = $2) ORDER BY type = 'PONCTUEL' DESC LIMIT 1`, [f.intervenant_id, factureId])).rows[0];
    exiger(m, 'MANDAT_ABSENT', 'Aucun mandat d\'affectation de l\'agent pour cette facture (COM-RG-120)');
    const demande = await soumettre(q, acteur, { typeOperation: OPERATION_AFFECTATION, objetType: 'facture_commission', objetId: factureId, montant: d.montant, donnees: { ...donnees, mandatId: m.id, compteProductionId: m.compte_production_id } });
    return { demandeValidation: demande.id, ...donnees };
  }
  exiger(d.coordonneeId, 'COORDONNEE_REQUISE', 'Coordonnées de paiement vérifiées du commercial obligatoires');
  const o = await ordonnerPaiement(q, acteur, { type: 'COMMISSION', beneficiaireTiersId: f.tiers_id, coordonneeId: d.coordonneeId, montant: d.montant - retenue,
    objet: { type: 'facture_commission', id: factureId },
    donnees: { ...donnees, libelle: `Facture de commissions ${f.numero}`, detail: [{ libelle: 'Brut', montant: gnf(d.montant) }, { libelle: 'Retenue à la source', montant: gnf(retenue) }, { libelle: 'Net versé', montant: gnf(d.montant - retenue) }] } });
  return { ordre: o.numero, ordreId: o.ordreId, demandeValidation: o.demandeValidation, ...donnees };
}

/** Enregistre la fraction payée ou affectée et met la facture à jour (statuts PARTIELLEMENT_PAYEE puis PAYEE). */
async function enregistrerFraction(q: Executant, factureId: string, d: { brut: number; retenue: number; net: number; destination: string; motifFraction: string | null; mandatId?: string; ordreId?: string; ecritureId: string; demandeId: string }) {
  const f = await lireFacture(q, factureId, true);
  const rang = (await q.query<{ r: number }>('SELECT COALESCE(max(rang), 0) + 1 AS r FROM paiement_facture_commission WHERE facture_id = $1', [factureId])).rows[0]!.r;
  await q.query(
    `INSERT INTO paiement_facture_commission (facture_id, rang, montant, retenue, net, destination, motif_fraction, mandat_id, ordre_paiement_id, ecriture_id, demande_validation_id, paye_le)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())`,
    [factureId, rang, d.brut, d.retenue, d.net, d.destination, d.motifFraction, d.mandatId ?? null, d.ordreId ?? null, d.ecritureId, d.demandeId]);
  const paye = f.montant_paye + d.brut;
  const statut = paye >= f.montant_brut - f.avoir ? 'PAYEE' : 'PARTIELLEMENT_PAYEE';
  await q.query('UPDATE facture_commission SET montant_paye = $2, statut = $3 WHERE id = $1', [factureId, paye, statut]);
  if (statut === 'PAYEE') await q.query(`UPDATE commission SET statut = 'PAYEE' WHERE facture_commission_id = $1 AND statut = 'FACTUREE'`, [factureId]);
}

async function compteCommissions(q: Executant, intervenantId: string): Promise<CompteResolu> {
  const r = (await q.query<{ compte_auxiliaire_id: string; collectif_id: string }>(
    `SELECT tr.compte_auxiliaire_id, a.collectif_id FROM intervenant i JOIN tiers_role tr ON tr.tiers_id = i.tiers_id AND tr.role = i.role AND tr.date_fin IS NULL
       JOIN compte_auxiliaire a ON a.id = tr.compte_auxiliaire_id WHERE i.id = $1`, [intervenantId])).rows[0];
  if (!r) throw new ErreurMetier('COMPTE_COMMISSIONS_ABSENT', 'Intervenant sans compte de commissions à payer', 422);
  return { compteId: r.collectif_id, auxiliaireId: r.compte_auxiliaire_id };
}

/** Exécution d'un ordre de paiement de commissions : EVT-05 (brut au débit des commissions à payer, retenue, net en banque). */
enregistrerExecution('COMMISSION', async (q, acteur, ordre, tresorerie, avisDocumentId) => {
  const d = (await q.query<{ donnees: { factureId: string; brut: number; retenue: number; net: number; destination: string; motifFraction: string | null } }>(
    'SELECT donnees FROM demande_validation WHERE id = $1', [ordre.demande_validation_id])).rows[0]!.donnees;
  const f = await lireFacture(q, d.factureId, true);
  const [e] = await comptabiliser(q, acteur, { codeEvt: 'EVT-05', reference: f.numero, pieceDocumentId: avisDocumentId, journalTresorerie: tresorerie.journal,
    montants: { BRUT: d.brut, RETENUE: d.retenue, NET: d.net }, comptes: { COMMISSIONS_A_PAYER: await compteCommissions(q, f.intervenant_id), TRESORERIE: { compteId: tresorerie.compteId } } });
  await enregistrerFraction(q, f.id, { ...d, ordreId: ordre.id, ecritureId: e!.id, demandeId: ordre.demande_validation_id });
  return { ecritureId: e!.id, libelle: f.numero };
});

/** Affectation validée (même validation qu'un paiement) : EVT-27, compte de production crédité du net. */
enregistrerOperation(OPERATION_AFFECTATION, {
  administrative: false,
  async appliquer(q, demande, acteur) {
    const d = demande.donnees as { factureId: string; brut: number; retenue: number; net: number; destination: string; motifFraction: string | null; mandatId: string; compteProductionId: string };
    const f = await lireFacture(q, d.factureId, true);
    const cp = await lireCompteProduction(q, d.compteProductionId, true);
    const avis = await genererDocument(q, acteur, { modeleCode: 'AVIS_PAIEMENT', typeDocument: 'AVIS_PAIEMENT', objet: { type: 'facture_commission', id: f.id }, variables: {
      numero: f.numero, beneficiaire: (await q.query<{ n: string }>(`SELECT trim(nom || ' ' || COALESCE(prenoms, '')) AS n FROM tiers WHERE id = $1`, [f.tiers_id])).rows[0]!.n,
      montant: gnf(d.net), etablissement: `compte de production du bureau ${cp.bureau}`, objet: `Affectation de la facture ${f.numero}`,
      detail: [{ libelle: 'Brut', montant: gnf(d.brut) }, { libelle: 'Retenue à la source', montant: gnf(d.retenue) }, { libelle: 'Net affecté au compte de production', montant: gnf(d.net) }],
    } });
    const [e] = await comptabiliser(q, acteur, { codeEvt: 'EVT-27', reference: f.numero, pieceDocumentId: avis.id, montants: { BRUT: d.brut, RETENUE: d.retenue, NET: d.net },
      comptes: { COMMISSIONS_A_PAYER: await compteCommissions(q, f.intervenant_id), COMPTE_PRODUCTION: compteComptable(cp) } });
    await mouvementer(q, acteur, { compteId: cp.id, nature: 'AFFECTATION_COMMISSION', montant: d.net, reference: f.numero, ecritureId: e!.id });
    await enregistrerFraction(q, f.id, { ...d, ecritureId: e!.id, demandeId: demande.id });
    await q.query(`UPDATE mandat_affectation_commission SET statut = 'EPUISE' WHERE id = $1 AND type = 'PONCTUEL'`, [d.mandatId]);
    await publier(q, acteur, { type: 'PAIEMENT_EXECUTE', objet: { type: 'facture_commission', id: f.id }, charge: { affectation: true, net: d.net }, cleIdempotence: `affectation:${demande.id}` });
  },
});

/** COM-RG-120 : mandat d'affectation, ponctuel (une facture) ou permanent révocable, signé par l'agent. */
export async function creerMandat(q: Executant, acteur: Acteur, d: { intervenantId: string; compteProductionId: string; type: 'PONCTUEL' | 'PERMANENT'; factureId?: string; documentId: string }) {
  const cp = await lireCompteProduction(q, d.compteProductionId);
  exiger(cp.intervenant_id === d.intervenantId, 'COMPTE_INVALIDE', 'Le compte de production crédité est celui d\'un bureau de l\'agent');
  if (d.type === 'PONCTUEL') exiger(d.factureId, 'FACTURE_REQUISE', 'Un mandat ponctuel vise une facture');
  const r = await q.query<{ id: string }>(
    `INSERT INTO mandat_affectation_commission (intervenant_id, compte_production_id, type, facture_id, document_id, date_debut, statut) VALUES ($1,$2,$3,$4,$5,current_date,'ACTIF') RETURNING id`,
    [d.intervenantId, d.compteProductionId, d.type, d.factureId ?? null, d.documentId]);
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'mandat_affectation_commission', objetId: r.rows[0]!.id, apres: d });
  return r.rows[0]!.id;
}

export async function revoquerMandat(q: Executant, acteur: Acteur, mandatId: string) {
  const r = await q.query(`UPDATE mandat_affectation_commission SET statut = 'REVOQUE', revoque_le = now() WHERE id = $1 AND statut = 'ACTIF'`, [mandatId]);
  exiger(r.rowCount, 'MANDAT_INACTIF', 'Mandat introuvable ou déjà révoqué');
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'mandat_affectation_commission', objetId: mandatId, apres: { revoque: true } });
}

export async function listerFactures(q: Executant, f: { intervenantId?: string; statut?: string; mois?: string }) {
  return (await q.query(
    `SELECT f.id, f.numero, f.mois, f.mode, f.statut, f.montant_brut, f.avoir, f.retenue, f.net, f.montant_paye, f.date_limite_paiement, f.valide_d_office,
            i.role, trim(t.nom || ' ' || COALESCE(t.prenoms, '')) AS intervenant,
            (SELECT json_agg(json_build_object('rang', p.rang, 'montant', p.montant, 'retenue', p.retenue, 'net', p.net, 'destination', p.destination, 'paye_le', p.paye_le) ORDER BY p.rang)
               FROM paiement_facture_commission p WHERE p.facture_id = f.id) AS paiements
       FROM facture_commission f JOIN intervenant i ON i.id = f.intervenant_id JOIN tiers t ON t.id = i.tiers_id
      WHERE ($1::uuid IS NULL OR f.intervenant_id = $1) AND ($2::text IS NULL OR f.statut = $2) AND ($3::text IS NULL OR f.mois = $3)
      ORDER BY f.mois DESC, t.nom`, [f.intervenantId ?? null, f.statut ?? null, f.mois ?? null])).rows;
}
