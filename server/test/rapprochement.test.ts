/** Sous-lot 2.6 (fin) – Rapprochement bancaire : CA-FIN-19 ; FIN-RG-042, 043. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool, transaction } from '../src/db/pool.js';
import type { Acteur } from '../src/noyau/acteur.js';
import { ajouterJours, aujourdhui } from '../src/noyau/dates.js';
import { creerFicheImputation } from '../src/modules/finances/saisie.js';
import {
  annulerRapprochement, comptabiliserOperationBanque, editerEtat, etatRapprochement, importerReleve, lireReleve, rapprocher, releve,
} from '../src/modules/finances/rapprochement.js';
import { preparer, valider, type Contexte } from './contexte-production.js';
import { fermer, ouvrir, pieceFictive, utilisateur } from './outils.js';

let c: Contexte, comptable: Acteur, comptable2: Acteur, piece: string;
const T = aujourdhui(), J = (n: number) => ajouterJours(T, -n);
const fr = (d: string) => d.split('-').reverse().join('/');
/** Écriture validée sur le compte de l'opérateur OM (5631) : montant positif = entrée. */
const mouvement = async (montant: number, reference: string, date: string) => {
  const f = await transaction(comptable.utilisateurId, q => creerFicheImputation(q, comptable, { journal: 'OD', date, reference, libelle: `Mouvement ${reference}`, pieceDocumentId: piece,
    lignes: montant > 0
      ? [{ compte: '5631', libelle: reference, debit: montant, credit: 0 }, { compte: '471', libelle: reference, debit: 0, credit: montant }]
      : [{ compte: '6311', libelle: reference, debit: -montant, credit: 0 }, { compte: '5631', libelle: reference, debit: 0, credit: -montant }] }));
  await valider(comptable2, f.demandeValidation);
  await valider(c.daf, f.demandeValidation);
  return f;
};

beforeAll(async () => {
  await ouvrir();
  c = await preparer();
  comptable = await utilisateur(c.admin, 'comptable', [{ code: 'COMPTABLE' }], c.dg);
  comptable2 = await utilisateur(c.admin, 'chef.comptable', [{ code: 'COMPTABLE' }], c.dg);
  piece = await pieceFictive('piece_comptable');
}, 90_000);
afterAll(fermer);

