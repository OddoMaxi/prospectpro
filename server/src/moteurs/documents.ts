/**
 * Moteur de documents (CDC § 3.6, 3.9 ; DIG-RG-001, 003, 006, 007 ; REF-RG-010, 011 ; annexe F ; DD document).
 *
 * - Tout document est produit nativement numérique, en PDF/A-3b, à partir du modèle en vigueur à sa date ; les mentions
 *   légales de la Compagnie à cette date sont injectées (REF-RG-011, 012) et la fiche doit être complète (REF-RG-010).
 * - L'original est le fichier scellé : empreinte SHA-256 et horodatage. Une réimpression renvoie le même fichier,
 *   comptée comme copie (DIG-RG-001, 006). Toute lecture contrôle l'intégrité.
 * - Les pièces déposées (photo, PDF) sont contrôlées (format, taille) et rattachées à leur objet (DIG-RG-003).
 *
 * Gabarit d'un modèle (modifiable sans développement) :
 *   # Titre          ## Section          - puce          ---  (séparateur)
 *   | En-tête | … |  (tableau ; la première ligne est l'en-tête)
 *   {{variable}}  {{objet.champ}}  {{#liste}} … {{/liste}} (répétition, sur une ou plusieurs lignes)
 *   Toute autre ligne est un paragraphe ; une ligne vide sépare les paragraphes.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve, sep } from 'node:path';
import PDFDocument from 'pdfkit';
import type { Executant } from '../db/pool.js';
import type { Acteur } from '../noyau/acteur.js';
import { ErreurMetier, exiger, nonTrouve } from '../noyau/erreurs.js';
import { ajouterAnnees, aujourdhui, dateValide } from '../noyau/dates.js';
import { journaliser } from './audit.js';
import { entier } from './parametres.js';
import { exigerFicheComplete, mentionsLegales } from '../modules/referentiels/societe.js';
import { modeleEnVigueur } from '../modules/referentiels/modeles.js';

// ---------------------------------------------------------------- stockage (ajout seul)

export interface Stockage {
  ecrire(ref: string, contenu: Buffer): Promise<void>;
  lire(ref: string): Promise<Buffer>;
}

/** Répertoire local : un fichier n'est jamais réécrit (ouverture exclusive). */
export class StockageLocal implements Stockage {
  private readonly racine: string;
  constructor(racine: string) { this.racine = resolve(racine); }
  private chemin(ref: string) {
    const p = resolve(this.racine, ref);
    exiger(p.startsWith(this.racine + sep), 'REFERENCE_INVALIDE', 'Référence de fichier invalide', 500);
    return p;
  }
  async ecrire(ref: string, contenu: Buffer) {
    const p = this.chemin(ref);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, contenu, { flag: 'wx', mode: 0o440 });
  }
  async lire(ref: string) { return readFile(this.chemin(ref)); }
}

let stockage: Stockage | null = null;
export function configurerStockage(s: Stockage) { stockage = s; }
function lestockage(): Stockage {
  exiger(stockage, 'STOCKAGE_ABSENT', 'Stockage des documents non configuré', 500);
  return stockage;
}

const empreinte = (b: Buffer) => createHash('sha256').update(b).digest('hex');

// ---------------------------------------------------------------- gabarits

type Valeurs = Record<string, unknown>;

function valeur(v: Valeurs, chemin: string): unknown {
  return chemin.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Valeurs)[k] : undefined), v);
}

