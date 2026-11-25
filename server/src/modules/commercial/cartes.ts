/**
 * Cartes professionnelles (CDC § 7.5.11 ; COM-RG-100 à 104 ; CA-COM-08, 16).
 *
 * - Demande créée à l'activation de l'intervenant (agrément, contrôles du junior validés, collaborateur actif).
 * - Contrôle et validation par la Direction commerciale, production (document de la carte, numéro de série,
 *   QR code révocable), remise confirmée par code à usage unique du porteur.
 * - Deux modèles : « Carte professionnelle – Agent général » (agent général et collaborateurs) et « Carte d'apporteur
 *   d'affaires » (junior, prescripteur), avec la mention « agit sous la responsabilité de … ».
 * - Bloquée automatiquement à la suspension, retirée à la sortie ; la page publique de vérification l'affiche.
 */
import { randomBytes } from 'node:crypto';
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { exiger, nonTrouve } from '../../noyau/erreurs.js';
import { aujourdhui } from '../../noyau/dates.js';
import { journaliser } from '../../moteurs/audit.js';
import { attribuer } from '../../moteurs/numerotation.js';
import { genererDocument } from '../../moteurs/documents.js';
import { confirmerAcceptation, demanderAcceptation } from '../documents/acceptation.js';
import { Refus } from '../auth/service.js';

const MODELE = (role: string) => (role === 'AGENT_GENERAL' || role === 'COLLABORATEUR' ? 'AGENT_GENERAL' : 'APPORTEUR');

interface Carte { id: string; numero_serie: string; intervenant_id: string; modele: string; jeton_qr: string; statut: string; remise_le: string | null }

/** COM-RG-101 : demande créée à l'activation ; sans effet si une carte est déjà en cours. */
export async function demanderCarte(q: Executant, acteur: Acteur, intervenantId: string): Promise<string | null> {
  const i = (await q.query<{ role: string; statut: string }>('SELECT role, statut FROM intervenant WHERE id = $1', [intervenantId])).rows[0];
  if (!i || i.statut !== 'ACTIF' || i.role === 'CANAL_DIGITAL') return null;
  const deja = await q.query(`SELECT 1 FROM carte_professionnelle WHERE intervenant_id = $1 AND statut <> 'RETIREE' AND supprime_le IS NULL`, [intervenantId]);
  if (deja.rowCount) return null;
  const id = crypto.randomUUID();
  const numero = await attribuer(q, acteur, { type: 'CARTE_PRO', annee: Number(aujourdhui().slice(0, 4)) }, { type: 'carte_professionnelle', id });
  await q.query(`INSERT INTO carte_professionnelle (id, numero_serie, intervenant_id, modele, jeton_qr, statut) VALUES ($1,$2,$3,$4,$5,'DEMANDEE')`,
    [id, numero, intervenantId, MODELE(i.role), randomBytes(24).toString('base64url')]);
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'carte_professionnelle', objetId: id, apres: { numero, intervenantId } });
  return id;
}

async function lireCarte(q: Executant, id: string): Promise<Carte> {
  const c = (await q.query<Carte>('SELECT * FROM carte_professionnelle WHERE id = $1 AND supprime_le IS NULL FOR UPDATE', [id])).rows[0];
  if (!c) throw nonTrouve('Carte professionnelle');
  return c;
}

async function porteur(q: Executant, intervenantId: string) {
  return (await q.query<{ tiers_id: string; nom: string; role: string; statut: string; responsable: string | null; numero_inscription: string | null }>(
    `SELECT i.tiers_id, trim(t.nom || ' ' || COALESCE(t.prenoms, '')) AS nom, i.role, i.statut, i.numero_inscription,
            CASE WHEN i.role = 'PRESCRIPTEUR' THEN 'la Compagnie (cellule Canal digital)' ELSE trim(ta.nom || ' ' || COALESCE(ta.prenoms, '')) END AS responsable
       FROM intervenant i JOIN tiers t ON t.id = i.tiers_id LEFT JOIN intervenant a ON a.id = COALESCE(i.rattachement_id, i.id) LEFT JOIN tiers ta ON ta.id = a.tiers_id
      WHERE i.id = $1`, [intervenantId])).rows[0]!;
}

/** Contrôle des pièces puis validation par la Direction commerciale. */
export async function validerCarte(q: Executant, acteur: Acteur, carteId: string) {
  const c = await lireCarte(q, carteId);
  exiger(c.statut === 'DEMANDEE', 'STATUT_INVALIDE', 'Seule une carte demandée est validée');
  await q.query(`UPDATE carte_professionnelle SET statut = 'VALIDEE' WHERE id = $1`, [carteId]);
  await journaliser(q, { ...acteur.trace(), action: 'VALIDATION', objetType: 'carte_professionnelle', objetId: carteId });
}

/** Production : document de la carte (numérique et à imprimer), avec l'adresse de vérification du QR code. */
export async function produireCarte(q: Executant, acteur: Acteur, carteId: string, urlVerification: string) {
  const c = await lireCarte(q, carteId);
  exiger(c.statut === 'VALIDEE', 'STATUT_INVALIDE', 'La carte est produite après sa validation');
  const p = await porteur(q, c.intervenant_id);
  const doc = await genererDocument(q, acteur, { modeleCode: 'CARTE_PROFESSIONNELLE', typeDocument: 'CARTE_PROFESSIONNELLE', objet: { type: 'carte_professionnelle', id: carteId }, variables: {
    titre: c.modele === 'AGENT_GENERAL' ? 'Carte professionnelle – Agent général' : 'Carte d\'apporteur d\'affaires', porteur: p.nom, numero: c.numero_serie,
    qualite: { AGENT_GENERAL: 'Agent général', COLLABORATEUR: 'Collaborateur d\'agent général', JUNIOR: 'Junior', PRESCRIPTEUR: 'Prescripteur partenaire' }[p.role] ?? p.role,
    responsabilite: c.modele === 'AGENT_GENERAL' && p.role === 'AGENT_GENERAL' ? 'Agent général de la Compagnie' : `Agit sous la responsabilité de ${p.responsable}`,
    verification: `${urlVerification.replace(/\/$/, '')}/${c.jeton_qr}`,
  } });
  await q.query(`UPDATE carte_professionnelle SET statut = 'PRODUITE' WHERE id = $1`, [carteId]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'carte_professionnelle', objetId: carteId, apres: { statut: 'PRODUITE', document: doc.id } });
  return { documentId: doc.id };
}

