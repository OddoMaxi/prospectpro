/**
 * Prestataires agréés et professionnels de santé (CDC § 9.4, 9.4.1, 9.11 ; SAN-RG-001 à 010, 060 ; CA-SAN-08, 10, 11, 13).
 *
 * - Un prestataire (personne morale) n'intervient qu'AGRÉÉ : convention signée, coordonnées de paiement vérifiées,
 *   tarifs conventionnés saisis, administrateur désigné. L'agrément est validé (médecin-conseil puis DAF) ; il active
 *   le compte de l'administrateur, créé par la Compagnie. Suspension ou fin de convention : tous les comptes de la
 *   structure sont désactivés, sessions fermées.
 * - L'administrateur gère seul les professionnels de sa structure : un compte nominatif par professionnel, profil
 *   fixé par la Compagnie selon la profession et le type de structure (SAN-RG-005) ; il ne peut ni modifier ni élargir
 *   les droits d'un profil. Un compte n'est activable qu'après l'agrément individuel du professionnel par la
 *   Compagnie (SAN-RG-006) ; la fin de cet agrément désactive ses comptes dans toutes les structures.
 * - Tarifs conventionnés par prestataire, datés (SAN-RG-003) ; options de la structure (SAN-RG-060).
 */
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger, interdit, nonTrouve } from '../../noyau/erreurs.js';
import { aujourdhui, dateValide } from '../../noyau/dates.js';
import { journaliser } from '../../moteurs/audit.js';
import { prochaineValeur } from '../../moteurs/numerotation.js';
import { notifier } from '../../moteurs/notifications.js';
import { enregistrerOperation, soumettre } from '../../moteurs/validation.js';
import { attribuerProfil, changerStatut, creerUtilisateur } from '../habilitations/service.js';
import { attribuerRole } from '../referentiels/roles.js';
import { creerTiers } from '../referentiels/tiers.js';

export const OPERATION_AGREMENT_PRESTATAIRE = 'AGREMENT_PRESTATAIRE';
export const OPERATION_AGREMENT_PROFESSIONNEL = 'AGREMENT_PROFESSIONNEL';
export const OPTIONS = ['GARDE', 'H24', 'URGENCES', 'TELECONSULTATION', 'HOSPITALISATION'] as const;
export type Profession = 'MEDECIN' | 'CHIRURGIEN_DENTISTE' | 'SAGE_FEMME' | 'BIOLOGISTE' | 'RADIOLOGUE' | 'PHARMACIEN' | 'OPTICIEN' | 'KINESITHERAPEUTE' | 'AUTRE';
/** Profil porté par chaque profession (§ 9.4.1). */
export const PROFIL_DE: Record<Profession, string> = {
  MEDECIN: 'MEDECIN_PRESCRIPTEUR', CHIRURGIEN_DENTISTE: 'MEDECIN_PRESCRIPTEUR', SAGE_FEMME: 'MEDECIN_PRESCRIPTEUR', BIOLOGISTE: 'BIOLOGISTE', RADIOLOGUE: 'RADIOLOGUE',
  PHARMACIEN: 'PHARMACIEN', OPTICIEN: 'EXECUTANT', KINESITHERAPEUTE: 'EXECUTANT', AUTRE: 'EXECUTANT',
};
export const LIBELLES_PROFESSION: Record<Profession, string> = {
  MEDECIN: 'médecin', CHIRURGIEN_DENTISTE: 'chirurgien-dentiste', SAGE_FEMME: 'sage-femme', BIOLOGISTE: 'biologiste', RADIOLOGUE: 'radiologue', PHARMACIEN: 'pharmacien',
  OPTICIEN: 'opticien', KINESITHERAPEUTE: 'kinésithérapeute', AUTRE: 'professionnel de santé',
};

interface Prestataire { id: string; code: string; tiers_id: string; type: string; statut: string; convention_document_id: string | null; administrateur_id: string | null; nom: string; professions: Profession[] }
async function lirePrestataire(q: Executant, id: string, verrou = false): Promise<Prestataire> {
  const r = (await q.query<Prestataire>(
    `SELECT p.id, p.code, p.tiers_id, p.type, p.statut, p.convention_document_id, p.administrateur_id, t.nom, tp.professions
       FROM prestataire p JOIN tiers t ON t.id = p.tiers_id JOIN type_prestataire tp ON tp.code = p.type WHERE p.id = $1 AND p.supprime_le IS NULL${verrou ? ' FOR UPDATE OF p' : ''}`, [id])).rows[0];
  if (!r) throw nonTrouve('Prestataire');
  return r;
}

// ---------------------------------------------------------------- types (SAN-RG-001, 005)

export async function typesPrestataire(q: Executant) {
  return (await q.query('SELECT code, libelle, professions, options, actif FROM type_prestataire WHERE supprime_le IS NULL ORDER BY libelle')).rows;
}

