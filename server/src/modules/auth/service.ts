/**
 * Authentification (ORG-RG-022, 023 ; décision de la Direction du 24/11/2026).
 *
 * 1. Mot de passe (Argon2id). Échecs comptés ; suspension au seuil paramétré.
 * 2. Second facteur : TOTP pour les comptes à privilèges (méthode principale, codes de secours),
 *    code SMS pour les agents et les prestataires.
 *    Un compte privilégié sans TOTP se connecte une fois par SMS, avec une session limitée à l'enrôlement TOTP.
 * 3. Session serveur révocable ; le jeton JWT porte l'identifiant de session.
 */
import { createHash, randomInt, randomBytes, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import type { Executant } from '../../db/pool.js';
import { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger } from '../../noyau/erreurs.js';
import { journaliser } from '../../moteurs/audit.js';
import type { MoteurChiffrement } from '../../moteurs/chiffrement.js';
import { notifier } from '../../moteurs/notifications.js';
import { entier } from '../../moteurs/parametres.js';
import { profilsActifs } from '../habilitations/droits.js';
import { nouveauSecret, uriTotp, verifierTotp } from './totp.js';

export interface ContexteAuth { jwtSecret: string; chiffrement: MoteurChiffrement }
export type Etape = 'SECOND_FACTEUR' | 'ENROLEMENT_TOTP' | 'OUVERTE';
export interface JetonSession { sid: string; uid: string; etape: Etape }

interface Utilisateur {
  id: string; identifiant: string; tiers_id: string; mot_de_passe_hash: string; statut: string; double_facteur: boolean;
  telephone_verifie: string | null; echecs_connexion: number; type_compte: string;
}

/**
 * Refus qui doit être enregistré (compteur d'échecs, suspension, journal) : renvoyé et non levé,
 * pour que la transaction soit validée ; l'appelant lève l'erreur ensuite.
 */
export class Refus {
  constructor(public readonly erreur: ErreurMetier) {}
}

const ECHEC_GENERIQUE = () => new ErreurMetier('IDENTIFICATION_ECHOUEE', 'Identifiant ou mot de passe incorrect', 401);
const empreinteCode = (code: string, sel: string) => createHash('sha256').update(`${sel}:${code}`).digest('hex');

async function ouvrirSession(q: Executant, ctx: ContexteAuth, u: Utilisateur, etape: Etape, acteur: Acteur) {
  const minutes = etape === 'OUVERTE' ? await entier(q, 'SECURITE_DUREE_SESSION_MIN') : 10;
  const r = await q.query<{ id: string; expire_le: Date }>(
    `INSERT INTO session_utilisateur (utilisateur_id, etape, expire_le, adresse_ip, appareil)
     VALUES ($1,$2, now() + make_interval(mins => $3), $4, $5) RETURNING id, expire_le`,
    [u.id, etape, minutes, acteur.adresseIp, acteur.appareil?.slice(0, 200) ?? null]);
  const s = r.rows[0]!;
  const jeton = jwt.sign({ sid: s.id, uid: u.id, etape } satisfies JetonSession, ctx.jwtSecret, { expiresIn: minutes * 60 });
  return { jeton, etape, expireLe: s.expire_le };
}

async function estPrivilegie(q: Executant, utilisateurId: string) {
  return (await profilsActifs(q, utilisateurId)).some(p => p.privilegie);
}

async function totpActif(q: Executant, utilisateurId: string) {
  const r = await q.query<{ id: string; secret_chiffre: Buffer; codes_secours: string[] | null }>(
    `SELECT id, secret_chiffre, codes_secours FROM facteur_authentification WHERE utilisateur_id = $1 AND type = 'TOTP' AND revoque_le IS NULL AND active_le IS NOT NULL`,
    [utilisateurId]);
  return r.rows[0];
}

async function envoyerCodeSms(q: Executant, u: Utilisateur, objet: string) {
  exiger(u.telephone_verifie, 'TELEPHONE_ABSENT', 'Aucun téléphone vérifié : contactez l\'administrateur');
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const sel = randomBytes(8).toString('hex');
  await q.query(
    `INSERT INTO code_usage_unique (utilisateur_id, objet, empreinte_code, telephone, expire_le)
     VALUES ($1,$2,$3,$4, now() + interval '5 minutes')`, [u.id, objet, `${sel}$${empreinteCode(code, sel)}`, u.telephone_verifie]);
  await notifier(q, { tiersId: u.tiers_id, code: 'OTP_CONNEXION', canal: 'SMS', adresse: u.telephone_verifie, variables: { code } });
}

/** Étape 1 : identifiant et mot de passe. */
export async function connecter(q: Executant, ctx: ContexteAuth, acteur: Acteur, identifiant: string, motDePasse: string) {
  const r = await q.query<Utilisateur>('SELECT * FROM utilisateur WHERE identifiant = $1 AND supprime_le IS NULL FOR UPDATE', [identifiant]);
  const u = r.rows[0];
  if (!u) {
    await argon2.hash(motDePasse); // temps de réponse homogène
    throw ECHEC_GENERIQUE();
  }
  if (u.statut !== 'ACTIF') {
    await journaliser(q, { ...acteur.trace(), utilisateurId: u.id, action: 'ECHEC_CONNEXION', objetType: 'utilisateur', objetId: u.id, apres: { motif: `Compte ${u.statut}` } });
    return new Refus(new ErreurMetier('COMPTE_INACTIF', u.statut === 'SUSPENDU' ? 'Compte suspendu : contactez l\'administrateur' : 'Compte non actif', 403));
  }
  if (!(await argon2.verify(u.mot_de_passe_hash, motDePasse))) {
    const seuil = await entier(q, 'SECURITE_ECHECS_MAX');
    const echecs = u.echecs_connexion + 1;
    const suspendu = echecs >= seuil;
    await q.query(`UPDATE utilisateur SET echecs_connexion = $2, statut = CASE WHEN $3 THEN 'SUSPENDU' ELSE statut END WHERE id = $1`, [u.id, echecs, suspendu]);
    await journaliser(q, { ...acteur.trace(), utilisateurId: u.id, action: 'ECHEC_CONNEXION', objetType: 'utilisateur', objetId: u.id, apres: { echecs, suspendu } });
    if (suspendu) return new Refus(new ErreurMetier('COMPTE_SUSPENDU', `Compte suspendu après ${seuil} échecs : contactez l'administrateur`, 403));
    return new Refus(ECHEC_GENERIQUE());
  }
  await q.query('UPDATE utilisateur SET echecs_connexion = 0 WHERE id = $1', [u.id]);

  if (!u.double_facteur) return terminer(q, ctx, u, acteur, 'MOT_DE_PASSE');
  const totp = await totpActif(q, u.id);
  if (totp) return { ...(await ouvrirSession(q, ctx, u, 'SECOND_FACTEUR', acteur)), methode: 'TOTP' as const };
  await envoyerCodeSms(q, u, 'CONNEXION');
  return { ...(await ouvrirSession(q, ctx, u, 'SECOND_FACTEUR', acteur)), methode: 'SMS' as const };
}

async function terminer(q: Executant, ctx: ContexteAuth, u: Utilisateur, acteur: Acteur, methode: string) {
  // Comptes à privilèges : TOTP obligatoire ; sans TOTP, la session ne sert qu'à l'enrôler.
  const privilegie = await estPrivilegie(q, u.id);
  const etape: Etape = privilegie && !(await totpActif(q, u.id)) ? 'ENROLEMENT_TOTP' : 'OUVERTE';
  if (etape === 'OUVERTE') await q.query('UPDATE utilisateur SET derniere_connexion = now() WHERE id = $1', [u.id]);
  await journaliser(q, { ...acteur.trace(), utilisateurId: u.id, action: 'CONNEXION', objetType: 'utilisateur', objetId: u.id, apres: { methode, etape } });
  return { ...(await ouvrirSession(q, ctx, u, etape, acteur)), methode };
}

/** Étape 2 : code TOTP, code de secours ou code SMS. */
export async function verifierSecondFacteur(q: Executant, ctx: ContexteAuth, acteur: Acteur, session: JetonSession, code: string) {
  exiger(session.etape === 'SECOND_FACTEUR', 'ETAPE_INVALIDE', 'Aucune vérification en attente', 400);
  const r = await q.query<Utilisateur>('SELECT * FROM utilisateur WHERE id = $1 FOR UPDATE', [session.uid]);
  const u = r.rows[0]!;
  exiger(u.statut === 'ACTIF', 'COMPTE_INACTIF', 'Compte non actif', 403);
  await q.query('UPDATE session_utilisateur SET revoquee_le = now() WHERE id = $1', [session.sid]);

  const totp = await totpActif(q, u.id);
  let ok = false, methode = 'SMS';
  if (totp) {
    methode = 'TOTP';
    const secret = await ctx.chiffrement.dechiffrer(q, 'securite', totp.secret_chiffre, { table: 'facteur_authentification', colonne: 'secret_chiffre', id: totp.id });
    ok = verifierTotp(secret, code.trim());
    if (!ok && /^[a-z0-9]{10}$/i.test(code.trim()) && totp.codes_secours?.length) {
      for (const [i, h] of totp.codes_secours.entries()) {
        if (await argon2.verify(h, code.trim().toLowerCase())) {
          const restants = totp.codes_secours.filter((_, j) => j !== i);
          await q.query('UPDATE facteur_authentification SET codes_secours = $2 WHERE id = $1', [totp.id, JSON.stringify(restants)]);
          ok = true; methode = 'CODE_SECOURS';
          break;
        }
      }
    }
  } else {
    const c = await q.query<{ id: string; empreinte_code: string; tentatives: number }>(
      `SELECT id, empreinte_code, tentatives FROM code_usage_unique
        WHERE utilisateur_id = $1 AND objet = 'CONNEXION' AND utilise_le IS NULL AND expire_le > now()
        ORDER BY cree_le DESC LIMIT 1 FOR UPDATE`, [u.id]);
    const cu = c.rows[0];
    if (cu && cu.tentatives < 3) {
      const [sel, h] = cu.empreinte_code.split('$') as [string, string];
      ok = timingSafeEqual(Buffer.from(h), Buffer.from(empreinteCode(code.trim(), sel)));
      await q.query(`UPDATE code_usage_unique SET tentatives = tentatives + 1, utilise_le = CASE WHEN $2 THEN now() END WHERE id = $1`, [cu.id, ok]);
    }
  }
  if (!ok) {
    const seuil = await entier(q, 'SECURITE_ECHECS_MAX');
    const echecs = u.echecs_connexion + 1;
    await q.query(`UPDATE utilisateur SET echecs_connexion = $2, statut = CASE WHEN $3 THEN 'SUSPENDU' ELSE statut END WHERE id = $1`, [u.id, echecs, echecs >= seuil]);
    await journaliser(q, { ...acteur.trace(), utilisateurId: u.id, action: 'ECHEC_CONNEXION', objetType: 'utilisateur', objetId: u.id, apres: { etape: 'SECOND_FACTEUR', methode, echecs } });
    return new Refus(new ErreurMetier('CODE_INCORRECT', 'Code incorrect ou expiré : reconnectez-vous', 401));
  }
  await q.query('UPDATE utilisateur SET echecs_connexion = 0 WHERE id = $1', [u.id]);
  return terminer(q, ctx, u, acteur, methode);
}

/** Enrôlement TOTP : secret généré et chiffré ; actif après vérification d'un premier code. */
export async function demarrerEnrolementTotp(q: Executant, ctx: ContexteAuth, session: JetonSession) {
  exiger(session.etape === 'ENROLEMENT_TOTP' || session.etape === 'OUVERTE', 'ETAPE_INVALIDE', 'Session invalide', 401);
  const u = (await q.query<{ identifiant: string }>('SELECT identifiant FROM utilisateur WHERE id = $1', [session.uid])).rows[0]!;
  await q.query(`UPDATE facteur_authentification SET revoque_le = now() WHERE utilisateur_id = $1 AND type = 'TOTP' AND active_le IS NULL AND revoque_le IS NULL`, [session.uid]);
  const existant = await totpActif(q, session.uid);
  exiger(!existant, 'TOTP_DEJA_ACTIF', 'Une application d\'authentification est déjà enregistrée');
  const secret = nouveauSecret();
  const r = await q.query<{ id: string }>(`INSERT INTO facteur_authentification (utilisateur_id, type) VALUES ($1, 'TOTP') RETURNING id`, [session.uid]);
  const id = r.rows[0]!.id;
  const chiffre = await ctx.chiffrement.chiffrer(q, 'securite', secret, { table: 'facteur_authentification', colonne: 'secret_chiffre', id });
  await q.query('UPDATE facteur_authentification SET secret_chiffre = $2 WHERE id = $1', [id, chiffre]);
  return { secret, uri: uriTotp(secret, u.identifiant) };
}

export async function confirmerEnrolementTotp(q: Executant, ctx: ContexteAuth, acteur: Acteur, session: JetonSession, code: string) {
  const r = await q.query<{ id: string; secret_chiffre: Buffer }>(
    `SELECT id, secret_chiffre FROM facteur_authentification WHERE utilisateur_id = $1 AND type = 'TOTP' AND active_le IS NULL AND revoque_le IS NULL`, [session.uid]);
  const f = r.rows[0];
  exiger(f, 'ENROLEMENT_ABSENT', 'Aucun enrôlement en cours', 400);
  const secret = await ctx.chiffrement.dechiffrer(q, 'securite', f.secret_chiffre, { table: 'facteur_authentification', colonne: 'secret_chiffre', id: f.id });
  exiger(verifierTotp(secret, code.trim()), 'CODE_INCORRECT', 'Code incorrect : vérifiez l\'heure du téléphone et réessayez', 401);
  const codes = Array.from({ length: 10 }, () => randomBytes(8).toString('base64url').replace(/[^a-z0-9]/gi, '').toLowerCase().padEnd(10, '0').slice(0, 10));
  const empreintes = await Promise.all(codes.map(c => argon2.hash(c, { type: argon2.argon2id })));
  await q.query('UPDATE facteur_authentification SET active_le = now(), codes_secours = $2 WHERE id = $1', [f.id, JSON.stringify(empreintes)]);
  await q.query('UPDATE session_utilisateur SET revoquee_le = now() WHERE id = $1', [session.sid]);
  await journaliser(q, { ...acteur.trace(), action: 'PARAMETRAGE', objetType: 'facteur_authentification', objetId: f.id, apres: { type: 'TOTP', active: true } });
  const u = (await q.query<Utilisateur>('SELECT * FROM utilisateur WHERE id = $1', [session.uid])).rows[0]!;
  const ouverte = await terminer(q, ctx, u, acteur, 'TOTP');
  return { ...ouverte, codesSecours: codes };
}

/** Contrôle d'un jeton : signature, session non révoquée et non expirée, compte actif. */
export async function verifierJeton(q: Executant, ctx: ContexteAuth, jeton: string): Promise<JetonSession> {
  let p: JetonSession;
  try {
    p = jwt.verify(jeton, ctx.jwtSecret) as JetonSession;
  } catch {
    throw new ErreurMetier('SESSION_INVALIDE', 'Session expirée ou invalide', 401);
  }
  const r = await q.query(
    `SELECT 1 FROM session_utilisateur s JOIN utilisateur u ON u.id = s.utilisateur_id
      WHERE s.id = $1 AND s.utilisateur_id = $2 AND s.etape = $3 AND s.revoquee_le IS NULL AND s.expire_le > now() AND u.statut = 'ACTIF'`,
    [p.sid, p.uid, p.etape]);
  if (!r.rowCount) throw new ErreurMetier('SESSION_INVALIDE', 'Session expirée ou révoquée', 401);
  return p;
}

export async function deconnecter(q: Executant, acteur: Acteur, session: JetonSession) {
  await q.query('UPDATE session_utilisateur SET revoquee_le = now() WHERE id = $1', [session.sid]);
  await journaliser(q, { ...acteur.trace(), action: 'DECONNEXION', objetType: 'utilisateur', objetId: session.uid });
}
