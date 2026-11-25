/**
 * Utilisateurs, profils, délégations et intérims (CDC § 4.4 et 4.5 ; ORG-RG-020 à 023, 040 à 046 ; DD 4.5 à 4.12).
 */
import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger, interdit, nonTrouve } from '../../noyau/erreurs.js';
import { journaliser } from '../../moteurs/audit.js';
import { entier } from '../../moteurs/parametres.js';
import { enregistrerOperation, soumettre, type Demande } from '../../moteurs/validation.js';
import { PROFIL_ADMIN, type Perimetre } from './droits.js';

export const OPERATION_PROFIL_PRIVILEGIE = 'ATTRIBUTION_PROFIL_PRIVILEGIE';

export type TypeCompte = 'INTERNE' | 'AGENT_GENERAL' | 'COLLABORATEUR' | 'JUNIOR' | 'PRESCRIPTEUR' | 'ADMIN_PRESTATAIRE'
  | 'PROFESSIONNEL_SANTE' | 'ASSURE' | 'REPRESENTANT_ENTREPRISE' | 'RESPONSABLE_GROUPEMENT' | 'DECLARANT';

/** ORG-RG-022 : double authentification obligatoire pour le back-office, les portails prestataires et l'application agent. */
export function doubleFacteurObligatoire(type: TypeCompte): boolean {
  return !['ASSURE', 'REPRESENTANT_ENTREPRISE', 'RESPONSABLE_GROUPEMENT', 'DECLARANT'].includes(type);
}

/** Politique de mot de passe (paramétrable, ORG-RG-022). */
export async function controlerMotDePasse(q: Executant, mdp: string): Promise<void> {
  const min = await entier(q, 'SECURITE_MDP_LONGUEUR_MIN');
  exiger(mdp.length >= min, 'MOT_DE_PASSE_FAIBLE', `Mot de passe : ${min} caractères au moins`);
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(r => r.test(mdp)).length;
  exiger(classes >= 3, 'MOT_DE_PASSE_FAIBLE', 'Mot de passe : au moins trois types de caractères parmi minuscules, majuscules, chiffres et symboles');
}

export const empreinteMotDePasse = (mdp: string) => argon2.hash(mdp, { type: argon2.argon2id });