// ---------------------------------------------------------------- prestataire (SAN-RG-001 à 003, 060)

export async function creerPrestataire(q: Executant, acteur: Acteur, d: { tiersId: string; type: string; latitude?: number; longitude?: number; horaires?: Record<string, string>; telephoneModeDegrade?: string }) {
  const t = (await q.query<{ nature: string }>('SELECT nature FROM tiers WHERE id = $1 AND supprime_le IS NULL', [d.tiersId])).rows[0];
  if (!t) throw nonTrouve('Fiche tiers');
  exiger(t.nature === 'MORALE', 'NATURE_INVALIDE', 'Un prestataire est une structure (personne morale)');
  const type = (await q.query<{ options: string[] }>('SELECT options FROM type_prestataire WHERE code = $1 AND actif AND supprime_le IS NULL', [d.type])).rows[0];
  exiger(type, 'TYPE_INCONNU', 'Type de prestataire inconnu');
  const id = crypto.randomUUID();
  const { valeur } = await prochaineValeur(q, 'PRESTATAIRE', 'GLOBAL', 99_999);
  const code = `PS${String(valeur).padStart(5, '0')}`;
  await q.query(
    `INSERT INTO prestataire (id, code, tiers_id, type, statut, latitude, longitude, horaires, telephone_mode_degrade) VALUES ($1,$2,$3,$4,'EN_AGREMENT',$5,$6,$7,$8)`,
    [id, code, d.tiersId, d.type, d.latitude ?? null, d.longitude ?? null, d.horaires ? JSON.stringify(d.horaires) : null, d.telephoneModeDegrade ?? null])
    .catch(e => { if (e.code === '23505') throw new ErreurMetier('PRESTATAIRE_EXISTANT', 'Cette structure est déjà enregistrée comme prestataire', 409); throw e; });
  for (const o of type!.options) await q.query('INSERT INTO prestataire_option (prestataire_id, option, actif) VALUES ($1,$2,true)', [id, o]);
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'prestataire', objetId: id, apres: { code, ...d } });
  return { id, code };
}

export async function modifierPrestataire(q: Executant, acteur: Acteur, id: string, d: { conventionDocumentId?: string; latitude?: number | null; longitude?: number | null; horaires?: Record<string, string> | null; telephoneModeDegrade?: string | null }) {
  const p = await lirePrestataire(q, id, true);
  if (d.conventionDocumentId) {
    const doc = await q.query('SELECT 1 FROM document WHERE id = $1 AND supprime_le IS NULL', [d.conventionDocumentId]);
    exiger(doc.rowCount, 'DOCUMENT_INCONNU', 'Convention introuvable');
  }
  await q.query(`UPDATE prestataire SET convention_document_id = COALESCE($2, convention_document_id), latitude = CASE WHEN $3 THEN $4 ELSE latitude END,
                   longitude = CASE WHEN $3 THEN $5 ELSE longitude END, horaires = CASE WHEN $6 THEN $7 ELSE horaires END,
                   telephone_mode_degrade = CASE WHEN $8 THEN $9 ELSE telephone_mode_degrade END WHERE id = $1`,
    [id, d.conventionDocumentId ?? null, d.latitude !== undefined, d.latitude ?? null, d.longitude ?? null, d.horaires !== undefined, d.horaires ? JSON.stringify(d.horaires) : null,
      d.telephoneModeDegrade !== undefined, d.telephoneModeDegrade ?? null]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'prestataire', objetId: id, apres: { ...d, code: p.code } });
}

/** SAN-RG-060 : options de la structure (garde prévue mais désactivée par défaut, calendrier des gardes). */
export async function definirOption(q: Executant, acteur: Acteur, id: string, d: { option: typeof OPTIONS[number]; actif: boolean; calendrier?: unknown }) {
  await lirePrestataire(q, id);
  exiger(OPTIONS.includes(d.option), 'OPTION_INCONNUE', 'Option inconnue');
  await q.query(`INSERT INTO prestataire_option (prestataire_id, option, actif, calendrier) VALUES ($1,$2,$3,$4)
                 ON CONFLICT (prestataire_id, option) DO UPDATE SET actif = EXCLUDED.actif, calendrier = COALESCE(EXCLUDED.calendrier, prestataire_option.calendrier)`,
    [id, d.option, d.actif, d.calendrier === undefined ? null : JSON.stringify(d.calendrier)]);
  await journaliser(q, { ...acteur.trace(), action: 'PARAMETRAGE', objetType: 'prestataire', objetId: id, apres: d });
}

// ---------------------------------------------------------------- tarifs conventionnés (SAN-RG-003)

