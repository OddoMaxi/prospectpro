/**
 * Moteur de notifications (CDC § 3.5 et 3.6 ; DD 4.20, 4.21).
 * Aucun module n'envoie de message par ses propres moyens. Un adaptateur par canal, derrière une interface commune ;
 * un simulateur par canal pour le développement et la recette.
 * Le contenu n'est pas conservé : la table notification trace le modèle, le destinataire, l'adresse et le statut.
 */
import type { Executant } from '../db/pool.js';
import { ErreurMetier, exiger } from '../noyau/erreurs.js';

export type Canal = 'SMS' | 'WHATSAPP' | 'COURRIEL' | 'APPLICATION' | 'USSD' | 'COURRIER';

export interface Adaptateur {
  envoyer(adresse: string, texte: string): Promise<{ reference: string }>;
}

/** Simulateur : garde les derniers messages en mémoire (consultables en recette et par les tests). */
export class Simulateur implements Adaptateur {
  readonly envoyes: { adresse: string; texte: string; le: Date }[] = [];
  async envoyer(adresse: string, texte: string) {
    this.envoyes.push({ adresse, texte, le: new Date() });
    if (this.envoyes.length > 500) this.envoyes.shift();
    return { reference: `SIM-${this.envoyes.length}` };
  }
  dernier(adresse: string) {
    return [...this.envoyes].reverse().find(m => m.adresse === adresse);
  }
}

const adaptateurs = new Map<Canal, Adaptateur>();

export function brancherAdaptateur(canal: Canal, a: Adaptateur): void {
  adaptateurs.set(canal, a);
}

export function rendre(gabarit: string, variables: Record<string, string | number>): string {
  return gabarit.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => {
    if (!(k in variables)) throw new ErreurMetier('VARIABLE_MANQUANTE', `Variable ${k} absente du message`, 500);
    return String(variables[k]);
  });
}

/**
 * Envoie un message à un tiers selon un modèle. Les envois sont synchrones pour les codes à usage unique ;
 * les autres seront distribués par l'ordonnanceur à partir des événements.
 */
export async function notifier(q: Executant, n: {
  tiersId: string; code: string; canal: Canal; adresse: string; variables: Record<string, string | number>;
  objet?: { type: string; id: string }; langue?: string;
}): Promise<string> {
  const m = await q.query<{ id: string; contenu: string }>(
    `SELECT id, contenu FROM modele_notification WHERE code = $1 AND canal = $2 AND langue = $3 AND actif AND supprime_le IS NULL`,
    [n.code, n.canal, n.langue ?? 'fr']);
  exiger(m.rows[0], 'MODELE_ABSENT', `Modèle de notification ${n.code} (${n.canal}) absent`);
  const adaptateur = adaptateurs.get(n.canal);
  exiger(adaptateur, 'CANAL_INDISPONIBLE', `Aucun adaptateur pour le canal ${n.canal}`);
  // notification est une table journal (ajout seul) : la ligne est écrite une fois, avec le résultat de l'envoi.
  // La confirmation de remise (remis_le) exigera une exception à l'ajout seul : écart X13.
  let statut = 'ENVOYE', erreur: Error | null = null;
  try {
    await adaptateur.envoyer(n.adresse, rendre(m.rows[0].contenu, n.variables));
  } catch (e) {
    statut = 'ECHEC'; erreur = e as Error;
  }
  const r = await q.query<{ id: string }>(
    `INSERT INTO notification (destinataire_tiers_id, modele_notification_id, canal, adresse, objet_type, objet_id, statut, envoye_le)
     VALUES ($1,$2,$3,$4,$5,$6,$7::varchar, CASE WHEN $7::varchar = 'ENVOYE' THEN now() END) RETURNING id`,
    [n.tiersId, m.rows[0].id, n.canal, n.adresse, n.objet?.type ?? null, n.objet?.id ?? null, statut]);
  if (erreur) throw new ErreurMetier('ENVOI_ECHOUE', `Envoi ${n.canal} impossible : ${erreur.message}`, 502);
  return r.rows[0]!.id;
}
