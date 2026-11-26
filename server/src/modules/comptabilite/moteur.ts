/**
 * Moteur d'écritures (CDC § 11.11 à 11.13 ; FIN-RG-020 à 026).
 *
 * - Chaque événement a un ou plusieurs schémas (un par journal) : comptes fixes ou règles de détermination
 *   (auxiliaire du client, compte de production du bureau, comptes de la branche, trésorerie…) et formules de montants.
 *   Aucun numéro de compte n'est codé dans les modules métier.
 * - L'écriture est générée dans la transaction de l'événement : schéma absent ou incomplet = événement refusé.
 * - Une écriture par opération, équilibrée (contrôle en base), numérotée sans trou par journal et par exercice,
 *   définitive dès sa génération ; toute correction passe par une contre-passation.
 * - Lettrage automatique des comptes de tiers soldés par l'événement (quittance et règlement).
 * - Scellement par lots chaînés, en différé (FIN-RG-023).
 */
import { createHash } from 'node:crypto';
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger, nonTrouve } from '../../noyau/erreurs.js';
import { aujourdhui } from '../../noyau/dates.js';
import { journaliser } from '../../moteurs/audit.js';
import { prochaineValeur } from '../../moteurs/numerotation.js';
import { enregistrerOperation, soumettre } from '../../moteurs/validation.js';
import { dateComptable } from './exercices.js';

/** Compte déterminé par le module métier pour une règle du schéma. */
export interface CompteResolu { compteId: string; auxiliaireId?: string | null; montant?: number; libelle?: string; echeance?: string; codeTaxeId?: string }

export interface Evenement {
  codeEvt: string;
  evenementId?: string | null;
  reference: string;
  pieceDocumentId: string;
  date?: string;
  /** Variables du libellé (ex. police, quittance, bureau). */
  libelle?: Record<string, string | number>;
  /** Montants nommés utilisés par les formules (PRIME_NETTE, ACCESSOIRES, COMMISSION…). */
  montants?: Record<string, number>;
  /** Règle → compte (ou liste de comptes avec leur montant propre, formule « * »). */
  comptes?: Record<string, CompteResolu | CompteResolu[]>;
  /** Journal de trésorerie effectif (banque, opérateur, caisse) quand le schéma vise un journal de trésorerie générique. */
  journalTresorerie?: string;
  origine?: 'EVENEMENT' | 'SAISIE' | 'EXTOURNE' | 'A_NOUVEAU';
}

export interface EcritureGeneree { id: string; numero: string; journal: string; lignes: number }

const pad = (n: number, l: number) => String(n).padStart(l, '0');

/** Évalue une formule : noms de montants séparés par + et - (ex. « PRIME_TOTALE - COMMISSION »). */
export function evaluer(formule: string, montants: Record<string, number>): number {
  const jetons = formule.replace(/\s+/g, '').match(/[+-]?[A-Z0-9_]+/g);
  exiger(jetons && jetons.join('') === formule.replace(/\s+/g, ''), 'FORMULE_INVALIDE', `Formule de montant invalide : ${formule}`, 500);
  return jetons.reduce((s, j) => {
    const signe = j.startsWith('-') ? -1 : 1;
    const nom = j.replace(/^[+-]/, '');
    const v = /^\d+$/.test(nom) ? Number(nom) : montants[nom];
    if (v === undefined) throw new ErreurMetier('MONTANT_ABSENT', `Montant ${nom} non fourni pour la formule « ${formule} »`, 500);
    exiger(Number.isInteger(v), 'MONTANT_NON_ENTIER', `Montant ${nom} non arrondi au franc (FIN-RG-077)`, 500);
    return s + signe * v;
  }, 0);
}

const rendre = (modele: string, v: Record<string, string | number>) =>
  modele.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => {
    if (!(k in v)) throw new ErreurMetier('VARIABLE_MANQUANTE', `Variable ${k} absente du libellé d'écriture`, 500);
    return String(v[k]);
  }).slice(0, 200);

