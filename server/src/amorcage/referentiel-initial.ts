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
  ['COORDONNEE_CARENCE_HEURES', 'Carence avant le premier paiement sur des coordonnées modifiées (heures)', 'REF', 'DUREE', '72'],
  ['BUREAU_ALERTE_CODES', 'Nombre de codes bureau utilisés déclenchant l\'alerte', 'REF', 'ENTIER', '90'],
  // Commercial (chapitre 7)
  ['COM_APPRO_MINIMUM', 'Montant minimum d\'approvisionnement du compte de production (GNF)', 'COM', 'MONTANT', '10000000'],
  ['COM_ANNULATION_ERREUR_HEURES', 'Délai d\'annulation pour erreur (heures)', 'COM', 'DUREE', '48'],
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
  ['FIN_LONGUEUR_AUXILIAIRES', 'Longueur des comptes auxiliaires', 'FIN', 'ENTIER', '10'],
  ['FIN_EXERCICES_OUVERTS_MAX', 'Exercices ouverts simultanément', 'FIN', 'ENTIER', '2'],
  ['FIN_SEUIL_FAIBLE_VALEUR', 'Seuil des biens de faible valeur (GNF HT)', 'FIN', 'MONTANT', '5000000'],
  ['FIN_PLAFOND_VEHICULES', 'Plafond de base amortissable des véhicules de tourisme (GNF)', 'FIN', 'MONTANT', '100000000'],
  ['FIN_SCELLEMENT_MINUTES', 'Scellement des écritures par lots (minutes)', 'FIN', 'DUREE', '5'],
  // États (chapitre 14)
  ['ETA_AGREGAT_MIN', 'Taille minimale d\'un agrégat du rapport anonyme', 'ETA', 'ENTIER', '10'],
];

/** Modèles de notification nécessaires au socle. */
export const MODELES_NOTIFICATION: { code: string; canal: string; contenu: string }[] = [
  { code: 'OTP_CONNEXION', canal: 'SMS', contenu: 'Prospect Pro : votre code de connexion est {{code}}. Il expire dans 5 minutes. Ne le communiquez à personne.' },
  { code: 'OTP_VERIFICATION_TELEPHONE', canal: 'SMS', contenu: 'Prospect Pro : code de vérification de votre numéro : {{code}}.' },
];
