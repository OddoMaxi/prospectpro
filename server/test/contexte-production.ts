/** Contexte commun des tests de production : catalogue, agent général agréé et approvisionné, émission de polices. */
import { getPool, transaction } from '../src/db/pool.js';
import { Acteur } from '../src/noyau/acteur.js';
import { aujourdhui } from '../src/noyau/dates.js';
import { decider } from '../src/moteurs/validation.js';
import { configurerStockage, StockageLocal } from '../src/moteurs/documents.js';
import { creerTiers } from '../src/modules/referentiels/tiers.js';
import { creerBureau } from '../src/modules/referentiels/bureaux.js';
import { creerUtilisateur } from '../src/modules/habilitations/service.js';
import { creerCodeTaxe } from '../src/modules/comptabilite/plan.js';
import { creerBanqueOperateur } from '../src/modules/finances/tresorerie.js';
import { formuleEnVigueur, proposerCatalogue } from '../src/modules/catalogue/service.js';
import { activerEmission, affecterBureau, creerIntervenant, enregistrerTraite, proposerAgrement } from '../src/modules/commercial/intervenants.js';
import { compteProductionDuBureau, declarerApprovisionnement } from '../src/modules/commercial/comptesProduction.js';
import { accepterRecapitulatif, enregistrerDonnees, ouvrirDossier, presenterRecapitulatif, tarifierDossier } from '../src/modules/production/dossiers.js';
import { emettre } from '../src/modules/production/emission.js';
import { STOCKAGE_TEST } from './env.js';
import { ficheSocieteComplete, installee, MDP, pieceFictive, sms, utilisateur } from './outils.js';

export interface Contexte {
  admin: Acteur; dg: Acteur; resp1: Acteur; resp2: Acteur; daf: Acteur; caissier: Acteur; tresorier: Acteur; agentU: Acteur;
  agent: string; bureau: string; produitId: string; formuleId: string;
}

let n = 0;
export async function personne(admin: Acteur, nom: string, naissance: string, verifie = false): Promise<string> {
  const id = await transaction(admin.utilisateurId, q => creerTiers(q, admin, { nature: 'PHYSIQUE', nom, prenoms: 'Test', date_naissance: naissance, telephone: `+2246244${String(++n).padStart(5, '0')}` }));
  if (verifie) await getPool().query('UPDATE tiers SET telephone_verifie = true WHERE id = $1', [id]);
  return id;
}
export const telephone = async (id: string) => (await getPool().query('SELECT telephone FROM tiers WHERE id = $1', [id])).rows[0].telephone as string;
export const valider = (qui: Acteur, id: string) => transaction(qui.utilisateurId, q => decider(q, qui, id, 'VALIDE'));

