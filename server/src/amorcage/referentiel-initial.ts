/**
 * Référentiel initial chargé à l'installation (lot 1). Modifiable ensuite par paramétrage.
 * Sources : CDC V1.4 § 3.2 (organisation), annexe B et correctifs V1.3 (profils), annexe C (paramètres), ARC-RG-003 (règles légales).
 */

// ---------------------------------------------------------------- Organisation initiale (§ 3.2)

export const DEPARTEMENTS: { code: string; libelle: string; services: [string, string][] }[] = [
  { code: 'DG', libelle: 'Direction générale', services: [['DG_SEC', 'Secrétariat de direction']] },
  { code: 'COM', libelle: 'Commercial', services: [['COM_RES', 'Réseau d\'agents'], ['COM_BUR', 'Bureaux directs']] },
  { code: 'PROD', libelle: 'Production', services: [['PROD_SOU', 'Souscription'], ['PROD_CLI', 'Service clients et réclamations']] },
  { code: 'SANTE', libelle: 'Santé (prestations)', services: [['SAN_RES', 'Réseau de soins'], ['SAN_MED', 'Service médical (médecin-conseil)']] },
  { code: 'SIN', libelle: 'Sinistres', services: [['SIN_ACC', 'Accident'], ['SIN_DEC', 'Décès']] },
  { code: 'FIN', libelle: 'Finances et comptabilité', services: [['FIN_CPT', 'Comptabilité'], ['FIN_TRE', 'Trésorerie'], ['FIN_CDG', 'Contrôle de gestion']] },
  { code: 'CONF', libelle: 'Conformité', services: [['CONF_LAB', 'Conformité et lutte anti-blanchiment']] },
  { code: 'ADMSI', libelle: 'Administration et SI', services: [['ADM_ACC', 'Administration des accès'], ['ADM_SUP', 'Support']] },
];

/** Fonction de l'Administrateur général créée à l'installation. */
export const FONCTION_ADMIN = { code: 'ADMIN_GENERAL', libelle: 'Administrateur général', service: 'ADM_ACC' };

// ---------------------------------------------------------------- Fonctions du système (droits)

export const FONCTIONS_SYSTEME: Record<string, string> = {
  BUREAUX: 'Bureaux directs',
  COMPTE_PRODUCTION: 'Compte de production de l\'agent',
  SOUSCRIPTION: 'Souscription, émission',
  AVENANT: 'Avenants, résiliations',
  ANNULATION_ERREUR: 'Annulation pour erreur',
  RESTITUTION: 'Restitution du compte de production',
  ACCORD_PREALABLE: 'Accords préalables',
  FACTURE_PRESTATAIRE: 'Factures prestataires',
  DECISION_SINISTRE: 'Décision de sinistre',
  PAIEMENT: 'Paiements',
  ECRITURE_MANUELLE: 'Écritures manuelles',
  PLAN_COMPTES: 'Plan de comptes, schémas',
  JOURNAUX_TIERS: 'Journaux, tiers comptables',
  FACTURE_ACHAT: 'Factures d\'achat',
  IMMOBILISATION: 'Immobilisations (fiches, cessions)',
  DECLARATION_TAXE: 'Déclarations de taxes',
  UTILISATEURS_PRESTATAIRES: 'Utilisateurs des prestataires',
  CONTRAT_COLLECTIF: 'Contrats collectifs (appels, régularisations)',
  BENEFICIAIRES: 'Bénéficiaires du capital décès',
  MOTIF_BLOCAGE: 'Motifs de blocage',
  AGREMENT: 'Agrément des agents généraux, prescripteurs et codes',
  COMPTES_RESEAU: 'Comptes des juniors et collaborateurs',
  MOUVEMENT_PORTEFEUILLE: 'Mouvements de portefeuille',
  FACTURE_COMMISSION: 'Factures de commissions',
  CARTE_PRO: 'Cartes professionnelles',
  SOUSCRIPTION_EN_LIGNE: 'Souscriptions en ligne (cellule Canal digital)',
  FICHE_IMPUTATION: 'Fiche d\'imputation',
  ANNUAIRE: 'Annuaire, options des structures',
  ORGANISATION: 'Organisation',
  UTILISATEURS: 'Utilisateurs et habilitations',
  ALERTES_CONFORMITE: 'Alertes de conformité',
  // Fonctions du socle (lot 1)
  AUDIT: 'Journal d\'audit',
  PARAMETRES: 'Paramètres et règles légales',
  DELEGATIONS: 'Délégations et intérims',
  SOCIETE: 'Fiche de la Compagnie',
  TIERS: 'Référentiel des tiers',
  CATALOGUE: 'Catalogue des produits',
  NOMENCLATURES: 'Nomenclatures et jours fériés',
  MODELES: 'Modèles de documents et de notifications',
  RECLAMATIONS: 'Réclamations',
};

// ---------------------------------------------------------------- Profils (annexe B + correctifs V1.3)

export const PROFILS: { code: string; libelle: string; externe?: boolean }[] = [
  { code: 'ADMIN_GENERAL', libelle: 'Administrateur général' },
  { code: 'DIRECTION_GENERALE', libelle: 'Direction générale' },
  { code: 'AGENT_GENERAL', libelle: 'Agent général', externe: true },
  { code: 'COLLABORATEUR', libelle: 'Collaborateur d\'agent général', externe: true },
  { code: 'JUNIOR', libelle: 'Junior', externe: true },
  { code: 'PRESCRIPTEUR', libelle: 'Prescripteur partenaire', externe: true },
  { code: 'RESP_COMMERCIAL', libelle: 'Responsable commercial (Direction commerciale)' },
  { code: 'CANAL_DIGITAL', libelle: 'Cellule Canal digital' },
  { code: 'GEST_PRODUCTION', libelle: 'Gestionnaire production' },
  { code: 'GEST_SANTE', libelle: 'Gestionnaire santé' },
  { code: 'MEDECIN_CONSEIL', libelle: 'Médecin-conseil' },
  { code: 'GEST_SINISTRES', libelle: 'Gestionnaire sinistres' },
  { code: 'COMPTABLE', libelle: 'Comptable' },
  { code: 'TRESORIER', libelle: 'Trésorier' },
  { code: 'CAISSIER', libelle: 'Caissier' },
  { code: 'DAF', libelle: 'Directeur administratif et financier' },
  { code: 'CONFORMITE', libelle: 'Conformité' },
  { code: 'COMITE_PARAMETRAGE', libelle: 'Comité de paramétrage' },
];

/**
 * Matrice : fonction → profil → droits.
 * C consulter, S saisir (créer et modifier), V1 / V2 valider niveau 1 / 2, P paramétrer, M modifier seul.
 */
