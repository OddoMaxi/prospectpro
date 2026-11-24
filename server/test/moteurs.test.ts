/** Sous-lots 1.3 à 1.5 – Numérotation (CA-NUM-01 à 09), paramètres et règles légales, audit, chiffrement, tiers (CA-REF-01). */
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool, transaction } from '../src/db/pool.js';
import type { Acteur } from '../src/noyau/acteur.js';
import { attribuer, cleMod97, composerNumeroPolice, controlerNumeroPolice, numeroCarte, prochaineValeur } from '../src/moteurs/numerotation.js';
import { appliquerChangement, valeurParametre } from '../src/moteurs/parametres.js';
import { journaliser, verifierChaine } from '../src/moteurs/audit.js';
import { GardienLocal, MoteurChiffrement } from '../src/moteurs/chiffrement.js';
import { creerTiers, modifierTiers } from '../src/modules/referentiels/tiers.js';
import { fermer, installee, ouvrir } from './outils.js';

let admin: Acteur;
beforeAll(async () => { await ouvrir(); ({ admin } = await installee()); });
afterAll(fermer);

describe('Numéro de police (chapitre 6)', () => {
  it('reproduit les exemples vérifiables du § 6.2', () => {
    expect(composerNumeroPolice({ nature: 'PHYSIQUE', codeBureau: '01', codeProduit: '01', sequence: 125, annee: 2026 })).toBe('101010001252604');
    expect(composerNumeroPolice({ nature: 'MORALE', codeBureau: '01', codeProduit: '02', sequence: 1, annee: 2026 })).toBe('201020000012648');
    expect(composerNumeroPolice({ nature: 'PHYSIQUE', codeBureau: '02', codeProduit: '01', sequence: 1, annee: 2027 })).toBe('102010000012797');
    expect(cleMod97('2010300000126')).toBe('96');
  });

  it('CA-NUM-06 : rejette une clé incorrecte', () => {
    expect(() => controlerNumeroPolice('101010001252605')).toThrow(/clé de contrôle incorrecte/);
    expect(() => controlerNumeroPolice('101010001252604')).not.toThrow();
  });

  it('CA-NUM-09 : numéro de carte d\'un enfant d\'adhérent', () => {
    expect(numeroCarte('201030000012696', 3, '00412')).toBe('201030000012696-00412-03');
  });

  const emettre = (bureau: string, produit: string, annee: number) =>
    transaction(admin.utilisateurId, q => attribuer(q, admin, { type: 'POLICE', nature: 'PHYSIQUE', codeBureau: bureau, codeProduit: produit, annee }));

  it('CA-NUM-01 à 03 : séquences par bureau, produit et année', async () => {
    expect((await emettre('01', '01', 2026)).slice(5, 11)).toBe('000001');
    expect((await emettre('01', '01', 2026)).slice(5, 11)).toBe('000002');
    expect((await emettre('01', '02', 2026)).slice(5, 11)).toBe('000001');
    const n = await emettre('01', '01', 2027);
    expect(n.slice(5, 13)).toBe('00000127');
  });

  it('CA-NUM-05 : une transaction échouée ne consomme pas de séquence', async () => {
    await expect(transaction(admin.utilisateurId, async q => {
      await attribuer(q, admin, { type: 'POLICE', nature: 'PHYSIQUE', codeBureau: '03', codeProduit: '01', annee: 2026 });
      throw new Error('échec de l\'émission');
    })).rejects.toThrow();
    expect((await emettre('03', '01', 2026)).slice(5, 11)).toBe('000001');
  });

  it('CA-NUM-04 : cent émissions simultanées donnent cent numéros distincts et consécutifs', async () => {
    const numeros = await Promise.all(Array.from({ length: 100 }, () => emettre('04', '01', 2026)));
    const seq = numeros.map(n => Number(n.slice(5, 11))).sort((a, b) => a - b);
    expect(new Set(numeros).size).toBe(100);
    expect(seq).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
  });

  it('CA-NUM-08 : compteur épuisé, émission bloquée', async () => {
    await getPool().query(`INSERT INTO compteur_numerotation (type_objet, cle_compteur, derniere_valeur, valeur_max) VALUES ('POLICE','05-01-2026',999999,999999)`);
    await expect(emettre('05', '01', 2026)).rejects.toMatchObject({ code: 'COMPTEUR_EPUISE' });
  });

  it('alerte à 95 % de la capacité', async () => {
    const a = await transaction(null, q => prochaineValeur(q, 'ESSAI', 'X', 20));
    expect(a.alerte).toBe(false);
    await getPool().query(`UPDATE compteur_numerotation SET derniere_valeur = 18 WHERE type_objet = 'ESSAI'`);
    expect((await transaction(null, q => prochaineValeur(q, 'ESSAI', 'X', 20))).alerte).toBe(true);
  });

  it('formats du § 6.3', async () => {
    const f = (n: Parameters<typeof attribuer>[2]) => transaction(admin.utilisateurId, q => attribuer(q, admin, n));
    expect(await f({ type: 'QUITTANCE', codeBureau: '01', annee: 2026 })).toBe('202601000001');
    expect(await f({ type: 'PEC', annee: 2026 })).toBe('PEC202600000001');
    expect(await f({ type: 'SINISTRE', annee: 2026 })).toBe('SIN2026000001');
    expect(await f({ type: 'FACTURE_COMMISSION', annee: 2026, mois: 11 })).toBe('FC202611000001');
    expect(await f({ type: 'AVENANT', numeroPolice: '101010001252604' })).toBe('101010001252604A01');
  });
});

