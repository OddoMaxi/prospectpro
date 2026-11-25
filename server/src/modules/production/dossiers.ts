/**
 * Dossiers de souscription (CDC § 8.3, 8.4 ; PROD-RG-001, 003, 006, 009 ; COM-RG-062, 063 ; DD dossier_souscription).
 *
 * Étapes 1 à 6 : client, produit et formule, assurés, bénéficiaires, pièces, tarification, saisies dans un dossier
 * reprenable (PROPOSITION) qui ne reçoit ni numéro de police ni écriture. Étape 7 : récapitulatif accepté par code
 * à usage unique (ou signature manuscrite numérisée à défaut de téléphone). Étape 8 : émission (emission.ts).
 * Toute modification après l'acceptation l'annule : le client accepte toujours ce qui sera émis.
 */
import { agentDe, relationExistante } from '../commercial/prospects.js';
import { codeActif } from '../commercial/prescripteurs.js';
import { z } from 'zod';
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger, interdit, nonTrouve } from '../../noyau/erreurs.js';
import { ajouterAnnees, ajouterJours, age, aujourdhui, dateValide } from '../../noyau/dates.js';
import { journaliser } from '../../moteurs/audit.js';
import { entier } from '../../moteurs/parametres.js';
import { attribuer } from '../../moteurs/numerotation.js';
import { publier } from '../../moteurs/evenements.js';
import { genererDocument } from '../../moteurs/documents.js';
import { conditionsGarantieDeces, controlerQuotites, formuleEnVigueur, tarifer, type Tarification } from '../catalogue/service.js';
import { confirmerAcceptation, demanderAcceptation } from '../documents/acceptation.js';
import { Refus } from '../auth/service.js';

export const schemaDonnees = z.object({
  dateEffet: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  assures: z.array(z.object({
    tiersId: z.uuid(), qualite: z.enum(['ASSURE_PRINCIPAL', 'CONJOINT', 'ENFANT']),
    categorieEnfant: z.enum(['A_CHARGE', 'ETUDIANT', 'HANDICAPE']).optional(), parentTiersId: z.uuid().optional(),
  })).min(1),
  beneficiaires: z.object({
    mode: z.enum(['NOMINATIVE', 'CLAUSE_TYPE']),
    liste: z.array(z.object({ tiersId: z.uuid(), quotite: z.number().positive().max(100), rang: z.number().int().positive().default(1) })).default([]),
  }).optional(),
  /** Preuves du consentement de chaque assuré autre que le souscripteur à la garantie décès (art. 193, REF-RG-034). */
  consentementsDeces: z.array(z.object({ tiersId: z.uuid(), preuveId: z.uuid(), autorisationRepresentant: z.boolean().optional() })).default([]),
  pieces: z.array(z.object({ tiersId: z.uuid(), type: z.string(), documentId: z.uuid() })).default([]),
});
export type DonneesDossier = z.infer<typeof schemaDonnees>;

export interface Dossier {
  id: string; numero_dossier: string; canal: 'BUREAU' | 'JUNIOR' | 'EN_LIGNE' | 'COLLECTIF'; souscripteur_id: string; produit_id: string; formule_id: string;
  bureau_id: string; prepare_par_id: string; etape_courante: number; donnees: DonneesDossier; prime_nette: number | null; accessoires: number | null;
  taxes: number | null; prime_totale: number | null; acceptation_preuve_id: string | null; statut: string; expire_le: string; motif_rejet: string | null; police_id: string | null;
  code_prescripteur_id: string | null;
}

export async function lireDossier(q: Executant, id: string, verrou = false): Promise<Dossier> {
  const r = await q.query<Dossier>(`SELECT * FROM dossier_souscription WHERE id = $1 AND supprime_le IS NULL${verrou ? ' FOR UPDATE' : ''}`, [id]);
  if (!r.rows[0]) throw nonTrouve('Dossier de souscription');
  const d = r.rows[0];
  return { ...d, prime_nette: d.prime_nette === null ? null : Number(d.prime_nette), accessoires: d.accessoires === null ? null : Number(d.accessoires),
    taxes: d.taxes === null ? null : Number(d.taxes), prime_totale: d.prime_totale === null ? null : Number(d.prime_totale) };
}

