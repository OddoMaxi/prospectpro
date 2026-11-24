/**
 * Intervenants commerciaux (CDC § 7.5.1, 7.5.7 ; COM-RG-001 à 003, 056, 060 à 066 ; DD intervenant, bureau_gestionnaire).
 *
 * - Agent général : agréé par la Direction commerciale avec le visa de la Conformité, après enregistrement du traité.
 * - Collaborateur et junior : rattachés à un agent général actif ; le junior ne prépare de souscription
 *   qu'après validation de ses contrôles de conformité (COM-RG-062).
 * - L'émission n'est activable que si toutes les conditions de COM-RG-002 sont réunies (CA-COM-01).
 * - Un bureau direct a un gestionnaire daté ; sa première affectation ouvre son compte de production (COM-RG-003).
 */
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger, nonTrouve } from '../../noyau/erreurs.js';
import { aujourdhui, dateValide } from '../../noyau/dates.js';
import { journaliser } from '../../moteurs/audit.js';
import { entier, valeurParametre } from '../../moteurs/parametres.js';
import { publier } from '../../moteurs/evenements.js';
import { enregistrerOperation, soumettre } from '../../moteurs/validation.js';
import { attribuerRole } from '../referentiels/roles.js';
import { ouvrirCompteAuxiliaire } from '../comptabilite/plan.js';
import { changerStatut } from '../habilitations/service.js';

export type RoleIntervenant = 'AGENT_GENERAL' | 'COLLABORATEUR' | 'JUNIOR' | 'PRESCRIPTEUR' | 'CANAL_DIGITAL';
export const OPERATION_AGREMENT = 'AGREMENT_INTERVENANT';

interface Intervenant {
  id: string; tiers_id: string; role: RoleIntervenant; rattachement_id: string | null; statut: string; agrement_accorde_le: string | null;
  traite_ou_contrat_document_id: string | null; controles_conformite_le: string | null; emission_activee: boolean;
}

export async function lireIntervenant(q: Executant, id: string, verrou = false): Promise<Intervenant> {
  const r = await q.query<Intervenant>(`SELECT * FROM intervenant WHERE id = $1 AND supprime_le IS NULL${verrou ? ' FOR UPDATE' : ''}`, [id]);
  if (!r.rows[0]) throw nonTrouve('Intervenant');
  return r.rows[0];
}

export async function creerIntervenant(q: Executant, acteur: Acteur, d: {
  tiersId: string; role: RoleIntervenant; rattachementId?: string; numeroInscription?: string; dateEntree?: string;
}): Promise<string> {
  const dateEntree = d.dateEntree ?? aujourdhui();
  exiger(dateValide(dateEntree), 'DATE_INVALIDE', 'Date d\'entrée invalide');
  if (d.role === 'COLLABORATEUR' || d.role === 'JUNIOR') {
    exiger(d.rattachementId, 'RATTACHEMENT_REQUIS', 'Un collaborateur ou un junior relève d\'un agent général');
    const ag = await lireIntervenant(q, d.rattachementId);
    exiger(ag.role === 'AGENT_GENERAL' && ag.statut === 'ACTIF', 'RATTACHEMENT_INVALIDE', 'L\'agent général de rattachement doit être actif');
  } else exiger(!d.rattachementId, 'RATTACHEMENT_INVALIDE', 'Seuls les collaborateurs et les juniors sont rattachés à un agent général');
  // Rôle sur la fiche tiers : contrôle de nature (REF-RG-014) et compte de commissions (REF-RG-004)
  if (d.role !== 'CANAL_DIGITAL') {
    const actif = await q.query(`SELECT 1 FROM tiers_role WHERE tiers_id = $1 AND role = $2 AND date_fin IS NULL AND supprime_le IS NULL`, [d.tiersId, d.role]);
    if (!actif.rowCount) await attribuerRole(q, acteur, { tiersId: d.tiersId, role: d.role, dateDebut: dateEntree });
  }
  // L'agent général et le prescripteur attendent leur agrément ; les autres sont actifs dès leur création
  const statut = d.role === 'AGENT_GENERAL' || d.role === 'PRESCRIPTEUR' ? 'EN_AGREMENT' : 'ACTIF';
  const r = await q.query<{ id: string }>(
    `INSERT INTO intervenant (tiers_id, role, rattachement_id, statut, numero_inscription, emission_activee, date_entree) VALUES ($1,$2,$3,$4,$5,false,$6) RETURNING id`,
    [d.tiersId, d.role, d.rattachementId ?? null, statut, d.numeroInscription ?? null, dateEntree])
    .catch(e => { if (e.code === '23505') throw new ErreurMetier('INTERVENANT_EXISTANT', 'Cette personne est déjà intervenant en activité avec ce rôle', 409); throw e; });
  const id = r.rows[0]!.id;
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'intervenant', objetId: id, apres: { ...d, statut } });
  if (statut === 'ACTIF') await publier(q, acteur, { type: 'INTERVENANT_ACTIVE', objet: { type: 'intervenant', id }, charge: { role: d.role }, cleIdempotence: `intervenant:${id}:active` });
  return id;
}

