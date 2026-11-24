/** Sous-lot 1.4 – Référentiels : CA-REF-02 à 09 ; REF-RG-003 à 014, 030 à 034. */
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool, transaction } from '../src/db/pool.js';
import type { Acteur } from '../src/noyau/acteur.js';
import { ajouterAnnees, ajouterJours, aujourdhui } from '../src/noyau/dates.js';
import { GardienLocal, MoteurChiffrement } from '../src/moteurs/chiffrement.js';
import { decider } from '../src/moteurs/validation.js';
import { creerTiers, type DonneesTiers } from '../src/modules/referentiels/tiers.js';
import { champsManquants, exigerFicheComplete, historiqueSociete, mentionsLegales, proposerModificationSociete } from '../src/modules/referentiels/societe.js';
import { attribuerRole, ouvrirCompteBeneficiaire, rolesDuTiers } from '../src/modules/referentiels/roles.js';
import { declarerMembre, foyer, representantLegal, traiterAgesLimites } from '../src/modules/referentiels/foyer.js';
import { exigerPayable, listerCoordonnees, lireNumero, proposerCoordonnee } from '../src/modules/referentiels/coordonnees.js';
import { creerModeleDocument } from '../src/modules/referentiels/modeles.js';
import { creerCodeTaxe } from '../src/modules/comptabilite/plan.js';
import {
  conditionsGarantieDeces, controlerQuotites, formuleEnVigueur, proposerCatalogue, tarifer,
} from '../src/modules/catalogue/service.js';
import { ajouterJourFerie, ajouterJoursOuvrables } from '../src/modules/referentiels/calendrier.js';
import { fermer, installee, ouvrir, sms, utilisateur } from './outils.js';

let admin: Acteur, dg: Acteur;
const T = aujourdhui();
const tiers = (admin: Acteur, t: DonneesTiers) => transaction(admin.utilisateurId, q => creerTiers(q, admin, t));
let tel = 0;
const telephone = () => `+2246555${String(++tel).padStart(5, '0')}`;
const valider = (qui: Acteur, demandeId: string) => transaction(qui.utilisateurId, q => decider(q, qui, demandeId, 'VALIDE'));

beforeAll(async () => { await ouvrir(); ({ admin, dg } = await installee()); });
afterAll(fermer);

describe('Fiche de la Compagnie (REF-RG-010 à 013)', () => {
  const FICHE = {
    raison_sociale: 'CGS Assurances', activite: 'Assurance maladie et accidents', forme_juridique: 'SA', capital_social: 5_000_000_000,
    numero_agrement: 'AGR-2019-014', pays: 'Guinée', region: 'Conakry', commune: 'Kaloum', quartier: 'Almamya',
    telephone: '+224620000000', courriel: 'contact@cgs.example', nif: 'NIF123456',
  };

  it('CA-REF-05 : tant que le RCCM manque, émissions et écritures sont refusées avec la liste des manques', async () => {
    expect(await champsManquants(getPool())).toHaveLength(13);
    const d = await transaction(admin.utilisateurId, q => proposerModificationSociete(q, admin, { valeurs: FICHE, dateEffet: '2020-01-01', motif: 'Fiche initiale' }));
    // REF-RG-013 : l'Administrateur ne valide pas ; la Direction générale (ou la DAF) le fait
    await expect(valider(admin, d.id)).rejects.toMatchObject({ statut: 403 });
    await valider(dg, d.id);
    expect(await champsManquants(getPool())).toEqual(['RCCM']);
    await expect(exigerFicheComplete(getPool())).rejects.toMatchObject({ code: 'FICHE_SOCIETE_INCOMPLETE', details: { manquants: ['RCCM'] } });
    const r = await transaction(admin.utilisateurId, q => proposerModificationSociete(q, admin, { valeurs: { rccm: 'GN.KAL.2019.B.1234' }, dateEffet: '2020-01-01', motif: 'RCCM' }));
    await valider(dg, r.id);
    await exigerFicheComplete(getPool());
  });

  it('CA-REF-06 : un document réimprimé porte les mentions en vigueur à sa date', async () => {
    const d = await transaction(admin.utilisateurId, q => proposerModificationSociete(q, admin, { valeurs: { capital_social: 8_000_000_000 }, motif: 'Augmentation de capital' }));
    await valider(dg, d.id);
    const mars = await mentionsLegales(getPool(), '2020-03-15');
    const maintenant = await mentionsLegales(getPool(), T);
    expect(mars.societe_capital_social).toBe('5 000 000 000 GNF');
    expect(maintenant.societe_capital_social).toBe('8 000 000 000 GNF');
    expect(maintenant.mentions_legales).toContain('RCCM GN.KAL.2019.B.1234');
    expect((await getPool().query('SELECT capital_social FROM societe')).rows[0].capital_social).toBe(8_000_000_000);
    const h = await historiqueSociete(getPool());
    expect(h[0]).toMatchObject({ champ: 'capital_social', ancienne_valeur: '5000000000', nouvelle_valeur: '8000000000', auteur: 'admin', valideur: 'direction' });
  });

  it('une modification ne peut pas être antidatée, et les formats sont contrôlés', async () => {
    await expect(transaction(admin.utilisateurId, q => proposerModificationSociete(q, admin, { valeurs: { nif: 'NIF999' }, dateEffet: '2021-01-01', motif: 'x' })))
      .rejects.toMatchObject({ code: 'DATE_PASSEE' });
    await expect(transaction(admin.utilisateurId, q => proposerModificationSociete(q, admin, { valeurs: { courriel: 'pas-un-courriel' }, motif: 'x' })))
      .rejects.toMatchObject({ code: 'VALEUR_INVALIDE' });
    await expect(transaction(admin.utilisateurId, q => proposerModificationSociete(q, admin, { valeurs: { rccm: '' }, motif: 'x' })))
      .rejects.toMatchObject({ code: 'CHAMP_OBLIGATOIRE' });
  });
});

