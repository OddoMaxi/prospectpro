/**
 * Analyse le dictionnaire des données (DD 1.1, export texte du .docx) et produit
 * le modèle JSON qui sert de source unique au générateur de schéma.
 *
 *   textutil -convert txt -output dd.txt "Prospect_Pro_Dictionnaire_des_donnees.docx"
 *   npm run dd:parse -- dd.txt
 *
 * Toute anomalie de structure arrête l'analyse : le modèle n'est jamais produit à moitié.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { Champ, Dictionnaire, Table } from '../src/db/dictionnaire-types.js';

const src = process.argv[2];
if (!src) throw new Error('Usage : dd-parse <dd.txt>');
const lignes = readFileSync(src, 'utf8').split('\n').map(l => l.replace(/\r$/, ''));

const TITRE_TABLE = /^(\d+)\.(\d+) ([a-z_0-9]+) – (.+)$/;
const TITRE_CHAPITRE = /^\d+\. \S/;
const TYPE = /^(UUID|TEXT|INTEGER|MONTANT|TAUX|DATE|HORODATAGE|BOOLÉEN|JSON|CHIFFRÉ|EMPREINTE|TEXTE\(\d+\)|CODE\(\d+\)|DÉCIMAL\(\d+,\d+\)|ÉNUM [a-z_]+|RÉF → [a-z_]+)$/;

const erreurs: string[] = [];

// 3.1 Liste des tables : domaine et nature (Prévu)
const debutListe = lignes.indexOf('3.1 Liste des tables');
const finListe = lignes.findIndex((l, i) => i > debutListe && /^4\. /.test(l));
const listeTables = new Map<string, { domaine: string; prevu: boolean }>();
for (let i = debutListe + 5; i + 3 < finListe; i += 4) {
  const [nom, , domaine, nature] = lignes.slice(i, i + 4);
  if (!nom || !/^[a-z_0-9]+$/.test(nom)) { erreurs.push(`Liste des tables, ligne ${i + 1} : « ${nom} » inattendu`); break; }
  listeTables.set(nom, { domaine: domaine ?? '', prevu: (nature ?? '').trim() === 'Prévu' });
}

// Corps : une section par table
const tables: Table[] = [];
const debutCorps = lignes.findIndex((l, i) => i > finListe - 1 && TITRE_TABLE.test(l));
let i = debutCorps;
while (i < lignes.length) {
  const m = lignes[i]!.match(TITRE_TABLE);
  if (!m) { i++; continue; }
  if (/^1[3-5]\./.test(lignes[i]!)) break;
  const [, chap, num, nom, libelle] = m;
  const role = lignes[i + 1] ?? '';
  const regles = lignes[i + 2] ?? '';
  if (!regles.startsWith('Règles servies')) erreurs.push(`${nom} : ligne « Règles servies » absente`);
  const journal = /Table journal/.test(regles);
  const luePar = regles.match(/Lue par : ([A-Z, ]+)/)?.[1]?.split(',').map(s => s.trim()).filter(Boolean) ?? [];
  const reglesServies = regles.replace(/^Règles servies : /, '').replace(/ ?Table journal.*$/, '').replace(/ ?Lue par.*$/, '').trim();

  let j = i + 3;
  const entete = lignes.slice(j, j + 5).join('|');
  if (entete !== 'Champ|Type|Obl.|Description|Règle / contrôle') erreurs.push(`${nom} : en-tête de tableau inattendu (${entete})`);
  j += 5;
  const champs: Champ[] = [];
  const unicites: string[][] = [];
  const index: string[][] = [];
  while (j < lignes.length) {
    const l = lignes[j]!;
    if (TITRE_TABLE.test(l) || TITRE_CHAPITRE.test(l)) break;
    if (l.startsWith('Unicité :') || l.startsWith('Index :')) {
      const groupes = [...l.matchAll(/\(([^)]+)\)/g)].map(g => g[1]!.split(',').map(s => s.trim()));
      (l.startsWith('Unicité') ? unicites : index).push(...groupes);
      j++; continue;
    }
    if (champs.length > 0 && !/^[a-z_0-9]+$/.test(l)) { j++; continue; } // note libre après le tableau
    const [cNom, cType, cObl, cDesc, cRegle] = lignes.slice(j, j + 5);
    if (!cNom || !/^[a-z_0-9]+$/.test(cNom) || !cType || !TYPE.test(cType) || (cObl !== 'O' && cObl !== 'F')) {
      erreurs.push(`${nom}, ligne ${j + 1} : champ illisible [${[cNom, cType, cObl].join(' | ')}]`);
      break;
    }
    champs.push({ nom: cNom, type: cType, obligatoire: cObl === 'O', description: cDesc ?? '', regle: cRegle || undefined });
    j += 5;
  }
  const info = listeTables.get(nom!);
  if (!info) erreurs.push(`${nom} : absente de la liste des tables (§ 3.1)`);
  tables.push({
    nom: nom!, libelle: libelle!, section: `${chap}.${num}`, role, reglesServies,
    domaine: info?.domaine ?? '', prevu: info?.prevu ?? false, journal, luePar, champs, unicites, index,
  });
  i = j;
}

// Énumérations (chapitre 13)
const debutEnum = lignes.findIndex(l => l === '13. Énumérations');
const finEnum = lignes.findIndex(l => l === '14. Contrôles d’intégrité transverses');
const enumerations: Record<string, string[]> = {};
for (let k = debutEnum + 5; k + 2 < finEnum; k += 3) {
  const [nomE, valeurs] = lignes.slice(k, k + 2);
  if (!nomE || !/^[a-z_]+$/.test(nomE)) { erreurs.push(`Énumérations, ligne ${k + 1} : « ${nomE} » inattendu`); break; }
  enumerations[nomE] = (valeurs ?? '').split(',').map(v => v.trim()).filter(Boolean);
}

// Contrôles de cohérence du modèle lui-même
const nomsTables = new Set(tables.map(t => t.nom));
for (const t of tables) {
  const noms = new Set<string>();
  for (const c of t.champs) {
    if (noms.has(c.nom)) erreurs.push(`${t.nom}.${c.nom} : champ en double`);
    noms.add(c.nom);
    const ref = c.type.match(/^RÉF → (.+)$/)?.[1];
    if (ref && !nomsTables.has(ref)) erreurs.push(`${t.nom}.${c.nom} : référence vers une table inconnue « ${ref} »`);
    const en = c.type.match(/^ÉNUM (.+)$/)?.[1];
    if (en && !enumerations[en]) erreurs.push(`${t.nom}.${c.nom} : énumération inconnue « ${en} »`);
  }
  for (const u of [...t.unicites, ...t.index]) for (const col of u) {
    if (!noms.has(col) && !['id', 'cree_le', 'supprime_le'].includes(col)) erreurs.push(`${t.nom} : unicité ou index sur un champ inconnu « ${col} »`);
  }
}
for (const nomT of listeTables.keys()) if (!nomsTables.has(nomT)) erreurs.push(`${nomT} : listée au § 3.1 mais non décrite`);

const nbChamps = tables.reduce((s, t) => s + t.champs.length, 0);
console.log(`${tables.length} tables, ${nbChamps} champs, ${Object.keys(enumerations).length} énumérations`);
if (erreurs.length) {
  console.error(`${erreurs.length} anomalie(s) :\n- ${erreurs.join('\n- ')}`);
  process.exit(1);
}
const dd: Dictionnaire = { version: '1.1', date: '2026-11-24', tables, enumerations };
writeFileSync(new URL('../src/db/dictionnaire.json', import.meta.url), JSON.stringify(dd, null, 1) + '\n');
console.log('Modèle écrit : src/db/dictionnaire.json');
