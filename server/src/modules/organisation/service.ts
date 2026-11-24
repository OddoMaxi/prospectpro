/**
 * Organisation paramétrable (CDC § 4.3, ORG-RG-001 à 008 ; DD 4.1 à 4.4).
 *
 * Toute opération est tracée dans historique_organisation, qui permet de rejouer l'organigramme
 * à n'importe quelle date (ORG-RG-006, CA-ORG-02). Déplacement, fusion et scission sont simulés,
 * puis soumis à la validation d'un second administrateur ou de la Direction générale (ORG-RG-005, CA-ORG-01).
 */
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger, nonTrouve } from '../../noyau/erreurs.js';
import { journaliser } from '../../moteurs/audit.js';
import { enregistrerOperation, soumettre, type Demande } from '../../moteurs/validation.js';

export type TypeEntite = 'DEPARTEMENT' | 'SERVICE' | 'FONCTION';
const TABLE: Record<TypeEntite, string> = { DEPARTEMENT: 'departement', SERVICE: 'service', FONCTION: 'fonction' };
const PARENT: Record<TypeEntite, string | null> = { DEPARTEMENT: null, SERVICE: 'departement_id', FONCTION: 'service_id' };
const ENFANT: Record<TypeEntite, TypeEntite | null> = { DEPARTEMENT: 'SERVICE', SERVICE: 'FONCTION', FONCTION: null };
export const OPERATION_ORGANISATION = 'ORGANISATION';

const aujourdhui = () => new Date().toISOString().slice(0, 10);

interface Entite { id: string; code: string; libelle: string; statut: string; parent_id: string | null }

async function entite(q: Executant, type: TypeEntite, id: string): Promise<Entite> {
  const parent = PARENT[type] ? `${PARENT[type]} AS parent_id` : 'NULL::uuid AS parent_id';
  const r = await q.query<Entite>(`SELECT id, code, libelle, statut, ${parent} FROM ${TABLE[type]} WHERE id = $1`, [id]);
  if (!r.rows[0]) throw nonTrouve(type.toLowerCase());
  return r.rows[0];
}

async function tracer(q: Executant, h: {
  operation: string; type: TypeEntite; id: string; avant?: string | null; apres?: string | null;
  dateEffet: string; details?: unknown; validePar?: string | null; auteur?: string | null;
}) {
  await q.query(
    `INSERT INTO historique_organisation (operation, entite_type, entite_id, parent_avant_id, parent_apres_id, date_effet, simulation, valide_par, cree_par)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9, app_utilisateur_courant()))`,
    [h.operation, h.type, h.id, h.avant ?? null, h.apres ?? null, h.dateEffet, h.details ? JSON.stringify(h.details) : null, h.validePar ?? null, h.auteur ?? null]);
}

function controlerDate(dateEffet: string) {
  exiger(/^\d{4}-\d{2}-\d{2}$/.test(dateEffet), 'DATE_INVALIDE', 'Date d\'effet invalide');
  exiger(dateEffet <= aujourdhui(), 'DATE_FUTURE', 'La date d\'effet ne peut pas être postérieure à aujourd\'hui');
}

// ---------------------------------------------------------------- Opérations simples (ORG-RG-001, 008)

