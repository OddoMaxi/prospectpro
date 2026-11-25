/** Application agent (web) : profil d'office des comptes du réseau, vérification du téléphone d'un client (REF-RG-005). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool, transaction } from '../src/db/pool.js';
import { creerUtilisateur } from '../src/modules/habilitations/service.js';
import { droitsEffectifs } from '../src/modules/habilitations/droits.js';
import { confirmerVerificationTelephone, demanderVerificationTelephone } from '../src/modules/documents/acceptation.js';
import { Refus } from '../src/modules/auth/service.js';
import { personne, preparer, telephone, valider, type Contexte } from './contexte-production.js';
import { fermer, MDP, ouvrir, sms } from './outils.js';

let c: Contexte;
beforeAll(async () => { await ouvrir(); c = await preparer(); }, 90_000);
afterAll(fermer);

describe('Comptes du réseau commercial', () => {
  it('le junior reçoit d\'office son profil ; celui de l\'agent général, privilégié, part en validation', async () => {
    const j = await personne(c.admin, 'DIABY', '2000-01-01');
    const uj = await transaction(c.admin.utilisateurId, async q => creerUtilisateur(q, c.admin, { identifiant: 'junior.diaby', tiersId: j, typeCompte: 'JUNIOR', motDePasse: MDP, telephone: await telephone(j) }));
    expect((await droitsEffectifs(getPool(), uj)).some(d => d.fonction === 'SOUSCRIPTION' && d.action === 'CREER')).toBe(true);

    const a = await personne(c.admin, 'CONDE', '1970-01-01');
    const ua = await transaction(c.admin.utilisateurId, async q => creerUtilisateur(q, c.admin, { identifiant: 'agent.conde', tiersId: a, typeCompte: 'AGENT_GENERAL', motDePasse: MDP, telephone: await telephone(a) }));
    expect((await droitsEffectifs(getPool(), ua)).length).toBe(0);
    const d = (await getPool().query(`SELECT id FROM demande_validation WHERE type_operation = 'ATTRIBUTION_PROFIL_PRIVILEGIE' AND statut = 'EN_ATTENTE' ORDER BY cree_le DESC LIMIT 1`)).rows[0];
    await valider(c.dg, d.id);
    expect((await droitsEffectifs(getPool(), ua)).some(x => x.fonction === 'COMPTE_PRODUCTION' && x.action === 'CREER')).toBe(true);
  });
});

describe('Vérification du téléphone d\'un client', () => {
  it('code envoyé au numéro de la fiche ; trois essais ; le numéro devient vérifié', async () => {
    const t = await personne(c.admin, 'KOUROUMA', '1985-01-01');
    const tel = await telephone(t);
    const e = await transaction(c.agentU.utilisateurId, q => demanderVerificationTelephone(q, c.agentU, t));
    expect(e.envoyeA).toContain('•••');
    const code = sms.dernier(tel)!.texte.match(/est (\d{6})/)![1]!;
    const faux = await transaction(c.agentU.utilisateurId, q => confirmerVerificationTelephone(q, c.agentU, t, code === '000000' ? '111111' : '000000'));
    expect(faux).toBeInstanceOf(Refus);
    expect((await getPool().query('SELECT telephone_verifie FROM tiers WHERE id = $1', [t])).rows[0].telephone_verifie).not.toBe(true);
    await transaction(c.agentU.utilisateurId, q => confirmerVerificationTelephone(q, c.agentU, t, code));
    expect((await getPool().query('SELECT telephone_verifie FROM tiers WHERE id = $1', [t])).rows[0].telephone_verifie).toBe(true);
    await expect(transaction(c.agentU.utilisateurId, q => demanderVerificationTelephone(q, c.agentU, t))).rejects.toMatchObject({ code: 'DEJA_VERIFIE' });
  });
});
