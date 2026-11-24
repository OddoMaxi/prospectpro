/** Sous-lot 2.5 – Factures de commissions et chaîne de paiement : CA-COM-20, 21, 22 ; COM-RG-042 à 045, 120 ; FIN-RG-050. */
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool, transaction } from '../src/db/pool.js';
import { Acteur } from '../src/noyau/acteur.js';
import { aujourdhui } from '../src/noyau/dates.js';
import { GardienLocal, MoteurChiffrement } from '../src/moteurs/chiffrement.js';
import { creerUtilisateur } from '../src/modules/habilitations/service.js';
import { creerCodeTaxe } from '../src/modules/comptabilite/plan.js';
import { proposerCoordonnee } from '../src/modules/referentiels/coordonnees.js';
import { creerIntervenant, validerControlesJunior } from '../src/modules/commercial/intervenants.js';
import { compteProductionDuBureau } from '../src/modules/commercial/comptesProduction.js';
import { confirmerEmission, creerMandat, demanderEmission, etablirFactures, listerFactures, payerFacture } from '../src/modules/commercial/factures.js';
import { executerOrdre } from '../src/modules/finances/paiements.js';
import { accepterRecapitulatif, enregistrerDonnees, ouvrirDossier, presenterRecapitulatif, soumettreDossier, tarifierDossier } from '../src/modules/production/dossiers.js';
import { emettre } from '../src/modules/production/emission.js';
import { emettrePolice, personne, preparer, telephone, valider, type Contexte } from './contexte-production.js';
import { fermer, MDP, ouvrir, pieceFictive, sms, utilisateur } from './outils.js';

let c: Contexte, comptable: Acteur, tresorier2: Acteur, junior: string, agentTiers: string;
const T = aujourdhui();
const MOIS = T.slice(0, 7);
const chiffrement = new MoteurChiffrement(new GardienLocal(randomBytes(32)));
const coordonnee = async (tiersId: string, numero: string) => {
  const r = await transaction(c.resp1.utilisateurId, q => proposerCoordonnee(q, c.resp1, chiffrement, { tiersId, type: 'MONNAIE_ELECTRONIQUE', etablissement: 'Orange Money', numero, intitule: 'Titulaire' }));
  await valider(comptable, r.demandeValidation);
  await getPool().query(`UPDATE coordonnee_paiement SET carence_jusqu_au = now() - interval '1 hour' WHERE id = $1`, [r.id]); // carence écoulée
  return r.id;
};

beforeAll(async () => {
  await ouvrir();
  c = await preparer();
  comptable = await utilisateur(c.admin, 'comptable', [{ code: 'COMPTABLE' }], c.dg);
  tresorier2 = await utilisateur(c.admin, 'tresorier2', [{ code: 'TRESORIER' }], c.dg);
  agentTiers = (await getPool().query('SELECT tiers_id FROM intervenant WHERE id = $1', [c.agent])).rows[0].tiers_id;
  await getPool().query('UPDATE tiers SET telephone_verifie = true WHERE id = $1', [agentTiers]);
  await transaction(c.admin.utilisateurId, q => creerCodeTaxe(q, c.admin, { code: 'RAS', libelle: 'Retenue à la source sur commissions', type: 'RETENUE_SOURCE', taux: 0.10, assiette: 'COMMISSION', compteNumero: '4371', exigibilite: 'ENCAISSEMENT', dateEffet: '2020-01-01' }));
  // Une police de l'agent seul, une police préparée par son junior (clé 70 / 30)
  await emettrePolice(c, 'CLIENT-AGENT');
  const jt = await personne(c.admin, 'KEITA', '1999-01-01');
  junior = await transaction(c.resp1.utilisateurId, q => creerIntervenant(q, c.resp1, { tiersId: jt, role: 'JUNIOR', rattachementId: c.agent }));
  await transaction(c.agentU.utilisateurId, q => validerControlesJunior(q, c.agentU, junior));
  const tel = await telephone(jt);
  const u = await transaction(c.admin.utilisateurId, q => creerUtilisateur(q, c.admin, { identifiant: 'junior.keita', tiersId: jt, typeCompte: 'JUNIOR', motDePasse: MDP, telephone: tel }));
  await getPool().query(`UPDATE utilisateur SET statut = 'ACTIF' WHERE id = $1`, [u]);
  const juniorU = new Acteur(u);
  const s = await personne(c.admin, 'CLIENT-JUNIOR', '1985-05-05', true);
  const o = await transaction(u, q => ouvrirDossier(q, juniorU, { souscripteurId: s, formuleId: c.formuleId, bureauId: c.bureau }));
  await transaction(u, q => enregistrerDonnees(q, juniorU, o.id, { dateEffet: T, assures: [{ tiersId: s, qualite: 'ASSURE_PRINCIPAL' }], consentementsDeces: [], pieces: [] }, 5));
  await transaction(u, q => tarifierDossier(q, juniorU, o.id));
  const r = await transaction(u, q => presenterRecapitulatif(q, juniorU, o.id));
  await transaction(u, async q => accepterRecapitulatif(q, juniorU, o.id, r.documentId, sms.dernier(await telephone(s))!.texte.match(/code (\d{6})/)![1]!));
  await transaction(u, q => soumettreDossier(q, juniorU, o.id));
  await transaction(c.agentU.utilisateurId, q => emettre(q, c.agentU, o.id));
}, 90_000);
afterAll(fermer);

