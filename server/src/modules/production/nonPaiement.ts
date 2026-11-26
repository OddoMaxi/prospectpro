/**
 * Non-paiement d'une prime due en cours de contrat : procédure de l'article 30 (CDC § 8.7 ; PROD-RG-028 ; CA-PROD-14, 15 ;
 * maquette PR-06). Délais légaux verrouillés (paramètres ART30, modifiables seulement à la hausse).
 *
 * - Relance automatique à l'échéance de la quittance à terme légal.
 * - À J+10 sans paiement : lettre de mise en demeure générée (mention expresse, montant, échéance, délais, article 30),
 *   soumise à la validation de la gestion production, qui confirme la date d'envoi recommandé.
 * - Suspension 30 jours après l'envoi (jour d'envoi exclu, dernier jour férié reporté au jour ouvré suivant) : la
 *   police passe SUSPENDUE, ce qui bloque toutes ses cartes ; résiliation possible 10 jours plus tard, sur décision
 *   validée (vieContrat.ts, motif NON_PAIEMENT).
 * - Le paiement lève la mise en demeure ; une police suspendue reprend le lendemain à midi, sans couverture des soins
 *   reçus pendant la suspension (période conservée sur la mise en demeure).
 */
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { exiger, nonTrouve } from '../../noyau/erreurs.js';
import { ajouterJours, aujourdhui, dateValide } from '../../noyau/dates.js';
import { journaliser } from '../../moteurs/audit.js';
import { notifier } from '../../moteurs/notifications.js';
import { publier } from '../../moteurs/evenements.js';
import { entier, valeurParametre } from '../../moteurs/parametres.js';
import { genererDocument } from '../../moteurs/documents.js';

const gnf = (n: number) => `${n.toLocaleString('fr-FR').replace(/ /g, ' ')} GNF`;
const fr = (d: string) => d.slice(0, 10).split('-').reverse().join('/');

/** Fin d'un délai de n jours, jour de départ exclu ; un dernier jour férié reporte la fin au jour ouvré suivant. */
async function finDelai(q: Executant, depart: string, n: number) {
  let d = ajouterJours(depart, n);
  while ((await q.query('SELECT 1 FROM jour_ferie WHERE date = $1 AND supprime_le IS NULL', [d])).rowCount) d = ajouterJours(d, 1);
  return d;
}

/** Calendrier légal à partir de la date d'envoi : suspension à l'issue des 30 jours, résiliation possible 10 jours après. */
export async function calendrierArticle30(q: Executant, envoi: string) {
  const suspension = ajouterJours(await finDelai(q, envoi, await entier(q, 'PROD_SUSPENSION_JOURS')), 1);
  const resiliation = ajouterJours(await finDelai(q, ajouterJours(suspension, -1), await entier(q, 'PROD_RESILIATION_JOURS')), 1);
  return { suspension, resiliation };
}

interface Impaye { id: string; numero: string; police_id: string; police: string; statut_police: string; souscripteur_id: string; souscripteur: string; telephone: string | null; adresse: string | null; prime_totale: number; echeance: string }
const SELECT_IMPAYES = `
  SELECT qt.id, qt.numero, qt.police_id, p.numero AS police, p.statut AS statut_police, p.souscripteur_id, trim(t.nom || ' ' || COALESCE(t.prenoms, '')) AS souscripteur, t.telephone, t.adresse,
         qt.prime_totale::bigint AS prime_totale,
         COALESCE((SELECT max(l.echeance)::text FROM ligne_ecriture l WHERE l.ecriture_id = qt.ecriture_constatation_id AND l.echeance IS NOT NULL), (qt.cree_le AT TIME ZONE 'Africa/Conakry')::date::text) AS echeance
    FROM quittance qt JOIN police p ON p.id = qt.police_id JOIN tiers t ON t.id = p.souscripteur_id
   WHERE qt.statut = 'A_TERME_LEGAL' AND qt.supprime_le IS NULL AND p.statut IN ('ACTIVE', 'SUSPENDUE')`;