/** Traité de nomination (agent général) ou contrat écrit (prescripteur), déposé en pièce. */
export async function enregistrerTraite(q: Executant, acteur: Acteur, intervenantId: string, documentId: string) {
  const doc = await q.query(`SELECT 1 FROM document WHERE id = $1 AND supprime_le IS NULL`, [documentId]);
  exiger(doc.rowCount, 'DOCUMENT_INCONNU', 'Document introuvable');
  await q.query('UPDATE intervenant SET traite_ou_contrat_document_id = $2 WHERE id = $1', [intervenantId, documentId]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'intervenant', objetId: intervenantId, apres: { traite: documentId } });
}

/** COM-RG-060 : agrément proposé par la Direction commerciale, visé par la Conformité (circuit AGREMENT_INTERVENANT). */
export async function proposerAgrement(q: Executant, acteur: Acteur, intervenantId: string) {
  const i = await lireIntervenant(q, intervenantId);
  exiger(i.statut === 'EN_AGREMENT', 'STATUT_INVALIDE', 'Intervenant déjà agréé ou sorti');
  exiger(i.traite_ou_contrat_document_id, 'TRAITE_REQUIS', 'Le traité de nomination (ou le contrat écrit) doit être enregistré avant l\'agrément');
  return soumettre(q, acteur, { typeOperation: OPERATION_AGREMENT, objetType: 'intervenant', objetId: intervenantId, donnees: { role: i.role } });
}

enregistrerOperation(OPERATION_AGREMENT, {
  administrative: false,
  async appliquer(q, demande, acteur) {
    // Le dernier niveau est celui de la Conformité : son visa est enregistré
    await q.query(`UPDATE intervenant SET statut = 'ACTIF', agrement_accorde_le = current_date, visa_conformite_id = $2 WHERE id = $1`, [demande.objet_id, acteur.utilisateurId]);
    await journaliser(q, { ...acteur.trace(), action: 'VALIDATION', objetType: 'intervenant', objetId: demande.objet_id, apres: { agrement: true } });
    await publier(q, acteur, { type: 'INTERVENANT_ACTIVE', objet: { type: 'intervenant', id: demande.objet_id }, charge: {}, cleIdempotence: `intervenant:${demande.objet_id}:active` });
  },
});

/** COM-RG-062 : contrôles de conformité d'un junior validés ; la préparation de souscriptions lui est ouverte. */
export async function validerControlesJunior(q: Executant, acteur: Acteur, intervenantId: string) {
  const i = await lireIntervenant(q, intervenantId, true);
  exiger(i.role === 'JUNIOR' && i.statut === 'ACTIF', 'STATUT_INVALIDE', 'Seul un junior actif a des contrôles de conformité à valider');
  await q.query('UPDATE intervenant SET controles_conformite_le = current_date WHERE id = $1', [intervenantId]);
  await journaliser(q, { ...acteur.trace(), action: 'VALIDATION', objetType: 'intervenant', objetId: intervenantId, apres: { controles_conformite: true } });
}

/** Bureaux directs actifs gérés par un agent général. */
async function bureauxGeres(q: Executant, intervenantId: string) {
  return (await q.query<{ id: string; code: string }>(
    `SELECT b.id, b.code FROM bureau_gestionnaire g JOIN bureau b ON b.id = g.bureau_id
      WHERE g.intervenant_id = $1 AND g.date_fin IS NULL AND g.supprime_le IS NULL AND b.statut = 'ACTIF' AND b.type = 'BUREAU_DIRECT'`, [intervenantId])).rows;
}