type Code = 'C' | 'S' | 'V1' | 'V2' | 'P' | 'M' | 'X';
export const MATRICE: Record<string, Partial<Record<string, Code[]>>> = {
  BUREAUX: { AGENT_GENERAL: ['C'], RESP_COMMERCIAL: ['S', 'P'], GEST_PRODUCTION: ['C'], COMPTABLE: ['C'], TRESORIER: ['C'], DAF: ['C'], CONFORMITE: ['C'], ADMIN_GENERAL: ['P'], DIRECTION_GENERALE: ['C'] },
  COMPTE_PRODUCTION: { AGENT_GENERAL: ['C', 'S'], RESP_COMMERCIAL: ['C'], TRESORIER: ['S'], CAISSIER: ['S'], DAF: ['C'], CONFORMITE: ['C'], DIRECTION_GENERALE: ['C'] },
  SOUSCRIPTION: { AGENT_GENERAL: ['S'], COLLABORATEUR: ['S'], JUNIOR: ['S'], CANAL_DIGITAL: ['S'], RESP_COMMERCIAL: ['C'], GEST_PRODUCTION: ['C', 'S'], COMPTABLE: ['C'], TRESORIER: ['C'], DAF: ['C'], CONFORMITE: ['C'], DIRECTION_GENERALE: ['C'] },
  AVENANT: { AGENT_GENERAL: ['S'], COLLABORATEUR: ['S'], RESP_COMMERCIAL: ['C'], GEST_PRODUCTION: ['S', 'V1'], COMPTABLE: ['C'], TRESORIER: ['C'], DAF: ['V2'], CONFORMITE: ['C'], DIRECTION_GENERALE: ['C'] },
  ANNULATION_ERREUR: { AGENT_GENERAL: ['S'], RESP_COMMERCIAL: ['V1'], GEST_PRODUCTION: ['C'], COMPTABLE: ['C'], TRESORIER: ['C'], DAF: ['V2'], DIRECTION_GENERALE: ['C'] },
  RESTITUTION: { AGENT_GENERAL: ['S'], RESP_COMMERCIAL: ['V1'], TRESORIER: ['S'], DAF: ['V2'], CONFORMITE: ['C'], DIRECTION_GENERALE: ['C'] },
  ACCORD_PREALABLE: { MEDECIN_CONSEIL: ['C', 'V1'] },
  FACTURE_PRESTATAIRE: { GEST_SANTE: ['S', 'V1'], COMPTABLE: ['C'], TRESORIER: ['C'], DAF: ['V2'], DIRECTION_GENERALE: ['C'] },
  DECISION_SINISTRE: { AGENT_GENERAL: ['S'], MEDECIN_CONSEIL: ['C'], GEST_SINISTRES: ['S', 'V1'], COMPTABLE: ['C'], TRESORIER: ['C'], DAF: ['V2'], CONFORMITE: ['C'], DIRECTION_GENERALE: ['C', 'V2'] },
  PAIEMENT: { TRESORIER: ['S'], DAF: ['V2'], DIRECTION_GENERALE: ['C', 'V2'] },
  ECRITURE_MANUELLE: { COMPTABLE: ['S', 'V1'], DAF: ['V2'] },
  PLAN_COMPTES: { COMPTABLE: ['P'], DAF: ['V1'] },
  JOURNAUX_TIERS: { COMPTABLE: ['S', 'P'], DAF: ['V1'], CONFORMITE: ['C'] },
  FACTURE_ACHAT: { COMPTABLE: ['S', 'V1'], DAF: ['V2'] },
  IMMOBILISATION: { COMPTABLE: ['S', 'V1'], DAF: ['V2'] },
  DECLARATION_TAXE: { COMPTABLE: ['S', 'V1'], DAF: ['V2'], CONFORMITE: ['C'] },
  UTILISATEURS_PRESTATAIRES: { GEST_SANTE: ['C', 'M'], CONFORMITE: ['C'], ADMIN_GENERAL: ['C'] },
  CONTRAT_COLLECTIF: { AGENT_GENERAL: ['S'], RESP_COMMERCIAL: ['C'], GEST_PRODUCTION: ['S', 'V1'], TRESORIER: ['S'], DAF: ['V2'], CONFORMITE: ['C'] },
  BENEFICIAIRES: { AGENT_GENERAL: ['S'], COLLABORATEUR: ['S'], RESP_COMMERCIAL: ['C'], GEST_PRODUCTION: ['C', 'S'], GEST_SINISTRES: ['C'], CONFORMITE: ['C'] },
  MOTIF_BLOCAGE: { GEST_PRODUCTION: ['S'], GEST_SANTE: ['S'], MEDECIN_CONSEIL: ['S'], GEST_SINISTRES: ['S'], CONFORMITE: ['S'], ADMIN_GENERAL: ['C'] },
  AGREMENT: { RESP_COMMERCIAL: ['S', 'V1'], CONFORMITE: ['V2'] },
  COMPTES_RESEAU: { AGENT_GENERAL: ['S', 'V1'], RESP_COMMERCIAL: ['C'], CONFORMITE: ['C'] },
  MOUVEMENT_PORTEFEUILLE: { AGENT_GENERAL: ['S'], RESP_COMMERCIAL: ['V1'], CONFORMITE: ['C'] },
  FACTURE_COMMISSION: { AGENT_GENERAL: ['C'], COLLABORATEUR: ['C'], JUNIOR: ['C'], PRESCRIPTEUR: ['C'], RESP_COMMERCIAL: ['V1'], TRESORIER: ['S'], DAF: ['C'] },
  CARTE_PRO: { AGENT_GENERAL: ['C'], JUNIOR: ['C'], RESP_COMMERCIAL: ['S', 'V1'], CONFORMITE: ['C'] },
  SOUSCRIPTION_EN_LIGNE: { CANAL_DIGITAL: ['S'], RESP_COMMERCIAL: ['S', 'V1'], GEST_PRODUCTION: ['C'], CONFORMITE: ['C'] },
  FICHE_IMPUTATION: { COMPTABLE: ['S', 'V1'], DAF: ['V2'] },
  ANNUAIRE: { GEST_SANTE: ['P'] },
  ORGANISATION: { ADMIN_GENERAL: ['C', 'S', 'P', 'V1'], DIRECTION_GENERALE: ['C', 'V1'] },
  UTILISATEURS: { ADMIN_GENERAL: ['C', 'S', 'P', 'V1'], CONFORMITE: ['C'], DIRECTION_GENERALE: ['C'] },
  ALERTES_CONFORMITE: { CONFORMITE: ['S', 'V1'] },
  AUDIT: { ADMIN_GENERAL: ['C', 'X'], CONFORMITE: ['C', 'X'], DIRECTION_GENERALE: ['C'] },
  PARAMETRES: { ADMIN_GENERAL: ['C', 'S'], COMITE_PARAMETRAGE: ['C', 'V1'], CONFORMITE: ['C', 'V2'], DIRECTION_GENERALE: ['C'] },
  DELEGATIONS: { ADMIN_GENERAL: ['C', 'P'], DIRECTION_GENERALE: ['C'], AGENT_GENERAL: ['S'], RESP_COMMERCIAL: ['S'], GEST_PRODUCTION: ['S'], GEST_SANTE: ['S'], MEDECIN_CONSEIL: ['S'], GEST_SINISTRES: ['S'], COMPTABLE: ['S'], TRESORIER: ['S'], DAF: ['S'], CONFORMITE: ['S'] },
  SOCIETE: { ADMIN_GENERAL: ['C', 'S'], DAF: ['C', 'V1'], DIRECTION_GENERALE: ['C', 'V1'] },
  TIERS: { AGENT_GENERAL: ['C', 'S'], COLLABORATEUR: ['C', 'S'], JUNIOR: ['C', 'S'], CANAL_DIGITAL: ['C', 'S'], RESP_COMMERCIAL: ['C'], GEST_PRODUCTION: ['C', 'S', 'V1'], GEST_SANTE: ['C'], GEST_SINISTRES: ['C', 'S'], COMPTABLE: ['C', 'S'], TRESORIER: ['C'], DAF: ['C', 'V1'], CONFORMITE: ['C'], ADMIN_GENERAL: ['C', 'S'], DIRECTION_GENERALE: ['C'] },
  CATALOGUE: { GEST_PRODUCTION: ['C', 'S'], GEST_SANTE: ['C'], RESP_COMMERCIAL: ['C'], COMITE_PARAMETRAGE: ['C', 'V1'], DAF: ['C'], DIRECTION_GENERALE: ['C'], AGENT_GENERAL: ['C'], COLLABORATEUR: ['C'], JUNIOR: ['C'], CANAL_DIGITAL: ['C'] },
  NOMENCLATURES: { GEST_SANTE: ['C', 'S'], MEDECIN_CONSEIL: ['C', 'S'], COMITE_PARAMETRAGE: ['C', 'V1'], ADMIN_GENERAL: ['C', 'S'] },
  MODELES: { ADMIN_GENERAL: ['C', 'S'], COMITE_PARAMETRAGE: ['C', 'V1'], GEST_PRODUCTION: ['C'] },
  RECLAMATIONS: { GEST_PRODUCTION: ['C', 'S'], GEST_SANTE: ['C', 'S'], GEST_SINISTRES: ['C', 'S'], CONFORMITE: ['C', 'S'], DIRECTION_GENERALE: ['C'] },
};

/** Profils incompatibles (ORG-RG-042, correctifs V1.3). L'administrateur est en outre incompatible avec tout profil validant une opération métier. */
export const INCOMPATIBILITES: [string, string, string][] = [
  ['COMPTABLE', 'TRESORIER', 'Le comptable valide les écritures, le trésorier exécute les paiements'],
  ['COMPTABLE', 'CAISSIER', 'Caissier et comptable validant les paiements (ORG-RG-042)'],
  ['TRESORIER', 'DAF', 'Exécution et validation de niveau 2 d\'un même paiement'],
];

/** Circuits de validation initiaux (ORG-RG-041). Les circuits des lots suivants sont ajoutés avec leurs modules. */
export const DELEGATIONS: { type: string; niveaux: { niveau: number; profils: string[] }[] }[] = [
  { type: 'ORGANISATION', niveaux: [{ niveau: 1, profils: ['ADMIN_GENERAL', 'DIRECTION_GENERALE'] }] },
  { type: 'ATTRIBUTION_PROFIL_PRIVILEGIE', niveaux: [{ niveau: 1, profils: ['ADMIN_GENERAL', 'DIRECTION_GENERALE'] }] },
  { type: 'PARAMETRAGE', niveaux: [{ niveau: 1, profils: ['COMITE_PARAMETRAGE'] }] },
  { type: 'PARAMETRAGE_REGLE_LEGALE', niveaux: [{ niveau: 1, profils: ['COMITE_PARAMETRAGE'] }, { niveau: 2, profils: ['CONFORMITE'] }] },
  { type: 'FICHE_SOCIETE', niveaux: [{ niveau: 1, profils: ['DAF', 'DIRECTION_GENERALE'] }] },
  { type: 'COORDONNEE_PAIEMENT', niveaux: [{ niveau: 1, profils: ['COMPTABLE', 'DAF'] }] },
  { type: 'CATALOGUE', niveaux: [{ niveau: 1, profils: ['COMITE_PARAMETRAGE'] }] },
  { type: 'SCHEMA_COMPTABLE', niveaux: [{ niveau: 1, profils: ['DAF'] }] },
  { type: 'EXTOURNE_ECRITURE', niveaux: [{ niveau: 1, profils: ['DAF'] }] },
  { type: 'AGREMENT_INTERVENANT', niveaux: [{ niveau: 1, profils: ['RESP_COMMERCIAL'] }, { niveau: 2, profils: ['CONFORMITE'] }] },
  { type: 'FACTURE_COMMISSION', niveaux: [{ niveau: 1, profils: ['RESP_COMMERCIAL'] }] },
  { type: 'PAIEMENT_COMMISSION', niveaux: [{ niveau: 1, profils: ['DAF'] }] },
  { type: 'AFFECTATION_COMMISSION', niveaux: [{ niveau: 1, profils: ['DAF'] }] },
  { type: 'ANNULATION_ERREUR', niveaux: [{ niveau: 1, profils: ['RESP_COMMERCIAL'] }, { niveau: 2, profils: ['DAF'] }] },
  { type: 'RESTITUTION_COMPTE_PRODUCTION', niveaux: [{ niveau: 1, profils: ['RESP_COMMERCIAL'] }, { niveau: 2, profils: ['DAF'] }] },
  { type: 'MOUVEMENT_PORTEFEUILLE', niveaux: [{ niveau: 1, profils: ['RESP_COMMERCIAL'] }] },
  { type: 'ECRITURE_MANUELLE', niveaux: [{ niveau: 1, profils: ['COMPTABLE'] }, { niveau: 2, profils: ['DAF'] }] },
  { type: 'DECLARATION_TAXE', niveaux: [{ niveau: 1, profils: ['COMPTABLE'] }, { niveau: 2, profils: ['DAF'] }] },
  { type: 'FACTURE_ACHAT', niveaux: [{ niveau: 1, profils: ['COMPTABLE'] }, { niveau: 2, profils: ['DAF'] }] },
  { type: 'SORTIE_IMMOBILISATION', niveaux: [{ niveau: 1, profils: ['COMPTABLE'] }, { niveau: 2, profils: ['DAF'] }] },
  { type: 'PAIEMENT_FOURNISSEUR', niveaux: [{ niveau: 1, profils: ['DAF'] }] },
  { type: 'PAIEMENT_TAXE', niveaux: [{ niveau: 1, profils: ['DAF'] }] },
  { type: 'AVENANT_CORRECTION', niveaux: [{ niveau: 1, profils: ['GEST_PRODUCTION'] }] },
  { type: 'RETRAIT_AYANT_DROIT', niveaux: [{ niveau: 1, profils: ['GEST_PRODUCTION'] }] },
  { type: 'RESILIATION', niveaux: [{ niveau: 1, profils: ['GEST_PRODUCTION'] }, { niveau: 2, profils: ['DAF'] }] },
  { type: 'PAIEMENT_RIST', niveaux: [{ niveau: 1, profils: ['DAF'] }] },
];

// ---------------------------------------------------------------- Règles légales (ARC-RG-003, annexe C)

export const REGLES_LEGALES: { code: string; texte: string; description: string; verrouillee: boolean }[] = [
  { code: 'ART30', texte: 'Code des assurances, art. 30', description: 'Non-paiement de la prime : mise en demeure, suspension puis résiliation après les délais légaux minimaux', verrouillee: true },
  { code: 'ART193_194', texte: 'Code des assurances, art. 193 et 194', description: 'Assurance en cas de décès interdite sur la tête d\'un mineur de moins de 12 ans ; consentement de l\'assuré', verrouillee: true },
  { code: 'ART221', texte: 'Code des assurances, art. 221', description: 'Contrats de groupe : exclusion d\'un adhérent pour non-paiement au plus tôt 40 jours après la mise en demeure', verrouillee: true },
  { code: 'ART368', texte: 'Code des assurances, art. 368', description: 'Plafond de rémunération des intermédiaires par police', verrouillee: true },
];

// ---------------------------------------------------------------- Paramètres (annexe C et socle)

