/** Sous-lot 2.3 – Souscription et émission : CA-COM-03, 04, 06, 10, 11 ; CA-PROD-01, 02, 23 ; PROD-RG-001 à 012. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool, transaction } from '../src/db/pool.js';
import { Acteur } from '../src/noyau/acteur.js';
import { aujourdhui } from '../src/noyau/dates.js';
import { decider } from '../src/moteurs/validation.js';
import { configurerStockage, StockageLocal } from '../src/moteurs/documents.js';
import { numeroPoliceValide } from '../src/moteurs/numerotation.js';
import { creerTiers } from '../src/modules/referentiels/tiers.js';
import { creerBureau } from '../src/modules/referentiels/bureaux.js';
import { creerUtilisateur } from '../src/modules/habilitations/service.js';
import { creerCodeTaxe } from '../src/modules/comptabilite/plan.js';
import { proposerCatalogue, formuleEnVigueur } from '../src/modules/catalogue/service.js';
import { activerEmission, affecterBureau, creerIntervenant, enregistrerTraite, proposerAgrement, validerControlesJunior } from '../src/modules/commercial/intervenants.js';
import { compteProductionDuBureau, declarerApprovisionnement } from '../src/modules/commercial/comptesProduction.js';
import { accepterRecapitulatif, enregistrerDonnees, expirerDossiers, lireDossier, ouvrirDossier, presenterRecapitulatif, soumettreDossier, tarifierDossier } from '../src/modules/production/dossiers.js';
import { emettre, lirePolice, proposerAnnulationErreur } from '../src/modules/production/emission.js';
import { balanceGenerale } from '../src/modules/comptabilite/etats.js';
import { STOCKAGE_TEST } from './env.js';
import { fermer, ficheSocieteComplete, installee, MDP, ouvrir, pieceFictive, sms, utilisateur } from './outils.js';

let admin: Acteur, dg: Acteur, resp1: Acteur, resp2: Acteur, daf: Acteur, caissier: Acteur, agentU: Acteur, juniorU: Acteur;
let agent: string, bureau: string, formuleId: string, produitId: string;
const T = aujourdhui();
const ANNEE = T.slice(0, 4);
let n = 0;
const personne = async (nom: string, naissance: string, verifie = false) => {
  const id = await transaction(admin.utilisateurId, q => creerTiers(q, admin, { nature: 'PHYSIQUE', nom, prenoms: 'Test', date_naissance: naissance, telephone: `+2246233${String(++n).padStart(5, '0')}` }));
  if (verifie) await getPool().query('UPDATE tiers SET telephone_verifie = true WHERE id = $1', [id]);
  return id;
};
const telephone = async (id: string) => (await getPool().query('SELECT telephone FROM tiers WHERE id = $1', [id])).rows[0].telephone as string;
const valider = (qui: Acteur, id: string) => transaction(qui.utilisateurId, q => decider(q, qui, id, 'VALIDE'));
const compteAcces = async (tiersId: string, identifiant: string, type: 'AGENT_GENERAL' | 'JUNIOR') => {
  const tel = await telephone(tiersId);
  const u = await transaction(admin.utilisateurId, q => creerUtilisateur(q, admin, { identifiant, tiersId, typeCompte: type, motDePasse: MDP, telephone: tel }));
  await getPool().query(`UPDATE utilisateur SET statut = 'ACTIF' WHERE id = $1`, [u]);
  return new Acteur(u);
};

/** Parcours étapes 1 à 7 au bureau, prêt à émettre. */
async function dossierPret(qui: Acteur, souscripteur: string, donnees: Record<string, unknown>) {
  const o = await transaction(qui.utilisateurId, q => ouvrirDossier(q, qui, { souscripteurId: souscripteur, formuleId, bureauId: bureau }));
  await transaction(qui.utilisateurId, q => enregistrerDonnees(q, qui, o.id, { dateEffet: T, consentementsDeces: [], pieces: [], ...donnees }, 5));
  const t = await transaction(qui.utilisateurId, q => tarifierDossier(q, qui, o.id));
  const r = await transaction(qui.utilisateurId, q => presenterRecapitulatif(q, qui, o.id));
  const code = sms.dernier(await telephone(souscripteur))!.texte.match(/code (\d{6})/)![1]!;
  await transaction(qui.utilisateurId, q => accepterRecapitulatif(q, qui, o.id, r.documentId, code));
  return { id: o.id, tarif: t };
}

