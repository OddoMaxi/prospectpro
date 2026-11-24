/** Sous-lot 1.1 – Organisation : CA-ORG-01, CA-ORG-02, ORG-RG-005 à 007. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool, transaction } from '../src/db/pool.js';
import type { Acteur } from '../src/noyau/acteur.js';
import { creer, desactiver, organigramme, proposer, renommer } from '../src/modules/organisation/service.js';
import { decider } from '../src/moteurs/validation.js';
import { verifierChaine } from '../src/moteurs/audit.js';
import { fermer, installee, ouvrir, utilisateur } from './outils.js';

let admin: Acteur, dg: Acteur;
beforeAll(async () => { await ouvrir(); ({ admin, dg } = await installee()); });
afterAll(fermer);

const idDe = async (table: string, code: string) => (await getPool().query(`SELECT id FROM ${table} WHERE code = $1`, [code])).rows[0].id as string;

describe('Installation', () => {
  it('crée l\'organisation initiale du § 3.2 et un journal d\'audit intègre', async () => {
    const arbre = await organigramme(getPool());
    expect(arbre.map(d => d.code)).toEqual(['ADMSI', 'COM', 'CONF', 'DG', 'FIN', 'PROD', 'SANTE', 'SIN']);
    expect(arbre.find(d => d.code === 'COM')!.enfants.map(s => s.code)).toEqual(['COM_BUR', 'COM_RES']);
    expect(arbre.find(d => d.code === 'FIN')!.enfants.map(s => s.code)).toEqual(['FIN_CDG', 'FIN_CPT', 'FIN_TRE']);
    expect((await verifierChaine(getPool())).premiereAlteration).toBeNull();
  });
});

describe('Organisation', () => {
  it('CA-ORG-02 : restitue l\'organigramme à une date passée', async () => {
    const com = await idDe('departement', 'COM');
    await expect(transaction(admin.utilisateurId, q => creer(q, admin, 'SERVICE', { code: 'COM_X', libelle: 'Antidaté', parentId: com, dateEffet: '2020-01-01' })))
      .rejects.toMatchObject({ code: 'DATE_ANTERIEURE_AU_RATTACHEMENT' });
    const part = await transaction(admin.utilisateurId, q => creer(q, admin, 'DEPARTEMENT', { code: 'PART', libelle: 'Partenariats', dateEffet: '2026-01-10' }));
    const s = await transaction(admin.utilisateurId, q => creer(q, admin, 'SERVICE', { code: 'COM_PART', libelle: 'Partenariats', parentId: part, dateEffet: '2026-01-15' }));
    await transaction(admin.utilisateurId, q => renommer(q, admin, 'SERVICE', s, 'Partenariats et prescripteurs', '2026-06-01'));
    const avant = await organigramme(getPool(), '2026-03-01');
    const apres = await organigramme(getPool(), '2026-07-01');
    const lib = (a: Awaited<ReturnType<typeof organigramme>>) => a.find(d => d.code === 'PART')?.enfants.find(x => x.code === 'COM_PART')?.libelle;
    expect(lib(avant)).toBe('Partenariats');
    expect(lib(apres)).toBe('Partenariats et prescripteurs');
    expect(lib(await organigramme(getPool(), '2025-12-31'))).toBeUndefined();
  });

  it('CA-ORG-01 : fusion simulée puis validée par un second administrateur', async () => {
    const com = await idDe('departement', 'COM');
    const a = await transaction(admin.utilisateurId, q => creer(q, admin, 'SERVICE', { code: 'COM_NORD', libelle: 'Réseau Nord', parentId: com }));
    const b = await transaction(admin.utilisateurId, q => creer(q, admin, 'SERVICE', { code: 'COM_SUD', libelle: 'Réseau Sud', parentId: com }));
    const fA = await transaction(admin.utilisateurId, q => creer(q, admin, 'FONCTION', { code: 'ANIM_NORD', libelle: 'Animateur Nord', parentId: a }));
    const u = await utilisateur(admin, 'animateur.nord', [{ code: 'RESP_COMMERCIAL', perimetre: { services: [a] } }], dg);
    await getPool().query('UPDATE utilisateur SET fonction_id = $2 WHERE id = $1', [u.utilisateurId, fA]);

    // Désactivation directe refusée : un utilisateur actif (ORG-RG-007)
    await expect(transaction(admin.utilisateurId, q => desactiver(q, admin, 'SERVICE', a))).rejects.toMatchObject({ code: 'ENTITE_OCCUPEE' });

    const { demande, simulation } = await transaction(admin.utilisateurId, q => proposer(q, admin, { operation: 'FUSION', type: 'SERVICE', sources: [a], cibleId: b, dateEffet: new Date().toISOString().slice(0, 10) }));
    expect(simulation.utilisateurs.map((x: { identifiant: string }) => x.identifiant)).toEqual(['animateur.nord']);
    expect(simulation.droits).toHaveLength(1);
    // Rien n'est modifié avant la validation
    expect((await getPool().query('SELECT statut FROM service WHERE id = $1', [a])).rows[0].statut).toBe('ACTIF');
    // L'initiateur ne valide pas sa propre opération (ORG-RG-042)
    await expect(transaction(admin.utilisateurId, q => decider(q, admin, demande.id, 'VALIDE'))).rejects.toMatchObject({ code: 'INTERDIT' });
    await transaction(dg.utilisateurId, q => decider(q, dg, demande.id, 'VALIDE'));

    expect((await getPool().query('SELECT statut FROM service WHERE id = $1', [a])).rows[0].statut).toBe('INACTIF');
    expect((await getPool().query('SELECT service_id FROM fonction WHERE id = $1', [fA])).rows[0].service_id).toBe(b);
    const perim = (await getPool().query(`SELECT perimetre FROM utilisateur_profil WHERE utilisateur_id = $1`, [u.utilisateurId])).rows[0].perimetre;
    expect(perim.services).toEqual([b]);
    // L'ancien service reste visible dans l'historique
    const hist = await organigramme(getPool(), undefined, true);
    expect(hist.find(d => d.code === 'COM')!.enfants.find(s => s.code === 'COM_NORD')!.statut).toBe('INACTIF');
    const h = await getPool().query(`SELECT operation, valide_par, cree_par FROM historique_organisation WHERE entite_id = $1 AND operation = 'FUSION'`, [a]);
    expect(h.rows[0].valide_par).toBe(dg.utilisateurId);
    expect(h.rows[0].cree_par).toBe(admin.utilisateurId);
  });

  it('refuse une scission dont un élément n\'est pas affecté (ORG-RG-004)', async () => {
    const fin = await idDe('departement', 'FIN');
    await expect(transaction(admin.utilisateurId, q => proposer(q, admin, {
      operation: 'SCISSION', type: 'DEPARTEMENT', sourceId: fin, dateEffet: new Date().toISOString().slice(0, 10),
      nouvelles: [{ code: 'CPTA', libelle: 'Comptabilité', enfants: [] }, { code: 'TRESO', libelle: 'Trésorerie', enfants: [] }],
    }))).rejects.toMatchObject({ code: 'SCISSION_INCOMPLETE' });
  });

  it('ne réutilise jamais un code', async () => {
    await expect(transaction(admin.utilisateurId, q => creer(q, admin, 'DEPARTEMENT', { code: 'COM', libelle: 'Autre' }))).rejects.toMatchObject({ code: 'CODE_DEJA_UTILISE' });
  });
});