export async function creerUtilisateur(q: Executant, acteur: Acteur, d: {
  identifiant: string; tiersId: string; typeCompte: TypeCompte; fonctionId?: string; intervenantId?: string; prestataireId?: string;
  motDePasse: string; telephone?: string;
}): Promise<string> {
  exiger(/^[a-z0-9._@-]{3,80}$/.test(d.identifiant), 'IDENTIFIANT_INVALIDE', 'Identifiant : 3 à 80 caractères (minuscules, chiffres, . _ @ -)');
  const t = await q.query<{ nature: string }>('SELECT nature FROM tiers WHERE id = $1 AND supprime_le IS NULL', [d.tiersId]);
  exiger(t.rows[0], 'TIERS_INCONNU', 'Fiche tiers introuvable');
  exiger(t.rows[0].nature === 'PHYSIQUE', 'COMPTE_NOMINATIF', 'Un compte est toujours nominatif : il est rattaché à une personne physique');
  if (d.typeCompte === 'INTERNE') exiger(d.fonctionId, 'FONCTION_REQUISE', 'Un utilisateur interne est rattaché à une fonction (ORG-RG-020)');
  await controlerMotDePasse(q, d.motDePasse);
  const existe = await q.query('SELECT 1 FROM utilisateur WHERE identifiant = $1', [d.identifiant]);
  exiger(!existe.rowCount, 'IDENTIFIANT_PRIS', 'Identifiant déjà utilisé');
  // Comptes du réseau commercial : validés par la Direction commerciale ou par l'agent général (ORG-RG-021)
  const statut = ['AGENT_GENERAL', 'PRESCRIPTEUR', 'COLLABORATEUR', 'JUNIOR'].includes(d.typeCompte) ? 'A_VALIDER' : 'ACTIF';
  const id = randomUUID();
  await q.query(
    `INSERT INTO utilisateur (id, identifiant, tiers_id, fonction_id, type_compte, prestataire_id, intervenant_id, mot_de_passe_hash,
                              double_facteur, telephone_verifie, echecs_connexion, statut, cree_par_admin_id)
     VALUES ($12::uuid,$1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,COALESCE($11::uuid, $12::uuid))`,
    [d.identifiant, d.tiersId, d.fonctionId ?? null, d.typeCompte, d.prestataireId ?? null, d.intervenantId ?? null,
      await empreinteMotDePasse(d.motDePasse), doubleFacteurObligatoire(d.typeCompte), d.telephone ?? null, statut, acteur.utilisateurId, id]);
  // À l'installation, le premier administrateur est son propre auteur (écart X8).
  // Profil par défaut de la fonction (ORG-RG-008), proposé et attribué s'il n'est pas privilégié
  if (d.fonctionId && acteur.utilisateurId) {
    const f = await q.query<{ profil_defaut_id: string | null; privilegie: boolean | null }>(
      'SELECT f.profil_defaut_id, p.privilegie FROM fonction f LEFT JOIN profil p ON p.id = f.profil_defaut_id WHERE f.id = $1', [d.fonctionId]);
    if (f.rows[0]?.profil_defaut_id && f.rows[0].privilegie === false) {
      await attribuerProfil(q, acteur, { utilisateurId: id, profilId: f.rows[0].profil_defaut_id });
    }
  }
  // Comptes du réseau commercial : profil de même nom que le type de compte (annexe B) ; s'il est privilégié (agent général),
  // l'attribution part en validation (ADMIN_GENERAL ou DIRECTION_GENERALE), comme toute attribution de profil privilégié
  if (['AGENT_GENERAL', 'COLLABORATEUR', 'JUNIOR', 'PRESCRIPTEUR'].includes(d.typeCompte) && acteur.utilisateurId) {
    const p = (await q.query<{ id: string }>('SELECT id FROM profil WHERE code = $1 AND supprime_le IS NULL', [d.typeCompte])).rows[0];
    if (p) await attribuerProfil(q, acteur, { utilisateurId: id, profilId: p.id });
  }
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'utilisateur', objetId: id, apres: { ...d, motDePasse: undefined, statut } });
  return id;
}

/** ORG-RG-023 : un compte n'est jamais supprimé ; il est suspendu ou désactivé. */
export async function changerStatut(q: Executant, acteur: Acteur, utilisateurId: string, statut: 'ACTIF' | 'SUSPENDU' | 'DESACTIVE', motif: string) {
  exiger(acteur.utilisateurId !== utilisateurId, 'AUTO_MODIFICATION', 'Vous ne pouvez pas modifier votre propre compte');
  exiger(motif?.trim(), 'MOTIF_REQUIS', 'Motif obligatoire');
  const u = await q.query<{ statut: string }>('SELECT statut FROM utilisateur WHERE id = $1', [utilisateurId]);
  if (!u.rows[0]) throw nonTrouve('Utilisateur');
  await q.query(
    `UPDATE utilisateur SET statut = $2::varchar, echecs_connexion = CASE WHEN $2::varchar = 'ACTIF' THEN 0 ELSE echecs_connexion END,
            valide_par = CASE WHEN statut = 'A_VALIDER' AND $2::varchar = 'ACTIF' THEN $3::uuid ELSE valide_par END WHERE id = $1`,
    [utilisateurId, statut, acteur.utilisateurId]);
  if (statut !== 'ACTIF') await q.query('UPDATE session_utilisateur SET revoquee_le = now() WHERE utilisateur_id = $1 AND revoquee_le IS NULL', [utilisateurId]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'utilisateur', objetId: utilisateurId, avant: { statut: u.rows[0].statut }, apres: { statut, motif } });
}

// ---------------------------------------------------------------- Profils

