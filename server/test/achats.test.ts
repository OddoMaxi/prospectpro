/**
 * Sous-lot 2.6 (suite) – Achats, immobilisations, paiement des déclarations : CA-FIN-11, 13, 14, 17, 22 à 29 ;
 * FIN-RG-033, 034, 093, 094, 101, 140 à 147.
 */
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool, transaction } from '../src/db/pool.js';
import type { Acteur } from '../src/noyau/acteur.js';
import { aujourdhui } from '../src/noyau/dates.js';
import { GardienLocal, MoteurChiffrement } from '../src/moteurs/chiffrement.js';
import { creerCodeTaxe, normaliserNumero } from '../src/modules/comptabilite/plan.js';
import { proposerCoordonnee } from '../src/modules/referentiels/coordonnees.js';
import { executerOrdre } from '../src/modules/finances/paiements.js';
import { calculerFactureAchat, echeanceDe, ordonnerPaiementFacture, saisirFactureAchat, type FactureAchat } from '../src/modules/finances/achats.js';
import { completerBien, cumulAu, etatFiscal, ficheBien, planAmortissement, proposerSortie } from '../src/modules/finances/immobilisations.js';
import { cloturerPeriode, enregistrerDepot, listerDeclarations, ordonnerPaiementDeclaration, preparerDeclaration } from '../src/modules/finances/cloture.js';
import { creerFicheImputation } from '../src/modules/finances/saisie.js';
import { personne, preparer, valider, type Contexte } from './contexte-production.js';
import { fermer, ouvrir, pieceFictive, utilisateur } from './outils.js';

let c: Contexte, comptable: Acteur, comptable2: Acteur, tresorier2: Acteur, piece: string, fournisseur: string;
const T = aujourdhui();
const ANNEE = T.slice(0, 4);
const chiffrement = new MoteurChiffrement(new GardienLocal(randomBytes(32)));
const solde = async (numero: string) => Number((await getPool().query(
  `SELECT COALESCE(sum(l.debit - l.credit), 0)::bigint AS s FROM ligne_ecriture l JOIN ecriture e ON e.id = l.ecriture_id JOIN compte c ON c.id = l.compte_id
    WHERE c.numero = $1 AND e.statut = 'VALIDEE' AND e.supprime_le IS NULL`, [normaliserNumero(numero)])).rows[0].s);
let n = 0;
const facture = (lignes: FactureAchat['lignes'], autre: Partial<FactureAchat> = {}): FactureAchat => ({
  fournisseurTiersId: fournisseur, numeroFacture: `F-${++n}`, dateFacture: T, pieceDocumentId: piece, modeleReglement: '30J', lignes, ...autre,
});
/** Saisie puis double validation (comptable, puis DAF). */
const valideeA = async (f: FactureAchat) => {
  const r = await transaction(comptable.utilisateurId, q => saisirFactureAchat(q, comptable, f));
  await valider(comptable2, r.demandeValidation);
  await valider(c.daf, r.demandeValidation);
  return r;
};
const biensDe = async (ficheId: string) => (await getPool().query(
  `SELECT id, statut, valeur_origine::bigint AS valeur_origine, duree_annees FROM immobilisation WHERE fiche_imputation_id = $1 ORDER BY numero_inventaire`, [ficheId])).rows as { id: string; statut: string; valeur_origine: number; duree_annees: number }[];
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
  comptable2 = await utilisateur(c.admin, 'chef.comptable', [{ code: 'COMPTABLE' }], c.dg);
  tresorier2 = await utilisateur(c.admin, 'tresorier.adjoint', [{ code: 'TRESORIER' }], c.dg);
  piece = await pieceFictive('piece_comptable');
  fournisseur = await personne(c.admin, 'FOURNISSEUR-Z', '1970-01-01');
  await transaction(c.admin.utilisateurId, q => creerCodeTaxe(q, c.admin, { code: 'TVA', libelle: 'Taxe sur achats', type: 'DEDUCTIBLE', taux: 0.18, assiette: 'HT', compteNumero: '4351', exigibilite: 'EMISSION', dateEffet: '2020-01-01' }));
  await transaction(c.admin.utilisateurId, q => creerCodeTaxe(q, c.admin, { code: 'TVAR', libelle: 'Taxe sur achats récupérable', type: 'DEDUCTIBLE', taux: 0.18, assiette: 'HT', compteNumero: '4351', exigibilite: 'EMISSION', regime: 'RECUPERABLE', dateEffet: '2020-01-01' }));
}, 90_000);
afterAll(fermer);

