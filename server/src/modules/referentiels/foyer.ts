/**
 * Foyers (CDC § 5.3 ; REF-RG-007 à 009 ; CA-REF-07, CA-REF-09 ; DD lien_foyer).
 *
 * - Un assuré principal déclare au plus TIERS_MAX_CONJOINTS conjoints et ses enfants (REF-RG-007).
 * - Une personne n'est conjoint que d'un seul assuré principal à une date donnée (REF-RG-007).
 * - L'enfant est rattaché à l'assuré principal et, le cas échéant, au conjoint parent ; ce lien désigne le représentant légal (REF-RG-008).
 * - Catégories et âges limites paramétrés ; à l'âge limite, notification puis sortie à l'échéance suivante (REF-RG-009).
 */
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger, nonTrouve } from '../../noyau/erreurs.js';
import { age, ajouterAnnees, ajouterJours, aujourdhui, dateValide } from '../../noyau/dates.js';
import { journaliser } from '../../moteurs/audit.js';
import { entier } from '../../moteurs/parametres.js';
import { notifier } from '../../moteurs/notifications.js';

export type CategorieEnfant = 'A_CHARGE' | 'ETUDIANT' | 'HANDICAPE';

interface Personne { id: string; nature: string; nom: string; prenoms: string | null; date_naissance: string | null; telephone: string | null }
async function personne(q: Executant, id: string): Promise<Personne> {
  const r = await q.query<Personne>('SELECT id, nature, nom, prenoms, date_naissance, telephone FROM tiers WHERE id = $1 AND supprime_le IS NULL', [id]);
  if (!r.rows[0]) throw nonTrouve('Fiche tiers');
  return r.rows[0];
}

/** Date à laquelle un enfant atteint la limite de sa catégorie (null : sans limite). */
export async function dateLimite(q: Executant, dateNaissance: string, categorie: CategorieEnfant, justificatifJusquAu: string | null, date = aujourdhui()): Promise<string | null> {
  if (categorie === 'HANDICAPE') return null;
  if (categorie === 'A_CHARGE') return ajouterAnnees(dateNaissance, await entier(q, 'AGE_LIMITE_ENFANT_CHARGE', date));
  // Étudiant : jusqu'à l'âge limite, tant que le justificatif annuel est valide
  const limiteAge = ajouterAnnees(dateNaissance, await entier(q, 'AGE_LIMITE_ETUDIANT', date));
  return justificatifJusquAu && justificatifJusquAu < limiteAge ? ajouterJours(justificatifJusquAu, 1) : limiteAge;
}

