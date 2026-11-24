/** Sous-lot 2.4 – Renouvellement et versements programmés : CA-PROD-03 à 06, 18, 19 ; CA-COM-12, 23 ; PROD-RG-020 à 027, 050 à 054, 060. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool, transaction } from '../src/db/pool.js';
import { Acteur } from '../src/noyau/acteur.js';
import { ajouterJours, aujourdhui } from '../src/noyau/dates.js';
import { compteProductionDuBureau } from '../src/modules/commercial/comptesProduction.js';
import { demanderNonRenouvellement, disponibleVersements, envoyerRappels, recevoirVersement, rembourserVersements, renouveler, traiterEcheances } from '../src/modules/production/renouvellement.js';
import { lirePolice } from '../src/modules/production/emission.js';
import { emettrePolice, fixerEcheance, preparer, telephone, type Contexte } from './contexte-production.js';
import { fermer, ouvrir, pieceFictive, sms } from './outils.js';

let c: Contexte;
const T = aujourdhui();
const systeme = Acteur.systeme();
const pieces = async () => (await getPool().query('SELECT count(*)::int n FROM ecriture')).rows[0].n as number;

beforeAll(async () => { await ouvrir(); c = await preparer(); }, 60_000);
afterAll(fermer);

describe('Renouvellement (PROD-RG-020 à 024)', () => {
  it('CA-PROD-03 : paiement direct du client : police renouvelée, compte de production inchangé, commissions selon la clé', async () => {
    const p = await emettrePolice(c, 'DIRECT');
    const echeance = ajouterJours(T, 10);
    await fixerEcheance(p.policeId, echeance);
    const solde = (await compteProductionDuBureau(getPool(), c.bureau)).solde;
    const r = await transaction(c.tresorier.utilisateurId, q => renouveler(q, c.tresorier, p.policeId, { type: 'PAIEMENT_DIRECT', moyen: 'MONNAIE_ELECTRONIQUE', banque: 'OM', reference: 'OM-123' }));
    expect(r).toMatchObject({ dateDebut: ajouterJours(echeance, 1), remiseEnVigueur: false, primeTotale: 6_090_000 });
    expect((await compteProductionDuBureau(getPool(), c.bureau)).solde).toBe(solde);
    const police = await lirePolice(getPool(), p.policeId);
    expect(police.periodes).toHaveLength(2);
    expect(police.quittances[0]).toMatchObject({ type: 'RENOUVELLEMENT', mode_paiement: 'MONNAIE_ELECTRONIQUE' });
    expect((await getPool().query(`SELECT sum(montant)::int s FROM commission WHERE police_id = $1 AND type = 'COMMISSION'`, [p.policeId])).rows[0].s).toBe(1_158_000);
    expect(sms.dernier(await telephone(p.souscripteur))!.texte).toMatch(/renouvelée/);
  });

  it('un renouvellement n\'est possible qu\'à partir de J-30 (PROD-RG-020)', async () => {
    const p = await emettrePolice(c, 'TOT');
    await expect(transaction(c.agentU.utilisateurId, q => renouveler(q, c.agentU, p.policeId, { type: 'COMPTE_PRODUCTION' }))).rejects.toMatchObject({ code: 'TROP_TOT' });
  });

  it('rappels à J-15 envoyés une seule fois ; une police « ne pas renouveler » n\'en reçoit plus et expire à l\'échéance', async () => {
    const p = await emettrePolice(c, 'RAPPEL');
    await fixerEcheance(p.policeId, ajouterJours(T, 15));
    expect(await transaction(null, q => envoyerRappels(q, T))).toContain(p.numero);
    expect(sms.dernier(await telephone(p.souscripteur))!.texte).toMatch(/arrive à échéance/);
    expect(await transaction(null, q => envoyerRappels(q, T))).not.toContain(p.numero);
    await transaction(c.agentU.utilisateurId, q => demanderNonRenouvellement(q, c.agentU, p.policeId, 'Départ du client'));
    await fixerEcheance(p.policeId, ajouterJours(T, 7));
    expect(await transaction(null, q => envoyerRappels(q, T))).not.toContain(p.numero);
    const r = await transaction(null, q => traiterEcheances(q, systeme, ajouterJours(T, 8)));
    expect(r.expirees).toContain(p.numero);
  });
});

describe('Échéance, remise en vigueur, expiration (PROD-RG-025 à 027)', () => {
  let p: Awaited<ReturnType<typeof emettrePolice>>;
  const echeance = ajouterJours(T, -1);
  beforeAll(async () => { p = await emettrePolice(c, 'ECHUE'); await fixerEcheance(p.policeId, echeance); });

  it('CA-PROD-04 : échéance dépassée sans paiement : police ÉCHUE, aucune écriture', async () => {
    const avant = await pieces();
    const r = await transaction(null, q => traiterEcheances(q, systeme, T));
    expect(r.echues).toContain(p.numero);
    expect((await lirePolice(getPool(), p.policeId)).statut).toBe('ECHUE');
    expect(await pieces()).toBe(avant);
    const ev = await getPool().query(`SELECT 1 FROM evenement_metier WHERE type_evenement = 'POLICE_ECHUE' AND objet_id = $1`, [p.policeId]);
    expect(ev.rowCount).toBe(1); // les cartes sont bloquées par le moteur de droits (lot 3)
  });

  it('CA-PROD-05 : paiement au 20e jour : même numéro, période commençant au paiement (jamais rétroactive)', async () => {
    const jour = ajouterJours(echeance, 20);
    const r = await transaction(c.agentU.utilisateurId, q => renouveler(q, c.agentU, p.policeId, { type: 'COMPTE_PRODUCTION' }, jour));
    expect(r).toMatchObject({ dateDebut: jour, remiseEnVigueur: true });
    const police = await lirePolice(getPool(), p.policeId);
    expect(police).toMatchObject({ statut: 'ACTIVE', numero: p.numero });
  });

  it('CA-PROD-06 : au 31e jour, renouvellement refusé : la police est EXPIRÉE', async () => {
    const q2 = await emettrePolice(c, 'EXPIREE');
    await fixerEcheance(q2.policeId, echeance);
    await transaction(null, q => traiterEcheances(q, systeme, T));
    const r = await transaction(null, q => traiterEcheances(q, systeme, ajouterJours(echeance, 31)));
    expect(r.expirees).toContain(q2.numero);
    await expect(transaction(c.agentU.utilisateurId, q => renouveler(q, c.agentU, q2.policeId, { type: 'COMPTE_PRODUCTION' }, ajouterJours(echeance, 31))))
      .rejects.toMatchObject({ code: 'POLICE_EXPIREE', message: expect.stringMatching(/nouvelle souscription/) });
  });
});

describe('Versements programmés (PROD-RG-050 à 054)', () => {
  it('CA-PROD-18, CA-COM-12, 23 : trois versements complets 40 jours avant : renouvellement automatique, commission au renouvellement, prime anticipée', async () => {
    const p = await emettrePolice(c, 'VERSEMENTS');
    const echeance = ajouterJours(T, 40);
    await fixerEcheance(p.policeId, echeance);
    for (const m of [2_000_000, 2_000_000, 2_090_000]) {
      await transaction(c.tresorier.utilisateurId, q => recevoirVersement(q, c.tresorier, { policeId: p.policeId, montant: m, moyen: 'MONNAIE_ELECTRONIQUE', banque: 'OM', reference: `OM-${m}-${Math.random()}` }));
    }
    expect(sms.dernier(await telephone(p.souscripteur))!.texte).toMatch(/reste à payer pour le renouvellement : 0 GNF/);
    // Aucune commission sur les versements eux-mêmes (CA-COM-23)
    expect((await getPool().query(`SELECT count(*)::int n FROM commission WHERE police_id = $1`, [p.policeId])).rows[0].n).toBe(1);
    const r = await transaction(null, q => traiterEcheances(q, systeme, ajouterJours(echeance, 1)));
    expect(r.renouvelees).toContain(p.numero);
    const police = await lirePolice(getPool(), p.policeId);
    expect(police.periodes[1]).toMatchObject({ remise_en_vigueur: false });
    expect(String(police.periodes[1].date_debut).slice(0, 10)).toBe(ajouterJours(echeance, 1));
    const com = (await getPool().query(`SELECT type, sum(montant)::int s FROM commission WHERE police_id = $1 GROUP BY type ORDER BY type`, [p.policeId])).rows;
    expect(com).toEqual([{ type: 'COMMISSION', s: 1_158_000 }, { type: 'PRIME_ANTICIPATION', s: 115_800 }]);
    expect(await disponibleVersements(getPool(), p.policeId)).toBe(0);
  });

  it('CA-PROD-19 : versements insuffisants à l\'échéance : pas de renouvellement, avance conservée, remboursable', async () => {
    const p = await emettrePolice(c, 'PARTIEL');
    const echeance = ajouterJours(T, 5);
    await fixerEcheance(p.policeId, echeance);
    await transaction(c.agentU.utilisateurId, q => recevoirVersement(q, c.agentU, { policeId: p.policeId, montant: 1_500_000, moyen: 'BUREAU' }));
    const r = await transaction(null, q => traiterEcheances(q, systeme, ajouterJours(echeance, 1)));
    expect(r.echues).toContain(p.numero);
    expect(await disponibleVersements(getPool(), p.policeId)).toBe(1_500_000);
    await transaction(c.tresorier.utilisateurId, async q => rembourserVersements(q, c.tresorier, p.policeId, { banque: 'OM', pieceDocumentId: await pieceFictive() }));
    expect(await disponibleVersements(getPool(), p.policeId)).toBe(0);
  });
});