describe('Rôles et comptes auxiliaires (REF-RG-003, 004, 014)', () => {
  it('CA-REF-02 : le rôle prestataire ouvre automatiquement un compte auxiliaire sous le bon collectif', async () => {
    const clinique = await tiers(admin, { nature: 'MORALE', nom: 'Clinique Ambroise Paré', rccm: 'GN.2010.B.1', telephone: telephone() });
    const r = await transaction(admin.utilisateurId, q => attribuerRole(q, admin, { tiersId: clinique, role: 'PRESTATAIRE' }));
    expect(r.compteAuxiliaire?.code).toBe('4681000001');
    const coll = await getPool().query(`SELECT c.numero FROM compte_auxiliaire a JOIN compte c ON c.id = a.collectif_id WHERE a.id = $1`, [r.compteAuxiliaire!.id]);
    expect(coll.rows[0].numero).toBe('46810000');
    // Également fournisseur : un second auxiliaire, sous un autre collectif (FIN-RG-012)
    const f = await transaction(admin.utilisateurId, q => attribuerRole(q, admin, { tiersId: clinique, role: 'FOURNISSEUR' }));
    expect(f.compteAuxiliaire?.code).toBe('4610000001');
    const pharmacie = await tiers(admin, { nature: 'MORALE', nom: 'Pharmacie du Port', rccm: 'GN.2011.B.2', telephone: telephone() });
    const p = await transaction(admin.utilisateurId, q => attribuerRole(q, admin, { tiersId: pharmacie, role: 'PRESTATAIRE' }));
    expect(p.compteAuxiliaire?.code).toBe('4681000002');
    await expect(transaction(admin.utilisateurId, q => attribuerRole(q, admin, { tiersId: clinique, role: 'PRESTATAIRE' })))
      .rejects.toMatchObject({ code: 'ROLE_DEJA_ACTIF' });
  });

  it('REF-RG-014 : junior et prescripteur sont des personnes physiques ; agent général personne morale avec dirigeant', async () => {
    const societe = await tiers(admin, { nature: 'MORALE', nom: 'Sarl Courtage', rccm: 'GN.2015.B.3', telephone: telephone() });
    await expect(transaction(admin.utilisateurId, q => attribuerRole(q, admin, { tiersId: societe, role: 'JUNIOR' }))).rejects.toMatchObject({ code: 'NATURE_INCOMPATIBLE' });
    await expect(transaction(admin.utilisateurId, q => attribuerRole(q, admin, { tiersId: societe, role: 'AGENT_GENERAL' }))).rejects.toMatchObject({ code: 'DIRIGEANT_REQUIS' });
    const dirigeant = await tiers(admin, { nature: 'PHYSIQUE', nom: 'TOURE', prenoms: 'Sékou', date_naissance: '1975-05-05', telephone: telephone() });
    const ag = await tiers(admin, { nature: 'MORALE', nom: 'Agence Touré', rccm: 'GN.2016.B.4', dirigeant_tiers_id: dirigeant, telephone: telephone() });
    const r = await transaction(admin.utilisateurId, q => attribuerRole(q, admin, { tiersId: ag, role: 'AGENT_GENERAL' }));
    expect(r.compteAuxiliaire?.code).toBe('4112000001');
  });

  it('REF-RG-003 et SIN-RG-031 : le prospect devient souscripteur sur la même fiche ; le bénéficiaire n\'a de compte qu\'à l\'acceptation', async () => {
    const t = await tiers(admin, { nature: 'PHYSIQUE', nom: 'CONDE', prenoms: 'Mariama', date_naissance: '1990-01-01', telephone: telephone() });
    await transaction(admin.utilisateurId, q => attribuerRole(q, admin, { tiersId: t, role: 'PROSPECT' }));
    await transaction(admin.utilisateurId, q => attribuerRole(q, admin, { tiersId: t, role: 'SOUSCRIPTEUR' }));
    const roles = await rolesDuTiers(getPool(), t);
    expect(roles.find(r => r.role === 'PROSPECT')!.date_fin).not.toBeNull();
    expect(roles.find(r => r.role === 'SOUSCRIPTEUR')!.compte_auxiliaire).toBe('4120000001');
    const b = await transaction(admin.utilisateurId, q => attribuerRole(q, admin, { tiersId: t, role: 'BENEFICIAIRE' }));
    expect(b.compteAuxiliaire).toBeNull();
    const c = await transaction(admin.utilisateurId, q => ouvrirCompteBeneficiaire(q, admin, t));
    expect(c.code).toBe('4161000001');
  });
});