export async function creer(q: Executant, acteur: Acteur, type: TypeEntite, d: {
  code: string; libelle: string; parentId?: string; responsableId?: string; profilDefautId?: string; dateEffet?: string;
}): Promise<string> {
  const dateEffet = d.dateEffet ?? aujourdhui();
  controlerDate(dateEffet);
  exiger(/^[A-Z0-9_]{1,20}$/.test(d.code), 'CODE_INVALIDE', 'Code : majuscules, chiffres et « _ » uniquement');
  const existe = await q.query(`SELECT 1 FROM ${TABLE[type]} WHERE code = $1`, [d.code]);
  exiger(!existe.rowCount, 'CODE_DEJA_UTILISE', `Le code ${d.code} est déjà utilisé ou l'a été : il n'est jamais réutilisé`);
  if (PARENT[type]) {
    exiger(d.parentId, 'PARENT_REQUIS', 'Rattachement obligatoire');
    const p = await entite(q, type === 'SERVICE' ? 'DEPARTEMENT' : 'SERVICE', d.parentId);
    exiger(p.statut === 'ACTIF', 'PARENT_INACTIF', 'Rattachement impossible à une entité inactive');
    const creation = await q.query<{ d: string }>(
      `SELECT min(date_effet)::text AS d FROM historique_organisation WHERE entite_id = $1 AND operation = 'CREATION'`, [d.parentId]);
    exiger(!creation.rows[0]?.d || dateEffet >= creation.rows[0].d, 'DATE_ANTERIEURE_AU_RATTACHEMENT',
      `La date d'effet précède la création de l'entité de rattachement (${creation.rows[0]?.d})`);
  }
  let r;
  if (type === 'DEPARTEMENT') {
    r = await q.query(`INSERT INTO departement (code, libelle, responsable_id, date_effet, statut) VALUES ($1,$2,$3,$4,'ACTIF') RETURNING id`,
      [d.code, d.libelle, d.responsableId ?? null, dateEffet]);
  } else if (type === 'SERVICE') {
    r = await q.query(`INSERT INTO service (code, libelle, departement_id, responsable_id, date_effet, statut) VALUES ($1,$2,$3,$4,$5,'ACTIF') RETURNING id`,
      [d.code, d.libelle, d.parentId, d.responsableId ?? null, dateEffet]);
  } else {
    r = await q.query(`INSERT INTO fonction (code, libelle, service_id, profil_defaut_id, statut) VALUES ($1,$2,$3,$4,'ACTIF') RETURNING id`,
      [d.code, d.libelle, d.parentId, d.profilDefautId ?? null]);
  }
  const id = r.rows[0].id as string;
  await tracer(q, { operation: 'CREATION', type, id, apres: d.parentId ?? null, dateEffet, details: { code: d.code, libelle: d.libelle } });
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: TABLE[type], objetId: id, apres: d });
  return id;
}

export async function renommer(q: Executant, acteur: Acteur, type: TypeEntite, id: string, libelle: string, dateEffet = aujourdhui()) {
  controlerDate(dateEffet);
  const e = await entite(q, type, id);
  exiger(libelle.trim() && libelle !== e.libelle, 'LIBELLE_INCHANGE', 'Nouveau libellé requis');
  await q.query(`UPDATE ${TABLE[type]} SET libelle = $2 WHERE id = $1`, [id, libelle]);
  await tracer(q, { operation: 'RENOMMAGE', type, id, dateEffet, details: { libelle_avant: e.libelle, libelle_apres: libelle } });
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: TABLE[type], objetId: id, avant: { libelle: e.libelle }, apres: { libelle } });
}

/** Identifiants des fonctions situées sous une entité. */
async function fonctionsSous(q: Executant, type: TypeEntite, id: string): Promise<string[]> {
  const sql = {
    FONCTION: 'SELECT id FROM fonction WHERE id = $1',
    SERVICE: 'SELECT id FROM fonction WHERE service_id = $1',
    DEPARTEMENT: 'SELECT f.id FROM fonction f JOIN service s ON s.id = f.service_id WHERE s.departement_id = $1',
  }[type];
  return (await q.query<{ id: string }>(sql, [id])).rows.map(r => r.id);
}

/** Impacts d'une opération sur une entité : utilisateurs actifs, habilitations limitées à l'entité, tâches en cours. */
async function impacts(q: Executant, type: TypeEntite, id: string) {
  const fonctions = await fonctionsSous(q, type, id);
  const utilisateurs = (await q.query<{ id: string; identifiant: string }>(
    `SELECT id, identifiant FROM utilisateur WHERE fonction_id = ANY($1) AND statut IN ('ACTIF','A_VALIDER') AND supprime_le IS NULL ORDER BY identifiant`,
    [fonctions])).rows;
  const cle = type === 'DEPARTEMENT' ? 'departements' : 'services';
  const droits = type === 'FONCTION' ? [] : (await q.query<{ id: string; utilisateur_id: string; profil_id: string }>(
    `SELECT id, utilisateur_id, profil_id FROM utilisateur_profil
      WHERE supprime_le IS NULL AND (date_fin IS NULL OR date_fin >= current_date) AND perimetre -> $2 ? $1::text`, [id, cle])).rows;
  const ids = utilisateurs.map(u => u.id);
  const taches = (await q.query<{ id: string; nature: string }>(
    `SELECT id, 'VALIDATION' AS nature FROM demande_validation WHERE statut = 'EN_ATTENTE' AND initiateur_id = ANY($1)
     UNION ALL
     SELECT id, 'RECLAMATION' FROM reclamation WHERE statut NOT IN ('REPONDUE','CLOSE') AND gestionnaire_id = ANY($1) AND supprime_le IS NULL`,
    [ids])).rows;
  return { utilisateurs, droits, taches };
}

