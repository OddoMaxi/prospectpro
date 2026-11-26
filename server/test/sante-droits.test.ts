/** Lot 3, sous-lot 3.3 – Moteur de droits et compteurs : CA-SAN-02, 03, 24 ; SAN-RG-020 à 027. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool, transaction } from '../src/db/pool.js';
import { aujourdhui } from '../src/noyau/dates.js';
import { formuleEnVigueur, proposerCatalogue } from '../src/modules/catalogue/service.js';
import { enregistrerActe, enregistrerMedicament } from '../src/modules/sante/nomenclatures.js';
import { consommer, evaluerDroits, liberer, reserver, soldes, type LigneDemandee } from '../src/modules/sante/droits.js';
import { Acteur } from '../src/noyau/acteur.js';
import { emettrePolice, preparer, valider, type Contexte } from './contexte-production.js';
import { fermer, ouvrir } from './outils.js';

let c: Contexte, formuleId: string;
const T = aujourdhui();
const principal = async (policeId: string) => (await getPool().query(`SELECT id FROM police_assure WHERE police_id = $1 AND qualite = 'ASSURE_PRINCIPAL'`, [policeId])).rows[0].id as string;
const consultation: LigneDemandee = { acteCode: 'C01', montant: 150_000 };
/** Prestation complète : évaluation, réservation, consommation. */
const prestation = async (pa: string, lignes: LigneDemandee[]) => {
  await transaction(c.admin.utilisateurId, async q => { const e = await evaluerDroits(q, { policeAssureId: pa, lignes }); const r = await reserver(q, c.admin, e); await consommer(q, r); });
};

beforeAll(async () => {
  await ouvrir();
  c = await preparer();
  const gest = c.gest;
  const comite = new Acteur((await getPool().query(`SELECT id FROM utilisateur WHERE identifiant = 'comite'`)).rows[0].id);
  for (const [code, libelle, famille] of [['C01', 'Consultation', 'CONSULTATION'], ['M01', 'Échographie obstétricale', 'MATERNITE'], ['B01', 'Numération sanguine', 'ANALYSE'], ['E99', 'Soins esthétiques', 'AUTRE']]) {
    await transaction(gest.utilisateurId, q => enregistrerActe(q, gest, { code: code!, libelle: libelle!, famille: famille! }));
  }
  await transaction(gest.utilisateurId, q => enregistrerMedicament(q, gest, { code: 'AMOX', denomination: 'Amoxicilline', dci: 'amoxicilline', generique: true, couvert: true, quantiteMaxOrdonnance: 2 }));
  await transaction(gest.utilisateurId, q => enregistrerMedicament(q, gest, { code: 'VITC', denomination: 'Vitamine C', dci: 'acide ascorbique', generique: true, couvert: false }));
  // Produit santé détaillé : consultations plafonnées, pharmacie, maternité en carence de 270 jours, 8 actes par an
  const modele = async (code: string) => (await getPool().query(`SELECT id FROM modele_document WHERE code = $1`, [code])).rows[0].id;
  const g = (code: string, libelle: string, o: Record<string, unknown>) => ({ code, libelle, type: 'FRAIS_SOINS', tauxPriseEnCharge: 0.8, carenceJours: 0, beneficiaires: 'VICTIME', modeCalcul: 'COUT_REEL', ...o });
  const d = await transaction(gest.utilisateurId, async q => proposerCatalogue(q, gest, { type: 'CREER_PRODUIT', dateEffet: T, produit: {
    code: '20', libelle: 'Santé essentielle', brancheBcrg: 'MALADIE', typeCouverture: 'FAMILLE', typeContrat: 'INDIVIDUEL', ageMin: 18, ageMax: 65,
    modeleCgId: await modele('CONDITIONS_GENERALES'), modeleCpId: await modele('BULLETIN_ADHESION'), taxes: [],
    exclusions: [{ code: 'ESTHETIQUE', libelle: 'Soins à visée esthétique', automatique: true, actes: ['E99'] }],
    formules: [{ code: 'ESS', libelle: 'Essentielle', composition: { conjointsMax: 1, enfantsMax: 4, personnesMax: 6 }, accessoires: 10_000, ticketModerateur: 0.2,
      plafondAnnuelPersonne: 1_000_000, nombreActesAnnuel: 8,
      garanties: [g('CONSULT', 'Consultations', { plafond: 300_000, famillesActes: ['CONSULTATION'] }), g('PHARMA', 'Pharmacie', { famillesActes: ['MEDICAMENT'], tauxPriseEnCharge: 1 }),
        g('MATER', 'Maternité', { famillesActes: ['MATERNITE'], carenceJours: 270 }), g('SOINS', 'Autres soins', {})],
      tarifs: [{ qualite: 'ASSURE_PRINCIPAL', ageMin: 18, ageMax: 65, primeNette: 500_000 }] }] } }, 'Produit de test'));
  await valider(comite, d.id);
  formuleId = (await formuleEnVigueur(getPool(), d.objet_id, 'ESS', T)).id;
}, 120_000);
afterAll(fermer);

