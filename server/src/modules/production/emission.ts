/**
 * Émission (étape 8) et annulation pour erreur (CDC § 7.5.3, 7.5.4, 8.4 ; COM-RG-021 à 023, 030, 031, 040, 041, 048, 070 ;
 * PROD-RG-002 à 005, 009 ; CA-COM-03 à 06, 10, 11 ; CA-PROD-01, 02, 23).
 *
 * Transaction unique : contrôle du solde, numéro de police, quittance, activation du contrat, documents, écritures EVT-02
 * (constatation, perception, commission), débit du compte de production. En cas d'échec d'une étape, rien n'est enregistré.
 */
import { convertirProspect } from '../commercial/prospects.js';
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger, interdit, nonTrouve } from '../../noyau/erreurs.js';
import { ajouterAnnees, ajouterJours, aujourdhui } from '../../noyau/dates.js';
import { journaliser } from '../../moteurs/audit.js';
import { entier, valeurParametre } from '../../moteurs/parametres.js';
import { attribuer } from '../../moteurs/numerotation.js';
import { notifier } from '../../moteurs/notifications.js';
import { publier } from '../../moteurs/evenements.js';
import { enregistrerOperation, soumettre } from '../../moteurs/validation.js';
import { genererDocument } from '../../moteurs/documents.js';
import { exigerFicheComplete } from '../referentiels/societe.js';
import { attribuerRole } from '../referentiels/roles.js';
import { declarerMembre } from '../referentiels/foyer.js';
import { comptabiliser, type CompteResolu } from '../comptabilite/moteur.js';
import { tarifer } from '../catalogue/service.js';
import { compteComptable, compteProductionDuBureau, lireCompteProduction, mouvementer } from '../commercial/comptesProduction.js';
import { controlerDossier, etatGarantiesDeces, lireDossier, variablesContrat, type Dossier } from './dossiers.js';

export const OPERATION_ANNULATION = 'ANNULATION_ERREUR';
const gnf = (n: number) => `${n.toLocaleString('fr-FR').replace(/ /g, ' ')} GNF`;

// ---------------------------------------------------------------- commissions (COM-RG-040, 041, 048, 070)

interface Beneficiaire { intervenantId: string; qualite: 'TITULAIRE' | 'APPORTEUR' | 'PRESCRIPTEUR'; cle: number; tiersId: string; montant: number; taux: number }

/**
 * Commission de la police : taux du barème du titulaire (agent général) sur la prime nette, répartie selon la clé
 * (apporteur et prescripteur : parts paramétrées ; le titulaire garde le reste). Le reste d'arrondi va à la plus grande part.
 */
export async function calculerCommissions(q: Executant, d: { produitId: string; dateEffet: string; assiette: number; titulaireId: string; apporteurId?: string | null; prescripteurId?: string | null; assuresEtSouscripteur: string[] }): Promise<Beneficiaire[]> {
  const b = (await q.query<{ taux: string }>(
    `SELECT taux FROM bareme_commission WHERE produit_id = $1 AND role = 'AGENT_GENERAL' AND date_effet <= $2 AND supprime_le IS NULL ORDER BY date_effet DESC LIMIT 1`,
    [d.produitId, d.dateEffet])).rows[0];
  const taux = b ? Number(b.taux) : 0;
  const total = Math.round(d.assiette * taux);
  const tiersDe = async (id: string) => (await q.query<{ tiers_id: string }>('SELECT tiers_id FROM intervenant WHERE id = $1', [id])).rows[0]!.tiers_id;
  const parts: Omit<Beneficiaire, 'montant' | 'taux'>[] = [];
  if (d.apporteurId) parts.push({ intervenantId: d.apporteurId, qualite: 'APPORTEUR', cle: Number(await valeurParametre(q, 'COM_CLE_APPORTEUR', d.dateEffet)), tiersId: await tiersDe(d.apporteurId) });
  if (d.prescripteurId) {
    const t = await tiersDe(d.prescripteurId);
    // COM-RG-048 : aucune commission au prescripteur souscripteur ou assuré de la police
    if (!d.assuresEtSouscripteur.includes(t)) parts.push({ intervenantId: d.prescripteurId, qualite: 'PRESCRIPTEUR', cle: Number(await valeurParametre(q, 'COM_CLE_PRESCRIPTEUR', d.dateEffet)), tiersId: t });
  }
  const resteTitulaire = 1 - parts.reduce((s, p) => s + p.cle, 0);
  exiger(resteTitulaire > 0, 'CLE_INVALIDE', 'Clé de répartition : la part du titulaire doit rester positive', 500);
  parts.unshift({ intervenantId: d.titulaireId, qualite: 'TITULAIRE', cle: Math.round(resteTitulaire * 1e6) / 1e6, tiersId: await tiersDe(d.titulaireId) });
  const lignes = parts.map(p => ({ ...p, taux, montant: Math.round(total * p.cle) }));
  const ecart = total - lignes.reduce((s, l) => s + l.montant, 0);
  if (ecart) lignes.sort((a, c) => c.montant - a.montant)[0]!.montant += ecart;
  return lignes.filter(l => l.montant > 0 || l.qualite === 'TITULAIRE');
}