describe('Relevés et rapprochement (FIN-RG-042, 043)', () => {
  it('lecture du relevé : en-tête ignoré, dates et montants au format local', () => {
    expect(lireReleve('Date;Libellé;Montant;Référence\n05/11/2026;Virement reçu;1 250 000;VIR-1\n2026-11-06\tFrais\t-15000\t')).toEqual([
      { date: '2026-11-05', libelle: 'Virement reçu', montant: 1_250_000, reference: 'VIR-1' }, { date: '2026-11-06', libelle: 'Frais', montant: -15_000, reference: undefined }]);
    expect(() => lireReleve('05/11/2026;X;douze;')).toThrow(/montant illisible/);
  });

  it('CA-FIN-19 : opérations rapprochées automatiquement, écarts présentés ; frais générés par modèle et validés ; état de rapprochement', async () => {
    await mouvement(500_000, 'VIR-CLIENT-1', J(6));           // retrouvé par sa référence malgré l'écart de dates
    await mouvement(-200_000, 'CHQ-0042', J(4));              // retrouvé par montant et date (candidat unique)
    await mouvement(-80_000, 'ACHAT-A', J(3));                // deux sorties identiques : ambiguïté laissée à la Trésorerie
    await mouvement(-80_000, 'ACHAT-B', J(3));
    await mouvement(-50_000, 'NON-PRESENTE', J(1));           // écriture absente du relevé
    const contenu = [
      'Date;Libellé;Montant;Référence',
      `${fr(J(2))};Virement client;500000;VIR-CLIENT-1`,
      `${fr(J(3))};Chèque;-200 000;`,
      `${fr(J(3))};Prélèvement;-80000;`,
      `${fr(J(3))};Prélèvement;-80000;X2`,
      `${fr(J(2))};Frais de tenue de compte;-15000;FR-11`,
    ].join('\n');
    const r = await transaction(c.tresorier.utilisateurId, q => importerReleve(q, c.tresorier, 'OM', lireReleve(contenu)));
    expect(r).toMatchObject({ importees: 5, ignorees: 0, rapprochees: 2, restantes: 3 });
    // Réimport : rien n'est dupliqué
    expect(await transaction(c.tresorier.utilisateurId, q => importerReleve(q, c.tresorier, 'OM', lireReleve(contenu)))).toMatchObject({ importees: 0, ignorees: 5 });

    const vue = await releve(getPool(), 'OM');
    const prelevements = vue.lignes.filter((l: { montant: number }) => Number(l.montant) === -80_000);
    const sorties = vue.ecrituresLibres.filter(e => e.montant === -80_000);
    expect(prelevements).toHaveLength(2);
    expect(sorties).toHaveLength(2);
    // Rapprochement manuel : montant différent refusé, puis les deux paires
    await expect(transaction(c.tresorier.utilisateurId, q => rapprocher(q, c.tresorier, prelevements[0].id, vue.ecrituresLibres.find(e => e.montant === -50_000)!.id)))
      .rejects.toMatchObject({ code: 'MONTANTS_DIFFERENTS' });
    await transaction(c.tresorier.utilisateurId, q => rapprocher(q, c.tresorier, prelevements[0].id, sorties[0]!.id));
    await expect(transaction(c.tresorier.utilisateurId, q => rapprocher(q, c.tresorier, prelevements[1].id, sorties[0]!.id))).rejects.toMatchObject({ code: 'ECRITURE_DEJA_RAPPROCHEE' });
    await transaction(c.tresorier.utilisateurId, q => rapprocher(q, c.tresorier, prelevements[1].id, sorties[1]!.id));
    await transaction(c.tresorier.utilisateurId, q => annulerRapprochement(q, c.tresorier, prelevements[1].id));
    await transaction(c.tresorier.utilisateurId, q => rapprocher(q, c.tresorier, prelevements[1].id, sorties[1]!.id));

    // Frais : générés par modèle, comptés seulement une fois validés
    const frais = vue.lignes.find((l: { reference: string | null }) => l.reference === 'FR-11');
    let etat = await etatRapprochement(getPool(), 'OM', T);
    expect(etat.operations.map(o => o.montant)).toEqual([-15_000]);
    const f = await transaction(c.tresorier.utilisateurId, q => comptabiliserOperationBanque(q, c.tresorier, frais.id, { modele: 'FRAIS_BANCAIRES', pieceDocumentId: piece }));
    expect((await etatRapprochement(getPool(), 'OM', T)).operations).toHaveLength(1);
    await valider(comptable, f.demandeValidation);
    await valider(c.daf, f.demandeValidation);
    etat = await etatRapprochement(getPool(), 'OM', T, 500_000 - 200_000 - 160_000 - 15_000);
    expect(etat.operations).toHaveLength(0);
    expect(etat.ecritures.map(e => e.montant)).toEqual([-50_000]);
    expect(etat.soldeComptable).toBe(500_000 - 200_000 - 160_000 - 50_000 - 15_000);
    expect(etat.soldeReconstitue).toBe(500_000 - 200_000 - 160_000 - 15_000);
    expect(etat.ecart).toBe(0);
    expect(etat.cumulReleve).toBe(etat.soldeReconstitue);
    // État à une date antérieure : le virement du relevé (J-2) n'y figure pas encore
    expect((await etatRapprochement(getPool(), 'OM', J(5))).ecritures.map(e => e.montant)).toEqual([500_000]);
    const pdf = await transaction(c.tresorier.utilisateurId, q => editerEtat(q, c.tresorier, 'OM', T));
    expect(pdf.documentId).toBeTruthy();
    expect((await releve(getPool(), 'OM')).lignes.every((l: { statut: string }) => l.statut === 'RAPPROCHEE')).toBe(true);
  });
});