describe('Évaluation des droits (SAN-RG-020 à 027)', () => {
  it('part de la Compagnie au taux de la garantie, ticket modérateur ; exclusion et médicament non couvert motivés ; quantité maximale', async () => {
    const p = await emettrePolice({ ...c, formuleId }, 'BANGOURA');
    const pa = await principal(p.policeId);
    const e = await evaluerDroits(getPool(), { policeAssureId: pa, lignes: [consultation, { acteCode: 'E99', montant: 50_000 }, { medicamentCode: 'VITC', montant: 5_000 }, { medicamentCode: 'AMOX', quantite: 4, montant: 20_000 }] });
    expect(e.ouvert).toBe(true);
    expect(e.lignes[0]).toMatchObject({ couvert: true, garantie: 'Consultations', partCompagnie: 120_000, ticketModerateur: 30_000, partNonCouverte: 0 });
    expect(e.lignes[1]).toMatchObject({ couvert: false, motif: 'Exclusion : Soins à visée esthétique', partNonCouverte: 50_000 });
    expect(e.lignes[2]).toMatchObject({ couvert: false, motif: 'Médicament non couvert : à la charge de l\'assuré' });
    expect(e.lignes[3]).toMatchObject({ couvert: true, garantie: 'Pharmacie', partCompagnie: 10_000, partNonCouverte: 10_000 }); // 2 boîtes sur 4
  });

  it('CA-SAN-02 : maternité pendant la carence refusée, motif affiché ; un accident lève la carence', async () => {
    const p = await emettrePolice({ ...c, formuleId }, 'SANKHON');
    const pa = await principal(p.policeId);
    const e = await evaluerDroits(getPool(), { policeAssureId: pa, lignes: [{ acteCode: 'M01', montant: 100_000 }] });
    expect(e).toMatchObject({ ouvert: false });
    expect(e.motif).toMatch(/^Garantie « Maternité » en carence jusqu'au/);
    expect((await evaluerDroits(getPool(), { policeAssureId: pa, accident: true, lignes: [{ acteCode: 'M01', montant: 100_000 }] })).ouvert).toBe(true);
  });

  it('plafond de la garantie : la part de la Compagnie est limitée au disponible, le reste à la charge de l\'assuré ; libération à l\'annulation', async () => {
    const p = await emettrePolice({ ...c, formuleId }, 'YANSANE');
    const pa = await principal(p.policeId);
    await prestation(pa, [consultation]);
    await prestation(pa, [consultation]); // 240 000 sur 300 000
    const e = await evaluerDroits(getPool(), { policeAssureId: pa, lignes: [consultation] });
    expect(e.lignes[0]).toMatchObject({ couvert: true, partCompagnie: 60_000, ticketModerateur: 30_000, partNonCouverte: 60_000 });
    const r = await transaction(c.admin.utilisateurId, q => reserver(q, c.admin, e));
    expect((await soldes(getPool(), pa)).soldes.find(s => s.garantie === 'Consultations')).toMatchObject({ consomme: 240_000, reserve: 60_000, disponible: 0, actes: 3 });
    await transaction(c.admin.utilisateurId, q => liberer(q, r));
    expect((await soldes(getPool(), pa)).soldes.find(s => s.garantie === 'Consultations')).toMatchObject({ reserve: 0, disponible: 60_000, actes: 2 });
    // SAN-RG-020 : la base refuse tout dépassement, même hors du moteur
    await expect(getPool().query(`UPDATE compteur_garantie SET montant_consomme = plafond + 1 WHERE niveau = 'GARANTIE' AND police_assure_id = $1 AND plafond IS NOT NULL`, [pa])).rejects.toThrow(/compteur_plafond_ck/);
  });

  it('CA-SAN-03 et 24 : formule à 8 actes ; après 8 prestations dont 3 en pharmacie, la 9e est refusée et l\'assuré informé', async () => {
    const p = await emettrePolice({ ...c, formuleId }, 'TOUNKARA');
    const pa = await principal(p.policeId);
    for (let i = 0; i < 5; i++) await prestation(pa, [{ acteCode: 'B01', montant: 30_000 }]);
    for (let i = 0; i < 3; i++) await prestation(pa, [{ medicamentCode: 'AMOX', quantite: 1, montant: 5_000 }]);
    const e = await evaluerDroits(getPool(), { policeAssureId: pa, lignes: [consultation] });
    expect(e).toMatchObject({ ouvert: false, motif: 'Nombre d\'actes annuel atteint (8) : prise en charge refusée' });
    expect((await soldes(getPool(), pa)).soldes.find(s => s.niveau === 'PERSONNE')).toMatchObject({ actes: 8, actesMax: 8 });
    await expect(transaction(c.admin.utilisateurId, q => reserver(q, c.admin, e))).rejects.toMatchObject({ code: 'DROITS_FERMES' });
  });

  it('police suspendue : droits fermés, motif affiché', async () => {
    const p = await emettrePolice({ ...c, formuleId }, 'KEMOKO');
    await getPool().query(`UPDATE police SET statut = 'SUSPENDUE' WHERE id = $1`, [p.policeId]);
    expect(await evaluerDroits(getPool(), { policeAssureId: await principal(p.policeId), lignes: [consultation] })).toMatchObject({ ouvert: false, motif: 'Police suspendue pour non-paiement' });
  });
});