async function profil(q: Executant, id: string) {
  const r = await q.query<{ id: string; code: string; libelle: string; privilegie: boolean; externe: boolean }>('SELECT id, code, libelle, privilegie, externe FROM profil WHERE id = $1 AND supprime_le IS NULL', [id]);
  if (!r.rows[0]) throw nonTrouve('Profil');
  return r.rows[0];
}

/** Incompatibilités (ORG-RG-042, CA-ORG-04) avec les profils déjà détenus ou en attente de validation. */
async function controlerIncompatibilites(q: Executant, utilisateurId: string, profilId: string) {
  const r = await q.query<{ code: string; motif: string }>(
    `SELECT p.code, i.motif FROM utilisateur_profil up
       JOIN incompatibilite_profil i ON i.supprime_le IS NULL
            AND ((i.profil_a_id = up.profil_id AND i.profil_b_id = $2) OR (i.profil_b_id = up.profil_id AND i.profil_a_id = $2))
       JOIN profil p ON p.id = up.profil_id
      WHERE up.utilisateur_id = $1 AND up.supprime_le IS NULL AND (up.date_fin IS NULL OR up.date_fin >= current_date)`, [utilisateurId, profilId]);
  if (r.rows[0]) throw new ErreurMetier('PROFILS_INCOMPATIBLES', `Attribution refusée : profil incompatible avec ${r.rows[0].code} (${r.rows[0].motif})`, 422);
}

/**
 * Attribution d'un profil (ORG-RG-040, 044) : jamais à soi-même ; incompatibilités contrôlées ;
 * un profil privilégié n'est actif qu'après la validation d'un second administrateur.
 */
export async function attribuerProfil(q: Executant, acteur: Acteur, d: {
  utilisateurId: string; profilId: string; perimetre?: Perimetre | null; dateDebut?: string; dateFin?: string;
}) {
  if (acteur.utilisateurId === d.utilisateurId) throw interdit('Aucun utilisateur ne peut s\'attribuer un profil ni modifier ses propres droits');
  const p = await profil(q, d.profilId);
  const dateDebut = d.dateDebut ?? new Date().toISOString().slice(0, 10);
  exiger(!d.dateFin || d.dateFin >= dateDebut, 'PERIODE_INVALIDE', 'La fin précède le début');
  const deja = await q.query(
    `SELECT 1 FROM utilisateur_profil WHERE utilisateur_id = $1 AND profil_id = $2 AND supprime_le IS NULL AND (date_fin IS NULL OR date_fin >= current_date)`,
    [d.utilisateurId, d.profilId]);
  exiger(!deja.rowCount, 'PROFIL_DEJA_ATTRIBUE', 'Profil déjà attribué');
  await controlerIncompatibilites(q, d.utilisateurId, d.profilId);
  const r = await q.query<{ id: string }>(
    `INSERT INTO utilisateur_profil (utilisateur_id, profil_id, perimetre, date_debut, date_fin, attribue_par)
     VALUES ($1::uuid,$2,$3,$4,$5,COALESCE($6::uuid, $1::uuid)) RETURNING id`,
    [d.utilisateurId, d.profilId, d.perimetre ? JSON.stringify(d.perimetre) : null, dateDebut, d.dateFin ?? null, acteur.utilisateurId]);
  const id = r.rows[0]!.id;
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'utilisateur_profil', objetId: id, apres: { ...d, profil: p.code } });
  if (p.privilegie && acteur.utilisateurId) {
    const demande = await soumettre(q, acteur, { typeOperation: OPERATION_PROFIL_PRIVILEGIE, objetType: 'utilisateur_profil', objetId: id, donnees: {
      utilisateurId: d.utilisateurId, profil: p.code, profilLibelle: p.libelle, perimetre: d.perimetre ?? null,
      identifiant: (await q.query<{ identifiant: string }>('SELECT identifiant FROM utilisateur WHERE id = $1', [d.utilisateurId])).rows[0]?.identifiant,
    } });
    return { id, demandeValidation: demande.id };
  }
  if (p.privilegie) await q.query('UPDATE utilisateur_profil SET valide_par = attribue_par WHERE id = $1', [id]); // installation
  return { id, demandeValidation: null };
}