export type ObjetTarif = { acteCode: string } | { medicamentCode: string } | { forfaitCode: string };
async function resoudreObjet(q: Executant, o: ObjetTarif) {
  if ('acteCode' in o) {
    const a = await q.query('SELECT 1 FROM nomenclature_acte WHERE code = $1 AND supprime_le IS NULL', [o.acteCode]);
    exiger(a.rowCount, 'ACTE_INCONNU', `Acte ${o.acteCode} absent de la nomenclature`);
    return { acte: o.acteCode, medicament: null as string | null, forfait: null as string | null };
  }
  if ('medicamentCode' in o) {
    const m = (await q.query<{ id: string }>('SELECT id FROM medicament WHERE code = $1 AND supprime_le IS NULL', [o.medicamentCode])).rows[0];
    exiger(m, 'MEDICAMENT_INCONNU', `Médicament ${o.medicamentCode} absent de la liste`);
    return { acte: null, medicament: m!.id, forfait: null };
  }
  exiger(/^[A-Z0-9_-]{2,20}$/.test(o.forfaitCode), 'FORFAIT_INVALIDE', 'Code de forfait invalide');
  return { acte: null, medicament: null, forfait: o.forfaitCode };
}

export async function ajouterTarif(q: Executant, acteur: Acteur, prestataireId: string, d: ObjetTarif & { tarif: number; dateEffet: string }) {
  await lirePrestataire(q, prestataireId);
  exiger(Number.isInteger(d.tarif) && d.tarif > 0, 'TARIF_INVALIDE', 'Tarif en francs entiers, positif');
  exiger(dateValide(d.dateEffet), 'DATE_INVALIDE', 'Date d\'effet invalide');
  const o = await resoudreObjet(q, d);
  const r = await q.query<{ id: string }>(
    'INSERT INTO convention_tarif (prestataire_id, acte_code, medicament_id, forfait_code, tarif, date_effet) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [prestataireId, o.acte, o.medicament, o.forfait, d.tarif, d.dateEffet])
    .catch(e => { if (e.code === '23505') throw new ErreurMetier('TARIF_EXISTANT', 'Un tarif existe déjà pour cet objet à cette date', 409); throw e; });
  await journaliser(q, { ...acteur.trace(), action: 'PARAMETRAGE', objetType: 'convention_tarif', objetId: r.rows[0]!.id, apres: { prestataireId, ...d } });
  return r.rows[0]!.id;
}

/** Tarif conventionné en vigueur à une date (null : aucun tarif, l'acte ne peut être facturé). */
export async function tarifEnVigueur(q: Executant, prestataireId: string, o: ObjetTarif, date = aujourdhui()): Promise<number | null> {
  const x = await resoudreObjet(q, o);
  const r = (await q.query<{ tarif: string }>(
    `SELECT tarif FROM convention_tarif WHERE prestataire_id = $1 AND acte_code IS NOT DISTINCT FROM $2 AND medicament_id IS NOT DISTINCT FROM $3 AND forfait_code IS NOT DISTINCT FROM $4
        AND date_effet <= $5 AND supprime_le IS NULL ORDER BY date_effet DESC LIMIT 1`, [prestataireId, x.acte, x.medicament, x.forfait, date])).rows[0];
  return r ? Number(r.tarif) : null;
}

// ---------------------------------------------------------------- agrément du prestataire (SAN-RG-001, 002)

/**
 * Proposition d'agrément : convention signée, coordonnées de paiement vérifiées, tarifs saisis ; le compte de
 * l'administrateur désigné est créé inactif (mot de passe initial fixé par la Compagnie) et activé par l'agrément.
 */
export async function proposerAgrementPrestataire(q: Executant, acteur: Acteur, id: string, admin: { tiersId: string; identifiant: string; motDePasse: string }) {
  const p = await lirePrestataire(q, id, true);
  exiger(['EN_AGREMENT', 'SUSPENDU'].includes(p.statut), 'STATUT_INVALIDE', 'Prestataire déjà agréé ou convention terminée');
  exiger(p.convention_document_id, 'CONVENTION_REQUISE', 'Déposer la convention signée');
  const coord = await q.query(`SELECT 1 FROM coordonnee_paiement WHERE tiers_id = $1 AND statut = 'VERIFIEE' AND supprime_le IS NULL`, [p.tiers_id]);
  exiger(coord.rowCount, 'COORDONNEES_REQUISES', 'Coordonnées de paiement vérifiées requises (REF-RG-005)');
  const tarifs = await q.query('SELECT 1 FROM convention_tarif WHERE prestataire_id = $1 AND supprime_le IS NULL LIMIT 1', [id]);
  exiger(tarifs.rowCount, 'TARIFS_REQUIS', 'Saisir les tarifs conventionnés');
  const encours = await q.query(`SELECT 1 FROM demande_validation WHERE type_operation = $1 AND objet_id = $2 AND statut = 'EN_ATTENTE'`, [OPERATION_AGREMENT_PRESTATAIRE, id]);
  exiger(!encours.rowCount, 'DEMANDE_EN_COURS', 'Un agrément est déjà en cours de validation', 409);
  let adminId = p.administrateur_id;
  if (!adminId) {
    const t = (await q.query<{ nature: string; telephone: string | null }>('SELECT nature, telephone FROM tiers WHERE id = $1', [admin.tiersId])).rows[0];
    exiger(t?.nature === 'PHYSIQUE' && t.telephone, 'ADMINISTRATEUR_INVALIDE', 'L\'administrateur est une personne physique avec un téléphone (second facteur)');
    adminId = await creerUtilisateur(q, acteur, { identifiant: admin.identifiant, tiersId: admin.tiersId, typeCompte: 'ADMIN_PRESTATAIRE', prestataireId: id, motDePasse: admin.motDePasse, telephone: t!.telephone! });
    await q.query(`UPDATE utilisateur SET statut = 'A_VALIDER' WHERE id = $1`, [adminId]);
    await q.query('UPDATE prestataire SET administrateur_id = $2 WHERE id = $1', [id, adminId]);
  }
  const d = await soumettre(q, acteur, { typeOperation: OPERATION_AGREMENT_PRESTATAIRE, objetType: 'prestataire', objetId: id, donnees: { code: p.code, nom: p.nom, type: p.type, reprise: p.statut === 'SUSPENDU' } });
  return { demandeValidation: d.id, administrateurId: adminId };
}

enregistrerOperation(OPERATION_AGREMENT_PRESTATAIRE, {
  administrative: false,
  async appliquer(q, demande, acteur) {
    const p = await lirePrestataire(q, demande.objet_id, true);
    await q.query(`UPDATE prestataire SET statut = 'AGREE' WHERE id = $1`, [p.id]);
    // REF-RG-004 : compte auxiliaire du prestataire (collectif des prestataires de santé)
    const role = await q.query(`SELECT 1 FROM tiers_role WHERE tiers_id = $1 AND role = 'PRESTATAIRE' AND date_fin IS NULL`, [p.tiers_id]);
    if (!role.rowCount) await attribuerRole(q, acteur, { tiersId: p.tiers_id, role: 'PRESTATAIRE' });
    // Compte de l'administrateur activé, profil fixé par la Compagnie ; comptes des professionnels agréés rétablis (reprise)
    const admin = (await q.query<{ id: string; identifiant: string; telephone: string | null; tiers_id: string }>('SELECT id, identifiant, telephone_verifie AS telephone, tiers_id FROM utilisateur WHERE id = $1', [p.administrateur_id])).rows[0]!;
    await q.query(`UPDATE utilisateur SET statut = 'ACTIF' WHERE id = $1`, [admin.id]);
    const profil = (await q.query<{ id: string }>(`SELECT id FROM profil WHERE code = 'ADMIN_PRESTATAIRE'`)).rows[0]!;
    const deja = await q.query('SELECT 1 FROM utilisateur_profil WHERE utilisateur_id = $1 AND profil_id = $2 AND supprime_le IS NULL', [admin.id, profil.id]);
    if (!deja.rowCount) await attribuerProfil(q, acteur, { utilisateurId: admin.id, profilId: profil.id });
    await q.query(`UPDATE utilisateur u SET statut = 'ACTIF' FROM exercice_professionnel e JOIN professionnel_sante ps ON ps.id = e.professionnel_id
                    WHERE e.utilisateur_id = u.id AND e.prestataire_id = $1 AND e.actif AND ps.agree_le IS NOT NULL AND ps.statut = 'ACTIF' AND u.statut = 'SUSPENDU'`, [p.id]);
    await journaliser(q, { ...acteur.trace(), action: 'VALIDATION', objetType: 'prestataire', objetId: p.id, apres: { statut: 'AGREE' } });
    if (admin.telephone) await notifier(q, { tiersId: admin.tiers_id, code: 'PRESTATAIRE_AGREE', canal: 'SMS', adresse: admin.telephone, objet: { type: 'prestataire', id: p.id },
      variables: { prestataire: p.nom, identifiant: admin.identifiant } }).catch(() => undefined);
  },
});

/** SAN-RG-001, 010 : suspension (réversible par un nouvel agrément) ou fin de convention ; tous les comptes désactivés. */
export async function changerStatutPrestataire(q: Executant, acteur: Acteur, id: string, statut: 'SUSPENDU' | 'FIN_CONVENTION', motif: string) {
  exiger(motif?.trim(), 'MOTIF_REQUIS', 'Motif obligatoire');
  const p = await lirePrestataire(q, id, true);
  exiger(p.statut === 'AGREE' || (p.statut === 'SUSPENDU' && statut === 'FIN_CONVENTION'), 'STATUT_INVALIDE', 'Prestataire non agréé');
  await q.query('UPDATE prestataire SET statut = $2 WHERE id = $1', [id, statut]);
  const comptes = (await q.query<{ id: string }>(`SELECT id FROM utilisateur WHERE prestataire_id = $1 AND statut = 'ACTIF'`, [id])).rows;
  for (const u of comptes) await changerStatut(q, acteur, u.id, statut === 'SUSPENDU' ? 'SUSPENDU' : 'DESACTIVE', `Prestataire ${statut === 'SUSPENDU' ? 'suspendu' : 'en fin de convention'} : ${motif}`);
  if (statut === 'FIN_CONVENTION') await q.query('UPDATE exercice_professionnel SET actif = false WHERE prestataire_id = $1', [id]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'prestataire', objetId: id, avant: { statut: p.statut }, apres: { statut, motif, comptes: comptes.length } });
  return { comptesDesactives: comptes.length };
}