async function genererLettre(q: Executant, acteur: Acteur, i: Impaye, envoi: string) {
  const c = await calendrierArticle30(q, envoi);
  const doc = await genererDocument(q, acteur, { modeleCode: 'LETTRE_MISE_EN_DEMEURE', typeDocument: 'MISE_EN_DEMEURE', objet: { type: 'police', id: i.police_id }, variables: {
    souscripteur: i.souscripteur, adresse: i.adresse ?? '', police: i.police, quittance: i.numero, montant: gnf(Number(i.prime_totale)), echeance: fr(i.echeance),
    suspension: fr(c.suspension), resiliation: fr(c.resiliation), article_30: await valeurParametre(q, 'PROD_TEXTE_ARTICLE_30'),
  } });
  return { documentId: doc.id, ...c };
}

/** Traitement quotidien (et de midi pour les reprises) : relances, mises en demeure, suspensions, reprises. */
export async function traiterImpayes(q: Executant, acteur: Acteur, date = aujourdhui(), maintenant = new Date()) {
  const res = { relances: 0, misesEnDemeure: 0, suspensions: 0, reprises: 0 };
  const delaiMiseEnDemeure = await entier(q, 'PROD_MISE_EN_DEMEURE_JOURS');
  const impayes = (await q.query<Impaye>(SELECT_IMPAYES)).rows.filter(i => i.echeance <= date);
  for (const i of impayes) {
    // Relance à l'échéance, une seule fois
    const relance = await q.query(`SELECT 1 FROM notification n JOIN modele_notification m ON m.id = n.modele_notification_id WHERE m.code = 'RELANCE_PRIME' AND n.objet_type = 'quittance' AND n.objet_id = $1`, [i.id]);
    if (!relance.rowCount && i.telephone) {
      await notifier(q, { tiersId: i.souscripteur_id, code: 'RELANCE_PRIME', canal: 'SMS', adresse: i.telephone, objet: { type: 'quittance', id: i.id },
        variables: { montant: gnf(Number(i.prime_totale)), police: i.police, quittance: i.numero, echeance: fr(i.echeance) } }).catch(() => undefined);
      res.relances++;
    }
    // J+10 : lettre de mise en demeure générée, soumise à la validation de l'envoi
    const mise = await q.query(`SELECT 1 FROM mise_en_demeure WHERE quittance_id = $1 AND statut <> 'ANNULEE' AND supprime_le IS NULL`, [i.id]);
    if (!mise.rowCount && ajouterJours(i.echeance, delaiMiseEnDemeure) <= date) {
      const l = await genererLettre(q, acteur, i, date);
      const r = await q.query<{ id: string }>(
        `INSERT INTO mise_en_demeure (police_id, quittance_id, lettre_document_id, envoyee_le, suspension_le, resiliation_possible_le, statut) VALUES ($1,$2,$3,$4,$5,$6,'A_VALIDER') RETURNING id`,
        [i.police_id, i.id, l.documentId, date, l.suspension, l.resiliation]);
      await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'mise_en_demeure', objetId: r.rows[0]!.id, apres: { quittance: i.numero, police: i.police, ...l } });
      res.misesEnDemeure++;
    }
  }
  // Suspension à l'issue du délai : toutes les cartes de la police sont bloquées (statut lu par le moteur de droits)
  const aSuspendre = (await q.query<{ id: string; police_id: string; numero: string; souscripteur_id: string; telephone: string | null; montant: number; suspension_le: string }>(
    `SELECT m.id, m.police_id, p.numero, p.souscripteur_id, t.telephone, qt.prime_totale::bigint AS montant, m.suspension_le::text
       FROM mise_en_demeure m JOIN police p ON p.id = m.police_id JOIN tiers t ON t.id = p.souscripteur_id JOIN quittance qt ON qt.id = m.quittance_id
      WHERE m.statut = 'EN_COURS' AND m.suspension_le <= $1 AND p.statut = 'ACTIVE' AND m.supprime_le IS NULL FOR UPDATE OF p`, [date])).rows;
  for (const s of aSuspendre) {
    await q.query(`UPDATE police SET statut = 'SUSPENDUE' WHERE id = $1`, [s.police_id]);
    await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'police', objetId: s.police_id, avant: { statut: 'ACTIVE' }, apres: { statut: 'SUSPENDUE', miseEnDemeure: s.id } });
    await publier(q, acteur, { type: 'POLICE_SUSPENDUE', objet: { type: 'police', id: s.police_id }, charge: { numero: s.numero, depuis: s.suspension_le }, cleIdempotence: `police:${s.police_id}:suspendue:${s.id}` });
    if (s.telephone) await notifier(q, { tiersId: s.souscripteur_id, code: 'POLICE_SUSPENDUE', canal: 'SMS', adresse: s.telephone, objet: { type: 'police', id: s.police_id },
      variables: { police: s.numero, date: fr(s.suspension_le), montant: gnf(Number(s.montant)) } }).catch(() => undefined);
    res.suspensions++;
  }
  // Reprise le lendemain à midi du paiement, si aucune autre mise en demeure ne maintient la suspension
  const aReprendre = (await q.query<{ police_id: string; numero: string }>(
    `SELECT DISTINCT m.police_id, p.numero FROM mise_en_demeure m JOIN police p ON p.id = m.police_id
      WHERE m.statut = 'LEVEE' AND m.levee_effet_le <= $1 AND p.statut = 'SUSPENDUE'
        AND NOT EXISTS (SELECT 1 FROM mise_en_demeure x WHERE x.police_id = m.police_id AND x.statut = 'EN_COURS' AND x.suspension_le <= $2)`, [maintenant, date])).rows;
  for (const r of aReprendre) {
    await q.query(`UPDATE police SET statut = 'ACTIVE' WHERE id = $1 AND statut = 'SUSPENDUE'`, [r.police_id]);
    await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'police', objetId: r.police_id, avant: { statut: 'SUSPENDUE' }, apres: { statut: 'ACTIVE', reprise: 'paiement reçu' } });
    res.reprises++;
  }
  return res;
}