/** ORG-RG-007 : désactivation impossible avec des utilisateurs actifs ou des tâches en cours. */
export async function desactiver(q: Executant, acteur: Acteur, type: TypeEntite, id: string, dateEffet = aujourdhui()) {
  controlerDate(dateEffet);
  const e = await entite(q, type, id);
  exiger(e.statut === 'ACTIF', 'DEJA_INACTIF', 'Entité déjà inactive');
  const imp = await impacts(q, type, id);
  if (imp.utilisateurs.length || imp.taches.length) {
    throw new ErreurMetier('ENTITE_OCCUPEE',
      `Désactivation impossible : ${imp.utilisateurs.length} utilisateur(s) actif(s) et ${imp.taches.length} tâche(s) en cours`, 422, imp);
  }
  const enfant = ENFANT[type];
  if (enfant) {
    const actifs = await q.query(`SELECT 1 FROM ${TABLE[enfant]} WHERE ${PARENT[enfant]} = $1 AND statut = 'ACTIF'`, [id]);
    exiger(!actifs.rowCount, 'ENTITE_OCCUPEE', `Désactivation impossible : des ${TABLE[enfant]}s actifs y sont rattachés`);
  }
  await q.query(`UPDATE ${TABLE[type]} SET statut = 'INACTIF' WHERE id = $1`, [id]);
  await tracer(q, { operation: 'DESACTIVATION', type, id, dateEffet });
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: TABLE[type], objetId: id, avant: { statut: 'ACTIF' }, apres: { statut: 'INACTIF' } });
}

// ---------------------------------------------------------------- Opérations validées (ORG-RG-002 à 005)

export type Restructuration =
  | { operation: 'DEPLACEMENT'; type: 'SERVICE' | 'FONCTION'; id: string; nouveauParentId: string; dateEffet: string }
  | { operation: 'FUSION'; type: 'DEPARTEMENT' | 'SERVICE'; sources: string[]; cibleId: string; dateEffet: string }
  | {
      operation: 'SCISSION'; type: 'DEPARTEMENT' | 'SERVICE'; sourceId: string; dateEffet: string;
      /** Nouvelles entités, avec leur part : enfants (services ou fonctions) et tâches transférés. */
      nouvelles: { code: string; libelle: string; parentId?: string; enfants: string[] }[];
    };