/** Développe répétitions et variables. Une variable absente est une erreur : jamais de document à trous. */
export function developper(gabarit: string, v: Valeurs): string {
  const avecListes = gabarit.replace(/\{\{#(\w[\w.]*)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, nom: string, corps: string) => {
    const liste = valeur(v, nom);
    if (!Array.isArray(liste)) throw new ErreurMetier('VARIABLE_MANQUANTE', `Liste ${nom} absente des données du document`, 500);
    return liste.map(el => developper(corps, { ...v, ...(typeof el === 'object' && el ? el as Valeurs : { valeur: el }) })).join('');
  });
  return avecListes.replace(/\{\{\s*(\w[\w.]*)\s*\}\}/g, (_, nom: string) => {
    const x = valeur(v, nom);
    if (x === undefined || x === null) throw new ErreurMetier('VARIABLE_MANQUANTE', `Variable ${nom} absente des données du document`, 500);
    return typeof x === 'number' ? x.toLocaleString('fr-FR').replace(/ /g, ' ') : String(x);
  });
}

const require = createRequire(import.meta.url);
const POLICE = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
const POLICE_GRAS = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf');

/** Mise en page PDF/A-3b (polices embarquées, profil de couleur, métadonnées XMP). */
export async function rendrePdf(texte: string, meta: { titre: string; auteur: string; piedDePage: string; reference: string; date: Date }): Promise<Buffer> {
  const doc = new PDFDocument({
    pdfVersion: '1.7', subset: 'PDF/A-3b', tagged: true, lang: 'fr-FR', displayTitle: true, size: 'A4',
    margins: { top: 56, bottom: 72, left: 56, right: 56 }, font: POLICE, bufferPages: true,
    info: { Title: meta.titre, Author: meta.auteur, Creator: 'Prospect Pro', CreationDate: meta.date },
  });
  doc.registerFont('normal', POLICE);
  doc.registerFont('gras', POLICE_GRAS);
  const morceaux: Buffer[] = [];
  doc.on('data', (b: Buffer) => morceaux.push(b));
  const fin = new Promise<Buffer>((ok, ko) => { doc.on('end', () => ok(Buffer.concat(morceaux))); doc.on('error', ko); });

  const largeur = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const lignes = texte.split(/\r?\n/);
  let tableau: string[][] = [];
  const viderTableau = () => {
    if (!tableau.length) return;
    const n = Math.max(...tableau.map(l => l.length));
    const col = largeur / n;
    tableau.forEach((cellules, i) => {
      const y = doc.y;
      const hauteur = Math.max(...cellules.map(c => doc.font(i === 0 ? 'gras' : 'normal').fontSize(9).heightOfString(c, { width: col - 6 }))) + 6;
      if (y + hauteur > doc.page.height - doc.page.margins.bottom) doc.addPage();
      const y0 = doc.y;
      if (i === 0) doc.rect(doc.page.margins.left, y0, largeur, hauteur).fill('#eeeeee').fillColor('black');
      cellules.forEach((c, j) => doc.font(i === 0 ? 'gras' : 'normal').fontSize(9).text(c, doc.page.margins.left + j * col + 3, y0 + 3, { width: col - 6 }));
      doc.moveTo(doc.page.margins.left, y0 + hauteur).lineTo(doc.page.margins.left + largeur, y0 + hauteur).lineWidth(0.5).stroke('#999999');
      doc.x = doc.page.margins.left;
      doc.y = y0 + hauteur;
    });
    doc.moveDown(0.5);
    tableau = [];
  };
  for (const brute of lignes) {
    const l = brute.trimEnd();
    if (l.startsWith('|')) {
      tableau.push(l.replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
      continue;
    }
    viderTableau();
    doc.x = doc.page.margins.left;
    if (!l.trim()) doc.moveDown(0.4);
    else if (l.startsWith('# ')) doc.font('gras').fontSize(16).text(l.slice(2), { align: 'center' }).moveDown(0.6);
    else if (l.startsWith('## ')) doc.moveDown(0.3).font('gras').fontSize(12).text(l.slice(3)).moveDown(0.2);
    else if (l.startsWith('- ')) doc.font('normal').fontSize(10).text(`•  ${l.slice(2)}`, { indent: 10 });
    else if (l.trim() === '---') doc.moveDown(0.3).moveTo(doc.x, doc.y).lineTo(doc.x + largeur, doc.y).lineWidth(0.5).stroke('#999999').moveDown(0.5);
    else doc.font('normal').fontSize(10).text(l, { align: 'justify' });
  }
  viderTableau();

  // Pied de page : mentions légales, référence du document, pagination
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(pages.start + i);
    // Écriture dans la marge basse : la marge est levée le temps du pied de page, sinon pdfkit ouvre une page
    const marge = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - marge + 16;
    doc.font('normal').fontSize(7).fillColor('#555555')
      .text(meta.piedDePage, doc.page.margins.left, y, { width: largeur, align: 'center' })
      .text(`Réf. ${meta.reference} – page ${i + 1}/${pages.count}`, doc.page.margins.left, y + 24, { width: largeur, align: 'center' });
    doc.fillColor('black');
    doc.page.margins.bottom = marge;
  }
  doc.end();
  return fin;
}

// ---------------------------------------------------------------- production et dépôt

export interface DocumentEnregistre { id: string; empreinte: string; fichierRef: string; modeleVersion?: number }

async function enregistrer(q: Executant, acteur: Acteur, d: {
  id: string; typeDocument: string; modeleId?: string; objet: { type: string; id: string }; contenu: Buffer; extension: string;
  origine: 'PRODUIT' | 'DEPOSE'; date: string; dateExpiration?: string;
}): Promise<DocumentEnregistre> {
  const h = empreinte(d.contenu);
  const ref = `${d.date.slice(0, 4)}/${d.date.slice(5, 7)}/${d.id}.${d.extension}`;
  // Le fichier est écrit avant la validation de la transaction : en cas d'annulation, il reste orphelin
  // (sans ligne en base) et sera purgé ; l'inverse (ligne sans fichier) est impossible.
  await lestockage().ecrire(ref, d.contenu);
  const conservation = ajouterAnnees(d.date, await entier(q, 'CONSERVATION_PIECES_ANS'));
  await q.query(
    `INSERT INTO document (id, type_document, modele_document_id, objet_type, objet_id, fichier_ref, empreinte, horodatage_scellement, origine,
                           lisibilite_controlee, date_expiration, imprime, conservation_jusqu_au)
     VALUES ($1,$2,$3,$4,$5,$6,$7,now(),$8,$9,$10,0,$11)`,
    [d.id, d.typeDocument, d.modeleId ?? null, d.objet.type, d.objet.id, ref, h, d.origine, d.origine === 'DEPOSE' ? false : null, d.dateExpiration ?? null, conservation]);
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'document', objetId: d.id, apres: { type: d.typeDocument, objet: d.objet, origine: d.origine, empreinte: h } });
  return { id: d.id, empreinte: h, fichierRef: ref };
}