export async function numeroPiece(q: Executant, journal: string, exercice: string): Promise<string> {
  const { valeur } = await prochaineValeur(q, 'PIECE', `${journal}-${exercice}`, 99_999_999);
  return `${journal}${exercice}${pad(valeur, 8)}`;
}

interface Schema { id: string; journal_id: string; journal: string; type_journal: string; libelle_modele: string }
interface LigneSchema { rang: number; compte_id: string | null; compte_regle: string | null; sens: 'D' | 'C'; formule_montant: string }
interface LigneCalculee { compteId: string; auxiliaireId: string | null; libelle: string; debit: number; credit: number; echeance: string | null; codeTaxeId: string | null }

/** Schémas en vigueur pour un événement (un par journal), à la date de l'opération. */
async function schemasEnVigueur(q: Executant, codeEvt: string, date: string): Promise<Schema[]> {
  return (await q.query<Schema>(
    `SELECT DISTINCT ON (s.journal_id) s.id, s.journal_id, j.code AS journal, j.type AS type_journal, s.libelle_modele
       FROM schema_comptable s JOIN journal j ON j.id = s.journal_id
      WHERE s.code_evt = $1 AND s.actif AND s.supprime_le IS NULL AND s.date_effet <= $2
      ORDER BY s.journal_id, s.date_effet DESC`, [codeEvt, date])).rows
    .sort((a, b) => a.journal.localeCompare(b.journal) || 0);
}