// ---------------------------------------------------------------- professionnels (SAN-RG-004 à 010)

/** Structure administrée par l'utilisateur connecté (administrateur d'un prestataire agréé). */
export async function structureDe(q: Executant, utilisateurId: string) {
  const r = (await q.query<{ id: string }>(`SELECT p.id FROM prestataire p WHERE p.administrateur_id = $1 AND p.statut = 'AGREE' AND p.supprime_le IS NULL`, [utilisateurId])).rows[0];
  if (!r) throw interdit('Réservé à l\'administrateur d\'un prestataire agréé');
  return lirePrestataire(q, r.id);
}

export interface NouveauProfessionnel {
  nom: string; prenoms: string; telephone: string; courriel?: string; typePiece: string; numeroPiece: string; profession: Profession; specialite?: string;
  numeroOrdre: string; diplomeDocumentId: string; pieceDocumentId: string; identifiant: string; motDePasse: string;
}

/**
 * SAN-RG-004 à 006 : l'administrateur crée le compte nominatif d'un professionnel. Profil déterminé par la profession,
 * admise par le type de structure ; compte inactif tant que le professionnel n'est pas agréé par la Compagnie.
 * Un professionnel déjà connu (même numéro d'ordre) exerçant ailleurs reçoit un nouveau compte pour cette structure.
 */