/**
 * Produit un document à partir du modèle en vigueur à `date` (par défaut aujourd'hui).
 * Les variables du modèle sont complétées par les mentions légales en vigueur à cette date et la date du document.
 */
export async function genererDocument(q: Executant, acteur: Acteur, d: {
  modeleCode: string; typeDocument: string; objet: { type: string; id: string }; variables: Valeurs; date?: string; titre?: string;
}): Promise<DocumentEnregistre> {
  const date = d.date ?? aujourdhui();
  exiger(dateValide(date), 'DATE_INVALIDE', 'Date du document invalide');
  await exigerFicheComplete(q, date);
  const modele = await modeleEnVigueur(q, d.modeleCode, date);
  if (!modele) throw new ErreurMetier('MODELE_ABSENT', `Aucun modèle ${d.modeleCode} en vigueur au ${date}`, 422);
  const mentions = await mentionsLegales(q, date);
  const id = randomUUID();
  const texte = developper(modele.contenu, { ...mentions, date_document: date.split('-').reverse().join('/'), reference_document: id, ...d.variables });
  const pdf = await rendrePdf(texte, {
    titre: d.titre ?? modele.libelle, auteur: mentions.societe_raison_sociale, piedDePage: mentions.mentions_legales, reference: id, date: new Date(),
  });
  const r = await enregistrer(q, acteur, { id, typeDocument: d.typeDocument, modeleId: modele.id, objet: d.objet, contenu: pdf, extension: 'pdf', origine: 'PRODUIT', date });
  return { ...r, modeleVersion: modele.version };
}

const FORMATS: { ext: string; signature: number[] }[] = [
  { ext: 'pdf', signature: [0x25, 0x50, 0x44, 0x46] },
  { ext: 'jpg', signature: [0xff, 0xd8, 0xff] },
  { ext: 'png', signature: [0x89, 0x50, 0x4e, 0x47] },
];
export const TAILLE_MAX_PIECE = 10 * 1024 * 1024;

/** Pièce déposée (photo ou PDF) : format reconnu par son contenu, taille limitée ; lisibilité contrôlée ensuite. */
export async function deposerPiece(q: Executant, acteur: Acteur, d: {
  typeDocument: string; objet: { type: string; id: string }; contenu: Buffer; dateExpiration?: string;
}): Promise<DocumentEnregistre> {
  exiger(d.contenu.length > 0 && d.contenu.length <= TAILLE_MAX_PIECE, 'TAILLE_INVALIDE', 'Fichier vide ou de plus de 10 Mo');
  const f = FORMATS.find(x => x.signature.every((o, i) => d.contenu[i] === o));
  exiger(f, 'FORMAT_REFUSE', 'Formats acceptés : PDF, JPEG, PNG');
  if (d.dateExpiration) exiger(dateValide(d.dateExpiration), 'DATE_INVALIDE', 'Date d\'expiration invalide');
  return enregistrer(q, acteur, { id: randomUUID(), typeDocument: d.typeDocument, objet: d.objet, contenu: d.contenu, extension: f.ext, origine: 'DEPOSE', date: aujourdhui(), dateExpiration: d.dateExpiration });
}

