/** Sous-lot 1.5 – Moteurs communs : événements, motifs de blocage, réclamations, documents, acceptation électronique, ordonnanceur. */
import { chmod, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { getPool, transaction } from '../src/db/pool.js';
import type { Acteur } from '../src/noyau/acteur.js';
import { ajouterJours, aujourdhui } from '../src/noyau/dates.js';
import { decider } from '../src/moteurs/validation.js';
import { abonner, distribuer, MAX_TENTATIVES, publier } from '../src/moteurs/evenements.js';
import { configurerStockage, deposerPiece, developper, genererDocument, imprimerDocument, lireDocument, StockageLocal, verifierDocument } from '../src/moteurs/documents.js';
import { creerTiers } from '../src/modules/referentiels/tiers.js';
import { proposerModificationSociete } from '../src/modules/referentiels/societe.js';
import { creerModeleDocument } from '../src/modules/referentiels/modeles.js';
import { deposerMotif, estBloque, leverMotif, vueMotifs } from '../src/modules/droits/blocages.js';
import {
  affecterReclamation, cloreReclamation, enregistrerReclamation, escaladerReclamations, indicateursReclamations, prendreEnCharge, repondreReclamation,
} from '../src/modules/reclamations/service.js';
import { confirmerAcceptation, demanderAcceptation } from '../src/modules/documents/acceptation.js';
import { Refus } from '../src/modules/auth/service.js';
import { demarrerOrdonnanceur, executerTraitement } from '../src/ordonnanceur.js';
import { STOCKAGE_TEST, URL_TEST } from './env.js';
import { fermer, installee, ouvrir, sms, utilisateur } from './outils.js';

let admin: Acteur, dg: Acteur;
const T = aujourdhui();
let n = 0;
const personne = (nom: string) => transaction(admin.utilisateurId, q => creerTiers(q, admin, { nature: 'PHYSIQUE', nom, prenoms: 'Test', date_naissance: `19${70 + (n % 20)}-01-0${1 + (n % 8)}`, telephone: `+2246444${String(++n).padStart(5, '0')}` }));
const telephoneDe = async (id: string) => (await getPool().query('SELECT telephone FROM tiers WHERE id = $1', [id])).rows[0].telephone as string;

beforeAll(async () => {
  await ouvrir();
  ({ admin, dg } = await installee());
  configurerStockage(new StockageLocal(STOCKAGE_TEST));
});
afterAll(fermer);

describe('Événements métier (outbox)', () => {
  it('publication liée à la transaction de l\'opération, une seule fois par clé d\'idempotence', async () => {
    const objet = { type: 'test', id: crypto.randomUUID() };
    await expect(transaction(admin.utilisateurId, async q => {
      await publier(q, admin, { type: 'CLOTURE_PERIODE', objet, charge: {}, cleIdempotence: `annulee:${objet.id}` });
      throw new Error('opération annulée');
    })).rejects.toThrow();
    expect((await getPool().query('SELECT count(*)::int n FROM evenement_metier WHERE objet_id = $1', [objet.id])).rows[0].n).toBe(0);
    const a = await transaction(admin.utilisateurId, q => publier(q, admin, { type: 'CLOTURE_PERIODE', objet, charge: {}, cleIdempotence: `cle:${objet.id}` }));
    const b = await transaction(admin.utilisateurId, q => publier(q, admin, { type: 'CLOTURE_PERIODE', objet, charge: {}, cleIdempotence: `cle:${objet.id}` }));
    expect(a).toBeTruthy();
    expect(b).toBeNull();
  });

  it('chaque abonné traite l\'événement une seule fois ; l\'échec d\'un abonné est isolé, réessayé puis abandonné', async () => {
    const recus: string[] = [];
    abonner('INTERVENANT_ACTIVE', 'test-comptes', async (_q, e) => { recus.push(e.id); });
    abonner('INTERVENANT_ACTIVE', 'test-en-echec', async q => {
      await q.query(`INSERT INTO jour_ferie (date, libelle) VALUES ('2099-12-31', 'ne doit pas rester')`);
      throw new Error('service indisponible');
    });
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push((await transaction(admin.utilisateurId, q => publier(q, admin, { type: 'INTERVENANT_ACTIVE', objet: { type: 'test', id: crypto.randomUUID() }, charge: { i }, cleIdempotence: `intervenant:${i}:${Date.now()}` })))!);
    }
    // Deux distributeurs en parallèle : aucun doublon
    await Promise.all([distribuer(), distribuer()]);
    expect(recus.sort()).toEqual([...ids].sort());
    const echecs = (await getPool().query(`SELECT statut, tentatives FROM distribution_evenement WHERE abonne = 'test-en-echec'`)).rows;
    expect(echecs).toHaveLength(5);
    expect(echecs.every(e => e.statut === 'EN_ERREUR' && e.tentatives === 1)).toBe(true);
    // L'effet partiel de l'abonné en échec est annulé
    expect((await getPool().query(`SELECT count(*)::int n FROM jour_ferie WHERE date = '2099-12-31'`)).rows[0].n).toBe(0);
    // Au dernier essai, la distribution est abandonnée (et signalée en supervision)
    await getPool().query(`UPDATE distribution_evenement SET tentatives = $1, prochain_essai = now() WHERE abonne = 'test-en-echec'`, [MAX_TENTATIVES - 1]);
    await distribuer();
    expect((await getPool().query(`SELECT DISTINCT statut FROM distribution_evenement WHERE abonne = 'test-en-echec'`)).rows).toEqual([{ statut: 'ABANDONNE' }]);
    expect(recus).toHaveLength(5);
  });
});