describe('Factures d\'achat (FIN-RG-033, 034, 101)', () => {
  it('CA-FIN-17 : facture du 10/03 à 30 jours fin de mois → échéance au 30/04 ; autres conditions', () => {
    expect(echeanceDe('2026-03-10', 'J30FM')).toBe('2026-04-30');
    expect(echeanceDe('2026-03-10', 'J30')).toBe('2026-04-09');
    expect(echeanceDe('2026-01-31', 'LE10')).toBe('2026-02-10');
    expect(echeanceDe('2026-03-10', 'COMPTANT')).toBe('2026-03-10');
  });

  it('CA-FIN-13 : taxe non récupérable incluse dans la charge, puis récupérable au compte de taxe ; total dû identique', async () => {
    const [a, b] = await Promise.all([
      calculerFactureAchat(getPool(), facture([{ modele: 'FOURNITURES', libelle: 'Fournitures', montantHT: 1_500_000, codeTaxe: 'TVA' }])),
      calculerFactureAchat(getPool(), facture([{ modele: 'FOURNITURES', libelle: 'Fournitures', montantHT: 1_500_000, codeTaxe: 'TVAR' }])),
    ]);
    expect(a).toMatchObject({ ttc: 1_770_000, recuperable: 0 });
    expect(a.lignes[0]).toMatchObject({ cout: 1_770_000 });
    expect(b).toMatchObject({ ttc: 1_770_000, recuperable: 270_000 });
    expect(b.lignes[0]).toMatchObject({ cout: 1_500_000 });
  });

  it('brouillard jusqu\'à la validation (EVT-15) ; CA-FIN-11 : balance des fournisseurs = compte 461 ; paiement EVT-16 lettré avec la facture', async () => {
    const avant = await solde('6311');
    const r = await transaction(comptable.utilisateurId, q => saisirFactureAchat(q, comptable, facture([{ modele: 'FOURNITURES', libelle: 'Fournitures', montantHT: 1_500_000, codeTaxe: 'TVAR' }], { numeroFacture: 'Z-0042' })));
    expect(r.echeance).toBe(echeanceDe(T, 'J30'));
    await expect(transaction(comptable.utilisateurId, q => saisirFactureAchat(q, comptable, facture([{ modele: 'FOURNITURES', libelle: 'x', montantHT: 1 }], { numeroFacture: 'Z-0042' }))))
      .rejects.toMatchObject({ code: 'FACTURE_EXISTANTE' });
    expect(await solde('6311')).toBe(avant);
    await valider(comptable2, r.demandeValidation);
    await valider(c.daf, r.demandeValidation);
    expect(await solde('6311')).toBe(avant + 1_500_000);
    expect(await solde('4351')).toBe(270_000);
    const auxiliaires = Number((await getPool().query(
      `SELECT COALESCE(sum(l.debit - l.credit), 0)::bigint AS s FROM ligne_ecriture l JOIN ecriture e ON e.id = l.ecriture_id JOIN compte_auxiliaire a ON a.id = l.compte_auxiliaire_id
         JOIN compte c ON c.id = a.collectif_id WHERE c.numero = $1 AND e.statut = 'VALIDEE'`, [normaliserNumero('461')])).rows[0].s);
    expect(auxiliaires).toBe(await solde('461'));
    // Paiement : ordre FOURNISSEUR validé par la DAF, exécuté par la Trésorerie
    const coord = await coordonnee(fournisseur, '+224622444001');
    await expect(transaction(comptable.utilisateurId, q => ordonnerPaiementFacture(q, comptable, crypto.randomUUID(), coord))).rejects.toMatchObject({ statut: 404 });
    const o = await transaction(comptable.utilisateurId, q => ordonnerPaiementFacture(q, comptable, r.ficheId, coord));
    await expect(transaction(comptable.utilisateurId, q => ordonnerPaiementFacture(q, comptable, r.ficheId, coord))).rejects.toMatchObject({ code: 'ORDRE_EXISTANT' });
    await valider(c.daf, o.demandeValidation);
    await transaction(tresorier2.utilisateurId, q => executerOrdre(q, tresorier2, o.ordreId, { banque: 'OM' }));
    const ligne = (await getPool().query(`SELECT l.lettrage_id FROM ligne_ecriture l WHERE l.ecriture_id = $1 AND l.credit > 0 AND l.compte_auxiliaire_id IS NOT NULL`, [r.ecritureId])).rows[0];
    expect(ligne.lettrage_id).not.toBeNull();
    expect(await solde('461')).toBe(0);
  });
});

