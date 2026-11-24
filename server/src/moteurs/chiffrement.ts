/**
 * Chiffrement applicatif par enveloppe (rapport L0 v1.1, partie G) — remplace pgcrypto.
 *
 * - Données chiffrées dans l'application en AES-256-GCM avec une clé de données (DEK) par domaine.
 * - Chaque DEK est stockée chiffrée (table cle_donnees) par la clé maîtresse du domaine :
 *   Vault Transit en recette et en production, clé locale dérivée en développement et en test.
 * - Données associées authentifiées : table, colonne et identifiant de ligne. Un texte chiffré
 *   recopié dans une autre ligne ne se déchiffre pas.
 * - Recherche : empreinte HMAC-SHA-256 avec une clé distincte (domaine « recherche »).
 * - Aucune clé ne transite dans une requête SQL.
 */
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import type { Executant } from '../db/pool.js';
import { ErreurMetier } from '../noyau/erreurs.js';

export type Domaine = 'finances' | 'sante' | 'conformite' | 'securite' | 'recherche';

/** Accès aux clés maîtresses : seule cette interface touche aux clés de chiffrement de clés. */
export interface GardienCles {
  envelopper(domaine: Domaine, dek: Buffer): Promise<string>;
  desenvelopper(domaine: Domaine, enveloppe: string): Promise<Buffer>;
}

/** Développement et tests : clé maîtresse locale, une sous-clé dérivée par domaine. */
export class GardienLocal implements GardienCles {
  constructor(private readonly maitre: Buffer) {
    if (maitre.length !== 32) throw new Error('Clé maîtresse locale : 32 octets attendus');
  }
  private kek(domaine: Domaine) {
    return Buffer.from(hkdfSync('sha256', this.maitre, Buffer.alloc(0), `prospectpro-kek-${domaine}`, 32));
  }
  async envelopper(domaine: Domaine, dek: Buffer) {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.kek(domaine), iv);
    const ct = Buffer.concat([c.update(dek), c.final()]);
    return `local:v1:${Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64')}`;
  }
  async desenvelopper(domaine: Domaine, enveloppe: string) {
    const b = Buffer.from(enveloppe.replace(/^local:v1:/, ''), 'base64');
    const d = createDecipheriv('aes-256-gcm', this.kek(domaine), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]);
  }
}

/** Recette et production : HashiCorp Vault, moteur Transit, une clé par domaine (prospectpro-<domaine>). */
export class GardienVault implements GardienCles {
  constructor(private readonly adresse: string, private readonly jeton: string) {}
  private async appel(chemin: string, corps: object) {
    const r = await fetch(`${this.adresse}/v1/transit/${chemin}`, {
      method: 'POST', headers: { 'X-Vault-Token': this.jeton, 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
    });
    if (!r.ok) throw new Error(`Vault : ${r.status} sur ${chemin.split('/')[0]}`);
    return (await r.json() as { data: Record<string, string> }).data;
  }
  async envelopper(domaine: Domaine, dek: Buffer) {
    return (await this.appel(`encrypt/prospectpro-${domaine}`, { plaintext: dek.toString('base64') })).ciphertext!;
  }
  async desenvelopper(domaine: Domaine, enveloppe: string) {
    return Buffer.from((await this.appel(`decrypt/prospectpro-${domaine}`, { ciphertext: enveloppe })).plaintext!, 'base64');
  }
}

const FORMAT = 1;

export class MoteurChiffrement {
  private cache = new Map<string, Buffer>();
  constructor(private readonly gardien: GardienCles) {}

  /** DEK active du domaine ; créée à la première utilisation. */
  private async cleActive(q: Executant, domaine: Domaine): Promise<{ version: number; cle: Buffer }> {
    let r = await q.query<{ version: number; cle_chiffree: string }>('SELECT version, cle_chiffree FROM cle_donnees WHERE domaine=$1 AND active', [domaine]);
    if (!r.rows[0]) {
      const dek = randomBytes(32);
      await q.query(
        `INSERT INTO cle_donnees (domaine, version, cle_chiffree) VALUES ($1, 1, $2) ON CONFLICT DO NOTHING`,
        [domaine, await this.gardien.envelopper(domaine, dek)],
      );
      r = await q.query('SELECT version, cle_chiffree FROM cle_donnees WHERE domaine=$1 AND active', [domaine]);
    }
    const { version, cle_chiffree } = r.rows[0]!;
    return { version, cle: await this.dek(domaine, version, cle_chiffree) };
  }

  private async dek(domaine: Domaine, version: number, enveloppe?: string, q?: Executant): Promise<Buffer> {
    const k = `${domaine}:${version}`;
    const c = this.cache.get(k);
    if (c) return c;
    if (!enveloppe) {
      const r = await q!.query<{ cle_chiffree: string }>('SELECT cle_chiffree FROM cle_donnees WHERE domaine=$1 AND version=$2', [domaine, version]);
      if (!r.rows[0]) throw new ErreurMetier('CLE_INCONNUE', `Clé ${k} introuvable`, 500);
      enveloppe = r.rows[0].cle_chiffree;
    }
    const cle = await this.gardien.desenvelopper(domaine, enveloppe);
    this.cache.set(k, cle);
    return cle;
  }

  /** Chiffre une valeur pour la colonne <table>.<colonne> de la ligne <id>. */
  async chiffrer(q: Executant, domaine: Domaine, clair: string, contexte: { table: string; colonne: string; id: string }): Promise<Buffer> {
    const { version, cle } = await this.cleActive(q, domaine);
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', cle, iv);
    c.setAAD(Buffer.from(`${contexte.table}|${contexte.colonne}|${contexte.id}`));
    const ct = Buffer.concat([c.update(clair, 'utf8'), c.final()]);
    const entete = Buffer.alloc(3);
    entete.writeUInt8(FORMAT, 0);
    entete.writeUInt16BE(version, 1);
    return Buffer.concat([entete, iv, c.getAuthTag(), ct]);
  }

  async dechiffrer(q: Executant, domaine: Domaine, chiffre: Buffer, contexte: { table: string; colonne: string; id: string }): Promise<string> {
    if (chiffre.readUInt8(0) !== FORMAT) throw new ErreurMetier('FORMAT_CHIFFRE', 'Format de donnée chiffrée inconnu', 500);
    const cle = await this.dek(domaine, chiffre.readUInt16BE(1), undefined, q);
    const d = createDecipheriv('aes-256-gcm', cle, chiffre.subarray(3, 15));
    d.setAAD(Buffer.from(`${contexte.table}|${contexte.colonne}|${contexte.id}`));
    d.setAuthTag(chiffre.subarray(15, 31));
    try {
      return Buffer.concat([d.update(chiffre.subarray(31)), d.final()]).toString('utf8');
    } catch {
      throw new ErreurMetier('DECHIFFREMENT_IMPOSSIBLE', 'Donnée chiffrée altérée ou déplacée', 500);
    }
  }

  /** Empreinte de recherche (HMAC-SHA-256) d'une valeur normalisée. */
  async empreinteRecherche(q: Executant, valeur: string): Promise<string> {
    const { cle } = await this.cleActive(q, 'recherche');
    return createHmac('sha256', cle).update(valeur.replace(/\s+/g, '').toUpperCase()).digest('hex');
  }
}
