/** Sous-lot 1.2 – Authentification : ORG-RG-022, 023 ; TOTP pour les comptes à privilèges (décision du 24/11/2026). */
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool, transaction } from '../src/db/pool.js';
import { Acteur } from '../src/noyau/acteur.js';
import { GardienLocal, MoteurChiffrement } from '../src/moteurs/chiffrement.js';
import {
  confirmerEnrolementTotp, connecter, demarrerEnrolementTotp, Refus, verifierJeton, verifierSecondFacteur, type ContexteAuth, type JetonSession,
} from '../src/modules/auth/service.js';
import { codeTotp } from '../src/modules/auth/totp.js';
import { changerStatut } from '../src/modules/habilitations/service.js';
import jwt from 'jsonwebtoken';
import { chargerConfig } from '../src/config.js';
import { fermer, installee, MDP, ouvrir, sms, utilisateur } from './outils.js';

const ctx: ContexteAuth = { jwtSecret: randomBytes(32).toString('hex'), chiffrement: new MoteurChiffrement(new GardienLocal(randomBytes(32))) };
const poste = new Acteur(null, '10.0.0.5', 'Navigateur de test');
let admin: Acteur, dg: Acteur;

/** Exécute une étape d'authentification comme le fera la route : refus validé puis levé. */
async function etape<T>(fn: (q: Parameters<Parameters<typeof transaction>[1]>[0]) => Promise<T | Refus>): Promise<T> {
  const r = await transaction(null, fn);
  if (r instanceof Refus) throw r.erreur;
  return r;
}
const session = (j: string) => jwt.decode(j) as JetonSession;

beforeAll(async () => { await ouvrir(); ({ admin, dg } = await installee()); });
afterAll(fermer);

describe('Connexion', () => {
  it('suspend le compte au cinquième échec et conserve le compteur malgré les erreurs', async () => {
    const u = await utilisateur(admin, 'agent.essai');
    for (let i = 1; i <= 4; i++) await expect(etape(q => connecter(q, ctx, poste, 'agent.essai', 'mauvais'))).rejects.toMatchObject({ code: 'IDENTIFICATION_ECHOUEE' });
    expect((await getPool().query('SELECT echecs_connexion FROM utilisateur WHERE id = $1', [u.utilisateurId])).rows[0].echecs_connexion).toBe(4);
    await expect(etape(q => connecter(q, ctx, poste, 'agent.essai', 'mauvais'))).rejects.toMatchObject({ code: 'COMPTE_SUSPENDU' });
    await expect(etape(q => connecter(q, ctx, poste, 'agent.essai', MDP))).rejects.toMatchObject({ code: 'COMPTE_INACTIF' });
    const echecs = await getPool().query(`SELECT count(*)::int n FROM journal_audit WHERE objet_id = $1 AND action = 'ECHEC_CONNEXION'`, [u.utilisateurId]);
    expect(echecs.rows[0].n).toBe(6);
    // Réactivation par l'administrateur
    await transaction(admin.utilisateurId, q => changerStatut(q, admin, u.utilisateurId!, 'ACTIF', 'Identité vérifiée'));
  });

  it('second facteur par SMS : code envoyé au téléphone vérifié, jamais conservé en clair', async () => {
    const r1 = await etape(q => connecter(q, ctx, poste, 'agent.essai', MDP));
    expect(r1.methode).toBe('SMS');
    expect(r1.etape).toBe('SECOND_FACTEUR');
    const tel = (await getPool().query(`SELECT telephone_verifie FROM utilisateur WHERE identifiant = 'agent.essai'`)).rows[0].telephone_verifie;
    const code = sms.dernier(tel)!.texte.match(/\d{6}/)![0];
    const stocke = (await getPool().query(`SELECT empreinte_code FROM code_usage_unique ORDER BY cree_le DESC LIMIT 1`)).rows[0].empreinte_code;
    expect(stocke).not.toContain(code);
    // Le jeton intermédiaire ne donne accès à rien
    await expect(verifierJeton(getPool(), ctx, r1.jeton).then(s => { if (s.etape !== 'OUVERTE') throw new Error('non ouverte'); })).rejects.toThrow();
    const r2 = await etape(q => verifierSecondFacteur(q, ctx, poste, session(r1.jeton), code));
    expect(r2.etape).toBe('OUVERTE');
    expect((await verifierJeton(getPool(), ctx, r2.jeton)).uid).toBeTruthy();
    // Le jeton intermédiaire est révoqué après usage
    await expect(verifierJeton(getPool(), ctx, r1.jeton)).rejects.toMatchObject({ code: 'SESSION_INVALIDE' });
  });

  it('refuse un code SMS erroné', async () => {
    const r1 = await etape(q => connecter(q, ctx, poste, 'agent.essai', MDP));
    await expect(etape(q => verifierSecondFacteur(q, ctx, poste, session(r1.jeton), '000000'))).rejects.toMatchObject({ code: 'CODE_INCORRECT' });
  });
});

