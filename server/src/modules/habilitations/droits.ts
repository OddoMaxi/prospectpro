/**
 * Moteur des droits d'accès (CDC § 4.5 ; DD 4.6 à 4.12).
 *
 * Droits effectifs d'un utilisateur à une date = droits des profils actifs à cette date
 * (attribution validée si le profil est privilégié), chacun avec son périmètre,
 * plus les droits de validation reçus par intérim en cours (ORG-RG-043).
 * L'intérim n'est jamais « retiré » par un traitement : il cesse d'être pris en compte à sa date de fin (CA-ORG-06).
 */
import type { Executant } from '../../db/pool.js';
import { interdit } from '../../noyau/erreurs.js';

export type Action = 'CONSULTER' | 'CREER' | 'MODIFIER' | 'VALIDER' | 'EXPORTER' | 'PARAMETRER';

export interface Perimetre {
  departements?: string[];
  services?: string[];
  bureaux?: string[];
  produits?: string[];
}

export interface DroitEffectif {
  fonction: string;
  action: Action;
  niveau: number | null;
  profil: string;
  perimetre: Perimetre | null;
  interimId: string | null;
}

/** Profils actifs d'un utilisateur à un instant. */
export async function profilsActifs(q: Executant, utilisateurId: string, instant = new Date()) {
  const r = await q.query<{ id: string; profil_id: string; code: string; privilegie: boolean; perimetre: Perimetre | null }>(
    `SELECT up.id, up.profil_id, p.code, p.privilegie, up.perimetre
       FROM utilisateur_profil up JOIN profil p ON p.id = up.profil_id
      WHERE up.utilisateur_id = $1 AND up.supprime_le IS NULL AND p.supprime_le IS NULL
        AND up.date_debut <= $2::date AND (up.date_fin IS NULL OR up.date_fin >= $2::date)
        AND (NOT p.privilegie OR up.valide_par IS NOT NULL)`, [utilisateurId, instant.toISOString().slice(0, 10)]);
  return r.rows;
}

export async function droitsEffectifs(q: Executant, utilisateurId: string, instant = new Date()): Promise<DroitEffectif[]> {
  const jour = instant.toISOString().slice(0, 10);
  const propres = await q.query<DroitEffectif>(
    `SELECT d.fonction_systeme AS fonction, d.action, d.niveau_validation AS niveau, p.code AS profil, up.perimetre, NULL::uuid AS "interimId"
       FROM utilisateur_profil up
       JOIN profil p ON p.id = up.profil_id AND p.supprime_le IS NULL
       JOIN profil_droit pd ON pd.profil_id = p.id AND pd.supprime_le IS NULL
       JOIN droit d ON d.id = pd.droit_id AND d.supprime_le IS NULL
      WHERE up.utilisateur_id = $1 AND up.supprime_le IS NULL
        AND up.date_debut <= $2::date AND (up.date_fin IS NULL OR up.date_fin >= $2::date)
        AND (NOT p.privilegie OR up.valide_par IS NOT NULL)`, [utilisateurId, jour]);
  // Intérim : seuls les droits de validation du délégant sont transmis, pendant la période.
  const recus = await q.query<DroitEffectif>(
    `SELECT d.fonction_systeme AS fonction, d.action, d.niveau_validation AS niveau, p.code AS profil, up.perimetre, i.id AS "interimId"
       FROM interim i
       JOIN utilisateur_profil up ON up.utilisateur_id = i.delegant_id AND up.supprime_le IS NULL
            AND up.date_debut <= $2::date AND (up.date_fin IS NULL OR up.date_fin >= $2::date)
       JOIN profil p ON p.id = up.profil_id AND p.supprime_le IS NULL AND (NOT p.privilegie OR up.valide_par IS NOT NULL)
       JOIN profil_droit pd ON pd.profil_id = p.id AND pd.supprime_le IS NULL
       JOIN droit d ON d.id = pd.droit_id AND d.supprime_le IS NULL AND d.action = 'VALIDER'
      WHERE i.delegataire_id = $1 AND i.supprime_le IS NULL AND i.date_debut <= $3 AND i.date_fin > $3`,
    [utilisateurId, jour, instant]);
  return [...propres.rows, ...recus.rows];
}

/**
 * Contrôle côté serveur (ORG-RG-040). Renvoie le périmètre autorisé :
 * null = sans restriction ; sinon l'union des périmètres des profils qui donnent ce droit.
 */
export async function controlerDroit(q: Executant, utilisateurId: string, fonction: string, action: Action): Promise<Perimetre | null> {
  const droits = (await droitsEffectifs(q, utilisateurId)).filter(d => d.fonction === fonction && d.action === action);
  if (droits.length === 0) throw interdit(`Droit ${action} sur ${fonction} non attribué`);
  if (droits.some(d => !d.perimetre || Object.values(d.perimetre).every(v => !v?.length))) return null;
  const union: Perimetre = {};
  for (const d of droits) {
    for (const [k, v] of Object.entries(d.perimetre ?? {}) as [keyof Perimetre, string[] | undefined][]) {
      if (v?.length) union[k] = [...new Set([...(union[k] ?? []), ...v])];
    }
  }
  return union;
}

/** Vrai si l'utilisateur détient le profil d'administration (ORG-RG-044). */
export async function estAdministrateur(q: Executant, utilisateurId: string): Promise<boolean> {
  return (await profilsActifs(q, utilisateurId)).some(p => p.code === PROFIL_ADMIN);
}

export const PROFIL_ADMIN = 'ADMIN_GENERAL';
