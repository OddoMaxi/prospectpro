/** Sous-lot 2.2 – Intervenants et comptes de production : CA-COM-01, 02, 04 (solde), 05, 07, 09, 16, 17, 24 ; COM-RG-001 à 056. */
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool, transaction } from '../src/db/pool.js';
import type { Acteur } from '../src/noyau/acteur.js';
import { aujourdhui } from '../src/noyau/dates.js';
import { decider } from '../src/moteurs/validation.js';
import { appliquerChangement } from '../src/moteurs/parametres.js';
import { configurerStockage, StockageLocal } from '../src/moteurs/documents.js';
import { GardienLocal, MoteurChiffrement } from '../src/moteurs/chiffrement.js';
import { creerTiers } from '../src/modules/referentiels/tiers.js';
import { creerBureau } from '../src/modules/referentiels/bureaux.js';
import { proposerCoordonnee } from '../src/modules/referentiels/coordonnees.js';
import { creerBanqueOperateur } from '../src/modules/finances/tresorerie.js';
import {
  activerEmission, affecterBureau, changerStatutIntervenant, conditionsEmission, creerIntervenant, enregistrerTraite, proposerAgrement,
} from '../src/modules/commercial/intervenants.js';
import {
  compteProductionDuBureau, confirmerApprovisionnement, controlerCollectif, declarerApprovisionnement, demanderRestitution, executerRestitution, mouvementer,
} from '../src/modules/commercial/comptesProduction.js';
import { STOCKAGE_TEST } from './env.js';
import { fermer, ficheSocieteComplete, installee, MDP, ouvrir, pieceFictive, sms, utilisateur } from './outils.js';
import { creerUtilisateur } from '../src/modules/habilitations/service.js';

let admin: Acteur, dg: Acteur, resp1: Acteur, resp2: Acteur, conformite: Acteur, caissier: Acteur, tresorier: Acteur, daf: Acteur, comptable: Acteur;
let agentTiers: string, agent: string, bureau07: string, bureau12: string, ecritureQuelconque: string;
const chiffrement = new MoteurChiffrement(new GardienLocal(randomBytes(32)));
const valider = (qui: Acteur, id: string) => transaction(qui.utilisateurId, q => decider(q, qui, id, 'VALIDE'));
const solde = async (bureauId: string) => (await compteProductionDuBureau(getPool(), bureauId)).solde;

beforeAll(async () => {
  await ouvrir();
  ({ admin, dg } = await installee());
  configurerStockage(new StockageLocal(STOCKAGE_TEST));
  await ficheSocieteComplete(admin, dg);
  resp1 = await utilisateur(admin, 'resp.commercial', [{ code: 'RESP_COMMERCIAL' }], dg);
  resp2 = await utilisateur(admin, 'resp.adjoint', [{ code: 'RESP_COMMERCIAL' }], dg);
  conformite = await utilisateur(admin, 'conformite', [{ code: 'CONFORMITE' }], dg);
  caissier = await utilisateur(admin, 'caissier', [{ code: 'CAISSIER' }], dg);
  tresorier = await utilisateur(admin, 'tresorier', [{ code: 'TRESORIER' }], dg);
  daf = await utilisateur(admin, 'daf', [{ code: 'DAF' }], dg);
  comptable = await utilisateur(admin, 'comptable', [{ code: 'COMPTABLE' }], dg);
  await transaction(admin.utilisateurId, q => creerBanqueOperateur(q, admin, { code: 'ECO', nom: 'Ecobank Guinée', type: 'BANQUE', compteNumero: '5621', responsableId: tresorier.utilisateurId! }));
  bureau07 = (await transaction(admin.utilisateurId, q => creerBureau(q, admin, { code: '07', nom: 'Bureau Matoto', type: 'BUREAU_DIRECT', adresse: 'Matoto' }))).id;
  bureau12 = (await transaction(admin.utilisateurId, q => creerBureau(q, admin, { code: '12', nom: 'Bureau Kindia', type: 'BUREAU_DIRECT', adresse: 'Kindia' }))).id;
  agentTiers = await transaction(admin.utilisateurId, q => creerTiers(q, admin, { nature: 'PHYSIQUE', nom: 'SOW', prenoms: 'Alpha', date_naissance: '1975-01-01', telephone: '+224622100001' }));
  ecritureQuelconque = '';
});
afterAll(fermer);