describe('TOTP obligatoire pour les comptes à privilèges', () => {
  it('impose l\'enrôlement, puis exige le TOTP ; codes de secours à usage unique', async () => {
    const r1 = await etape(q => connecter(q, ctx, poste, 'admin', MDP));
    expect(r1.methode).toBe('SMS');
    const code = sms.dernier('+224620000001')!.texte.match(/\d{6}/)![0];
    const r2 = await etape(q => verifierSecondFacteur(q, ctx, poste, session(r1.jeton), code));
    expect(r2.etape).toBe('ENROLEMENT_TOTP'); // session limitée à l'enrôlement
    const { secret, uri } = await transaction(null, q => demarrerEnrolementTotp(q, ctx, session(r2.jeton)));
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    const stocke = (await getPool().query(`SELECT secret_chiffre FROM facteur_authentification WHERE type = 'TOTP' ORDER BY cree_le DESC LIMIT 1`)).rows[0].secret_chiffre;
    expect(Buffer.from(stocke).toString('latin1')).not.toContain(secret);
    const r3 = await transaction(null, q => confirmerEnrolementTotp(q, ctx, poste, session(r2.jeton), codeTotp(secret)));
    expect(r3.etape).toBe('OUVERTE');
    expect(r3.codesSecours).toHaveLength(10);

    // Connexion suivante : TOTP demandé, plus de SMS
    const r4 = await etape(q => connecter(q, ctx, poste, 'admin', MDP));
    expect(r4.methode).toBe('TOTP');
    const r5 = await etape(q => verifierSecondFacteur(q, ctx, poste, session(r4.jeton), codeTotp(secret)));
    expect(r5.etape).toBe('OUVERTE');

    // Code de secours : accepté une fois seulement
    const secours = r3.codesSecours[0]!;
    const r6 = await etape(q => connecter(q, ctx, poste, 'admin', MDP));
    expect((await etape(q => verifierSecondFacteur(q, ctx, poste, session(r6.jeton), secours))).methode).toBe('CODE_SECOURS');
    const r7 = await etape(q => connecter(q, ctx, poste, 'admin', MDP));
    await expect(etape(q => verifierSecondFacteur(q, ctx, poste, session(r7.jeton), secours))).rejects.toMatchObject({ code: 'CODE_INCORRECT' });
  });

  it('révoque les sessions d\'un compte suspendu', async () => {
    const u = await utilisateur(admin, 'gestion.revocation');
    const r1 = await etape(q => connecter(q, ctx, poste, 'gestion.revocation', MDP));
    const tel = (await getPool().query(`SELECT telephone_verifie FROM utilisateur WHERE id = $1`, [u.utilisateurId])).rows[0].telephone_verifie;
    const r2 = await etape(q => verifierSecondFacteur(q, ctx, poste, session(r1.jeton), sms.dernier(tel)!.texte.match(/\d{6}/)![0]));
    await verifierJeton(getPool(), ctx, r2.jeton);
    await transaction(dg.utilisateurId, q => changerStatut(q, dg, u.utilisateurId!, 'SUSPENDU', 'Fin de contrat'));
    await expect(verifierJeton(getPool(), ctx, r2.jeton)).rejects.toMatchObject({ code: 'SESSION_INVALIDE' });
  });
});

describe('Dispense de second facteur (essais)', () => {
  it('ouvre directement la session d\'un compte dispensé, tracée comme telle', async () => {
    const essai: ContexteAuth = { ...ctx, dispenseSecondFacteur: new Set(['direction']) };
    const r = await etape(q => connecter(q, essai, poste, 'direction', MDP));
    expect(r).toMatchObject({ etape: 'OUVERTE', methode: 'DISPENSE_ESSAI' });
    const j = await getPool().query(`SELECT valeur_apres FROM journal_audit WHERE action = 'CONNEXION' ORDER BY rang DESC LIMIT 1`);
    expect(j.rows[0].valeur_apres.methode).toBe('DISPENSE_ESSAI');
    // Sans dispense, le même compte reste soumis au second facteur
    expect((await etape(q => connecter(q, ctx, poste, 'direction', MDP))).etape).not.toBe('OUVERTE');
  });

  it('est refusée en production', () => {
    expect(() => chargerConfig({
      NODE_ENV: 'production', DATABASE_URL: 'postgres://x/y', JWT_SECRET: randomBytes(32).toString('hex'),
      VAULT_ADDR: 'https://vault.local', VAULT_TOKEN: 't', SECOND_FACTEUR_DISPENSE: 'admin',
    })).toThrow(/interdit en production/);
  });
});