/** Compte « commissions à payer » de l'intervenant (auxiliaire ouvert avec son rôle, REF-RG-004). */
async function compteCommissions(q: Executant, intervenantId: string): Promise<CompteResolu> {
  const r = (await q.query<{ compte_auxiliaire_id: string | null; collectif_id: string }>(
    `SELECT tr.compte_auxiliaire_id, a.collectif_id FROM intervenant i JOIN tiers_role tr ON tr.tiers_id = i.tiers_id AND tr.role = i.role AND tr.date_fin IS NULL
       JOIN compte_auxiliaire a ON a.id = tr.compte_auxiliaire_id WHERE i.id = $1`, [intervenantId])).rows[0];
  if (!r?.compte_auxiliaire_id) throw new ErreurMetier('COMPTE_COMMISSIONS_ABSENT', 'Intervenant sans compte de commissions à payer', 422);
  return { compteId: r.collectif_id, auxiliaireId: r.compte_auxiliaire_id };
}

// ---------------------------------------------------------------- émission (étape 8)

async function acteurEmetteur(q: Executant, acteur: Acteur, d: Dossier) {
  const i = (await q.query<{ id: string; role: string; rattachement_id: string | null; emission_activee: boolean }>(
    `SELECT i.id, i.role, i.rattachement_id, i.emission_activee FROM utilisateur u JOIN intervenant i ON i.tiers_id = u.tiers_id
      WHERE u.id = $1 AND i.statut = 'ACTIF' AND i.role IN ('AGENT_GENERAL', 'COLLABORATEUR') AND i.supprime_le IS NULL ORDER BY i.role LIMIT 1`, [acteur.utilisateurId])).rows[0];
  if (!i) throw interdit('Seuls l\'agent général et ses collaborateurs émettent ; un junior soumet son dossier à son agent général (PROD-RG-009)');
  const agentId = i.role === 'AGENT_GENERAL' ? i.id : i.rattachement_id!;
  const agent = (await q.query<{ emission_activee: boolean }>('SELECT emission_activee FROM intervenant WHERE id = $1', [agentId])).rows[0]!;
  exiger(agent.emission_activee, 'EMISSION_NON_ACTIVEE', 'L\'émission n\'est pas activée pour cet agent général (COM-RG-002)', 403);
  const gere = await q.query(`SELECT 1 FROM bureau_gestionnaire WHERE bureau_id = $1 AND intervenant_id = $2 AND date_fin IS NULL AND supprime_le IS NULL`, [d.bureau_id, agentId]);
  exiger(gere.rowCount, 'BUREAU_INVALIDE', 'Ce dossier relève d\'un bureau que votre agent général ne gère pas', 403);
  if (d.canal === 'JUNIOR') exiger(d.statut === 'A_VALIDER', 'DOSSIER_NON_SOUMIS', 'Le dossier du junior doit d\'abord être soumis à l\'agent général');
  return { agentId };
}

