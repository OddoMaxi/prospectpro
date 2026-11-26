/** Sous-lot 2.1 – Moteur comptable : FIN-RG-002, 003, 013, 020 à 026, 041, 072, 074, 075, 112. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool, transaction } from '../src/db/pool.js';
import type { Acteur } from '../src/noyau/acteur.js';
import { aujourdhui } from '../src/noyau/dates.js';
import { decider } from '../src/moteurs/validation.js';
import { creerTiers } from '../src/modules/referentiels/tiers.js';
import { attribuerRole } from '../src/modules/referentiels/roles.js';
import { creerCodeTaxe, ouvrirCompteAuxiliaire } from '../src/modules/comptabilite/plan.js';
import { comptabiliser, delettrer, extourner, lettrerManuellement, scellerEcritures, verifierScellement, type Evenement } from '../src/modules/comptabilite/moteur.js';
import { dateComptable } from '../src/modules/comptabilite/exercices.js';
import { balanceAuxiliaire, balanceGenerale, grandLivre } from '../src/modules/comptabilite/etats.js';
import { listerSchemas, proposerSchema } from '../src/modules/comptabilite/schemas.js';
import { fermer, installee, ouvrir, utilisateur } from './outils.js';

let admin: Acteur, dg: Acteur;
const ANNEE = aujourdhui().slice(0, 4);
const compte = async (n: string) => (await getPool().query(`SELECT id FROM compte WHERE numero = rpad($1, 8, '0')`, [n])).rows[0].id as string;
let piece: string, client: { compteId: string; auxiliaireId: string }, production: { compteId: string; auxiliaireId: string }, agent: { compteId: string; auxiliaireId: string };
let tpa: string;

/** Émission de 430 500 GNF par débit du compte de production (cas 1 du § 11.14, montants de la maquette). */
const emission = (reference: string): Evenement => ({
  codeEvt: 'EVT-02', reference, pieceDocumentId: piece, libelle: { police: '1011000001234', bureau: '01' },
  montants: { PRIME_NETTE: 400_000, ACCESSOIRES: 10_000, PRIME_TOTALE: 430_500, ENCAISSE: 430_500, COMMISSION: 40_000 },
  comptes: {
    CLIENT: client, PRIMES_BRANCHE: { compteId: '' }, TAXES: [{ compteId: '', montant: 20_500, codeTaxeId: tpa }],
    COMPTE_PRODUCTION: production, COMMISSIONS_A_PAYER: [{ ...agent, montant: 40_000 }],
  },
});

beforeAll(async () => {
  await ouvrir();
  ({ admin, dg } = await installee());
  piece = (await getPool().query(
    `INSERT INTO document (type_document, objet_type, objet_id, fichier_ref, empreinte, horodatage_scellement, origine, imprime, conservation_jusqu_au)
     VALUES ('QUITTANCE', 'test', gen_random_uuid(), 'test/quittance.pdf', repeat('b', 64), now(), 'PRODUIT', 0, '2040-01-01') RETURNING id`)).rows[0].id;
  const souscripteur = await transaction(admin.utilisateurId, q => creerTiers(q, admin, { nature: 'PHYSIQUE', nom: 'CAMARA', prenoms: 'Mamadou', date_naissance: '1986-04-12', telephone: '+224622000001' }));
  const r = await transaction(admin.utilisateurId, q => attribuerRole(q, admin, { tiersId: souscripteur, role: 'SOUSCRIPTEUR' }));
  client = { compteId: await compte('412'), auxiliaireId: r.compteAuxiliaire!.id };
  const ag = await transaction(admin.utilisateurId, q => creerTiers(q, admin, { nature: 'PHYSIQUE', nom: 'SOW', prenoms: 'Alpha', date_naissance: '1975-01-01', telephone: '+224622000002' }));
  const ra = await transaction(admin.utilisateurId, q => attribuerRole(q, admin, { tiersId: ag, role: 'AGENT_GENERAL' }));
  agent = { compteId: await compte('4112'), auxiliaireId: ra.compteAuxiliaire!.id };
  const cp = await transaction(admin.utilisateurId, q => ouvrirCompteAuxiliaire(q, admin, ag, '4111'));
  production = { compteId: await compte('4111'), auxiliaireId: cp.id };
  tpa = await transaction(admin.utilisateurId, q => creerCodeTaxe(q, admin, { code: 'TPA', libelle: 'Taxe sur primes', type: 'TAXE_PRIMES', taux: 0.05, assiette: 'PRIME_NETTE_ACCESSOIRES', compteNumero: '4361', exigibilite: 'EMISSION', dateEffet: `${ANNEE}-01-01` }));
  const ev = emission('x');
  (ev.comptes!.PRIMES_BRANCHE as { compteId: string }).compteId = await compte('70211');
  const taxes = ev.comptes!.TAXES as { compteId: string }[];
  taxes[0]!.compteId = await compte('4361');
  emissionModele = ev;
});
afterAll(fermer);
let emissionModele: Evenement;
const evenement = (reference: string): Evenement => JSON.parse(JSON.stringify({ ...emissionModele, reference }));