describe('Factures mensuelles (COM-RG-042 à 045)', () => {
  let factureAgent: string;

  it('CA-COM-20 : fin de mois : une facture par commercial (agent général et junior), retenue à la source', async () => {
    const f = await transaction(null, q => etablirFactures(q, Acteur.systeme(), MOIS));
    expect(f).toHaveLength(2);
    const l = await listerFactures(getPool(), { mois: MOIS });
    const agent = l.find(x => x.role === 'AGENT_GENERAL')!, jr = l.find(x => x.role === 'JUNIOR')!;
    // Agent : 579 000 (sa police) + 405 300 (70 % de 579 000) ; junior : 173 700 (30 %)
    expect(Number(agent.montant_brut)).toBe(984_300);
    expect(Number(jr.montant_brut)).toBe(173_700);
    expect(Number(agent.retenue)).toBe(98_430);
    expect(Number(agent.net)).toBe(885_870);
    expect(agent.statut).toBe('ETABLIE');
    factureAgent = agent.id;
    expect(await transaction(null, q => etablirFactures(q, Acteur.systeme(), MOIS))).toHaveLength(0); // une seule facture par mois
    expect(sms.dernier(await telephone(agentTiers))!.texte).toContain('885 870 GNF');
  });

  it('émission par code du commercial, puis validation par la Direction commerciale', async () => {
    await transaction(c.agentU.utilisateurId, q => demanderEmission(q, c.agentU, factureAgent));
    const code = sms.dernier(await telephone(agentTiers))!.texte.match(/code (\d{6})/)![1]!;
    const r = await transaction(c.agentU.utilisateurId, q => confirmerEmission(q, c.agentU, factureAgent, code)) as { statut: string; demandeValidation: string };
    expect(r.statut).toBe('EMISE');
    await valider(c.resp1, r.demandeValidation);
    expect((await listerFactures(getPool(), { mois: MOIS })).find(x => x.id === factureAgent)!.statut).toBe('VALIDEE');
  });

  it('CA-COM-21 : paiement en deux fractions validées, retenue au prorata, statut partiel puis payé, deux avis', async () => {
    const coord = await coordonnee(agentTiers, '+224622777001');
    await expect(transaction(c.tresorier.utilisateurId, q => payerFacture(q, c.tresorier, factureAgent, { montant: 600_000, destination: 'MONNAIE_ELECTRONIQUE', coordonneeId: coord })))
      .rejects.toMatchObject({ code: 'MOTIF_FRACTION_REQUIS' });
    const f1 = await transaction(c.tresorier.utilisateurId, q => payerFacture(q, c.tresorier, factureAgent, { montant: 600_000, destination: 'MONNAIE_ELECTRONIQUE', coordonneeId: coord, motifFraction: 'Trésorerie de fin de mois' }));
    expect(f1).toMatchObject({ retenue: 60_000, net: 540_000 });
    await valider(c.daf, f1.demandeValidation);
    // L'exécutant n'est ni l'ordonnateur ni le valideur (ORG-RG-042)
    await expect(transaction(c.tresorier.utilisateurId, q => executerOrdre(q, c.tresorier, f1.ordreId!, { banque: 'OM' }))).rejects.toMatchObject({ statut: 403 });
    await transaction(tresorier2.utilisateurId, q => executerOrdre(q, tresorier2, f1.ordreId!, { banque: 'OM' }));
    expect((await listerFactures(getPool(), { mois: MOIS })).find(x => x.id === factureAgent)!.statut).toBe('PARTIELLEMENT_PAYEE');
    const f2 = await transaction(c.tresorier.utilisateurId, q => payerFacture(q, c.tresorier, factureAgent, { montant: 384_300, destination: 'MONNAIE_ELECTRONIQUE', coordonneeId: coord }));
    expect(f2).toMatchObject({ retenue: 38_430, net: 345_870 }); // la dernière fraction reçoit le reste de la retenue
    await valider(c.daf, f2.demandeValidation);
    await transaction(tresorier2.utilisateurId, q => executerOrdre(q, tresorier2, f2.ordreId!, { banque: 'OM' }));
    const f = (await listerFactures(getPool(), { mois: MOIS })).find(x => x.id === factureAgent)!;
    expect(f.statut).toBe('PAYEE');
    expect(f.paiements.map((p: { retenue: number }) => Number(p.retenue)).reduce((a: number, b: number) => a + b, 0)).toBe(98_430);
    expect((await getPool().query(`SELECT count(*)::int n FROM document WHERE type_document = 'AVIS_PAIEMENT'`)).rows[0].n).toBe(2);
    expect((await getPool().query(`SELECT statut FROM commission WHERE facture_commission_id = $1 LIMIT 1`, [factureAgent])).rows[0].statut).toBe('PAYEE');
  });
});