describe('Paramètres et règles légales (ARC-RG-003)', () => {
  it('refuse d\'assouplir une règle d\'ordre public, accepte une valeur plus protectrice', async () => {
    await expect(transaction(admin.utilisateurId, q => appliquerChangement(q, admin, 'PROD_MISE_EN_DEMEURE_JOURS', '5', '2026-12-01', null)))
      .rejects.toMatchObject({ code: 'REGLE_VERROUILLEE' });
    await expect(transaction(admin.utilisateurId, q => appliquerChangement(q, admin, 'AGE_MIN_GARANTIE_DECES', '10', '2026-12-01', null)))
      .rejects.toMatchObject({ code: 'REGLE_VERROUILLEE' });
    await transaction(admin.utilisateurId, q => appliquerChangement(q, admin, 'PROD_MISE_EN_DEMEURE_JOURS', '15', '2027-01-01', null));
    expect(await valeurParametre(getPool(), 'PROD_MISE_EN_DEMEURE_JOURS', '2026-12-31')).toBe('10');
    expect(await valeurParametre(getPool(), 'PROD_MISE_EN_DEMEURE_JOURS', '2027-01-01')).toBe('15');
  });

  it('contrôle le type de valeur', async () => {
    await expect(transaction(admin.utilisateurId, q => appliquerChangement(q, admin, 'TIERS_MAX_CONJOINTS', 'quatre', '2026-12-01', null)))
      .rejects.toMatchObject({ code: 'VALEUR_INVALIDE' });
  });
});

describe('Journal d\'audit chaîné', () => {
  it('détecte une ligne altérée', async () => {
    await transaction(admin.utilisateurId, q => journaliser(q, { ...admin.trace(), action: 'CONSULTATION', objetType: 'tiers', apres: { mot_de_passe: 'secret', nom: 'X' } }));
    const derniere = (await getPool().query('SELECT rang, valeur_apres FROM journal_audit ORDER BY rang DESC LIMIT 1')).rows[0];
    expect(derniere.valeur_apres.mot_de_passe).toBe('***'); // aucune valeur secrète en clair
    expect((await verifierChaine(getPool())).premiereAlteration).toBeNull();
    // Altération par un administrateur de la base, déclencheur désactivé
    await getPool().query('ALTER TABLE journal_audit DISABLE TRIGGER journal_audit_journal');
    await getPool().query(`UPDATE journal_audit SET action = 'EXPORT' WHERE rang = $1`, [derniere.rang]);
    await getPool().query('ALTER TABLE journal_audit ENABLE TRIGGER journal_audit_journal');
    expect((await verifierChaine(getPool())).premiereAlteration).toBe(Number(derniere.rang));
    await getPool().query('ALTER TABLE journal_audit DISABLE TRIGGER journal_audit_journal');
    await getPool().query(`UPDATE journal_audit SET action = 'CONSULTATION' WHERE rang = $1`, [derniere.rang]);
    await getPool().query('ALTER TABLE journal_audit ENABLE TRIGGER journal_audit_journal');
  });
});