describe('Immobilisations (FIN-RG-140 à 147)', () => {
  it('le cumul linéaire au prorata temporis du cas 7 donne 892 274 en 2026 ; le plan est soldé sur la durée', () => {
    const b = { valeur_origine: 10_620_000, duree_annees: 3, date_mise_en_service: '2026-10-01' };
    expect(cumulAu(b, '2026-12-31')).toBe(892_274);
    const plan = planAmortissement(b);
    expect(plan.map(p => p.annee)).toEqual([2026, 2027, 2028, 2029]);
    expect(plan.reduce((s, p) => s + p.dotation, 0)).toBe(10_620_000);
    expect(plan[1]!.dotation).toBe(3_540_000);
  });

  it('CA-FIN-24 : imprimante de 3 000 000 HT passée en charge, suivie à l\'inventaire', async () => {
    const r = await valideeA(facture([{ modele: 'MATERIEL', libelle: 'Imprimante', montantHT: 3_000_000, passageEnCharge: { motif: 'Bien de faible valeur' } }]));
    expect(r.lignes[0]).toMatchObject({ traitement: 'PASSAGE_CHARGE', proposePassageCharge: true });
    expect((await biensDe(r.ficheId))[0]).toMatchObject({ statut: 'PASSE_EN_CHARGE', valeur_origine: 3_000_000 });
    expect(await solde('6312')).toBe(3_000_000);
    expect(await solde('2243')).toBe(0);
  });

  let bureaux: string[] = [];
  it('CA-FIN-27 : 10 bureaux pour un nouveau bureau direct : immobilisation imposée, 10 fiches à 10 % par an', async () => {
    await expect(calculerFactureAchat(getPool(), facture([{ modele: 'MOBILIER', libelle: 'Bureau', montantHT: 35_000_000, quantite: 10, passageEnCharge: { motif: 'Nouveau bureau direct' } }])))
      .rejects.toMatchObject({ code: 'RENOUVELLEMENT_REQUIS' });
    const r = await valideeA(facture([{ modele: 'MOBILIER', libelle: 'Bureau', montantHT: 35_000_000, quantite: 10 }]));
    const b = await biensDe(r.ficheId);
    expect(b).toHaveLength(10);
    expect(b.every(x => x.statut === 'EN_SERVICE' && x.valeur_origine === 3_500_000 && x.duree_annees === 10)).toBe(true);
    bureaux = b.map(x => x.id);
  });

  it('CA-FIN-26 : 10 bureaux en remplacement de 10 bureaux désignés : passage en charge, anciens bureaux sortis du registre et liés à la facture', async () => {
    const r = await valideeA(facture([{ modele: 'MOBILIER', libelle: 'Bureau neuf', montantHT: 35_000_000, quantite: 10, passageEnCharge: { motif: 'Renouvellement du mobilier', biensRemplaces: bureaux } }], { numeroFacture: 'MOB-REMPL' }));
    expect((await biensDe(r.ficheId)).every(x => x.statut === 'PASSE_EN_CHARGE')).toBe(true);
    const anciens = (await getPool().query(`SELECT i.statut, m.biens_remplaces->>'reference' AS facture FROM immobilisation i JOIN mouvement_immobilisation m ON m.immobilisation_id = i.id AND m.type = 'SORTIE_REMPLACEMENT' WHERE i.id = ANY($1)`, [bureaux])).rows;
    expect(anciens).toHaveLength(10);
    expect(anciens.every(x => x.statut === 'MIS_AU_REBUT' && x.facture === 'MOB-REMPL')).toBe(true);
    expect((await etatFiscal(getPool(), ANNEE)).biensRemplaces).toHaveLength(10);
  });

  it('CA-FIN-28 : poste de travail déclaré « même bien » : prix global 5 300 000 au-delà du seuil, immobilisation imposée', async () => {
    const passage = { motif: 'Faible valeur' };
    await expect(calculerFactureAchat(getPool(), facture([
      { modele: 'MOBILIER', libelle: 'Bureau', montantHT: 3_500_000, groupe: 'POSTE', passageEnCharge: passage },
      { modele: 'MOBILIER', libelle: 'Retour', montantHT: 1_000_000, groupe: 'POSTE', passageEnCharge: passage },
      { modele: 'MOBILIER', libelle: 'Caisson', montantHT: 800_000, groupe: 'POSTE', passageEnCharge: passage },
    ]))).rejects.toMatchObject({ code: 'IMMOBILISATION_IMPOSEE' });
    const r = await valideeA(facture([
      { modele: 'MOBILIER', libelle: 'Bureau', montantHT: 3_500_000, groupe: 'POSTE' }, { modele: 'MOBILIER', libelle: 'Retour', montantHT: 1_000_000, groupe: 'POSTE' },
      { modele: 'MOBILIER', libelle: 'Caisson', montantHT: 800_000, groupe: 'POSTE' }]));
    const b = await biensDe(r.ficheId);
    expect(b).toHaveLength(1);
    expect(b[0]!.valeur_origine).toBe(5_300_000);
  });

  it('CA-FIN-29 : 10 bureaux à 3 400 000 avec 2 000 000 de transport : coût unitaire 3 600 000 pour le contrôle du seuil', async () => {
    const r = await calculerFactureAchat(getPool(), facture([
      { modele: 'MOBILIER', libelle: 'Bureau', montantHT: 34_000_000, quantite: 10 }, { modele: 'MAINTENANCE', libelle: 'Transport', montantHT: 2_000_000, accessoire: true }]));
    expect(r.lignes[0]).toMatchObject({ unitaireHT: 3_600_000, cout: 36_000_000 });
    expect(r.lignes[1]).toMatchObject({ cout: 0 });
    expect(r.ttc).toBe(36_000_000);
  });

  it('CA-FIN-25 : cession en cours d\'année : dotation complémentaire au jour de la sortie, puis sortie et moins-value', async () => {
    const r = await valideeA(facture([{ modele: 'INFORMATIQUE', libelle: 'Portable', montantHT: 3_600_000 }], { dateFacture: `${ANNEE}-01-01`, numeroFacture: 'PORTABLE' }));
    const [b] = await biensDe(r.ficheId);
    await transaction(comptable.utilisateurId, q => completerBien(q, comptable, b!.id, { dateMiseEnService: `${ANNEE}-01-01`, localisation: { departement: 'ADMSI' } }));
    const s = await transaction(comptable.utilisateurId, q => proposerSortie(q, comptable, b!.id, { type: 'CESSION', date: `${ANNEE}-07-01`, prix: 3_000_000, banque: 'OM', motif: 'Vente à un salarié' }));
    const cumul = Math.round(1_200_000 * 182 / 365);
    const vncAvant = await solde('6871');
    expect(s.vncEstimee).toBe(3_600_000 - cumul);
    await valider(comptable2, s.demandeValidation);
    await valider(c.daf, s.demandeValidation);
    const f = await ficheBien(getPool(), b!.id);
    expect(f).toMatchObject({ statut: 'CEDE', cumul_amortissements: cumul });
    expect(await solde('2242')).toBe(0);
    expect(await solde('7871')).toBe(-3_000_000);
    expect(await solde('6871') - vncAvant).toBe(3_600_000 - cumul);
    expect((await etatFiscal(getPool(), ANNEE)).cessions[0]).toMatchObject({ resultat: 3_000_000 - (3_600_000 - cumul) });
  });
});