type P = [code: string, libelle: string, module: string, type: 'ENTIER' | 'MONTANT' | 'TAUX' | 'DUREE' | 'BOOLEEN' | 'TEXTE' | 'LISTE', defaut: string, regle?: string, sens?: 'HAUSSE' | 'BAISSE'];
export const PARAMETRES: P[] = [
  // Socle et sécurité (ORG-RG-022, 023, 045 ; § 4.6)
  ['SECURITE_ECHECS_MAX', 'Échecs de connexion avant suspension', 'ADM', 'ENTIER', '5'],
  ['SECURITE_MDP_LONGUEUR_MIN', 'Longueur minimale du mot de passe', 'ADM', 'ENTIER', '12'],
  ['SECURITE_DUREE_SESSION_MIN', 'Durée d\'une session (minutes)', 'ADM', 'DUREE', '480'],
  ['REVUE_HABILITATIONS_MOIS', 'Périodicité de la revue des habilitations (mois)', 'ADM', 'DUREE', '6'],
  ['AUDIT_CONSERVATION_ANS', 'Conservation du journal d\'audit (ans)', 'ADM', 'DUREE', '10'],
  ['CONSERVATION_PIECES_ANS', 'Conservation des pièces et journaux (ans)', 'CNF', 'DUREE', '10'],
  ['NUM_ALERTE_CAPACITE', 'Seuil d\'alerte des compteurs de numérotation', 'ADM', 'TAUX', '0.95'],
  // Référentiels (chapitre 5)
  ['TIERS_SEUIL_DOUBLON', 'Seuil de ressemblance bloquant la création d\'un tiers (sur 100)', 'REF', 'ENTIER', '90'],
  ['TIERS_MAX_CONJOINTS', 'Nombre maximal de conjoints par assuré principal', 'REF', 'ENTIER', '4'],
  ['AGE_LIMITE_ENFANT_CHARGE', 'Âge limite d\'un enfant à charge', 'REF', 'ENTIER', '21'],
  ['AGE_LIMITE_ETUDIANT', 'Âge limite d\'un enfant étudiant', 'REF', 'ENTIER', '25'],
  ['AGE_MIN_GARANTIE_DECES', 'Âge minimal pour une garantie décès', 'REF', 'ENTIER', '12', 'ART193_194', 'HAUSSE'],
  ['FOYER_PREAVIS_AGE_LIMITE_JOURS', 'Préavis de la notification d\'un enfant atteignant l\'âge limite (jours)', 'REF', 'DUREE', '30'],
  ['COORDONNEE_CARENCE_HEURES', 'Carence avant le premier paiement sur des coordonnées modifiées (heures)', 'REF', 'DUREE', '72'],
  ['BUREAU_ALERTE_CODES', 'Nombre de codes bureau utilisés déclenchant l\'alerte', 'REF', 'ENTIER', '90'],
  // Commercial (chapitre 7)
  ['COM_APPRO_MINIMUM', 'Montant minimum d\'approvisionnement du compte de production (GNF)', 'COM', 'MONTANT', '10000000'],
  ['COM_CLE_APPORTEUR', 'Clé de répartition : part de l\'apporteur (junior) dans la commission de la police', 'COM', 'TAUX', '0.30'],
  ['COM_CLE_PRESCRIPTEUR', 'Clé de répartition : part du prescripteur dans la commission de la police', 'COM', 'TAUX', '0.20'],
  ['COM_ANNULATION_ERREUR_HEURES', 'Délai d\'annulation pour erreur (heures)', 'COM', 'DUREE', '48'],
  ['COM_CONCENTRATION_CODE_NOMBRE', 'Concentration anormale : polices obtenues sur un même code prescripteur dans la fenêtre (alerte à la Conformité)', 'COM', 'ENTIER', '10'],
  ['COM_CONCENTRATION_CODE_JOURS', 'Concentration anormale : fenêtre d\'observation des souscriptions sur un code (jours)', 'COM', 'DUREE', '30'],
  ['COM_INACTIVITE_MOIS', 'Inactivité d\'un compte de production avant alerte (mois)', 'COM', 'DUREE', '12'],
  ['COM_MODE_EMISSION', 'Mode d\'émission au bureau', 'COM', 'LISTE', 'COMPTE_PRODUCTION'],
  ['COM_PAIEMENT_DIRECT_ACTIF', 'Mode d\'émission PAIEMENT_DIRECT activé', 'COM', 'BOOLEEN', 'NON'],
  ['COM_FACTURATION_PERIODICITE', 'Facturation des commissions', 'COM', 'LISTE', 'MENSUELLE'],
  ['COM_SEUIL_VALIDATION_OFFICE', 'Seuil de validation d\'office des factures de commissions (GNF, 0 = désactivé)', 'COM', 'MONTANT', '0'],
  ['COM_DELAI_PAIEMENT_FACTURE_JOURS', 'Délai de paiement des factures de commissions (jours)', 'COM', 'DUREE', '30'],
  ['COM_PRIME_ANTICIPE_DELAI_JOURS', 'Prime de renouvellement anticipé : délai (jours)', 'COM', 'DUREE', '30'],
  ['COM_JUNIOR_CONTROLE_JOURS', 'Délai des contrôles de conformité d\'un junior (jours)', 'COM', 'DUREE', '15'],
  ['COM_DOSSIER_EXPIRATION_JOURS', 'Expiration d\'un dossier préparé non validé (jours)', 'COM', 'DUREE', '30'],
  ['COM_EXCLUSIVITE_PROSPECT_JOURS', 'Exclusivité d\'un prospect (jours)', 'COM', 'DUREE', '90'],
  ['COM_CODE_PRESCRIPTEUR_MIN', 'Longueur minimale du code prescripteur', 'COM', 'ENTIER', '4'],
  ['COM_CODE_PRESCRIPTEUR_MAX', 'Longueur maximale du code prescripteur', 'COM', 'ENTIER', '20'],
  ['COM_CODES_INTERDITS', 'Mots interdits dans un code prescripteur (séparés par des virgules)', 'COM', 'LISTE', 'CGS,PROSPECT,ASSURANCE,ASSUR,POLICE,SINISTRE,ADMIN,ARNAQUE'],
  ['COM_INACTIVITE_JUNIOR_MOIS', 'Inactivité prolongée d\'un junior permettant le transfert de ses clients (mois)', 'COM', 'DUREE', '6'],
  ['COM_REVALIDATION_CARTE_PRO', 'Revalidation périodique de la carte professionnelle', 'COM', 'BOOLEEN', 'NON'],
  // Production (chapitre 8)
  ['PROD_EXPIRATION_PROPOSITION_JOURS', 'Expiration d\'une proposition (jours)', 'PRD', 'DUREE', '30'],
  ['PROD_RENOUVELLEMENT_PREPARATION_JOURS', 'Préparation du renouvellement (jours avant l\'échéance)', 'PRD', 'DUREE', '30'],
  ['PROD_RAPPELS_RENOUVELLEMENT', 'Rappels de renouvellement', 'PRD', 'LISTE', 'J-30,J-15,J-7,J-1'],
  ['PROD_PAIEMENT_DIRECT_RENOUVELLEMENT', 'Paiement direct du renouvellement par le client', 'PRD', 'BOOLEEN', 'OUI'],
  ['PROD_DELAI_GRACE_JOURS', 'Délai de grâce (jours)', 'PRD', 'DUREE', '0'],
  ['PROD_DELAI_REMISE_VIGUEUR_JOURS', 'Délai de remise en vigueur (jours)', 'PRD', 'DUREE', '30'],
  ['PROD_MISE_EN_DEMEURE_JOURS', 'Mise en demeure après l\'échéance impayée (jours)', 'PRD', 'DUREE', '10', 'ART30', 'HAUSSE'],
  ['PROD_SUSPENSION_JOURS', 'Suspension après l\'envoi de la mise en demeure (jours)', 'PRD', 'DUREE', '30', 'ART30', 'HAUSSE'],
  ['PROD_RESILIATION_JOURS', 'Résiliation après la suspension (jours)', 'PRD', 'DUREE', '10', 'ART30', 'HAUSSE'],
  ['PROD_EXCLUSION_ADHERENT_JOURS', 'Exclusion d\'un adhérent après la mise en demeure du souscripteur (jours)', 'PRD', 'DUREE', '40', 'ART221', 'HAUSSE'],
  ['PROD_MOUVEMENT_EFFECTIF_ANTERIORITE_JOURS', 'Antériorité maximale d\'un mouvement d\'effectif (jours)', 'PRD', 'DUREE', '30'],
  ['PROD_REGULARISATION_DELAI_JOURS', 'Délai de paiement d\'une régularisation (jours)', 'PRD', 'DUREE', '15'],
  ['PROD_DESIGNATION_DELEGUEE', 'Désignation des bénéficiaires déléguée à l\'adhérent', 'PRD', 'BOOLEEN', 'NON'],
  ['PROD_AVANCE_CONSERVATION_MOIS', 'Conservation d\'une avance incomplète (mois)', 'PRD', 'DUREE', '12'],
  ['PROD_APPEL_RENOUVELLEMENT_COLLECTIF_JOURS', 'Appel de renouvellement des contrats collectifs (jours avant l\'échéance)', 'PRD', 'DUREE', '45'],
  ['PROD_DELAI_RENONCIATION_JOURS', 'Délai de renonciation après une souscription en ligne, à défaut de délai propre au produit (jours, à confirmer en annexe E)', 'PRD', 'DUREE', '30'],
  ['PROD_PASSERELLE_INDIVIDUEL', 'Passerelle vers un contrat individuel', 'PRD', 'BOOLEEN', 'NON'],
  ['RECLAMATION_DELAI_JOURS_OUVRABLES', 'Délai de traitement d\'une réclamation (jours ouvrables)', 'PRD', 'DUREE', '15'],
  // Santé (chapitre 9)
  ['SAN_VALIDITE_CARTE_ANS', 'Validité du support de carte (ans)', 'SAN', 'DUREE', '3'],
  ['SAN_CARTE_PHYSIQUE', 'Carte physique d\'assuré', 'SAN', 'LISTE', 'SUR_DEMANDE'],
  ['SAN_ACCES_CARNET_HEURES', 'Durée d\'accès au carnet de santé (heures)', 'SAN', 'DUREE', '24'],
  ['SAN_DELAI_PAIEMENT_PRESTATAIRES_JOURS', 'Délai de paiement des prestataires (jours)', 'SAN', 'DUREE', '30'],
  ['SAN_VALIDITE_ORDONNANCE_JOURS', 'Validité des ordonnances et bons d\'examens (jours)', 'SAN', 'DUREE', '7'],
  ['SAN_CONSULTATION_CONTROLE_JOURS', 'Délai d\'une consultation de contrôle (jours)', 'SAN', 'DUREE', '7'],
  ['SAN_FACTURATION_DELAI_JOURS', 'Délai de facturation d\'une prestation (jours)', 'SAN', 'DUREE', '45'],
  ['SAN_PHARMACIE_GARDE', 'Option « pharmacie de garde »', 'SAN', 'BOOLEEN', 'NON'],
  ['SAN_ANNULATION_RDV_HEURES', 'Annulation d\'un rendez-vous de téléconsultation (heures avant)', 'SAN', 'DUREE', '2'],
  ['SAN_TICKET_MODERATEUR_TELECONSULTATION', 'Ticket modérateur en téléconsultation', 'SAN', 'BOOLEEN', 'OUI'],
  ['SAN_SAISIE_DIFFEREE_HEURES', 'Saisie différée des actes en mode dégradé (heures)', 'SAN', 'DUREE', '72'],
  ['SAN_PEC_URGENCE_HEURES', 'Prise en charge d\'urgence provisoire (heures)', 'SAN', 'DUREE', '72'],
  // Sinistres (chapitre 10)
  ['SIN_DELAI_DECLARATION_JOURS', 'Délai de déclaration d\'un sinistre (jours ouvrables)', 'SIN', 'DUREE', '10'],
  ['SIN_DELAI_FORCE_MAJEURE_JOURS', 'Prolongation en cas de force majeure (jours ouvrables)', 'SIN', 'DUREE', '5'],
  ['SIN_DELAI_DECISION_JOURS', 'Délai de décision d\'un sinistre (jours ouvrables)', 'SIN', 'DUREE', '30'],
  ['SIN_DELAI_PAIEMENT_JOURS', 'Délai de paiement d\'un sinistre (jours)', 'SIN', 'DUREE', '30'],
  ['SIN_FENETRE_DOUBLON_JOURS', 'Fenêtre de doublon d\'un accident (± jours)', 'SIN', 'DUREE', '1'],
  ['SIN_SEUIL_REEVALUATION_PROVISION', 'Seuil de réévaluation d\'une provision soumise à validation (GNF)', 'SIN', 'MONTANT', '5000000'],
  // Finances (chapitre 11)
  // Collectifs des rôles à incidence comptable (REF-RG-004, FIN-RG-003 ; comptes proposés au § 11.10)
  ['COLLECTIF_COMPTE_PRODUCTION', 'Collectif des comptes de production des agents', 'FIN', 'TEXTE', '4111'],
  ['COLLECTIF_VERSEMENTS_AVANCE', 'Collectif des versements programmés reçus d\'avance', 'FIN', 'TEXTE', '4191'],
  ['COLLECTIF_SOUSCRIPTEUR', 'Collectif des souscripteurs (assurés)', 'FIN', 'TEXTE', '412'],
  ['COLLECTIF_AGENT_GENERAL', 'Collectif des commissions à payer aux agents généraux', 'FIN', 'TEXTE', '4112'],
  ['COLLECTIF_APPORTEUR', 'Collectif des commissions à payer aux juniors et prescripteurs', 'FIN', 'TEXTE', '4113'],
  ['COLLECTIF_PRESTATAIRE', 'Collectif des prestataires de santé et pharmacies', 'FIN', 'TEXTE', '4681'],
  ['COLLECTIF_FOURNISSEUR', 'Collectif des fournisseurs', 'FIN', 'TEXTE', '461'],
  ['COLLECTIF_BENEFICIAIRE', 'Collectif des bénéficiaires d\'indemnités', 'FIN', 'TEXTE', '4161'],
  ['FIN_LONGUEUR_AUXILIAIRES', 'Longueur des comptes auxiliaires', 'FIN', 'ENTIER', '10'],
  ['FIN_EXERCICES_OUVERTS_MAX', 'Exercices ouverts simultanément', 'FIN', 'ENTIER', '2'],
  ['FIN_SEUIL_FAIBLE_VALEUR', 'Seuil des biens de faible valeur (GNF HT)', 'FIN', 'MONTANT', '5000000'],
  ['FIN_PLAFOND_VEHICULES', 'Plafond de base amortissable des véhicules de tourisme (GNF)', 'FIN', 'MONTANT', '100000000'],
  ['FIN_FAIBLE_VALEUR_ACTIVE', 'Passage en charge des biens de faible valeur (CGI art. 101-VIII) pour l\'exercice', 'FIN', 'BOOLEEN', 'OUI'],
  ['FIN_BENEFICIAIRE_TAXES', 'Code tiers de l\'administration fiscale (ordre de paiement automatique des déclarations ; AUCUN = à ordonner)', 'FIN', 'TEXTE', 'AUCUN'],
  ['FIN_ECHEANCE_DECLARATION_JOUR', 'Jour du mois suivant où la déclaration et son paiement sont dus', 'FIN', 'ENTIER', '15'],
  ['PROD_TEXTE_ARTICLE_30', 'Texte de l\'article 30 du Code des assurances reproduit dans la mise en demeure (texte officiel à saisir par la Conformité)', 'PRD', 'TEXTE', 'Texte officiel de l\'article 30 à reproduire (paramètre PROD_TEXTE_ARTICLE_30).'],
  ['FIN_RAPPROCHEMENT_ECART_JOURS', 'Écart maximal de dates pour le rapprochement automatique (jours)', 'FIN', 'DUREE', '5'],
  ['FIN_SCELLEMENT_MINUTES', 'Scellement des écritures par lots (minutes)', 'FIN', 'DUREE', '5'],
  // États (chapitre 14)
  ['ETA_AGREGAT_MIN', 'Taille minimale d\'un agrégat du rapport anonyme', 'ETA', 'ENTIER', '10'],
];