export async function declarerMembre(q: Executant, acteur: Acteur, d: {
  assurePrincipalId: string; membreId: string; lien: 'CONJOINT' | 'ENFANT'; parentConjointId?: string;
  categorieEnfant?: CategorieEnfant; justificatifDocumentId?: string; justificatifValideJusquAu?: string; dateDebut?: string;
}): Promise<string> {
  const dateDebut = d.dateDebut ?? aujourdhui();
  exiger(dateValide(dateDebut), 'DATE_INVALIDE', 'Date de début invalide');
  exiger(d.assurePrincipalId !== d.membreId, 'MEMBRE_INVALIDE', 'L\'assuré principal ne peut pas être membre de son propre foyer');
  // Sérialise les déclarations concernant le même assuré principal et la même personne
  await q.query('SELECT pg_advisory_xact_lock(hashtext($1)), pg_advisory_xact_lock(hashtext($2))', [`foyer:${d.assurePrincipalId}`, `membre:${d.membreId}`]);
  const [principal, membre] = [await personne(q, d.assurePrincipalId), await personne(q, d.membreId)];
  exiger(principal.nature === 'PHYSIQUE' && membre.nature === 'PHYSIQUE', 'NATURE_INCOMPATIBLE', 'Un foyer ne comprend que des personnes physiques');

  const actifs = await q.query<{ membre_id: string; lien: string }>(
    `SELECT membre_id, lien FROM lien_foyer WHERE assure_principal_id = $1 AND supprime_le IS NULL
        AND date_debut <= $2 AND (date_fin IS NULL OR date_fin > $2)`, [d.assurePrincipalId, dateDebut]);
  exiger(!actifs.rows.some(r => r.membre_id === d.membreId), 'DEJA_MEMBRE', 'Cette personne fait déjà partie du foyer', 409);

  if (d.lien === 'CONJOINT') {
    const max = await entier(q, 'TIERS_MAX_CONJOINTS', dateDebut);
    const n = actifs.rows.filter(r => r.lien === 'CONJOINT').length;
    exiger(n < max, 'CONJOINTS_MAX', `Un assuré principal déclare au plus ${max} conjoints (REF-RG-007)`);
    const ailleurs = await q.query<{ nom: string; prenoms: string | null }>(
      `SELECT t.nom, t.prenoms FROM lien_foyer l JOIN tiers t ON t.id = l.assure_principal_id
        WHERE l.membre_id = $1 AND l.lien = 'CONJOINT' AND l.supprime_le IS NULL
          AND l.date_debut <= $2 AND (l.date_fin IS NULL OR l.date_fin > $2)`, [d.membreId, dateDebut]);
    exiger(!ailleurs.rowCount, 'DEJA_CONJOINT',
      `Cette personne est déjà déclarée conjoint d'un autre assuré principal (${ailleurs.rows[0]?.nom ?? ''} ${ailleurs.rows[0]?.prenoms ?? ''}) (REF-RG-007)`);
    exiger(!d.categorieEnfant && !d.parentConjointId, 'DONNEES_INCOHERENTES', 'Catégorie et parent ne concernent que les enfants');
  } else {
    exiger(membre.date_naissance, 'DATE_NAISSANCE_REQUISE', 'La date de naissance de l\'enfant est obligatoire');
    const categorie = d.categorieEnfant ?? 'A_CHARGE';
    if (categorie !== 'A_CHARGE') {
      exiger(d.justificatifDocumentId, 'JUSTIFICATIF_REQUIS', categorie === 'ETUDIANT' ? 'Justificatif de scolarité obligatoire' : 'Justificatif de handicap obligatoire');
    }
    if (categorie === 'ETUDIANT') {
      exiger(d.justificatifValideJusquAu && d.justificatifValideJusquAu > dateDebut, 'JUSTIFICATIF_PERIME', 'Le justificatif de scolarité doit être en cours de validité');
    }
    const limite = await dateLimite(q, membre.date_naissance, categorie, d.justificatifValideJusquAu ?? null, dateDebut);
    if (limite && limite <= dateDebut) {
      throw new ErreurMetier('AGE_LIMITE_ATTEINT',
        `À ${age(membre.date_naissance, dateDebut)} ans, cet enfant dépasse la limite de la catégorie ${categorie} (REF-RG-009)`, 422);
    }
    if (d.parentConjointId) {
      exiger(actifs.rows.some(r => r.membre_id === d.parentConjointId && r.lien === 'CONJOINT'), 'PARENT_INVALIDE',
        'Le parent désigné doit être un conjoint déclaré du foyer (REF-RG-008)');
    }
  }

  const r = await q.query<{ id: string }>(
    `INSERT INTO lien_foyer (assure_principal_id, membre_id, lien, parent_conjoint_id, categorie_enfant, justificatif_document_id, justificatif_valide_jusqu_au, date_debut)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [d.assurePrincipalId, d.membreId, d.lien, d.parentConjointId ?? null, d.lien === 'ENFANT' ? d.categorieEnfant ?? 'A_CHARGE' : null,
      d.justificatifDocumentId ?? null, d.justificatifValideJusquAu ?? null, dateDebut]);
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'lien_foyer', objetId: r.rows[0]!.id, apres: { ...d, dateDebut } });
  return r.rows[0]!.id;
}

/** Changement de catégorie sur justificatif (ex. l'enfant à charge devient étudiant) : REF-RG-009. */
export async function changerCategorie(q: Executant, acteur: Acteur, lienId: string, d: { categorie: CategorieEnfant; justificatifDocumentId: string; justificatifValideJusquAu?: string }) {
  const l = (await q.query<{ lien: string; membre_id: string; categorie_enfant: string; date_fin: string | null }>(
    'SELECT lien, membre_id, categorie_enfant, date_fin FROM lien_foyer WHERE id = $1 AND supprime_le IS NULL FOR UPDATE', [lienId])).rows[0];
  if (!l || l.date_fin) throw nonTrouve('Lien de foyer actif');
  exiger(l.lien === 'ENFANT', 'LIEN_INVALIDE', 'Seul un enfant change de catégorie');
  exiger(d.justificatifDocumentId, 'JUSTIFICATIF_REQUIS', 'Justificatif obligatoire');
  const m = await personne(q, l.membre_id);
  const limite = await dateLimite(q, m.date_naissance!, d.categorie, d.justificatifValideJusquAu ?? null);
  exiger(!limite || limite > aujourdhui(), 'AGE_LIMITE_ATTEINT', 'L\'enfant dépasse la limite de cette catégorie');
  await q.query('UPDATE lien_foyer SET categorie_enfant = $2, justificatif_document_id = $3, justificatif_valide_jusqu_au = $4 WHERE id = $1',
    [lienId, d.categorie, d.justificatifDocumentId, d.justificatifValideJusquAu ?? null]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'lien_foyer', objetId: lienId, avant: { categorie: l.categorie_enfant }, apres: d });
}

export async function retirerMembre(q: Executant, acteur: Acteur, lienId: string, dateFin: string, motif: string) {
  exiger(motif?.trim(), 'MOTIF_REQUIS', 'Motif obligatoire');
  const r = await q.query<{ date_debut: string }>('SELECT date_debut FROM lien_foyer WHERE id = $1 AND date_fin IS NULL AND supprime_le IS NULL FOR UPDATE', [lienId]);
  if (!r.rows[0]) throw nonTrouve('Lien de foyer actif');
  exiger(dateFin >= r.rows[0].date_debut, 'DATE_INVALIDE', 'La fin ne peut précéder le début');
  await q.query('UPDATE lien_foyer SET date_fin = $2 WHERE id = $1', [lienId, dateFin]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'lien_foyer', objetId: lienId, apres: { dateFin, motif } });
}

export async function foyer(q: Executant, assurePrincipalId: string, date = aujourdhui()) {
  return (await q.query(
    `SELECT l.id, l.lien, l.membre_id, t.code_tiers, t.nom, t.prenoms, t.date_naissance, l.categorie_enfant, l.parent_conjoint_id,
            l.justificatif_valide_jusqu_au, l.date_debut, l.date_fin
       FROM lien_foyer l JOIN tiers t ON t.id = l.membre_id
      WHERE l.assure_principal_id = $1 AND l.supprime_le IS NULL AND l.date_debut <= $2 AND (l.date_fin IS NULL OR l.date_fin > $2)
      ORDER BY l.lien, t.date_naissance`, [assurePrincipalId, date])).rows;
}

/** REF-RG-008 : représentant légal d'un enfant = le conjoint parent s'il est désigné, sinon l'assuré principal. */
export async function representantLegal(q: Executant, enfantId: string, date = aujourdhui()): Promise<string> {
  const r = await q.query<{ parent_conjoint_id: string | null; assure_principal_id: string }>(
    `SELECT parent_conjoint_id, assure_principal_id FROM lien_foyer
      WHERE membre_id = $1 AND lien = 'ENFANT' AND supprime_le IS NULL AND date_debut <= $2 AND (date_fin IS NULL OR date_fin > $2)
      ORDER BY date_debut DESC LIMIT 1`, [enfantId, date]);
  if (!r.rows[0]) throw new ErreurMetier('REPRESENTANT_INCONNU', 'Aucun foyer ne rattache cet enfant', 422);
  return r.rows[0].parent_conjoint_id ?? r.rows[0].assure_principal_id;
}

/**
 * Traitement quotidien (REF-RG-009, CA-REF-09) : enfants atteignant la limite de leur catégorie à la date `date + préavis`.
 * Le souscripteur (assuré principal) est notifié ; la sortie est fixée à l'échéance suivant la limite, fournie par le module
 * Souscription (`echeanceSuivante`) ; tant que ce module n'est pas en service, seule la notification est émise.
 * Un justificatif enregistré à temps (changerCategorie) repousse la limite : l'enfant n'est alors plus retenu.
 */
export async function traiterAgesLimites(q: Executant, acteur: Acteur, date: string,
  echeanceSuivante: (assurePrincipalId: string, apres: string) => Promise<string | null> = async () => null) {
  const preavis = await entier(q, 'FOYER_PREAVIS_AGE_LIMITE_JOURS', date);
  const cible = ajouterJours(date, preavis);
  const enfants = await q.query<{ id: string; assure_principal_id: string; categorie_enfant: CategorieEnfant; date_naissance: string;
    justificatif_valide_jusqu_au: string | null; nom: string; prenoms: string | null }>(
    `SELECT l.id, l.assure_principal_id, l.categorie_enfant, t.date_naissance, l.justificatif_valide_jusqu_au, t.nom, t.prenoms
       FROM lien_foyer l JOIN tiers t ON t.id = l.membre_id
      WHERE l.lien = 'ENFANT' AND l.date_fin IS NULL AND l.supprime_le IS NULL AND l.categorie_enfant <> 'HANDICAPE'`);
  const traites: { lienId: string; dateLimite: string; sortie: string | null }[] = [];
  for (const e of enfants.rows) {
    const limite = await dateLimite(q, e.date_naissance, e.categorie_enfant, e.justificatif_valide_jusqu_au, date);
    if (limite !== cible) continue;
    const p = await personne(q, e.assure_principal_id);
    if (p.telephone) {
      await notifier(q, {
        tiersId: p.id, code: 'ENFANT_AGE_LIMITE', canal: 'SMS', adresse: p.telephone, objet: { type: 'lien_foyer', id: e.id },
        variables: { enfant: `${e.prenoms ?? ''} ${e.nom}`.trim(), date: limite.split('-').reverse().join('/') },
      });
    }
    const sortie = await echeanceSuivante(e.assure_principal_id, limite);
    if (sortie) await q.query('UPDATE lien_foyer SET date_fin = $2 WHERE id = $1', [e.id, sortie]);
    await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'lien_foyer', objetId: e.id, apres: { ageLimite: limite, sortie, notifie: !!p.telephone } });
    traites.push({ lienId: e.id, dateLimite: limite, sortie });
  }
  return traites;
}