beforeAll(async () => {
  await ouvrir();
  ({ admin, dg } = await installee());
  configurerStockage(new StockageLocal(STOCKAGE_TEST));
  await ficheSocieteComplete(admin, dg);
  resp1 = await utilisateur(admin, 'resp.commercial', [{ code: 'RESP_COMMERCIAL' }], dg);
  resp2 = await utilisateur(admin, 'resp.adjoint', [{ code: 'RESP_COMMERCIAL' }], dg);
  const conformite = await utilisateur(admin, 'conformite', [{ code: 'CONFORMITE' }], dg);
  daf = await utilisateur(admin, 'daf', [{ code: 'DAF' }], dg);
  caissier = await utilisateur(admin, 'caissier', [{ code: 'CAISSIER' }], dg);
  const gest = await utilisateur(admin, 'gest.production', [{ code: 'GEST_PRODUCTION' }], dg);
  const comite = await utilisateur(admin, 'comite', [{ code: 'COMITE_PARAMETRAGE' }], dg);

  // Catalogue : produit 10 « Santé famille », prime totale de 6 090 000 pour un assuré principal (CA-COM-03)
  const taxe = await transaction(admin.utilisateurId, q => creerCodeTaxe(q, admin, { code: 'TPA', libelle: 'Taxe sur primes', type: 'TAXE_PRIMES', taux: 0.05, assiette: 'PRIME_NETTE_ACCESSOIRES', compteNumero: '4361', exigibilite: 'EMISSION', dateEffet: '2020-01-01' }));
  const modele = async (code: string) => (await getPool().query(`SELECT id FROM modele_document WHERE code = $1`, [code])).rows[0].id;
  const d = await transaction(gest.utilisateurId, async q => proposerCatalogue(q, gest, { type: 'CREER_PRODUIT', dateEffet: T, produit: {
    code: '10', libelle: 'Santé famille', brancheBcrg: 'MALADIE', typeCouverture: 'FAMILLE', typeContrat: 'INDIVIDUEL', ageMin: 18, ageMax: 65,
    modeleCgId: await modele('CONDITIONS_GENERALES'), modeleCpId: await modele('BULLETIN_ADHESION'), taxes: [taxe], formules: [{
      code: 'ESSENTIEL', libelle: 'Essentiel famille', composition: { conjointsMax: 4, enfantsMax: 6, personnesMax: 11 }, accessoires: 10_000, ticketModerateur: 0.2, plafondAnnuelPersonne: 5_000_000,
      garanties: [
        { code: 'SOINS', libelle: 'Frais de soins', type: 'FRAIS_SOINS', tauxPriseEnCharge: 0.8, carenceJours: 30, beneficiaires: 'VICTIME', modeCalcul: 'COUT_REEL', plafond: 5_000_000 },
        { code: 'DECES', libelle: 'Capital décès', type: 'DECES', tauxPriseEnCharge: 1, carenceJours: 0, beneficiaires: 'AYANTS_DROIT', modeCalcul: 'FORFAIT', capital: 2_000_000, ageMinDeces: 12 },
      ],
      tarifs: [{ qualite: 'ASSURE_PRINCIPAL', ageMin: 18, ageMax: 65, primeNette: 5_790_000 }, { qualite: 'CONJOINT', ageMin: 18, ageMax: 65, primeNette: 300_000 }, { qualite: 'ENFANT', ageMin: 0, ageMax: 20, primeNette: 100_000 }],
    }] } }, 'Lancement'));
  await valider(comite, d.id);
  produitId = d.objet_id;
  formuleId = (await formuleEnVigueur(getPool(), produitId, 'ESSENTIEL', T)).id;
  await getPool().query(`INSERT INTO bareme_commission (produit_id, role, taux, assiette, date_effet) VALUES ($1, 'AGENT_GENERAL', 0.10, 'PRIME_NETTE', '2020-01-01')`, [produitId]);

  // Agent général agréé, bureau 01, émission activée, compte de production approvisionné de 10 000 000
  const agentTiers = await personne('SOW', '1975-01-01');
  agent = await transaction(resp1.utilisateurId, q => creerIntervenant(q, resp1, { tiersId: agentTiers, role: 'AGENT_GENERAL' }));
  await transaction(resp1.utilisateurId, async q => enregistrerTraite(q, resp1, agent, await pieceFictive()));
  const ag = await transaction(resp1.utilisateurId, q => proposerAgrement(q, resp1, agent));
  await valider(resp2, ag.id);
  await valider(conformite, ag.id);
  bureau = (await transaction(admin.utilisateurId, q => creerBureau(q, admin, { code: '01', nom: 'Bureau Kaloum', type: 'BUREAU_DIRECT', adresse: 'Kaloum' }))).id;
  await transaction(resp1.utilisateurId, q => affecterBureau(q, resp1, { bureauId: bureau, intervenantId: agent }));
  await transaction(resp1.utilisateurId, q => activerEmission(q, resp1, agent));
  agentU = await compteAcces(agentTiers, 'agent.sow', 'AGENT_GENERAL');
  const cp = await compteProductionDuBureau(getPool(), bureau);
  await transaction(caissier.utilisateurId, q => declarerApprovisionnement(q, caissier, { compteId: cp.id, moyen: 'ESPECES_SIEGE', montant: 10_000_000 }));
});
afterAll(fermer);

