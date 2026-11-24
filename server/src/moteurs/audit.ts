/**
 * Journal d'audit chaîné (CDC § 4.6 ; DD 4.13 ; rapport L0 A.3 bis).
 *
 * Chaque ligne porte une empreinte SHA-256 calculée sur son contenu et sur l'empreinte de la ligne
 * précédente : modifier ou retirer une ligne casse la chaîne, ce que `verifierChaine` détecte.
 * L'écriture est sérialisée par un verrou consultatif de transaction (ordre = rang).
 *
 * Aucune valeur sensible n'est journalisée en clair : les champs secrets sont masqués avant calcul.
 */
import { createHash } from 'node:crypto';
import type { Executant } from '../db/pool.js';

export type ActionAudit = 'CONNEXION' | 'CONSULTATION' | 'CREATION' | 'MODIFICATION' | 'VALIDATION' | 'EXPORT' | 'PARAMETRAGE'
  | 'ECHEC_CONNEXION' | 'DECONNEXION' | 'SUPPRESSION' | 'REJET';

export interface EntreeAudit {
  utilisateurId?: string | null;
  action: ActionAudit;
  objetType: string;
  objetId?: string | null;
  avant?: unknown;
  apres?: unknown;
  adresseIp?: string | null;
  appareil?: string | null;
}

const VERROU_JOURNAL = 7_310_001;
const CHAMPS_SECRETS = /mot_de_passe|secret|code_secours|empreinte_code|token|jeton|numero_compte|^numero$|diagnostic|contenu_medical|conclusions/i;

/** Remplace les valeurs secrètes par « *** », récursivement. */
export function masquer(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(masquer);
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if (Buffer.isBuffer(v)) return '***';
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, CHAMPS_SECRETS.test(k) ? '***' : masquer(x)]));
  }
  return v;
}

/** Sérialisation canonique (clés triées) : la même donnée donne toujours la même empreinte. */
function canonique(v: unknown): string {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  if (Array.isArray(v)) return `[${v.map(canonique).join(',')}]`;
  return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonique((v as Record<string, unknown>)[k])}`).join(',')}}`;
}

function empreinte(precedente: string, l: Record<string, unknown>): string {
  const contenu = canonique({
    horodatage: new Date(l.horodatage as string | Date).toISOString(),
    utilisateur_id: l.utilisateur_id ?? null, adresse_ip: l.adresse_ip ?? null, appareil: l.appareil ?? null,
    action: l.action, objet_type: l.objet_type, objet_id: l.objet_id ?? null,
    valeur_avant: l.valeur_avant ?? null, valeur_apres: l.valeur_apres ?? null,
  });
  return createHash('sha256').update(precedente).update('\n').update(contenu).digest('hex');
}

/** Écrit une ligne de journal dans la transaction en cours (q doit être un client en transaction). */
export async function journaliser(q: Executant, e: EntreeAudit): Promise<void> {
  await q.query('SELECT pg_advisory_xact_lock($1)', [VERROU_JOURNAL]);
  const prec = await q.query<{ empreinte: string }>('SELECT empreinte FROM journal_audit ORDER BY rang DESC LIMIT 1');
  const ligne = {
    horodatage: new Date(),
    utilisateur_id: e.utilisateurId ?? null,
    adresse_ip: e.adresseIp ?? null,
    appareil: e.appareil?.slice(0, 200) ?? null,
    action: e.action,
    objet_type: e.objetType,
    objet_id: e.objetId ?? null,
    valeur_avant: e.avant === undefined ? null : masquer(e.avant),
    valeur_apres: e.apres === undefined ? null : masquer(e.apres),
  };
  // Les dates contenues dans les valeurs sont figées en texte ISO avant calcul, comme elles seront relues.
  ligne.valeur_avant = ligne.valeur_avant === null ? null : JSON.parse(JSON.stringify(ligne.valeur_avant));
  ligne.valeur_apres = ligne.valeur_apres === null ? null : JSON.parse(JSON.stringify(ligne.valeur_apres));
  const h = empreinte(prec.rows[0]?.empreinte ?? 'ORIGINE', ligne);
  await q.query(
    `INSERT INTO journal_audit (horodatage, utilisateur_id, adresse_ip, appareil, action, objet_type, objet_id, valeur_avant, valeur_apres, empreinte)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [ligne.horodatage, ligne.utilisateur_id, ligne.adresse_ip, ligne.appareil, ligne.action, ligne.objet_type, ligne.objet_id,
      ligne.valeur_avant === null ? null : JSON.stringify(ligne.valeur_avant),
      ligne.valeur_apres === null ? null : JSON.stringify(ligne.valeur_apres), h],
  );
}

/** Recalcule toute la chaîne ; renvoie le rang de la première ligne altérée, ou null si la chaîne est intacte. */
export async function verifierChaine(q: Executant): Promise<{ lignes: number; premiereAlteration: number | null }> {
  const r = await q.query('SELECT * FROM journal_audit ORDER BY rang');
  let prec = 'ORIGINE';
  for (const l of r.rows) {
    if (empreinte(prec, l) !== l.empreinte) return { lignes: r.rows.length, premiereAlteration: Number(l.rang) };
    prec = l.empreinte;
  }
  return { lignes: r.rows.length, premiereAlteration: null };
}