/** Modèles de notification nécessaires au socle. */
export const MODELES_NOTIFICATION: { code: string; canal: string; contenu: string }[] = [
  { code: 'OTP_CONNEXION', canal: 'SMS', contenu: 'Prospect Pro : votre code de connexion est {{code}}. Il expire dans 5 minutes. Ne le communiquez à personne.' },
  { code: 'OTP_VERIFICATION_TELEPHONE', canal: 'SMS', contenu: 'Prospect Pro : code de vérification de votre numéro : {{code}}.' },
  { code: 'COORDONNEE_MODIFIEE', canal: 'SMS', contenu: 'Prospect Pro : vos coordonnées de paiement ont été modifiées ({{etablissement}}, se terminant par {{fin}}). Aucun paiement n\'y sera fait avant {{heures}} heures. Si vous n\'êtes pas à l\'origine de ce changement, contactez-nous immédiatement.' },
  { code: 'ENFANT_AGE_LIMITE', canal: 'SMS', contenu: 'Prospect Pro : {{enfant}} atteint le {{date}} l\'âge limite de sa couverture. Sans justificatif (scolarité, handicap) transmis avant cette date, il sortira de la couverture à l\'échéance suivante.' },
  { code: 'RECLAMATION_RECUE', canal: 'SMS', contenu: 'Prospect Pro : votre réclamation n° {{numero}} est enregistrée. Une réponse vous sera apportée au plus tard le {{echeance}}.' },
  { code: 'RECLAMATION_REPONDUE', canal: 'SMS', contenu: 'Prospect Pro : une réponse à votre réclamation n° {{numero}} est disponible dans votre espace assuré ou auprès de votre bureau.' },
  { code: 'RAPPEL_ECHEANCE', canal: 'SMS', contenu: 'Prospect Pro : votre police n° {{police}} arrive à échéance le {{echeance}}. Prime de renouvellement : {{prime}}, reste à payer {{reste}}. Paiement au bureau {{bureau}}, par monnaie électronique ou à la caisse du siège.' },
  { code: 'POLICE_RENOUVELEE', canal: 'SMS', contenu: 'Prospect Pro : votre police n° {{police}} est renouvelée du {{debut}} au {{fin}}. Vos cartes sont actives.' },
  { code: 'VERSEMENT_RECU', canal: 'SMS', contenu: 'Prospect Pro : versement {{numero}} de {{montant}} reçu pour la police {{police}}. Cumul : {{cumul}} ; reste à payer pour le renouvellement : {{reste}}.' },
  { code: 'FACTURE_COMMISSION_ETABLIE', canal: 'SMS', contenu: 'Prospect Pro : votre facture de commissions {{numero}} du mois {{mois}} est établie, net à payer {{net}}. Vérifiez-la et émettez-la depuis votre application.' },
  { code: 'PAIEMENT_EXECUTE', canal: 'SMS', contenu: 'Prospect Pro : paiement {{numero}} de {{montant}} exécuté vers {{etablissement}}. L\'avis de paiement est disponible dans votre espace.' },
  { code: 'POLICE_EMISE', canal: 'SMS', contenu: 'Prospect Pro : votre police n° {{police}} est émise, effet le {{date_effet}}, prime payée {{prime}}. Vos documents (bulletin, conditions générales, quittance, attestation) sont disponibles dans votre espace assuré.' },
  { code: 'APPROVISIONNEMENT_CONFIRME', canal: 'SMS', contenu: 'Prospect Pro : approvisionnement {{numero}} de {{montant}} confirmé sur le compte de production du bureau {{bureau}}. Nouveau solde : {{solde}}.' },
  { code: 'COMPTE_PRODUCTION_SEUIL', canal: 'SMS', contenu: 'Prospect Pro : le solde du compte de production du bureau {{bureau}} est passé sous votre seuil d\'alerte : {{solde}}. Pensez à l\'approvisionner.' },
  { code: 'CHANGEMENT_INTERLOCUTEUR', canal: 'SMS', contenu: 'Prospect Pro : pour votre police {{police}}, votre interlocuteur commercial est désormais {{interlocuteur}} ({{telephone}}). Vos garanties ne changent pas.' },
  { code: 'PAIEMENT_EN_LIGNE_RECU', canal: 'SMS', contenu: 'Prospect Pro : paiement de {{montant}} reçu pour votre dossier {{dossier}}. La cellule Canal digital le vérifie ; votre carte numérique sera disponible dès l\'émission.' },
  { code: 'DOSSIER_EN_LIGNE_REJETE', canal: 'SMS', contenu: 'Prospect Pro : votre dossier {{dossier}} n\'a pas pu être accepté ({{motif}}).{{remboursement}}' },
  { code: 'RELANCE_PRIME', canal: 'SMS', contenu: 'Prospect Pro : la prime de {{montant}} de votre police {{police}} (quittance {{quittance}}) est due depuis le {{echeance}}. Sans paiement, une mise en demeure vous sera adressée.' },
  { code: 'POLICE_SUSPENDUE', canal: 'SMS', contenu: 'Prospect Pro : faute de paiement après mise en demeure, les garanties de votre police {{police}} sont suspendues depuis le {{date}}. Le paiement de {{montant}} les rétablit le lendemain à midi.' },
  { code: 'SUSPENSION_LEVEE', canal: 'SMS', contenu: 'Prospect Pro : paiement reçu pour votre police {{police}}. Vos garanties reprennent le {{reprise}}.' },
  { code: 'POLICE_RESILIEE', canal: 'SMS', contenu: 'Prospect Pro : votre police {{police}} est résiliée à compter du {{date}} ({{motif}}). Les cartes de ses assurés ne sont plus valables.{{ristourne}}' },
  { code: 'POLICE_RESILIEE_AGENT', canal: 'SMS', contenu: 'Prospect Pro : la police {{police}} de {{souscripteur}} est résiliée à compter du {{date}} ({{motif}}).' },
  { code: 'POLICE_RENONCIATION', canal: 'SMS', contenu: 'Prospect Pro : votre renonciation à la police {{police}} est enregistrée. La police est annulée et {{montant}} vous seront remboursés.' },
  { code: 'VERIFICATION_TELEPHONE', canal: 'SMS', contenu: 'Prospect Pro : votre code de vérification est {{code}}. Communiquez-le uniquement à la personne qui vous assiste. Valable 10 minutes.' },
  { code: 'ACCEPTATION_DOCUMENT', canal: 'SMS', contenu: 'Prospect Pro : code {{code}} pour accepter « {{document}} » (réf. {{empreinte}}). Valable 5 minutes. Ne le communiquez qu\'à la personne qui vous assiste, après avoir lu le document.' },
];