describe('Affectation au compte de production (COM-RG-120)', () => {
  it('CA-COM-22 : mandat de l\'agent : compte de production crédité du net (EVT-27), aucune sortie de trésorerie', async () => {
    await emettrePolice(c, 'CLIENT-MOIS-SUIVANT');
    const suivant = MOIS.endsWith('-12') ? `${Number(MOIS.slice(0, 4)) + 1}-01` : `${MOIS.slice(0, 4)}-${String(Number(MOIS.slice(5)) + 1).padStart(2, '0')}`;
    const [f] = await transaction(null, q => etablirFactures(q, Acteur.systeme(), suivant));
    const facture = (await listerFactures(getPool(), { mois: suivant }))[0]!;
    expect(f!.brut).toBe(579_000);
    await transaction(c.agentU.utilisateurId, q => demanderEmission(q, c.agentU, facture.id));
    const r = await transaction(c.agentU.utilisateurId, async q => confirmerEmission(q, c.agentU, facture.id, sms.dernier(await telephone(agentTiers))!.texte.match(/code (\d{6})/)![1]!)) as { demandeValidation: string };
    await valider(c.resp1, r.demandeValidation);
    const cp = await compteProductionDuBureau(getPool(), c.bureau);
    await expect(transaction(c.tresorier.utilisateurId, q => payerFacture(q, c.tresorier, facture.id, { montant: 579_000, destination: 'COMPTE_PRODUCTION' }))).rejects.toMatchObject({ code: 'MANDAT_ABSENT' });
    await transaction(c.agentU.utilisateurId, async q => creerMandat(q, c.agentU, { intervenantId: c.agent, compteProductionId: cp.id, type: 'PONCTUEL', factureId: facture.id, documentId: await pieceFictive() }));
    const tresorerieAvant = (await getPool().query(`SELECT count(*)::int n FROM ecriture e JOIN journal j ON j.id = e.journal_id WHERE j.type LIKE 'TRESORERIE%'`)).rows[0].n;
    const a = await transaction(c.tresorier.utilisateurId, q => payerFacture(q, c.tresorier, facture.id, { montant: 579_000, destination: 'COMPTE_PRODUCTION' }));
    await valider(c.daf, a.demandeValidation);
    expect((await compteProductionDuBureau(getPool(), c.bureau)).solde).toBe(cp.solde + 521_100); // 579 000 – 10 % de retenue
    expect((await getPool().query(`SELECT count(*)::int n FROM ecriture e JOIN journal j ON j.id = e.journal_id WHERE j.type LIKE 'TRESORERIE%'`)).rows[0].n).toBe(tresorerieAvant);
    expect((await listerFactures(getPool(), { mois: suivant }))[0]!.statut).toBe('PAYEE');
  });
});