enregistrerOperation(OPERATION_PROFIL_PRIVILEGIE, {
  administrative: true,
  async controlerValideur(q, demande, valideurId) {
    const { utilisateurId } = demande.donnees as { utilisateurId: string };
    if (valideurId === utilisateurId) throw interdit('Vous ne pouvez pas valider l\'attribution d\'un profil qui vous est destiné');
  },
  async appliquer(q, demande: Demande, acteur) {
    await q.query('UPDATE utilisateur_profil SET valide_par = $2 WHERE id = $1', [demande.objet_id, acteur.utilisateurId]);
  },
  async rejeter(q, demande: Demande) {
    await q.query('UPDATE utilisateur_profil SET supprime_le = now(), date_fin = current_date WHERE id = $1', [demande.objet_id]);
  },
});

export async function retirerProfil(q: Executant, acteur: Acteur, utilisateurProfilId: string, motif: string) {
  const r = await q.query<{ utilisateur_id: string }>('SELECT utilisateur_id FROM utilisateur_profil WHERE id = $1 AND supprime_le IS NULL', [utilisateurProfilId]);
  if (!r.rows[0]) throw nonTrouve('Attribution de profil');
  if (r.rows[0].utilisateur_id === acteur.utilisateurId) throw interdit('Vous ne pouvez pas modifier vos propres droits');
  await q.query(`UPDATE utilisateur_profil SET date_fin = current_date - 1, supprime_le = now() WHERE id = $1`, [utilisateurProfilId]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'utilisateur_profil', objetId: utilisateurProfilId, apres: { retire: true, motif } });
}

/** Déclaration d'une incompatibilité ; refusée si des utilisateurs cumulent déjà les deux profils. */
export async function declarerIncompatibilite(q: Executant, acteur: Acteur, a: string, b: string, motif: string) {
  exiger(a !== b, 'INCOMPATIBILITE_INVALIDE', 'Deux profils distincts attendus');
  const cumul = await q.query(
    `SELECT 1 FROM utilisateur_profil x JOIN utilisateur_profil y ON y.utilisateur_id = x.utilisateur_id
      WHERE x.profil_id = $1 AND y.profil_id = $2 AND x.supprime_le IS NULL AND y.supprime_le IS NULL
        AND (x.date_fin IS NULL OR x.date_fin >= current_date) AND (y.date_fin IS NULL OR y.date_fin >= current_date)`, [a, b]);
  exiger(!cumul.rowCount, 'CUMUL_EXISTANT', 'Des utilisateurs détiennent déjà ces deux profils : retirez d\'abord l\'un d\'eux');
  const [pa, pb] = a < b ? [a, b] : [b, a];
  await q.query('INSERT INTO incompatibilite_profil (profil_a_id, profil_b_id, motif) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [pa, pb, motif]);
  await journaliser(q, { ...acteur.trace(), action: 'PARAMETRAGE', objetType: 'incompatibilite_profil', apres: { a: pa, b: pb, motif } });
}

// ---------------------------------------------------------------- Intérim (ORG-RG-043)

async function niveauMaxValidation(q: Executant, utilisateurId: string): Promise<number> {
  const r = await q.query<{ n: number | null }>(
    `SELECT max(COALESCE(d.niveau_validation, 1)) AS n FROM utilisateur_profil up
       JOIN profil_droit pd ON pd.profil_id = up.profil_id AND pd.supprime_le IS NULL
       JOIN droit d ON d.id = pd.droit_id AND d.action = 'VALIDER'
      WHERE up.utilisateur_id = $1 AND up.supprime_le IS NULL AND up.date_debut <= current_date AND (up.date_fin IS NULL OR up.date_fin >= current_date)`,
    [utilisateurId]);
  return r.rows[0]?.n ?? 0;
}

export async function creerInterim(q: Executant, acteur: Acteur, d: { delegataireId: string; debut: string; fin: string; motif: string }) {
  const delegant = acteur.utilisateurId;
  exiger(delegant, 'AUTHENTIFICATION', 'Utilisateur non identifié', 401);
  exiger(d.delegataireId !== delegant, 'INTERIM_INVALIDE', 'Le délégataire doit être un autre utilisateur');
  exiger(new Date(d.fin) > new Date(d.debut), 'PERIODE_INVALIDE', 'La fin doit suivre le début');
  exiger(d.motif?.trim(), 'MOTIF_REQUIS', 'Motif obligatoire');
  const nDelegant = await niveauMaxValidation(q, delegant);
  exiger(nDelegant > 0, 'AUCUN_DROIT_VALIDATION', 'Vous n\'avez aucun droit de validation à déléguer');
  const nDelegataire = await niveauMaxValidation(q, d.delegataireId);
  exiger(nDelegataire >= nDelegant, 'NIVEAU_INSUFFISANT', 'Le délégataire doit avoir un niveau de validation au moins égal au vôtre');
  if (await q.query(`SELECT 1 FROM utilisateur_profil up JOIN profil p ON p.id = up.profil_id WHERE up.utilisateur_id = $1 AND p.code = $2 AND up.supprime_le IS NULL`, [d.delegataireId, PROFIL_ADMIN]).then(r => r.rowCount)) {
    throw interdit('L\'Administrateur général ne peut recevoir aucun droit de validation');
  }
  const r = await q.query<{ id: string }>(
    'INSERT INTO interim (delegant_id, delegataire_id, date_debut, date_fin, motif) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [delegant, d.delegataireId, d.debut, d.fin, d.motif]);
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'interim', objetId: r.rows[0]!.id, apres: d });
  return r.rows[0]!.id;
}