describe('Intervenants et activation de l\'émission (COM-RG-001 à 003, 060)', () => {
  it('agrément de l\'agent général : traité obligatoire, Direction commerciale puis visa de la Conformité', async () => {
    agent = await transaction(resp1.utilisateurId, q => creerIntervenant(q, resp1, { tiersId: agentTiers, role: 'AGENT_GENERAL' }));
    await expect(transaction(resp1.utilisateurId, q => proposerAgrement(q, resp1, agent))).rejects.toMatchObject({ code: 'TRAITE_REQUIS' });
    await transaction(resp1.utilisateurId, async q => enregistrerTraite(q, resp1, agent, await pieceFictive('intervenant')));
    const d = await transaction(resp1.utilisateurId, q => proposerAgrement(q, resp1, agent));
    await expect(valider(resp1, d.id)).rejects.toMatchObject({ statut: 403 }); // l'auteur ne valide pas
    await valider(resp2, d.id);
    expect((await getPool().query('SELECT statut FROM intervenant WHERE id = $1', [agent])).rows[0].statut).toBe('EN_AGREMENT');
    await valider(conformite, d.id);
    const i = (await getPool().query('SELECT statut, visa_conformite_id, agrement_accorde_le FROM intervenant WHERE id = $1', [agent])).rows[0];
    expect(i).toMatchObject({ statut: 'ACTIF', visa_conformite_id: conformite.utilisateurId });
  });

  it('CA-COM-01 : sans bureau direct actif ni habilitation à un produit, l\'émission n\'est pas activable', async () => {
    await expect(transaction(resp1.utilisateurId, q => activerEmission(q, resp1, agent))).rejects.toMatchObject({ code: 'EMISSION_NON_ACTIVABLE' });
    expect(await conditionsEmission(getPool(), agent)).toEqual(['Gestion d\'un bureau direct actif', 'Habilitation à au moins un produit (barème de commission)']);
    await transaction(resp1.utilisateurId, q => affecterBureau(q, resp1, { bureauId: bureau07, intervenantId: agent }));
    await transaction(resp1.utilisateurId, q => affecterBureau(q, resp1, { bureauId: bureau12, intervenantId: agent }));
    const modele = (await getPool().query(`SELECT id FROM modele_document LIMIT 1`)).rows[0].id;
    const produit = (await getPool().query(
      `INSERT INTO produit (code, libelle, branche_bcrg, type_couverture, type_contrat, age_min, age_max, duree_mois, documents_exiges, modele_cg_id, modele_cp_id, ristourne_deces, date_effet)
       VALUES ('10', 'Santé famille', 'MALADIE', 'FAMILLE', 'INDIVIDUEL', 18, 65, 12, '[]', $1, $1, false, '2020-01-01') RETURNING id`, [modele])).rows[0].id;
    await getPool().query(`INSERT INTO bareme_commission (produit_id, role, taux, assiette, date_effet) VALUES ($1, 'AGENT_GENERAL', 0.10, 'PRIME_NETTE', '2020-01-01')`, [produit]);
    await transaction(resp1.utilisateurId, q => activerEmission(q, resp1, agent));
    expect((await getPool().query('SELECT emission_activee FROM intervenant WHERE id = $1', [agent])).rows[0].emission_activee).toBe(true);
  });

  it('COM-RG-003 : chaque bureau a son propre compte de production, auxiliaire distinct du même agent', async () => {
    const a = (await getPool().query(
      `SELECT b.code, ca.code AS aux FROM compte_production_agent cp JOIN bureau b ON b.id = cp.bureau_id JOIN compte_auxiliaire ca ON ca.id = cp.compte_auxiliaire_id ORDER BY b.code`)).rows;
    expect(a.map(x => x.code)).toEqual(['07', '12']);
    expect(a[0].aux).not.toBe(a[1].aux);
    expect(a.every(x => x.aux.startsWith('4111'))).toBe(true);
  });
});

