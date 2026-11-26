/** Lot 3, sous-lot 3.2 – Cartes d'assuré : CA-SAN-01, 20 ; SAN-RG-011 à 019. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool, transaction } from '../src/db/pool.js';
import { ajouterJours, ajouterAnnees, aujourdhui } from '../src/noyau/dates.js';
import { normaliserNumero } from '../src/modules/comptabilite/plan.js';
import { compteProductionDuBureau } from '../src/modules/commercial/comptesProduction.js';
import { ajouterAyantDroit } from '../src/modules/production/avenants.js';
import {
  cartesDePolice, cartesDuClient, confirmerRemise, declarerGroupeSanguin, declarerPerte, demanderCartePhysique, demanderRemise, fileProduction, imprimerCarte, verifierCarte,
} from '../src/modules/sante/cartes.js';
import { emettrePolice, personne, preparer, telephone, type Contexte } from './contexte-production.js';
import { fermer, ouvrir, sms } from './outils.js';

let c: Contexte;
const T = aujourdhui();
const carte = async (policeId: string, rang = '00') => (await getPool().query(
  `SELECT c.* FROM carte_assure c JOIN police_assure pa ON pa.id = c.police_assure_id WHERE pa.police_id = $1 AND pa.rang_carte = $2 AND c.statut <> 'REVOQUEE'`, [policeId, rang])).rows[0];

beforeAll(async () => { await ouvrir(); c = await preparer(); }, 90_000);
afterAll(fermer);

describe('Émission des cartes (SAN-RG-011, 012)', () => {
  it('une carte numérique par personne couverte dès l\'émission ; numéro police + rang ; jeton sans donnée personnelle', async () => {
    const p = await emettrePolice(c, 'KANTE');
    const k = await carte(p.policeId);
    expect(k).toMatchObject({ numero: `${p.numero}-00`, statut: 'ACTIVE', production: 'NUMERIQUE_SEULE' });
    expect(k.numero_serie).toMatch(new RegExp(`^S${T.slice(2, 4)}-\\d{6}$`));
    expect(k.jeton_qr).not.toContain(p.numero);
    expect(await verifierCarte(getPool(), { jeton: k.jeton_qr })).toMatchObject({ valide: true, etat: 'VALIDE', numero: `${p.numero}-00` });
    // Nouvel ayant droit : sa carte (rang 01) est créée à son entrée
    const enfant = await personne(c.admin, 'KANTE JUNIOR', '2018-02-02');
    await transaction(c.agentU.utilisateurId, q => ajouterAyantDroit(q, c.agentU, p.policeId, { tiersId: enfant, qualite: 'ENFANT', paiement: { type: 'COMPTE_PRODUCTION' } }));
    expect((await carte(p.policeId, '01')).numero).toBe(`${p.numero}-01`);
    expect((await cartesDuClient(getPool(), p.souscripteur)).map(x => x.rang)).toEqual(['00', '01']);
  });

  it('CA-SAN-01 : carte d\'une police suspendue : prise en charge refusée, motif affiché ; réactivée sans nouvelle carte', async () => {
    const p = await emettrePolice(c, 'SOUMAH');
    const k = await carte(p.policeId);
    await getPool().query(`UPDATE police SET statut = 'SUSPENDUE' WHERE id = $1`, [p.policeId]);
    expect(await verifierCarte(getPool(), { numero: k.numero })).toMatchObject({ valide: false, etat: 'BLOQUEE', motif: 'Police suspendue pour non-paiement' });
    await getPool().query(`UPDATE police SET statut = 'ACTIVE' WHERE id = $1`, [p.policeId]);
    expect(await verifierCarte(getPool(), { numero: k.numero })).toMatchObject({ valide: true, carteId: k.id });
    // Sortie de l'assuré : la carte ne donne plus de droits
    await getPool().query(`UPDATE police_assure SET date_sortie = $2 WHERE id = $1`, [k.police_assure_id, T]);
    expect((await verifierCarte(getPool(), { numero: k.numero })).motif).toBe('Personne sortie du contrat');
  });
});

describe('Carte physique (SAN-RG-013 à 017)', () => {
  it('demandée, imprimée (support de 3 ans), remise par le code de l\'assuré ; CA-SAN-20 : groupe sanguin seulement déclaré et consenti', async () => {
    const p = await emettrePolice(c, 'FOFANA');
    const k = await carte(p.policeId);
    await transaction(c.agentU.utilisateurId, q => declarerGroupeSanguin(q, c.agentU, k.id, { groupe: 'O+', consentementImpression: false }));
    expect((await carte(p.policeId)).groupe_sanguin).toBeNull();
    await transaction(c.agentU.utilisateurId, q => demanderCartePhysique(q, c.agentU, k.id, { lieu: 'BUREAU', bureauId: c.bureau }));
    await expect(transaction(c.agentU.utilisateurId, q => demanderCartePhysique(q, c.agentU, k.id, { lieu: 'SIEGE' }))).rejects.toMatchObject({ code: 'DEJA_DEMANDEE' });
    expect((await fileProduction(getPool())).file.find(x => x.id === k.id)).toMatchObject({ production: 'PHYSIQUE_DEMANDEE', motif_production: 'DEMANDE_ASSURE', lieu_retrait: 'BUREAU' });
    const i = await transaction(c.gest.utilisateurId, q => imprimerCarte(q, c.gest, k.id));
    expect(i.validite).toBe(ajouterAnnees(T, 3));
    const tel = await telephone(p.souscripteur);
    expect(sms.dernier(tel)!.texte).toContain('imprimée');
    await transaction(c.agentU.utilisateurId, q => demanderRemise(q, c.agentU, k.id));
    const code = sms.dernier(tel)!.texte.match(/code (\d{6})/)![1]!;
    await transaction(c.agentU.utilisateurId, q => confirmerRemise(q, c.agentU, k.id, code));
    expect((await carte(p.policeId))).toMatchObject({ production: 'REMISE', groupe_sanguin: null });
  });

  it('perte d\'une carte physique : révocation immédiate, nouvelle carte numérique ; nouveau support facturé (EVT-26) au compte de production', async () => {
    const p = await emettrePolice(c, 'KOUYATE');
    const k = await carte(p.policeId);
    await transaction(c.agentU.utilisateurId, q => declarerGroupeSanguin(q, c.agentU, k.id, { groupe: 'A+', consentementImpression: true }));
    await transaction(c.agentU.utilisateurId, q => demanderCartePhysique(q, c.agentU, k.id, { lieu: 'SIEGE' }));
    await transaction(c.gest.utilisateurId, q => imprimerCarte(q, c.gest, k.id));
    const r = await transaction(c.agentU.utilisateurId, q => declarerPerte(q, c.agentU, k.id, 'VOL'));
    expect(r.fraisCartePhysique).toBe(25_000);
    expect(await verifierCarte(getPool(), { jeton: k.jeton_qr })).toMatchObject({ valide: false, etat: 'REVOQUEE' });
    const nouvelle = await carte(p.policeId);
    expect(nouvelle).toMatchObject({ id: r.nouvelleCarteId, numero: k.numero, statut: 'ACTIVE', production: 'NUMERIQUE_SEULE', motif_production: 'REMPLACEMENT_VOL', groupe_sanguin: 'A+' });
    expect(nouvelle.numero_serie).not.toBe(k.numero_serie);
    expect((await verifierCarte(getPool(), { numero: k.numero })).valide).toBe(true);
    await expect(transaction(c.agentU.utilisateurId, q => demanderCartePhysique(q, c.agentU, nouvelle.id, { lieu: 'SIEGE' }))).rejects.toMatchObject({ code: 'PAIEMENT_REQUIS' });
    const avant = (await compteProductionDuBureau(getPool(), c.bureau)).solde;
    const d = await transaction(c.agentU.utilisateurId, q => demanderCartePhysique(q, c.agentU, nouvelle.id, { lieu: 'SIEGE', paiement: { type: 'COMPTE_PRODUCTION' } }));
    expect(d.frais).toBe(25_000);
    expect((await compteProductionDuBureau(getPool(), c.bureau)).solde).toBe(avant - 25_000);
    const frais = Number((await getPool().query(`SELECT COALESCE(sum(l.credit), 0)::bigint AS s FROM ligne_ecriture l JOIN ecriture e ON e.id = l.ecriture_id JOIN compte c ON c.id = l.compte_id
      WHERE c.numero = $1 AND e.reference = $2`, [normaliserNumero('7511'), `CARTE ${nouvelle.numero_serie}`])).rows[0].s);
    expect(frais).toBe(25_000);
    const historique = await cartesDePolice(getPool(), p.policeId);
    expect(historique.map(x => x.etat)).toEqual(['VALIDE', 'REVOQUEE']);
    expect((await fileProduction(getPool())).file.find(x => x.id === nouvelle.id)).toMatchObject({ motif_production: 'REMPLACEMENT_VOL' });
    void ajouterJours;
  });
});