/** Intervenant qui prépare le dossier : l'utilisateur connecté doit l'être (ou agir pour la cellule). */
async function intervenantDe(q: Executant, utilisateurId: string) {
  return (await q.query<{ id: string; role: string; rattachement_id: string | null; statut: string; controles_conformite_le: string | null }>(
    `SELECT i.id, i.role, i.rattachement_id, i.statut, i.controles_conformite_le FROM utilisateur u JOIN intervenant i ON i.tiers_id = u.tiers_id
      WHERE u.id = $1 AND i.statut = 'ACTIF' AND i.supprime_le IS NULL ORDER BY i.role = 'AGENT_GENERAL' DESC LIMIT 1`, [utilisateurId])).rows[0];
}

/** Étapes 1 et 2 : ouverture du dossier pour un client existant, sur un produit et une formule commercialisés. */
export async function ouvrirDossier(q: Executant, acteur: Acteur, d: { souscripteurId: string; formuleId: string; bureauId: string; donnees?: unknown; codePrescripteur?: string }) {
  const i = await intervenantDe(q, acteur.utilisateurId!);
  if (!i) throw interdit('Seul un intervenant commercial actif prépare une souscription');
  exiger(i.role !== 'PRESCRIPTEUR', 'INTERDIT', 'Un prescripteur ne prépare aucune souscription (COM-RG-064)', 403);
  if (i.role === 'JUNIOR') exiger(i.controles_conformite_le, 'CONTROLES_JUNIOR', 'Préparation ouverte après validation de vos contrôles de conformité (COM-RG-062)', 403);
  const f = (await q.query<{ produit_id: string }>('SELECT produit_id FROM formule WHERE id = $1', [d.formuleId])).rows[0];
  if (!f) throw nonTrouve('Formule');
  // Le bureau est celui de l'agent général (ou de l'agent dont relève le junior ou le collaborateur)
  const agent = i.role === 'AGENT_GENERAL' ? i.id : i.rattachement_id;
  const gere = await q.query(`SELECT 1 FROM bureau_gestionnaire WHERE bureau_id = $1 AND intervenant_id = $2 AND date_fin IS NULL AND supprime_le IS NULL`, [d.bureauId, agent]);
  exiger(gere.rowCount, 'BUREAU_INVALIDE', 'Ce bureau n\'est pas géré par votre agent général');
  const s = await q.query('SELECT 1 FROM tiers WHERE id = $1 AND supprime_le IS NULL', [d.souscripteurId]);
  exiger(s.rowCount, 'CLIENT_INCONNU', 'Client introuvable : créez sa fiche (recherche de doublons) avant la souscription');
  // COM-RG-071 : un client actif ou un prospect sous exclusivité d'un autre réseau garde son titulaire
  const relation = await relationExistante(q, d.souscripteurId);
  if (relation && (await agentDe(q, relation.intervenantId)) !== agent) {
    throw new ErreurMetier('RELATION_EXISTANTE', relation.type === 'TITULAIRE'
      ? 'Ce client est déjà en portefeuille chez un autre intervenant : il garde son titulaire (COM-RG-071)'
      : 'Ce prospect est sous l\'exclusivité d\'un autre intervenant (COM-RG-071)', 409);
  }
  // COM-RG-083 : code prescripteur saisi à la souscription (le prescripteur est intervenant rémunéré)
  const code = d.codePrescripteur?.trim() ? await codeActif(q, d.codePrescripteur) : null;
  const id = crypto.randomUUID();
  const numero = await attribuer(q, acteur, { type: 'DOSSIER_SOUSCRIPTION', annee: Number(aujourdhui().slice(0, 4)) }, { type: 'dossier_souscription', id });
  const expire = ajouterJours(aujourdhui(), await entier(q, 'PROD_EXPIRATION_PROPOSITION_JOURS'));
  const donnees = d.donnees ? schemaDonnees.parse(d.donnees) : { dateEffet: aujourdhui(), assures: [{ tiersId: d.souscripteurId, qualite: 'ASSURE_PRINCIPAL' as const }], consentementsDeces: [], pieces: [] };
  await q.query(
    `INSERT INTO dossier_souscription (id, numero_dossier, canal, souscripteur_id, produit_id, formule_id, bureau_id, prepare_par_id, etape_courante, donnees, statut, expire_le, code_prescripteur_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,2,$9,'BROUILLON',$10,$11)`,
    [id, numero, i.role === 'JUNIOR' ? 'JUNIOR' : 'BUREAU', d.souscripteurId, f.produit_id, d.formuleId, d.bureauId, i.id, JSON.stringify(donnees), expire, code?.id ?? null]);
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'dossier_souscription', objetId: id, apres: { numero, ...d } });
  return { id, numero, expireLe: expire };
}