/** Validation de l'envoi par la gestion production (PR-06) : date d'envoi recommandé confirmée, calendrier recalculé. */
export async function validerEnvoi(q: Executant, acteur: Acteur, miseId: string, dateEnvoi: string) {
  const m = (await q.query<{ statut: string; quittance_id: string; cree: string }>(
    `SELECT statut, quittance_id, (cree_le AT TIME ZONE 'Africa/Conakry')::date::text AS cree FROM mise_en_demeure WHERE id = $1 AND supprime_le IS NULL FOR UPDATE`, [miseId])).rows[0];
  if (!m) throw nonTrouve('Mise en demeure');
  exiger(m.statut === 'A_VALIDER', 'STATUT_INVALIDE', 'Envoi déjà validé ou mise en demeure close', 409);
  exiger(dateValide(dateEnvoi) && dateEnvoi >= m.cree && dateEnvoi <= aujourdhui(), 'DATE_INVALIDE', 'La date d\'envoi est comprise entre la génération de la lettre et aujourd\'hui');
  const i = (await q.query<Impaye>(`${SELECT_IMPAYES} AND qt.id = $1`, [m.quittance_id])).rows[0];
  exiger(i, 'QUITTANCE_PAYEE', 'La prime a été payée : la mise en demeure est sans objet');
  // Lettre régénérée avec les dates calculées depuis l'envoi effectif
  const l = await genererLettre(q, acteur, i!, dateEnvoi);
  await q.query(`UPDATE mise_en_demeure SET statut = 'EN_COURS', envoyee_le = $2, suspension_le = $3, resiliation_possible_le = $4, lettre_document_id = $5, validee_par = $6 WHERE id = $1`,
    [miseId, dateEnvoi, l.suspension, l.resiliation, l.documentId, acteur.utilisateurId]);
  await journaliser(q, { ...acteur.trace(), action: 'VALIDATION', objetType: 'mise_en_demeure', objetId: miseId, apres: { envoi: dateEnvoi, suspension: l.suspension, resiliation: l.resiliation } });
  return { envoi: dateEnvoi, suspension: l.suspension, resiliation: l.resiliation, documentId: l.documentId };
}