describe('Motifs de blocage (ARC-RG-011 à 013)', () => {
  it('dépôt par un module autorisé, vue par profil, levée justifiée ; motif définitif non levable', async () => {
    const t = await personne('BLOQUE');
    await expect(transaction(admin.utilisateurId, q => deposerMotif(q, admin, { code: 'CARTE_PERDUE_VOLEE', tiersId: t, justification: 'x', module: 'SIN' })))
      .rejects.toMatchObject({ statut: 403 });
    const id = await transaction(admin.utilisateurId, q => deposerMotif(q, admin, { code: 'CARTE_PERDUE_VOLEE', tiersId: t, justification: 'Déclaration de l\'assuré au bureau', module: 'ASSURE' }));
    expect(await estBloque(getPool(), { tiersId: t })).toBe(true);
    await expect(transaction(admin.utilisateurId, q => deposerMotif(q, admin, { code: 'CARTE_PERDUE_VOLEE', tiersId: t, justification: 'bis', module: 'PRD' })))
      .rejects.toMatchObject({ code: 'MOTIF_DEJA_ACTIF' });
    expect(await vueMotifs(getPool(), t, 'PRESTATAIRE')).toEqual({ bloque: true, motif: 'Carte opposée' });
    expect(await vueMotifs(getPool(), t, 'ENTREPRISE')).toEqual({ statut: 'BLOQUE' });
    expect((await vueMotifs(getPool(), t, 'ASSURE') as { motifs: { libelle: string }[] }).motifs[0]!.libelle).toMatch(/nouvelle carte/);
    const ev = await getPool().query(`SELECT count(*)::int n FROM evenement_metier WHERE type_evenement = 'MOTIF_BLOCAGE_AJOUTE' AND objet_id = $1`, [id]);
    expect(ev.rows[0].n).toBe(1);
    await expect(transaction(admin.utilisateurId, q => leverMotif(q, admin, id, ''))).rejects.toMatchObject({ code: 'JUSTIFICATION_REQUISE' });
    await transaction(admin.utilisateurId, q => leverMotif(q, admin, id, 'Nouvelle carte remise'));
    expect(await estBloque(getPool(), { tiersId: t })).toBe(false);
    const hist = await vueMotifs(getPool(), t, 'GESTIONNAIRE') as { historique: { date_fin: string | null }[] };
    expect(hist.historique[0]!.date_fin).not.toBeNull();

    const def = await transaction(admin.utilisateurId, q => deposerMotif(q, admin, { code: 'DECES_CONSTATE', tiersId: t, justification: 'Acte de décès reçu', module: 'SIN' }));
    await expect(transaction(admin.utilisateurId, q => leverMotif(q, admin, def, 'erreur'))).rejects.toMatchObject({ code: 'MOTIF_DEFINITIF' });
  });
});