/** Étapes 3 à 5 : enregistrement des données ; toute modification annule l'acceptation et la tarification. */
export async function enregistrerDonnees(q: Executant, acteur: Acteur, dossierId: string, brut: unknown, etape: number) {
  const d = await lireDossier(q, dossierId, true);
  exiger(['BROUILLON', 'A_VALIDER'].includes(d.statut), 'DOSSIER_CLOS', 'Dossier émis, rejeté ou expiré');
  const donnees = schemaDonnees.parse(brut);
  await q.query(
    `UPDATE dossier_souscription SET donnees = $2, etape_courante = GREATEST(etape_courante, $3), acceptation_preuve_id = NULL,
            prime_nette = NULL, accessoires = NULL, taxes = NULL, prime_totale = NULL WHERE id = $1`, [dossierId, JSON.stringify(donnees), etape]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'dossier_souscription', objetId: dossierId, apres: { etape } });
}

/** Contrôles des étapes 1 à 5 (liste des anomalies, vide si le dossier est complet). */
export async function controlerDossier(q: Executant, d: Dossier): Promise<string[]> {
  const anomalies: string[] = [];
  const x = d.donnees;
  if (!dateValide(x.dateEffet) || x.dateEffet < aujourdhui()) anomalies.push('La date d\'effet est au plus tôt la date d\'émission (PROD-RG-003)');
  const formule = await formuleEnVigueur(q, d.produit_id, (await q.query<{ code: string }>('SELECT code FROM formule WHERE id = $1', [d.formule_id])).rows[0]!.code, x.dateEffet);
  if (!formule || formule.id !== d.formule_id) anomalies.push('Formule non commercialisée à la date d\'effet (nouvelle version ou produit fermé)');
  const produit = (await q.query<{ age_min: number; age_max: number; documents_exiges: string[] }>('SELECT age_min, age_max, documents_exiges FROM produit WHERE id = $1', [d.produit_id])).rows[0]!;
  const principaux = x.assures.filter(a => a.qualite === 'ASSURE_PRINCIPAL');
  if (principaux.length !== 1) anomalies.push('Un assuré principal et un seul');
  const ids = x.assures.map(a => a.tiersId);
  if (new Set(ids).size !== ids.length) anomalies.push('Une même personne figure deux fois parmi les assurés');
  const personnes = new Map((await q.query<{ id: string; nature: string; date_naissance: string | null; telephone_verifie: boolean | null }>(
    'SELECT id, nature, date_naissance::text, telephone_verifie FROM tiers WHERE id = ANY($1)', [ids])).rows.map(p => [p.id, p]));
  for (const a of x.assures) {
    const p = personnes.get(a.tiersId);
    if (!p) { anomalies.push('Assuré introuvable'); continue; }
    if (p.nature !== 'PHYSIQUE') anomalies.push('Un assuré est une personne physique');
    if (!p.date_naissance) anomalies.push('Date de naissance obligatoire pour chaque assuré');
    if (a.qualite === 'ASSURE_PRINCIPAL' && p.date_naissance) {
      const ag = age(p.date_naissance, x.dateEffet);
      if (ag < produit.age_min || ag > produit.age_max) anomalies.push(`L'assuré principal a ${ag} ans : le produit est ouvert de ${produit.age_min} à ${produit.age_max} ans`);
    }
    if (a.qualite === 'ENFANT' && a.parentTiersId && !x.assures.some(c => c.qualite === 'CONJOINT' && c.tiersId === a.parentTiersId)) {
      anomalies.push('Le parent d\'un enfant est un conjoint déclaré au contrat (REF-RG-008)');
    }
  }
  // Pièces exigées par le produit, pour chaque assuré (étape 5)
  for (const type of produit.documents_exiges ?? []) {
    for (const a of x.assures) if (!x.pieces.some(pc => pc.tiersId === a.tiersId && pc.type === type)) anomalies.push(`Pièce « ${type} » manquante pour un assuré`);
  }
  // Bénéficiaires du capital décès (étape 4) : obligatoires si la formule comporte une garantie décès
  const deces = await q.query<{ age_min_deces: number | null; capital: number | null }>(`SELECT age_min_deces, capital FROM garantie WHERE formule_id = $1 AND type = 'DECES' AND supprime_le IS NULL`, [d.formule_id]);
  if (deces.rowCount) {
    if (!x.beneficiaires) anomalies.push('Désigner les bénéficiaires du capital décès ou choisir la clause type (étape 4)');
    else if (x.beneficiaires.mode === 'NOMINATIVE') {
      try { controlerQuotites(x.beneficiaires.liste.map(b => b.quotite)); } catch (e) { anomalies.push((e as Error).message); }
    }
  }
  return anomalies;
}