/**
 * Référentiel initial des motifs de blocage (§ 3.7). Modules déposants : PRD, SAN, SIN, CNF, COM, ASSURE, ENTREPRISE, SYSTEME.
 * Ajouter un cas de blocage = ajouter une ligne (ARC-RG-013).
 */
export const MOTIFS_BLOCAGE: { code: string; assure: string; prestataire: string; modules: string; definitif?: boolean }[] = [
  { code: 'SORTIE_EFFECTIF', assure: 'Vous ne faites plus partie de l\'effectif assuré par votre employeur ou groupement. Rapprochez-vous de lui.', prestataire: 'Carte non valide', modules: 'ENTREPRISE,PRD' },
  { code: 'DECES_DECLARE', assure: 'Un décès a été déclaré : carte suspendue à titre conservatoire. Si c\'est une erreur, contactez votre bureau.', prestataire: 'Carte non valide', modules: 'SIN' },
  { code: 'DECES_CONSTATE', assure: 'Décès constaté à la réception de l\'acte de décès.', prestataire: 'Carte non valide', modules: 'SIN', definitif: true },
  { code: 'CARTE_PERDUE_VOLEE', assure: 'Carte déclarée perdue ou volée. Demandez une nouvelle carte à votre bureau ou dans votre espace assuré.', prestataire: 'Carte opposée', modules: 'ASSURE,PRD' },
  { code: 'ALERTE_FRAUDE_CONFORMITE', assure: 'Votre dossier est en cours de vérification. Contactez votre bureau.', prestataire: 'Carte non valide', modules: 'SAN,CNF' },
  { code: 'AGE_LIMITE', assure: 'L\'âge limite de couverture est atteint. Transmettez un justificatif de scolarité ou de handicap pour rétablir la couverture.', prestataire: 'Carte non valide', modules: 'SYSTEME,PRD' },
];

/** Natures de comptes (FIN-RG-078) : tranche par défaut et contrôles associés. Paramétrables ensuite. */
export const NATURES_COMPTE: { code: string; libelle: string; tranche: string; controles: object }[] = [
  { code: 'CAPITAUX', libelle: 'Capitaux', tranche: '1', controles: {} },
  { code: 'PROVISION_TECHNIQUE', libelle: 'Provisions techniques', tranche: '3', controles: {} },
  { code: 'IMMOBILISATION', libelle: 'Immobilisations', tranche: '2', controles: {} },
  { code: 'AMORTISSEMENT', libelle: 'Amortissements', tranche: '28', controles: {} },
  { code: 'INTERMEDIAIRE', libelle: 'Intermédiaires', tranche: '411', controles: { lettrage: true, echeance: true } },
  { code: 'ASSURE', libelle: 'Assurés et bénéficiaires', tranche: '41', controles: { lettrage: true, echeance: true } },
  { code: 'FOURNISSEUR', libelle: 'Fournisseurs', tranche: '461', controles: { lettrage: true, echeance: true } },
  { code: 'PRESTATAIRE', libelle: 'Prestataires de santé', tranche: '468', controles: { lettrage: true, echeance: true } },
  { code: 'ETAT', libelle: 'État', tranche: '43', controles: {} },
  { code: 'TIERS_DIVERS', libelle: 'Tiers divers et comptes d\'attente', tranche: '4', controles: {} },
  { code: 'BANQUE', libelle: 'Banques et monnaie électronique', tranche: '56', controles: { journalTresorerie: true } },
  { code: 'CAISSE', libelle: 'Caisse', tranche: '57', controles: { journalTresorerie: true } },
  { code: 'CHARGE', libelle: 'Charges', tranche: '6', controles: { analytique: 'SELON_PARAMETRAGE' } },
  { code: 'PRODUIT', libelle: 'Produits', tranche: '7', controles: { analytique: 'SELON_PARAMETRAGE' } },
];

/**
 * Comptes proposés pour le schéma comptable (§ 11.10) : regroupements et collectifs nécessaires aux rôles des tiers.
 * Le chef comptable les rattache aux lignes des états BCRG et complète le plan par import (FIN-RG-001, 007).
 */
export const COMPTES_PROPOSES: { numero: string; libelle: string; parent?: string; collectif?: boolean; imputable?: boolean; sens?: 'D' | 'C' }[] = [
  { numero: '41', libelle: 'Assurés, intermédiaires et comptes rattachés', imputable: false },
  { numero: '411', libelle: 'Intermédiaires', parent: '41', imputable: false },
  { numero: '4111', libelle: 'Intermédiaires – comptes de production', parent: '411', collectif: true, sens: 'C' },
  { numero: '4112', libelle: 'Intermédiaires – commissions à payer', parent: '411', collectif: true, sens: 'C' },
  { numero: '4113', libelle: 'Apporteurs d\'affaires (juniors, prescripteurs) – commissions à payer', parent: '411', collectif: true, sens: 'C' },
  { numero: '412', libelle: 'Créances sur les assurés', parent: '41', collectif: true, sens: 'D' },
  { numero: '416', libelle: 'Assurés et bénéficiaires', parent: '41', imputable: false },
  { numero: '4161', libelle: 'Assurés et bénéficiaires – indemnités à payer', parent: '416', collectif: true, sens: 'C' },
  { numero: '419', libelle: 'Assurés créditeurs', parent: '41', imputable: false },
  { numero: '4191', libelle: 'Assurés – versements programmés reçus d\'avance', parent: '419', collectif: true, sens: 'C' },
  { numero: '46', libelle: 'Débiteurs et créditeurs divers', imputable: false },
  { numero: '461', libelle: 'Fournisseurs, dettes en compte', parent: '46', collectif: true, sens: 'C' },
  { numero: '468', libelle: 'Autres créditeurs', parent: '46', imputable: false },
  { numero: '4681', libelle: 'Prestataires de santé et pharmacies', parent: '468', collectif: true, sens: 'C' },
  { numero: '43', libelle: 'État', imputable: false },
  { numero: '436', libelle: 'État – taxes sur primes', parent: '43', imputable: false },
  { numero: '4361', libelle: 'État – taxes sur primes d\'assurance', parent: '436', sens: 'C' },
  { numero: '434', libelle: 'État – taxes déclarées', parent: '43', imputable: false },
  { numero: '4341', libelle: 'État – taxes sur primes déclarées à payer', parent: '434', sens: 'C' },
  { numero: '437', libelle: 'État – retenues', parent: '43', imputable: false },
  { numero: '4371', libelle: 'État – retenue sur commissions', parent: '437', sens: 'C' },
  { numero: '435', libelle: 'État – taxes récupérables', parent: '43', imputable: false },
  { numero: '4351', libelle: 'État – taxe récupérable sur achats', parent: '435', sens: 'D' },
  { numero: '47', libelle: 'Comptes transitoires ou d\'attente', imputable: false },
  { numero: '471', libelle: 'Encaissements en attente d\'affectation', parent: '47', sens: 'C' },
  { numero: '56', libelle: 'Banques et établissements financiers', imputable: false },
  { numero: '57', libelle: 'Caisse', imputable: false },
  { numero: '571', libelle: 'Caisse du siège', parent: '57', sens: 'D' },
  // Immobilisations et amortissements (§ 11.19, cas 7)
  { numero: '22', libelle: 'Immobilisations corporelles', imputable: false },
  { numero: '222', libelle: 'Terrains', parent: '22', sens: 'D' },
  { numero: '224', libelle: 'Matériel, mobilier et véhicules', parent: '22', imputable: false },
  { numero: '2241', libelle: 'Mobilier de bureau', parent: '224', sens: 'D' },
  { numero: '2242', libelle: 'Matériel informatique', parent: '224', sens: 'D' },
  { numero: '2243', libelle: 'Matériel de bureau', parent: '224', sens: 'D' },
  { numero: '2245', libelle: 'Matériel de transport', parent: '224', sens: 'D' },
  { numero: '28', libelle: 'Amortissements', imputable: false },
  { numero: '282', libelle: 'Amortissements des immobilisations corporelles', parent: '28', imputable: false },
  { numero: '2824', libelle: 'Amortissements du matériel et mobilier', parent: '282', sens: 'C' },
  { numero: '2845', libelle: 'Amortissements du matériel de transport', parent: '282', sens: 'C' },
  { numero: '32', libelle: 'Provisions techniques', imputable: false },
  { numero: '321', libelle: 'Provisions pour primes non acquises', parent: '32', imputable: false },
  { numero: '3212', libelle: 'Primes non acquises', parent: '321', sens: 'C' },
  { numero: '325', libelle: 'Provisions pour sinistres à payer', parent: '32', imputable: false },
  { numero: '3251', libelle: 'Sinistres à payer', parent: '325', sens: 'C' },
  { numero: '60', libelle: 'Prestations et frais payés', imputable: false },
  { numero: '602', libelle: 'Sinistres', parent: '60', imputable: false },
  { numero: '6021', libelle: 'Sinistres en principal', parent: '602', imputable: false },
  { numero: '60211', libelle: 'Sinistres en principal – maladie', parent: '6021', sens: 'D' },
  { numero: '60212', libelle: 'Sinistres en principal – accidents corporels', parent: '6021', sens: 'D' },
  { numero: '6026', libelle: 'Frais accessoires (expertises)', parent: '602', sens: 'D' },
  { numero: '63', libelle: 'Services extérieurs et fournitures', imputable: false },
  { numero: '631', libelle: 'Fournitures', parent: '63', imputable: false },
  { numero: '6311', libelle: 'Fournitures de bureau', parent: '631', sens: 'D' },
  { numero: '6312', libelle: 'Petit matériel et mobilier (biens de faible valeur)', parent: '631', sens: 'D' },
  { numero: '632', libelle: 'Loyers et charges locatives', parent: '63', imputable: false },
  { numero: '6321', libelle: 'Loyers', parent: '632', sens: 'D' },
  { numero: '633', libelle: 'Entretien et maintenance', parent: '63', imputable: false },
  { numero: '6331', libelle: 'Entretien et maintenance', parent: '633', sens: 'D' },
  { numero: '634', libelle: 'Honoraires', parent: '63', imputable: false },
  { numero: '6341', libelle: 'Honoraires', parent: '634', sens: 'D' },
  { numero: '635', libelle: 'Frais bancaires', parent: '63', imputable: false },
  { numero: '6351', libelle: 'Frais et commissions bancaires', parent: '635', sens: 'D' },
  { numero: '64', libelle: 'Commissions', imputable: false },
  { numero: '643', libelle: 'Commissions et courtages', parent: '64', imputable: false },
  { numero: '6431', libelle: 'Commissions et courtages', parent: '643', sens: 'D' },
  { numero: '65', libelle: 'Charges de provisions', imputable: false },
  { numero: '659', libelle: 'Charges de provisions techniques', parent: '65', imputable: false },
  { numero: '6591', libelle: 'Charges de provisions techniques', parent: '659', sens: 'D' },
  { numero: '68', libelle: 'Dotations aux amortissements', imputable: false },
  { numero: '681', libelle: 'Dotations aux amortissements', parent: '68', imputable: false },
  { numero: '6812', libelle: 'Dotations aux amortissements des immobilisations corporelles', parent: '681', sens: 'D' },
  { numero: '687', libelle: 'Valeurs comptables des cessions', parent: '68', imputable: false },
  { numero: '6871', libelle: 'Valeurs comptables des immobilisations cédées ou mises au rebut', parent: '687', sens: 'D' },
  { numero: '70', libelle: 'Primes', imputable: false },
  { numero: '702', libelle: 'Primes et annulations', parent: '70', imputable: false },
  { numero: '7021', libelle: 'Primes émises', parent: '702', imputable: false },
  { numero: '70211', libelle: 'Primes émises – assurance maladie', parent: '7021', sens: 'C' },
  { numero: '70212', libelle: 'Primes émises – accidents corporels', parent: '7021', sens: 'C' },
  { numero: '7029', libelle: 'Annulations de primes', parent: '702', imputable: false },
  { numero: '70291', libelle: 'Annulations de primes – assurance maladie', parent: '7029', sens: 'D' },
  { numero: '70292', libelle: 'Annulations de primes – accidents corporels', parent: '7029', sens: 'D' },
  { numero: '78', libelle: 'Produits divers', imputable: false },
  { numero: '787', libelle: 'Produits des cessions', parent: '78', imputable: false },
  { numero: '7871', libelle: 'Produits des cessions d\'immobilisations', parent: '787', sens: 'C' },
  { numero: '75', libelle: 'Autres produits techniques', imputable: false },
  { numero: '751', libelle: 'Accessoires', parent: '75', imputable: false },
  { numero: '7511', libelle: 'Coûts de polices et accessoires', parent: '751', sens: 'C' },
];