/** Simulation (ORG-RG-005) : rien n'est modifié ; liste des utilisateurs, droits et tâches impactés. */
export async function simuler(q: Executant, op: Restructuration) {
  controlerDate(op.dateEffet);
  if (op.operation === 'DEPLACEMENT') {
    const e = await entite(q, op.type, op.id);
    exiger(e.parent_id !== op.nouveauParentId, 'MEME_RATTACHEMENT', 'L\'entité est déjà rattachée à cette cible');
    const p = await entite(q, op.type === 'SERVICE' ? 'DEPARTEMENT' : 'SERVICE', op.nouveauParentId);
    exiger(p.statut === 'ACTIF', 'PARENT_INACTIF', 'Cible inactive');
    return { operation: op.operation, ...(await impacts(q, op.type, op.id)) };
  }
  if (op.operation === 'FUSION') {
    exiger(op.sources.length >= 1 && !op.sources.includes(op.cibleId), 'FUSION_INVALIDE', 'Choisir au moins une entité à fusionner, distincte de la cible');
    const cible = await entite(q, op.type, op.cibleId);
    exiger(cible.statut === 'ACTIF', 'CIBLE_INACTIVE', 'La cible de la fusion doit être active');
    const res = { operation: op.operation, utilisateurs: [] as unknown[], droits: [] as unknown[], taches: [] as unknown[] };
    for (const s of op.sources) {
      const e = await entite(q, op.type, s);
      exiger(e.statut === 'ACTIF', 'SOURCE_INACTIVE', `${e.code} est déjà inactif`);
      const i = await impacts(q, op.type, s);
      res.utilisateurs.push(...i.utilisateurs); res.droits.push(...i.droits); res.taches.push(...i.taches);
    }
    return res;
  }
  // SCISSION (ORG-RG-004) : tous les éléments doivent être affectés
  const enfantType = ENFANT[op.type]!;
  const enfants = (await q.query<{ id: string }>(
    `SELECT id FROM ${TABLE[enfantType]} WHERE ${PARENT[enfantType]} = $1 AND statut = 'ACTIF'`, [op.sourceId])).rows.map(r => r.id);
  const affectes = op.nouvelles.flatMap(n => n.enfants);
  const nonAffectes = enfants.filter(e => !affectes.includes(e));
  exiger(op.nouvelles.length >= 2, 'SCISSION_INVALIDE', 'Une scission crée au moins deux entités');
  exiger(nonAffectes.length === 0, 'SCISSION_INCOMPLETE', `${nonAffectes.length} élément(s) non affecté(s) : la scission n'est validée que lorsque tous sont affectés`);
  exiger(affectes.every(a => enfants.includes(a)) && new Set(affectes).size === affectes.length, 'SCISSION_INVALIDE', 'Affectation inconnue ou en double');
  return { operation: op.operation, ...(await impacts(q, op.type, op.sourceId)), nonAffectes };
}

/** Propose une restructuration : simulation puis demande de validation. */
export async function proposer(q: Executant, acteur: Acteur, op: Restructuration) {
  const simulation = await simuler(q, op);
  const objetId = op.operation === 'DEPLACEMENT' ? op.id : op.operation === 'FUSION' ? op.cibleId : op.sourceId;
  const demande = await soumettre(q, acteur, {
    typeOperation: OPERATION_ORGANISATION, objetType: TABLE[op.type], objetId, donnees: { op, simulation },
  });
  return { demande, simulation };
}

async function deplacer(q: Executant, type: TypeEntite, id: string, parent: string, dateEffet: string, validePar: string, auteur: string) {
  const e = await entite(q, type, id);
  await q.query(`UPDATE ${TABLE[type]} SET ${PARENT[type]} = $2 WHERE id = $1`, [id, parent]);
  await tracer(q, { operation: 'DEPLACEMENT', type, id, avant: e.parent_id, apres: parent, dateEffet, validePar, auteur });
}

/** Les habilitations limitées à une entité suivent l'entité de destination. */
async function reporterPerimetres(q: Executant, type: TypeEntite, ancien: string, nouveau: string) {
  const cle = type === 'DEPARTEMENT' ? 'departements' : type === 'SERVICE' ? 'services' : null;
  if (!cle) return;
  await q.query(
    `UPDATE utilisateur_profil
        SET perimetre = jsonb_set(perimetre, ARRAY[$3::text], (
              SELECT jsonb_agg(DISTINCT CASE WHEN v = $1::text THEN $2::text ELSE v END) FROM jsonb_array_elements_text(perimetre -> $3::text) v))
      WHERE supprime_le IS NULL AND perimetre -> $3::text ? $1::text`, [ancien, nouveau, cle]);
}

