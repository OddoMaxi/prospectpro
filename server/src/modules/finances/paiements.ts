/**
 * Chaîne de paiement (CDC § 11.17 ; FIN-RG-050, ORG-RG-042) : liquidation → ordonnancement → validation → exécution
 * → écriture → avis. Toute sortie d'argent passe par elle : aucun module ne paie par ses propres moyens.
 *
 * - L'ordre vise des coordonnées vérifiées, hors carence, au nom du bénéficiaire (REF-RG-005), contrôlées à l'exécution.
 * - Le circuit de validation dépend du type (référentiel des délégations) ; l'exécutant n'est ni l'ordonnateur ni un valideur.
 * - À l'exécution, le module métier comptabilise (traitement enregistré par type) ; l'avis est généré et notifié.
 */
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { exiger, interdit, nonTrouve } from '../../noyau/erreurs.js';
import { aujourdhui } from '../../noyau/dates.js';
import { journaliser } from '../../moteurs/audit.js';
import { attribuer } from '../../moteurs/numerotation.js';
import { notifier } from '../../moteurs/notifications.js';
import { publier } from '../../moteurs/evenements.js';
import { enregistrerOperation, soumettre } from '../../moteurs/validation.js';
import { genererDocument } from '../../moteurs/documents.js';
import { exigerPayable } from '../referentiels/coordonnees.js';
import { tresorerieDe } from './tresorerie.js';

export type TypeOrdre = 'PRESTATAIRE' | 'INDEMNITE' | 'COMMISSION' | 'REMBOURSEMENT_DEPOT' | 'FOURNISSEUR' | 'TAXE' | 'RIST';

export interface Ordre {
  id: string; numero: string; type: TypeOrdre; beneficiaire_tiers_id: string; coordonnee_paiement_id: string; montant: number;
  objet_type: string; objet_id: string; demande_validation_id: string; statut: string; donnees: Record<string, unknown>;
}

/** Comptabilisation propre au type d'ordre, exécutée dans la transaction d'exécution ; renvoie l'écriture générée. */
export type Execution = (q: Executant, acteur: Acteur, ordre: Ordre, tresorerie: { compteId: string; journal: string }, avisDocumentId: string) => Promise<{ ecritureId: string; libelle: string }>;
const executions = new Map<TypeOrdre, Execution>();
export function enregistrerExecution(type: TypeOrdre, f: Execution) { executions.set(type, f); }

const OPERATION = (type: TypeOrdre) => `PAIEMENT_${type}`;
const gnf = (n: number) => `${n.toLocaleString('fr-FR').replace(/ /g, ' ')} GNF`;

/** Liquidation et ordonnancement : l'ordre est créé et soumis à son circuit de validation. */
export async function ordonnerPaiement(q: Executant, acteur: Acteur, d: {
  type: TypeOrdre; beneficiaireTiersId: string; coordonneeId: string; montant: number; objet: { type: string; id: string }; donnees?: Record<string, unknown>;
}): Promise<{ ordreId: string; numero: string; demandeValidation: string }> {
  exiger(Number.isInteger(d.montant) && d.montant > 0, 'MONTANT_INVALIDE', 'Montant invalide');
  exiger(executions.has(d.type), 'TYPE_ORDRE_INCONNU', `Aucune exécution enregistrée pour les paiements de type ${d.type}`, 500);
  const c = (await q.query<{ tiers_id: string; statut: string }>('SELECT tiers_id, statut FROM coordonnee_paiement WHERE id = $1', [d.coordonneeId])).rows[0];
  exiger(c && c.tiers_id === d.beneficiaireTiersId && c.statut === 'VERIFIEE', 'COORDONNEE_INVALIDE', 'Le paiement vise des coordonnées vérifiées au nom du bénéficiaire (REF-RG-005)');
  const id = crypto.randomUUID();
  const numero = await attribuer(q, acteur, { type: 'ORDRE_PAIEMENT', annee: Number(aujourdhui().slice(0, 4)) }, { type: 'ordre_paiement', id });
  const demande = await soumettre(q, acteur, { typeOperation: OPERATION(d.type), objetType: 'ordre_paiement', objetId: id, montant: d.montant,
    donnees: { numero, type: d.type, montant: d.montant, objet: d.objet, ...(d.donnees ?? {}) } });
  await q.query(
    `INSERT INTO ordre_paiement (id, numero, type, beneficiaire_tiers_id, coordonnee_paiement_id, montant, objet_type, objet_id, demande_validation_id, statut)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ORDONNANCE')`,
    [id, numero, d.type, d.beneficiaireTiersId, d.coordonneeId, d.montant, d.objet.type, d.objet.id, demande.id]);
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'ordre_paiement', objetId: id, apres: { ...d, numero } });
  return { ordreId: id, numero, demandeValidation: demande.id };
}

for (const type of ['PRESTATAIRE', 'INDEMNITE', 'COMMISSION', 'REMBOURSEMENT_DEPOT', 'FOURNISSEUR', 'TAXE', 'RIST'] as TypeOrdre[]) {
  enregistrerOperation(OPERATION(type), {
    administrative: false,
    async appliquer(q, demande, acteur) {
      await q.query(`UPDATE ordre_paiement SET statut = 'VALIDE' WHERE id = $1`, [demande.objet_id]);
      await journaliser(q, { ...acteur.trace(), action: 'VALIDATION', objetType: 'ordre_paiement', objetId: demande.objet_id });
    },
    async rejeter(q, demande, acteur) {
      await q.query(`UPDATE ordre_paiement SET statut = 'REJETE' WHERE id = $1`, [demande.objet_id]);
      await journaliser(q, { ...acteur.trace(), action: 'REJET', objetType: 'ordre_paiement', objetId: demande.objet_id });
    },
  });
}