let police1: { policeId: string; numero: string };

describe('Parcours de souscription (§ 8.3)', () => {
  it('CA-PROD-01 : bénéficiaires absents ou quotités ≠ 100 % : dossier incomplet, aucune émission possible', async () => {
    const s = await personne('CAMARA', '1986-04-12', true);
    const o = await transaction(agentU.utilisateurId, q => ouvrirDossier(q, agentU, { souscripteurId: s, formuleId, bureauId: bureau }));
    expect(o.numero).toMatch(/^DS\d{12}$/);
    await expect(transaction(agentU.utilisateurId, q => tarifierDossier(q, agentU, o.id))).rejects.toMatchObject({ code: 'DOSSIER_INCOMPLET', message: expect.stringMatching(/bénéficiaires/) });
    const conjoint = await personne('CAMARA-EP', '1990-09-03');
    await transaction(agentU.utilisateurId, q => enregistrerDonnees(q, agentU, o.id, { dateEffet: T, assures: [{ tiersId: s, qualite: 'ASSURE_PRINCIPAL' }],
      beneficiaires: { mode: 'NOMINATIVE', liste: [{ tiersId: conjoint, quotite: 95, rang: 1 }] } }, 4));
    await expect(transaction(agentU.utilisateurId, q => tarifierDossier(q, agentU, o.id))).rejects.toMatchObject({ message: expect.stringMatching(/95 %/) });
    await expect(transaction(agentU.utilisateurId, q => emettre(q, agentU, o.id))).rejects.toMatchObject({ code: 'DOSSIER_INCOMPLET' });
  });

  it('CA-COM-03, CA-PROD-02, 23 : émission en transaction unique, documents, écritures, preuve d\'acceptation', async () => {
    const s = await personne('DIALLO', '1984-02-02', true);
    const conjoint = await personne('DIALLO-EP', '1988-06-06');
    const { id, tarif } = await dossierPret(agentU, s, { assures: [{ tiersId: s, qualite: 'ASSURE_PRINCIPAL' }], beneficiaires: { mode: 'NOMINATIVE', liste: [{ tiersId: conjoint, quotite: 100, rang: 1 }] } });
    expect(tarif.primeTotale).toBe(6_090_000);
    const pieces = (await getPool().query('SELECT count(*)::int n FROM ecriture')).rows[0].n;
    const r = await transaction(agentU.utilisateurId, q => emettre(q, agentU, id));
    police1 = r;
    expect(numeroPoliceValide(r.numero)).toBe(true);
    expect(r.numero.slice(0, 5)).toBe('10110'); // personne physique, bureau 01, produit 10
    expect(r.solde).toBe(3_910_000);
    expect(r.commissions).toEqual([{ qualite: 'TITULAIRE', montant: 579_000 }]);
    expect((await getPool().query('SELECT count(*)::int n FROM ecriture')).rows[0].n - pieces).toBe(3); // EMI, ENC, COM
    const p = await lirePolice(getPool(), r.policeId);
    expect(p.statut).toBe('ACTIVE');
    expect(p.documents.map((x: { type_document: string }) => x.type_document).sort()).toEqual(['ATTESTATION', 'BULLETIN_ADHESION', 'CONDITIONS_GENERALES', 'QUITTANCE']);
    expect(p.preuveAcceptation).toMatchObject({ niveau: 'CODE_USAGE_UNIQUE' });
    expect(p.quittances[0]).toMatchObject({ statut: 'SOLDEE', prime_totale: 6_090_000 });
    expect(sms.dernier(await telephone(s))!.texte).toContain(r.numero);
    const b = await balanceGenerale(getPool(), `${ANNEE}-01-01`, `${ANNEE}-12-31`);
    const solde = (c: string) => Number(b.find(x => x.numero === c.padEnd(8, '0'))?.solde ?? 0);
    expect(solde('70211')).toBe(-5_790_000);
    expect(solde('412')).toBe(0);
    expect((await lireDossier(getPool(), id)).statut).toBe('EMIS');
  });

  it('CA-COM-04 : solde insuffisant : refus avec le manque, aucune police ni écriture', async () => {
    const s = await personne('BAH', '1980-01-01', true);
    const { id } = await dossierPret(agentU, s, { assures: [{ tiersId: s, qualite: 'ASSURE_PRINCIPAL' }], beneficiaires: { mode: 'CLAUSE_TYPE', liste: [] } });
    const [pieces, polices] = [(await getPool().query('SELECT count(*)::int n FROM ecriture')).rows[0].n, (await getPool().query('SELECT count(*)::int n FROM police')).rows[0].n];
    await expect(transaction(agentU.utilisateurId, q => emettre(q, agentU, id))).rejects.toMatchObject({ code: 'SOLDE_INSUFFISANT', message: 'Solde insuffisant : il manque 2 180 000 GNF' });
    expect((await getPool().query('SELECT count(*)::int n FROM ecriture')).rows[0].n).toBe(pieces);
    expect((await getPool().query('SELECT count(*)::int n FROM police')).rows[0].n).toBe(polices);
    expect((await lireDossier(getPool(), id)).statut).toBe('BROUILLON');
  });

  it('une modification après l\'acceptation l\'annule : le client accepte toujours ce qui est émis', async () => {
    const s = await personne('SYLLA', '1981-01-01', true);
    const { id } = await dossierPret(agentU, s, { assures: [{ tiersId: s, qualite: 'ASSURE_PRINCIPAL' }], beneficiaires: { mode: 'CLAUSE_TYPE', liste: [] } });
    await transaction(agentU.utilisateurId, q => enregistrerDonnees(q, agentU, id, { dateEffet: T, assures: [{ tiersId: s, qualite: 'ASSURE_PRINCIPAL' }], beneficiaires: { mode: 'CLAUSE_TYPE', liste: [] } }, 4));
    await expect(transaction(agentU.utilisateurId, q => emettre(q, agentU, id))).rejects.toMatchObject({ code: 'ACCEPTATION_REQUISE' });
  });
});