describe('Approvisionnements (COM-RG-010 à 013)', () => {
  it('CA-COM-24 : un premier approvisionnement inférieur au minimum est refusé, minimum affiché', async () => {
    const cp = await compteProductionDuBureau(getPool(), bureau07);
    await expect(transaction(caissier.utilisateurId, q => declarerApprovisionnement(q, caissier, { compteId: cp.id, moyen: 'ESPECES_SIEGE', montant: 5_000_000 })))
      .rejects.toMatchObject({ code: 'MINIMUM_NON_ATTEINT', message: expect.stringContaining('10 000 000 GNF') });
  });

  it('COM-RG-012 : l\'agent ne confirme jamais lui-même un approvisionnement', async () => {
    const cp = await compteProductionDuBureau(getPool(), bureau07);
    const u = await transaction(admin.utilisateurId, q => creerUtilisateur(q, admin, { identifiant: 'agent.sow', tiersId: agentTiers, typeCompte: 'AGENT_GENERAL', motDePasse: MDP, telephone: '+224622100001' }));
    const agentU = { utilisateurId: u, adresseIp: null, appareil: null, trace: () => ({ utilisateurId: u, adresseIp: null, appareil: null }) } as unknown as Acteur;
    await expect(transaction(u, q => declarerApprovisionnement(q, agentU, { compteId: cp.id, moyen: 'ESPECES_SIEGE', montant: 10_000_000 }))).rejects.toMatchObject({ code: 'INTERDIT' });
  });

  it('espèces confirmées à la saisie : solde, reçu, écriture EVT-01 au journal DEP, SMS à l\'agent', async () => {
    const cp = await compteProductionDuBureau(getPool(), bureau07);
    const r = await transaction(caissier.utilisateurId, q => declarerApprovisionnement(q, caissier, { compteId: cp.id, moyen: 'ESPECES_SIEGE', montant: 10_000_000 }));
    expect(r).toMatchObject({ statut: 'CONFIRME', solde: 10_000_000 });
    expect(r.numero).toMatch(/^DEP\d{12}$/);
    expect((r as { piece: string }).piece).toMatch(/^DEP\d{4}00000001$/);
    expect(sms.dernier('+224622100001')!.texte).toContain('10 000 000 GNF');
    ecritureQuelconque = (await getPool().query(`SELECT id FROM ecriture WHERE numero_piece = $1`, [(r as { piece: string }).piece])).rows[0].id;
    expect(await controlerCollectif(getPool())).toMatchObject({ ecart: 0 });
  });

  it('CA-COM-02 : un approvisionnement bancaire déclaré non confirmé ne change ni le solde ni la comptabilité', async () => {
    const cp = await compteProductionDuBureau(getPool(), bureau12);
    const pieces = (await getPool().query('SELECT count(*)::int n FROM ecriture')).rows[0].n;
    const r = await transaction(resp1.utilisateurId, q => declarerApprovisionnement(q, resp1, { compteId: cp.id, moyen: 'BANQUE', montant: 12_000_000, banque: 'ECO', referenceExterne: 'VIR-0001' }));
    expect(r.statut).toBe('DECLARE');
    expect(await solde(bureau12)).toBe(0);
    expect((await getPool().query('SELECT count(*)::int n FROM ecriture')).rows[0].n).toBe(pieces);
    await expect(transaction(resp1.utilisateurId, q => declarerApprovisionnement(q, resp1, { compteId: cp.id, moyen: 'BANQUE', montant: 12_000_000, banque: 'ECO', referenceExterne: 'VIR-0001' })))
      .rejects.toMatchObject({ code: 'OPERATION_DEJA_DECLAREE' });
    await transaction(tresorier.utilisateurId, q => confirmerApprovisionnement(q, tresorier, r.id));
    expect(await solde(bureau12)).toBe(12_000_000);
    const j = (await getPool().query(`SELECT j.code FROM ecriture e JOIN journal j ON j.id = e.journal_id ORDER BY e.rang DESC LIMIT 1`)).rows[0].code;
    expect(j).toBe('DEP');
    expect(await controlerCollectif(getPool())).toMatchObject({ ecart: 0 });
  });
});

