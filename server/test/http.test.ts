/** Parcours HTTP : connexion complète, contrôle des droits côté serveur, CA-ORG-03 par appel direct. */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool } from '../src/db/pool.js';
import { creerApplication } from '../src/app.js';
import { codeTotp } from '../src/modules/auth/totp.js';
import type { Acteur } from '../src/noyau/acteur.js';
import { configTest } from './env.js';
import { fermer, installee, MDP, ouvrir, sms, utilisateur } from './outils.js';

const { app } = creerApplication(configTest());
let admin: Acteur, dg: Acteur;

/** Connexion complète par l'API : mot de passe, code SMS, enrôlement TOTP si le compte est privilégié. */
const secrets = new Map<string, string>();
async function seConnecter(identifiant: string): Promise<string> {
  const r1 = await request(app).post('/api/auth/connexion').send({ identifiant, motDePasse: MDP }).expect(200);
  if (r1.body.methode === 'TOTP') {
    const r = await request(app).post('/api/auth/second-facteur').set('Authorization', `Bearer ${r1.body.jeton}`).send({ code: codeTotp(secrets.get(identifiant)!) }).expect(200);
    return r.body.jeton;
  }
  const tel = (await getPool().query('SELECT telephone_verifie FROM utilisateur WHERE identifiant = $1', [identifiant])).rows[0].telephone_verifie;
  const code = sms.dernier(tel)!.texte.match(/\d{6}/)![0];
  const r2 = await request(app).post('/api/auth/second-facteur').set('Authorization', `Bearer ${r1.body.jeton}`).send({ code }).expect(200);
  if (r2.body.etape === 'OUVERTE') return r2.body.jeton;
  expect(r2.body.etape).toBe('ENROLEMENT_TOTP');
  // Avant l'enrôlement, aucune fonction n'est accessible
  await request(app).get('/api/auth/moi').set('Authorization', `Bearer ${r2.body.jeton}`).expect(401);
  const e = await request(app).post('/api/auth/totp/enrolement').set('Authorization', `Bearer ${r2.body.jeton}`).expect(200);
  secrets.set(identifiant, e.body.secret);
  const r3 = await request(app).post('/api/auth/totp/confirmation').set('Authorization', `Bearer ${r2.body.jeton}`).send({ code: codeTotp(e.body.secret) }).expect(200);
  return r3.body.jeton;
}

beforeAll(async () => { await ouvrir(); ({ admin, dg } = await installee()); });
afterAll(fermer);