/** Catégories d'immobilisations (FIN-RG-140, 144) : durées et taux indicatifs, à aligner sur les taux admis par le CGI. */
export const CATEGORIES_IMMOBILISATION: { code: string; libelle: string; immo: string; amort?: string; dotation?: string; duree?: number; faibleValeur: boolean }[] = [
  { code: 'INFO', libelle: 'Matériel informatique', immo: '2242', amort: '2824', dotation: '6812', duree: 3, faibleValeur: true },
  { code: 'MATERIEL', libelle: 'Matériel de bureau', immo: '2243', amort: '2824', dotation: '6812', duree: 5, faibleValeur: true },
  { code: 'MOBILIER', libelle: 'Mobilier de bureau', immo: '2241', amort: '2824', dotation: '6812', duree: 10, faibleValeur: true },
  { code: 'VEHICULE', libelle: 'Véhicules de tourisme', immo: '2245', amort: '2845', dotation: '6812', duree: 4, faibleValeur: false },
  { code: 'TERRAIN', libelle: 'Terrains', immo: '222', faibleValeur: false },
];

/** Modèles d'achat par nature de charge (FIN-RG-033, 100) : compte proposé, catégorie d'immobilisation éventuelle. */
export const MODELES_ACHAT: { code: string; libelle: string; compte: string; categorie?: string }[] = [
  { code: 'FOURNITURES', libelle: 'Fournitures de bureau', compte: '6311' },
  { code: 'LOYER', libelle: 'Loyer', compte: '6321' },
  { code: 'MAINTENANCE', libelle: 'Entretien et maintenance', compte: '6331' },
  { code: 'HONORAIRES', libelle: 'Honoraires', compte: '6341' },
  { code: 'FRAIS_BANCAIRES', libelle: 'Frais bancaires', compte: '6351' },
  { code: 'INFORMATIQUE', libelle: 'Matériel informatique (immobilisation)', compte: '2242', categorie: 'INFO' },
  { code: 'MATERIEL', libelle: 'Matériel de bureau (immobilisation)', compte: '2243', categorie: 'MATERIEL' },
  { code: 'MOBILIER', libelle: 'Mobilier de bureau (immobilisation)', compte: '2241', categorie: 'MOBILIER' },
  { code: 'VEHICULE', libelle: 'Véhicule de tourisme (immobilisation)', compte: '2245', categorie: 'VEHICULE' },
];

/** Modèles de règlement (FIN-RG-101) : condition COMPTANT, Jn (n jours), JnFM (n jours fin de mois), LEn (le n du mois suivant). */
export const MODELES_REGLEMENT: { code: string; mode: string; condition: string }[] = [
  { code: 'COMPTANT', mode: 'VIREMENT', condition: 'COMPTANT' },
  { code: '30J', mode: 'VIREMENT', condition: 'J30' },
  { code: '30JFM', mode: 'VIREMENT', condition: 'J30FM' },
  { code: '45JFM', mode: 'VIREMENT', condition: 'J45FM' },
  { code: 'LE10', mode: 'VIREMENT', condition: 'LE10' },
];

/** Branches BCRG de la phase 1 et leurs comptes (écart X22). */
export const BRANCHES: { code: string; libelle: string; primes: string; annulations: string; sinistres: string }[] = [
  { code: 'MALADIE', libelle: 'Assurance maladie', primes: '70211', annulations: '70291', sinistres: '60211' },
  { code: 'ACCIDENTS_CORPORELS', libelle: 'Accidents corporels', primes: '70212', annulations: '70292', sinistres: '60212' },
];

/** Journaux créés à l'installation (§ 11.7) ; TRE est le journal de trésorerie générique, précisé par banque ou opérateur à l'opération. */
export const JOURNAUX: { code: string; libelle: string; type: string; mode: 'AUTOMATIQUE' | 'MANUEL'; tresorerie?: string }[] = [
  { code: 'DEP', libelle: 'Comptes de production des agents', type: 'ENCAISSEMENTS', mode: 'AUTOMATIQUE' },
  { code: 'EMI', libelle: 'Émissions et annulations de primes', type: 'EMISSIONS', mode: 'AUTOMATIQUE' },
  { code: 'ENC', libelle: 'Encaissements de primes', type: 'ENCAISSEMENTS', mode: 'AUTOMATIQUE' },
  { code: 'COM', libelle: 'Commissions', type: 'OPERATIONS_DIVERSES', mode: 'AUTOMATIQUE' },
  { code: 'SAN', libelle: 'Prestations santé', type: 'PRESTATIONS_SINISTRES', mode: 'AUTOMATIQUE' },
  { code: 'SIN', libelle: 'Sinistres accident et décès', type: 'PRESTATIONS_SINISTRES', mode: 'AUTOMATIQUE' },
  { code: 'ACH', libelle: 'Achats', type: 'ACHATS', mode: 'MANUEL' },
  { code: 'TRE', libelle: 'Trésorerie (paiements validés)', type: 'TRESORERIE_BANQUE', mode: 'AUTOMATIQUE' },
  { code: 'CAI', libelle: 'Caisse du siège', type: 'TRESORERIE_CAISSE', mode: 'AUTOMATIQUE', tresorerie: '571' },
  { code: 'INV', libelle: 'Inventaire (provisions)', type: 'INVENTAIRE', mode: 'AUTOMATIQUE' },
  { code: 'OD', libelle: 'Opérations diverses', type: 'OPERATIONS_DIVERSES', mode: 'MANUEL' },
  { code: 'AUT', libelle: 'Opérations automatiques diverses', type: 'OPERATIONS_DIVERSES', mode: 'AUTOMATIQUE' },
  { code: 'AN', libelle: 'À-nouveaux', type: 'A_NOUVEAUX', mode: 'AUTOMATIQUE' },
];

type L = { compte?: string; regle?: string; sens: 'D' | 'C'; formule: string };
const d = (x: string, formule: string): L => (/^\d/.test(x) ? { compte: x, sens: 'D', formule } : { regle: x, sens: 'D', formule });
const c = (x: string, formule: string): L => (/^\d/.test(x) ? { compte: x, sens: 'C', formule } : { regle: x, sens: 'C', formule });
const EMISSION: L[] = [d('CLIENT', 'PRIME_TOTALE'), c('PRIMES_BRANCHE', 'PRIME_NETTE'), c('7511', 'ACCESSOIRES'), c('TAXES', '*')];
const COMMISSION: L[] = [d('6431', 'COMMISSION'), c('COMMISSIONS_A_PAYER', '*')];