export async function emettre(q: Executant, acteur: Acteur, dossierId: string) {
  const d = await lireDossier(q, dossierId, true);
  exiger(['BROUILLON', 'A_VALIDER'].includes(d.statut), 'DOSSIER_CLOS', 'Dossier déjà émis, rejeté ou expiré');
  exiger(d.expire_le >= aujourdhui(), 'DOSSIER_EXPIRE', 'Proposition expirée (PROD-RG-001)');
  const { agentId } = await acteurEmetteur(q, acteur, d);
  await exigerFicheComplete(q);
  const anomalies = await controlerDossier(q, d);
  if (anomalies.length) throw new ErreurMetier('DOSSIER_INCOMPLET', `Émission impossible : ${anomalies.join(' ; ')}`, 422, { anomalies });
  exiger(d.acceptation_preuve_id, 'ACCEPTATION_REQUISE', 'Le client n\'a pas accepté le récapitulatif (étape 7, DIG-RG-002)');
  const x = d.donnees;
  const naissances = new Map((await q.query<{ id: string; date_naissance: string }>('SELECT id, date_naissance::text FROM tiers WHERE id = ANY($1)', [x.assures.map(a => a.tiersId)])).rows.map(r => [r.id, r.date_naissance]));
  const tarif = await tarifer(q, d.formule_id, x.assures.map(a => ({ qualite: a.qualite, dateNaissance: naissances.get(a.tiersId)! })), x.dateEffet);
  exiger(tarif.primeTotale === d.prime_totale, 'TARIF_MODIFIE', 'Le tarif a changé depuis l\'acceptation : présentez de nouveau le récapitulatif');

  // COM-RG-021, 023 : solde vérifié sous verrou avant toute écriture
  const cp = await lireCompteProduction(q, (await compteProductionDuBureau(q, d.bureau_id)).id, true);
  exiger(cp.statut === 'ACTIF', 'COMPTE_PRODUCTION_GELE', 'Compte de production gelé ou clôturé : émission impossible');
  if (cp.solde < tarif.primeTotale) {
    throw new ErreurMetier('SOLDE_INSUFFISANT', `Solde insuffisant : il manque ${gnf(tarif.primeTotale - cp.solde)}`, 422, { solde: cp.solde, manque: tarif.primeTotale - cp.solde });
  }

  const produit = (await q.query<{ code: string; branche_bcrg: string; modele_cg_id: string; modele_cp_id: string }>('SELECT code, branche_bcrg, modele_cg_id, modele_cp_id FROM produit WHERE id = $1', [d.produit_id])).rows[0]!;
  const souscripteur = (await q.query<{ nature: 'PHYSIQUE' | 'MORALE'; telephone: string | null }>('SELECT nature, telephone FROM tiers WHERE id = $1', [d.souscripteur_id])).rows[0]!;
  const annee = Number(aujourdhui().slice(0, 4));
  const policeId = crypto.randomUUID();
  const numero = await attribuer(q, acteur, { type: 'POLICE', nature: souscripteur.nature, codeBureau: cp.bureau, codeProduit: produit.code, annee }, { type: 'police', id: policeId });
  const dateFin = ajouterJours(ajouterAnnees(x.dateEffet, 1), -1);

  await q.query(
    `INSERT INTO police (id, numero, type_souscripteur, souscripteur_id, produit_id, formule_id, bureau_emetteur_id, bureau_gestion_id, annee_premiere_emission, canal,
                         date_premiere_effet, statut, ne_pas_renouveler, mode_emission, contrat_collectif)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10,'ACTIVE',false,'DEPOT',false)`,
    [policeId, numero, souscripteur.nature === 'PHYSIQUE' ? '1' : '2', d.souscripteur_id, d.produit_id, d.formule_id, d.bureau_id, annee, d.canal, x.dateEffet]);

  // Foyer (REF-RG-007 à 009) : conjoints et enfants rattachés à l'assuré principal, contrôles sur tous les contrats actifs
  const principal = x.assures.find(a => a.qualite === 'ASSURE_PRINCIPAL')!;
  for (const a of x.assures.filter(y => y.qualite !== 'ASSURE_PRINCIPAL')) {
    const existe = await q.query(`SELECT 1 FROM lien_foyer WHERE assure_principal_id = $1 AND membre_id = $2 AND date_fin IS NULL AND supprime_le IS NULL`, [principal.tiersId, a.tiersId]);
    if (!existe.rowCount) {
      await declarerMembre(q, acteur, { assurePrincipalId: principal.tiersId, membreId: a.tiersId, lien: a.qualite === 'CONJOINT' ? 'CONJOINT' : 'ENFANT',
        parentConjointId: a.parentTiersId, categorieEnfant: a.categorieEnfant, dateDebut: x.dateEffet });
    }
  }

  // Assurés, garanties souscrites (garantie décès accordée seulement si ses conditions sont réunies), consentements
  const deces = await etatGarantiesDeces(q, d);
  const garanties = (await q.query<{ id: string; type: string; capital: number | null }>('SELECT id, type, capital FROM garantie WHERE formule_id = $1 AND supprime_le IS NULL ORDER BY code', [d.formule_id])).rows;
  const ordre = [...x.assures].sort((a, b) => ['ASSURE_PRINCIPAL', 'CONJOINT', 'ENFANT'].indexOf(a.qualite) - ['ASSURE_PRINCIPAL', 'CONJOINT', 'ENFANT'].indexOf(b.qualite));
  for (const [rang, a] of ordre.entries()) {
    const pa = await q.query<{ id: string }>(
      `INSERT INTO police_assure (police_id, tiers_id, qualite, rang_carte, date_entree) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [policeId, a.tiersId, a.qualite, String(rang).padStart(2, '0'), x.dateEffet]);
    const manques = deces.get(a.tiersId) ?? [];
    for (const g of garanties) {
      const refus = g.type === 'DECES' && manques.length ? manques.join(' ; ').slice(0, 200) : null;
      await q.query('INSERT INTO garantie_souscrite (police_assure_id, garantie_id, accordee, motif_refus, capital) VALUES ($1,$2,$3,$4,$5)',
        [pa.rows[0]!.id, g.id, !refus, refus, g.type === 'DECES' ? g.capital : null]);
    }
    const c = x.consentementsDeces.find(y => y.tiersId === a.tiersId);
    if (c) await q.query(`INSERT INTO consentement_assure (police_assure_id, type, capital_mentionne, preuve_id, donne_le) VALUES ($1,'GARANTIE_DECES',$2,$3,now())`,
      [pa.rows[0]!.id, garanties.find(g => g.type === 'DECES')?.capital ?? null, c.preuveId]);
    const role = await q.query(`SELECT 1 FROM tiers_role WHERE tiers_id = $1 AND role = 'ASSURE' AND date_fin IS NULL`, [a.tiersId]);
    if (!role.rowCount) await attribuerRole(q, acteur, { tiersId: a.tiersId, role: 'ASSURE', dateDebut: x.dateEffet });
  }

  // Bénéficiaires du capital décès : version 1, confirmée par l'acceptation du récapitulatif (PROD-RG-010, 012)
  if (x.beneficiaires) {
    const v = await q.query<{ id: string }>(
      `INSERT INTO designation_version (police_id, version, mode, clause_texte, date_effet, preuve_id) VALUES ($1, 1, $2, $3, now(), $4) RETURNING id`,
      [policeId, x.beneficiaires.mode, x.beneficiaires.mode === 'CLAUSE_TYPE' ? 'Le ou les conjoints de l\'assuré par parts égales, à défaut ses enfants nés ou à naître par parts égales, à défaut ses héritiers' : null, d.acceptation_preuve_id]);
    for (const b of x.beneficiaires.liste) {
      await q.query('INSERT INTO beneficiaire (designation_version_id, tiers_id, quotite, rang, acceptant) VALUES ($1,$2,$3,$4,false)', [v.rows[0]!.id, b.tiersId, b.quotite, b.rang]);
    }
  }

  // Souscripteur : rôle et compte client (REF-RG-003, 004)
  const roleClient = (await q.query<{ compte_auxiliaire_id: string | null }>(`SELECT compte_auxiliaire_id FROM tiers_role WHERE tiers_id = $1 AND role = 'SOUSCRIPTEUR' AND date_fin IS NULL`, [d.souscripteur_id])).rows[0];
  const auxClient = roleClient?.compte_auxiliaire_id ?? (await attribuerRole(q, acteur, { tiersId: d.souscripteur_id, role: 'SOUSCRIPTEUR', dateDebut: x.dateEffet })).compteAuxiliaire!.id;
  const client = { compteId: (await q.query<{ collectif_id: string }>('SELECT collectif_id FROM compte_auxiliaire WHERE id = $1', [auxClient])).rows[0]!.collectif_id, auxiliaireId: auxClient };

  // Intervenants de la police (COM-RG-070) et commissions (COM-RG-041 : acquises à l'encaissement de la prime)
  // Apporteur : le junior qui a préparé le dossier, sinon le junior du réseau qui avait enregistré le prospect (COM-RG-070)
  const preparateur = (await q.query<{ role: string }>('SELECT role FROM intervenant WHERE id = $1', [d.prepare_par_id])).rows[0]!;
  const prospecteur = await convertirProspect(q, d.souscripteur_id);
  const apporteurProspect = prospecteur ? (await q.query<{ id: string }>(`SELECT id FROM intervenant WHERE id = $1 AND role = 'JUNIOR' AND rattachement_id = $2`, [prospecteur, agentId])).rows[0]?.id : null;
  // Prescripteur : titulaire du code saisi, s'il est toujours actif (COM-RG-083)
  const prescripteur = d.code_prescripteur_id ? (await q.query<{ intervenant_id: string }>(
    `SELECT c.intervenant_id FROM code_prescripteur c JOIN intervenant i ON i.id = c.intervenant_id WHERE c.id = $1 AND c.statut = 'ACTIF' AND i.statut = 'ACTIF'`, [d.code_prescripteur_id])).rows[0]?.intervenant_id : null;
  const commissions = await calculerCommissions(q, {
    produitId: d.produit_id, dateEffet: x.dateEffet, assiette: tarif.primeNette, titulaireId: agentId,
    apporteurId: preparateur.role === 'JUNIOR' ? d.prepare_par_id : apporteurProspect ?? null, prescripteurId: prescripteur ?? null,
    assuresEtSouscripteur: [d.souscripteur_id, ...x.assures.map(a => a.tiersId)],
  });
  const totalCommission = commissions.reduce((s, c) => s + c.montant, 0);
  for (const c of commissions) {
    await q.query('INSERT INTO police_intervenant (police_id, intervenant_id, qualite, cle_repartition, date_debut) VALUES ($1,$2,$3,$4,$5)', [policeId, c.intervenantId, c.qualite, c.cle, x.dateEffet]);
  }

  // Quittance, documents (PROD-RG-005) et écritures EVT-02 (constatation, perception, commission)
  const quittanceId = crypto.randomUUID();
  const numeroQuittance = await attribuer(q, acteur, { type: 'QUITTANCE', codeBureau: cp.bureau, annee }, { type: 'quittance', id: quittanceId });
  const variables = { ...(await variablesContrat(q, d, numero)), quittance: numeroQuittance };
  const lignesQuittance = [{ libelle: 'Prime nette', montant: gnf(tarif.primeNette) }, { libelle: 'Accessoires', montant: gnf(tarif.accessoires) },
    ...tarif.taxes.map(t => ({ libelle: t.libelle, montant: gnf(t.montant) })), { libelle: 'Prime totale', montant: gnf(tarif.primeTotale) }];
  const docQuittance = await genererDocument(q, acteur, { modeleCode: 'QUITTANCE', typeDocument: 'QUITTANCE', objet: { type: 'police', id: policeId },
    variables: { ...variables, lignes: lignesQuittance, mode_paiement: `débit du compte de production du bureau ${cp.bureau}` } });
  const modele = async (id: string) => (await q.query<{ code: string }>('SELECT code FROM modele_document WHERE id = $1', [id])).rows[0]!.code;
  await genererDocument(q, acteur, { modeleCode: await modele(produit.modele_cp_id), typeDocument: 'BULLETIN_ADHESION', objet: { type: 'police', id: policeId }, variables });
  await genererDocument(q, acteur, { modeleCode: await modele(produit.modele_cg_id), typeDocument: 'CONDITIONS_GENERALES', objet: { type: 'police', id: policeId }, variables });
  await genererDocument(q, acteur, { modeleCode: 'ATTESTATION', typeDocument: 'ATTESTATION', objet: { type: 'police', id: policeId }, variables });

  const branche = (await q.query<{ compte_primes_id: string }>('SELECT compte_primes_id FROM branche_comptable WHERE code = $1', [produit.branche_bcrg])).rows[0];
  if (!branche) throw new ErreurMetier('BRANCHE_INCONNUE', `Branche ${produit.branche_bcrg} sans comptes paramétrés`, 422);
  const ecritures = await comptabiliser(q, acteur, {
    codeEvt: 'EVT-02', reference: numeroQuittance, pieceDocumentId: docQuittance.id, libelle: { police: numero, bureau: cp.bureau },
    montants: { PRIME_NETTE: tarif.primeNette, ACCESSOIRES: tarif.accessoires, PRIME_TOTALE: tarif.primeTotale, COMMISSION: totalCommission },
    comptes: {
      CLIENT: client, PRIMES_BRANCHE: { compteId: branche.compte_primes_id }, COMPTE_PRODUCTION: compteComptable(cp),
      TAXES: tarif.taxes.map(t => ({ compteId: t.compteId, montant: t.montant, codeTaxeId: t.codeTaxeId })),
      COMMISSIONS_A_PAYER: await Promise.all(commissions.map(async c => ({ ...(await compteCommissions(q, c.intervenantId)), montant: c.montant }))),
    },
  });
  const emi = ecritures.find(e => e.journal === 'EMI')!, enc = ecritures.find(e => e.journal === 'ENC')!, com = ecritures.find(e => e.journal === 'COM');
  await q.query(
    `INSERT INTO quittance (id, numero, police_id, type, periode_debut, periode_fin, prime_nette, accessoires, taxes, prime_totale, mode_paiement, statut, ecriture_constatation_id, ecriture_perception_id)
     VALUES ($1,$2,$3,'EMISSION',$4,$5,$6,$7,$8,$9,'DEPOT','SOLDEE',$10,$11)`,
    [quittanceId, numeroQuittance, policeId, x.dateEffet, dateFin, tarif.primeNette, tarif.accessoires, tarif.primeTotale - tarif.primeNette - tarif.accessoires, tarif.primeTotale, emi.id, enc.id]);
  await q.query(`INSERT INTO police_periode (police_id, rang, date_debut, date_fin, prime_nette, prime_totale, quittance_id, remise_en_vigueur) VALUES ($1,1,$2,$3,$4,$5,$6,false)`,
    [policeId, x.dateEffet, dateFin, tarif.primeNette, tarif.primeTotale, quittanceId]);
  const delai = await entier(q, 'COM_DELAI_PAIEMENT_FACTURE_JOURS');
  for (const c of commissions.filter(y => y.montant > 0)) {
    await q.query(`INSERT INTO commission (police_id, quittance_id, intervenant_id, type, assiette, taux, montant, statut, ecriture_id, echeance_legale) VALUES ($1,$2,$3,'COMMISSION',$4,$5,$6,'DUE',$7,$8)`,
      [policeId, quittanceId, c.intervenantId, tarif.primeNette, c.taux, c.montant, com!.id, ajouterJours(aujourdhui(), delai)]);
  }

  // Débit du compte de production (verrouillé depuis le contrôle du solde)
  const { solde } = await mouvementer(q, acteur, { compteId: cp.id, nature: 'EMISSION', montant: tarif.primeTotale, reference: numero, ecritureId: enc.id });
  await q.query(`UPDATE dossier_souscription SET statut = 'EMIS', police_id = $2, etape_courante = 8 WHERE id = $1`, [dossierId, policeId]);
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'police', objetId: policeId, apres: { numero, quittance: numeroQuittance, primeTotale: tarif.primeTotale, pieces: ecritures.map(e => e.numero) } });
  await publier(q, acteur, { type: 'POLICE_EMISE', objet: { type: 'police', id: policeId }, charge: { numero, assures: x.assures.length, dateEffet: x.dateEffet }, cleIdempotence: `police:${policeId}:emise` });
  if (souscripteur.telephone) {
    await notifier(q, { tiersId: d.souscripteur_id, code: 'POLICE_EMISE', canal: 'SMS', adresse: souscripteur.telephone, objet: { type: 'police', id: policeId },
      variables: { police: numero, date_effet: x.dateEffet.split('-').reverse().join('/'), prime: gnf(tarif.primeTotale) } }).catch(() => undefined);
  }
  return { policeId, numero, quittance: numeroQuittance, primeTotale: tarif.primeTotale, solde, commissions: commissions.map(c => ({ qualite: c.qualite, montant: c.montant })) };
}

// ---------------------------------------------------------------- annulation pour erreur (COM-RG-030, 031 ; CA-COM-06)

export async function proposerAnnulationErreur(q: Executant, acteur: Acteur, policeId: string, motif: string) {
  exiger(motif?.trim(), 'MOTIF_REQUIS', 'Une annulation pour erreur est motivée');
  const p = (await q.query<{ numero: string; statut: string; cree_le: Date }>('SELECT numero, statut, cree_le FROM police WHERE id = $1 FOR UPDATE', [policeId])).rows[0];
  if (!p) throw nonTrouve('Police');
  exiger(p.statut === 'ACTIVE', 'STATUT_INVALIDE', 'Seule une police active s\'annule pour erreur');
  const heures = await entier(q, 'COM_ANNULATION_ERREUR_HEURES');
  const limite = new Date(new Date(p.cree_le).getTime() + heures * 3600_000);
  exiger(limite > new Date(), 'DELAI_DEPASSE', `Délai d'annulation de ${heures} heures dépassé : la résiliation suit les règles du chapitre 8 (COM-RG-032)`);
  const prestations = await q.query(
    `SELECT 1 FROM sinistre WHERE police_id = $1
     UNION ALL SELECT 1 FROM prise_en_charge pc JOIN carte_assure ca ON ca.id = pc.carte_assure_id JOIN police_assure pa ON pa.id = ca.police_assure_id WHERE pa.police_id = $1
     LIMIT 1`, [policeId]);
  exiger(!prestations.rowCount, 'PRESTATION_ENREGISTREE', 'Un sinistre ou une prestation est enregistré : annulation impossible');
  const deja = await q.query(`SELECT 1 FROM demande_validation WHERE type_operation = $1 AND objet_id = $2 AND statut = 'EN_ATTENTE'`, [OPERATION_ANNULATION, policeId]);
  exiger(!deja.rowCount, 'DEMANDE_EN_COURS', 'Une demande d\'annulation est déjà en cours', 409);
  return soumettre(q, acteur, { typeOperation: OPERATION_ANNULATION, objetType: 'police', objetId: policeId, donnees: { numero: p.numero, motif } });
}

enregistrerOperation(OPERATION_ANNULATION, {
  administrative: false,
  // Validée par le Responsable commercial puis par le DAF : contre-passations EVT-04, compte de production recrédité, commission reprise
  async appliquer(q, demande, acteur) {
    const policeId = demande.objet_id;
    const p = (await q.query<{ numero: string; bureau_emetteur_id: string; branche: string }>(
      `SELECT po.numero, po.bureau_emetteur_id, pr.branche_bcrg AS branche FROM police po JOIN produit pr ON pr.id = po.produit_id WHERE po.id = $1 FOR UPDATE OF po`, [policeId])).rows[0]!;
    const qt = (await q.query<{ id: string; numero: string; prime_nette: number; accessoires: number; prime_totale: number; ecriture_constatation_id: string }>(
      `SELECT id, numero, prime_nette, accessoires, prime_totale, ecriture_constatation_id FROM quittance WHERE police_id = $1 AND statut = 'SOLDEE' ORDER BY periode_debut DESC LIMIT 1`, [policeId])).rows[0]!;
    // Taxes et client relus sur l'écriture de constatation d'origine
    const lignes = (await q.query<{ compte_id: string; compte_auxiliaire_id: string | null; debit: number; credit: number; code_taxe_id: string | null }>(
      'SELECT compte_id, compte_auxiliaire_id, debit, credit, code_taxe_id FROM ligne_ecriture WHERE ecriture_id = $1', [qt.ecriture_constatation_id])).rows;
    const client = lignes.find(l => Number(l.debit) > 0 && l.compte_auxiliaire_id)!;
    const taxes = lignes.filter(l => l.code_taxe_id).map(l => ({ compteId: l.compte_id, montant: Number(l.credit), codeTaxeId: l.code_taxe_id! }));
    const commissions = (await q.query<{ id: string; intervenant_id: string; montant: number }>(`SELECT id, intervenant_id, montant FROM commission WHERE quittance_id = $1 AND statut IN ('DUE', 'FACTUREE')`, [qt.id])).rows;
    const cp = await compteProductionDuBureau(q, p.bureau_emetteur_id);
    const branche = (await q.query<{ compte_annulations_id: string }>('SELECT compte_annulations_id FROM branche_comptable WHERE code = $1', [p.branche])).rows[0]!;
    const ecritures = await comptabiliser(q, acteur, {
      codeEvt: 'EVT-04', reference: qt.numero, pieceDocumentId: (await q.query<{ id: string }>(`SELECT id FROM document WHERE objet_type = 'police' AND objet_id = $1 AND type_document = 'QUITTANCE' LIMIT 1`, [policeId])).rows[0]!.id,
      libelle: { police: p.numero },
      montants: { PRIME_NETTE: Number(qt.prime_nette), ACCESSOIRES: Number(qt.accessoires), PRIME_TOTALE: Number(qt.prime_totale), REMBOURSE: Number(qt.prime_totale), PAIEMENT_RISTOURNE: 0, COMMISSION: commissions.reduce((s, c) => s + Number(c.montant), 0) },
      comptes: {
        CLIENT: { compteId: client.compte_id, auxiliaireId: client.compte_auxiliaire_id }, ANNULATIONS_BRANCHE: { compteId: branche.compte_annulations_id }, TAXES: taxes,
        REMBOURSEMENT: compteComptable(cp), COMMISSIONS_A_PAYER: await Promise.all(commissions.map(async c => ({ ...(await compteCommissions(q, c.intervenant_id)), montant: Number(c.montant) }))),
      },
    });
    const enc = ecritures.find(e => e.journal === 'ENC')!;
    await mouvementer(q, acteur, { compteId: cp.id, nature: 'ANNULATION', montant: Number(qt.prime_totale), reference: p.numero, ecritureId: enc.id, ignorerGel: true });
    await q.query(`UPDATE police SET statut = 'ANNULEE' WHERE id = $1`, [policeId]);
    await q.query(`UPDATE quittance SET statut = 'ANNULEE' WHERE id = $1`, [qt.id]);
    // Commission reprise ; une commission déjà facturée sera déduite par avoir (COM-RG-121)
    await q.query(`UPDATE commission SET statut = 'REPRISE' WHERE id = ANY($1)`, [commissions.map(c => c.id)]);
    await q.query(`UPDATE police_assure SET date_sortie = current_date, motif_sortie = 'Annulation pour erreur' WHERE police_id = $1 AND date_sortie IS NULL`, [policeId]);
    await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'police', objetId: policeId, apres: { statut: 'ANNULEE', pieces: ecritures.map(e => e.numero) } });
    await publier(q, acteur, { type: 'POLICE_ANNULEE', objet: { type: 'police', id: policeId }, charge: { numero: p.numero }, cleIdempotence: `police:${policeId}:annulee` });
  },
});