export async function ajouterProfessionnel(q: Executant, acteur: Acteur, d: NouveauProfessionnel) {
  const s = await structureDe(q, acteur.utilisateurId!);
  exiger(s.professions.includes(d.profession), 'PROFESSION_NON_ADMISE', `Profession non admise dans une structure de type ${s.type} (profils fixés par la Compagnie, SAN-RG-005)`);
  exiger(d.numeroOrdre?.trim(), 'NUMERO_ORDRE_REQUIS', 'Numéro d\'inscription à l\'ordre obligatoire');
  const docs = await q.query('SELECT 1 FROM document WHERE id = ANY($1) AND supprime_le IS NULL', [[d.diplomeDocumentId, d.pieceDocumentId]]);
  exiger(docs.rowCount === 2, 'PIECES_REQUISES', 'Diplôme et pièce d\'identité obligatoires');
  let pro = (await q.query<{ id: string; tiers_id: string; profession: string; agree_le: string | null; statut: string }>(
    'SELECT id, tiers_id, profession, agree_le, statut FROM professionnel_sante WHERE numero_ordre = $1 AND supprime_le IS NULL', [d.numeroOrdre.trim()])).rows[0];
  if (pro) {
    exiger(pro.profession === d.profession, 'PROFESSION_DIFFERENTE', 'Ce numéro d\'ordre est enregistré pour une autre profession');
    const deja = await q.query('SELECT 1 FROM exercice_professionnel WHERE professionnel_id = $1 AND prestataire_id = $2', [pro.id, s.id]);
    exiger(!deja.rowCount, 'DEJA_RATTACHE', 'Ce professionnel a déjà un compte dans votre structure', 409);
  } else {
    const tiersId = await creerTiers(q, acteur, { nature: 'PHYSIQUE', nom: d.nom.trim().toUpperCase(), prenoms: d.prenoms.trim(), telephone: d.telephone, courriel: d.courriel, type_piece: d.typePiece, numero_piece: d.numeroPiece });
    const r = await q.query<{ id: string }>(
      `INSERT INTO professionnel_sante (tiers_id, profession, specialite, numero_ordre, diplome_document_id, statut, teleconsultation) VALUES ($1,$2,$3,$4,$5,'ACTIF',false) RETURNING id`,
      [tiersId, d.profession, d.specialite ?? null, d.numeroOrdre.trim(), d.diplomeDocumentId]);
    pro = { id: r.rows[0]!.id, tiers_id: tiersId, profession: d.profession, agree_le: null, statut: 'ACTIF' };
    await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'professionnel_sante', objetId: pro.id, apres: { profession: d.profession, numeroOrdre: d.numeroOrdre, prestataire: s.code } });
  }
  const tel = (await q.query<{ telephone: string | null }>('SELECT telephone FROM tiers WHERE id = $1', [pro.tiers_id])).rows[0]?.telephone ?? d.telephone;
  const utilisateurId = await creerUtilisateur(q, acteur, { identifiant: d.identifiant, tiersId: pro.tiers_id, typeCompte: 'PROFESSIONNEL_SANTE', prestataireId: s.id, motDePasse: d.motDePasse, telephone: tel });
  const profil = (await q.query<{ id: string }>('SELECT id FROM profil WHERE code = $1', [PROFIL_DE[d.profession]])).rows[0]!;
  await attribuerProfil(q, acteur, { utilisateurId, profilId: profil.id });
  const agree = !!pro.agree_le && pro.statut === 'ACTIF';
  if (!agree) await q.query(`UPDATE utilisateur SET statut = 'A_VALIDER' WHERE id = $1`, [utilisateurId]);
  const e = await q.query<{ id: string }>('INSERT INTO exercice_professionnel (professionnel_id, prestataire_id, utilisateur_id, actif, cree_par_admin_id) VALUES ($1,$2,$3,$4,$5) RETURNING id', [pro.id, s.id, utilisateurId, agree, acteur.utilisateurId]);
  let demande: string | null = null;
  if (!pro.agree_le) {
    const encours = (await q.query<{ id: string }>(`SELECT id FROM demande_validation WHERE type_operation = $1 AND objet_id = $2 AND statut = 'EN_ATTENTE'`, [OPERATION_AGREMENT_PROFESSIONNEL, pro.id])).rows[0];
    demande = encours?.id ?? (await soumettre(q, acteur, { typeOperation: OPERATION_AGREMENT_PROFESSIONNEL, objetType: 'professionnel_sante', objetId: pro.id,
      donnees: { nom: `${d.prenoms} ${d.nom}`, profession: d.profession, specialite: d.specialite ?? null, numeroOrdre: d.numeroOrdre, prestataire: s.nom, pieceDocumentId: d.pieceDocumentId } })).id;
  }
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'exercice_professionnel', objetId: e.rows[0]!.id, apres: { professionnel: pro.id, prestataire: s.code, profil: PROFIL_DE[d.profession], actif: agree } });
  return { professionnelId: pro.id, utilisateurId, exerciceId: e.rows[0]!.id, actif: agree, demandeAgrement: demande };
}

