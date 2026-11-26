/**
 * Sous-lot 2.4 (suite) – Vie du contrat : avenant de correction (CA-PROD-22), retrait d'un ayant droit, changement de
 * souscripteur, résiliation par la Compagnie et renonciation (CA-PROD-24) ; PROD-RG-041, 045, 046, 061, 062, 074.
 */
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool, transaction } from '../src/db/pool.js';
import { Acteur } from '../src/noyau/acteur.js';
import { ajouterJours, aujourdhui } from '../src/noyau/dates.js';
import { GardienLocal, MoteurChiffrement } from '../src/moteurs/chiffrement.js';
import { compteProductionDuBureau } from '../src/modules/commercial/comptesProduction.js';
import { proposerCoordonnee } from '../src/modules/referentiels/coordonnees.js';
import { executerOrdre } from '../src/modules/finances/paiements.js';
import { ajouterAyantDroit, prorata } from '../src/modules/production/avenants.js';
import {
  confirmerChangementSouscripteur, preparerChangementSouscripteur, proposerCorrection, proposerResiliation, reglerAvenant, renoncer, retirerAyantDroit,
} from '../src/modules/production/vieContrat.js';
import { lirePolice } from '../src/modules/production/emission.js';
import { emettrePolice, personne, preparer, telephone, valider, type Contexte } from './contexte-production.js';
import { fermer, ouvrir, sms, utilisateur } from './outils.js';

let c: Contexte, comptable: Acteur, tresorier2: Acteur;
const T = aujourdhui();
const chiffrement = new MoteurChiffrement(new GardienLocal(randomBytes(32)));
const solde = async () => (await compteProductionDuBureau(getPool(), c.bureau)).solde;
const principal = async (policeId: string) => (await getPool().query(`SELECT id, tiers_id FROM police_assure WHERE police_id = $1 AND qualite = 'ASSURE_PRINCIPAL'`, [policeId])).rows[0] as { id: string; tiers_id: string };
const fin = async (policeId: string) => (await getPool().query('SELECT date_fin::text AS f FROM police_periode WHERE police_id = $1 ORDER BY rang DESC LIMIT 1', [policeId])).rows[0].f as string;
const avenant = async (policeId: string, type: string) => (await getPool().query('SELECT * FROM avenant WHERE police_id = $1 AND type = $2 ORDER BY cree_le DESC LIMIT 1', [policeId, type])).rows[0];
const reprises = async (policeId: string) => Number((await getPool().query(`SELECT COALESCE(sum(montant), 0)::bigint AS s FROM commission WHERE police_id = $1 AND type = 'REPRISE'`, [policeId])).rows[0].s);
const soldeClient = async (tiersId: string) => Number((await getPool().query(
  `SELECT COALESCE(sum(l.debit - l.credit), 0)::bigint AS s FROM ligne_ecriture l JOIN tiers_role r ON r.compte_auxiliaire_id = l.compte_auxiliaire_id WHERE r.tiers_id = $1 AND r.role = 'SOUSCRIPTEUR'`, [tiersId])).rows[0].s);
const coordonnee = async (tiersId: string) => {
  const r = await transaction(c.resp1.utilisateurId, q => proposerCoordonnee(q, c.resp1, chiffrement, { tiersId, type: 'MONNAIE_ELECTRONIQUE', etablissement: 'Orange Money', numero: '+224622555111', intitule: 'Titulaire' }));
  await valider(comptable, r.demandeValidation);
  await getPool().query(`UPDATE coordonnee_paiement SET carence_jusqu_au = now() - interval '1 hour' WHERE id = $1`, [r.id]); // carence écoulée
  return r.id;
};