/** Exécution par la Trésorerie : contrôle des coordonnées, écriture du type, avis de paiement, notification. */
export async function executerOrdre(q: Executant, acteur: Acteur, ordreId: string, d: { banque: string }) {
  const o = (await q.query<Ordre & { initiateur_id: string; donnees: Record<string, unknown> }>(
    `SELECT o.*, v.initiateur_id, v.donnees FROM ordre_paiement o JOIN demande_validation v ON v.id = o.demande_validation_id WHERE o.id = $1 FOR UPDATE OF o`, [ordreId])).rows[0];
  if (!o) throw nonTrouve('Ordre de paiement');
  exiger(o.statut === 'VALIDE', 'ORDRE_NON_VALIDE', o.statut === 'EXECUTE' ? 'Ordre déjà exécuté' : 'L\'ordre n\'est exécuté qu\'après sa validation');
  // ORG-RG-042, FIN-RG-115 : l'exécutant n'a ni ordonnancé ni validé l'ordre
  const valideurs = (await q.query<{ valideur_id: string }>('SELECT valideur_id FROM validation_etape WHERE demande_validation_id = $1', [o.demande_validation_id])).rows.map(r => r.valideur_id);
  if (o.initiateur_id === acteur.utilisateurId || valideurs.includes(acteur.utilisateurId!)) throw interdit('L\'exécutant d\'un paiement n\'en est ni l\'ordonnateur ni le valideur');
  await exigerPayable(q, o.coordonnee_paiement_id, o.beneficiaire_tiers_id);
  const tresorerie = await tresorerieDe(q, 'BANQUE', d.banque);
  const montant = Number(o.montant);
  const beneficiaire = (await q.query<{ nom: string; telephone: string | null }>(`SELECT trim(nom || ' ' || COALESCE(prenoms, '')) AS nom, telephone FROM tiers WHERE id = $1`, [o.beneficiaire_tiers_id])).rows[0]!;
  const coord = (await q.query<{ etablissement: string }>('SELECT etablissement FROM coordonnee_paiement WHERE id = $1', [o.coordonnee_paiement_id])).rows[0]!;
  const execution = executions.get(o.type)!;
  const avis = await genererDocument(q, acteur, { modeleCode: 'AVIS_PAIEMENT', typeDocument: 'AVIS_PAIEMENT', objet: { type: 'ordre_paiement', id: ordreId }, variables: {
    numero: o.numero, beneficiaire: beneficiaire.nom, montant: gnf(montant), etablissement: coord.etablissement, objet: String(o.donnees?.libelle ?? o.type.toLowerCase()),
    detail: Array.isArray(o.donnees?.detail) ? o.donnees.detail : [{ libelle: 'Montant versé', montant: gnf(montant) }],
  } });
  const { ecritureId } = await execution(q, acteur, { ...o, montant }, tresorerie, avis.id);
  await q.query(`UPDATE ordre_paiement SET statut = 'EXECUTE', execute_par = $2, execute_le = now(), ecriture_id = $3, avis_document_id = $4 WHERE id = $1`, [ordreId, acteur.utilisateurId, ecritureId, avis.id]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'ordre_paiement', objetId: ordreId, apres: { statut: 'EXECUTE', banque: d.banque } });
  await publier(q, acteur, { type: 'PAIEMENT_EXECUTE', objet: { type: 'ordre_paiement', id: ordreId }, charge: { type: o.type, montant, objet: { type: o.objet_type, id: o.objet_id } }, cleIdempotence: `ordre:${ordreId}:execute` });
  if (beneficiaire.telephone) {
    await notifier(q, { tiersId: o.beneficiaire_tiers_id, code: 'PAIEMENT_EXECUTE', canal: 'SMS', adresse: beneficiaire.telephone, objet: { type: 'ordre_paiement', id: ordreId },
      variables: { numero: o.numero, montant: gnf(montant), etablissement: coord.etablissement } }).catch(() => undefined);
  }
  return { ecritureId, avisDocumentId: avis.id };
}

export async function listerOrdres(q: Executant, f: { statut?: string; type?: string }) {
  return (await q.query(
    `SELECT o.id, o.numero, o.type, o.montant, o.statut, o.objet_type, o.objet_id, o.execute_le, o.cree_le, trim(t.nom || ' ' || COALESCE(t.prenoms, '')) AS beneficiaire,
            c.etablissement, e.numero_piece
       FROM ordre_paiement o JOIN tiers t ON t.id = o.beneficiaire_tiers_id JOIN coordonnee_paiement c ON c.id = o.coordonnee_paiement_id LEFT JOIN ecriture e ON e.id = o.ecriture_id
      WHERE ($1::text IS NULL OR o.statut = $1) AND ($2::text IS NULL OR o.type = $2) ORDER BY o.cree_le DESC LIMIT 300`, [f.statut ?? null, f.type ?? null])).rows;
}