describe('Junior et garanties décès', () => {
  it('CA-COM-10, 11 : dossier du junior dans la corbeille de l\'agent ; émission sur son compte ; commission 70 / 30', async () => {
    const cp = await compteProductionDuBureau(getPool(), bureau);
    await transaction(caissier.utilisateurId, q => declarerApprovisionnement(q, caissier, { compteId: cp.id, moyen: 'ESPECES_SIEGE', montant: 20_000_000 }));
    const jt = await personne('KEITA', '1999-01-01');
    const junior = await transaction(resp1.utilisateurId, q => creerIntervenant(q, resp1, { tiersId: jt, role: 'JUNIOR', rattachementId: agent }));
    juniorU = await compteAcces(jt, 'junior.keita', 'JUNIOR');
    const s = await personne('CONDE', '1985-05-05', true);
    await expect(transaction(juniorU.utilisateurId, q => ouvrirDossier(q, juniorU, { souscripteurId: s, formuleId, bureauId: bureau }))).rejects.toMatchObject({ code: 'CONTROLES_JUNIOR' });
    await transaction(agentU.utilisateurId, q => validerControlesJunior(q, agentU, junior));
    const conjoint = await personne('CONDE-EP', '1987-07-07');
    const enfant = await personne('CONDE-ENF', `${Number(ANNEE) - 9}-03-03`);
    const { id } = await dossierPret(juniorU, s, {
      assures: [{ tiersId: s, qualite: 'ASSURE_PRINCIPAL' }, { tiersId: conjoint, qualite: 'CONJOINT' }, { tiersId: enfant, qualite: 'ENFANT', parentTiersId: conjoint }],
      beneficiaires: { mode: 'NOMINATIVE', liste: [{ tiersId: conjoint, quotite: 60, rang: 1 }, { tiersId: enfant, quotite: 40, rang: 1 }] },
    });
    await expect(transaction(juniorU.utilisateurId, q => emettre(q, juniorU, id))).rejects.toMatchObject({ statut: 403 });
    await transaction(juniorU.utilisateurId, q => soumettreDossier(q, juniorU, id));
    const r = await transaction(agentU.utilisateurId, q => emettre(q, agentU, id));
    // Prime nette 6 190 000 ; commission 10 % = 619 000 ; clé 70 % titulaire / 30 % apporteur
    expect(r.commissions).toEqual([{ qualite: 'TITULAIRE', montant: 433_300 }, { qualite: 'APPORTEUR', montant: 185_700 }]);
    const p = await lirePolice(getPool(), r.policeId);
    expect(p.intervenants.map((i: { qualite: string }) => i.qualite).sort()).toEqual(['APPORTEUR', 'TITULAIRE']);
    // Garantie décès : refusée à l'enfant de 9 ans (art. 194) et au conjoint sans consentement (art. 193) ; soins accordés
    const garantie = (nom: string, type: string) => p.assures.find((a: { nom: string }) => a.nom === nom).garanties.find((g: { type: string }) => g.type === type);
    expect(garantie('CONDE-ENF Test', 'DECES')).toMatchObject({ accordee: false, motif: expect.stringMatching(/art\. 194/) });
    expect(garantie('CONDE-EP Test', 'DECES')).toMatchObject({ accordee: false, motif: expect.stringMatching(/Consentement/) });
    expect(garantie('CONDE-EP Test', 'FRAIS_SOINS')).toMatchObject({ accordee: true });
    expect(garantie('CONDE Test', 'DECES')).toMatchObject({ accordee: true });
    // Foyer déclaré à l'émission (REF-RG-007, 008)
    expect((await getPool().query('SELECT count(*)::int n FROM lien_foyer WHERE assure_principal_id = $1', [s])).rows[0].n).toBe(2);
  });
});