beforeAll(async () => {
  await ouvrir();
  c = await preparer();
  comptable = await utilisateur(c.admin, 'comptable', [{ code: 'COMPTABLE' }], c.dg);
  tresorier2 = await utilisateur(c.admin, 'tresorier.adjoint', [{ code: 'TRESORIER' }], c.dg);
  // Deux tranches de tarif pour l'assuré principal : 18-45 ans (5 790 000) et 46-65 ans (6 290 000)
  await getPool().query(`UPDATE tarif SET age_max = 45 WHERE formule_id = $1 AND qualite = 'ASSURE_PRINCIPAL'`, [c.formuleId]);
  await getPool().query(`INSERT INTO tarif (formule_id, qualite, age_min, age_max, prime_nette, date_effet) SELECT formule_id, qualite, 46, 65, 6290000, date_effet FROM tarif WHERE formule_id = $1 AND qualite = 'ASSURE_PRINCIPAL'`, [c.formuleId]);
}, 90_000);
afterAll(fermer);

describe('Avenant de correction (PROD-RG-045)', () => {
  it('CA-PROD-22 : date de naissance corrigée en cours de période, changement de tranche : différence au prorata, même numéro, carences conservées', async () => {
    const p = await emettrePolice(c, 'CORRECTION'); // né le 02/02/1984 : tranche 18-45
    const pa = await principal(p.policeId);
    const entree = (await getPool().query('SELECT date_entree::text AS d FROM police_assure WHERE id = $1', [pa.id])).rows[0].d;
    const effet = ajouterJours(T, 100), echeance = await fin(p.policeId);
    await expect(transaction(c.agentU.utilisateurId, q => proposerCorrection(q, c.agentU, p.policeId, { policeAssureId: pa.id, dateNaissance: '1984-02-02', motif: 'x' })))
      .rejects.toMatchObject({ code: 'AUCUNE_CORRECTION' });
    const prop = await transaction(c.agentU.utilisateurId, q => proposerCorrection(q, c.agentU, p.policeId, { policeAssureId: pa.id, dateNaissance: '1975-06-01', dateEffet: effet, motif: 'Erreur de saisie de l\'année de naissance' }));
    const nette = prorata(500_000, effet, T, echeance);
    expect(prop).toMatchObject({ primeAvant: 5_790_000, primeApres: 6_290_000, sens: 1, nette, totale: nette + Math.round(nette * 0.05) });
    // Validation selon le référentiel des délégations : la donnée n'est corrigée qu'après
    expect((await getPool().query('SELECT date_naissance::text AS d FROM tiers WHERE id = $1', [pa.tiers_id])).rows[0].d).toBe('1984-02-02');
    await valider(c.gest, prop.demandeValidation);
    expect((await getPool().query('SELECT date_naissance::text AS d FROM tiers WHERE id = $1', [pa.tiers_id])).rows[0].d).toBe('1975-06-01');
    const a = await avenant(p.policeId, 'CORRECTION');
    expect(a.numero).toBe(`${p.numero}A01`);
    expect(Number(a.difference_prime)).toBe(prop.totale);
    // Prime supplémentaire : quittance à terme légal constatée, encaissée au règlement
    expect((await getPool().query('SELECT statut, prime_totale::bigint AS t FROM quittance WHERE id = $1', [a.quittance_id])).rows[0]).toEqual({ statut: 'A_TERME_LEGAL', t: prop.totale });
    // Une seule correction à régler à la fois ; règlement par le compte de production (EVT-02)
    await expect(transaction(c.agentU.utilisateurId, q => proposerCorrection(q, c.agentU, p.policeId, { policeAssureId: pa.id, dateNaissance: '1974-06-01', motif: 'x' })))
      .rejects.toMatchObject({ code: 'AVENANT_A_REGLER' });
    const avant = await solde();
    const r = await transaction(c.agentU.utilisateurId, q => reglerAvenant(q, c.agentU, a.id, { type: 'COMPTE_PRODUCTION' }));
    expect(r.primeTotale).toBe(prop.totale);
    expect(await solde()).toBe(avant - prop.totale);
    await expect(transaction(c.agentU.utilisateurId, q => reglerAvenant(q, c.agentU, a.id, { type: 'COMPTE_PRODUCTION' }))).rejects.toMatchObject({ code: 'DEJA_REGLE' });

    // Correction inverse : ristourne au prorata (EVT-04), recréditée au compte de production, commission reprise
    const retour = await transaction(c.agentU.utilisateurId, q => proposerCorrection(q, c.agentU, p.policeId, { policeAssureId: pa.id, dateNaissance: '1984-02-02', dateEffet: effet, motif: 'Acte de naissance produit' }));
    expect(retour).toMatchObject({ sens: -1, totale: prop.totale });
    const avant2 = await solde();
    await valider(c.gest, retour.demandeValidation);
    expect(await solde()).toBe(avant2 + prop.totale);
    expect(Number((await avenant(p.policeId, 'CORRECTION')).difference_prime)).toBe(-prop.totale);
    expect(await reprises(p.policeId)).toBe(-Math.round(nette * 0.10));
    const police = await lirePolice(getPool(), p.policeId);
    expect(police.numero).toBe(p.numero);
    expect((await getPool().query('SELECT date_entree::text AS d FROM police_assure WHERE id = $1', [pa.id])).rows[0].d).toBe(entree);
    const evt04 = (await getPool().query(`SELECT sum(l.debit)::bigint AS d, sum(l.credit)::bigint AS c FROM ecriture e JOIN ligne_ecriture l ON l.ecriture_id = e.id WHERE e.reference = $1`, [`${p.numero}A03`])).rows[0];
    expect(Number(evt04.d)).toBe(Number(evt04.c));
  });
});

