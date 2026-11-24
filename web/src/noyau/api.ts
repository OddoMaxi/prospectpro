/** Client de l'API : jeton de session, erreurs métier typées, téléchargements. */
export class ErreurApi extends Error {
  constructor(public readonly statut: number, public readonly code: string, message: string, public readonly details?: unknown) {
    super(message);
  }
}

const CLE = 'prospectpro.jeton';
let jeton: string | null = sessionStorage.getItem(CLE);
let surExpiration: () => void = () => undefined;

export function definirJeton(j: string | null) {
  jeton = j;
  if (j) sessionStorage.setItem(CLE, j);
  else sessionStorage.removeItem(CLE);
}
export const jetonCourant = () => jeton;
export function quandSessionExpire(f: () => void) { surExpiration = f; }

async function requete(methode: string, chemin: string, corps?: unknown, jetonParticulier?: string): Promise<Response> {
  const j = jetonParticulier ?? jeton;
  const brut = corps instanceof Blob || corps instanceof ArrayBuffer;
  const r = await fetch(`/api${chemin}`, {
    method: methode,
    headers: { ...(j ? { Authorization: `Bearer ${j}` } : {}), ...(corps !== undefined && !brut ? { 'Content-Type': 'application/json' } : {}),
      ...(corps instanceof Blob && corps.type ? { 'Content-Type': corps.type } : {}) },
    body: corps === undefined ? undefined : brut ? (corps as BodyInit) : JSON.stringify(corps),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({ code: 'ERREUR', message: `Erreur ${r.status}` }));
    if (r.status === 401 && !jetonParticulier && jeton && chemin !== '/auth/connexion') { definirJeton(null); surExpiration(); }
    throw new ErreurApi(r.status, e.code ?? 'ERREUR', e.message ?? `Erreur ${r.status}`, e.details);
  }
  return r;
}

export async function api<T = unknown>(methode: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', chemin: string, corps?: unknown, jetonParticulier?: string): Promise<T> {
  const r = await requete(methode, chemin, corps, jetonParticulier);
  if (r.status === 204) return undefined as T;
  const type = r.headers.get('content-type') ?? '';
  return (type.includes('application/json') ? r.json() : r.text()) as Promise<T>;
}

/** Ouvre un fichier (PDF, CSV…) renvoyé par l'API, avec le jeton de session. */
export async function ouvrirFichier(methode: 'GET' | 'POST', chemin: string, corps?: unknown, nom?: string) {
  const r = await requete(methode, chemin, corps);
  const url = URL.createObjectURL(await r.blob());
  if (nom) {
    const a = document.createElement('a');
    a.href = url; a.download = nom; a.click();
  } else window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const date = (d?: string | null) => (d ? new Date(d.length === 10 ? `${d}T00:00:00Z` : d).toLocaleDateString('fr-FR', { timeZone: 'UTC' }) : '—');
export const dateHeure = (d?: string | null) => (d ? new Date(d).toLocaleString('fr-FR', { timeZone: 'Africa/Conakry', dateStyle: 'short', timeStyle: 'short' }) : '—');
export const montant = (n?: number | string | null) => (n === null || n === undefined || n === '' ? '—' : Number(n).toLocaleString('fr-FR').replace(/ /g, ' '));
export const aujourdhui = () => new Date().toISOString().slice(0, 10);