/** Catalogue des événements comptables du lot 2 (§ 11.13), schémas initiaux modifiables par le chef comptable. */
export const SCHEMAS: { codeEvt: string; typeEvenement: string; journal: string; libelle: string; lignes: L[] }[] = [
  { codeEvt: 'EVT-01', typeEvenement: 'DEPOT_CONFIRME', journal: 'DEP', libelle: 'Approvisionnement {{reference}} – bureau {{bureau}}', lignes: [d('TRESORERIE', 'MONTANT'), c('COMPTE_PRODUCTION', 'MONTANT')] },
  { codeEvt: 'EVT-02', typeEvenement: 'POLICE_EMISE', journal: 'EMI', libelle: 'Prime {{reference}} – police {{police}}', lignes: EMISSION },
  { codeEvt: 'EVT-02', typeEvenement: 'POLICE_EMISE', journal: 'ENC', libelle: 'Règlement {{reference}} par compte de production – bureau {{bureau}}', lignes: [d('COMPTE_PRODUCTION', 'ENCAISSE'), c('CLIENT', 'ENCAISSE')] },
  { codeEvt: 'EVT-02', typeEvenement: 'POLICE_EMISE', journal: 'COM', libelle: 'Commission {{reference}} – police {{police}}', lignes: COMMISSION },
  { codeEvt: 'EVT-03', typeEvenement: 'POLICE_RENOUVELEE', journal: 'EMI', libelle: 'Prime {{reference}} – police {{police}}', lignes: EMISSION },
  { codeEvt: 'EVT-03', typeEvenement: 'POLICE_RENOUVELEE', journal: 'ENC', libelle: 'Règlement direct {{reference}} – police {{police}}', lignes: [d('TRESORERIE', 'ENCAISSE'), c('CLIENT', 'ENCAISSE')] },
  { codeEvt: 'EVT-03', typeEvenement: 'POLICE_RENOUVELEE', journal: 'COM', libelle: 'Commission {{reference}} – police {{police}}', lignes: COMMISSION },
  { codeEvt: 'EVT-04', typeEvenement: 'POLICE_ANNULEE', journal: 'EMI', libelle: 'Annulation {{reference}} – police {{police}}',
    lignes: [d('ANNULATIONS_BRANCHE', 'PRIME_NETTE'), d('7511', 'ACCESSOIRES'), d('TAXES', '*'), c('CLIENT', 'PRIME_TOTALE')] },
  // Remboursement au compte de production (REMBOURSE) ; une ristourne payée au client passe par la chaîne de paiement (PAIEMENT_RISTOURNE, journal TRE)
  { codeEvt: 'EVT-04', typeEvenement: 'POLICE_ANNULEE', journal: 'ENC', libelle: 'Remboursement {{reference}} – police {{police}}', lignes: [d('CLIENT', 'REMBOURSE'), c('REMBOURSEMENT', 'REMBOURSE')] },
  { codeEvt: 'EVT-04', typeEvenement: 'POLICE_ANNULEE', journal: 'TRE', libelle: 'Paiement de la ristourne {{reference}} – police {{police}}', lignes: [d('CLIENT', 'PAIEMENT_RISTOURNE'), c('TRESORERIE', 'PAIEMENT_RISTOURNE')] },
  { codeEvt: 'EVT-04', typeEvenement: 'POLICE_ANNULEE', journal: 'COM', libelle: 'Reprise de commission {{reference}}', lignes: [d('COMMISSIONS_A_PAYER', '*'), c('6431', 'COMMISSION')] },
  { codeEvt: 'EVT-05', typeEvenement: 'PAIEMENT_EXECUTE', journal: 'TRE', libelle: 'Paiement facture de commissions {{reference}}', lignes: [d('COMMISSIONS_A_PAYER', 'BRUT'), c('4371', 'RETENUE'), c('TRESORERIE', 'NET')] },
  { codeEvt: 'EVT-06', typeEvenement: 'DEPOT_REMBOURSE', journal: 'TRE', libelle: 'Restitution du compte de production {{reference}}', lignes: [d('COMPTE_PRODUCTION', 'MONTANT'), c('TRESORERIE', 'MONTANT')] },
  { codeEvt: 'EVT-07', typeEvenement: 'PRIME_ANTICIPATION_ACQUISE', journal: 'COM', libelle: 'Prime de renouvellement anticipé {{reference}}', lignes: [d('6431', 'MONTANT'), c('COMMISSIONS_A_PAYER', 'MONTANT')] },
  { codeEvt: 'EVT-13', typeEvenement: 'CLOTURE_PERIODE', journal: 'INV', libelle: 'Provision pour primes non acquises {{reference}}', lignes: [d('6591', 'PPNA'), c('3212', 'PPNA')] },
  { codeEvt: 'EVT-14', typeEvenement: 'DECLARATION_TAXE_VALIDEE', journal: 'AUT', libelle: 'Liquidation de la déclaration {{reference}}', lignes: [d('COMPTE_TAXE', 'MONTANT'), c('4341', 'MONTANT')] },
  { codeEvt: 'EVT-14', typeEvenement: 'DECLARATION_TAXE_VALIDEE', journal: 'TRE', libelle: 'Paiement de la déclaration {{reference}}', lignes: [d('4341', 'PAIEMENT'), c('TRESORERIE', 'PAIEMENT')] },
  { codeEvt: 'EVT-16', typeEvenement: 'PAIEMENT_EXECUTE', journal: 'TRE', libelle: 'Paiement fournisseur {{reference}}', lignes: [d('FOURNISSEUR', 'MONTANT'), c('TRESORERIE', 'MONTANT')] },
  { codeEvt: 'EVT-17', typeEvenement: 'CLOTURE_PERIODE', journal: 'AUT', libelle: 'Dotations aux amortissements {{reference}}', lignes: [d('DOTATIONS', '*'), c('AMORTISSEMENTS', '*')] },
  { codeEvt: 'EVT-18', typeEvenement: 'IMMOBILISATION_CEDEE', journal: 'AUT', libelle: 'Sortie de l\'immobilisation {{reference}}',
    lignes: [d('AMORTISSEMENTS', 'CUMUL'), d('6871', 'VNC'), c('IMMOBILISATIONS', 'VALEUR_ORIGINE'), d('TRESORERIE', 'PRIX'), c('7871', 'PRIX')] },
  { codeEvt: 'EVT-21', typeEvenement: 'VERSEMENT_PROGRAMME_RECU', journal: 'ENC', libelle: 'Versement programmé {{reference}}', lignes: [d('TRESORERIE', 'MONTANT'), c('VERSEMENTS_AVANCE', 'MONTANT')] },
  { codeEvt: 'EVT-22', typeEvenement: 'VERSEMENT_PROGRAMME_REMBOURSE', journal: 'TRE', libelle: 'Remboursement de versements {{reference}}', lignes: [d('VERSEMENTS_AVANCE', 'MONTANT'), c('TRESORERIE', 'MONTANT')] },
  { codeEvt: 'EVT-23', typeEvenement: 'ENCAISSEMENT_EN_ATTENTE_RECU', journal: 'ENC', libelle: 'Encaissement en attente {{reference}}', lignes: [d('TRESORERIE', 'MONTANT'), c('471', 'MONTANT')] },
  { codeEvt: 'EVT-24', typeEvenement: 'ENCAISSEMENT_EN_ATTENTE_REMBOURSE', journal: 'TRE', libelle: 'Remboursement d\'encaissement en attente {{reference}}', lignes: [d('471', 'MONTANT'), c('TRESORERIE', 'MONTANT')] },
  { codeEvt: 'EVT-26', typeEvenement: 'FRAIS_HORS_PRIME_FACTURES', journal: 'ENC', libelle: 'Frais hors prime {{reference}}', lignes: [d('TRESORERIE', 'TOTAL'), c('7511', 'ACCESSOIRES'), c('TAXES', '*')] },
  { codeEvt: 'EVT-27', typeEvenement: 'FACTURE_COMMISSION_AFFECTEE', journal: 'AUT', libelle: 'Affectation facture de commissions {{reference}} au compte de production',
    lignes: [d('COMMISSIONS_A_PAYER', 'BRUT'), c('4371', 'RETENUE'), c('COMPTE_PRODUCTION', 'NET')] },
];

/** Modèles de documents nécessaires au lot 2 (annexe F), modifiables ensuite par le comité. */
const CONTRAT = [
  'Souscripteur : {{souscripteur}}',
  'Produit : {{produit}} – formule {{formule}}',
  'Période de garantie : du {{date_effet}} au {{date_fin}} inclus',
  '## Personnes assurées',
  '| Nom | Qualité | Date de naissance |',
  '{{#assures}}| {{nom}} | {{qualite}} | {{naissance}} |',
  '{{/assures}}',
  '## Garanties',
  '| Garantie | Plafond ou capital | Prise en charge | Carence |',
  '{{#garanties}}| {{libelle}} | {{plafond}} | {{taux}} | {{carence}} |',
  '{{/garanties}}',
  '## Bénéficiaires du capital décès',
  '| Bénéficiaire | Quotité |',
  '{{#beneficiaires}}| {{nom}} | {{quotite}} |',
  '{{/beneficiaires}}',
  '## Prime',
  '| Prime nette | Accessoires | Taxes | Prime totale |',
  '| {{prime_nette}} | {{accessoires}} | {{taxes}} | {{prime_totale}} |',
];