describe('Foyers (REF-RG-007 à 009)', () => {
  const personne = (nom: string, naissance: string) => tiers(admin, { nature: 'PHYSIQUE', nom, prenoms: 'X', date_naissance: naissance, telephone: telephone() });
  const declarer = (d: Parameters<typeof declarerMembre>[2]) => transaction(admin.utilisateurId, q => declarerMembre(q, admin, d));

  it('CA-REF-07 : un cinquième conjoint, ou le conjoint d\'un autre assuré principal, est refusé', async () => {
    const principal = await personne('SOW', '1970-01-01');
    const conjoints = [];
    for (let i = 0; i < 4; i++) {
      const c = await personne(`EPOUSE${i}`, `198${i}-02-02`);
      conjoints.push(c);
      await declarer({ assurePrincipalId: principal, membreId: c, lien: 'CONJOINT' });
    }
    const cinquieme = await personne('EPOUSE4', '1985-03-03');
    await expect(declarer({ assurePrincipalId: principal, membreId: cinquieme, lien: 'CONJOINT' })).rejects.toMatchObject({ code: 'CONJOINTS_MAX' });
    const autre = await personne('BARRY', '1968-01-01');
    await expect(declarer({ assurePrincipalId: autre, membreId: conjoints[0]!, lien: 'CONJOINT' })).rejects.toMatchObject({ code: 'DEJA_CONJOINT' });
    expect((await foyer(getPool(), principal)).filter(m => m.lien === 'CONJOINT')).toHaveLength(4);
  });

  it('REF-RG-008 et 009 : enfants, catégories, âges limites et représentant légal', async () => {
    const principal = await personne('KANTE', '1975-01-01');
    const mere = await personne('KANTE-EPOUSE', '1980-01-01');
    await declarer({ assurePrincipalId: principal, membreId: mere, lien: 'CONJOINT' });
    const grand = await personne('KANTE-GRAND', ajouterAnnees(T, -22));
    await expect(declarer({ assurePrincipalId: principal, membreId: grand, lien: 'ENFANT', categorieEnfant: 'A_CHARGE' })).rejects.toMatchObject({ code: 'AGE_LIMITE_ATTEINT' });
    await expect(declarer({ assurePrincipalId: principal, membreId: grand, lien: 'ENFANT', categorieEnfant: 'ETUDIANT' })).rejects.toMatchObject({ code: 'JUSTIFICATIF_REQUIS' });
    const doc = (await getPool().query(
      `INSERT INTO document (type_document, objet_type, objet_id, fichier_ref, empreinte, horodatage_scellement, origine, imprime, conservation_jusqu_au)
       VALUES ('JUSTIFICATIF', 'tiers', $1, 'test/scolarite.pdf', repeat('a', 64), now(), 'NUMERISATION', 0, '2040-01-01') RETURNING id`, [grand])).rows[0].id;
    await declarer({ assurePrincipalId: principal, membreId: grand, lien: 'ENFANT', categorieEnfant: 'ETUDIANT', justificatifDocumentId: doc, justificatifValideJusquAu: ajouterJours(T, 200) });
    const petit = await personne('KANTE-PETIT', '2018-06-01');
    const etranger = await personne('AUTRE', '1979-01-01');
    await expect(declarer({ assurePrincipalId: principal, membreId: petit, lien: 'ENFANT', parentConjointId: etranger })).rejects.toMatchObject({ code: 'PARENT_INVALIDE' });
    await declarer({ assurePrincipalId: principal, membreId: petit, lien: 'ENFANT', parentConjointId: mere });
    expect(await representantLegal(getPool(), petit)).toBe(mere);
  });

  it('CA-REF-09 : un enfant atteignant 21 ans sans justificatif est notifié puis sort à l\'échéance suivante', async () => {
    const principal = await personne('CISSE', '1965-01-01');
    const telPrincipal = (await getPool().query('SELECT telephone FROM tiers WHERE id = $1', [principal])).rows[0].telephone;
    const enfant = await personne('CISSE-FILS', ajouterJours(ajouterAnnees(T, -21), 30));
    const lien = await declarer({ assurePrincipalId: principal, membreId: enfant, lien: 'ENFANT' });
    const echeance = ajouterJours(T, 45);
    const r = await transaction(null, q => traiterAgesLimites(q, admin, T, async (p) => (p === principal ? echeance : null)));
    expect(r.map(x => x.lienId)).toContain(lien);
    expect(sms.dernier(telPrincipal)!.texte).toMatch(/âge limite/);
    const l = (await getPool().query('SELECT date_fin FROM lien_foyer WHERE id = $1', [lien])).rows[0];
    expect(String(l.date_fin).slice(0, 10)).toBe(echeance);
  });
});