/** Barème : 10 % de la prime nette, prime de renouvellement anticipé de 2 %. Prime totale d'un assuré principal : 6 090 000. */
export async function preparer(): Promise<Contexte> {
  const { admin, dg } = await installee();
  configurerStockage(new StockageLocal(STOCKAGE_TEST));
  await ficheSocieteComplete(admin, dg);
  const resp1 = await utilisateur(admin, 'resp.commercial', [{ code: 'RESP_COMMERCIAL' }], dg);
  const resp2 = await utilisateur(admin, 'resp.adjoint', [{ code: 'RESP_COMMERCIAL' }], dg);
  const conformite = await utilisateur(admin, 'conformite', [{ code: 'CONFORMITE' }], dg);
  const daf = await utilisateur(admin, 'daf', [{ code: 'DAF' }], dg);
  const caissier = await utilisateur(admin, 'caissier', [{ code: 'CAISSIER' }], dg);
  const tresorier = await utilisateur(admin, 'tresorier', [{ code: 'TRESORIER' }], dg);
  const gest = await utilisateur(admin, 'gest.production', [{ code: 'GEST_PRODUCTION' }], dg);
  const comite = await utilisateur(admin, 'comite', [{ code: 'COMITE_PARAMETRAGE' }], dg);
  await transaction(admin.utilisateurId, q => creerBanqueOperateur(q, admin, { code: 'OM', nom: 'Orange Money', type: 'MONNAIE_ELECTRONIQUE', compteNumero: '5631', responsableId: tresorier.utilisateurId! }));
  const taxe = await transaction(admin.utilisateurId, q => creerCodeTaxe(q, admin, { code: 'TPA', libelle: 'Taxe sur primes', type: 'TAXE_PRIMES', taux: 0.05, assiette: 'PRIME_NETTE_ACCESSOIRES', compteNumero: '4361', exigibilite: 'EMISSION', dateEffet: '2020-01-01' }));
  const modele = async (code: string) => (await getPool().query(`SELECT id FROM modele_document WHERE code = $1`, [code])).rows[0].id;
  const d = await transaction(gest.utilisateurId, async q => proposerCatalogue(q, gest, { type: 'CREER_PRODUIT', dateEffet: aujourdhui(), produit: {
    code: '10', libelle: 'Santé famille', brancheBcrg: 'MALADIE', typeCouverture: 'FAMILLE', typeContrat: 'INDIVIDUEL', ageMin: 18, ageMax: 65,
    modeleCgId: await modele('CONDITIONS_GENERALES'), modeleCpId: await modele('BULLETIN_ADHESION'), taxes: [taxe], formules: [{
      code: 'ESSENTIEL', libelle: 'Essentiel famille', composition: { conjointsMax: 4, enfantsMax: 6, personnesMax: 11 }, accessoires: 10_000, ticketModerateur: 0.2, plafondAnnuelPersonne: 5_000_000,
      garanties: [{ code: 'SOINS', libelle: 'Frais de soins', type: 'FRAIS_SOINS', tauxPriseEnCharge: 0.8, carenceJours: 30, beneficiaires: 'VICTIME', modeCalcul: 'COUT_REEL', plafond: 5_000_000 }],
      tarifs: [{ qualite: 'ASSURE_PRINCIPAL', ageMin: 18, ageMax: 65, primeNette: 5_790_000 }, { qualite: 'CONJOINT', ageMin: 18, ageMax: 65, primeNette: 300_000 }, { qualite: 'ENFANT', ageMin: 0, ageMax: 20, primeNette: 100_000 }],
    }] } }, 'Lancement'));
  await valider(comite, d.id);
  const produitId = d.objet_id;
  const formuleId = (await formuleEnVigueur(getPool(), produitId, 'ESSENTIEL', aujourdhui())).id;
  await getPool().query(`INSERT INTO bareme_commission (produit_id, role, taux, assiette, prime_anticipation_type, prime_anticipation_valeur, date_effet) VALUES ($1, 'AGENT_GENERAL', 0.10, 'PRIME_NETTE', 'POURCENTAGE', 0.02, '2020-01-01')`, [produitId]);
  const agentTiers = await personne(admin, 'SOW', '1975-01-01');
  const agent = await transaction(resp1.utilisateurId, q => creerIntervenant(q, resp1, { tiersId: agentTiers, role: 'AGENT_GENERAL' }));
  await transaction(resp1.utilisateurId, async q => enregistrerTraite(q, resp1, agent, await pieceFictive()));
  const ag = await transaction(resp1.utilisateurId, q => proposerAgrement(q, resp1, agent));
  await valider(resp2, ag.id);
  await valider(conformite, ag.id);
  const bureau = (await transaction(admin.utilisateurId, q => creerBureau(q, admin, { code: '01', nom: 'Bureau Kaloum', type: 'BUREAU_DIRECT', adresse: 'Kaloum' }))).id;
  await transaction(resp1.utilisateurId, q => affecterBureau(q, resp1, { bureauId: bureau, intervenantId: agent }));
  await transaction(resp1.utilisateurId, q => activerEmission(q, resp1, agent));
  const tel = await telephone(agentTiers);
  const u = await transaction(admin.utilisateurId, q => creerUtilisateur(q, admin, { identifiant: 'agent.sow', tiersId: agentTiers, typeCompte: 'AGENT_GENERAL', motDePasse: MDP, telephone: tel }));
  await getPool().query(`UPDATE utilisateur SET statut = 'ACTIF' WHERE id = $1`, [u]);
  const agentU = new Acteur(u);
  const cp = await compteProductionDuBureau(getPool(), bureau);
  await transaction(caissier.utilisateurId, q => declarerApprovisionnement(q, caissier, { compteId: cp.id, moyen: 'ESPECES_SIEGE', montant: 100_000_000 }));
  return { admin, dg, resp1, resp2, daf, caissier, tresorier, agentU, agent, bureau, produitId, formuleId };
}

/** Émet une police d'un assuré principal (prime totale 6 090 000) et renvoie son identifiant. */
export async function emettrePolice(c: Contexte, nom: string): Promise<{ policeId: string; numero: string; souscripteur: string }> {
  const s = await personne(c.admin, nom, '1984-02-02', true);
  const o = await transaction(c.agentU.utilisateurId, q => ouvrirDossier(q, c.agentU, { souscripteurId: s, formuleId: c.formuleId, bureauId: c.bureau }));
  await transaction(c.agentU.utilisateurId, q => enregistrerDonnees(q, c.agentU, o.id, { dateEffet: aujourdhui(), assures: [{ tiersId: s, qualite: 'ASSURE_PRINCIPAL' }], consentementsDeces: [], pieces: [] }, 5));
  await transaction(c.agentU.utilisateurId, q => tarifierDossier(q, c.agentU, o.id));
  const r = await transaction(c.agentU.utilisateurId, q => presenterRecapitulatif(q, c.agentU, o.id));
  const code = sms.dernier(await telephone(s))!.texte.match(/code (\d{6})/)![1]!;
  await transaction(c.agentU.utilisateurId, q => accepterRecapitulatif(q, c.agentU, o.id, r.documentId, code));
  const e = await transaction(c.agentU.utilisateurId, q => emettre(q, c.agentU, o.id));
  return { policeId: e.policeId, numero: e.numero, souscripteur: s };
}

/** Avance l'échéance de la police (fin de sa dernière période) pour simuler le temps qui passe. */
export async function fixerEcheance(policeId: string, date: string) {
  await getPool().query(`UPDATE police_periode SET date_fin = $2 WHERE police_id = $1 AND rang = (SELECT max(rang) FROM police_periode WHERE police_id = $1)`, [policeId, date]);
}