// ---------------------------------------------------------------- Délégations (ORG-RG-041)

export async function definirDelegation(q: Executant, acteur: Acteur, d: {
  typeOperation: string; dateEffet: string; niveaux: { niveau: number; profilId: string; seuilMin?: number; seuilMax?: number }[];
}) {
  exiger(d.niveaux.length > 0, 'DELEGATION_VIDE', 'Au moins un niveau');
  const rangs = [...new Set(d.niveaux.map(n => n.niveau))].sort((a, b) => a - b);
  exiger(rangs.every((n, i) => n === i + 1), 'NIVEAUX_DISCONTINUS', 'Les niveaux se suivent à partir de 1');
  const admin = await q.query<{ id: string }>('SELECT id FROM profil WHERE code = $1', [PROFIL_ADMIN]);
  const estAdministratif = ['ORGANISATION', OPERATION_PROFIL_PRIVILEGIE, 'COMPTE_ADMINISTRATEUR'].includes(d.typeOperation);
  if (!estAdministratif && d.niveaux.some(n => n.profilId === admin.rows[0]?.id)) {
    throw interdit('L\'Administrateur général ne peut figurer dans aucun circuit de validation métier ou financier');
  }
  // Remplacement à la date d'effet : les anciennes lignes de même date sont retirées.
  await q.query(`UPDATE delegation_validation SET supprime_le = now() WHERE type_operation = $1 AND date_effet = $2 AND supprime_le IS NULL`, [d.typeOperation, d.dateEffet]);
  for (const n of d.niveaux) {
    await q.query(
      'INSERT INTO delegation_validation (type_operation, niveau, profil_id, seuil_min, seuil_max, date_effet) VALUES ($1,$2,$3,$4,$5,$6)',
      [d.typeOperation, n.niveau, n.profilId, n.seuilMin ?? null, n.seuilMax ?? null, d.dateEffet]);
  }
  await journaliser(q, { ...acteur.trace(), action: 'PARAMETRAGE', objetType: 'delegation_validation', apres: d });
}