describe('Coordonnées de paiement (REF-RG-005)', () => {
  const chiffrement = new MoteurChiffrement(new GardienLocal(randomBytes(32)));

  it('double validation, alerte au titulaire, carence, numéro chiffré et jamais journalisé en clair', async () => {
    const comptable = await utilisateur(admin, 'compta1', [{ code: 'COMPTABLE' }], dg);
    const tel = telephone();
    const t = await tiers(admin, { nature: 'PHYSIQUE', nom: 'DIALLO', prenoms: 'Oumar', date_naissance: '1982-04-04', telephone: tel });
    const numero = 'GN0123456789012345';
    const c = await transaction(admin.utilisateurId, q => proposerCoordonnee(q, admin, chiffrement, { tiersId: t, type: 'BANQUE', etablissement: 'Ecobank', numero, intitule: 'DIALLO Oumar' }));
    expect(c.concordance).toBeGreaterThan(90);
    await expect(exigerPayable(getPool(), c.id, t)).rejects.toMatchObject({ code: 'COORDONNEE_NON_VERIFIEE' });
    await valider(comptable, c.demandeValidation);
    expect(sms.dernier(tel)!.texte).toMatch(/se terminant par 2345/);
    await expect(exigerPayable(getPool(), c.id, t)).rejects.toMatchObject({ code: 'COORDONNEE_EN_CARENCE' });
    await exigerPayable(getPool(), c.id, t, new Date(Date.now() + 73 * 3600_000));
    const autre = await tiers(admin, { nature: 'PHYSIQUE', nom: 'BALDE', prenoms: 'Alpha', date_naissance: '1983-04-04', telephone: telephone() });
    await expect(exigerPayable(getPool(), c.id, autre, new Date(Date.now() + 73 * 3600_000))).rejects.toMatchObject({ code: 'COORDONNEE_TIERS' });

    const brut = (await getPool().query('SELECT numero FROM coordonnee_paiement WHERE id = $1', [c.id])).rows[0].numero as Buffer;
    expect(brut.toString('latin1')).not.toContain(numero);
    expect((await listerCoordonnees(getPool(), chiffrement, t))[0]).toMatchObject({ numeroMasque: '•••• 2345', statut: 'VERIFIEE' });
    expect(await transaction(admin.utilisateurId, q => lireNumero(q, admin, chiffrement, c.id))).toBe(numero);
    const fuite = await getPool().query(`SELECT count(*)::int n FROM journal_audit WHERE journal_audit::text LIKE '%' || $1 || '%'`, [numero]);
    expect(fuite.rows[0].n).toBe(0);
  });
});