/** Conditions de COM-RG-002 manquantes pour activer l'émission (vide : activable). */
export async function conditionsEmission(q: Executant, intervenantId: string): Promise<string[]> {
  const i = await lireIntervenant(q, intervenantId);
  const manques: string[] = [];
  if (i.role !== 'AGENT_GENERAL') return ['Seul un agent général émet'];
  if (i.statut !== 'ACTIF') manques.push('Statut ACTIF');
  if (!i.agrement_accorde_le) manques.push('Agrément interne de la Compagnie');
  if (!i.traite_ou_contrat_document_id) manques.push('Traité de nomination enregistré');
  if (!(await bureauxGeres(q, intervenantId)).length) manques.push('Gestion d\'un bureau direct actif');
  const habilite = await q.query(`SELECT 1 FROM bareme_commission WHERE role = 'AGENT_GENERAL' AND supprime_le IS NULL AND date_effet <= current_date LIMIT 1`);
  if (!habilite.rowCount) manques.push('Habilitation à au moins un produit (barème de commission)');
  return manques;
}

/** COM-RG-002, CA-COM-01 : activation de l'émission, refusée tant qu'une condition manque. */
export async function activerEmission(q: Executant, acteur: Acteur, intervenantId: string) {
  const manques = await conditionsEmission(q, intervenantId);
  if (manques.length) throw new ErreurMetier('EMISSION_NON_ACTIVABLE', `Émission non activable : ${manques.join(', ')}`, 422, { manques });
  await q.query('UPDATE intervenant SET emission_activee = true WHERE id = $1', [intervenantId]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'intervenant', objetId: intervenantId, apres: { emission_activee: true } });
}

/**
 * COM-RG-001, 003 : affecte un bureau direct à un agent général à une date ; le bureau reçoit son compte de production
 * à sa première affectation. Un changement de gestionnaire exige un compte de production soldé (restitué).
 */
export async function affecterBureau(q: Executant, acteur: Acteur, d: { bureauId: string; intervenantId: string; dateDebut?: string }) {
  const dateDebut = d.dateDebut ?? aujourdhui();
  const b = (await q.query<{ code: string; type: string; statut: string }>('SELECT code, type, statut FROM bureau WHERE id = $1 FOR UPDATE', [d.bureauId])).rows[0];
  if (!b) throw nonTrouve('Bureau');
  exiger(b.type === 'BUREAU_DIRECT' && b.statut === 'ACTIF', 'BUREAU_INVALIDE', 'Seul un bureau direct actif est géré par un agent général');
  const ag = await lireIntervenant(q, d.intervenantId);
  exiger(ag.role === 'AGENT_GENERAL' && ag.statut === 'ACTIF', 'AGENT_INVALIDE', 'Le gestionnaire d\'un bureau direct est un agent général actif');
  const actuel = (await q.query<{ id: string; intervenant_id: string }>(
    'SELECT id, intervenant_id FROM bureau_gestionnaire WHERE bureau_id = $1 AND date_fin IS NULL AND supprime_le IS NULL', [d.bureauId])).rows[0];
  if (actuel?.intervenant_id === d.intervenantId) throw new ErreurMetier('DEJA_GESTIONNAIRE', 'Cet agent gère déjà ce bureau', 409);
  const cp = (await q.query<{ id: string; solde: number; intervenant_id: string }>('SELECT id, solde, intervenant_id FROM compte_production_agent WHERE bureau_id = $1 FOR UPDATE', [d.bureauId])).rows[0];
  if (actuel) {
    exiger(!cp || Number(cp.solde) === 0, 'COMPTE_PRODUCTION_NON_SOLDE', 'Le compte de production du bureau doit être restitué avant le changement de gestionnaire (COM-RG-050)');
    await q.query('UPDATE bureau_gestionnaire SET date_fin = $2 WHERE id = $1', [actuel.id, dateDebut]);
  }
  await q.query('INSERT INTO bureau_gestionnaire (bureau_id, intervenant_id, date_debut) VALUES ($1,$2,$3)', [d.bureauId, d.intervenantId, dateDebut]);
  // Compte de production du bureau (auxiliaire propre au bureau sous le collectif des comptes de production)
  const collectif = await valeurParametre(q, 'COLLECTIF_COMPTE_PRODUCTION');
  const aux = await ouvrirCompteAuxiliaire(q, acteur, ag.tiers_id, collectif, { nouveau: true });
  if (!cp) {
    await q.query(`INSERT INTO compte_production_agent (bureau_id, intervenant_id, compte_auxiliaire_id, montant_minimum, statut, solde) VALUES ($1,$2,$3,$4,'ACTIF',0)`,
      [d.bureauId, d.intervenantId, aux.id, await entier(q, 'COM_APPRO_MINIMUM')]);
  } else {
    await q.query(`UPDATE compte_production_agent SET intervenant_id = $2, compte_auxiliaire_id = $3, statut = 'ACTIF', motif_gel = NULL WHERE id = $1`, [cp.id, d.intervenantId, aux.id]);
  }
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'bureau', objetId: d.bureauId, apres: { gestionnaire: d.intervenantId, dateDebut, compteProduction: aux.code } });
}

