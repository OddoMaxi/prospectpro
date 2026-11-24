/** Sous-lot 1.2 – Habilitations : CA-ORG-03 à 06, ORG-RG-042 à 044. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool, transaction } from '../src/db/pool.js';
import type { Acteur } from '../src/noyau/acteur.js';
import { attribuerProfil, creerInterim, definirDelegation } from '../src/modules/habilitations/service.js';
import { controlerDroit, droitsEffectifs } from '../src/modules/habilitations/droits.js';
import { decider, enregistrerOperation, soumettre } from '../src/moteurs/validation.js';
import { fermer, idProfil, installee, ouvrir, utilisateur } from './outils.js';

let admin: Acteur, dg: Acteur;
beforeAll(async () => {
  await ouvrir();
  ({ admin, dg } = await installee());
  enregistrerOperation('PAIEMENT_TEST', { administrative: false, appliquer: async () => undefined });
  await transaction(admin.utilisateurId, async q => definirDelegation(q, admin, {
    typeOperation: 'PAIEMENT_TEST', dateEffet: '2026-01-01',
    niveaux: [{ niveau: 1, profilId: await idProfil('DAF') }, { niveau: 2, profilId: await idProfil('DIRECTION_GENERALE') }],
  }));
});
afterAll(fermer);

describe('Attribution des profils', () => {
  it('interdit l\'auto-attribution (ORG-RG-044)', async () => {
    await expect(transaction(admin.utilisateurId, async q => attribuerProfil(q, admin, { utilisateurId: admin.utilisateurId!, profilId: await idProfil('CONFORMITE') })))
      .rejects.toMatchObject({ code: 'INTERDIT' });
  });

  it('CA-ORG-04 : refuse deux profils incompatibles', async () => {
    const u = await utilisateur(admin, 'compta1', [{ code: 'COMPTABLE' }], dg);
    await expect(transaction(admin.utilisateurId, async q => attribuerProfil(q, admin, { utilisateurId: u.utilisateurId!, profilId: await idProfil('TRESORIER') })))
      .rejects.toMatchObject({ code: 'PROFILS_INCOMPATIBLES' });
  });

  it('n\'active un profil privilégié qu\'après la validation d\'une seconde personne', async () => {
    const u = await utilisateur(admin, 'daf.attente');
    const r = await transaction(admin.utilisateurId, async q => attribuerProfil(q, admin, { utilisateurId: u.utilisateurId!, profilId: await idProfil('DAF') }));
    expect(r.demandeValidation).toBeTruthy();
    expect(await droitsEffectifs(getPool(), u.utilisateurId!)).toHaveLength(0);
    await expect(transaction(u.utilisateurId, q => decider(q, u, r.demandeValidation!, 'VALIDE'))).rejects.toMatchObject({ code: 'INTERDIT' });
    await transaction(dg.utilisateurId, q => decider(q, dg, r.demandeValidation!, 'VALIDE'));
    expect((await droitsEffectifs(getPool(), u.utilisateurId!)).some(d => d.fonction === 'PAIEMENT' && d.action === 'VALIDER')).toBe(true);
  });
});

describe('Validation et séparation des tâches', () => {
  it('CA-ORG-05 : l\'administrateur ne peut pas valider un paiement', async () => {
    const tresorier = await utilisateur(admin, 'treso1', [{ code: 'TRESORIER' }], dg);
    const d = await transaction(tresorier.utilisateurId, q => soumettre(q, tresorier, { typeOperation: 'PAIEMENT_TEST', objetType: 'ordre_paiement', objetId: tresorier.utilisateurId!, montant: 1_000_000 }));
    await expect(transaction(admin.utilisateurId, q => decider(q, admin, d.id, 'VALIDE'))).rejects.toThrow(/Administrateur général ne valide/);
    // … ni figurer dans un circuit de validation financier
    await expect(transaction(admin.utilisateurId, async q => definirDelegation(q, admin, {
      typeOperation: 'PAIEMENT_TEST', dateEffet: '2026-02-01', niveaux: [{ niveau: 1, profilId: await idProfil('ADMIN_GENERAL') }],
    }))).rejects.toMatchObject({ code: 'INTERDIT' });
  });

  it('un même valideur ne valide pas deux niveaux, et chaque niveau exige son profil', async () => {
    const daf = await utilisateur(admin, 'daf2', [{ code: 'DAF' }], dg);
    const tresorier = await utilisateur(admin, 'treso2', [{ code: 'TRESORIER' }], dg);
    const d = await transaction(tresorier.utilisateurId, q => soumettre(q, tresorier, { typeOperation: 'PAIEMENT_TEST', objetType: 'ordre_paiement', objetId: daf.utilisateurId!, montant: 5 }));
    expect(d.niveaux_requis).toBe(2);
    await expect(transaction(dg.utilisateurId, q => decider(q, dg, d.id, 'VALIDE'))).rejects.toThrow(/niveau 1/);
    await transaction(daf.utilisateurId, q => decider(q, daf, d.id, 'VALIDE'));
    await expect(transaction(daf.utilisateurId, q => decider(q, daf, d.id, 'VALIDE'))).rejects.toThrow(/déjà validé un niveau/);
    const fin = await transaction(dg.utilisateurId, q => decider(q, dg, d.id, 'VALIDE'));
    expect(fin.statut).toBe('VALIDE');
  });

  it('un rejet exige un motif', async () => {
    const daf = await utilisateur(admin, 'daf3', [{ code: 'DAF' }], dg);
    const d = await transaction(dg.utilisateurId, q => soumettre(q, dg, { typeOperation: 'PAIEMENT_TEST', objetType: 'ordre_paiement', objetId: daf.utilisateurId! }));
    await expect(transaction(daf.utilisateurId, q => decider(q, daf, d.id, 'REJETE'))).rejects.toMatchObject({ code: 'MOTIF_REQUIS' });
  });
});

describe('Intérim', () => {
  it('CA-ORG-06 : les droits délégués cessent automatiquement à la fin de l\'intérim', async () => {
    const titulaire = await utilisateur(admin, 'daf.titulaire', [{ code: 'DAF' }], dg);
    const suppleant = await utilisateur(admin, 'daf.suppleant', [{ code: 'DIRECTION_GENERALE' }], dg);
    const initiateur = await utilisateur(admin, 'treso3', [{ code: 'TRESORIER' }], dg);
    const debut = new Date(Date.now() - 60_000).toISOString(), fin = new Date(Date.now() + 3_600_000).toISOString();
    const interimId = await transaction(titulaire.utilisateurId, q => creerInterim(q, titulaire, { delegataireId: suppleant.utilisateurId!, debut, fin, motif: 'Congés' }));
    const d1 = await transaction(initiateur.utilisateurId, q => soumettre(q, initiateur, { typeOperation: 'PAIEMENT_TEST', objetType: 'ordre_paiement', objetId: initiateur.utilisateurId! }));
    await transaction(suppleant.utilisateurId, q => decider(q, suppleant, d1.id, 'VALIDE')); // niveau 1 par intérim
    const etape = await getPool().query('SELECT interim_id FROM validation_etape WHERE demande_validation_id = $1', [d1.id]);
    expect(etape.rows[0].interim_id).toBe(interimId);

    await getPool().query(`UPDATE interim SET date_fin = now() - interval '1 second' WHERE id = $1`, [interimId]); // l'intérim est échu
    const d2 = await transaction(initiateur.utilisateurId, q => soumettre(q, initiateur, { typeOperation: 'PAIEMENT_TEST', objetType: 'ordre_paiement', objetId: initiateur.utilisateurId! }));
    await expect(transaction(suppleant.utilisateurId, q => decider(q, suppleant, d2.id, 'VALIDE'))).rejects.toThrow(/habilité à valider le niveau 1/);
  });
});

describe('Périmètre', () => {
  it('CA-ORG-03 : un droit limité au bureau 01 renvoie ce seul périmètre', async () => {
    const u = await utilisateur(admin, 'gest.bureau1', [{ code: 'GEST_PRODUCTION', perimetre: { bureaux: ['01'] } }], dg);
    expect(await controlerDroit(getPool(), u.utilisateurId!, 'SOUSCRIPTION', 'CREER')).toEqual({ bureaux: ['01'] });
    await expect(controlerDroit(getPool(), u.utilisateurId!, 'PAIEMENT', 'VALIDER')).rejects.toMatchObject({ code: 'INTERDIT' });
  });
});