describe('Retrait d\'un ayant droit (PROD-RG-041)', () => {
  it('à la demande : sortie à l\'échéance, sans ristourne ; décès : sortie au décès, ristourne au prorata si le produit le prévoit, après validation', async () => {
    const p = await emettrePolice(c, 'RETRAIT');
    const [e1, e2] = [await personne(c.admin, 'RETRAIT-E1', '2015-01-01'), await personne(c.admin, 'RETRAIT-E2', '2016-01-01')];
    for (const e of [e1, e2]) await transaction(c.agentU.utilisateurId, q => ajouterAyantDroit(q, c.agentU, p.policeId, { tiersId: e, qualite: 'ENFANT', paiement: { type: 'COMPTE_PRODUCTION' } }));
    const pa = async (t: string) => (await getPool().query('SELECT id FROM police_assure WHERE police_id = $1 AND tiers_id = $2', [p.policeId, t])).rows[0].id as string;
    const echeance = await fin(p.policeId);
    await expect(transaction(c.agentU.utilisateurId, async q => retirerAyantDroit(q, c.agentU, p.policeId, { policeAssureId: (await principal(p.policeId)).id, motif: 'DEMANDE' })))
      .rejects.toMatchObject({ code: 'QUALITE_PRINCIPAL' });
    const avant = await solde();
    const r = await transaction(c.agentU.utilisateurId, async q => retirerAyantDroit(q, c.agentU, p.policeId, { policeAssureId: await pa(e1), motif: 'DEMANDE' }));
    expect(r).toMatchObject({ dateSortie: echeance, ristourne: 0 });
    expect(await solde()).toBe(avant);

    await getPool().query('UPDATE produit SET ristourne_deces = true WHERE id = $1', [c.produitId]);
    await expect(transaction(c.agentU.utilisateurId, async q => retirerAyantDroit(q, c.agentU, p.policeId, { policeAssureId: await pa(e2), motif: 'DECES', dateDeces: ajouterJours(T, 5) })))
      .rejects.toMatchObject({ code: 'DATE_INVALIDE' });
    const ok = await transaction(c.agentU.utilisateurId, async q => retirerAyantDroit(q, c.agentU, p.policeId, { policeAssureId: await pa(e2), motif: 'DECES', dateDeces: T }));
    const attendu = prorata(100_000, ajouterJours(T, 1), T, echeance);
    expect(ok.ristourne).toBe(attendu + Math.round(attendu * 0.05));
    await valider(c.gest, ok.demandeValidation!);
    expect(await solde()).toBe(avant + ok.ristourne);
    expect((await getPool().query('SELECT date_sortie::text AS d, motif_sortie FROM police_assure WHERE tiers_id = $1', [e2])).rows[0]).toEqual({ d: T, motif_sortie: 'Décès' });
    await getPool().query('UPDATE produit SET ristourne_deces = false WHERE id = $1', [c.produitId]);
  });
});