export const MODELES_DOCUMENTS: { code: string; libelle: string; contenu: string }[] = [
  {
    code: 'RECAPITULATIF_SOUSCRIPTION', libelle: 'Récapitulatif de souscription',
    contenu: ['# Récapitulatif de votre souscription', 'Dossier {{dossier}}', ...CONTRAT, '---',
      'En saisissant le code reçu par SMS, vous acceptez ce récapitulatif, qui vaut bulletin d\'adhésion une fois la prime payée. Aucune déclaration de santé ne vous est demandée.'].join('\n'),
  },
  {
    code: 'BULLETIN_ADHESION', libelle: 'Bulletin d\'adhésion valant conditions particulières',
    contenu: ['# Bulletin d\'adhésion valant conditions particulières', 'Police n° {{police}}', ...CONTRAT, '---',
      'Le présent bulletin a été accepté électroniquement par le souscripteur (code à usage unique). Les conditions générales du produit en font partie intégrante.'].join('\n'),
  },
  {
    code: 'CONDITIONS_GENERALES', libelle: 'Conditions générales',
    contenu: ['# Conditions générales – {{produit}}', 'Police n° {{police}}', '## Objet du contrat', 'Le contrat garantit les prestations décrites aux conditions particulières, dans les limites des plafonds, carences et exclusions du produit.',
      '## Paiement de la prime', 'La prime de la première année est payée en totalité avant l\'émission. Le contrat naît à son paiement.',
      '## Renouvellement', 'Le contrat se renouvelle par le paiement de la prime de la période suivante, au plus tard à l\'échéance.'].join('\n'),
  },
  {
    code: 'QUITTANCE', libelle: 'Quittance',
    contenu: ['# Quittance n° {{quittance}}', 'Police n° {{police}} – {{souscripteur}}', 'Période : du {{date_effet}} au {{date_fin}}', '| Libellé | Montant |',
      '{{#lignes}}| {{libelle}} | {{montant}} |', '{{/lignes}}', 'Mode de paiement : {{mode_paiement}}.', '---', 'Fait à Conakry, le {{date_document}}.'].join('\n'),
  },
  {
    code: 'AVENANT_BENEFICIAIRES', libelle: 'Avenant de désignation des bénéficiaires',
    contenu: ['# Avenant n° {{numero}} – Bénéficiaires du capital décès', 'Police n° {{police}}', '| Bénéficiaire | Quotité | Rang |', '{{#beneficiaires}}| {{nom}} | {{quotite}} | {{rang}} |', '{{/beneficiaires}}', '',
      'En saisissant le code reçu par SMS, le souscripteur confirme cette désignation, qui remplace la précédente sans incidence sur la prime.', '---', 'Conakry, le {{date_document}}'].join('\n'),
  },
  {
    code: 'LETTRE_MISE_EN_DEMEURE', libelle: 'Lettre de mise en demeure (article 30)',
    contenu: ['# MISE EN DEMEURE', 'Lettre recommandée avec accusé de réception', '', '{{souscripteur}}', '{{adresse}}', '', 'Police n° {{police}} – quittance n° {{quittance}}', '',
      'Madame, Monsieur,', '', 'La prime de **{{montant}}** due le {{echeance}} au titre de la police ci-dessus n\'a pas été payée. Par la présente, nous vous **mettons en demeure** de la payer.',
      'À défaut de paiement, les garanties de la police seront suspendues trente jours après l\'envoi de la présente lettre, soit le {{suspension}}, et la Compagnie pourra résilier la police dix jours plus tard, à compter du {{resiliation}}.',
      'Le paiement des sommes dues lève la suspension le lendemain à midi ; les soins reçus pendant la suspension ne sont pas couverts.', '',
      '## Article 30 du Code des assurances', '{{article_30}}', '---', 'Conakry, le {{date_document}}'].join('\n'),
  },
  {
    code: 'ETAT_AMORTISSEMENTS', libelle: 'État justificatif des dotations aux amortissements',
    contenu: ['# Dotations aux amortissements – {{periode}}', '| Bien | Catégorie | Mise en service | Valeur d\'origine | Dotation | Cumul | Valeur nette |',
      '{{#lignes}}| {{numero}} {{designation}} | {{categorie}} | {{mise_en_service}} | {{valeur}} | {{dotation}} | {{cumul}} | {{vnc}} |', '{{/lignes}}', 'Total des dotations : {{total}}.', '---', 'Conakry, le {{date_document}}'].join('\n'),
  },
  {
    code: 'ETAT_RAPPROCHEMENT', libelle: 'État de rapprochement bancaire',
    contenu: ['# État de rapprochement – {{banque}} au {{date}}', 'Compte {{compte}}', '| Libellé | Montant |',
      '| Solde comptable | {{solde_comptable}} |', '| Écritures non présentes sur le relevé (à déduire) | {{ecritures_non_rapprochees}} |', '| Opérations du relevé non comptabilisées (à ajouter) | {{releve_non_comptabilise}} |',
      '| Solde du relevé reconstitué | {{solde_reconstitue}} |', '| Solde du relevé déclaré | {{solde_releve}} |', '| Écart | {{ecart}} |', '',
      '## Écritures non rapprochées', '| Date | Pièce | Libellé | Montant |', '{{#ecritures}}| {{date}} | {{piece}} | {{libelle}} | {{montant}} |', '{{/ecritures}}',
      '## Opérations du relevé non comptabilisées', '| Date | Libellé | Référence | Montant |', '{{#releve}}| {{date}} | {{libelle}} | {{reference}} | {{montant}} |', '{{/releve}}', '---', 'Conakry, le {{date_document}}'].join('\n'),
  },
  {
    code: 'SORTIE_IMMOBILISATION', libelle: 'Sortie d\'immobilisation',
    contenu: ['# {{nature}} de l\'immobilisation {{numero}}', 'Bien : {{designation}} ({{categorie}})', 'Date de sortie : {{date}}', '| Libellé | Montant |',
      '{{#lignes}}| {{libelle}} | {{montant}} |', '{{/lignes}}', 'Motif : {{motif}}.', '---', 'Conakry, le {{date_document}}'].join('\n'),
  },
  {
    code: 'AVENANT_CORRECTION', libelle: 'Avenant de correction',
    contenu: ['# Avenant n° {{numero}} – Correction', 'Police n° {{police}} – {{souscripteur}}', 'Assuré concerné : {{assure}}', '| Donnée | Avant | Après |', '{{#corrections}}| {{donnee}} | {{avant}} | {{apres}} |', '{{/corrections}}', '',
      'Prime annuelle recalculée : {{prime_avant}} → {{prime_apres}}. Différence au prorata du {{date_effet}} au {{date_fin}} ({{jours}} jours) :', '| Libellé | Montant |', '{{#lignes}}| {{libelle}} | {{montant}} |', '{{/lignes}}',
      'Le numéro de la police et les délais de carence déjà courus sont conservés.', '---', 'Conakry, le {{date_document}}'].join('\n'),
  },
  {
    code: 'LETTRE_RESILIATION', libelle: 'Lettre de résiliation',
    contenu: ['# Résiliation de la police n° {{police}}', 'Souscripteur : {{souscripteur}}', 'Avenant n° {{numero}}', '', 'La Compagnie résilie la police à compter du {{date_effet}} pour le motif suivant : {{motif}}.',
      'Les cartes de tous les assurés de la police sont bloquées à cette date.', '| Libellé | Montant |', '{{#lignes}}| {{libelle}} | {{montant}} |', '{{/lignes}}', '{{mention_ristourne}}', '---', 'Conakry, le {{date_document}}'].join('\n'),
  },
  {
    code: 'ATTESTATION_RENONCIATION', libelle: 'Attestation de renonciation',
    contenu: ['# Renonciation à la police n° {{police}}', 'Souscripteur : {{souscripteur}}', 'Avenant n° {{numero}}', '', 'Demande de renonciation reçue le {{date_demande}}, dans le délai de {{delai}} jours suivant la souscription, sans prestation enregistrée.',
      'La police est annulée depuis l\'origine ; la prime est remboursée intégralement :', '| Libellé | Montant |', '{{#lignes}}| {{libelle}} | {{montant}} |', '{{/lignes}}', 'Remboursement : {{destination}}.', '---', 'Conakry, le {{date_document}}'].join('\n'),
  },
  {
    code: 'AVENANT_RETRAIT', libelle: 'Avenant de retrait d\'un ayant droit',
    contenu: ['# Avenant n° {{numero}} – Retrait d\'un ayant droit', 'Police n° {{police}} – {{souscripteur}}', 'Ayant droit retiré : {{assure}} – {{motif}}', 'Date de sortie : {{date_sortie}}', '| Libellé | Montant |', '{{#lignes}}| {{libelle}} | {{montant}} |', '{{/lignes}}', '{{mention}}', '---', 'Conakry, le {{date_document}}'].join('\n'),
  },
  {
    code: 'AVENANT_SOUSCRIPTEUR', libelle: 'Avenant de changement de souscripteur',
    contenu: ['# Avenant n° {{numero}} – Changement de souscripteur', 'Police n° {{police}}', 'Ancien souscripteur : {{ancien}}', 'Nouveau souscripteur : {{nouveau}}', 'Motif : {{motif}}', '',
      'Le nouveau souscripteur reprend la police à compter du {{date_effet}}, sans incidence sur la prime. Il confirme la désignation des bénéficiaires du capital décès ci-dessous :',
      '| Bénéficiaire | Quotité | Rang |', '{{#beneficiaires}}| {{nom}} | {{quotite}} | {{rang}} |', '{{/beneficiaires}}', 'En saisissant le code reçu par SMS, le nouveau souscripteur accepte cet avenant.', '---', 'Conakry, le {{date_document}}'].join('\n'),
  },
  {
    code: 'FACTURE_COMMISSION', libelle: 'Facture mensuelle de commissions',
    contenu: ['# Facture de commissions n° {{numero}}', 'Établie au titre du mandat d\'autofacturation pour : {{intervenant}} – mois de {{mois}}', '| Police | Quittance | Nature | Montant |',
      '{{#lignes}}| {{police}} | {{quittance}} | {{nature}} | {{montant}} |', '{{/lignes}}', '| Brut | Avoir | Retenue à la source | Net à payer |', '| {{brut}} | {{avoir}} | {{retenue}} | {{net}} |', '---',
      'Le commercial vérifie la facture et l\'émet par code à usage unique, ou dépose sa propre facture portant la même référence et le même montant.'].join('\n'),
  },
  {
    code: 'AVIS_PAIEMENT', libelle: 'Avis de paiement',
    contenu: ['# Avis de paiement {{numero}}', 'Bénéficiaire : {{beneficiaire}}', 'Objet : {{objet}}', '| Libellé | Montant |', '{{#detail}}| {{libelle}} | {{montant}} |', '{{/detail}}',
      'Montant versé : {{montant}} – destination : {{etablissement}}.', '---', 'Conakry, le {{date_document}}'].join('\n'),
  },
  {
    code: 'CARTE_PROFESSIONNELLE', libelle: 'Carte professionnelle',
    contenu: ['# {{titre}}', '{{societe_raison_sociale}}', '## {{porteur}}', '{{qualite}}', '{{responsabilite}}', '', 'N° de série : {{numero}}',
      'Vérifier la validité de cette carte : {{verification}}', '---', 'Valable tant que le porteur est en activité. Délivrée le {{date_document}}.'].join('\n'),
  },
  {
    code: 'ETAT_PPNA', libelle: 'État de la provision pour primes non acquises',
    contenu: ['# Provision pour primes non acquises – {{mois}}', 'Calcul police par police, au prorata au jour près de la prime nette restant à courir après la fin du mois.',
      '| Police | Période de garantie | Prime nette | PPNA |', '{{#lignes}}| {{police}} | {{periode}} | {{prime}} | {{ppna}} |', '{{/lignes}}', 'Total de la provision : {{total}}.',
      'La provision est reprise au premier jour de la période suivante.', '---', 'Conakry, le {{date_document}}'].join('\n'),
  },
  {
    code: 'DECLARATION_TAXE', libelle: 'Déclaration de taxe sur primes',
    contenu: ['# Déclaration {{numero}}', 'Taxe : {{taxe}} – période {{periode}}', '| Assiette | Taxe collectée | Solde à reverser |', '| {{assiette}} | {{collecte}} | {{solde}} |', '',
      'Le montant déclaré est égal au solde du compte de taxe de la période.', '---', 'Conakry, le {{date_document}}'].join('\n'),
  },
  {
    code: 'RECU_VERSEMENT', libelle: 'Reçu de versement programmé',
    contenu: ['# Reçu de versement programmé n° {{numero}}', 'Police n° {{police}}', '| Versement | Cumul | Prime de renouvellement | Reste à payer |', '| {{montant}} | {{cumul}} | {{prime}} | {{reste}} |', '',
      'Ce versement est reçu d\'avance : il ne constitue pas une prime et n\'ouvre aucune garantie. Il sera affecté au renouvellement dès que le cumul atteindra la prime.', '---', 'Conakry, le {{date_document}}'].join('\n'),
  },
  {
    code: 'ATTESTATION', libelle: 'Attestation d\'assurance',
    contenu: ['# Attestation d\'assurance', '{{societe_raison_sociale}} atteste que les personnes ci-dessous sont assurées au titre de la police n° {{police}}, souscrite par {{souscripteur}} ({{produit}}, formule {{formule}}), du {{date_effet}} au {{date_fin}}.',
      '| Nom | Qualité |', '{{#assures}}| {{nom}} | {{qualite}} |', '{{/assures}}', '---', 'Fait à Conakry, le {{date_document}}.'].join('\n'),
  },
  {
    code: 'RECU_APPROVISIONNEMENT', libelle: 'Reçu d\'approvisionnement du compte de production',
    contenu: [
      '# Reçu d\'approvisionnement n° {{numero}}',
      'Compte de production du bureau {{bureau}}',
      '| Moyen | Montant |',
      '| {{moyen}} | {{montant}} |',
      '',
      'Solde du compte de production après l\'opération : {{solde}}.',
      'Le compte de production est un compte de garantie affecté au paiement des primes émises par le bureau ; il n\'est pas rémunéré.',
      '---',
      'Conakry, le {{date_document}} – {{societe_raison_sociale}}',
    ].join('\n'),
  },
];