/** COM-RG-056, 065 : suspension (compte de production gelé, solde conservé) ou sortie (comptes d'accès désactivés). */
export async function changerStatutIntervenant(q: Executant, acteur: Acteur, intervenantId: string, statut: 'SUSPENDU' | 'SORTI' | 'ACTIF', motif: string) {
  exiger(motif?.trim(), 'MOTIF_REQUIS', 'Motif obligatoire');
  const i = await lireIntervenant(q, intervenantId, true);
  exiger(i.statut !== 'SORTI', 'INTERVENANT_SORTI', 'Intervenant déjà sorti');
  if (statut === 'ACTIF') exiger(i.statut === 'SUSPENDU', 'STATUT_INVALIDE', 'Seul un intervenant suspendu est réactivé');
  await q.query(`UPDATE intervenant SET statut = $2::varchar, date_sortie = CASE WHEN $2::varchar = 'SORTI' THEN current_date END,
                   motif_sortie = CASE WHEN $2::varchar = 'SORTI' THEN $3::varchar END,
                   emission_activee = CASE WHEN $2::varchar = 'ACTIF' THEN emission_activee ELSE false END WHERE id = $1`, [intervenantId, statut, motif]);
  if (statut === 'SUSPENDU' || statut === 'SORTI') {
    await q.query(`UPDATE compte_production_agent SET statut = 'GELE', motif_gel = COALESCE(motif_gel, 'SUSPENSION') WHERE intervenant_id = $1 AND statut = 'ACTIF'`, [intervenantId]);
  } else {
    await q.query(`UPDATE compte_production_agent SET statut = 'ACTIF', motif_gel = NULL WHERE intervenant_id = $1 AND statut = 'GELE' AND motif_gel = 'SUSPENSION'`, [intervenantId]);
  }
  // Comptes d'accès de la personne : suspendus ou désactivés avec elle (CA-COM-16)
  const comptes = await q.query<{ id: string }>(`SELECT id FROM utilisateur WHERE tiers_id = $1 AND statut IN ('ACTIF', 'A_VALIDER', 'SUSPENDU') AND supprime_le IS NULL`, [i.tiers_id]);
  for (const c of comptes.rows) {
    await changerStatut(q, acteur, c.id, statut === 'SORTI' ? 'DESACTIVE' : statut === 'SUSPENDU' ? 'SUSPENDU' : 'ACTIF', `Intervenant ${statut.toLowerCase()} : ${motif}`);
  }
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'intervenant', objetId: intervenantId, avant: { statut: i.statut }, apres: { statut, motif } });
  if (statut === 'SORTI') await publier(q, acteur, { type: 'INTERVENANT_SORTI', objet: { type: 'intervenant', id: intervenantId }, charge: { motif }, cleIdempotence: `intervenant:${intervenantId}:sorti` });
}

export async function listerIntervenants(q: Executant, f: { role?: string; statut?: string; rattachementId?: string }) {
  return (await q.query(
    `SELECT i.id, i.role, i.statut, i.agrement_accorde_le, i.emission_activee, i.date_entree, i.date_sortie, i.numero_inscription,
            i.traite_ou_contrat_document_id IS NOT NULL AS traite, i.controles_conformite_le, t.id AS tiers_id, t.code_tiers, t.nom, t.prenoms,
            ra.id AS rattachement_id, trim(rt.nom || ' ' || COALESCE(rt.prenoms, '')) AS rattachement,
            COALESCE((SELECT json_agg(b.code ORDER BY b.code) FROM bureau_gestionnaire g JOIN bureau b ON b.id = g.bureau_id
                       WHERE g.intervenant_id = i.id AND g.date_fin IS NULL AND g.supprime_le IS NULL), '[]') AS bureaux
       FROM intervenant i JOIN tiers t ON t.id = i.tiers_id LEFT JOIN intervenant ra ON ra.id = i.rattachement_id LEFT JOIN tiers rt ON rt.id = ra.tiers_id
      WHERE i.supprime_le IS NULL AND ($1::text IS NULL OR i.role = $1) AND ($2::text IS NULL OR i.statut = $2) AND ($3::uuid IS NULL OR i.rattachement_id = $3)
      ORDER BY i.role, t.nom`, [f.role ?? null, f.statut ?? null, f.rattachementId ?? null])).rows;
}
