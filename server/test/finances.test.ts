/** Sous-lot 2.6 – Finances : CA-FIN-03, 05, 06, 08, 09, 14, 20 ; FIN-RG-025, 030 à 032, 041, 060, 063, 072, 092, 116. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool, transaction } from '../src/db/pool.js';
import type { Acteur } from '../src/noyau/acteur.js';
import { ajouterJours, aujourdhui } from '../src/noyau/dates.js';
import { creerFicheImputation, creerJournal, fermerJournal, supprimerJournal } from '../src/modules/finances/saisie.js';
import { anomalies, basculerJournee, cloturerPeriode, listerDeclarations, ppna, preparerDeclaration } from '../src/modules/finances/cloture.js';
import { normaliserNumero } from '../src/modules/comptabilite/plan.js';
import { emettrePolice, preparer, valider, type Contexte } from './contexte-production.js';
import { fermer, ouvrir, pieceFictive, utilisateur } from './outils.js';

let c: Contexte, comptable: Acteur, comptable2: Acteur, piece: string;
const T = aujourdhui();
const MOIS = T.slice(0, 7);
const solde = async (numero: string) => Number((await getPool().query(
  `SELECT COALESCE(sum(l.debit - l.credit), 0)::bigint AS s FROM ligne_ecriture l JOIN ecriture e ON e.id = l.ecriture_id JOIN compte c ON c.id = l.compte_id
    WHERE c.numero = $1 AND e.statut = 'VALIDEE' AND e.supprime_le IS NULL`, [normaliserNumero(numero)])).rows[0].s);
const fiche = (journal = 'OD', date?: string, montant = 50_000) => transaction(comptable.utilisateurId, q => creerFicheImputation(q, comptable, {
  journal, date, reference: 'REG-01', libelle: 'Régularisation', pieceDocumentId: piece,
  lignes: [{ compte: '6026', libelle: 'Frais d\'expertise', debit: montant, credit: 0 }, { compte: '571', libelle: 'Caisse', debit: 0, credit: montant }],
}));

beforeAll(async () => {
  await ouvrir();
  c = await preparer();
  comptable = await utilisateur(c.admin, 'comptable', [{ code: 'COMPTABLE' }], c.dg);
  comptable2 = await utilisateur(c.admin, 'chef.comptable', [{ code: 'COMPTABLE' }], c.dg);
  piece = await pieceFictive();
  await emettrePolice(c, 'CLIENT-FIN');
}, 90_000);
afterAll(fermer);

describe('Fiches d\'imputation (FIN-RG-025, 116)', () => {
  it('CA-FIN-03 : au brouillard, sans effet sur les soldes ; validée à deux niveaux, elle reçoit son numéro définitif', async () => {
    const avant = await solde('6026');
    const f = await fiche();
    expect(f.numero).toMatch(/^FI/);
    let e = (await getPool().query('SELECT statut, numero_piece FROM ecriture WHERE id = $1', [f.ecritureId])).rows[0];
    expect(e.statut).toBe('BROUILLARD');
    expect(await solde('6026')).toBe(avant);
    await expect(valider(comptable, f.demandeValidation)).rejects.toThrow(); // l'auteur ne vise pas sa propre fiche
    await valider(comptable2, f.demandeValidation);
    expect((await getPool().query('SELECT statut FROM ecriture WHERE id = $1', [f.ecritureId])).rows[0].statut).toBe('BROUILLARD');
    await valider(c.daf, f.demandeValidation);
    e = (await getPool().query('SELECT statut, numero_piece FROM ecriture WHERE id = $1', [f.ecritureId])).rows[0];
    expect(e.statut).toBe('VALIDEE');
    expect(e.numero_piece).toMatch(/^OD/);
    expect(await solde('6026')).toBe(avant + 50_000);
    const visas = (await getPool().query('SELECT verifie_par, approuve_par FROM fiche_imputation WHERE id = $1', [f.ficheId])).rows[0];
    expect(visas).toEqual({ verifie_par: comptable2.utilisateurId, approuve_par: c.daf.utilisateurId });
  });

  it('pièce déséquilibrée, journal automatique ou sans pièce : refus', async () => {
    await expect(transaction(comptable.utilisateurId, q => creerFicheImputation(q, comptable, {
      journal: 'OD', reference: 'X', libelle: 'X', pieceDocumentId: piece,
      lignes: [{ compte: '6026', libelle: 'a', debit: 10, credit: 0 }, { compte: '571', libelle: 'b', debit: 0, credit: 9 }],
    }))).rejects.toMatchObject({ code: 'PIECE_DESEQUILIBREE' });
    await expect(fiche('EMI')).rejects.toMatchObject({ code: 'JOURNAL_INVALIDE' });
    await expect(transaction(comptable.utilisateurId, q => creerFicheImputation(q, comptable, {
      journal: 'OD', reference: 'X', libelle: 'X', pieceDocumentId: crypto.randomUUID(),
      lignes: [{ compte: '6026', libelle: 'a', debit: 10, credit: 0 }, { compte: '571', libelle: 'b', debit: 0, credit: 10 }],
    }))).rejects.toMatchObject({ code: 'PIECE_REQUISE' });
  });

  it('fiche rejetée : le brouillard est retiré', async () => {
    const f = await fiche('OD', undefined, 7_000);
    await transaction(comptable2.utilisateurId, async q => (await import('../src/moteurs/validation.js')).decider(q, comptable2, f.demandeValidation, 'REJETE', 'Pièce illisible'));
    expect((await getPool().query('SELECT supprime_le IS NOT NULL AS retire FROM ecriture WHERE id = $1', [f.ecritureId])).rows[0].retire).toBe(true);
  });
});

describe('Journaux (FIN-RG-030 à 032)', () => {
  it('CA-FIN-09 : un journal mouvementé ne se supprime pas ; il se ferme, sauf s\'il est alimenté par un schéma', async () => {
    await expect(transaction(comptable.utilisateurId, q => supprimerJournal(q, comptable, 'OD'))).rejects.toMatchObject({ code: 'JOURNAL_MOUVEMENTE' });
    await expect(transaction(comptable.utilisateurId, q => fermerJournal(q, comptable, 'EMI'))).rejects.toMatchObject({ code: 'JOURNAL_UTILISE' });
    await transaction(comptable.utilisateurId, q => creerJournal(q, comptable, { code: 'ODX', libelle: 'OD exceptionnelles', type: 'OPERATIONS_DIVERSES', mode: 'MANUEL' }));
    await transaction(comptable.utilisateurId, q => fermerJournal(q, comptable, 'ODX'));
    await expect(fiche('ODX')).rejects.toMatchObject({ code: 'JOURNAL_INVALIDE' });
    await transaction(comptable.utilisateurId, q => supprimerJournal(q, comptable, 'ODX')); // jamais mouvementé
  });
});

describe('Déclarations de taxes (FIN-RG-092, 093)', () => {
  it('CA-FIN-14 : montant égal au solde du compte de taxe ; validation comptable puis DAF ; liquidation ; une seule par période', async () => {
    const avant = await solde('4361');
    const d = await transaction(comptable.utilisateurId, q => preparerDeclaration(q, comptable, 'TPA', MOIS));
    expect(d.numero).toBe(`TPA${MOIS.replace('-', '')}`);
    expect(d.montant).toBe(-avant); // compte créditeur : solde à reverser
    expect(d.montant).toBe(290_000); // 5 % de (5 790 000 + 10 000)
    await expect(transaction(comptable.utilisateurId, q => preparerDeclaration(q, comptable, 'TPA', MOIS))).rejects.toMatchObject({ code: 'DECLARATION_EXISTANTE' });
    await valider(comptable2, d.demandeValidation);
    await valider(c.daf, d.demandeValidation);
    const l = (await listerDeclarations(getPool())).find(x => x.numero === d.numero)!;
    expect(l.statut).toBe('VALIDEE');
    expect(l.numero_piece).toMatch(/^AUT/);
    expect(await solde('4361')).toBe(0);
    expect(await solde('4341')).toBe(-290_000);
  });
});

describe('Journée comptable et clôture (FIN-RG-041, 060, 063, 072)', () => {
  it('PPNA au prorata au jour près de la prime nette restant à courir', () => {
    expect(ppna(365_000, '2026-01-01', '2026-12-31', '2026-01-31')).toBe(334_000);
    expect(ppna(365_000, '2026-01-01', '2026-12-31', '2026-12-31')).toBe(0);
    expect(ppna(365_000, '2026-02-01', '2027-01-31', '2026-01-31')).toBe(365_000);
  });

  it('CA-FIN-05 : la journée bascule malgré une anomalie, qui bloque la clôture', async () => {
    const q0 = (await getPool().query(`SELECT id, statut FROM quittance ORDER BY cree_le LIMIT 1`)).rows[0];
    await getPool().query(`UPDATE quittance SET statut = 'EMISE' WHERE id = $1`, [q0.id]);
    const a = await transaction(null, q => basculerJournee(q, T));
    expect(a.join()).toMatch(/non soldée/);
    expect((await getPool().query('SELECT anomalies FROM journee_comptable WHERE date = $1', [T])).rows[0].anomalies).toHaveLength(1);
    await expect(transaction(comptable2.utilisateurId, q => cloturerPeriode(q, comptable2, MOIS))).rejects.toMatchObject({ code: 'ANOMALIES_BLOQUANTES' });
    await getPool().query(`UPDATE quittance SET statut = $2 WHERE id = $1`, [q0.id, q0.statut]);
    expect(await anomalies(getPool(), T)).toEqual([]);
  });

  it('CA-FIN-06 : clôture mensuelle : PPNA police par police (EVT-13), état justificatif, reprise au 1er jour suivant', async () => {
    const p = (await getPool().query(`SELECT pp.prime_nette, pp.date_debut::text, pp.date_fin::text FROM police_periode pp`)).rows;
    const [a, m] = MOIS.split('-').map(Number) as [number, number];
    const fin = ajouterJours(m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`, -1);
    const attendu = p.reduce((s, x) => s + ppna(Number(x.prime_nette), x.date_debut, x.date_fin, fin), 0);
    const r = await transaction(comptable2.utilisateurId, q => cloturerPeriode(q, comptable2, MOIS));
    expect(r.ppna).toBe(attendu);
    expect(r.ppna).toBeGreaterThan(0);
    expect(r.reprise).toBeTruthy();
    expect(await solde('3212')).toBe(0); // provision constituée fin de mois puis reprise à l'ouverture
    const e = (await getPool().query(`SELECT e.date_comptable::text, d.type_document FROM ecriture e JOIN document d ON d.id = e.piece_justificative_id WHERE e.reference = $1`, [`PPNA ${MOIS}`])).rows[0];
    expect(e).toEqual({ date_comptable: fin, type_document: 'ETAT_PROVISIONS' });
    const x = (await getPool().query(`SELECT date_comptable::text FROM ecriture WHERE reference LIKE 'EXT %' ORDER BY cree_le DESC LIMIT 1`)).rows[0];
    expect(x.date_comptable).toBe(ajouterJours(fin, 1));
    expect((await getPool().query(`SELECT count(*)::int AS n FROM provision_calcul`)).rows[0].n).toBe(p.length);
    expect((await getPool().query(`SELECT statut FROM periode WHERE mois = $1`, [MOIS])).rows[0].statut).toBe('CLOTUREE');
    await expect(transaction(comptable2.utilisateurId, q => cloturerPeriode(q, comptable2, MOIS))).rejects.toMatchObject({ code: 'DEJA_CLOTUREE' });
  });

  it('CA-FIN-20 : aucune saisie dans une période clôturée', async () => {
    await expect(fiche('OD', T)).rejects.toMatchObject({ code: 'PERIODE_CLOTUREE' });
  });

  it('l\'événement CLOTURE_PERIODE est publié', async () => {
    const n = (await getPool().query(`SELECT count(*)::int AS n FROM evenement_metier WHERE type_evenement = 'CLOTURE_PERIODE'`)).rows[0].n;
    expect(n).toBe(1);
  });
});

describe('Journaux réservés', () => {
  it('un journal alimenté par un schéma ou rattaché à une banque ne se supprime pas, même vide', async () => {
    await expect(transaction(comptable.utilisateurId, q => supprimerJournal(q, comptable, 'INV'))).rejects.toMatchObject({ code: 'JOURNAL_UTILISE' });
    await expect(transaction(comptable.utilisateurId, q => supprimerJournal(q, comptable, 'OM'))).rejects.toMatchObject({ code: 'JOURNAL_UTILISE' });
    await expect(transaction(comptable.utilisateurId, q => supprimerJournal(q, comptable, 'CAI'))).rejects.toMatchObject({ code: 'JOURNAL_UTILISE' });
  });
});
