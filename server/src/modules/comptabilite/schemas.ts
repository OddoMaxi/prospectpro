/**
 * Schémas comptables (CDC § 11.13 ; FIN-RG-020, 021). Un schéma par événement et par journal ; chaque ligne porte
 * un compte fixe ou une règle de détermination, un sens et une formule de montant. Toute modification est datée,
 * proposée par le chef comptable et validée par la DAF (circuit SCHEMA_COMPTABLE).
 */
import { z } from 'zod';
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { exiger, nonTrouve } from '../../noyau/erreurs.js';
import { aujourdhui } from '../../noyau/dates.js';
import { journaliser } from '../../moteurs/audit.js';
import { enregistrerOperation, soumettre } from '../../moteurs/validation.js';
import { normaliserNumero } from './plan.js';

export const OPERATION_SCHEMA = 'SCHEMA_COMPTABLE';

/** Règles de détermination connues des modules métier (aucun numéro de compte dans le code métier). */
export const REGLES = {
  CLIENT: 'Auxiliaire du souscripteur (collectif des assurés)',
  COMPTE_PRODUCTION: 'Compte de production du bureau émetteur',
  COMMISSIONS_A_PAYER: 'Auxiliaire de l\'intermédiaire ou de l\'apporteur (commissions à payer)',
  PRIMES_BRANCHE: 'Compte de primes de la branche du produit',
  ANNULATIONS_BRANCHE: 'Compte d\'annulations de la branche du produit',
  TAXES: 'Comptes des taxes sur primes (une ligne par code taxe)',
  TRESORERIE: 'Caisse, banque ou monnaie électronique de l\'opération',
  VERSEMENTS_AVANCE: 'Auxiliaire de l\'assuré (versements reçus d\'avance)',
  REMBOURSEMENT: 'Compte de production ou compte de paiement remboursé',
  COMPTE_TAXE: 'Compte de la taxe déclarée',
} as const;

export const schemaDefinition = z.object({
  codeEvt: z.string().regex(/^EVT-\d{2}$/),
  typeEvenement: z.string().min(3).max(60),
  journal: z.string().min(1).max(6),
  libelle: z.string().min(1).max(200),
  dateEffet: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  lignes: z.array(z.object({
    compte: z.string().optional(), regle: z.string().optional(), sens: z.enum(['D', 'C']),
    formule: z.string().regex(/^(\*|[A-Z0-9_]+(\s*[+-]\s*[A-Z0-9_]+)*)$/, 'Formule : noms de montants séparés par + et -, ou *'),
  }).refine(l => !!l.compte !== !!l.regle, 'Chaque ligne a soit un compte fixe, soit une règle')).min(2),
});
export type DefinitionSchema = z.infer<typeof schemaDefinition>;

/** Enregistre un schéma (installation, ou application d'une proposition validée). */
export async function enregistrerSchema(q: Executant, acteur: Acteur, d: DefinitionSchema): Promise<string> {
  const j = (await q.query<{ id: string; mode: string }>('SELECT id, mode FROM journal WHERE code = $1 AND supprime_le IS NULL', [d.journal])).rows[0];
  if (!j) throw nonTrouve(`Journal ${d.journal}`);
  exiger(j.mode === 'AUTOMATIQUE', 'JOURNAL_MANUEL', 'Un schéma alimente un journal automatique (FIN-RG-031)');
  const dateEffet = d.dateEffet ?? aujourdhui();
  const s = await q.query<{ id: string }>(
    `INSERT INTO schema_comptable (code_evt, type_evenement, journal_id, libelle_modele, actif, date_effet) VALUES ($1,$2,$3,$4,true,$5)
     ON CONFLICT (code_evt, journal_id, date_effet) DO NOTHING RETURNING id`, [d.codeEvt, d.typeEvenement, j.id, d.libelle, dateEffet]);
  exiger(s.rows[0], 'SCHEMA_EXISTANT', `Un schéma ${d.codeEvt} / ${d.journal} prend déjà effet le ${dateEffet}`, 409);
  let rang = 0;
  for (const l of d.lignes) {
    let compteId: string | null = null;
    if (l.compte) {
      const c = (await q.query<{ id: string; imputable: boolean }>('SELECT id, imputable FROM compte WHERE numero = $1', [normaliserNumero(l.compte)])).rows[0];
      exiger(c?.imputable, 'COMPTE_INVALIDE', `Compte ${l.compte} absent du plan ou non imputable`);
      compteId = c.id;
    } else exiger(l.regle! in REGLES, 'REGLE_INCONNUE', `Règle inconnue : ${l.regle}`);
    await q.query('INSERT INTO ligne_schema (schema_id, rang, compte_id, compte_regle, sens, formule_montant) VALUES ($1,$2,$3,$4,$5,$6)',
      [s.rows[0].id, ++rang, compteId, l.regle ?? null, l.sens, l.formule]);
  }
  await journaliser(q, { ...acteur.trace(), action: 'PARAMETRAGE', objetType: 'schema_comptable', objetId: s.rows[0].id, apres: d });
  return s.rows[0].id;
}

export async function proposerSchema(q: Executant, acteur: Acteur, brut: unknown, motif: string) {
  exiger(motif?.trim(), 'MOTIF_REQUIS', 'Motif obligatoire');
  const d = schemaDefinition.parse(brut);
  exiger(!d.dateEffet || d.dateEffet >= aujourdhui(), 'DATE_PASSEE', 'Un schéma prend effet au plus tôt aujourd\'hui');
  const j = await q.query('SELECT id FROM journal WHERE code = $1', [d.journal]);
  exiger(j.rowCount, 'JOURNAL_INCONNU', `Journal ${d.journal} inconnu`);
  return soumettre(q, acteur, { typeOperation: OPERATION_SCHEMA, objetType: 'schema_comptable', objetId: j.rows[0].id, donnees: { ...d, motif } as Record<string, unknown> });
}

enregistrerOperation(OPERATION_SCHEMA, {
  administrative: false,
  async appliquer(q, demande, acteur) {
    await enregistrerSchema(q, acteur, schemaDefinition.parse(demande.donnees));
  },
});

/** Schémas en vigueur à une date, avec leurs lignes. */
export async function listerSchemas(q: Executant, date = aujourdhui()) {
  return (await q.query(
    `SELECT DISTINCT ON (s.code_evt, s.journal_id) s.id, s.code_evt, s.type_evenement, j.code AS journal, s.libelle_modele, s.date_effet, s.actif,
            (SELECT json_agg(json_build_object('rang', l.rang, 'compte', c.numero, 'compte_libelle', c.libelle, 'regle', l.compte_regle, 'sens', l.sens, 'formule', l.formule_montant) ORDER BY l.rang)
               FROM ligne_schema l LEFT JOIN compte c ON c.id = l.compte_id WHERE l.schema_id = s.id) AS lignes
       FROM schema_comptable s JOIN journal j ON j.id = s.journal_id
      WHERE s.supprime_le IS NULL AND s.date_effet <= $1 ORDER BY s.code_evt, s.journal_id, s.date_effet DESC`, [date])).rows;
}