/** Génère les écritures d'un événement dans la transaction courante. */
export async function comptabiliser(q: Executant, acteur: Acteur, ev: Evenement): Promise<EcritureGeneree[]> {
  const jour = ev.date ?? aujourdhui();
  const schemas = await schemasEnVigueur(q, ev.codeEvt, jour);
  if (!schemas.length) {
    throw new ErreurMetier('SCHEMA_ABSENT', `Aucun schéma comptable actif pour ${ev.codeEvt} : opération bloquée, le chef comptable doit le paramétrer (FIN-RG-021)`, 422);
  }
  const dc = await dateComptable(q, jour);
  const montants = ev.montants ?? {};
  const generees: EcritureGeneree[] = [];
  const toutes: LigneCalculee[] = [];
  const idsLignes: { id: string; l: LigneCalculee }[] = [];

  for (const s of schemas) {
    const lignesSchema = (await q.query<LigneSchema>('SELECT rang, compte_id, compte_regle, sens, formule_montant FROM ligne_schema WHERE schema_id = $1 AND supprime_le IS NULL ORDER BY rang', [s.id])).rows;
    exiger(lignesSchema.length >= 2, 'SCHEMA_INCOMPLET', `Schéma ${ev.codeEvt} / ${s.journal} incomplet (FIN-RG-021)`, 422);
    const libelle = rendre(s.libelle_modele, { evt: ev.codeEvt, reference: ev.reference, ...(ev.libelle ?? {}) });
    const lignes: LigneCalculee[] = [];
    for (const ls of lignesSchema) {
      // Montant nul par formule : la ligne n'a pas lieu, son compte n'a pas à être déterminé (ex. pas de remboursement)
      if (ls.formule_montant.trim() !== '*' && evaluer(ls.formule_montant, montants) === 0) continue;
      const cibles: CompteResolu[] = ls.compte_id
        ? [{ compteId: ls.compte_id }]
        : (() => {
          const c = ev.comptes?.[ls.compte_regle!];
          if (c === undefined) throw new ErreurMetier('REGLE_NON_RESOLUE', `Compte « ${ls.compte_regle} » non déterminé pour ${ev.codeEvt} / ${s.journal}`, 422);
          return Array.isArray(c) ? c : [c];
        })();
      for (const c of cibles) {
        const montant = ls.formule_montant.trim() === '*' ? (c.montant ?? 0) : evaluer(ls.formule_montant, montants);
        exiger(Number.isInteger(montant), 'MONTANT_NON_ENTIER', 'Montant non arrondi au franc (FIN-RG-077)', 500);
        if (montant === 0) continue;
        // Un montant négatif inverse le sens (ex. reprise) ; il reste porté en valeur absolue
        const sens = montant > 0 ? ls.sens : ls.sens === 'D' ? 'C' : 'D';
        lignes.push({
          compteId: c.compteId, auxiliaireId: c.auxiliaireId ?? null, libelle: (c.libelle ?? libelle).slice(0, 200),
          debit: sens === 'D' ? Math.abs(montant) : 0, credit: sens === 'C' ? Math.abs(montant) : 0, echeance: c.echeance ?? null, codeTaxeId: c.codeTaxeId ?? null,
        });
      }
    }
    if (!lignes.length) continue; // ex. aucune commission due : pas d'écriture au journal COM
    const debit = lignes.reduce((x, l) => x + l.debit, 0), credit = lignes.reduce((x, l) => x + l.credit, 0);
    exiger(debit === credit, 'PIECE_DESEQUILIBREE', `Schéma ${ev.codeEvt} / ${s.journal} : débit ${debit} ≠ crédit ${credit}`, 422);

    let journalId = s.journal_id, journalCode = s.journal;
    if (ev.journalTresorerie && s.type_journal.startsWith('TRESORERIE')) {
      const j = (await q.query<{ id: string; code: string; type: string; ferme: boolean }>('SELECT id, code, type, ferme FROM journal WHERE code = $1', [ev.journalTresorerie])).rows[0];
      exiger(j && j.type.startsWith('TRESORERIE') && !j.ferme, 'JOURNAL_INVALIDE', `Journal de trésorerie ${ev.journalTresorerie} invalide ou fermé`);
      journalId = j.id; journalCode = j.code;
    }
    const numero = await numeroPiece(q, journalCode, dc.exercice);
    const e = await q.query<{ id: string }>(
      `INSERT INTO ecriture (numero_piece, journal_id, date_comptable, date_origine, libelle, reference, origine, evenement_id, statut, piece_justificative_id, valide_le)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'VALIDEE',$9, now()) RETURNING id`,
      [numero, journalId, dc.date, dc.origine, libelle, ev.reference.slice(0, 60), ev.origine ?? 'EVENEMENT', ev.evenementId ?? null, ev.pieceDocumentId]);
    const ecritureId = e.rows[0]!.id;
    for (const l of lignes) {
      const r = await q.query<{ id: string }>(
        `INSERT INTO ligne_ecriture (ecriture_id, compte_id, compte_auxiliaire_id, libelle, debit, credit, echeance, code_taxe_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [ecritureId, l.compteId, l.auxiliaireId, l.libelle, l.debit, l.credit, l.echeance, l.codeTaxeId]);
      idsLignes.push({ id: r.rows[0]!.id, l });
    }
    toutes.push(...lignes);
    generees.push({ id: ecritureId, numero, journal: journalCode, lignes: lignes.length });
  }
  exiger(generees.length, 'AUCUNE_ECRITURE', `${ev.codeEvt} : aucun montant à comptabiliser`, 422);

  // FIN-RG-026 : lettrage automatique de chaque compte de tiers soldé par l'événement (ex. quittance et son règlement)
  const parAuxiliaire = new Map<string, { ids: string[]; solde: number }>();
  for (const { id, l } of idsLignes) {
    if (!l.auxiliaireId) continue;
    const x = parAuxiliaire.get(l.auxiliaireId) ?? { ids: [], solde: 0 };
    x.ids.push(id); x.solde += l.debit - l.credit;
    parAuxiliaire.set(l.auxiliaireId, x);
  }
  for (const [aux, x] of parAuxiliaire) {
    if (x.solde !== 0 || x.ids.length < 2) continue;
    const lettrable = (await q.query<{ lettrable: boolean }>('SELECT c.lettrable FROM compte_auxiliaire a JOIN compte c ON c.id = a.collectif_id WHERE a.id = $1', [aux])).rows[0]?.lettrable;
    if (lettrable) await lettrer(q, aux, x.ids, 'AUTOMATIQUE', null);
  }
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'ecriture', objetId: generees[0]!.id, apres: { evt: ev.codeEvt, reference: ev.reference, pieces: generees.map(g => g.numero) } });
  return generees;
}

export async function lettrer(q: Executant, auxiliaireId: string, lignes: string[], type: 'AUTOMATIQUE' | 'MANUEL', auteurId: string | null) {
  const { valeur } = await prochaineValeur(q, 'LETTRAGE', 'GLOBAL', 2_147_483_647);
  const code = `L${valeur.toString(36).toUpperCase().padStart(9, '0')}`;
  const r = await q.query<{ id: string }>('INSERT INTO lettrage (code, compte_auxiliaire_id, type, partiel, auteur_id) VALUES ($1,$2,$3,false,$4) RETURNING id', [code, auxiliaireId, type, auteurId]);
  await q.query('UPDATE ligne_ecriture SET lettrage_id = $2 WHERE id = ANY($1)', [lignes, r.rows[0]!.id]);
  return code;
}

/** Lettrage manuel de lignes d'un même compte de tiers, soldées entre elles (FIN-RG-016, 026). */
export async function lettrerManuellement(q: Executant, acteur: Acteur, ligneIds: string[]) {
  const r = await q.query<{ id: string; compte_auxiliaire_id: string | null; debit: number; credit: number; lettrage_id: string | null; statut: string }>(
    `SELECT l.id, l.compte_auxiliaire_id, l.debit, l.credit, l.lettrage_id, e.statut FROM ligne_ecriture l JOIN ecriture e ON e.id = l.ecriture_id WHERE l.id = ANY($1) FOR UPDATE OF l`, [ligneIds]);
  exiger(r.rows.length === ligneIds.length && ligneIds.length >= 2, 'LIGNES_INVALIDES', 'Choisir au moins deux lignes existantes');
  const aux = new Set(r.rows.map(x => x.compte_auxiliaire_id));
  exiger(aux.size === 1 && !aux.has(null), 'COMPTES_DIFFERENTS', 'Les lignes lettrées appartiennent à un même compte de tiers');
  exiger(r.rows.every(x => !x.lettrage_id && x.statut === 'VALIDEE'), 'DEJA_LETTRE', 'Une ligne est déjà lettrée ou non validée');
  exiger(r.rows.reduce((s, x) => s + Number(x.debit) - Number(x.credit), 0) === 0, 'LETTRAGE_DESEQUILIBRE', 'Les lignes choisies ne se soldent pas');
  const code = await lettrer(q, [...aux][0]!, ligneIds, 'MANUEL', acteur.utilisateurId);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'lettrage', apres: { code, lignes: ligneIds } });
  return code;
}

/** Délettrage tracé (FIN-RG-016). */
export async function delettrer(q: Executant, acteur: Acteur, code: string) {
  const l = (await q.query<{ id: string }>('UPDATE lettrage SET delettre_le = now() WHERE code = $1 AND delettre_le IS NULL RETURNING id', [code])).rows[0];
  if (!l) throw nonTrouve('Lettrage');
  await q.query('UPDATE ligne_ecriture SET lettrage_id = NULL WHERE lettrage_id = $1', [l.id]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'lettrage', apres: { code, delettre: true } });
}

/** Contre-passation d'une pièce validée (FIN-RG-024, 112) : pièce inverse liée à l'origine, à la date choisie. */
export async function extourner(q: Executant, acteur: Acteur, ecritureId: string, motif: string, date = aujourdhui()): Promise<EcritureGeneree> {
  exiger(motif?.trim(), 'MOTIF_REQUIS', 'Motif de la contre-passation obligatoire');
  const e = (await q.query<{ journal_id: string; code: string; numero_piece: string; libelle: string; statut: string; piece_justificative_id: string; evenement_id: string | null }>(
    `SELECT e.journal_id, j.code, e.numero_piece, e.libelle, e.statut, e.piece_justificative_id, e.evenement_id FROM ecriture e JOIN journal j ON j.id = e.journal_id WHERE e.id = $1 FOR UPDATE OF e`, [ecritureId])).rows[0];
  if (!e) throw nonTrouve('Écriture');
  exiger(e.statut === 'VALIDEE', 'NON_VALIDEE', 'Seule une écriture validée se contre-passe');
  const deja = await q.query('SELECT numero_piece FROM ecriture WHERE extourne_de_id = $1', [ecritureId]);
  exiger(!deja.rowCount, 'DEJA_EXTOURNEE', `Écriture déjà contre-passée par ${deja.rows[0]?.numero_piece}`, 409);
  const dc = await dateComptable(q, date);
  const numero = await numeroPiece(q, e.code, dc.exercice);
  const n = await q.query<{ id: string }>(
    `INSERT INTO ecriture (numero_piece, journal_id, date_comptable, date_origine, libelle, reference, origine, evenement_id, statut, extourne_de_id, piece_justificative_id, valide_par, valide_le)
     VALUES ($1,$2,$3,$4,$5,$6,'EXTOURNE',$7,'VALIDEE',$8,$9,$10, now()) RETURNING id`,
    [numero, e.journal_id, dc.date, dc.origine, `Extourne ${e.numero_piece} – ${motif}`.slice(0, 200), `EXT ${e.numero_piece}`.slice(0, 60), e.evenement_id, ecritureId, e.piece_justificative_id, acteur.utilisateurId]);
  const r = await q.query(
    `INSERT INTO ligne_ecriture (ecriture_id, compte_id, compte_auxiliaire_id, libelle, debit, credit, echeance, code_taxe_id)
     SELECT $2, compte_id, compte_auxiliaire_id, left('Extourne – ' || libelle, 200), credit, debit, echeance, code_taxe_id FROM ligne_ecriture WHERE ecriture_id = $1`, [ecritureId, n.rows[0]!.id]);
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'ecriture', objetId: n.rows[0]!.id, apres: { extourne_de: e.numero_piece, motif } });
  return { id: n.rows[0]!.id, numero, journal: e.code, lignes: r.rowCount ?? 0 };
}

// ---------------------------------------------------------------- scellement (FIN-RG-023)

const VERROU_SCELLEMENT = 7_310_002;

/** Contenu canonique des pièces d'un lot (par appartenance, et non par plage de rangs : un brouillard validé tard garde son rang). */
async function contenuPieces(q: Executant, ids: string[]): Promise<string> {
  const r = await q.query<{ c: string }>(
    `SELECT string_agg(concat_ws('|', e.rang, e.numero_piece, e.journal_id, e.date_comptable, e.date_origine, e.libelle, e.reference, e.origine, e.evenement_id, e.extourne_de_id, e.piece_justificative_id) || '|' ||
              (SELECT string_agg(concat_ws(',', l.id, l.compte_id, l.compte_auxiliaire_id, l.libelle, l.debit, l.credit, l.echeance, l.code_taxe_id), ';' ORDER BY l.id)
                 FROM ligne_ecriture l WHERE l.ecriture_id = e.id), E'\\n' ORDER BY e.rang) AS c
       FROM ecriture e WHERE e.id = ANY($1)`, [ids]);
  return r.rows[0]?.c ?? '';
}

/** Scelle les pièces validées non scellées, en un lot dont l'empreinte est chaînée au lot précédent. */
export async function scellerEcritures(q: Executant, limite = 5000): Promise<{ lot: string; pieces: number } | null> {
  await q.query('SELECT pg_advisory_xact_lock($1)', [VERROU_SCELLEMENT]);
  const p = await q.query<{ id: string; rang: number }>(
    `SELECT id, rang FROM ecriture WHERE scellement_lot_id IS NULL AND statut = 'VALIDEE' ORDER BY rang LIMIT $1`, [limite]);
  if (!p.rowCount) return null;
  const premier = p.rows[0]!, dernier = p.rows[p.rows.length - 1]!;
  const precedent = (await q.query<{ empreinte: string }>('SELECT empreinte FROM scellement_lot ORDER BY horodatage DESC, cree_le DESC LIMIT 1')).rows[0]?.empreinte ?? 'ORIGINE';
  const empreinte = createHash('sha256').update(precedent).update('\n').update(await contenuPieces(q, p.rows.map(x => x.id))).digest('hex');
  const lot = await q.query<{ id: string }>(
    `INSERT INTO scellement_lot (horodatage, premiere_ecriture_id, derniere_ecriture_id, empreinte, empreinte_precedente) VALUES (clock_timestamp(),$1,$2,$3,$4) RETURNING id`,
    [premier.id, dernier.id, empreinte, precedent]);
  await q.query('UPDATE ecriture SET scellement_lot_id = $1 WHERE id = ANY($2)', [lot.rows[0]!.id, p.rows.map(x => x.id)]);
  return { lot: lot.rows[0]!.id, pieces: p.rowCount };
}

/** Recalcule la chaîne des lots : première rupture (lot altéré, ou pièce modifiée hors du moteur). */
export async function verifierScellement(q: Executant): Promise<{ lots: number; premiereAlteration: string | null }> {
  const lots = (await q.query<{ id: string; empreinte: string; empreinte_precedente: string; ids: string[] }>(
    `SELECT s.id, s.empreinte, s.empreinte_precedente, COALESCE((SELECT array_agg(e.id) FROM ecriture e WHERE e.scellement_lot_id = s.id), '{}') AS ids
       FROM scellement_lot s ORDER BY s.horodatage, s.cree_le`)).rows;
  let precedent = 'ORIGINE';
  for (const l of lots) {
    const calc = createHash('sha256').update(precedent).update('\n').update(await contenuPieces(q, l.ids)).digest('hex');
    if (l.empreinte_precedente !== precedent || calc !== l.empreinte) return { lots: lots.length, premiereAlteration: l.id };
    precedent = l.empreinte;
  }
  return { lots: lots.length, premiereAlteration: null };
}

// ---------------------------------------------------------------- contre-passation après validation (FIN-RG-024, 112)

export const OPERATION_EXTOURNE = 'EXTOURNE_ECRITURE';

export async function proposerExtourne(q: Executant, acteur: Acteur, ecritureId: string, motif: string, date?: string) {
  exiger(motif?.trim(), 'MOTIF_REQUIS', 'Motif de la contre-passation obligatoire');
  const e = (await q.query<{ numero_piece: string; statut: string }>('SELECT numero_piece, statut FROM ecriture WHERE id = $1', [ecritureId])).rows[0];
  if (!e) throw nonTrouve('Écriture');
  exiger(e.statut === 'VALIDEE', 'NON_VALIDEE', 'Seule une écriture validée se contre-passe');
  const deja = await q.query('SELECT 1 FROM ecriture WHERE extourne_de_id = $1', [ecritureId]);
  exiger(!deja.rowCount, 'DEJA_EXTOURNEE', 'Écriture déjà contre-passée', 409);
  return soumettre(q, acteur, { typeOperation: OPERATION_EXTOURNE, objetType: 'ecriture', objetId: ecritureId, donnees: { numero: e.numero_piece, motif, date: date ?? null } });
}

enregistrerOperation(OPERATION_EXTOURNE, {
  administrative: false,
  async appliquer(q, demande, acteur) {
    const d = demande.donnees as { motif: string; date: string | null };
    await extourner(q, acteur, demande.objet_id, d.motif, d.date ?? undefined);
  },
});
