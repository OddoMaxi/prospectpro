/**
 * Menu par département (maquette CX-03). Chaque entrée exige un droit « FONCTION:ACTION » ;
 * une rubrique sans entrée autorisée n'est pas affichée (ORG-RG-040). Les départements des lots suivants
 * (Santé, Sinistres, Finances, Conformité, Pilotage) apparaissent avec leurs écrans.
 */
export interface Entree { libelle: string; chemin: string; droit: string }
export interface Rubrique { rubrique: string; entrees: Entree[] }

export const MENU: Rubrique[] = [
  {
    rubrique: 'Administration', entrees: [
      { libelle: 'Fiche de la Compagnie', chemin: '/administration/compagnie', droit: 'SOCIETE:CONSULTER' },
      { libelle: 'Organigramme', chemin: '/administration/organigramme', droit: 'ORGANISATION:CONSULTER' },
      { libelle: 'Profils et droits', chemin: '/administration/profils', droit: 'UTILISATEURS:CONSULTER' },
      { libelle: 'Délégations', chemin: '/administration/delegations', droit: 'DELEGATIONS:CONSULTER' },
      { libelle: 'Utilisateurs', chemin: '/administration/utilisateurs', droit: 'UTILISATEURS:CONSULTER' },
      { libelle: 'Paramètres et règles', chemin: '/administration/parametres', droit: 'PARAMETRES:CONSULTER' },
      { libelle: 'Journal d\'audit', chemin: '/administration/audit', droit: 'AUDIT:CONSULTER' },
      { libelle: 'Exploitation', chemin: '/administration/exploitation', droit: 'AUDIT:CONSULTER' },
    ],
  },
  {
    rubrique: 'Référentiels', entrees: [
      { libelle: 'Tiers', chemin: '/referentiels/tiers', droit: 'TIERS:CONSULTER' },
      { libelle: 'Nomenclatures', chemin: '/referentiels/nomenclatures', droit: 'NOMENCLATURES:CONSULTER' },
      { libelle: 'Modèles de documents', chemin: '/referentiels/modeles', droit: 'MODELES:CONSULTER' },
    ],
  },
  { rubrique: 'Commercial', entrees: [{ libelle: 'Bureaux', chemin: '/commercial/bureaux', droit: 'BUREAUX:CONSULTER' }] },
  {
    rubrique: 'Production', entrees: [
      { libelle: 'Catalogue des produits', chemin: '/production/catalogue', droit: 'CATALOGUE:CONSULTER' },
      { libelle: 'Réclamations', chemin: '/production/reclamations', droit: 'RECLAMATIONS:CONSULTER' },
    ],
  },
  { rubrique: 'Comptabilité', entrees: [{ libelle: 'Plan de comptes', chemin: '/comptabilite/plan', droit: 'PLAN_COMPTES:PARAMETRER' }] },
];
