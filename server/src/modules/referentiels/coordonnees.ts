/**
 * Coordonnées de paiement (CDC § 5.3 ; REF-RG-005, FIN-RG-017 ; DD coordonnee_paiement).
 *
 * - Le numéro (compte bancaire, portefeuille de monnaie électronique) est chiffré par l'application (domaine « finances »).
 * - Toute création ou modification est validée par un second utilisateur habilité (circuit COORDONNEE_PAIEMENT),
 *   déclenche une alerte au titulaire et ouvre un délai de carence (COORDONNEE_CARENCE_HEURES) avant le premier paiement.
 * - Un paiement sortant n'est possible que vers une coordonnée vérifiée, hors carence, au nom du bénéficiaire (`exigerPayable`).
 */
import { randomUUID } from 'node:crypto';
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger, nonTrouve } from '../../noyau/erreurs.js';
import { journaliser } from '../../moteurs/audit.js';
import type { MoteurChiffrement } from '../../moteurs/chiffrement.js';
import { entier } from '../../moteurs/parametres.js';
import { notifier } from '../../moteurs/notifications.js';
import { enregistrerOperation, soumettre } from '../../moteurs/validation.js';
import { normaliser, ressemblance } from './tiers.js';

export const OPERATION_COORDONNEE = 'COORDONNEE_PAIEMENT';
const contexte = (id: string) => ({ table: 'coordonnee_paiement', colonne: 'numero', id });

export interface DonneesCoordonnee {
  tiersId: string; type: 'BANQUE' | 'MONNAIE_ELECTRONIQUE'; etablissement: string; numero: string; intitule: string;
  principale?: boolean; remplaceId?: string;
}

function normaliserNumero(type: DonneesCoordonnee['type'], numero: string): string {
  const n = numero.replace(/[\s.-]/g, '').toUpperCase();
  if (type === 'MONNAIE_ELECTRONIQUE') exiger(/^\+?\d{8,15}$/.test(n), 'NUMERO_INVALIDE', 'Numéro de portefeuille : 8 à 15 chiffres');
  else exiger(/^[A-Z0-9]{8,34}$/.test(n), 'NUMERO_INVALIDE', 'Numéro de compte : 8 à 34 caractères alphanumériques');
  return n;
}

/** Saisie : la coordonnée est enregistrée « à vérifier » et soumise à validation. */
export async function proposerCoordonnee(q: Executant, acteur: Acteur, chiffrement: MoteurChiffrement, d: DonneesCoordonnee) {
  const t = (await q.query<{ nom: string; prenoms: string | null }>(
    'SELECT nom, prenoms FROM tiers WHERE id = $1 AND supprime_le IS NULL', [d.tiersId])).rows[0];
  if (!t) throw nonTrouve('Fiche tiers');
  exiger(d.etablissement?.trim() && d.intitule?.trim(), 'CHAMPS_REQUIS', 'Établissement et intitulé obligatoires');
  const numero = normaliserNumero(d.type, d.numero);
  if (d.remplaceId) {
    const anc = await q.query('SELECT 1 FROM coordonnee_paiement WHERE id = $1 AND tiers_id = $2 AND supprime_le IS NULL', [d.remplaceId, d.tiersId]);
    exiger(anc.rowCount, 'COORDONNEE_INCONNUE', 'Coordonnée à remplacer introuvable pour ce tiers');
  }
  const id = randomUUID();
  await q.query(
    `INSERT INTO coordonnee_paiement (id, tiers_id, type, etablissement, numero, intitule, principale, statut) VALUES ($1,$2,$3,$4,$5,$6,$7,'A_VERIFIER')`,
    [id, d.tiersId, d.type, d.etablissement.trim(), await chiffrement.chiffrer(q, 'finances', numero, contexte(id)), d.intitule.trim(), d.principale ?? true]);
  // Aide au valideur : concordance entre l'intitulé et le nom du titulaire
  const nomTitulaire = [t.nom, t.prenoms].filter(Boolean).join(' ');
  const concordance = Math.round(100 * ressemblance(normaliser(d.intitule), normaliser(nomTitulaire)));
  const demande = await soumettre(q, acteur, {
    typeOperation: OPERATION_COORDONNEE, objetType: 'coordonnee_paiement', objetId: id,
    donnees: { tiersId: d.tiersId, type: d.type, etablissement: d.etablissement, finNumero: numero.slice(-4), intitule: d.intitule, nomTitulaire, concordance, remplaceId: d.remplaceId ?? null },
  });
  return { id, demandeValidation: demande.id, concordance };
}