describe('Déclarations de taxes : dépôt et paiement (FIN-RG-093, 094)', () => {
  it('CA-FIN-14 : après validation, ordre de paiement à l\'administration fiscale ; paiement EVT-14 au journal de trésorerie ; dépôt daté', async () => {
    const tpa = (await getPool().query(`SELECT id FROM code_taxe WHERE code = 'TPA'`)).rows[0].id;
    const f = await transaction(comptable.utilisateurId, q => creerFicheImputation(q, comptable, { journal: 'OD', reference: 'TPA-REG', libelle: 'Taxe collectée', pieceDocumentId: piece,
      lignes: [{ compte: '571', libelle: 'Caisse', debit: 100_000, credit: 0 }, { compte: '4361', libelle: 'Taxe sur primes', debit: 0, credit: 100_000, codeTaxeId: tpa }] }));
    await valider(comptable2, f.demandeValidation);
    await valider(c.daf, f.demandeValidation);
    const d = await transaction(comptable.utilisateurId, q => preparerDeclaration(q, comptable, 'TPA', T.slice(0, 7)));
    await valider(comptable2, d.demandeValidation);
    await valider(c.daf, d.demandeValidation);
    expect(await solde('4341')).toBe(-100_000);
    const dni = await personne(c.admin, 'DIRECTION-IMPOTS', '1960-01-01');
    const coord = await coordonnee(dni, '+224622444002');
    await transaction(comptable.utilisateurId, q => enregistrerDepot(q, comptable, d.id, { date: T, reference: 'DGI-2026-118' }));
    const o = await transaction(comptable.utilisateurId, q => ordonnerPaiementDeclaration(q, comptable, d.id, { beneficiaireTiersId: dni, coordonneeId: coord }));
    await valider(c.daf, o.demandeValidation);
    await transaction(tresorier2.utilisateurId, q => executerOrdre(q, tresorier2, o.ordreId, { banque: 'OM' }));
    expect(await solde('4341')).toBe(0);
    const decl = (await listerDeclarations(getPool())).find(x => x.numero === d.numero)!;
    expect(decl).toMatchObject({ statut: 'PAYEE', reference_depot: 'DGI-2026-118' });
  });
});