describe('Installation comptable', () => {
  it('journaux du § 11.7, exercice ouvert et schémas du catalogue (§ 11.13)', async () => {
    const j = (await getPool().query('SELECT code FROM journal ORDER BY code')).rows.map(r => r.code);
    expect(j).toEqual(expect.arrayContaining(['DEP', 'EMI', 'ENC', 'COM', 'SAN', 'SIN', 'ACH', 'TRE', 'CAI', 'INV', 'OD', 'AUT', 'AN']));
    expect((await dateComptable(getPool())).exercice).toBe(ANNEE);
    const s = await listerSchemas(getPool());
    expect(s.filter(x => x.code_evt === 'EVT-02').map(x => x.journal).sort()).toEqual(['COM', 'EMI', 'ENC']);
  });
});

describe('Moteur d\'écritures (FIN-RG-020 à 026)', () => {
  it('émission par compte de production : constatation, perception et commission, lettrage du client', async () => {
    const e = await transaction(admin.utilisateurId, q => comptabiliser(q, admin, evenement('Q1')));
    expect(e.map(x => x.journal).sort()).toEqual(['COM', 'EMI', 'ENC']);
    expect(e.find(x => x.journal === 'EMI')!.numero).toBe(`EMI${ANNEE}00000001`);
    const b = await balanceGenerale(getPool(), `${ANNEE}-01-01`, `${ANNEE}-12-31`);
    const solde = (n: string) => Number(b.find(x => x.numero === n.padEnd(8, '0'))?.solde ?? 0);
    expect(solde('70211')).toBe(-400_000);
    expect(solde('7511')).toBe(-10_000);
    expect(solde('4361')).toBe(-20_500);
    expect(solde('412')).toBe(0); // passage par le compte du client, soldé le jour même (§ 11.12)
    expect(solde('4111')).toBe(430_500);
    expect(solde('6431')).toBe(40_000);
    expect(solde('4112')).toBe(-40_000);
    // Quittance et règlement lettrés automatiquement sur le compte du client
    const gl = await grandLivre(getPool(), { compte: '412', du: `${ANNEE}-01-01`, au: `${ANNEE}-12-31` });
    expect(gl).toHaveLength(2);
    expect(gl[0]!.lettrage).toBeTruthy();
    expect(gl[0]!.lettrage).toBe(gl[1]!.lettrage);
    // FIN-RG-013 : balance auxiliaire = solde du collectif
    const aux = await balanceAuxiliaire(getPool(), '4111', `${ANNEE}-12-31`);
    expect(aux.reduce((s, a) => s + Number(a.solde), 0)).toBe(solde('4111'));
  });

  it('numérotation continue par journal et par exercice', async () => {
    const e = await transaction(admin.utilisateurId, q => comptabiliser(q, admin, evenement('Q2')));
    expect(e.find(x => x.journal === 'EMI')!.numero).toBe(`EMI${ANNEE}00000002`);
  });

  it('FIN-RG-021 : schéma absent, compte non déterminé ou pièce déséquilibrée bloquent l\'événement', async () => {
    await expect(transaction(admin.utilisateurId, q => comptabiliser(q, admin, { ...evenement('X'), codeEvt: 'EVT-99' }))).rejects.toMatchObject({ code: 'SCHEMA_ABSENT' });
    const sansClient = evenement('X');
    delete sansClient.comptes!.CLIENT;
    await expect(transaction(admin.utilisateurId, q => comptabiliser(q, admin, sansClient))).rejects.toMatchObject({ code: 'REGLE_NON_RESOLUE' });
    const faux = evenement('X');
    (faux.comptes!.TAXES as { montant: number }[])[0]!.montant = 20_000;
    await expect(transaction(admin.utilisateurId, q => comptabiliser(q, admin, faux))).rejects.toMatchObject({ code: 'PIECE_DESEQUILIBREE' });
    // Rien n'a été écrit : la numérotation reprend sans trou
    const e = await transaction(admin.utilisateurId, q => comptabiliser(q, admin, evenement('Q3')));
    expect(e.find(x => x.journal === 'EMI')!.numero).toBe(`EMI${ANNEE}00000003`);
  });

  it('la base refuse les écritures irrégulières et toute modification (FIN-RG-002, 003, 024, 074)', async () => {
    const l = (await getPool().query(`SELECT l.id, l.ecriture_id FROM ligne_ecriture l LIMIT 1`)).rows[0];
    await expect(getPool().query('UPDATE ligne_ecriture SET debit = debit + 1 WHERE id = $1', [l.id])).rejects.toThrow(/inaltérable/);
    await expect(getPool().query(`UPDATE ecriture SET libelle = 'x' WHERE id = $1`, [l.ecriture_id])).rejects.toThrow(/inaltérable/);
    const j = (await getPool().query(`SELECT id FROM journal WHERE code = 'OD'`)).rows[0].id;
    const inserer = (lignes: [string, string | null, number, number][]) => transaction(admin.utilisateurId, async q => {
      const e = await q.query(`INSERT INTO ecriture (numero_piece, journal_id, date_comptable, libelle, reference, origine, statut, piece_justificative_id)
                               VALUES ('T' || floor(random() * 1e9)::text, $1, current_date, 'test', 'test', 'SAISIE', 'VALIDEE', $2) RETURNING id`, [j, piece]);
      for (const [c, a, dt, ct] of lignes) await q.query('INSERT INTO ligne_ecriture (ecriture_id, compte_id, compte_auxiliaire_id, libelle, debit, credit) VALUES ($1,$2,$3,$4,$5,$6)', [e.rows[0].id, c, a, 't', dt, ct]);
    });
    await expect(inserer([[await compte('571'), null, 100, 0], [await compte('7511'), null, 0, 90]])).rejects.toThrow(/déséquilibrée/);
    await expect(inserer([[await compte('7021'), null, 100, 0], [await compte('7511'), null, 0, 100]])).rejects.toThrow(/non imputable/);
    await expect(inserer([[await compte('412'), null, 100, 0], [await compte('7511'), null, 0, 100]])).rejects.toThrow(/exige un compte auxiliaire/);
    await expect(inserer([[await compte('412'), production.auxiliaireId, 100, 0], [await compte('7511'), null, 0, 100]])).rejects.toThrow(/n'appartient pas/);
  });

  it('FIN-RG-112 : contre-passation liée à la pièce d\'origine, une seule fois', async () => {
    const e = await transaction(admin.utilisateurId, q => comptabiliser(q, admin, evenement('Q4')));
    const emi = e.find(x => x.journal === 'EMI')!;
    const avant = await balanceGenerale(getPool(), `${ANNEE}-01-01`, `${ANNEE}-12-31`);
    const x = await transaction(admin.utilisateurId, q => extourner(q, admin, emi.id, 'Erreur de formule'));
    expect(x.numero).toBe(`EMI${ANNEE}00000005`);
    await expect(transaction(admin.utilisateurId, q => extourner(q, admin, emi.id, 'bis'))).rejects.toMatchObject({ code: 'DEJA_EXTOURNEE' });
    const apres = await balanceGenerale(getPool(), `${ANNEE}-01-01`, `${ANNEE}-12-31`);
    const s = (b: typeof avant, n: string) => Number(b.find(r => r.numero === n.padEnd(8, '0'))?.solde ?? 0);
    expect(s(apres, '70211') - s(avant, '70211')).toBe(400_000);
  });

  it('lettrage manuel et délettrage tracés', async () => {
    const lignesQ1 = async () => (await getPool().query(
      `SELECT l.id, lt.code FROM ligne_ecriture l JOIN ecriture e ON e.id = l.ecriture_id LEFT JOIN lettrage lt ON lt.id = l.lettrage_id
        WHERE l.compte_auxiliaire_id = $1 AND e.reference = 'Q1' ORDER BY l.id`, [client.auxiliaireId])).rows as { id: string; code: string | null }[];
    const code = (await lignesQ1())[0]!.code!;
    await transaction(admin.utilisateurId, q => delettrer(q, admin, code));
    expect((await lignesQ1()).every(l => l.code === null)).toBe(true);
    const ids = (await lignesQ1()).map(l => l.id);
    await transaction(admin.utilisateurId, q => lettrerManuellement(q, admin, ids));
    expect(new Set((await lignesQ1()).map(l => l.code)).size).toBe(1);
    await expect(transaction(admin.utilisateurId, q => lettrerManuellement(q, admin, ids))).rejects.toMatchObject({ code: 'DEJA_LETTRE' });
  });
});

describe('Périodes et scellement', () => {
  it('FIN-RG-072 : une opération d\'une période clôturée est datée du premier jour ouvert suivant', async () => {
    await getPool().query(`UPDATE periode SET statut = 'CLOTUREE' WHERE mois = $1`, [`${ANNEE}-03`]);
    const d = await dateComptable(getPool(), `${ANNEE}-03-15`);
    expect(d).toMatchObject({ date: `${ANNEE}-04-01`, origine: `${ANNEE}-03-15` });
    await getPool().query(`UPDATE periode SET statut = 'OUVERTE' WHERE mois = $1`, [`${ANNEE}-03`]);
  });

  it('FIN-RG-023 : scellement par lots chaînés ; une altération est détectée', async () => {
    const lot = await transaction(null, q => scellerEcritures(q));
    expect(lot!.pieces).toBeGreaterThan(5);
    expect(await transaction(null, q => scellerEcritures(q))).toBeNull();
    await transaction(admin.utilisateurId, q => comptabiliser(q, admin, evenement('Q6')));
    await transaction(null, q => scellerEcritures(q));
    expect(await verifierScellement(getPool())).toEqual({ lots: 2, premiereAlteration: null });
    await getPool().query('ALTER TABLE ligne_ecriture DISABLE TRIGGER USER');
    await getPool().query(`UPDATE ligne_ecriture SET libelle = 'falsifié' WHERE id = (SELECT min(id::text)::uuid FROM ligne_ecriture)`);
    await getPool().query('ALTER TABLE ligne_ecriture ENABLE TRIGGER USER');
    expect((await verifierScellement(getPool())).premiereAlteration).toBe(lot!.lot);
  });
});

describe('Paramétrage des schémas', () => {
  it('un nouveau schéma est proposé par le comptable et validé par la DAF', async () => {
    const comptable = await utilisateur(admin, 'chef.comptable', [{ code: 'COMPTABLE' }], dg);
    const daf = await utilisateur(admin, 'daf', [{ code: 'DAF' }], dg);
    const lendemain = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const d = await transaction(comptable.utilisateurId, q => proposerSchema(q, comptable, {
      codeEvt: 'EVT-07', typeEvenement: 'PRIME_ANTICIPATION_ACQUISE', journal: 'COM', libelle: 'Prime anticipée {{reference}}', dateEffet: lendemain,
      lignes: [{ compte: '6431', sens: 'D', formule: 'MONTANT' }, { regle: 'COMMISSIONS_A_PAYER', sens: 'C', formule: 'MONTANT' }],
    }, 'Nouveau libellé'));
    await expect(transaction(comptable.utilisateurId, q => decider(q, comptable, d.id, 'VALIDE'))).rejects.toMatchObject({ statut: 403 });
    await transaction(daf.utilisateurId, q => decider(q, daf, d.id, 'VALIDE'));
    expect((await listerSchemas(getPool(), lendemain)).find(s => s.code_evt === 'EVT-07')!.libelle_modele).toBe('Prime anticipée {{reference}}');
    expect((await listerSchemas(getPool())).find(s => s.code_evt === 'EVT-07')!.libelle_modele).toMatch(/renouvellement anticipé/);
  });
});