/** Étape 6 : tarification à la date d'effet (REF-RG-030), enregistrée sur le dossier. */
export async function tarifierDossier(q: Executant, acteur: Acteur, dossierId: string): Promise<Tarification> {
  const d = await lireDossier(q, dossierId, true);
  const anomalies = await controlerDossier(q, d);
  if (anomalies.length) throw new ErreurMetier('DOSSIER_INCOMPLET', `Dossier incomplet : ${anomalies.join(' ; ')}`, 422, { anomalies });
  const naissances = new Map((await q.query<{ id: string; date_naissance: string }>('SELECT id, date_naissance::text FROM tiers WHERE id = ANY($1)', [d.donnees.assures.map(a => a.tiersId)])).rows.map(r => [r.id, r.date_naissance]));
  const t = await tarifer(q, d.formule_id, d.donnees.assures.map(a => ({ qualite: a.qualite, dateNaissance: naissances.get(a.tiersId)! })), d.donnees.dateEffet);
  await q.query(`UPDATE dossier_souscription SET prime_nette = $2, accessoires = $3, taxes = $4, prime_totale = $5, etape_courante = GREATEST(etape_courante, 6), acceptation_preuve_id = NULL WHERE id = $1`,
    [dossierId, t.primeNette, t.accessoires, t.taxes.reduce((s, x) => s + x.montant, 0), t.primeTotale]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'dossier_souscription', objetId: dossierId, apres: { etape: 6, primeTotale: t.primeTotale } });
  return t;
}