describe('Dotations à la clôture (FIN-RG-143, 144)', () => {
  it('CA-FIN-22 et 23 : serveurs mis en service le 01/10 (dotation 2026 de 892 274) ; véhicule de 150 000 000 : part non déductible sur 50 000 000', async () => {
    const serveurs = await valideeA(facture([{ modele: 'INFORMATIQUE', libelle: 'Serveurs', montantHT: 9_000_000, codeTaxe: 'TVA' }], { dateFacture: `${ANNEE}-09-20`, numeroFacture: 'SRV' }));
    const [s] = await biensDe(serveurs.ficheId);
    expect(s!.valeur_origine).toBe(10_620_000);
    const vehicule = await valideeA(facture([{ modele: 'VEHICULE', libelle: 'Véhicule de tourisme', montantHT: 150_000_000 }], { dateFacture: `${ANNEE}-01-01`, numeroFacture: 'VEH' }));
    const [v] = await biensDe(vehicule.ficheId);
    await transaction(comptable.utilisateurId, async q => {
      await completerBien(q, comptable, s!.id, { dateMiseEnService: `${ANNEE}-10-01` });
      await completerBien(q, comptable, v!.id, { dateMiseEnService: `${ANNEE}-01-01` });
    });
    // Clôtures mensuelles successives jusqu'à décembre : les dotations cumulées égalent l'annuité au prorata
    for (let m = 1; m <= 12; m++) await transaction(comptable.utilisateurId, q => cloturerPeriode(q, comptable, `${ANNEE}-${String(m).padStart(2, '0')}`));
    const plan = async (id: string) => (await getPool().query(`SELECT p.dotation::bigint AS dotation, p.non_deductible::bigint AS nd FROM plan_amortissement p JOIN exercice e ON e.id = p.exercice_id WHERE p.immobilisation_id = $1 AND e.code = $2`, [id, ANNEE])).rows[0];
    expect(await plan(s!.id)).toEqual({ dotation: 892_274, nd: 0 });
    const pv = await plan(v!.id);
    expect(Number(pv.dotation)).toBe(37_500_000);
    expect(Math.abs(Number(pv.nd) - 12_500_000)).toBeLessThanOrEqual(2);
    expect((await etatFiscal(getPool(), ANNEE)).aReintegrer).toBe(Number(pv.nd));
  });
});