enregistrerOperation(OPERATION_AGREMENT_PROFESSIONNEL, {
  administrative: false,
  // SAN-RG-006 : identité, diplôme et numéro d'ordre vérifiés ; les comptes des structures agréées sont activés
  async appliquer(q, demande, acteur) {
    await q.query(`UPDATE professionnel_sante SET agree_le = current_date, statut = 'ACTIF' WHERE id = $1`, [demande.objet_id]);
    const comptes = (await q.query<{ utilisateur_id: string; exercice_id: string; identifiant: string; telephone: string | null; tiers_id: string; prestataire: string; profession: Profession }>(
      `SELECT e.utilisateur_id, e.id AS exercice_id, u.identifiant, u.telephone_verifie AS telephone, u.tiers_id, t.nom AS prestataire, ps.profession
         FROM exercice_professionnel e JOIN utilisateur u ON u.id = e.utilisateur_id JOIN prestataire p ON p.id = e.prestataire_id JOIN tiers t ON t.id = p.tiers_id
         JOIN professionnel_sante ps ON ps.id = e.professionnel_id WHERE e.professionnel_id = $1 AND p.statut = 'AGREE' AND u.statut = 'A_VALIDER'`, [demande.objet_id])).rows;
    for (const c of comptes) {
      await q.query(`UPDATE utilisateur SET statut = 'ACTIF', valide_par = $2 WHERE id = $1`, [c.utilisateur_id, acteur.utilisateurId]);
      await q.query('UPDATE exercice_professionnel SET actif = true WHERE id = $1', [c.exercice_id]);
      if (c.telephone) await notifier(q, { tiersId: c.tiers_id, code: 'PROFESSIONNEL_AGREE', canal: 'SMS', adresse: c.telephone, objet: { type: 'professionnel_sante', id: demande.objet_id },
        variables: { profession: LIBELLES_PROFESSION[c.profession], identifiant: c.identifiant, prestataire: c.prestataire } }).catch(() => undefined);
    }
    await journaliser(q, { ...acteur.trace(), action: 'VALIDATION', objetType: 'professionnel_sante', objetId: demande.objet_id, apres: { agree: true, comptes: comptes.length } });
  },
});