/** Variables communes au récapitulatif et au bulletin : souscripteur, assurés, garanties, bénéficiaires, prime détaillée. */
export async function variablesContrat(q: Executant, d: Dossier, numeroPolice: string): Promise<Record<string, unknown>> {
  const x = d.donnees;
  const tiers = new Map((await q.query<{ id: string; nom: string; prenoms: string | null; date_naissance: string | null; code_tiers: string }>(
    'SELECT id, nom, prenoms, date_naissance::text, code_tiers FROM tiers WHERE id = ANY($1)',
    [[d.souscripteur_id, ...x.assures.map(a => a.tiersId), ...(x.beneficiaires?.liste ?? []).map(b => b.tiersId)]])).rows.map(t => [t.id, t]));
  const nom = (id: string) => { const t = tiers.get(id); return t ? `${t.prenoms ?? ''} ${t.nom}`.trim() : ''; };
  const p = (await q.query<{ libelle: string; formule: string }>('SELECT p.libelle, f.libelle AS formule FROM produit p JOIN formule f ON f.id = $2 WHERE p.id = $1', [d.produit_id, d.formule_id])).rows[0]!;
  const garanties = (await q.query<{ libelle: string; plafond: number | null; taux_prise_en_charge: string; carence_jours: number; capital: number | null }>(
    'SELECT libelle, plafond, taux_prise_en_charge, carence_jours, capital FROM garantie WHERE formule_id = $1 AND supprime_le IS NULL ORDER BY code', [d.formule_id])).rows;
  const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${Number(n).toLocaleString('fr-FR').replace(/ /g, ' ')} GNF`);
  const qualites: Record<string, string> = { ASSURE_PRINCIPAL: 'Assuré principal', CONJOINT: 'Conjoint', ENFANT: 'Enfant' };
  return {
    police: numeroPolice, dossier: d.numero_dossier, souscripteur: nom(d.souscripteur_id), produit: p.libelle, formule: p.formule,
    date_effet: x.dateEffet.split('-').reverse().join('/'), date_fin: ajouterJours(ajouterAnnees(x.dateEffet, 1), -1).split('-').reverse().join('/'),
    assures: x.assures.map(a => ({ nom: nom(a.tiersId), qualite: qualites[a.qualite], naissance: (tiers.get(a.tiersId)?.date_naissance ?? '').split('-').reverse().join('/') })),
    garanties: garanties.map(g => ({ libelle: g.libelle, plafond: fmt(g.capital ?? g.plafond), taux: `${Math.round(Number(g.taux_prise_en_charge) * 100)} %`, carence: `${g.carence_jours} jours` })),
    beneficiaires: x.beneficiaires?.mode === 'NOMINATIVE' ? x.beneficiaires.liste.map(b => ({ nom: nom(b.tiersId), quotite: `${b.quotite} %` }))
      : [{ nom: 'Clause type du produit (conjoints, à défaut enfants, à défaut héritiers)', quotite: '100 %' }],
    prime_nette: fmt(d.prime_nette), accessoires: fmt(d.accessoires), taxes: fmt(d.taxes), prime_totale: fmt(d.prime_totale),
  };
}

/** Étape 7 : récapitulatif présenté au client et code d'acceptation envoyé sur son téléphone. */
export async function presenterRecapitulatif(q: Executant, acteur: Acteur, dossierId: string) {
  const d = await lireDossier(q, dossierId, true);
  exiger(d.prime_totale !== null, 'TARIF_ABSENT', 'Tarifer le dossier avant de présenter le récapitulatif (étape 6)');
  const doc = await genererDocument(q, acteur, {
    modeleCode: 'RECAPITULATIF_SOUSCRIPTION', typeDocument: 'RECAPITULATIF_SOUSCRIPTION', objet: { type: 'dossier_souscription', id: dossierId },
    variables: await variablesContrat(q, d, 'à attribuer à l\'émission'),
  });
  await q.query('UPDATE dossier_souscription SET etape_courante = GREATEST(etape_courante, 7) WHERE id = $1', [dossierId]);
  const envoi = await demanderAcceptation(q, acteur, doc.id, d.souscripteur_id);
  return { documentId: doc.id, ...envoi };
}

/** Étape 7 : le client communique le code reçu ; la preuve est rattachée au dossier, puis à la police (CA-PROD-23). */
export async function accepterRecapitulatif(q: Executant, acteur: Acteur, dossierId: string, documentId: string, code: string) {
  const d = await lireDossier(q, dossierId, true);
  const doc = await q.query('SELECT 1 FROM document WHERE id = $1 AND objet_type = $2 AND objet_id = $3', [documentId, 'dossier_souscription', dossierId]);
  exiger(doc.rowCount, 'DOCUMENT_INVALIDE', 'Ce récapitulatif n\'appartient pas au dossier');
  const r = await confirmerAcceptation(q, acteur, { documentId, signataireId: d.souscripteur_id, code, assiste: true });
  if (r instanceof Refus) return r;
  await q.query('UPDATE dossier_souscription SET acceptation_preuve_id = $2 WHERE id = $1', [dossierId, r.preuveId]);
  return r;
}

/** Garanties décès : conditions par assuré (accordée ou motif de non-octroi). */
export async function etatGarantiesDeces(q: Executant, d: Dossier) {
  const naissances = new Map((await q.query<{ id: string; date_naissance: string }>('SELECT id, date_naissance::text FROM tiers WHERE id = ANY($1)', [d.donnees.assures.map(a => a.tiersId)])).rows.map(r => [r.id, r.date_naissance]));
  const res = new Map<string, string[]>();
  for (const a of d.donnees.assures) {
    const c = d.donnees.consentementsDeces.find(x => x.tiersId === a.tiersId);
    res.set(a.tiersId, await conditionsGarantieDeces(q, {
      dateNaissance: naissances.get(a.tiersId)!, date: d.donnees.dateEffet, estSouscripteur: a.tiersId === d.souscripteur_id,
      consentementAssure: !!c, autorisationRepresentant: !!c?.autorisationRepresentant, consentementMineur: !!c,
    }));
  }
  return res;
}

/** COM-RG-063 : le junior soumet son dossier complet et accepté à son agent général. */
export async function soumettreDossier(q: Executant, acteur: Acteur, dossierId: string) {
  const d = await lireDossier(q, dossierId, true);
  exiger(d.statut === 'BROUILLON' && d.canal === 'JUNIOR', 'STATUT_INVALIDE', 'Seul un dossier de junior en cours se soumet à l\'agent général');
  exiger(d.acceptation_preuve_id, 'ACCEPTATION_REQUISE', 'Le client doit avoir accepté le récapitulatif (étape 7)');
  await q.query(`UPDATE dossier_souscription SET statut = 'A_VALIDER' WHERE id = $1`, [dossierId]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'dossier_souscription', objetId: dossierId, apres: { statut: 'A_VALIDER' } });
  await publier(q, acteur, { type: 'DOSSIER_SOUSCRIPTION_A_VALIDER', objet: { type: 'dossier_souscription', id: dossierId }, charge: { numero: d.numero_dossier }, cleIdempotence: `dossier:${dossierId}:a_valider` });
}

export async function rejeterDossier(q: Executant, acteur: Acteur, dossierId: string, motif: string) {
  exiger(motif?.trim(), 'MOTIF_REQUIS', 'Le rejet est motivé');
  const d = await lireDossier(q, dossierId, true);
  exiger(['BROUILLON', 'A_VALIDER'].includes(d.statut), 'STATUT_INVALIDE', 'Dossier déjà clos');
  await q.query(`UPDATE dossier_souscription SET statut = 'REJETE', motif_rejet = $2 WHERE id = $1`, [dossierId, motif]);
  await journaliser(q, { ...acteur.trace(), action: 'REJET', objetType: 'dossier_souscription', objetId: dossierId, apres: { motif } });
}

/** PROD-RG-001, COM-RG-063 : expiration des propositions non finalisées (traitement quotidien). */
export async function expirerDossiers(q: Executant, date = aujourdhui()) {
  const r = await q.query(`UPDATE dossier_souscription SET statut = 'EXPIRE' WHERE statut IN ('BROUILLON', 'A_VALIDER') AND expire_le < $1 RETURNING numero_dossier`, [date]);
  return r.rows.map(x => x.numero_dossier as string);
}

export async function listerDossiers(q: Executant, f: { statut?: string; bureaux: string[] | null; prepareParId?: string }) {
  return (await q.query(
    `SELECT d.id, d.numero_dossier, d.canal, d.statut, d.etape_courante, d.prime_totale, d.expire_le, d.cree_le, d.motif_rejet, b.code AS bureau,
            trim(t.nom || ' ' || COALESCE(t.prenoms, '')) AS souscripteur, p.libelle AS produit, f.libelle AS formule, trim(pt.nom || ' ' || COALESCE(pt.prenoms, '')) AS prepare_par,
            po.numero AS police
       FROM dossier_souscription d JOIN tiers t ON t.id = d.souscripteur_id JOIN produit p ON p.id = d.produit_id JOIN formule f ON f.id = d.formule_id
       JOIN bureau b ON b.id = d.bureau_id JOIN intervenant pi ON pi.id = d.prepare_par_id JOIN tiers pt ON pt.id = pi.tiers_id LEFT JOIN police po ON po.id = d.police_id
      WHERE d.supprime_le IS NULL AND ($1::text IS NULL OR d.statut = $1) AND ($2::text[] IS NULL OR b.code = ANY($2)) AND ($3::uuid IS NULL OR d.prepare_par_id = $3)
      ORDER BY d.cree_le DESC LIMIT 300`, [f.statut ?? null, f.bureaux, f.prepareParId ?? null])).rows;
}