describe('Chiffrement par enveloppe (partie G)', () => {
  const moteur = new MoteurChiffrement(new GardienLocal(randomBytes(32)));
  it('chiffre, déchiffre et refuse un texte chiffré déplacé vers une autre ligne', async () => {
    const ctx = { table: 'coordonnee_paiement', colonne: 'numero', id: '00000000-0000-0000-0000-000000000001' };
    const c = await transaction(null, q => moteur.chiffrer(q, 'finances', 'GN82 0001 0001 1234567890', ctx));
    expect(c.toString('utf8')).not.toContain('1234567890');
    expect(await moteur.dechiffrer(getPool(), 'finances', c, ctx)).toBe('GN82 0001 0001 1234567890');
    await expect(moteur.dechiffrer(getPool(), 'finances', c, { ...ctx, id: '00000000-0000-0000-0000-000000000002' }))
      .rejects.toMatchObject({ code: 'DECHIFFREMENT_IMPOSSIBLE' });
    const cle = (await getPool().query(`SELECT cle_chiffree FROM cle_donnees WHERE domaine = 'finances'`)).rows[0].cle_chiffree;
    expect(cle).toMatch(/^local:v1:/); // seule la clé enveloppée est en base
  });

  it('produit une empreinte de recherche stable et insensible aux espaces', async () => {
    const a = await transaction(null, q => moteur.empreinteRecherche(q, 'gn82 0001'));
    const b = await transaction(null, q => moteur.empreinteRecherche(q, 'GN820001'));
    expect(a).toBe(b);
  });
});

describe('Référentiel des tiers', () => {
  it('CA-REF-01 : bloque la création d\'un tiers déjà existant (même pièce)', async () => {
    await transaction(admin.utilisateurId, q => creerTiers(q, admin, { nature: 'PHYSIQUE', nom: 'SOUMAH', prenoms: 'Fatoumata', date_naissance: '1990-04-12', type_piece: 'CNI', numero_piece: 'GN123456' }));
    await expect(transaction(admin.utilisateurId, q => creerTiers(q, admin, { nature: 'PHYSIQUE', nom: 'SOUMAH', prenoms: 'Fatou', type_piece: 'CNI', numero_piece: 'gn 123456' })))
      .rejects.toMatchObject({ code: 'TIERS_EXISTANT' });
  });

  it('REF-RG-002 : un doublon probable exige la décision motivée d\'un gestionnaire', async () => {
    const proche = { nature: 'PHYSIQUE' as const, nom: 'SOUMA', prenoms: 'Fatoumata', date_naissance: '1990-04-12' };
    await expect(transaction(admin.utilisateurId, q => creerTiers(q, admin, proche))).rejects.toMatchObject({ code: 'DOUBLON_PROBABLE' });
    const id = await transaction(admin.utilisateurId, q => creerTiers(q, admin, proche, { motif: 'Homonyme vérifié sur pièce' }));
    expect(id).toBeTruthy();
  });

  it('REF-RG-001 : la nature n\'est plus modifiable', async () => {
    const id = await transaction(admin.utilisateurId, q => creerTiers(q, admin, { nature: 'MORALE', nom: 'SOCIÉTÉ MINIÈRE DE BOKÉ', rccm: 'RCCM/GN/2020/B/1234' }));
    await expect(transaction(admin.utilisateurId, q => modifierTiers(q, admin, id, 1, { nature: 'PHYSIQUE' }))).rejects.toMatchObject({ code: 'NATURE_FIGEE' });
    await transaction(admin.utilisateurId, q => modifierTiers(q, admin, id, 1, { nif: '123456789' }));
    await expect(transaction(admin.utilisateurId, q => modifierTiers(q, admin, id, 1, { nif: '987654321' }))).rejects.toMatchObject({ code: 'CONFLIT_VERSION' });
  });
});