describe('Changement de souscripteur (PROD-RG-046)', () => {
  it('sans incidence sur la prime, accepté par code du nouveau souscripteur, désignation reconfirmée', async () => {
    const p = await emettrePolice(c, 'SOUSCR');
    const nouveau = await personne(c.admin, 'SOUSCR-NOUVEAU', '1990-03-03', true);
    const mineur = await personne(c.admin, 'SOUSCR-MINEUR', '2012-03-03', true);
    await expect(transaction(c.agentU.utilisateurId, q => preparerChangementSouscripteur(q, c.agentU, p.policeId, { nouveauTiersId: mineur, motif: 'ACCORD_PARTIES' })))
      .rejects.toMatchObject({ code: 'SOUSCRIPTEUR_MINEUR' });
    const prep = await transaction(c.agentU.utilisateurId, q => preparerChangementSouscripteur(q, c.agentU, p.policeId, { nouveauTiersId: nouveau, motif: 'DECES_SOUSCRIPTEUR' }));
    const code = sms.dernier(await telephone(nouveau))!.texte.match(/code (\d{6})/)![1]!;
    await transaction(c.agentU.utilisateurId, q => confirmerChangementSouscripteur(q, c.agentU, prep.avenantId, code));
    const police = (await getPool().query('SELECT souscripteur_id, numero FROM police WHERE id = $1', [p.policeId])).rows[0];
    expect(police).toEqual({ souscripteur_id: nouveau, numero: p.numero });
    expect((await getPool().query(`SELECT 1 FROM tiers_role WHERE tiers_id = $1 AND role = 'SOUSCRIPTEUR' AND date_fin IS NULL`, [nouveau])).rowCount).toBe(1);
    expect(Number((await avenant(p.policeId, 'CHANGEMENT_SOUSCRIPTEUR')).difference_prime)).toBe(0);
  });
});

describe('Résiliation par la Compagnie (PROD-RG-061, 062)', () => {
  it('motif limité, décision validée, ristourne des jours non couverts selon le produit, cartes bloquées, souscripteur et agent notifiés', async () => {
    const p = await emettrePolice(c, 'RESILIATION');
    await expect(transaction(c.agentU.utilisateurId, q => proposerResiliation(q, c.agentU, p.policeId, { motif: 'FRAUDE', justification: 'x' })))
      .rejects.toMatchObject({ code: 'RESERVE_COMPAGNIE' });
    await expect(transaction(c.resp1.utilisateurId, q => proposerResiliation(q, c.resp1, p.policeId, { motif: 'FAUSSE_DECLARATION' as never, justification: 'x' })))
      .rejects.toMatchObject({ code: 'MOTIF_INVALIDE' });
    await getPool().query('UPDATE produit SET ristourne_resiliation = true WHERE id = $1', [c.produitId]);
    const echeance = await fin(p.policeId);
    const d = await transaction(c.resp1.utilisateurId, q => proposerResiliation(q, c.resp1, p.policeId, { motif: 'USURPATION_IDENTITE', justification: 'Pièce d\'identité d\'un tiers' }));
    // Jours non couverts : du lendemain de l'effet à l'échéance, sur la durée de la période
    const nette = prorata(5_790_000, ajouterJours(T, 1), T, echeance), acc = prorata(10_000, ajouterJours(T, 1), T, echeance), taxe = prorata(290_000, ajouterJours(T, 1), T, echeance);
    expect(d.ristourneEstimee).toBe(nette + acc + taxe);
    const avant = await solde();
    await valider(c.gest, d.demandeValidation);
    expect((await getPool().query('SELECT statut FROM police WHERE id = $1', [p.policeId])).rows[0].statut).toBe('ACTIVE');
    await valider(c.daf, d.demandeValidation);
    expect((await getPool().query('SELECT statut FROM police WHERE id = $1', [p.policeId])).rows[0].statut).toBe('RESILIEE');
    expect(await solde()).toBe(avant + d.ristourneEstimee);
    expect(Number((await avenant(p.policeId, 'RESILIATION')).difference_prime)).toBe(-d.ristourneEstimee);
    expect((await getPool().query('SELECT count(*)::int n FROM police_assure WHERE police_id = $1 AND date_sortie = $2', [p.policeId, T])).rows[0].n).toBe(1);
    expect(sms.dernier(await telephone(p.souscripteur))!.texte).toContain('résiliée');
    const agentTel = (await getPool().query(`SELECT t.telephone FROM intervenant i JOIN tiers t ON t.id = i.tiers_id WHERE i.id = $1`, [c.agent])).rows[0].telephone;
    expect(sms.dernier(agentTel)!.texte).toContain(p.numero);
    await getPool().query('UPDATE produit SET ristourne_resiliation = false WHERE id = $1', [c.produitId]);
  });
});

