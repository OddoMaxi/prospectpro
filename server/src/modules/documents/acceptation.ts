/**
 * Acceptation électronique d'un document (CDC § 3.9 ; DIG-RG-002, 005 ; DD dossier_preuve).
 *
 * - Code à usage unique envoyé au téléphone vérifié du signataire, lié à l'empreinte du document présenté :
 *   si le document change, le code ne vaut plus. 5 minutes, 3 essais.
 * - Dossier de preuve : document, empreinte, référence du code (jamais le code), date et heure, appareil, agent assistant.
 * - Le niveau exigé est celui du modèle (paramètre). Le niveau « signature certifiée ANDE » exige un prestataire agréé :
 *   tant qu'il n'est pas branché, ces documents ne peuvent pas être acceptés par code (décision du 23/11/2026).
 * - Personne sans téléphone : signature manuscrite numérisée, rattachée comme exception (DIG-RG-005).
 */
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger, nonTrouve } from '../../noyau/erreurs.js';
import { journaliser } from '../../moteurs/audit.js';
import { notifier } from '../../moteurs/notifications.js';
import { publier } from '../../moteurs/evenements.js';
import { Refus } from '../auth/service.js';

const OBJET = 'ACCEPTATION_DOCUMENT';
const hacher = (code: string, empreinteDocument: string, sel: string) => createHash('sha256').update(`${sel}:${empreinteDocument}:${code}`).digest('hex');

async function contexte(q: Executant, documentId: string, signataireId: string) {
  const d = (await q.query<{ id: string; type_document: string; empreinte: string; niveau: string | null; libelle: string | null }>(
    `SELECT d.id, d.type_document, d.empreinte, m.niveau_signature AS niveau, m.libelle FROM document d
       LEFT JOIN modele_document m ON m.id = d.modele_document_id WHERE d.id = $1 AND d.supprime_le IS NULL`, [documentId])).rows[0];
  if (!d) throw nonTrouve('Document');
  const t = (await q.query<{ telephone: string | null; telephone_verifie: boolean | null }>(
    'SELECT telephone, telephone_verifie FROM tiers WHERE id = $1 AND supprime_le IS NULL', [signataireId])).rows[0];
  if (!t) throw nonTrouve('Signataire');
  const deja = await q.query('SELECT 1 FROM dossier_preuve WHERE document_id = $1 AND signataire_tiers_id = $2', [documentId, signataireId]);
  exiger(!deja.rowCount, 'DEJA_ACCEPTE', 'Ce document a déjà été accepté par cette personne', 409);
  return { d, t };
}

/** Envoie le code d'acceptation au téléphone vérifié du signataire. */
export async function demanderAcceptation(q: Executant, acteur: Acteur, documentId: string, signataireId: string) {
  const { d, t } = await contexte(q, documentId, signataireId);
  if (d.niveau === 'CERTIFIEE_ANDE') {
    throw new ErreurMetier('SIGNATURE_CERTIFIEE_REQUISE',
      'Ce document exige une signature certifiée par un prestataire agréé ANDE : aucun prestataire n\'est encore branché', 422);
  }
  exiger(t.telephone && t.telephone_verifie, 'TELEPHONE_NON_VERIFIE',
    'Le signataire n\'a pas de téléphone vérifié : faire vérifier son numéro, ou recueillir une signature manuscrite numérisée (DIG-RG-005)');
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const sel = randomBytes(8).toString('hex');
  // Un nouveau code annule les précédents
  await q.query(`UPDATE code_usage_unique SET expire_le = now() WHERE tiers_id = $1 AND objet = $2 AND objet_id = $3 AND utilise_le IS NULL`, [signataireId, OBJET, documentId]);
  await q.query(
    `INSERT INTO code_usage_unique (tiers_id, utilisateur_id, objet, objet_id, empreinte_code, telephone, expire_le)
     VALUES ($1,$2,$3,$4,$5,$6, now() + interval '5 minutes')`,
    [signataireId, acteur.utilisateurId, OBJET, documentId, `${sel}$${hacher(code, d.empreinte, sel)}`, t.telephone]);
  await notifier(q, {
    tiersId: signataireId, code: 'ACCEPTATION_DOCUMENT', canal: 'SMS', adresse: t.telephone!, objet: { type: 'document', id: documentId },
    variables: { code, document: d.libelle ?? d.type_document, empreinte: d.empreinte.slice(0, 8).toUpperCase() },
  });
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'code_usage_unique', objetId: documentId, apres: { objet: OBJET, signataire: signataireId } });
  return { envoyeA: `${t.telephone!.slice(0, 4)}•••${t.telephone!.slice(-2)}`, empreinte: d.empreinte };
}

