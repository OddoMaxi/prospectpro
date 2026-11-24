/**
 * Moteur de validation (CDC § 3.6 ; ORG-RG-041 à 044 ; DD 4.11, 4.24, 4.25).
 *
 * - Niveaux requis : référentiel des délégations (type d'opération, seuils de montant, date d'effet).
 * - Séparation des tâches : l'initiateur ne valide jamais ; un même valideur ne valide pas deux niveaux.
 * - Le valideur doit détenir, directement ou par intérim, le profil désigné pour le niveau.
 * - L'Administrateur général ne valide aucune opération métier ou financière (CA-ORG-05).
 * - L'opération proposée (donnees) n'est appliquée qu'à la décision du dernier niveau, dans la même transaction.
 */
import type { Executant } from '../db/pool.js';
import type { Acteur } from '../noyau/acteur.js';
import { ErreurMetier, exiger, interdit, nonTrouve } from '../noyau/erreurs.js';
import { PROFIL_ADMIN } from '../modules/habilitations/droits.js';
import { journaliser } from './audit.js';

export interface Demande {
  id: string; type_operation: string; objet_type: string; objet_id: string; montant: number | null;
  initiateur_id: string; niveaux_requis: number; statut: string; donnees: Record<string, unknown> | null;
}

export interface Operation {
  /** Opération d'administration du système (organisation, comptes, profils) : seule catégorie que l'administrateur peut valider. */
  administrative: boolean;
  /** Contrôles propres au valideur (ex. ne pas valider sa propre attribution de profil). */
  controlerValideur?: (q: Executant, demande: Demande, valideurId: string) => Promise<void>;
  /** Application de l'opération après la dernière validation. */
  appliquer: (q: Executant, demande: Demande, acteur: Acteur) => Promise<void>;
  /** Effet d'un rejet (facultatif). */
  rejeter?: (q: Executant, demande: Demande, acteur: Acteur) => Promise<void>;
}

const operations = new Map<string, Operation>();

export function enregistrerOperation(type: string, op: Operation): void {
  operations.set(type, op);
}

function operation(type: string): Operation {
  const op = operations.get(type);
  if (!op) throw new ErreurMetier('OPERATION_INCONNUE', `Type d'opération ${type} non enregistré`, 500);
  return op;
}

/** Niveaux de délégation en vigueur pour un type d'opération : niveau → profils habilités. */
async function niveauxEnVigueur(q: Executant, type: string, montant: number | null) {
  const r = await q.query<{ niveau: number; profil_id: string; seuil_min: number | null }>(
    `SELECT niveau, profil_id, seuil_min FROM delegation_validation
      WHERE type_operation = $1 AND supprime_le IS NULL
        AND date_effet = (SELECT max(date_effet) FROM delegation_validation
                           WHERE type_operation = $1 AND supprime_le IS NULL AND date_effet <= current_date)`, [type]);
  const parNiveau = new Map<number, string[]>();
  for (const l of r.rows) {
    if (l.seuil_min !== null && (montant ?? 0) < l.seuil_min) continue;
    parNiveau.set(l.niveau, [...(parNiveau.get(l.niveau) ?? []), l.profil_id]);
  }
  return parNiveau;
}

export async function soumettre(
  q: Executant, acteur: Acteur,
  d: { typeOperation: string; objetType: string; objetId: string; montant?: number | null; donnees?: Record<string, unknown> },
): Promise<Demande> {
  operation(d.typeOperation);
  exiger(acteur.utilisateurId, 'INITIATEUR_REQUIS', 'Une demande de validation a toujours un initiateur identifié');
  const niveaux = await niveauxEnVigueur(q, d.typeOperation, d.montant ?? null);
  exiger(niveaux.size > 0, 'DELEGATION_ABSENTE', `Aucun circuit de validation paramétré pour ${d.typeOperation}`, 500);
  const r = await q.query<Demande>(
    `INSERT INTO demande_validation (type_operation, objet_type, objet_id, montant, initiateur_id, niveaux_requis, statut, donnees)
     VALUES ($1,$2,$3,$4,$5,$6,'EN_ATTENTE',$7) RETURNING *`,
    [d.typeOperation, d.objetType, d.objetId, d.montant ?? null, acteur.utilisateurId, niveaux.size, d.donnees ? JSON.stringify(d.donnees) : null]);
  const demande = r.rows[0]!;
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'demande_validation', objetId: demande.id, apres: d });
  return demande;
}

/** Profils du valideur pouvant servir à ce niveau, directement ou par un intérim en cours. */
async function habilitationNiveau(q: Executant, valideurId: string, profilsHabilites: string[]) {
  const direct = await q.query(
    `SELECT 1 FROM utilisateur_profil up JOIN profil p ON p.id = up.profil_id
      WHERE up.utilisateur_id = $1 AND up.profil_id = ANY($2) AND up.supprime_le IS NULL
        AND up.date_debut <= current_date AND (up.date_fin IS NULL OR up.date_fin >= current_date)
        AND (NOT p.privilegie OR up.valide_par IS NOT NULL)`, [valideurId, profilsHabilites]);
  if (direct.rowCount) return { interimId: null as string | null };
  const parInterim = await q.query<{ id: string }>(
    `SELECT i.id FROM interim i
       JOIN utilisateur_profil up ON up.utilisateur_id = i.delegant_id AND up.profil_id = ANY($2) AND up.supprime_le IS NULL
            AND up.date_debut <= current_date AND (up.date_fin IS NULL OR up.date_fin >= current_date)
      WHERE i.delegataire_id = $1 AND i.supprime_le IS NULL AND i.date_debut <= now() AND i.date_fin > now()
      LIMIT 1`, [valideurId, profilsHabilites]);
  if (parInterim.rows[0]) return { interimId: parInterim.rows[0].id };
  return null;
}