describe('Renonciation après souscription en ligne (PROD-RG-074)', () => {
  it('CA-PROD-24 : dans le délai, sans prestation : police annulée, prime intégralement remboursée', async () => {
    const p = await emettrePolice(c, 'RENONCE');
    await expect(transaction(c.resp1.utilisateurId, q => renoncer(q, c.resp1, p.policeId, {}))).rejects.toMatchObject({ code: 'RENONCIATION_HORS_LIGNE' });
    await getPool().query(`UPDATE police SET canal = 'EN_LIGNE' WHERE id = $1`, [p.policeId]);
    const avant = await solde();
    const r = await transaction(c.resp1.utilisateurId, q => renoncer(q, c.resp1, p.policeId, {}));
    expect(r).toMatchObject({ rembourse: 6_090_000, versCompteProduction: 6_090_000, ordrePaiement: null });
    expect(await solde()).toBe(avant + 6_090_000);
    const police = await lirePolice(getPool(), p.policeId);
    expect(police.statut).toBe('ANNULEE');
    expect(police.quittances.every((q: { statut: string }) => q.statut === 'ANNULEE')).toBe(true);
    expect(Number(police.intervenants[0].commissions)).toBe(0);
    expect(await soldeClient(p.souscripteur)).toBe(0);
  });

  it('prime payée en ligne : remboursement au client par la chaîne de paiement ; délai dépassé refusé', async () => {
    const p = await emettrePolice(c, 'RENONCE-LIGNE');
    await getPool().query(`UPDATE police SET canal = 'EN_LIGNE' WHERE id = $1`, [p.policeId]);
    await getPool().query(`UPDATE quittance SET mode_paiement = 'MONNAIE_ELECTRONIQUE' WHERE police_id = $1`, [p.policeId]); // paiement en ligne simulé
    await expect(transaction(c.resp1.utilisateurId, q => renoncer(q, c.resp1, p.policeId, {}))).rejects.toMatchObject({ code: 'COORDONNEE_REQUISE' });
    const coord = await coordonnee(p.souscripteur);
    await expect(transaction(c.resp1.utilisateurId, q => renoncer(q, c.resp1, p.policeId, {}, ajouterJours(T, 31)))).rejects.toMatchObject({ code: 'DELAI_DEPASSE' });
    const avant = await solde();
    const r = await transaction(c.resp1.utilisateurId, q => renoncer(q, c.resp1, p.policeId, { coordonneeId: coord }));
    expect(r).toMatchObject({ rembourse: 6_090_000, versCompteProduction: 0 });
    expect(await solde()).toBe(avant);
    expect(await soldeClient(p.souscripteur)).toBe(-6_090_000); // client créditeur jusqu'au paiement
    const ordre = (await getPool().query('SELECT id, demande_validation_id, montant FROM ordre_paiement WHERE numero = $1', [r.ordrePaiement])).rows[0];
    expect(Number(ordre.montant)).toBe(6_090_000);
    await valider(c.daf, ordre.demande_validation_id);
    await transaction(tresorier2.utilisateurId, q => executerOrdre(q, tresorier2, ordre.id, { banque: 'OM' }));
    expect(await soldeClient(p.souscripteur)).toBe(0);
  });
});