describe('Catalogue (§ 5.5)', () => {
  let gest: Acteur, comite: Acteur, produitId: string, formuleId: string;
  const formule = (ageMinDeces = 12) => ({
    code: 'ESSENTIEL', libelle: 'Essentiel famille', composition: { conjointsMax: 1, enfantsMax: 4, personnesMax: 6 },
    accessoires: 10_000, ticketModerateur: 0.2, plafondAnnuelPersonne: 5_000_000, plafondAnnuelFamille: 15_000_000,
    garanties: [
      { code: 'SOINS', libelle: 'Frais de soins', type: 'FRAIS_SOINS' as const, tauxPriseEnCharge: 0.8, carenceJours: 30, accordPrealable: false, beneficiaires: 'VICTIME' as const, modeCalcul: 'COUT_REEL' as const, plafond: 5_000_000 },
      { code: 'DECES', libelle: 'Capital décès', type: 'DECES' as const, tauxPriseEnCharge: 1, carenceJours: 0, accordPrealable: false, beneficiaires: 'AYANTS_DROIT' as const, modeCalcul: 'FORFAIT' as const, capital: 2_000_000, ageMinDeces },
    ],
    tarifs: [
      { qualite: 'ASSURE_PRINCIPAL' as const, ageMin: 18, ageMax: 40, primeNette: 300_000 },
      { qualite: 'ASSURE_PRINCIPAL' as const, ageMin: 41, ageMax: 65, primeNette: 450_000 },
      { qualite: 'CONJOINT' as const, ageMin: 18, ageMax: 65, primeNette: 250_000 },
      { qualite: 'ENFANT' as const, ageMin: 0, ageMax: 25, primeNette: 100_000 },
    ],
  });
  const proposer = (qui: Acteur, op: unknown) => transaction(qui.utilisateurId, q => proposerCatalogue(q, qui, op, 'Lancement'));

  beforeAll(async () => {
    gest = await utilisateur(admin, 'gest.catalogue', [{ code: 'GEST_PRODUCTION' }], dg);
    comite = await utilisateur(admin, 'comite.catalogue', [{ code: 'COMITE_PARAMETRAGE' }], dg);
    await transaction(admin.utilisateurId, q => creerCodeTaxe(q, admin, {
      code: 'TPA', libelle: 'Taxe sur primes d\'assurance', type: 'TAXE_PRIMES', taux: 0.05, assiette: 'PRIME_NETTE_ACCESSOIRES', compteNumero: '4361', exigibilite: 'EMISSION', dateEffet: '2020-01-01',
    }));
  });

  it('création d\'un produit validée par le comité ; une garantie décès sous 12 ans est refusée dès la proposition', async () => {
    const cg = await transaction(admin.utilisateurId, q => creerModeleDocument(q, admin, { code: 'CG_SANTE', libelle: 'Conditions générales santé', contenu: '…', niveauSignature: 'CODE_USAGE_UNIQUE' }));
    const cp = await transaction(admin.utilisateurId, q => creerModeleDocument(q, admin, { code: 'CP_SANTE', libelle: 'Bulletin valant conditions particulières', contenu: '…', niveauSignature: 'CODE_USAGE_UNIQUE' }));
    const taxe = (await getPool().query(`SELECT id FROM code_taxe WHERE code = 'TPA'`)).rows[0].id;
    const produit = (f: object) => ({
      type: 'CREER_PRODUIT', dateEffet: T, produit: {
        code: '10', libelle: 'Santé famille', brancheBcrg: 'MALADIE', typeCouverture: 'FAMILLE', typeContrat: 'INDIVIDUEL',
        ageMin: 18, ageMax: 65, modeleCgId: cg.id, modeleCpId: cp.id, taxes: [taxe], formules: [f],
      },
    });
    await expect(proposer(gest, produit(formule(9)))).rejects.toMatchObject({ code: 'AGE_DECES_INTERDIT' });
    const d = await proposer(gest, produit(formule()));
    await expect(valider(gest, d.id)).rejects.toMatchObject({ statut: 403 });
    await valider(comite, d.id);
    produitId = d.objet_id;
    formuleId = (await formuleEnVigueur(getPool(), produitId, 'ESSENTIEL', T)).id;
  });

  it('REF-RG-030 : la prime totale est calculée (nette + accessoires + taxes), jamais saisie', async () => {
    const t = await tarifer(getPool(), formuleId, [
      { qualite: 'ASSURE_PRINCIPAL', dateNaissance: ajouterAnnees(T, -35) },
      { qualite: 'ENFANT', dateNaissance: ajouterAnnees(T, -5) },
    ], T);
    expect(t).toMatchObject({ primeNette: 400_000, accessoires: 10_000, primeTotale: 430_500 });
    expect(t.taxes).toMatchObject([{ code: 'TPA', libelle: 'Taxe sur primes d\'assurance', taux: 0.05, base: 410_000, montant: 20_500 }]);
    await expect(tarifer(getPool(), formuleId, [{ qualite: 'ASSURE_PRINCIPAL', dateNaissance: ajouterAnnees(T, -35) }, { qualite: 'CONJOINT', dateNaissance: '1980-01-01' }, { qualite: 'CONJOINT', dateNaissance: '1981-01-01' }], T))
      .rejects.toMatchObject({ code: 'COMPOSITION_DEPASSEE' });
  });

  it('CA-REF-03 : un tarif à date d\'effet future laisse inchangées les périodes en cours', async () => {
    const futur = ajouterJours(T, 60);
    await expect(proposer(gest, { type: 'GRILLE_TARIFS', dateEffet: ajouterJours(T, -1), formuleId, tarifs: formule().tarifs })).rejects.toMatchObject({ code: 'DATE_PASSEE' });
    const nouvelle = formule().tarifs.map(t => ({ ...t, primeNette: Math.round(t.primeNette * 1.1) }));
    const d = await proposer(gest, { type: 'GRILLE_TARIFS', dateEffet: futur, formuleId, tarifs: nouvelle });
    await valider(comite, d.id);
    const ap = [{ qualite: 'ASSURE_PRINCIPAL' as const, dateNaissance: '1990-01-01' }];
    expect((await tarifer(getPool(), formuleId, ap, T)).primeNette).toBe(300_000);
    expect((await tarifer(getPool(), formuleId, ap, futur)).primeNette).toBe(330_000);

    // Nouvelle version de formule : les souscriptions d'aujourd'hui restent sur la version 1
    const v = await proposer(gest, { type: 'VERSION_FORMULE', dateEffet: futur, produitId, formule: { ...formule(), libelle: 'Essentiel famille 2027' } });
    await valider(comite, v.id);
    expect((await formuleEnVigueur(getPool(), produitId, 'ESSENTIEL', T)).version).toBe(1);
    expect((await formuleEnVigueur(getPool(), produitId, 'ESSENTIEL', futur)).version).toBe(2);
  });

  it('CA-REF-04 : des quotités totalisant 95 % sont refusées', () => {
    expect(() => controlerQuotites([50, 45])).toThrow(/95 %/);
    expect(() => controlerQuotites([50, 30, 20])).not.toThrow();
    expect(() => controlerQuotites([33.33, 33.33, 33.34])).not.toThrow();
    expect(() => controlerQuotites([100, 0])).toThrow();
  });

  it('CA-REF-08 : garantie décès refusée pour un enfant de 9 ans ; conditions des 12-17 ans et de l\'assuré non souscripteur', async () => {
    const neuf = await conditionsGarantieDeces(getPool(), { dateNaissance: ajouterAnnees(T, -9), date: T, estSouscripteur: false, consentementAssure: true, autorisationRepresentant: true, consentementMineur: true });
    expect(neuf[0]).toMatch(/art\. 194/);
    expect(await conditionsGarantieDeces(getPool(), { dateNaissance: ajouterAnnees(T, -15), date: T, estSouscripteur: false, consentementAssure: true })).toHaveLength(2);
    expect(await conditionsGarantieDeces(getPool(), { dateNaissance: '1980-01-01', date: T, estSouscripteur: false })).toHaveLength(1);
    expect(await conditionsGarantieDeces(getPool(), { dateNaissance: '1980-01-01', date: T, estSouscripteur: true })).toEqual([]);
  });
});

describe('Jours fériés', () => {
  it('les délais en jours ouvrables sautent week-ends et jours fériés', async () => {
    await transaction(admin.utilisateurId, q => ajouterJourFerie(q, admin, { date: '2030-10-02', libelle: 'Fête de l\'indépendance' }));
    // Lundi 30/09/2030 + 3 jours ouvrables : mardi 1er, (mercredi 2 férié), jeudi 3, vendredi 4
    expect(await ajouterJoursOuvrables(getPool(), '2030-09-30', 3)).toBe('2030-10-04');
    // Vendredi 4/10 + 1 : lundi 7/10
    expect(await ajouterJoursOuvrables(getPool(), '2030-10-04', 1)).toBe('2030-10-07');
  });
});