enregistrerOperation(OPERATION_COORDONNEE, {
  administrative: false,
  async appliquer(q, demande, acteur) {
    const d = demande.donnees as { tiersId: string; remplaceId: string | null; finNumero: string; etablissement: string };
    const heures = await entier(q, 'COORDONNEE_CARENCE_HEURES');
    const c = (await q.query<{ principale: boolean; carence_jusqu_au: string }>(
      `UPDATE coordonnee_paiement SET statut = 'VERIFIEE', verifiee_par = $2, carence_jusqu_au = now() + make_interval(hours => $3)
        WHERE id = $1 RETURNING principale, carence_jusqu_au`, [demande.objet_id, acteur.utilisateurId, heures])).rows[0]!;
    if (d.remplaceId) await q.query(`UPDATE coordonnee_paiement SET statut = 'SUSPENDUE', principale = false WHERE id = $1`, [d.remplaceId]);
    if (c.principale) {
      await q.query(`UPDATE coordonnee_paiement SET principale = false WHERE tiers_id = $1 AND id <> $2 AND principale`, [d.tiersId, demande.objet_id]);
    }
    // Alerte au titulaire : une modification frauduleuse est ainsi signalée avant tout paiement
    const t = (await q.query<{ telephone: string | null }>('SELECT telephone FROM tiers WHERE id = $1', [d.tiersId])).rows[0];
    if (t?.telephone) {
      await notifier(q, {
        tiersId: d.tiersId, code: 'COORDONNEE_MODIFIEE', canal: 'SMS', adresse: t.telephone, objet: { type: 'coordonnee_paiement', id: demande.objet_id },
        variables: { etablissement: d.etablissement, fin: d.finNumero, heures },
      });
    }
    await journaliser(q, { ...acteur.trace(), action: 'VALIDATION', objetType: 'coordonnee_paiement', objetId: demande.objet_id, apres: { statut: 'VERIFIEE', carence_jusqu_au: c.carence_jusqu_au } });
  },
  async rejeter(q, demande) {
    await q.query(`UPDATE coordonnee_paiement SET statut = 'SUSPENDUE', principale = false WHERE id = $1`, [demande.objet_id]);
  },
});

/** Liste masquée (4 derniers caractères) : le numéro complet ne s'affiche qu'à la demande, et la consultation est tracée. */
export async function listerCoordonnees(q: Executant, chiffrement: MoteurChiffrement, tiersId: string) {
  const r = await q.query<{ id: string; type: string; etablissement: string; numero: Buffer; intitule: string; principale: boolean; statut: string; carence_jusqu_au: string | null }>(
    `SELECT id, type, etablissement, numero, intitule, principale, statut, carence_jusqu_au FROM coordonnee_paiement
      WHERE tiers_id = $1 AND supprime_le IS NULL ORDER BY statut = 'VERIFIEE' DESC, principale DESC, cree_le DESC`, [tiersId]);
  const lignes = [];
  for (const { numero, ...l } of r.rows) {
    const clair = await chiffrement.dechiffrer(q, 'finances', numero, contexte(l.id));
    lignes.push({ ...l, numeroMasque: `•••• ${clair.slice(-4)}` });
  }
  return lignes;
}

export async function lireNumero(q: Executant, acteur: Acteur, chiffrement: MoteurChiffrement, id: string): Promise<string> {
  const r = await q.query<{ numero: Buffer }>('SELECT numero FROM coordonnee_paiement WHERE id = $1 AND supprime_le IS NULL', [id]);
  if (!r.rows[0]) throw nonTrouve('Coordonnée de paiement');
  await journaliser(q, { ...acteur.trace(), action: 'CONSULTATION', objetType: 'coordonnee_paiement', objetId: id });
  return chiffrement.dechiffrer(q, 'finances', r.rows[0].numero, contexte(id));
}

/** Contrôle avant tout paiement sortant (REF-RG-005, PAI) : coordonnée vérifiée, hors carence, au nom du bénéficiaire. */
export async function exigerPayable(q: Executant, coordonneeId: string, beneficiaireTiersId: string, instant = new Date()): Promise<void> {
  const c = (await q.query<{ tiers_id: string; statut: string; carence_jusqu_au: Date | string | null }>(
    'SELECT tiers_id, statut, carence_jusqu_au FROM coordonnee_paiement WHERE id = $1 AND supprime_le IS NULL', [coordonneeId])).rows[0];
  if (!c) throw nonTrouve('Coordonnée de paiement');
  exiger(c.tiers_id === beneficiaireTiersId, 'COORDONNEE_TIERS', 'La coordonnée n\'est pas au nom du bénéficiaire du paiement');
  exiger(c.statut === 'VERIFIEE', 'COORDONNEE_NON_VERIFIEE', 'Coordonnée de paiement non vérifiée : paiement impossible');
  if (c.carence_jusqu_au && new Date(c.carence_jusqu_au) > instant) {
    throw new ErreurMetier('COORDONNEE_EN_CARENCE', `Coordonnée récemment modifiée : aucun paiement avant le ${new Date(c.carence_jusqu_au).toLocaleString('fr-FR', { timeZone: 'UTC' })}`, 422);
  }
}
