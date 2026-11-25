/**
 * Jeu d'essai du lot 2 sur la base de DÉVELOPPEMENT : npm run jeu-essai -- --confirmer
 *
 * Recrée la base de développement (DATABASE_URL), l'installe avec les paramètres à jour, puis crée un jeu de données
 * pour essayer les écrans : utilisateurs de chaque département, catalogue, agent général agréé, bureau et compte de
 * production approvisionné, polices émises, approvisionnement à confirmer, facture de commissions, fiche d'imputation.
 * Refuse de s'exécuter en production ou sur une base dont le nom ne contient pas « dev ».
 */
import 'dotenv/config';
import { resolve } from 'node:path';

const url = process.env.DATABASE_URL ?? '';
if (process.env.NODE_ENV === 'production' || !/dev/.test(url.split('/').pop() ?? '')) throw new Error(`Refusé : base « ${url.split('/').pop()} » (seule une base de développement est autorisée)`);
if (!process.argv.includes('--confirmer')) throw new Error('La base de développement sera VIDÉE : relancer avec --confirmer');
process.env.BASE_JEU_ESSAI = url;
process.env.STOCKAGE_JEU_ESSAI = resolve(process.env.STOCKAGE_DIR ?? './stockage');

// Base recréée de zéro : aucun écart possible avec les migrations du dépôt
const pg = (await import('pg')).default;
const nom = url.split('/').pop()!;
const admin = new pg.Client({ connectionString: url.replace(/\/[^/]*$/, '/postgres') });
await admin.connect();
await admin.query(`DROP DATABASE IF EXISTS "${nom}" WITH (FORCE)`);
await admin.query(`CREATE DATABASE "${nom}"`);
await admin.end();
const { migrer } = await import('../src/db/migrer.js');
await migrer(url, 'up');
const { getPool, transaction } = await import('../src/db/pool.js');
const { aujourdhui, ajouterJours } = await import('../src/noyau/dates.js');
const { ouvrir, fermer, utilisateur, pieceFictive, MDP } = await import('../test/outils.js');
const { preparer, emettrePolice, fixerEcheance, valider } = await import('../test/contexte-production.js');
const { compteProductionDuBureau, declarerApprovisionnement } = await import('../src/modules/commercial/comptesProduction.js');
const { creerBanqueOperateur } = await import('../src/modules/finances/tresorerie.js');
const { creerCodeTaxe } = await import('../src/modules/comptabilite/plan.js');
const { etablirFactures, demanderEmission, confirmerEmission } = await import('../src/modules/commercial/factures.js');
const { creerFicheImputation } = await import('../src/modules/finances/saisie.js');
const { sms } = await import('../test/outils.js');
const { Acteur } = await import('../src/noyau/acteur.js');

await ouvrir();
console.log('Base vidée et réinstallée…');
const c = await preparer();
// Profil privilégié de l'agent général : attribution validée par la Direction générale
for (const { id } of (await getPool().query(`SELECT id FROM demande_validation WHERE type_operation = 'ATTRIBUTION_PROFIL_PRIVILEGIE' AND statut = 'EN_ATTENTE'`)).rows) await valider(c.dg, id);
const comptable = await utilisateur(c.admin, 'comptable', [{ code: 'COMPTABLE' }], c.dg);
const chef = await utilisateur(c.admin, 'chef.comptable', [{ code: 'COMPTABLE' }], c.dg);
await transaction(c.admin.utilisateurId, q => creerBanqueOperateur(q, c.admin, { code: 'BICI', nom: 'BICIGUI', type: 'BANQUE', compteNumero: '5621', responsableId: c.tresorier.utilisateurId! }));
await transaction(c.admin.utilisateurId, q => creerCodeTaxe(q, c.admin, { code: 'RAS', libelle: 'Retenue à la source sur commissions', type: 'RETENUE_SOURCE', taux: 0.10, assiette: 'COMMISSION', compteNumero: '4371', exigibilite: 'ENCAISSEMENT', dateEffet: '2020-01-01' }));

console.log('Polices…');
for (const nom of ['CAMARA', 'KEITA', 'DIALLO', 'CISSE']) await emettrePolice(c, nom);
const echue = await emettrePolice(c, 'BAH');
await fixerEcheance(echue.policeId, ajouterJours(aujourdhui(), 12)); // à renouveler sous 30 jours

console.log('Approvisionnement bancaire déclaré, à confirmer par la Trésorerie…');
const cp = await compteProductionDuBureau(getPool(), c.bureau);
await transaction(c.agentU.utilisateurId, q => declarerApprovisionnement(q, c.agentU, { compteId: cp.id, moyen: 'BANQUE', banque: 'BICI', montant: 15_000_000, referenceExterne: 'VIR-88231' }));