describe('Réclamations (§ 8.10)', () => {
  let gest: Acteur;
  beforeAll(async () => { gest = await utilisateur(admin, 'gest.reclam', [{ code: 'GEST_PRODUCTION' }], dg); });

  it('enregistrement numéroté, échéance en jours ouvrables, accusé de réception, affectation, réponse, clôture', async () => {
    const t = await personne('RECLAMANT');
    const r = await transaction(admin.utilisateurId, q => enregistrerReclamation(q, admin, { tiersId: t, canal: 'SMS', objet: 'SANTE', description: 'Remboursement refusé à tort', dateReception: '2030-09-30' }));
    expect(r.numero).toMatch(/^REC2030\d{6}$/);
    expect(r.echeance).toBe('2030-10-21'); // 15 jours ouvrables après le lundi 30/09/2030
    expect(sms.dernier(await telephoneDe(t))!.texte).toContain(r.numero);
    await expect(transaction(admin.utilisateurId, q => affecterReclamation(q, admin, r.id, admin.utilisateurId!))).rejects.toMatchObject({ statut: 403 });
    await transaction(admin.utilisateurId, q => affecterReclamation(q, admin, r.id, gest.utilisateurId!));
    await expect(transaction(admin.utilisateurId, q => repondreReclamation(q, admin, r.id, 'x'))).rejects.toMatchObject({ code: 'NON_AFFECTEE' });
    await transaction(gest.utilisateurId, q => prendreEnCharge(q, gest, r.id));
    await transaction(gest.utilisateurId, q => repondreReclamation(q, gest, r.id, 'Après réexamen, la prestation est prise en charge.'));
    expect(sms.dernier(await telephoneDe(t))!.texte).toMatch(/réponse/);
    await transaction(gest.utilisateurId, q => cloreReclamation(q, gest, r.id));
    expect((await getPool().query('SELECT statut FROM reclamation WHERE id = $1', [r.id])).rows[0].statut).toBe('CLOSE');
  });

  it('escalade automatique à l\'échéance dépassée, et indicateurs', async () => {
    const t = await personne('EN-RETARD');
    const r = await transaction(admin.utilisateurId, q => enregistrerReclamation(q, admin, { tiersId: t, canal: 'COURRIER', objet: 'COMMISSION', description: 'Commission non versée', dateReception: ajouterJours(T, -40) }));
    const escaladees = await executerTraitement('reclamations-escalade') as string[];
    expect(escaladees).toContain(r.numero);
    expect((await getPool().query('SELECT statut FROM reclamation WHERE id = $1', [r.id])).rows[0].statut).toBe('ESCALADEE');
    const i = await indicateursReclamations(getPool(), '2000-01-01', T);
    expect(i.total).toBeGreaterThanOrEqual(2);
    expect(i.escaladees).toBeGreaterThanOrEqual(1);
    expect(i.par_objet).toMatchObject({ COMMISSION: 1 });
  });
});

