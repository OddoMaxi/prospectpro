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
  {
    rubrique: 'Commercial', entrees: [
      { libelle: 'Bureaux directs', chemin: '/commercial/bureaux', droit: 'BUREAUX:CONSULTER' },
      { libelle: 'Intervenants', chemin: '/commercial/intervenants', droit: 'AGREMENT:CONSULTER' },
      { libelle: 'Prescripteurs et codes', chemin: '/commercial/prescripteurs', droit: 'AGREMENT:CONSULTER' },
      { libelle: 'Factures de commissions', chemin: '/commercial/factures', droit: 'FACTURE_COMMISSION:CONSULTER' },
      { libelle: 'Cartes professionnelles', chemin: '/commercial/cartes', droit: 'CARTE_PRO:CONSULTER' },
      { libelle: 'Canal digital', chemin: '/commercial/canal-digital', droit: 'SOUSCRIPTION_EN_LIGNE:CONSULTER' },
      { libelle: 'Comptes de production', chemin: '/commercial/comptes-production', droit: 'COMPTE_PRODUCTION:CONSULTER' },
      { libelle: 'Mouvements de portefeuille', chemin: '/commercial/mouvements', droit: 'MOUVEMENT_PORTEFEUILLE:CONSULTER' },
    ],
  },
  {
    rubrique: 'Production', entrees: [
      { libelle: 'Catalogue des produits', chemin: '/production/catalogue', droit: 'CATALOGUE:CONSULTER' },
      { libelle: 'Polices', chemin: '/production/polices', droit: 'SOUSCRIPTION:CONSULTER' },
      { libelle: 'Polices à renouveler', chemin: '/production/renouvellements', droit: 'SOUSCRIPTION:CONSULTER' },
      { libelle: 'Impayés', chemin: '/production/impayes', droit: 'AVENANT:CONSULTER' },
      { libelle: 'Réclamations', chemin: '/production/reclamations', droit: 'RECLAMATIONS:CONSULTER' },
    ],
  },
  {
    rubrique: 'Finances', entrees: [
      { libelle: 'Approvisionnements à confirmer', chemin: '/finances/approvisionnements', droit: 'COMPTE_PRODUCTION:CREER' },
      { libelle: 'Journée comptable', chemin: '/finances/journee', droit: 'PAIEMENT:CONSULTER' },
      { libelle: 'Ordres de paiement', chemin: '/finances/paiements', droit: 'PAIEMENT:CONSULTER' },
      { libelle: 'Rapprochement bancaire', chemin: '/finances/rapprochement', droit: 'PAIEMENT:CONSULTER' },
    ],
  },
  {
    rubrique: 'Comptabilité', entrees: [
      { libelle: 'Plan de comptes', chemin: '/comptabilite/plan', droit: 'PLAN_COMPTES:CONSULTER' },
      { libelle: 'Schémas comptables', chemin: '/comptabilite/schemas', droit: 'JOURNAUX_TIERS:CONSULTER' },
      { libelle: 'Fiches d\'imputation', chemin: '/comptabilite/fiches', droit: 'ECRITURE_MANUELLE:CONSULTER' },
      { libelle: 'Interrogation', chemin: '/comptabilite/interrogation', droit: 'JOURNAUX_TIERS:CONSULTER' },
      { libelle: 'Factures d\'achat', chemin: '/comptabilite/achats', droit: 'FACTURE_ACHAT:CONSULTER' },
      { libelle: 'Immobilisations', chemin: '/comptabilite/immobilisations', droit: 'IMMOBILISATION:CONSULTER' },
      { libelle: 'Déclarations', chemin: '/comptabilite/declarations', droit: 'DECLARATION_TAXE:CONSULTER' },
      { libelle: 'Clôtures', chemin: '/comptabilite/clotures', droit: 'ECRITURE_MANUELLE:CONSULTER' },
      { libelle: 'Journaux et éditions', chemin: '/comptabilite/editions', droit: 'JOURNAUX_TIERS:CONSULTER' },
    ],
  },
  {
    rubrique: 'Santé', entrees: [
      { libelle: 'Prestataires', chemin: '/sante/prestataires', droit: 'PRESTATAIRES:CONSULTER' },
      { libelle: 'Professionnels de santé', chemin: '/sante/professionnels', droit: 'PRESTATAIRES:CONSULTER' },
      { libelle: 'Cartes d\'assurés', chemin: '/sante/cartes', droit: 'CARTES_ASSURE:CONSULTER' },
      { libelle: 'Actes et médicaments', chemin: '/sante/nomenclatures', droit: 'NOMENCLATURES:CONSULTER' },
    ],
  },
  {
    rubrique: 'Conformité', entrees: [
      { libelle: 'Alertes', chemin: '/conformite/alertes', droit: 'ALERTES_CONFORMITE:CONSULTER' },
    ],
  },
];