export async function decider(
  q: Executant, acteur: Acteur, demandeId: string, decision: 'VALIDE' | 'REJETE', motif?: string,
): Promise<Demande> {
  const valideurId = acteur.utilisateurId;
  exiger(valideurId, 'VALIDEUR_REQUIS', 'Valideur non identifié', 401);
  const r = await q.query<Demande>('SELECT * FROM demande_validation WHERE id = $1 FOR UPDATE', [demandeId]);
  const demande = r.rows[0];
  if (!demande) throw nonTrouve('Demande de validation');
  exiger(demande.statut === 'EN_ATTENTE', 'DEMANDE_CLOSE', 'Cette demande a déjà été tranchée');
  const op = operation(demande.type_operation);

  // Séparation des tâches (ORG-RG-042 ; I-14)
  if (demande.initiateur_id === valideurId) throw interdit('Vous ne pouvez pas valider une opération que vous avez initiée');
  const etapes = await q.query<{ niveau: number; valideur_id: string }>(
    'SELECT niveau, valideur_id FROM validation_etape WHERE demande_validation_id = $1 ORDER BY niveau', [demandeId]);
  if (etapes.rows.some(e => e.valideur_id === valideurId)) throw interdit('Vous avez déjà validé un niveau de cette opération');

  // L'Administrateur général ne valide aucune opération métier ou financière (ORG-RG-044)
  if (!op.administrative) {
    const admin = await q.query(
      `SELECT 1 FROM utilisateur_profil up JOIN profil p ON p.id = up.profil_id
        WHERE up.utilisateur_id = $1 AND p.code = $2 AND up.supprime_le IS NULL
          AND up.date_debut <= current_date AND (up.date_fin IS NULL OR up.date_fin >= current_date)`, [valideurId, PROFIL_ADMIN]);
    if (admin.rowCount) throw interdit("L'Administrateur général ne valide aucune opération métier ou financière");
  }

  const niveau = etapes.rows.length + 1;
  const niveaux = await niveauxEnVigueur(q, demande.type_operation, demande.montant);
  const profils = [...niveaux.entries()].sort((a, b) => a[0] - b[0])[niveau - 1]?.[1];
  exiger(profils, 'NIVEAU_INCONNU', `Niveau ${niveau} non paramétré pour ${demande.type_operation}`, 500);
  const hab = await habilitationNiveau(q, valideurId, profils);
  if (!hab) throw interdit(`Vous n'êtes pas habilité à valider le niveau ${niveau} de cette opération`);
  await op.controlerValideur?.(q, demande, valideurId);

  if (decision === 'REJETE') exiger(motif?.trim(), 'MOTIF_REQUIS', 'Le motif est obligatoire en cas de rejet');
  await q.query(
    `INSERT INTO validation_etape (demande_validation_id, niveau, valideur_id, decision, motif, interim_id, decide_le)
     VALUES ($1,$2,$3,$4,$5,$6,now())`, [demandeId, niveau, valideurId, decision, motif ?? null, hab.interimId]);

  let statut = demande.statut;
  if (decision === 'REJETE') statut = 'REJETE';
  else if (niveau >= demande.niveaux_requis) statut = 'VALIDE';
  if (statut !== demande.statut) {
    await q.query('UPDATE demande_validation SET statut = $2, decide_le = now() WHERE id = $1', [demandeId, statut]);
  }
  const maj = { ...demande, statut };
  await journaliser(q, {
    ...acteur.trace(), action: decision === 'VALIDE' ? 'VALIDATION' : 'REJET', objetType: 'demande_validation', objetId: demandeId,
    apres: { niveau, decision, motif: motif ?? null, type_operation: demande.type_operation, interim_id: hab.interimId },
  });
  if (statut === 'VALIDE') await op.appliquer(q, maj, acteur);
  if (statut === 'REJETE') await op.rejeter?.(q, maj, acteur);
  return maj;
}

/** Corbeille de travail : demandes en attente que l'utilisateur peut trancher au niveau courant. */
export async function corbeille(q: Executant, utilisateurId: string): Promise<Demande[]> {
  const r = await q.query<Demande>(
    `SELECT * FROM demande_validation WHERE statut = 'EN_ATTENTE' AND initiateur_id <> $1 ORDER BY cree_le`, [utilisateurId]);
  const res: Demande[] = [];
  for (const d of r.rows) {
    const etapes = await q.query<{ valideur_id: string }>('SELECT valideur_id FROM validation_etape WHERE demande_validation_id=$1', [d.id]);
    if (etapes.rows.some(e => e.valideur_id === utilisateurId)) continue;
    const niveaux = await niveauxEnVigueur(q, d.type_operation, d.montant);
    const profils = [...niveaux.entries()].sort((a, b) => a[0] - b[0])[etapes.rows.length]?.[1];
    if (profils && await habilitationNiveau(q, utilisateurId, profils)) res.push(d);
  }
  return res;
}