/**
 * Confirme l'acceptation avec le code reçu. Un code faux est compté (renvoyé en Refus pour que le compteur soit enregistré).
 * `assistantId` : agent ou guichetier qui a assisté la personne, le cas échéant.
 */
export async function confirmerAcceptation(q: Executant, acteur: Acteur, d: { documentId: string; signataireId: string; code: string; assiste: boolean }) {
  const { d: doc, t } = await contexte(q, d.documentId, d.signataireId);
  const c = (await q.query<{ id: string; empreinte_code: string; tentatives: number }>(
    `SELECT id, empreinte_code, tentatives FROM code_usage_unique
      WHERE tiers_id = $1 AND objet = $2 AND objet_id = $3 AND utilise_le IS NULL AND expire_le > now()
      ORDER BY cree_le DESC LIMIT 1 FOR UPDATE`, [d.signataireId, OBJET, d.documentId])).rows[0];
  if (!c || c.tentatives >= 3) return new Refus(new ErreurMetier('CODE_EXPIRE', 'Code expiré ou épuisé : demandez un nouveau code', 401));
  const [sel, h] = c.empreinte_code.split('$') as [string, string];
  // L'empreinte du document est celle d'aujourd'hui : un document modifié depuis l'envoi invalide le code
  const ok = timingSafeEqual(Buffer.from(h), Buffer.from(hacher(d.code.trim(), doc.empreinte, sel)));
  await q.query('UPDATE code_usage_unique SET tentatives = tentatives + 1, utilise_le = CASE WHEN $2 THEN now() END WHERE id = $1', [c.id, ok]);
  if (!ok) return new Refus(new ErreurMetier('CODE_INCORRECT', `Code incorrect (${2 - c.tentatives} essai(s) restant(s))`, 401));

  const p = await q.query<{ id: string; horodatage: string }>(
    `INSERT INTO dossier_preuve (document_id, signataire_tiers_id, niveau, telephone, code_reference, empreinte_document, horodatage, appareil, assistant_id)
     VALUES ($1,$2,'CODE_USAGE_UNIQUE',$3,$4,$5,now(),$6,$7) RETURNING id, horodatage`,
    [d.documentId, d.signataireId, t.telephone, c.id, doc.empreinte, acteur.appareil?.slice(0, 200) ?? null, d.assiste ? acteur.utilisateurId : null]);
  const preuve = p.rows[0]!;
  await journaliser(q, { ...acteur.trace(), action: 'VALIDATION', objetType: 'dossier_preuve', objetId: preuve.id, apres: { document: d.documentId, signataire: d.signataireId, empreinte: doc.empreinte } });
  await publier(q, acteur, { type: 'DOCUMENT_ACCEPTE', objet: { type: 'document', id: d.documentId }, charge: { preuveId: preuve.id, signataireId: d.signataireId, typeDocument: doc.type_document }, cleIdempotence: `document:${d.documentId}:accepte:${d.signataireId}` });
  return { preuveId: preuve.id, horodatage: preuve.horodatage, empreinte: doc.empreinte };
}

/** DIG-RG-005 : signature manuscrite sur la fiche imprimée, numérisée et rattachée ; comptée comme exception. */
export async function enregistrerSignatureManuscrite(q: Executant, acteur: Acteur, d: { documentId: string; signataireId: string; scanDocumentId: string }) {
  const { d: doc } = await contexte(q, d.documentId, d.signataireId);
  const scan = await q.query(`SELECT 1 FROM document WHERE id = $1 AND origine = 'DEPOSE' AND supprime_le IS NULL`, [d.scanDocumentId]);
  exiger(scan.rowCount, 'SCAN_INTROUVABLE', 'La fiche signée numérisée doit d\'abord être déposée');
  const p = await q.query<{ id: string }>(
    `INSERT INTO dossier_preuve (document_id, signataire_tiers_id, niveau, code_reference, empreinte_document, horodatage, appareil, assistant_id)
     VALUES ($1,$2,'MANUSCRITE_NUMERISEE',$3,$4,now(),$5,$6) RETURNING id`,
    [d.documentId, d.signataireId, d.scanDocumentId, doc.empreinte, acteur.appareil?.slice(0, 200) ?? null, acteur.utilisateurId]);
  await journaliser(q, { ...acteur.trace(), action: 'VALIDATION', objetType: 'dossier_preuve', objetId: p.rows[0]!.id, apres: { exception: 'SIGNATURE_MANUSCRITE', scan: d.scanDocumentId } });
  return { preuveId: p.rows[0]!.id };
}