/** SAN-RG-009 : l'administrateur active ou désactive un professionnel de sa structure ; désactivation immédiate, sessions fermées. */
export async function activerProfessionnel(q: Executant, acteur: Acteur, exerciceId: string, actif: boolean, motif: string) {
  const s = await structureDe(q, acteur.utilisateurId!);
  const e = (await q.query<{ utilisateur_id: string; prestataire_id: string; agree_le: string | null; statut_pro: string }>(
    `SELECT e.utilisateur_id, e.prestataire_id, ps.agree_le, ps.statut AS statut_pro FROM exercice_professionnel e JOIN professionnel_sante ps ON ps.id = e.professionnel_id WHERE e.id = $1 FOR UPDATE OF e`, [exerciceId])).rows[0];
  if (!e || e.prestataire_id !== s.id) throw nonTrouve('Professionnel de votre structure');
  // SAN-RG-006, CA-SAN-13 : un compte n'est activable qu'après l'agrément du professionnel par la Compagnie
  if (actif) exiger(e.agree_le && e.statut_pro === 'ACTIF', 'PROFESSIONNEL_NON_AGREE', 'Compte non activable : le professionnel n\'est pas (ou plus) agréé par la Compagnie');
  await changerStatut(q, acteur, e.utilisateur_id, actif ? 'ACTIF' : 'DESACTIVE', motif);
  await q.query('UPDATE exercice_professionnel SET actif = $2 WHERE id = $1', [exerciceId, actif]);
}

/** SAN-RG-006, 010 : la Compagnie suspend ou met fin à l'agrément d'un professionnel : ses comptes sont désactivés partout. */
export async function changerStatutProfessionnel(q: Executant, acteur: Acteur, professionnelId: string, actif: boolean, motif: string) {
  exiger(motif?.trim(), 'MOTIF_REQUIS', 'Motif obligatoire');
  const p = (await q.query<{ statut: string; agree_le: string | null }>('SELECT statut, agree_le FROM professionnel_sante WHERE id = $1 FOR UPDATE', [professionnelId])).rows[0];
  if (!p) throw nonTrouve('Professionnel');
  if (actif) exiger(p.agree_le, 'PROFESSIONNEL_NON_AGREE', 'Agrément à instruire avant toute réactivation');
  await q.query('UPDATE professionnel_sante SET statut = $2 WHERE id = $1', [professionnelId, actif ? 'ACTIF' : 'INACTIF']);
  if (!actif) {
    const comptes = (await q.query<{ utilisateur_id: string }>(`SELECT e.utilisateur_id FROM exercice_professionnel e JOIN utilisateur u ON u.id = e.utilisateur_id WHERE e.professionnel_id = $1 AND u.statut IN ('ACTIF', 'A_VALIDER')`, [professionnelId])).rows;
    for (const c of comptes) await changerStatut(q, acteur, c.utilisateur_id, 'DESACTIVE', `Agrément du professionnel retiré : ${motif}`);
    await q.query('UPDATE exercice_professionnel SET actif = false WHERE professionnel_id = $1', [professionnelId]);
  }
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'professionnel_sante', objetId: professionnelId, avant: { statut: p.statut }, apres: { statut: actif ? 'ACTIF' : 'INACTIF', motif } });
}

export async function habiliterTeleconsultation(q: Executant, acteur: Acteur, professionnelId: string, habilite: boolean) {
  const p = (await q.query<{ profession: string; agree_le: string | null }>('SELECT profession, agree_le FROM professionnel_sante WHERE id = $1', [professionnelId])).rows[0];
  if (!p) throw nonTrouve('Professionnel');
  if (habilite) exiger(p.agree_le && ['MEDECIN', 'SAGE_FEMME', 'CHIRURGIEN_DENTISTE'].includes(p.profession), 'HABILITATION_IMPOSSIBLE', 'Seul un praticien prescripteur agréé est habilité à la téléconsultation (SAN-RG-070)');
  await q.query('UPDATE professionnel_sante SET teleconsultation = $2 WHERE id = $1', [professionnelId, habilite]);
  await journaliser(q, { ...acteur.trace(), action: 'PARAMETRAGE', objetType: 'professionnel_sante', objetId: professionnelId, apres: { teleconsultation: habilite } });
}

// ---------------------------------------------------------------- consultation

export async function listerPrestataires(q: Executant, f: { statut?: string; type?: string; recherche?: string } = {}) {
  return (await q.query(
    `SELECT p.id, p.code, p.type, tp.libelle AS type_libelle, p.statut, t.nom, t.telephone, t.adresse, p.latitude, p.longitude,
            (SELECT count(*)::int FROM exercice_professionnel e WHERE e.prestataire_id = p.id AND e.actif) AS professionnels,
            (SELECT array_agg(o.option ORDER BY o.option) FROM prestataire_option o WHERE o.prestataire_id = p.id AND o.actif) AS options
       FROM prestataire p JOIN tiers t ON t.id = p.tiers_id JOIN type_prestataire tp ON tp.code = p.type
      WHERE p.supprime_le IS NULL AND ($1::text IS NULL OR p.statut = $1) AND ($2::text IS NULL OR p.type = $2) AND ($3::text IS NULL OR t.nom ILIKE '%' || $3 || '%' OR p.code = upper($3))
      ORDER BY t.nom LIMIT 500`, [f.statut ?? null, f.type ?? null, f.recherche ?? null])).rows;
}