async function appliquer(q: Executant, demande: Demande, acteur: Acteur) {
  const { op } = demande.donnees as { op: Restructuration };
  const validePar = acteur.utilisateurId!;
  const auteur = demande.initiateur_id;
  await simuler(q, op); // la situation a pu changer depuis la proposition
  if (op.operation === 'DEPLACEMENT') {
    await deplacer(q, op.type, op.id, op.nouveauParentId, op.dateEffet, validePar, auteur);
    return;
  }
  const enfantType = ENFANT[op.type]!;
  if (op.operation === 'FUSION') {
    for (const s of op.sources) {
      const enfants = (await q.query<{ id: string }>(`SELECT id FROM ${TABLE[enfantType]} WHERE ${PARENT[enfantType]} = $1 AND statut = 'ACTIF'`, [s])).rows;
      for (const en of enfants) await deplacer(q, enfantType, en.id, op.cibleId, op.dateEffet, validePar, auteur);
      await reporterPerimetres(q, op.type, s, op.cibleId);
      await q.query(`UPDATE ${TABLE[op.type]} SET statut = 'INACTIF' WHERE id = $1`, [s]);
      await tracer(q, { operation: 'FUSION', type: op.type, id: s, avant: null, apres: op.cibleId, dateEffet: op.dateEffet, validePar, auteur });
    }
    return;
  }
  // SCISSION
  const source = await entite(q, op.type, op.sourceId);
  for (const n of op.nouvelles) {
    const id = await creer(q, acteur, op.type, { code: n.code, libelle: n.libelle, parentId: n.parentId ?? source.parent_id ?? undefined, dateEffet: op.dateEffet });
    for (const en of n.enfants) await deplacer(q, enfantType, en, id, op.dateEffet, validePar, auteur);
    await tracer(q, { operation: 'SCISSION', type: op.type, id, avant: op.sourceId, apres: id, dateEffet: op.dateEffet, validePar, auteur });
  }
  await q.query(`UPDATE ${TABLE[op.type]} SET statut = 'INACTIF' WHERE id = $1`, [op.sourceId]);
  await tracer(q, { operation: 'DESACTIVATION', type: op.type, id: op.sourceId, dateEffet: op.dateEffet, details: { motif: 'SCISSION' } });
}

enregistrerOperation(OPERATION_ORGANISATION, { administrative: true, appliquer });

// ---------------------------------------------------------------- Organigramme à date (CA-ORG-02)

export interface Noeud { id: string; type: TypeEntite; code: string; libelle: string; statut: string; enfants: Noeud[] }

export async function organigramme(q: Executant, date = aujourdhui(), inclureInactifs = false): Promise<Noeud[]> {
  const h = await q.query<{ operation: string; entite_type: TypeEntite; entite_id: string; parent_apres_id: string | null; simulation: Record<string, string> | null }>(
    `SELECT operation, entite_type, entite_id, parent_apres_id, simulation FROM historique_organisation
      WHERE date_effet <= $1 ORDER BY date_effet, cree_le`, [date]);
  const etat = new Map<string, { type: TypeEntite; code: string; libelle: string; parent: string | null; statut: string }>();
  for (const l of h.rows) {
    const e = etat.get(l.entite_id);
    switch (l.operation) {
      case 'CREATION':
        etat.set(l.entite_id, { type: l.entite_type, code: l.simulation?.code ?? '', libelle: l.simulation?.libelle ?? '', parent: l.parent_apres_id, statut: 'ACTIF' });
        break;
      case 'RENOMMAGE': if (e) e.libelle = l.simulation?.libelle_apres ?? e.libelle; break;
      case 'DEPLACEMENT': if (e) e.parent = l.parent_apres_id; break;
      case 'FUSION': case 'DESACTIVATION': if (e) e.statut = 'INACTIF'; break;
    }
  }
  const noeuds = new Map<string, Noeud>();
  for (const [id, e] of etat) {
    if (inclureInactifs || e.statut === 'ACTIF') noeuds.set(id, { id, type: e.type, code: e.code, libelle: e.libelle, statut: e.statut, enfants: [] });
  }
  const racines: Noeud[] = [];
  for (const [id, n] of noeuds) {
    const parent = etat.get(id)!.parent;
    if (parent && noeuds.has(parent)) noeuds.get(parent)!.enfants.push(n);
    else if (n.type === 'DEPARTEMENT') racines.push(n);
  }
  const trier = (l: Noeud[]) => { l.sort((a, b) => a.code.localeCompare(b.code)); l.forEach(n => trier(n.enfants)); return l; };
  return trier(racines);
}