async function documentCarte(q: Executant, carteId: string): Promise<string> {
  const d = (await q.query<{ id: string }>(`SELECT id FROM document WHERE objet_type = 'carte_professionnelle' AND objet_id = $1 AND supprime_le IS NULL ORDER BY horodatage_scellement DESC LIMIT 1`, [carteId])).rows[0];
  if (!d) throw nonTrouve('Document de la carte');
  return d.id;
}

/** Remise : code envoyé au porteur, qui le communique pour confirmer la réception (DIG-RG-002). */
export async function demanderRemise(q: Executant, acteur: Acteur, carteId: string) {
  const c = await lireCarte(q, carteId);
  exiger(c.statut === 'PRODUITE', 'STATUT_INVALIDE', 'La carte doit être produite avant sa remise');
  return demanderAcceptation(q, acteur, await documentCarte(q, carteId), (await porteur(q, c.intervenant_id)).tiers_id);
}

export async function confirmerRemise(q: Executant, acteur: Acteur, carteId: string, code: string) {
  const c = await lireCarte(q, carteId);
  exiger(c.statut === 'PRODUITE', 'STATUT_INVALIDE', 'La carte doit être produite avant sa remise');
  const r = await confirmerAcceptation(q, acteur, { documentId: await documentCarte(q, carteId), signataireId: (await porteur(q, c.intervenant_id)).tiers_id, code, assiste: true });
  if (r instanceof Refus) return r;
  await q.query(`UPDATE carte_professionnelle SET statut = 'REMISE', remise_preuve_id = $2, remise_le = now() WHERE id = $1`, [carteId, r.preuveId]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'carte_professionnelle', objetId: carteId, apres: { statut: 'REMISE' } });
  return { remise: true };
}

/** COM-RG-103 : blocage à la suspension, retrait à la sortie, retour à l'état antérieur à la réactivation. */
export async function suivreStatutIntervenant(q: Executant, acteur: Acteur, intervenantId: string, statut: 'SUSPENDU' | 'SORTI' | 'ACTIF') {
  const cartes = (await q.query<{ id: string; statut: string; remise_le: string | null }>(
    `SELECT id, statut, remise_le FROM carte_professionnelle WHERE intervenant_id = $1 AND statut <> 'RETIREE' AND supprime_le IS NULL`, [intervenantId])).rows;
  for (const c of cartes) {
    const nouveau = statut === 'SORTI' ? 'RETIREE' : statut === 'SUSPENDU' ? 'BLOQUEE' : c.statut === 'BLOQUEE' ? (c.remise_le ? 'REMISE' : 'VALIDEE') : c.statut;
    if (nouveau === c.statut) continue;
    await q.query('UPDATE carte_professionnelle SET statut = $2 WHERE id = $1', [c.id, nouveau]);
    await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'carte_professionnelle', objetId: c.id, avant: { statut: c.statut }, apres: { statut: nouveau, motif: `Intervenant ${statut.toLowerCase()}` } });
  }
}

/** COM-RG-104 : page publique de vérification (sans authentification) : nom, statut, rattachement, valide ou retirée. */
export async function verifierCarte(q: Executant, jeton: string) {
  const c = (await q.query<{ numero_serie: string; statut: string; modele: string; intervenant_id: string }>(
    'SELECT numero_serie, statut, modele, intervenant_id FROM carte_professionnelle WHERE jeton_qr = $1 AND supprime_le IS NULL', [jeton])).rows[0];
  if (!c) return { trouvee: false as const };
  const p = await porteur(q, c.intervenant_id);
  const valide = c.statut === 'REMISE' && p.statut === 'ACTIF';
  return {
    trouvee: true as const, numero: c.numero_serie, porteur: p.nom, valide, etat: valide ? 'VALIDE' : c.statut === 'RETIREE' || p.statut === 'SORTI' ? 'RETIREE' : 'SUSPENDUE',
    qualite: { AGENT_GENERAL: 'Agent général', COLLABORATEUR: 'Collaborateur d\'agent général', JUNIOR: 'Junior', PRESCRIPTEUR: 'Prescripteur partenaire' }[p.role] ?? p.role,
    rattachement: p.role === 'AGENT_GENERAL' ? null : p.responsable, numeroInscription: p.numero_inscription,
  };
}

export async function listerCartes(q: Executant, f: { statut?: string; intervenantId?: string }) {
  return (await q.query(
    `SELECT c.id, c.numero_serie, c.modele, c.statut, c.remise_le, c.jeton_qr, c.cree_le, i.id AS intervenant_id, i.role, trim(t.nom || ' ' || COALESCE(t.prenoms, '')) AS porteur
       FROM carte_professionnelle c JOIN intervenant i ON i.id = c.intervenant_id JOIN tiers t ON t.id = i.tiers_id
      WHERE c.supprime_le IS NULL AND ($1::text IS NULL OR c.statut = $1) AND ($2::uuid IS NULL OR c.intervenant_id = $2) ORDER BY c.cree_le DESC`,
    [f.statut ?? null, f.intervenantId ?? null])).rows;
}