/** Paiement de la quittance : mise en demeure levée ; reprise de la police suspendue le lendemain à midi. */
export async function leverMiseEnDemeure(q: Executant, acteur: Acteur, quittanceId: string, jour = aujourdhui()) {
  const m = (await q.query<{ id: string; statut: string; police_id: string }>(
    `SELECT id, statut, police_id FROM mise_en_demeure WHERE quittance_id = $1 AND statut IN ('A_VALIDER', 'EN_COURS') AND supprime_le IS NULL FOR UPDATE`, [quittanceId])).rows[0];
  if (!m) return null;
  if (m.statut === 'A_VALIDER') {
    await q.query(`UPDATE mise_en_demeure SET statut = 'ANNULEE' WHERE id = $1`, [m.id]);
    return { statut: 'ANNULEE' as const };
  }
  const reprise = `${ajouterJours(jour, 1)}T12:00:00Z`; // midi à Conakry (GMT)
  await q.query(`UPDATE mise_en_demeure SET statut = 'LEVEE', levee_effet_le = $2 WHERE id = $1`, [m.id, reprise]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'mise_en_demeure', objetId: m.id, apres: { statut: 'LEVEE', reprise } });
  const p = (await q.query<{ numero: string; statut: string; souscripteur_id: string; telephone: string | null }>(
    'SELECT p.numero, p.statut, p.souscripteur_id, t.telephone FROM police p JOIN tiers t ON t.id = p.souscripteur_id WHERE p.id = $1', [m.police_id])).rows[0]!;
  if (p.statut === 'SUSPENDUE' && p.telephone) {
    await notifier(q, { tiersId: p.souscripteur_id, code: 'SUSPENSION_LEVEE', canal: 'SMS', adresse: p.telephone, objet: { type: 'police', id: m.police_id },
      variables: { police: p.numero, reprise: `${fr(ajouterJours(jour, 1))} à midi` } }).catch(() => undefined);
  }
  return { statut: 'LEVEE' as const, reprise };
}

/** Mise en demeure en cours permettant la résiliation pour non-paiement (délais légaux écoulés). */
export async function miseEnDemeureResiliable(q: Executant, policeId: string) {
  return (await q.query<{ id: string; resiliation_possible_le: string }>(
    `SELECT id, resiliation_possible_le::text FROM mise_en_demeure WHERE police_id = $1 AND statut = 'EN_COURS' AND supprime_le IS NULL ORDER BY envoyee_le LIMIT 1`, [policeId])).rows[0] ?? null;
}

/** Écran des impayés (PR-06) : quittances à terme légal, relances, mises en demeure et calendrier. */
export async function listerImpayes(q: Executant, date = aujourdhui()) {
  const delai = await entier(q, 'PROD_MISE_EN_DEMEURE_JOURS');
  const impayes = (await q.query<Impaye & { mise_id: string | null; mise_statut: string | null; envoyee_le: string | null; suspension_le: string | null; resiliation_possible_le: string | null; lettre_document_id: string | null; relance_le: string | null; bureau: string }>(
    `SELECT x.*, m.id AS mise_id, m.statut AS mise_statut, m.envoyee_le::text, m.suspension_le::text, m.resiliation_possible_le::text, m.lettre_document_id,
            (SELECT min(n.cree_le) FROM notification n JOIN modele_notification mn ON mn.id = n.modele_notification_id WHERE mn.code = 'RELANCE_PRIME' AND n.objet_id = x.id)::text AS relance_le,
            (SELECT b.code FROM police p JOIN bureau b ON b.id = p.bureau_gestion_id WHERE p.id = x.police_id) AS bureau
       FROM (${SELECT_IMPAYES}) x LEFT JOIN mise_en_demeure m ON m.quittance_id = x.id AND m.statut IN ('A_VALIDER', 'EN_COURS') AND m.supprime_le IS NULL
      ORDER BY x.echeance`)).rows;
  return impayes.map(i => ({ ...i, prime_totale: Number(i.prime_totale), miseEnDemeurePrevueLe: ajouterJours(i.echeance, delai),
    resiliable: i.mise_statut === 'EN_COURS' && i.statut_police === 'SUSPENDUE' && !!i.resiliation_possible_le && i.resiliation_possible_le <= date }));
}