describe('API', () => {
  it('refuse tout accès sans jeton', async () => {
    await request(app).get('/api/bureaux').expect(401);
    const r = await request(app).post('/api/auth/connexion').send({ identifiant: 'admin', motDePasse: 'faux' }).expect(401);
    expect(r.body.code).toBe('IDENTIFICATION_ECHOUEE');
  });

  it('CA-ORG-03 : un utilisateur limité au bureau 01 n\'accède à aucun autre bureau, même par appel direct', async () => {
    const jAdmin = await seConnecter('admin');
    const b1 = await request(app).post('/api/bureaux').set('Authorization', `Bearer ${jAdmin}`).send({ nom: 'Bureau Kaloum', type: 'BUREAU_DIRECT', adresse: 'Kaloum, Conakry' }).expect(201);
    const b2 = await request(app).post('/api/bureaux').set('Authorization', `Bearer ${jAdmin}`).send({ nom: 'Bureau Kankan', type: 'BUREAU_DIRECT', adresse: 'Kankan' }).expect(201);
    expect([b1.body.code, b2.body.code]).toEqual(['01', '02']);

    await utilisateur(admin, 'gest.kaloum', [{ code: 'GEST_PRODUCTION', perimetre: { bureaux: ['01'] } }], dg);
    const j = await seConnecter('gest.kaloum');
    const liste = await request(app).get('/api/bureaux').set('Authorization', `Bearer ${j}`).expect(200);
    expect(liste.body.map((b: { code: string }) => b.code)).toEqual(['01']);
    await request(app).get(`/api/bureaux/${b1.body.id}`).set('Authorization', `Bearer ${j}`).expect(200);
    await request(app).get(`/api/bureaux/${b2.body.id}`).set('Authorization', `Bearer ${j}`).expect(404);
    // Fonction hors de ses droits : refusée côté serveur
    const r = await request(app).post('/api/bureaux').set('Authorization', `Bearer ${j}`).send({ nom: 'X', type: 'BUREAU_DIRECT', adresse: 'X' }).expect(403);
    expect(r.body.code).toBe('INTERDIT');
    await request(app).get('/api/admin/utilisateurs').set('Authorization', `Bearer ${j}`).expect(403);
  });

  it('expose les droits de l\'utilisateur pour construire le menu', async () => {
    const j = await seConnecter('gest.kaloum');
    const moi = await request(app).get('/api/auth/moi').set('Authorization', `Bearer ${j}`).expect(200);
    expect(moi.body.identifiant).toBe('gest.kaloum');
    expect(moi.body.droits).toContain('SOUSCRIPTION:CREER');
    expect(moi.body.droits).not.toContain('PAIEMENT:VALIDER:2');
  });

  it('trace la consultation d\'une fiche tiers et l\'export du journal', async () => {
    const j = await seConnecter('admin');
    const t = await request(app).post('/api/tiers').set('Authorization', `Bearer ${j}`).send({ nature: 'PHYSIQUE', nom: 'BAH', prenoms: 'Ibrahima', date_naissance: '1985-02-03' }).expect(201);
    await request(app).get(`/api/tiers/${t.body.id}`).set('Authorization', `Bearer ${j}`).expect(200);
    const trace = await getPool().query(`SELECT count(*)::int n FROM journal_audit WHERE action = 'CONSULTATION' AND objet_id = $1`, [t.body.id]);
    expect(trace.rows[0].n).toBe(1);
    const csv = await request(app).get('/api/admin/audit/export').set('Authorization', `Bearer ${j}`).expect(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    const exp = await getPool().query(`SELECT count(*)::int n FROM journal_audit WHERE action = 'EXPORT'`);
    expect(exp.rows[0].n).toBe(1);
    const verif = await request(app).get('/api/admin/audit/verification').set('Authorization', `Bearer ${j}`).expect(200);
    expect(verif.body.premiereAlteration).toBeNull();
  });

  it('changement de paramètre : soumis au comité, appliqué à la validation', async () => {
    const j = await seConnecter('admin');
    const d = await request(app).post('/api/admin/parametres/SECURITE_ECHECS_MAX/changements').set('Authorization', `Bearer ${j}`)
      .send({ valeur: '4', dateEffet: '2026-01-01', motif: 'Politique de sécurité renforcée' }).expect(201);
    expect(d.body.type_operation).toBe('PARAMETRAGE');
    // L'administrateur ne peut pas valider : il n'appartient pas au comité
    await request(app).post(`/api/admin/validations/${d.body.id}/decision`).set('Authorization', `Bearer ${j}`).send({ decision: 'VALIDE' }).expect(403);
    await utilisateur(admin, 'comite1', [{ code: 'COMITE_PARAMETRAGE' }], dg);
    const jc = await seConnecter('comite1');
    const corb = await request(app).get('/api/admin/validations').set('Authorization', `Bearer ${jc}`).expect(200);
    expect(corb.body.map((x: { id: string }) => x.id)).toContain(d.body.id);
    await request(app).post(`/api/admin/validations/${d.body.id}/decision`).set('Authorization', `Bearer ${jc}`).send({ decision: 'VALIDE' }).expect(200);
    const p = await request(app).get('/api/admin/parametres').set('Authorization', `Bearer ${j}`).expect(200);
    expect(p.body.find((x: { code: string }) => x.code === 'SECURITE_ECHECS_MAX').valeur).toBe('4');
  });

  it('fiche de la Compagnie par l\'API : proposée par l\'administrateur, validée par la Direction générale', async () => {
    const j = await seConnecter('admin');
    const avant = await request(app).get('/api/societe').set('Authorization', `Bearer ${j}`).expect(200);
    expect(avant.body.manquants).toContain('RCCM');
    const d = await request(app).post('/api/societe/modifications').set('Authorization', `Bearer ${j}`)
      .send({ valeurs: { raison_sociale: 'CGS Assurances', rccm: 'GN.KAL.2019.B.1234' }, dateEffet: '2020-01-01', motif: 'Fiche initiale' }).expect(201);
    const jDg = await seConnecter('direction');
    await request(app).post(`/api/admin/validations/${d.body.id}/decision`).set('Authorization', `Bearer ${jDg}`).send({ decision: 'VALIDE' }).expect(200);
    const apres = await request(app).get('/api/societe').set('Authorization', `Bearer ${jDg}`).expect(200);
    expect(apres.body.fiche.rccm).toBe('GN.KAL.2019.B.1234');
    expect(apres.body.manquants).not.toContain('RCCM');
    // Le gestionnaire de production n'a aucun droit sur la fiche
    const jg = await seConnecter('gest.kaloum');
    await request(app).get('/api/societe').set('Authorization', `Bearer ${jg}`).expect(403);
  });
});