export async function fichePrestataire(q: Executant, id: string) {
  const p = (await q.query(
    `SELECT p.*, t.nom, t.telephone, t.adresse, t.code_tiers, tp.libelle AS type_libelle, tp.professions, u.identifiant AS administrateur, u.statut AS statut_administrateur
       FROM prestataire p JOIN tiers t ON t.id = p.tiers_id JOIN type_prestataire tp ON tp.code = p.type LEFT JOIN utilisateur u ON u.id = p.administrateur_id WHERE p.id = $1`, [id])).rows[0];
  if (!p) throw nonTrouve('Prestataire');
  const [options, tarifs, professionnels, coordonnees] = await Promise.all([
    q.query('SELECT option, actif, calendrier FROM prestataire_option WHERE prestataire_id = $1 ORDER BY option', [id]),
    q.query(`SELECT ct.id, ct.acte_code, m.code AS medicament_code, COALESCE(na.libelle, m.denomination, ct.forfait_code) AS libelle, ct.forfait_code, ct.tarif, ct.date_effet
               FROM convention_tarif ct LEFT JOIN nomenclature_acte na ON na.code = ct.acte_code LEFT JOIN medicament m ON m.id = ct.medicament_id
              WHERE ct.prestataire_id = $1 AND ct.supprime_le IS NULL ORDER BY libelle, ct.date_effet DESC`, [id]),
    professionnelsDe(q, id),
    q.query(`SELECT count(*)::int AS n FROM coordonnee_paiement WHERE tiers_id = $1 AND statut = 'VERIFIEE' AND supprime_le IS NULL`, [p.tiers_id]),
  ]);
  return { ...p, options: options.rows, tarifs: tarifs.rows, professionnels, coordonneesVerifiees: coordonnees.rows[0].n };
}

export async function professionnelsDe(q: Executant, prestataireId: string) {
  return (await q.query(
    `SELECT e.id AS exercice_id, ps.id AS professionnel_id, trim(t.nom || ' ' || COALESCE(t.prenoms, '')) AS nom, ps.profession, ps.specialite, ps.numero_ordre, ps.agree_le, ps.statut AS statut_professionnel,
            ps.teleconsultation, u.identifiant, u.statut AS statut_compte, e.actif, pr.code AS profil,
            (SELECT max(s.cree_le) FROM session_utilisateur s WHERE s.utilisateur_id = u.id) AS derniere_connexion
       FROM exercice_professionnel e JOIN professionnel_sante ps ON ps.id = e.professionnel_id JOIN tiers t ON t.id = ps.tiers_id JOIN utilisateur u ON u.id = e.utilisateur_id
       LEFT JOIN utilisateur_profil up ON up.utilisateur_id = u.id AND up.supprime_le IS NULL LEFT JOIN profil pr ON pr.id = up.profil_id
      WHERE e.prestataire_id = $1 ORDER BY t.nom`, [prestataireId])).rows;
}

/** SAN-RG-009 : journal des actions de la structure (comptes de ses professionnels et de son administrateur). */
export async function journalStructure(q: Executant, prestataireId: string) {
  return (await q.query(
    `SELECT a.horodatage, a.action, a.objet_type, u.identifiant, trim(t.nom || ' ' || COALESCE(t.prenoms, '')) AS auteur
       FROM journal_audit a JOIN utilisateur u ON u.id = a.utilisateur_id JOIN tiers t ON t.id = u.tiers_id
      WHERE u.prestataire_id = $1 ORDER BY a.rang DESC LIMIT 300`, [prestataireId])).rows;
}

/** Professionnels en attente d'agrément ou agréés (vue de la Compagnie). */
export async function listerProfessionnels(q: Executant, f: { statut?: 'A_AGREER' | 'AGREES' | 'INACTIFS' } = {}) {
  return (await q.query(
    `SELECT ps.id, trim(t.nom || ' ' || COALESCE(t.prenoms, '')) AS nom, ps.profession, ps.specialite, ps.numero_ordre, ps.agree_le, ps.statut, ps.teleconsultation,
            (SELECT string_agg(tp.nom, ', ') FROM exercice_professionnel e JOIN prestataire p ON p.id = e.prestataire_id JOIN tiers tp ON tp.id = p.tiers_id WHERE e.professionnel_id = ps.id) AS structures,
            (SELECT d.id FROM demande_validation d WHERE d.type_operation = 'AGREMENT_PROFESSIONNEL' AND d.objet_id = ps.id AND d.statut = 'EN_ATTENTE' LIMIT 1) AS demande
       FROM professionnel_sante ps JOIN tiers t ON t.id = ps.tiers_id
      WHERE ps.supprime_le IS NULL AND ($1::text IS NULL OR ($1 = 'A_AGREER' AND ps.agree_le IS NULL) OR ($1 = 'AGREES' AND ps.agree_le IS NOT NULL AND ps.statut = 'ACTIF') OR ($1 = 'INACTIFS' AND ps.statut = 'INACTIF'))
      ORDER BY t.nom LIMIT 500`, [f.statut ?? null])).rows;
}