describe('Annulation pour erreur (COM-RG-030, 031)', () => {
  it('CA-COM-06 : après double validation, contre-passations, compte recrédité, commission reprise, numéro jamais réutilisé', async () => {
    const cp = await compteProductionDuBureau(getPool(), bureau);
    const avant = cp.solde;
    const d = await transaction(agentU.utilisateurId, q => proposerAnnulationErreur(q, agentU, police1.policeId, 'Erreur sur la formule'));
    await valider(resp1, d.id);
    await valider(daf, d.id);
    const p = await lirePolice(getPool(), police1.policeId);
    expect(p.statut).toBe('ANNULEE');
    expect(p.quittances[0].statut).toBe('ANNULEE');
    expect((await compteProductionDuBureau(getPool(), bureau)).solde).toBe(avant + 6_090_000);
    expect((await getPool().query(`SELECT statut FROM commission WHERE police_id = $1`, [police1.policeId])).rows[0].statut).toBe('REPRISE');
    const b = await balanceGenerale(getPool(), `${ANNEE}-01-01`, `${ANNEE}-12-31`);
    expect(Number(b.find(x => x.numero === '70291000')?.solde)).toBe(5_790_000);
    // Le numéro ne sera jamais réattribué : la police suivante prend le numéro de séquence suivant
    const seq = (await getPool().query(`SELECT derniere_valeur FROM compteur_numerotation WHERE type_objet = 'POLICE'`)).rows[0].derniere_valeur;
    expect(Number(seq)).toBe(2);
  });
});

describe('Expiration des propositions (PROD-RG-001)', () => {
  it('une proposition non finalisée expire après le délai paramétré', async () => {
    const s = await personne('TOURE', '1979-01-01');
    const o = await transaction(agentU.utilisateurId, q => ouvrirDossier(q, agentU, { souscripteurId: s, formuleId, bureauId: bureau }));
    const loin = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
    expect(await transaction(null, q => expirerDossiers(q, loin))).toContain(o.numero);
    await expect(transaction(agentU.utilisateurId, q => emettre(q, agentU, o.id))).rejects.toMatchObject({ code: 'DOSSIER_CLOS' });
  });
});