// ---------------------------------------------------------------- consultation

export async function lirePolice(q: Executant, id: string) {
  const p = (await q.query(
    `SELECT po.*, pr.libelle AS produit, pr.code AS code_produit, f.libelle AS formule, f.version AS version_formule, be.code AS bureau,
            trim(t.nom || ' ' || COALESCE(t.prenoms, '')) AS souscripteur, t.code_tiers AS code_souscripteur
       FROM police po JOIN produit pr ON pr.id = po.produit_id JOIN formule f ON f.id = po.formule_id JOIN bureau be ON be.id = po.bureau_emetteur_id
       JOIN tiers t ON t.id = po.souscripteur_id WHERE po.id = $1`, [id])).rows[0];
  if (!p) throw nonTrouve('Police');
  const [assures, periodes, quittances, intervenants, documents, beneficiaires] = await Promise.all([
    q.query(`SELECT pa.id, pa.qualite, pa.rang_carte, pa.date_entree, pa.date_sortie, t.id AS tiers_id, t.code_tiers, trim(t.nom || ' ' || COALESCE(t.prenoms, '')) AS nom, t.date_naissance,
                    (SELECT json_agg(json_build_object('garantie', g.libelle, 'type', g.type, 'accordee', gs.accordee, 'motif', gs.motif_refus) ORDER BY g.code)
                       FROM garantie_souscrite gs JOIN garantie g ON g.id = gs.garantie_id WHERE gs.police_assure_id = pa.id) AS garanties
               FROM police_assure pa JOIN tiers t ON t.id = pa.tiers_id WHERE pa.police_id = $1 ORDER BY pa.rang_carte`, [id]),
    q.query('SELECT rang, date_debut, date_fin, prime_nette, prime_totale, remise_en_vigueur FROM police_periode WHERE police_id = $1 ORDER BY rang', [id]),
    q.query('SELECT id, numero, type, periode_debut, periode_fin, prime_nette, accessoires, taxes, prime_totale, mode_paiement, statut FROM quittance WHERE police_id = $1 ORDER BY periode_debut DESC', [id]),
    q.query(`SELECT pi.qualite, pi.cle_repartition, i.role, trim(t.nom || ' ' || COALESCE(t.prenoms, '')) AS nom,
                    (SELECT COALESCE(sum(c.montant), 0)::bigint FROM commission c WHERE c.police_id = pi.police_id AND c.intervenant_id = pi.intervenant_id AND c.statut <> 'REPRISE') AS commissions
               FROM police_intervenant pi JOIN intervenant i ON i.id = pi.intervenant_id JOIN tiers t ON t.id = i.tiers_id WHERE pi.police_id = $1 AND pi.date_fin IS NULL`, [id]),
    q.query(`SELECT d.id, d.type_document, d.horodatage_scellement, d.imprime FROM document d WHERE d.objet_type = 'police' AND d.objet_id = $1 AND d.supprime_le IS NULL ORDER BY d.horodatage_scellement`, [id]),
    q.query(`SELECT v.version, v.mode, v.clause_texte, v.date_effet, b.quotite, b.rang, b.acceptant, trim(t.nom || ' ' || COALESCE(t.prenoms, '')) AS nom
               FROM designation_version v LEFT JOIN beneficiaire b ON b.designation_version_id = v.id LEFT JOIN tiers t ON t.id = b.tiers_id WHERE v.police_id = $1 ORDER BY v.version DESC, b.rang`, [id]),
  ]);
  const preuve = (await q.query(
    `SELECT p.id, p.niveau, p.horodatage, p.empreinte_document FROM dossier_souscription d JOIN dossier_preuve p ON p.id = d.acceptation_preuve_id WHERE d.police_id = $1`, [id])).rows[0] ?? null;
  // PR-01 : historique daté de la police (journal d'audit)
  const historique = (await q.query(
    `SELECT a.horodatage, a.action, a.valeur_apres, COALESCE(trim(t.nom || ' ' || COALESCE(t.prenoms, '')), 'Système') AS auteur
       FROM journal_audit a LEFT JOIN utilisateur u ON u.id = a.utilisateur_id LEFT JOIN tiers t ON t.id = u.tiers_id
      WHERE a.objet_type = 'police' AND a.objet_id = $1 ORDER BY a.rang DESC LIMIT 100`, [id])).rows;
  return { ...p, assures: assures.rows, periodes: periodes.rows, quittances: quittances.rows, intervenants: intervenants.rows, documents: documents.rows, beneficiaires: beneficiaires.rows, preuveAcceptation: preuve, historique };
}

export async function rechercherPolices(q: Executant, f: { recherche?: string; bureaux: string[] | null; statut?: string }) {
  return (await q.query(
    `SELECT po.id, po.numero, po.statut, po.date_premiere_effet, b.code AS bureau, pr.libelle AS produit, trim(t.nom || ' ' || COALESCE(t.prenoms, '')) AS souscripteur,
            (SELECT max(date_fin) FROM police_periode pp WHERE pp.police_id = po.id) AS echeance
       FROM police po JOIN bureau b ON b.id = po.bureau_gestion_id JOIN produit pr ON pr.id = po.produit_id JOIN tiers t ON t.id = po.souscripteur_id
      WHERE ($1::text IS NULL OR po.numero LIKE $1 || '%' OR t.nom ILIKE '%' || $1 || '%' OR t.code_tiers = upper($1))
        AND ($2::text[] IS NULL OR b.code = ANY($2)) AND ($3::text IS NULL OR po.statut = $3)
      ORDER BY po.cree_le DESC LIMIT 200`, [f.recherche ?? null, f.bureaux, f.statut ?? null])).rows;
}