describe('Débit du compte de production (COM-RG-020 à 024)', () => {
  it('CA-COM-04 : solde 3 910 000, prime 6 090 000 : refus et manque de 2 180 000 affiché', async () => {
    const cp = await compteProductionDuBureau(getPool(), bureau07);
    await transaction(admin.utilisateurId, q => mouvementer(q, admin, { compteId: cp.id, nature: 'EMISSION', montant: 6_090_000, reference: 'POLICE-A', ecritureId: ecritureQuelconque }));
    expect(await solde(bureau07)).toBe(3_910_000);
    await expect(transaction(admin.utilisateurId, q => mouvementer(q, admin, { compteId: cp.id, nature: 'EMISSION', montant: 6_090_000, reference: 'POLICE-B', ecritureId: ecritureQuelconque })))
      .rejects.toMatchObject({ code: 'SOLDE_INSUFFISANT', message: 'Solde insuffisant : il manque 2 180 000 GNF' });
    expect(await solde(bureau07)).toBe(3_910_000);
  });

  it('CA-COM-05 : deux émissions simultanées pour un solde qui n\'en couvre qu\'une', async () => {
    const cp = await compteProductionDuBureau(getPool(), bureau07);
    const r = await Promise.allSettled([1, 2].map(i => transaction(admin.utilisateurId, q => mouvementer(q, admin, { compteId: cp.id, nature: 'EMISSION', montant: 3_000_000, reference: `SIMUL-${i}`, ecritureId: ecritureQuelconque }))));
    expect(r.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    expect(r.filter(x => x.status === 'rejected')).toHaveLength(1);
    expect(await solde(bureau07)).toBe(910_000);
    await expect(getPool().query('UPDATE compte_production_agent SET solde = -1 WHERE id = $1', [cp.id])).rejects.toThrow(/compte_production_solde_ck/);
  });

  it('CA-COM-09 : bureau 07 insuffisant, bureau 12 suffisant : refus au 07, rien prélevé au 12', async () => {
    const cp07 = await compteProductionDuBureau(getPool(), bureau07);
    await expect(transaction(admin.utilisateurId, q => mouvementer(q, admin, { compteId: cp07.id, nature: 'EMISSION', montant: 2_000_000, reference: 'P07', ecritureId: ecritureQuelconque })))
      .rejects.toMatchObject({ code: 'SOLDE_INSUFFISANT' });
    expect(await solde(bureau12)).toBe(12_000_000);
  });
});

describe('Restitution (COM-RG-050 à 053)', () => {
  let coordonnee: string;
  beforeAll(async () => {
    const c = await transaction(resp1.utilisateurId, q => proposerCoordonnee(q, resp1, chiffrement, { tiersId: agentTiers, type: 'BANQUE', etablissement: 'Ecobank', numero: 'GN0099887766554433', intitule: 'SOW Alpha' }));
    await valider(comptable, c.demandeValidation);
    coordonnee = c.id;
  });

  it('CA-COM-17 : demande refusée tant qu\'une émission est annulable, heure de recevabilité indiquée', async () => {
    const cp = await compteProductionDuBureau(getPool(), bureau12);
    await transaction(admin.utilisateurId, q => mouvementer(q, admin, { compteId: cp.id, nature: 'EMISSION', montant: 2_000_000, reference: 'P12', ecritureId: ecritureQuelconque }));
    await expect(transaction(resp1.utilisateurId, q => demanderRestitution(q, resp1, { compteId: cp.id, motif: 'DEMANDE_MOTIVEE', justification: 'Trésorerie', coordonneePaiementId: coordonnee })))
      .rejects.toMatchObject({ code: 'RESTITUTION_PREMATUREE', message: expect.stringMatching(/recevable à partir du/) });
  });

  it('CA-COM-07 : compte gelé dès la demande ; émission refusée ; montant restitué = solde à la demande', async () => {
    await transaction(admin.utilisateurId, q => appliquerChangement(q, admin, 'COM_ANNULATION_ERREUR_HEURES', '0', aujourdhui(), null));
    const cp = await compteProductionDuBureau(getPool(), bureau12);
    const d = await transaction(resp1.utilisateurId, q => demanderRestitution(q, resp1, { compteId: cp.id, motif: 'DEMANDE_MOTIVEE', justification: 'Besoin de trésorerie', coordonneePaiementId: coordonnee }));
    expect(d.soldeFige).toBe(10_000_000);
    await expect(transaction(admin.utilisateurId, q => mouvementer(q, admin, { compteId: cp.id, nature: 'EMISSION', montant: 100, reference: 'X', ecritureId: ecritureQuelconque })))
      .rejects.toMatchObject({ code: 'COMPTE_PRODUCTION_GELE' });
    await expect(transaction(caissier.utilisateurId, q => declarerApprovisionnement(q, caissier, { compteId: cp.id, moyen: 'ESPECES_SIEGE', montant: 1_000_000 })))
      .rejects.toMatchObject({ code: 'COMPTE_PRODUCTION_GELE' });
    await valider(resp2, d.demandeValidation);
    await valider(daf, d.demandeValidation);
    await transaction(tresorier.utilisateurId, async q => executerRestitution(q, tresorier, d.id, { pieceDocumentId: await pieceFictive(), banque: 'ECO' }));
    const apres = await compteProductionDuBureau(getPool(), bureau12);
    expect(apres).toMatchObject({ solde: 0, statut: 'ACTIF' });
    expect((await getPool().query(`SELECT j.code FROM ecriture e JOIN journal j ON j.id = e.journal_id ORDER BY e.rang DESC LIMIT 1`)).rows[0].code).toBe('ECO');
    expect(await controlerCollectif(getPool())).toMatchObject({ ecart: expect.any(Number) });
  });
});

describe('Suspension et sortie (COM-RG-056, 065)', () => {
  it('la suspension gèle les comptes de production ; la réactivation les rouvre', async () => {
    await transaction(resp1.utilisateurId, q => changerStatutIntervenant(q, resp1, agent, 'SUSPENDU', 'Alerte de conformité'));
    expect((await compteProductionDuBureau(getPool(), bureau07)).statut).toBe('GELE');
    await transaction(resp1.utilisateurId, q => changerStatutIntervenant(q, resp1, agent, 'ACTIF', 'Levée de l\'alerte'));
    expect((await compteProductionDuBureau(getPool(), bureau07)).statut).toBe('ACTIF');
  });

  it('CA-COM-16 : la sortie d\'un junior bloque son compte d\'accès', async () => {
    const t = await transaction(admin.utilisateurId, q => creerTiers(q, admin, { nature: 'PHYSIQUE', nom: 'BARRY', prenoms: 'Junior', date_naissance: '1998-01-01', telephone: '+224622100009' }));
    const junior = await transaction(resp1.utilisateurId, q => creerIntervenant(q, resp1, { tiersId: t, role: 'JUNIOR', rattachementId: agent }));
    const u = await transaction(admin.utilisateurId, q => creerUtilisateur(q, admin, { identifiant: 'junior.barry', tiersId: t, typeCompte: 'JUNIOR', motDePasse: MDP, telephone: '+224622100009' }));
    await getPool().query(`UPDATE utilisateur SET statut = 'ACTIF' WHERE id = $1`, [u]);
    await transaction(resp1.utilisateurId, q => changerStatutIntervenant(q, resp1, junior, 'SORTI', 'Démission'));
    expect((await getPool().query('SELECT statut FROM utilisateur WHERE id = $1', [u])).rows[0].statut).toBe('DESACTIVE');
    expect((await getPool().query('SELECT statut, date_sortie FROM intervenant WHERE id = $1', [junior])).rows[0].statut).toBe('SORTI');
  });
});