export async function preuvesDuDocument(q: Executant, documentId: string) {
  return (await q.query(
    `SELECT p.id, p.niveau, p.horodatage, p.empreinte_document, p.appareil, t.nom, t.prenoms, u.identifiant AS assistant
       FROM dossier_preuve p JOIN tiers t ON t.id = p.signataire_tiers_id LEFT JOIN utilisateur u ON u.id = p.assistant_id
      WHERE p.document_id = $1 ORDER BY p.horodatage`, [documentId])).rows;
}

// ---------------------------------------------------------------- vérification du téléphone d'un tiers (REF-RG-005)

const OBJET_TELEPHONE = 'VERIFICATION_TELEPHONE';

/** Envoie un code au numéro de la fiche ; le client le communique à la personne qui l'assiste (agent, gestionnaire). */
export async function demanderVerificationTelephone(q: Executant, acteur: Acteur, tiersId: string, options: { connexion?: boolean } = {}) {
  const t = (await q.query<{ telephone: string | null; telephone_verifie: boolean | null }>('SELECT telephone, telephone_verifie FROM tiers WHERE id = $1 AND supprime_le IS NULL', [tiersId])).rows[0];
  if (!t) throw nonTrouve('Tiers');
  exiger(t.telephone, 'TELEPHONE_ABSENT', 'Aucun numéro de téléphone sur la fiche');
  // Un numéro vérifié reçoit encore un code pour se connecter à la souscription en ligne (possession du téléphone)
  exiger(!t.telephone_verifie || options.connexion, 'DEJA_VERIFIE', 'Ce numéro est déjà vérifié', 409);
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const sel = randomBytes(8).toString('hex');
  await q.query(`UPDATE code_usage_unique SET expire_le = now() WHERE tiers_id = $1 AND objet = $2 AND utilise_le IS NULL`, [tiersId, OBJET_TELEPHONE]);
  await q.query(
    `INSERT INTO code_usage_unique (tiers_id, utilisateur_id, objet, objet_id, empreinte_code, telephone, expire_le) VALUES ($1,$2,$3,$1,$4,$5, now() + interval '10 minutes')`,
    [tiersId, acteur.utilisateurId, OBJET_TELEPHONE, `${sel}$${hacher(code, t.telephone!, sel)}`, t.telephone]);
  await notifier(q, { tiersId, code: 'VERIFICATION_TELEPHONE', canal: 'SMS', adresse: t.telephone!, variables: { code } });
  return { envoyeA: `${t.telephone!.slice(0, 4)}•••${t.telephone!.slice(-2)}` };
}

export async function confirmerVerificationTelephone(q: Executant, acteur: Acteur, tiersId: string, code: string) {
  const c = (await q.query<{ id: string; empreinte_code: string; tentatives: number; telephone: string }>(
    `SELECT id, empreinte_code, tentatives, telephone FROM code_usage_unique WHERE tiers_id = $1 AND objet = $2 AND utilise_le IS NULL AND expire_le > now()
      ORDER BY cree_le DESC LIMIT 1 FOR UPDATE`, [tiersId, OBJET_TELEPHONE])).rows[0];
  if (!c || c.tentatives >= 3) return new Refus(new ErreurMetier('CODE_EXPIRE', 'Code expiré ou épuisé : demandez un nouveau code', 401));
  const [sel, h] = c.empreinte_code.split('$') as [string, string];
  const ok = timingSafeEqual(Buffer.from(h), Buffer.from(hacher(code.trim(), c.telephone, sel)));
  await q.query('UPDATE code_usage_unique SET tentatives = tentatives + 1, utilise_le = CASE WHEN $2 THEN now() END WHERE id = $1', [c.id, ok]);
  if (!ok) return new Refus(new ErreurMetier('CODE_INCORRECT', `Code incorrect (${2 - c.tentatives} essai(s) restant(s))`, 401));
  // Le numéro vérifié est celui auquel le code a été envoyé
  await q.query('UPDATE tiers SET telephone_verifie = true WHERE id = $1 AND telephone = $2', [tiersId, c.telephone]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'tiers', objetId: tiersId, apres: { telephoneVerifie: c.telephone } });
  return { verifie: true };
}