/** Contrôle de lisibilité d'une pièce déposée (DIG-RG-003). Une pièce illisible est écartée et doit être redéposée. */
export async function controlerLisibilite(q: Executant, acteur: Acteur, id: string, lisible: boolean, motif?: string) {
  const r = await q.query(`UPDATE document SET lisibilite_controlee = true, supprime_le = CASE WHEN $2 THEN NULL ELSE now() END
                            WHERE id = $1 AND origine = 'DEPOSE' AND supprime_le IS NULL`, [id, lisible]);
  if (!r.rowCount) throw nonTrouve('Pièce déposée');
  await journaliser(q, { ...acteur.trace(), action: 'VALIDATION', objetType: 'document', objetId: id, apres: { lisible, motif: motif ?? null } });
}

interface LigneDocument { id: string; type_document: string; fichier_ref: string; empreinte: string; origine: string; imprime: number }

/** Lecture avec contrôle d'intégrité ; la consultation est tracée. */
export async function lireDocument(q: Executant, acteur: Acteur, id: string): Promise<{ document: LigneDocument; contenu: Buffer; type: string }> {
  const d = (await q.query<LigneDocument>('SELECT id, type_document, fichier_ref, empreinte, origine, imprime FROM document WHERE id = $1 AND supprime_le IS NULL', [id])).rows[0];
  if (!d) throw nonTrouve('Document');
  const contenu = await lestockage().lire(d.fichier_ref).catch(() => { throw new ErreurMetier('FICHIER_ABSENT', 'Fichier du document introuvable dans le stockage', 500); });
  if (empreinte(contenu) !== d.empreinte) throw new ErreurMetier('DOCUMENT_ALTERE', 'Le fichier ne correspond plus à son empreinte scellée', 500);
  await journaliser(q, { ...acteur.trace(), action: 'CONSULTATION', objetType: 'document', objetId: id });
  const ext = d.fichier_ref.split('.').pop();
  return { document: d, contenu, type: ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg' };
}

/** Réimpression : le même original, compté comme copie (DIG-RG-001, indicateurs DIG-RG-006). */
export async function imprimerDocument(q: Executant, acteur: Acteur, id: string) {
  const l = await lireDocument(q, acteur, id);
  await q.query('UPDATE document SET imprime = imprime + 1 WHERE id = $1', [id]);
  await journaliser(q, { ...acteur.trace(), action: 'EXPORT', objetType: 'document', objetId: id, apres: { impression: l.document.imprime + 1 } });
  return l;
}

export async function verifierDocument(q: Executant, id: string): Promise<{ integre: boolean; empreinte: string }> {
  const d = (await q.query<{ fichier_ref: string; empreinte: string }>('SELECT fichier_ref, empreinte FROM document WHERE id = $1', [id])).rows[0];
  if (!d) throw nonTrouve('Document');
  const contenu = await lestockage().lire(d.fichier_ref).catch(() => null);
  return { integre: !!contenu && empreinte(contenu) === d.empreinte, empreinte: d.empreinte };
}

export async function documentsDeLObjet(q: Executant, objet: { type: string; id: string }) {
  return (await q.query(
    `SELECT d.id, d.type_document, d.origine, d.empreinte, d.horodatage_scellement, d.imprime, d.date_expiration, d.lisibilite_controlee, m.code AS modele, m.version AS modele_version,
            EXISTS (SELECT 1 FROM dossier_preuve p WHERE p.document_id = d.id) AS accepte
       FROM document d LEFT JOIN modele_document m ON m.id = d.modele_document_id
      WHERE d.objet_type = $1 AND d.objet_id = $2 AND d.supprime_le IS NULL ORDER BY d.horodatage_scellement DESC`, [objet.type, objet.id])).rows;
}


/** Aperçu d'un modèle avec des données d'essai : rien n'est enregistré (mise au point des modèles par le comité). */
export async function apercuModele(q: Executant, modeleCode: string, variables: Valeurs, date = aujourdhui()): Promise<Buffer> {
  const modele = await modeleEnVigueur(q, modeleCode, date);
  if (!modele) throw new ErreurMetier('MODELE_ABSENT', `Aucun modèle ${modeleCode} en vigueur au ${date}`, 422);
  const mentions = await mentionsLegales(q, date);
  const texte = developper(modele.contenu, { ...mentions, date_document: date.split('-').reverse().join('/'), reference_document: 'APERÇU', ...variables });
  return rendrePdf(texte, { titre: `${modele.libelle} (aperçu)`, auteur: mentions.societe_raison_sociale, piedDePage: mentions.mentions_legales, reference: 'APERÇU – sans valeur', date: new Date() });
}