describe('Documents (DIG-RG-001 à 007)', () => {
  let t: string, docId: string;
  const MODELE = [
    '# Quittance n° {{numero}}',
    'Souscripteur : {{souscripteur}} – Police {{police}}',
    '## Détail',
    '| Libellé | Montant (GNF) |',
    '{{#lignes}}| {{libelle}} | {{montant}} |',
    '{{/lignes}}',
    '---',
    'Fait à Conakry, le {{date_document}}. {{societe_raison_sociale}}, capital {{societe_capital_social}}.',
  ].join('\n');

  it('refuse de produire un document tant que la fiche de la Compagnie est incomplète (REF-RG-010)', async () => {
    t = await personne('SOUSCRIPTEUR');
    await transaction(admin.utilisateurId, q => creerModeleDocument(q, admin, { code: 'QUITTANCE_ESSAI', libelle: 'Quittance', contenu: MODELE, niveauSignature: 'CODE_USAGE_UNIQUE', dateEffet: '2020-01-01' }));
    await expect(transaction(admin.utilisateurId, q => genererDocument(q, admin, { modeleCode: 'QUITTANCE_ESSAI', typeDocument: 'QUITTANCE', objet: { type: 'tiers', id: t }, variables: {} })))
      .rejects.toMatchObject({ code: 'FICHE_SOCIETE_INCOMPLETE' });
    const d = await transaction(admin.utilisateurId, q => proposerModificationSociete(q, admin, { dateEffet: '2020-01-01', motif: 'Fiche initiale', valeurs: {
      raison_sociale: 'CGS Assurances', activite: 'Assurance', forme_juridique: 'SA', capital_social: 5_000_000_000, numero_agrement: 'AGR-1', pays: 'Guinée',
      region: 'Conakry', commune: 'Kaloum', quartier: 'Almamya', telephone: '+224620000000', courriel: 'contact@cgs.example', rccm: 'RCCM-1', nif: 'NIF-1' } }));
    await transaction(dg.utilisateurId, q => decider(q, dg, d.id, 'VALIDE'));
  });

  it('produit un PDF/A scellé à partir du modèle en vigueur, avec les mentions légales ; une variable manquante est refusée', async () => {
    const variables = { numero: 'Q2026000001', souscripteur: 'BAH Ibrahima', police: '1011000001234', lignes: [{ libelle: 'Prime nette', montant: 400_000 }, { libelle: 'Accessoires', montant: 10_000 }] };
    await expect(transaction(admin.utilisateurId, q => genererDocument(q, admin, { modeleCode: 'QUITTANCE_ESSAI', typeDocument: 'QUITTANCE', objet: { type: 'tiers', id: t }, variables: { numero: 'x' } })))
      .rejects.toMatchObject({ code: 'VARIABLE_MANQUANTE' });
    const r = await transaction(admin.utilisateurId, q => genererDocument(q, admin, { modeleCode: 'QUITTANCE_ESSAI', typeDocument: 'QUITTANCE', objet: { type: 'tiers', id: t }, variables }));
    docId = r.id;
    const pdf = await readFile(join(STOCKAGE_TEST, r.fichierRef));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const brut = pdf.toString('latin1');
    expect(brut).toContain('pdfaid:part'); // métadonnées PDF/A
    expect(brut).toContain('FontFile2'); // polices embarquées
    expect(brut).toContain('OutputIntent');
    expect(brut.match(/\/Type \/Page\b/g)).toHaveLength(1); // le pied de page ne déborde pas sur une page vide
    expect(r.modeleVersion).toBe(1);
    expect(developper(MODELE.split('\n').slice(4, 6).join('\n'), variables)).toBe('| Prime nette | 400 000 |\n| Accessoires | 10 000 |\n');
  });

  it('lecture avec contrôle d\'intégrité ; une réimpression est le même original, comptée comme copie', async () => {
    const l = await transaction(admin.utilisateurId, q => lireDocument(q, admin, docId));
    const copie = await transaction(admin.utilisateurId, q => imprimerDocument(q, admin, docId));
    expect(copie.contenu.equals(l.contenu)).toBe(true);
    expect((await getPool().query('SELECT imprime FROM document WHERE id = $1', [docId])).rows[0].imprime).toBe(1);
    // Altération du fichier sur le disque : détectée
    const ref = (await getPool().query('SELECT fichier_ref FROM document WHERE id = $1', [docId])).rows[0].fichier_ref;
    const autre = await transaction(admin.utilisateurId, q => genererDocument(q, admin, { modeleCode: 'QUITTANCE_ESSAI', typeDocument: 'QUITTANCE', objet: { type: 'tiers', id: t }, variables: { numero: 'Q2', souscripteur: 'X', police: 'Y', lignes: [] } }));
    const chemin = join(STOCKAGE_TEST, autre.fichierRef);
    await chmod(chemin, 0o640);
    await writeFile(chemin, Buffer.concat([await readFile(chemin), Buffer.from('%falsifie')]));
    expect((await verifierDocument(getPool(), autre.id)).integre).toBe(false);
    await expect(transaction(admin.utilisateurId, q => lireDocument(q, admin, autre.id))).rejects.toMatchObject({ code: 'DOCUMENT_ALTERE' });
    expect((await verifierDocument(getPool(), docId)).integre).toBe(true);
    expect(ref).toMatch(/\.pdf$/);
  });

  it('pièces déposées : formats reconnus par leur contenu', async () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)]);
    const p = await transaction(admin.utilisateurId, q => deposerPiece(q, admin, { typeDocument: 'PIECE_IDENTITE', objet: { type: 'tiers', id: t }, contenu: png, dateExpiration: '2031-01-01' }));
    expect(p.fichierRef).toMatch(/\.png$/);
    await expect(transaction(admin.utilisateurId, q => deposerPiece(q, admin, { typeDocument: 'PIECE_IDENTITE', objet: { type: 'tiers', id: t }, contenu: Buffer.from('MZ exécutable') })))
      .rejects.toMatchObject({ code: 'FORMAT_REFUSE' });
  });

  it('DIG-RG-002 : acceptation par code SMS lié à l\'empreinte du document, dossier de preuve', async () => {
    await expect(transaction(admin.utilisateurId, q => demanderAcceptation(q, admin, docId, t))).rejects.toMatchObject({ code: 'TELEPHONE_NON_VERIFIE' });
    await getPool().query('UPDATE tiers SET telephone_verifie = true WHERE id = $1', [t]);
    await transaction(admin.utilisateurId, q => demanderAcceptation(q, admin, docId, t));
    const code = sms.dernier(await telephoneDe(t))!.texte.match(/code (\d{6})/)![1]!;
    const faux = await transaction(admin.utilisateurId, q => confirmerAcceptation(q, admin, { documentId: docId, signataireId: t, code: code === '000000' ? '111111' : '000000', assiste: true }));
    expect(faux).toBeInstanceOf(Refus);
    const ok = await transaction(admin.utilisateurId, q => confirmerAcceptation(q, admin, { documentId: docId, signataireId: t, code, assiste: true }));
    expect(ok).not.toBeInstanceOf(Refus);
    const preuve = (await getPool().query('SELECT * FROM dossier_preuve WHERE document_id = $1', [docId])).rows[0];
    const doc = (await getPool().query('SELECT empreinte FROM document WHERE id = $1', [docId])).rows[0];
    expect(preuve).toMatchObject({ niveau: 'CODE_USAGE_UNIQUE', empreinte_document: doc.empreinte, assistant_id: admin.utilisateurId });
    expect(JSON.stringify(preuve)).not.toContain(code);
    await expect(transaction(admin.utilisateurId, q => demanderAcceptation(q, admin, docId, t))).rejects.toMatchObject({ code: 'DEJA_ACCEPTE' });
  });

  it('un code envoyé pour une version du document ne vaut pas pour une autre ; signature certifiée exigée selon le modèle', async () => {
    const s = await personne('SIGNATAIRE');
    await getPool().query('UPDATE tiers SET telephone_verifie = true WHERE id = $1', [s]);
    const d = await transaction(admin.utilisateurId, q => genererDocument(q, admin, { modeleCode: 'QUITTANCE_ESSAI', typeDocument: 'QUITTANCE', objet: { type: 'tiers', id: s }, variables: { numero: 'Q3', souscripteur: 'S', police: 'P', lignes: [] } }));
    await transaction(admin.utilisateurId, q => demanderAcceptation(q, admin, d.id, s));
    const code = sms.dernier(await telephoneDe(s))!.texte.match(/code (\d{6})/)![1]!;
    await getPool().query(`UPDATE document SET empreinte = repeat('0', 64) WHERE id = $1`, [d.id]);
    expect(await transaction(admin.utilisateurId, q => confirmerAcceptation(q, admin, { documentId: d.id, signataireId: s, code, assiste: false }))).toBeInstanceOf(Refus);

    await transaction(admin.utilisateurId, q => creerModeleDocument(q, admin, { code: 'BULLETIN', libelle: 'Bulletin d\'adhésion', contenu: '# Bulletin {{numero}}', niveauSignature: 'CERTIFIEE_ANDE', dateEffet: '2020-01-01' }));
    const b = await transaction(admin.utilisateurId, q => genererDocument(q, admin, { modeleCode: 'BULLETIN', typeDocument: 'BULLETIN', objet: { type: 'tiers', id: s }, variables: { numero: 'B1' } }));
    await expect(transaction(admin.utilisateurId, q => demanderAcceptation(q, admin, b.id, s))).rejects.toMatchObject({ code: 'SIGNATURE_CERTIFIEE_REQUISE' });
  });
});

describe('Ordonnanceur', () => {
  it('démarre, planifie les traitements quotidiens et s\'arrête proprement', async () => {
    const arreter = await demarrerOrdonnanceur(URL_TEST, () => undefined);
    const c = new pg.Client({ connectionString: URL_TEST });
    await c.connect();
    const planifies = (await c.query(`SELECT name FROM pgboss.schedule ORDER BY name`)).rows.map(r => r.name);
    await c.end();
    expect(planifies).toEqual(['ages-limites', 'echeances-polices', 'organisation-differee', 'propositions-expiration', 'rappels-renouvellement', 'reclamations-escalade', 'scellement-ecritures', 'societe-du-jour']);
    await arreter();
  }, 30_000);
});