console.log('Facture de commissions du mois, émise par l\'agent…');
const agentTiers = (await getPool().query('SELECT tiers_id FROM intervenant WHERE id = $1', [c.agent])).rows[0].tiers_id;
await getPool().query('UPDATE tiers SET telephone_verifie = true WHERE id = $1', [agentTiers]);
const [f] = await transaction(null, q => etablirFactures(q, Acteur.systeme(), aujourdhui().slice(0, 7)));
if (f) {
  const factureId = (await getPool().query('SELECT id FROM facture_commission WHERE numero = $1', [f.numero])).rows[0].id as string;
  await transaction(c.agentU.utilisateurId, q => demanderEmission(q, c.agentU, factureId));
  const tel = (await getPool().query('SELECT telephone FROM tiers WHERE id = $1', [agentTiers])).rows[0].telephone;
  const code = sms.dernier(tel)!.texte.match(/code (\d{6})/)![1]!;
  await transaction(c.agentU.utilisateurId, q => confirmerEmission(q, c.agentU, factureId, code));
}

console.log('Junior rattaché à l\'agent, avec un dossier soumis…');
const { creerIntervenant, validerControlesJunior } = await import('../src/modules/commercial/intervenants.js');
const { creerUtilisateur } = await import('../src/modules/habilitations/service.js');
const { personne, telephone } = await import('../test/contexte-production.js');
const { ouvrirDossier, enregistrerDonnees, tarifierDossier, presenterRecapitulatif, accepterRecapitulatif, soumettreDossier } = await import('../src/modules/production/dossiers.js');
const jt = await personne(c.admin, 'BARRY', '1999-03-03');
const junior = await transaction(c.resp1.utilisateurId, q => creerIntervenant(q, c.resp1, { tiersId: jt, role: 'JUNIOR', rattachementId: c.agent }));
await transaction(c.agentU.utilisateurId, q => validerControlesJunior(q, c.agentU, junior));
const uj = await transaction(c.admin.utilisateurId, async q => creerUtilisateur(q, c.admin, { identifiant: 'junior.barry', tiersId: jt, typeCompte: 'JUNIOR', motDePasse: MDP, telephone: await telephone(jt) }));
const juniorU = new Acteur(uj);
const sj = await personne(c.admin, 'SYLLA', '1990-07-07', true);
const dj = await transaction(uj, q => ouvrirDossier(q, juniorU, { souscripteurId: sj, formuleId: c.formuleId, bureauId: c.bureau }));
await transaction(uj, q => enregistrerDonnees(q, juniorU, dj.id, { dateEffet: aujourdhui(), assures: [{ tiersId: sj, qualite: 'ASSURE_PRINCIPAL' }], consentementsDeces: [], pieces: [] }, 5));
await transaction(uj, q => tarifierDossier(q, juniorU, dj.id));
const rj = await transaction(uj, q => presenterRecapitulatif(q, juniorU, dj.id));
await transaction(uj, async q => accepterRecapitulatif(q, juniorU, dj.id, rj.documentId, sms.dernier(await telephone(sj))!.texte.match(/code (\d{6})/)![1]!));
await transaction(uj, q => soumettreDossier(q, juniorU, dj.id));

console.log('Fiche d\'imputation au brouillard…');
await transaction(comptable.utilisateurId, async q => creerFicheImputation(q, comptable, {
  journal: 'OD', reference: 'REG-2026-01', libelle: 'Frais d\'expertise payés en caisse', pieceDocumentId: await pieceFictive('piece_comptable'),
  lignes: [{ compte: '6026', libelle: 'Frais d\'expertise', debit: 250_000, credit: 0 }, { compte: '571', libelle: 'Caisse du siège', debit: 0, credit: 250_000 }],
}));

// Comptes utilisables sans activation ni second facteur en développement (voir SECOND_FACTEUR_DISPENSE)
await getPool().query(`UPDATE utilisateur SET statut = 'ACTIF' WHERE statut <> 'ACTIF'`);
const comptes = (await getPool().query(`SELECT identifiant FROM utilisateur ORDER BY identifiant`)).rows.map(r => r.identifiant);
console.log(`\nJeu d'essai prêt. Mot de passe de tous les comptes : ${MDP}\nComptes : ${comptes.join(', ')}`);
console.log(`Pour se connecter sans second facteur : SECOND_FACTEUR_DISPENSE=${comptes.join(',')} dans .env, puis redémarrer le serveur.`);
void valider; void chef;
await fermer();
