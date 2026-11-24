-- Migration générée par tools/dd-sql.ts depuis le dictionnaire des données 1.1 du 2026-11-24.
-- 156 tables, 1178 champs métier, 65 énumérations.
-- Ne pas modifier à la main : toute évolution passe par une nouvelle migration.

-- Up Migration

-- Énumérations (DD chapitre 13) : un domaine par liste fermée.
CREATE DOMAIN action_droit AS varchar(40) CHECK (VALUE IN ('CONSULTER', 'CREER', 'MODIFIER', 'VALIDER', 'EXPORTER', 'PARAMETRER'));
CREATE DOMAIN canal_notification AS varchar(40) CHECK (VALUE IN ('SMS', 'WHATSAPP', 'COURRIEL', 'APPLICATION', 'USSD', 'COURRIER'));
CREATE DOMAIN canal_souscription AS varchar(40) CHECK (VALUE IN ('BUREAU', 'JUNIOR', 'EN_LIGNE', 'COLLECTIF'));
CREATE DOMAIN categorie_enfant AS varchar(40) CHECK (VALUE IN ('A_CHARGE', 'ETUDIANT', 'HANDICAPE'));
CREATE DOMAIN destination_paiement_commission AS varchar(40) CHECK (VALUE IN ('VIREMENT', 'MONNAIE_ELECTRONIQUE', 'COMPTE_PRODUCTION'));
CREATE DOMAIN lien_familial AS varchar(40) CHECK (VALUE IN ('CONJOINT', 'ENFANT'));
CREATE DOMAIN mode_calcul_garantie AS varchar(40) CHECK (VALUE IN ('FORFAIT', 'COUT_REEL', 'CAPITAL_X_TAUX', 'INDEMNITE_JOURNALIERE'));
CREATE DOMAIN mode_designation AS varchar(40) CHECK (VALUE IN ('NOMINATIVE', 'CLAUSE_TYPE', 'CLAUSE_COLLECTIVE'));
CREATE DOMAIN mode_facture_commission AS varchar(40) CHECK (VALUE IN ('AUTOFACTURATION', 'FACTURE_DEPOSEE'));
CREATE DOMAIN mode_regle AS varchar(40) CHECK (VALUE IN ('BLOQUANT', 'ALERTE', 'DESACTIVE'));
CREATE DOMAIN motif_gel AS varchar(40) CHECK (VALUE IN ('RESTITUTION', 'SUSPENSION'));
CREATE DOMAIN motif_restitution AS varchar(40) CHECK (VALUE IN ('FIN_ACTIVITE', 'DEMANDE_MOTIVEE'));
CREATE DOMAIN moyen_approvisionnement AS varchar(40) CHECK (VALUE IN ('ESPECES_SIEGE', 'BANQUE', 'MONNAIE_ELECTRONIQUE'));
CREATE DOMAIN nature_mouvement_compte_production AS varchar(40) CHECK (VALUE IN ('APPROVISIONNEMENT', 'AFFECTATION_COMMISSION', 'EMISSION', 'RENOUVELLEMENT', 'ANNULATION', 'VERSEMENT_PROGRAMME', 'FRAIS_HORS_PRIME', 'RESTITUTION'));
CREATE DOMAIN nature_tiers AS varchar(40) CHECK (VALUE IN ('PHYSIQUE', 'MORALE'));
CREATE DOMAIN niveau_signature AS varchar(40) CHECK (VALUE IN ('CODE_USAGE_UNIQUE', 'CERTIFIEE_ANDE', 'MANUSCRITE_NUMERISEE'));
CREATE DOMAIN origine_ecriture AS varchar(40) CHECK (VALUE IN ('EVENEMENT', 'SAISIE', 'IMPORT', 'EXTOURNE', 'A_NOUVEAU'));
CREATE DOMAIN qualite_intervenant AS varchar(40) CHECK (VALUE IN ('TITULAIRE', 'APPORTEUR', 'PRESCRIPTEUR'));
CREATE DOMAIN role_intervenant AS varchar(40) CHECK (VALUE IN ('AGENT_GENERAL', 'COLLABORATEUR', 'JUNIOR', 'PRESCRIPTEUR', 'CANAL_DIGITAL'));
CREATE DOMAIN role_tiers AS varchar(40) CHECK (VALUE IN ('PROSPECT', 'SOUSCRIPTEUR', 'ASSURE', 'AYANT_DROIT', 'BENEFICIAIRE', 'AGENT_GENERAL', 'COLLABORATEUR', 'JUNIOR', 'PRESCRIPTEUR', 'PRESTATAIRE', 'PROFESSIONNEL_SANTE', 'FOURNISSEUR', 'EMPLOYE', 'DECLARANT', 'TIERS_RESPONSABLE'));
CREATE DOMAIN statut_accord AS varchar(40) CHECK (VALUE IN ('DEMANDE', 'ACCORDE', 'REFUSE', 'COMPLEMENT_DEMANDE'));
CREATE DOMAIN statut_appel_prime AS varchar(40) CHECK (VALUE IN ('EMIS', 'PARTIELLEMENT_PAYE', 'PAYE', 'A_TERME_LEGAL', 'EN_MISE_EN_DEMEURE', 'ANNULE'));
CREATE DOMAIN statut_approvisionnement AS varchar(40) CHECK (VALUE IN ('DECLARE', 'CONFIRME', 'REJETE'));
CREATE DOMAIN statut_carte AS varchar(40) CHECK (VALUE IN ('DEMANDEE', 'ACTIVE', 'BLOQUEE', 'REVOQUEE'));
CREATE DOMAIN statut_carte_pro AS varchar(40) CHECK (VALUE IN ('DEMANDEE', 'VALIDEE', 'PRODUITE', 'REMISE', 'BLOQUEE', 'RETIREE'));
CREATE DOMAIN statut_commission AS varchar(40) CHECK (VALUE IN ('DUE', 'FACTUREE', 'PAYEE', 'REPRISE'));
CREATE DOMAIN statut_compte AS varchar(40) CHECK (VALUE IN ('A_VALIDER', 'ACTIF', 'SUSPENDU', 'DESACTIVE'));
CREATE DOMAIN statut_compte_production AS varchar(40) CHECK (VALUE IN ('ACTIF', 'GELE', 'CLOTURE'));
CREATE DOMAIN statut_dossier AS varchar(40) CHECK (VALUE IN ('BROUILLON', 'A_VALIDER', 'PAYE_A_EMETTRE', 'EMIS', 'REJETE', 'EXPIRE'));
CREATE DOMAIN statut_ecriture AS varchar(40) CHECK (VALUE IN ('BROUILLARD', 'VALIDEE'));
CREATE DOMAIN statut_entite AS varchar(40) CHECK (VALUE IN ('ACTIF', 'INACTIF'));
CREATE DOMAIN statut_envoi AS varchar(40) CHECK (VALUE IN ('EN_ATTENTE', 'ENVOYE', 'REMIS', 'ECHEC'));
CREATE DOMAIN statut_evenement AS varchar(40) CHECK (VALUE IN ('A_TRAITER', 'TRAITE', 'EN_ERREUR'));
CREATE DOMAIN statut_exercice AS varchar(40) CHECK (VALUE IN ('OUVERT', 'CLOTURE'));
CREATE DOMAIN statut_facture AS varchar(40) CHECK (VALUE IN ('GENEREE', 'SOUMISE', 'CONTESTEE', 'VALIDEE', 'ORDONNANCEE', 'PAYEE'));
CREATE DOMAIN statut_facture_commission AS varchar(40) CHECK (VALUE IN ('ETABLIE', 'EMISE', 'CONTESTEE', 'VALIDEE', 'PARTIELLEMENT_PAYEE', 'PAYEE'));
CREATE DOMAIN statut_immobilisation AS varchar(40) CHECK (VALUE IN ('EN_SERVICE', 'CEDE', 'MIS_AU_REBUT'));
CREATE DOMAIN statut_intervenant AS varchar(40) CHECK (VALUE IN ('EN_AGREMENT', 'ACTIF', 'SUSPENDU', 'SORTI'));
CREATE DOMAIN statut_ligne_facture AS varchar(40) CHECK (VALUE IN ('CONFORME', 'REJETEE', 'A_EXAMINER'));
CREATE DOMAIN statut_ordonnance AS varchar(40) CHECK (VALUE IN ('EMISE', 'PARTIELLEMENT_SERVIE', 'SERVIE', 'EXPIREE'));
CREATE DOMAIN statut_ordre_paiement AS varchar(40) CHECK (VALUE IN ('LIQUIDE', 'ORDONNANCE', 'VALIDE', 'EXECUTE', 'REJETE'));
CREATE DOMAIN statut_pec AS varchar(40) CHECK (VALUE IN ('OUVERTE', 'PROVISOIRE', 'CLOTUREE', 'ANNULEE', 'REJETEE'));
CREATE DOMAIN statut_police AS varchar(40) CHECK (VALUE IN ('PROPOSITION', 'ACTIVE', 'ECHUE', 'SUSPENDUE', 'EXPIREE', 'RESILIEE', 'ANNULEE'));
CREATE DOMAIN statut_prestataire AS varchar(40) CHECK (VALUE IN ('EN_AGREMENT', 'AGREE', 'SUSPENDU', 'FIN_CONVENTION'));
CREATE DOMAIN statut_production_carte AS varchar(40) CHECK (VALUE IN ('NUMERIQUE_SEULE', 'PHYSIQUE_DEMANDEE', 'IMPRIMEE', 'REMISE'));
CREATE DOMAIN statut_prospect AS varchar(40) CHECK (VALUE IN ('NOUVEAU', 'CONTACTE', 'INTERESSE', 'CONVERTI', 'PERDU'));
CREATE DOMAIN statut_quittance AS varchar(40) CHECK (VALUE IN ('EMISE', 'SOLDEE', 'A_TERME_LEGAL', 'ANNULEE'));
CREATE DOMAIN statut_rdv AS varchar(40) CHECK (VALUE IN ('RESERVE', 'CONFIRME', 'ANNULE', 'REALISE', 'NON_HONORE'));
CREATE DOMAIN statut_reclamation AS varchar(40) CHECK (VALUE IN ('OUVERTE', 'AFFECTEE', 'EN_COURS', 'ESCALADEE', 'REPONDUE', 'CLOSE'));
CREATE DOMAIN statut_sinistre AS varchar(40) CHECK (VALUE IN ('DECLARE', 'INCOMPLET', 'EN_INSTRUCTION', 'EN_DECISION', 'ACCEPTE', 'REJETE', 'OFFRE_ACCEPTEE', 'EN_PAIEMENT', 'CLOS', 'ROUVERT'));
CREATE DOMAIN statut_validation AS varchar(40) CHECK (VALUE IN ('EN_ATTENTE', 'VALIDE', 'REJETE', 'EXPIRE', 'ANNULE'));
CREATE DOMAIN type_avenant AS varchar(40) CHECK (VALUE IN ('AJOUT_AYANT_DROIT', 'RETRAIT_AYANT_DROIT', 'BENEFICIAIRES', 'COORDONNEES', 'CORRECTION', 'CHANGEMENT_SOUSCRIPTEUR', 'ANNULATION', 'RESILIATION'));
CREATE DOMAIN type_bureau AS varchar(40) CHECK (VALUE IN ('BUREAU_DIRECT', 'CANAL_DIGITAL'));
CREATE DOMAIN type_compte AS varchar(40) CHECK (VALUE IN ('INTERNE', 'AGENT_GENERAL', 'COLLABORATEUR', 'JUNIOR', 'PRESCRIPTEUR', 'ADMIN_PRESTATAIRE', 'PROFESSIONNEL_SANTE', 'ASSURE', 'REPRESENTANT_ENTREPRISE', 'RESPONSABLE_GROUPEMENT', 'DECLARANT'));
CREATE DOMAIN type_coordonnee AS varchar(40) CHECK (VALUE IN ('BANQUE', 'MONNAIE_ELECTRONIQUE'));
CREATE DOMAIN type_couverture AS varchar(40) CHECK (VALUE IN ('INDIVIDUEL', 'FAMILLE', 'GROUPE'));
CREATE DOMAIN type_garantie AS varchar(40) CHECK (VALUE IN ('FRAIS_SOINS', 'INCAPACITE_TEMPORAIRE', 'INCAPACITE_PERMANENTE', 'DECES', 'FRAIS_FUNERAIRES', 'TELECONSULTATION', 'AUTRE'));
CREATE DOMAIN type_journal AS varchar(40) CHECK (VALUE IN ('ACHATS', 'EMISSIONS', 'ENCAISSEMENTS', 'TRESORERIE_BANQUE', 'TRESORERIE_CAISSE', 'PRESTATIONS_SINISTRES', 'OPERATIONS_DIVERSES', 'INVENTAIRE', 'A_NOUVEAUX'));
CREATE DOMAIN type_mouvement_effectif AS varchar(40) CHECK (VALUE IN ('ENTREE', 'SORTIE', 'CHANGEMENT_COLLEGE'));
CREATE DOMAIN type_mouvement_portefeuille AS varchar(40) CHECK (VALUE IN ('CESSION', 'TRANSFERT', 'REAFFECTATION'));
CREATE DOMAIN type_operation_org AS varchar(40) CHECK (VALUE IN ('CREATION', 'RENOMMAGE', 'DEPLACEMENT', 'FUSION', 'SCISSION', 'DESACTIVATION'));
CREATE DOMAIN type_pec AS varchar(40) CHECK (VALUE IN ('STANDARD', 'URGENCE', 'HOSPITALISATION', 'TELECONSULTATION', 'MODE_DEGRADE'));
CREATE DOMAIN type_quittance AS varchar(40) CHECK (VALUE IN ('EMISSION', 'RENOUVELLEMENT', 'AVENANT', 'REGULARISATION', 'FRAIS_HORS_PRIME'));
CREATE DOMAIN type_sinistre AS varchar(40) CHECK (VALUE IN ('ACCIDENT_SOINS', 'INCAPACITE_TEMPORAIRE', 'INCAPACITE_PERMANENTE', 'DECES_ACCIDENTEL', 'FRAIS_FUNERAIRES', 'URGENCE_HORS_RESEAU'));
CREATE DOMAIN vue_carnet AS varchar(40) CHECK (VALUE IN ('COMPLETE', 'EXECUTANT', 'PHARMACIEN'));

-- Colonnes techniques (DD § 2.4) : renseignées par déclencheur.
-- L'application déclare l'utilisateur de la transaction par : SET LOCAL app.utilisateur_id = '<uuid>'.
CREATE FUNCTION app_utilisateur_courant() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.utilisateur_id', true), '')::uuid
$$;

CREATE FUNCTION colonnes_techniques_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.cree_le := COALESCE(NEW.cree_le, now());
  NEW.cree_par := COALESCE(NEW.cree_par, app_utilisateur_courant());
  RETURN NEW;
END $$;

-- Verrou optimiste : l'application met à jour avec « WHERE version_ligne = <version lue> » ;
-- la version est incrémentée ici et ne peut pas être forcée.
CREATE FUNCTION colonnes_techniques_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.cree_le <> OLD.cree_le OR NEW.cree_par IS DISTINCT FROM OLD.cree_par THEN
    RAISE EXCEPTION 'Colonnes de création non modifiables (%)', TG_TABLE_NAME USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.supprime_le IS NOT NULL AND NEW.supprime_le IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Ligne supprimée logiquement : modification interdite (%)', TG_TABLE_NAME USING ERRCODE = 'check_violation';
  END IF;
  NEW.version_ligne := OLD.version_ligne + 1;
  NEW.modifie_le := now();
  NEW.modifie_par := COALESCE(app_utilisateur_courant(), NEW.modifie_par);
  RETURN NEW;
END $$;

-- Aucune donnée métier n'est supprimée physiquement (DD § 2.4) ; les tables « journal » sont en ajout seul (DD § 2.5).
CREATE FUNCTION interdire_suppression() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Suppression physique interdite sur % : utiliser supprime_le', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END $$;

CREATE FUNCTION interdire_modification_journal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Table journal % : ajout seul (% interdit)', TG_TABLE_NAME, TG_OP USING ERRCODE = 'restrict_violation';
END $$;

-- 4.1 departement – Département
CREATE TABLE departement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  code varchar(10) NOT NULL,
  libelle varchar(120) NOT NULL,
  responsable_id uuid,
  date_effet date NOT NULL,
  statut statut_entite NOT NULL,
  CONSTRAINT departement_uk1 UNIQUE (code)
);
COMMENT ON TABLE departement IS 'Département. Entité de premier niveau de l’organisation. [DD 4.1 ; ORG-RG-001, 006, 007.]';
COMMENT ON COLUMN departement.code IS 'Code unique du département – Unique, jamais réutilisé';
COMMENT ON COLUMN departement.libelle IS 'Libellé';
COMMENT ON COLUMN departement.responsable_id IS 'Responsable du département';
COMMENT ON COLUMN departement.date_effet IS 'Date d’effet de la création ou de la dernière modification';
COMMENT ON COLUMN departement.statut IS 'Statut – Désactivation impossible avec utilisateurs actifs ou tâches en cours';
CREATE TRIGGER departement_ins BEFORE INSERT ON departement FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER departement_upd BEFORE UPDATE ON departement FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER departement_del BEFORE DELETE ON departement FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 4.2 service – Service
CREATE TABLE service (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  code varchar(10) NOT NULL,
  libelle varchar(120) NOT NULL,
  departement_id uuid NOT NULL,
  responsable_id uuid,
  date_effet date NOT NULL,
  statut statut_entite NOT NULL,
  CONSTRAINT service_uk1 UNIQUE (code)
);
COMMENT ON TABLE service IS 'Service. Subdivision d’un département. [DD 4.2 ; ORG-RG-001, 002.]';
COMMENT ON COLUMN service.code IS 'Code unique du service – Unique, jamais réutilisé';
COMMENT ON COLUMN service.libelle IS 'Libellé';
COMMENT ON COLUMN service.departement_id IS 'Département de rattachement à la date courante – Historisé dans historique_organisation';
COMMENT ON COLUMN service.responsable_id IS 'Responsable';
COMMENT ON COLUMN service.date_effet IS 'Date d’effet';
COMMENT ON COLUMN service.statut IS 'Statut';
CREATE TRIGGER service_ins BEFORE INSERT ON service FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER service_upd BEFORE UPDATE ON service FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER service_del BEFORE DELETE ON service FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 4.3 fonction – Fonction (poste)
CREATE TABLE fonction (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  code varchar(20) NOT NULL,
  libelle varchar(120) NOT NULL,
  service_id uuid NOT NULL,
  profil_defaut_id uuid,
  statut statut_entite NOT NULL,
  CONSTRAINT fonction_uk1 UNIQUE (code)
);
COMMENT ON TABLE fonction IS 'Fonction (poste). Poste défini dans un service. [DD 4.3 ; ORG-RG-008.]';
COMMENT ON COLUMN fonction.code IS 'Code du poste';
COMMENT ON COLUMN fonction.libelle IS 'Libellé';
COMMENT ON COLUMN fonction.service_id IS 'Service';
COMMENT ON COLUMN fonction.profil_defaut_id IS 'Profil d’habilitation proposé par défaut';
COMMENT ON COLUMN fonction.statut IS 'Statut';
CREATE TRIGGER fonction_ins BEFORE INSERT ON fonction FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER fonction_upd BEFORE UPDATE ON fonction FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER fonction_del BEFORE DELETE ON fonction FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 4.4 historique_organisation – Historique de l’organisation
CREATE TABLE historique_organisation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  operation type_operation_org NOT NULL,
  entite_type varchar(20) NOT NULL,
  entite_id uuid NOT NULL,
  parent_avant_id uuid,
  parent_apres_id uuid,
  date_effet date NOT NULL,
  simulation jsonb,
  valide_par uuid NOT NULL
);
COMMENT ON TABLE historique_organisation IS 'Historique de l’organisation. Trace datée de toute opération sur l’organigramme ; permet de le reconstituer à toute date. [DD 4.4 ; ORG-RG-003 à 006.]';
COMMENT ON COLUMN historique_organisation.operation IS 'Nature de l’opération';
COMMENT ON COLUMN historique_organisation.entite_type IS 'DEPARTEMENT, SERVICE ou FONCTION';
COMMENT ON COLUMN historique_organisation.entite_id IS 'Entité concernée';
COMMENT ON COLUMN historique_organisation.parent_avant_id IS 'Rattachement avant';
COMMENT ON COLUMN historique_organisation.parent_apres_id IS 'Rattachement après';
COMMENT ON COLUMN historique_organisation.date_effet IS 'Date d’effet';
COMMENT ON COLUMN historique_organisation.simulation IS 'Résultat de la simulation (utilisateurs, droits, tâches impactés) – ORG-RG-005';
COMMENT ON COLUMN historique_organisation.valide_par IS 'Second administrateur ou Direction générale – Différent de l’auteur';
CREATE TRIGGER historique_organisation_ins BEFORE INSERT ON historique_organisation FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER historique_organisation_upd BEFORE UPDATE ON historique_organisation FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER historique_organisation_del BEFORE DELETE ON historique_organisation FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 4.5 utilisateur – Utilisateur
CREATE TABLE utilisateur (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  identifiant varchar(80) NOT NULL,
  tiers_id uuid NOT NULL,
  fonction_id uuid,
  type_compte type_compte NOT NULL,
  prestataire_id uuid,
  intervenant_id uuid,
  mot_de_passe_hash varchar(128) NOT NULL,
  double_facteur boolean NOT NULL,
  telephone_verifie varchar(20),
  echecs_connexion integer NOT NULL,
  derniere_connexion timestamptz,
  statut statut_compte NOT NULL,
  cree_par_admin_id uuid NOT NULL,
  valide_par uuid,
  CONSTRAINT utilisateur_uk1 UNIQUE (identifiant)
);
COMMENT ON TABLE utilisateur IS 'Utilisateur. Compte nominatif d’accès, interne ou externe. [DD 4.5 ; ORG-RG-020 à 023, ORG-RG-044.]';
COMMENT ON COLUMN utilisateur.identifiant IS 'Identifiant de connexion – Unique';
COMMENT ON COLUMN utilisateur.tiers_id IS 'Personne physique titulaire du compte – Compte toujours nominatif';
COMMENT ON COLUMN utilisateur.fonction_id IS 'Fonction (utilisateurs internes)';
COMMENT ON COLUMN utilisateur.type_compte IS 'Interne, agent, prestataire, assuré, entreprise, déclarant…';
COMMENT ON COLUMN utilisateur.prestataire_id IS 'Structure de rattachement (utilisateurs des prestataires)';
COMMENT ON COLUMN utilisateur.intervenant_id IS 'Intervenant commercial lié';
COMMENT ON COLUMN utilisateur.mot_de_passe_hash IS 'Empreinte du mot de passe – Jamais stocké en clair';
COMMENT ON COLUMN utilisateur.double_facteur IS 'Double authentification active – Obligatoire selon ORG-RG-022';
COMMENT ON COLUMN utilisateur.telephone_verifie IS 'Téléphone vérifié pour les codes à usage unique';
COMMENT ON COLUMN utilisateur.echecs_connexion IS 'Échecs consécutifs – Suspension au seuil paramétré';
COMMENT ON COLUMN utilisateur.derniere_connexion IS 'Dernière connexion réussie';
COMMENT ON COLUMN utilisateur.statut IS 'Statut';
COMMENT ON COLUMN utilisateur.cree_par_admin_id IS 'Auteur de la création – ORG-RG-021';
COMMENT ON COLUMN utilisateur.valide_par IS 'Validateur du compte';
CREATE TRIGGER utilisateur_ins BEFORE INSERT ON utilisateur FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER utilisateur_upd BEFORE UPDATE ON utilisateur FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER utilisateur_del BEFORE DELETE ON utilisateur FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 4.6 profil – Profil d’habilitation
CREATE TABLE profil (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  code varchar(30) NOT NULL,
  libelle varchar(120) NOT NULL,
  externe boolean NOT NULL,
  type_prestataire varchar(40),
  privilegie boolean NOT NULL,
  CONSTRAINT profil_uk1 UNIQUE (code)
);
COMMENT ON TABLE profil IS 'Profil d’habilitation. Ensemble de droits attribuable à un utilisateur. [DD 4.6 ; ORG-RG-040 à 046, SAN-RG-005.]';
COMMENT ON COLUMN profil.code IS 'Code du profil';
COMMENT ON COLUMN profil.libelle IS 'Libellé';
COMMENT ON COLUMN profil.externe IS 'Profil d’un portail externe';
COMMENT ON COLUMN profil.type_prestataire IS 'Type de prestataire auquel le profil est réservé – Droits fixés par la Compagnie (SAN-RG-005)';
COMMENT ON COLUMN profil.privilegie IS 'Comporte un droit de validation ou de paramétrage – Attribution validée par un second administrateur';
CREATE TRIGGER profil_ins BEFORE INSERT ON profil FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER profil_upd BEFORE UPDATE ON profil FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER profil_del BEFORE DELETE ON profil FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 4.7 droit – Droit
CREATE TABLE droit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  fonction_systeme varchar(80) NOT NULL,
  action action_droit NOT NULL,
  niveau_validation integer,
  CONSTRAINT droit_uk1 UNIQUE (fonction_systeme, action, niveau_validation)
);
COMMENT ON TABLE droit IS 'Droit. Association d’une fonction du système et d’une action. [DD 4.7 ; ORG-RG-040.]';
COMMENT ON COLUMN droit.fonction_systeme IS 'Fonction du système (écran ou service)';
COMMENT ON COLUMN droit.action IS 'Action autorisée';
COMMENT ON COLUMN droit.niveau_validation IS 'Niveau de validation (pour VALIDER)';
CREATE TRIGGER droit_ins BEFORE INSERT ON droit FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER droit_upd BEFORE UPDATE ON droit FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER droit_del BEFORE DELETE ON droit FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 4.8 profil_droit – Droits d’un profil
CREATE TABLE profil_droit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  profil_id uuid NOT NULL,
  droit_id uuid NOT NULL,
  CONSTRAINT profil_droit_uk1 UNIQUE (profil_id, droit_id)
);
COMMENT ON TABLE profil_droit IS 'Droits d’un profil. Table de liaison profil ↔ droit. [DD 4.8 ; ORG-RG-040.]';
COMMENT ON COLUMN profil_droit.profil_id IS 'Profil';
COMMENT ON COLUMN profil_droit.droit_id IS 'Droit';
CREATE TRIGGER profil_droit_ins BEFORE INSERT ON profil_droit FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER profil_droit_upd BEFORE UPDATE ON profil_droit FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER profil_droit_del BEFORE DELETE ON profil_droit FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 4.9 utilisateur_profil – Attribution de profil
CREATE TABLE utilisateur_profil (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  utilisateur_id uuid NOT NULL,
  profil_id uuid NOT NULL,
  perimetre jsonb,
  date_debut date NOT NULL,
  date_fin date,
  attribue_par uuid NOT NULL,
  valide_par uuid
);
COMMENT ON TABLE utilisateur_profil IS 'Attribution de profil. Profil attribué à un utilisateur, avec périmètre et période. [DD 4.9 ; ORG-RG-040, 044.]';
COMMENT ON COLUMN utilisateur_profil.utilisateur_id IS 'Utilisateur';
COMMENT ON COLUMN utilisateur_profil.profil_id IS 'Profil';
COMMENT ON COLUMN utilisateur_profil.perimetre IS 'Départements, services, bureaux, produits autorisés – Contrôlé côté serveur';
COMMENT ON COLUMN utilisateur_profil.date_debut IS 'Début de validité';
COMMENT ON COLUMN utilisateur_profil.date_fin IS 'Fin de validité';
COMMENT ON COLUMN utilisateur_profil.attribue_par IS 'Auteur – Différent de l’utilisateur (pas d’auto-attribution)';
COMMENT ON COLUMN utilisateur_profil.valide_par IS 'Second administrateur (profil privilégié)';
CREATE TRIGGER utilisateur_profil_ins BEFORE INSERT ON utilisateur_profil FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER utilisateur_profil_upd BEFORE UPDATE ON utilisateur_profil FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER utilisateur_profil_del BEFORE DELETE ON utilisateur_profil FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 4.10 incompatibilite_profil – Incompatibilité de profils
CREATE TABLE incompatibilite_profil (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  profil_a_id uuid NOT NULL,
  profil_b_id uuid NOT NULL,
  motif varchar(200) NOT NULL,
  CONSTRAINT incompatibilite_profil_uk1 UNIQUE (profil_a_id, profil_b_id)
);
COMMENT ON TABLE incompatibilite_profil IS 'Incompatibilité de profils. Paires de profils qu’un même utilisateur ne peut pas cumuler. [DD 4.10 ; ORG-RG-042.]';
COMMENT ON COLUMN incompatibilite_profil.profil_a_id IS 'Premier profil';
COMMENT ON COLUMN incompatibilite_profil.profil_b_id IS 'Second profil';
COMMENT ON COLUMN incompatibilite_profil.motif IS 'Motif (ex. comptable / trésorier)';
CREATE TRIGGER incompatibilite_profil_ins BEFORE INSERT ON incompatibilite_profil FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER incompatibilite_profil_upd BEFORE UPDATE ON incompatibilite_profil FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER incompatibilite_profil_del BEFORE DELETE ON incompatibilite_profil FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 4.11 delegation_validation – Référentiel des délégations
CREATE TABLE delegation_validation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  type_operation varchar(60) NOT NULL,
  niveau integer NOT NULL,
  profil_id uuid NOT NULL,
  seuil_min bigint,
  seuil_max bigint,
  date_effet date NOT NULL
);
COMMENT ON TABLE delegation_validation IS 'Référentiel des délégations. Niveaux et seuils de validation par type d’opération. [DD 4.11 ; ORG-RG-041.]';
COMMENT ON COLUMN delegation_validation.type_operation IS 'Paiement, remboursement, annulation, décision de sinistre, écriture manuelle…';
COMMENT ON COLUMN delegation_validation.niveau IS 'Rang du niveau (1, 2…)';
COMMENT ON COLUMN delegation_validation.profil_id IS 'Profil habilité à ce niveau';
COMMENT ON COLUMN delegation_validation.seuil_min IS 'Montant à partir duquel le niveau est requis (GNF)';
COMMENT ON COLUMN delegation_validation.seuil_max IS 'Montant au-delà duquel le niveau supérieur est requis (GNF)';
COMMENT ON COLUMN delegation_validation.date_effet IS 'Date d’effet';
CREATE TRIGGER delegation_validation_ins BEFORE INSERT ON delegation_validation FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER delegation_validation_upd BEFORE UPDATE ON delegation_validation FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER delegation_validation_del BEFORE DELETE ON delegation_validation FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 4.12 interim – Intérim
CREATE TABLE interim (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  delegant_id uuid NOT NULL,
  delegataire_id uuid NOT NULL,
  date_debut timestamptz NOT NULL,
  date_fin timestamptz NOT NULL,
  motif varchar(200) NOT NULL
);
COMMENT ON TABLE interim IS 'Intérim. Délégation temporaire des droits de validation. [DD 4.12 ; ORG-RG-043.]';
COMMENT ON COLUMN interim.delegant_id IS 'Utilisateur qui délègue';
COMMENT ON COLUMN interim.delegataire_id IS 'Utilisateur qui reçoit – Niveau au moins égal';
COMMENT ON COLUMN interim.date_debut IS 'Début';
COMMENT ON COLUMN interim.date_fin IS 'Fin – Retrait automatique à échéance';
COMMENT ON COLUMN interim.motif IS 'Motif';
CREATE TRIGGER interim_ins BEFORE INSERT ON interim FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER interim_upd BEFORE UPDATE ON interim FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER interim_del BEFORE DELETE ON interim FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 4.13 journal_audit – Journal d’audit (journal : ajout seul)
CREATE TABLE journal_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  horodatage timestamptz NOT NULL,
  utilisateur_id uuid,
  adresse_ip varchar(45),
  appareil varchar(200),
  action varchar(40) NOT NULL,
  objet_type varchar(60) NOT NULL,
  objet_id uuid,
  valeur_avant jsonb,
  valeur_apres jsonb,
  empreinte varchar(128) NOT NULL
);
COMMENT ON TABLE journal_audit IS 'Journal d’audit. Trace inaltérable de toute action sensible. [DD 4.13 ; § 4.6, chapitre 15.]';
COMMENT ON COLUMN journal_audit.horodatage IS 'Date et heure de l’action';
COMMENT ON COLUMN journal_audit.utilisateur_id IS 'Auteur (vide pour un traitement système)';
COMMENT ON COLUMN journal_audit.adresse_ip IS 'Adresse réseau';
COMMENT ON COLUMN journal_audit.appareil IS 'Appareil et navigateur';
COMMENT ON COLUMN journal_audit.action IS 'CONNEXION, CONSULTATION, CREATION, MODIFICATION, VALIDATION, EXPORT, PARAMETRAGE';
COMMENT ON COLUMN journal_audit.objet_type IS 'Type d’objet';
COMMENT ON COLUMN journal_audit.objet_id IS 'Identifiant de l’objet';
COMMENT ON COLUMN journal_audit.valeur_avant IS 'Valeur avant';
COMMENT ON COLUMN journal_audit.valeur_apres IS 'Valeur après';
COMMENT ON COLUMN journal_audit.empreinte IS 'Empreinte chaînée – Inaltérabilité';
CREATE TRIGGER journal_audit_ins BEFORE INSERT ON journal_audit FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER journal_audit_journal BEFORE UPDATE OR DELETE ON journal_audit FOR EACH ROW EXECUTE FUNCTION interdire_modification_journal();

-- 4.14 parametre – Paramètre
CREATE TABLE parametre (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  code varchar(60) NOT NULL,
  libelle varchar(200) NOT NULL,
  module varchar(20) NOT NULL,
  type_valeur varchar(20) NOT NULL,
  valeur text NOT NULL,
  valeur_defaut text NOT NULL,
  regle_legale_id uuid,
  date_effet date NOT NULL,
  CONSTRAINT parametre_uk1 UNIQUE (code)
);
COMMENT ON TABLE parametre IS 'Paramètre. Valeur métier paramétrable (taux, délai, seuil, libellé). [DD 4.14 ; DEV-RG-004, annexe C.]';
COMMENT ON COLUMN parametre.code IS 'Code du paramètre';
COMMENT ON COLUMN parametre.libelle IS 'Libellé';
COMMENT ON COLUMN parametre.module IS 'Module propriétaire';
COMMENT ON COLUMN parametre.type_valeur IS 'ENTIER, MONTANT, TAUX, DUREE, BOOLEEN, TEXTE, LISTE';
COMMENT ON COLUMN parametre.valeur IS 'Valeur courante';
COMMENT ON COLUMN parametre.valeur_defaut IS 'Valeur par défaut (annexe C)';
COMMENT ON COLUMN parametre.regle_legale_id IS 'Règle légale portée par ce paramètre';
COMMENT ON COLUMN parametre.date_effet IS 'Date d’effet';
CREATE TRIGGER parametre_ins BEFORE INSERT ON parametre FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER parametre_upd BEFORE UPDATE ON parametre FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER parametre_del BEFORE DELETE ON parametre FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 4.15 parametre_historique – Historique des paramètres (journal : ajout seul)
CREATE TABLE parametre_historique (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  parametre_id uuid NOT NULL,
  ancienne_valeur text,
  nouvelle_valeur text NOT NULL,
  date_effet date NOT NULL,
  auteur_id uuid NOT NULL,
  decision_comite_id uuid
);
COMMENT ON TABLE parametre_historique IS 'Historique des paramètres. Chaque changement de paramètre. [DD 4.15 ; § 5.6.]';
COMMENT ON COLUMN parametre_historique.parametre_id IS 'Paramètre';
COMMENT ON COLUMN parametre_historique.ancienne_valeur IS 'Ancienne valeur';
COMMENT ON COLUMN parametre_historique.nouvelle_valeur IS 'Nouvelle valeur';
COMMENT ON COLUMN parametre_historique.date_effet IS 'Date d’effet';
COMMENT ON COLUMN parametre_historique.auteur_id IS 'Auteur';
COMMENT ON COLUMN parametre_historique.decision_comite_id IS 'Décision du comité de paramétrage';
CREATE TRIGGER parametre_historique_ins BEFORE INSERT ON parametre_historique FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER parametre_historique_journal BEFORE UPDATE OR DELETE ON parametre_historique FOR EACH ROW EXECUTE FUNCTION interdire_modification_journal();

-- 4.16 regle_legale – Règle légale paramétrée
CREATE TABLE regle_legale (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  code varchar(30) NOT NULL,
  texte_reference varchar(200) NOT NULL,
  description text NOT NULL,
  mode mode_regle NOT NULL,
  verrouillee boolean NOT NULL,
  visa_conformite_id uuid,
  CONSTRAINT regle_legale_uk1 UNIQUE (code)
);
COMMENT ON TABLE regle_legale IS 'Règle légale paramétrée. Règle issue d’un texte, avec sa référence et son mode. [DD 4.16 ; ARC-RG-003.]';
COMMENT ON COLUMN regle_legale.code IS 'Code de la règle';
COMMENT ON COLUMN regle_legale.texte_reference IS 'Texte et article (ex. Code des assurances, art. 30)';
COMMENT ON COLUMN regle_legale.description IS 'Contenu de la règle';
COMMENT ON COLUMN regle_legale.mode IS 'Mode d’application';
COMMENT ON COLUMN regle_legale.verrouillee IS 'Règle d’ordre public – Si vrai : mode BLOQUANT, valeurs seulement plus protectrices';
COMMENT ON COLUMN regle_legale.visa_conformite_id IS 'Visa de la Conformité sur la dernière modification';
CREATE TRIGGER regle_legale_ins BEFORE INSERT ON regle_legale FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER regle_legale_upd BEFORE UPDATE ON regle_legale FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER regle_legale_del BEFORE DELETE ON regle_legale FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 4.17 modele_document – Modèle de document
CREATE TABLE modele_document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  code varchar(40) NOT NULL,
  version integer NOT NULL,
  libelle varchar(200) NOT NULL,
  contenu text NOT NULL,
  niveau_signature niveau_signature NOT NULL,
  date_effet date NOT NULL,
  valide_comite boolean NOT NULL,
  CONSTRAINT modele_document_uk1 UNIQUE (code, version)
);
COMMENT ON TABLE modele_document IS 'Modèle de document. Gabarit versionné du moteur de documents. [DD 4.17 ; ARC-RG-001, annexe F, DIG-RG-001.]';
COMMENT ON COLUMN modele_document.code IS 'Code du modèle (POLICE, CARTE, QUITTANCE…)';
COMMENT ON COLUMN modele_document.version IS 'Version';
COMMENT ON COLUMN modele_document.libelle IS 'Libellé';
COMMENT ON COLUMN modele_document.contenu IS 'Gabarit avec variables';
COMMENT ON COLUMN modele_document.niveau_signature IS 'Niveau de signature exigé – DIG-RG-002';
COMMENT ON COLUMN modele_document.date_effet IS 'Date d’effet';
COMMENT ON COLUMN modele_document.valide_comite IS 'Validé par le comité de paramétrage';
CREATE TRIGGER modele_document_ins BEFORE INSERT ON modele_document FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER modele_document_upd BEFORE UPDATE ON modele_document FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER modele_document_del BEFORE DELETE ON modele_document FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 4.18 document – Document
CREATE TABLE document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  type_document varchar(40) NOT NULL,
  modele_document_id uuid,
  objet_type varchar(60) NOT NULL,
  objet_id uuid NOT NULL,
  fichier_ref varchar(300) NOT NULL,
  empreinte varchar(128) NOT NULL,
  horodatage_scellement timestamptz NOT NULL,
  origine varchar(20) NOT NULL,
  lisibilite_controlee boolean,
  date_expiration date,
  imprime integer NOT NULL,
  conservation_jusqu_au date NOT NULL
);
COMMENT ON TABLE document IS 'Document. Document produit ou déposé, stocké dans la gestion électronique des documents. [DD 4.18 ; DIG-RG-001, 003, 007, REF-RG-006.]';
COMMENT ON COLUMN document.type_document IS 'Type (police, quittance, pièce d’identité, facture…)';
COMMENT ON COLUMN document.modele_document_id IS 'Modèle utilisé (document produit)';
COMMENT ON COLUMN document.objet_type IS 'Objet de rattachement (police, sinistre, tiers…)';
COMMENT ON COLUMN document.objet_id IS 'Identifiant de l’objet';
COMMENT ON COLUMN document.fichier_ref IS 'Référence du fichier stocké (PDF/A ou image)';
COMMENT ON COLUMN document.empreinte IS 'Empreinte du fichier';
COMMENT ON COLUMN document.horodatage_scellement IS 'Scellement';
COMMENT ON COLUMN document.origine IS 'PRODUIT ou DEPOSE';
COMMENT ON COLUMN document.lisibilite_controlee IS 'Contrôle de lisibilité effectué (pièce déposée)';
COMMENT ON COLUMN document.date_expiration IS 'Expiration (pièce d’identité)';
COMMENT ON COLUMN document.imprime IS 'Nombre d’impressions – Indicateur DIG-RG-006';
COMMENT ON COLUMN document.conservation_jusqu_au IS 'Fin de conservation – CONF-RG-007';
CREATE TRIGGER document_ins BEFORE INSERT ON document FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER document_upd BEFORE UPDATE ON document FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER document_del BEFORE DELETE ON document FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 4.19 dossier_preuve – Dossier de preuve (journal : ajout seul)
CREATE TABLE dossier_preuve (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  document_id uuid NOT NULL,
  signataire_tiers_id uuid NOT NULL,
  niveau niveau_signature NOT NULL,
  telephone varchar(20),
  code_reference varchar(40),
  prestataire_certification varchar(120),
  jeton_certification text,
  empreinte_document varchar(128) NOT NULL,
  horodatage timestamptz NOT NULL,
  appareil varchar(200),
  assistant_id uuid
);
COMMENT ON TABLE dossier_preuve IS 'Dossier de preuve. Preuve d’une acceptation électronique. [DD 4.19 ; DIG-RG-002, DIG-RG-005.]';
COMMENT ON COLUMN dossier_preuve.document_id IS 'Document accepté';
COMMENT ON COLUMN dossier_preuve.signataire_tiers_id IS 'Personne qui accepte';
COMMENT ON COLUMN dossier_preuve.niveau IS 'Niveau de signature';
COMMENT ON COLUMN dossier_preuve.telephone IS 'Téléphone vérifié destinataire du code';
COMMENT ON COLUMN dossier_preuve.code_reference IS 'Référence du code (jamais le code en clair)';
COMMENT ON COLUMN dossier_preuve.prestataire_certification IS 'Prestataire agréé ANDE (signature certifiée)';
COMMENT ON COLUMN dossier_preuve.jeton_certification IS 'Jeton ou certificat retourné';
COMMENT ON COLUMN dossier_preuve.empreinte_document IS 'Empreinte du document présenté';
COMMENT ON COLUMN dossier_preuve.horodatage IS 'Date et heure de l’acceptation';
COMMENT ON COLUMN dossier_preuve.appareil IS 'Appareil';
COMMENT ON COLUMN dossier_preuve.assistant_id IS 'Agent ou guichetier ayant assisté – SIN-RG-002';
CREATE TRIGGER dossier_preuve_ins BEFORE INSERT ON dossier_preuve FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER dossier_preuve_journal BEFORE UPDATE OR DELETE ON dossier_preuve FOR EACH ROW EXECUTE FUNCTION interdire_modification_journal();

-- 4.20 modele_notification – Modèle de notification
CREATE TABLE modele_notification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  code varchar(40) NOT NULL,
  canal canal_notification NOT NULL,
  langue varchar(5) NOT NULL,
  contenu text NOT NULL,
  actif boolean NOT NULL,
  CONSTRAINT modele_notification_uk1 UNIQUE (code, canal, langue)
);
COMMENT ON TABLE modele_notification IS 'Modèle de notification. Message paramétrable par canal et par langue. [DD 4.20 ; § 3.5.]';
COMMENT ON COLUMN modele_notification.code IS 'Code de l’événement déclencheur';
COMMENT ON COLUMN modele_notification.canal IS 'Canal';
COMMENT ON COLUMN modele_notification.langue IS 'Langue (fr, langues nationales)';
COMMENT ON COLUMN modele_notification.contenu IS 'Texte avec variables';
COMMENT ON COLUMN modele_notification.actif IS 'Actif';
CREATE TRIGGER modele_notification_ins BEFORE INSERT ON modele_notification FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER modele_notification_upd BEFORE UPDATE ON modele_notification FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER modele_notification_del BEFORE DELETE ON modele_notification FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 4.21 notification – Notification envoyée (journal : ajout seul)
CREATE TABLE notification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  destinataire_tiers_id uuid NOT NULL,
  modele_notification_id uuid NOT NULL,
  canal canal_notification NOT NULL,
  adresse varchar(200) NOT NULL,
  objet_type varchar(60),
  objet_id uuid,
  statut statut_envoi NOT NULL,
  envoye_le timestamptz,
  remis_le timestamptz,
  niveau_relance integer
);
COMMENT ON TABLE notification IS 'Notification envoyée. Historique de tous les messages. [DD 4.21 ; § 3.5, DIG-RG-004.]';
COMMENT ON COLUMN notification.destinataire_tiers_id IS 'Destinataire';
COMMENT ON COLUMN notification.modele_notification_id IS 'Modèle';
COMMENT ON COLUMN notification.canal IS 'Canal utilisé';
COMMENT ON COLUMN notification.adresse IS 'Numéro ou adresse';
COMMENT ON COLUMN notification.objet_type IS 'Objet concerné';
COMMENT ON COLUMN notification.objet_id IS 'Identifiant';
COMMENT ON COLUMN notification.statut IS 'Statut d’envoi';
COMMENT ON COLUMN notification.envoye_le IS 'Envoi';
COMMENT ON COLUMN notification.remis_le IS 'Remise confirmée';
COMMENT ON COLUMN notification.niveau_relance IS 'Rang de relance (moteur de relances)';
CREATE TRIGGER notification_ins BEFORE INSERT ON notification FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER notification_journal BEFORE UPDATE OR DELETE ON notification FOR EACH ROW EXECUTE FUNCTION interdire_modification_journal();

-- 4.22 compteur_numerotation – Compteur de numérotation
CREATE TABLE compteur_numerotation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  type_objet varchar(20) NOT NULL,
  cle_compteur varchar(60) NOT NULL,
  derniere_valeur integer NOT NULL,
  valeur_max integer NOT NULL,
  CONSTRAINT compteur_numerotation_uk1 UNIQUE (type_objet, cle_compteur)
);
COMMENT ON TABLE compteur_numerotation IS 'Compteur de numérotation. Compteurs protégés de toutes les numérotations. [DD 4.22 ; Chapitre 6, NUM-RG-003, 009.]';
COMMENT ON COLUMN compteur_numerotation.type_objet IS 'POLICE, QUITTANCE, SINISTRE, PEC…';
COMMENT ON COLUMN compteur_numerotation.cle_compteur IS 'Combinaison (ex. bureau + produit + année)';
COMMENT ON COLUMN compteur_numerotation.derniere_valeur IS 'Dernière valeur attribuée';
COMMENT ON COLUMN compteur_numerotation.valeur_max IS 'Capacité – Alerte à 95 %, blocage au maximum';
CREATE TRIGGER compteur_numerotation_ins BEFORE INSERT ON compteur_numerotation FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER compteur_numerotation_upd BEFORE UPDATE ON compteur_numerotation FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER compteur_numerotation_del BEFORE DELETE ON compteur_numerotation FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 4.23 evenement_metier – Événement métier (outbox) (journal : ajout seul)
CREATE TABLE evenement_metier (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  type_evenement varchar(60) NOT NULL,
  objet_type varchar(60) NOT NULL,
  objet_id uuid NOT NULL,
  charge_utile jsonb NOT NULL,
  cle_idempotence varchar(120) NOT NULL,
  statut statut_evenement NOT NULL,
  tentatives integer NOT NULL,
  erreur text,
  CONSTRAINT evenement_metier_uk1 UNIQUE (cle_idempotence)
);
COMMENT ON TABLE evenement_metier IS 'Événement métier (outbox). Événement écrit dans la transaction qui le produit, puis distribué. [DD 4.23 ; § 3.1, § 3.4.]';
COMMENT ON COLUMN evenement_metier.type_evenement IS 'Type (POLICE_EMISE, DEPOT_CONFIRME…)';
COMMENT ON COLUMN evenement_metier.objet_type IS 'Objet source';
COMMENT ON COLUMN evenement_metier.objet_id IS 'Identifiant';
COMMENT ON COLUMN evenement_metier.charge_utile IS 'Données de l’événement';
COMMENT ON COLUMN evenement_metier.cle_idempotence IS 'Clé d’idempotence – Unique : un rejeu ne produit pas deux effets';
COMMENT ON COLUMN evenement_metier.statut IS 'Statut de distribution';
COMMENT ON COLUMN evenement_metier.tentatives IS 'Nombre de tentatives';
COMMENT ON COLUMN evenement_metier.erreur IS 'Dernière erreur';
CREATE TRIGGER evenement_metier_ins BEFORE INSERT ON evenement_metier FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER evenement_metier_journal BEFORE UPDATE OR DELETE ON evenement_metier FOR EACH ROW EXECUTE FUNCTION interdire_modification_journal();

-- 4.24 demande_validation – Demande de validation
CREATE TABLE demande_validation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  type_operation varchar(60) NOT NULL,
  objet_type varchar(60) NOT NULL,
  objet_id uuid NOT NULL,
  montant bigint,
  initiateur_id uuid NOT NULL,
  niveaux_requis integer NOT NULL,
  statut statut_validation NOT NULL
);
COMMENT ON TABLE demande_validation IS 'Demande de validation. Instance d’un circuit de validation. [DD 4.24 ; ORG-RG-041, 042, FIN-RG-050.]';
COMMENT ON COLUMN demande_validation.type_operation IS 'Type d’opération (référentiel des délégations)';
COMMENT ON COLUMN demande_validation.objet_type IS 'Objet soumis';
COMMENT ON COLUMN demande_validation.objet_id IS 'Identifiant';
COMMENT ON COLUMN demande_validation.montant IS 'Montant (détermine les niveaux)';
COMMENT ON COLUMN demande_validation.initiateur_id IS 'Initiateur';
COMMENT ON COLUMN demande_validation.niveaux_requis IS 'Nombre de niveaux requis';
COMMENT ON COLUMN demande_validation.statut IS 'Statut';
CREATE TRIGGER demande_validation_ins BEFORE INSERT ON demande_validation FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER demande_validation_upd BEFORE UPDATE ON demande_validation FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER demande_validation_del BEFORE DELETE ON demande_validation FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 4.25 validation_etape – Étape de validation
CREATE TABLE validation_etape (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  demande_validation_id uuid NOT NULL,
  niveau integer NOT NULL,
  valideur_id uuid NOT NULL,
  decision statut_validation NOT NULL,
  motif text,
  interim_id uuid,
  decide_le timestamptz NOT NULL
);
COMMENT ON TABLE validation_etape IS 'Étape de validation. Décision à un niveau d’une demande. [DD 4.25 ; ORG-RG-042.]';
COMMENT ON COLUMN validation_etape.demande_validation_id IS 'Demande';
COMMENT ON COLUMN validation_etape.niveau IS 'Niveau';
COMMENT ON COLUMN validation_etape.valideur_id IS 'Valideur – Ni l’initiateur, ni le valideur d’un autre niveau';
COMMENT ON COLUMN validation_etape.decision IS 'Décision';
COMMENT ON COLUMN validation_etape.motif IS 'Motif (obligatoire en cas de rejet)';
COMMENT ON COLUMN validation_etape.interim_id IS 'Intérim utilisé';
COMMENT ON COLUMN validation_etape.decide_le IS 'Date et heure';
CREATE TRIGGER validation_etape_ins BEFORE INSERT ON validation_etape FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER validation_etape_upd BEFORE UPDATE ON validation_etape FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER validation_etape_del BEFORE DELETE ON validation_etape FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 4.26 motif_blocage_ref – Référentiel des motifs de blocage
CREATE TABLE motif_blocage_ref (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  code varchar(30) NOT NULL,
  libelle_assure varchar(200) NOT NULL,
  libelle_prestataire varchar(200) NOT NULL,
  module_deposant varchar(20) NOT NULL,
  actif boolean NOT NULL,
  CONSTRAINT motif_blocage_ref_uk1 UNIQUE (code)
);
COMMENT ON TABLE motif_blocage_ref IS 'Référentiel des motifs de blocage. Motifs qui rendent une carte inutilisable. [DD 4.26 ; ARC-RG-011, 013, § 3.7.]';
COMMENT ON COLUMN motif_blocage_ref.code IS 'Code du motif';
COMMENT ON COLUMN motif_blocage_ref.libelle_assure IS 'Libellé et démarche affichés à l’assuré';
COMMENT ON COLUMN motif_blocage_ref.libelle_prestataire IS 'Libellé affiché au prestataire (sans détail)';
COMMENT ON COLUMN motif_blocage_ref.module_deposant IS 'Module autorisé à déposer le motif';
COMMENT ON COLUMN motif_blocage_ref.actif IS 'Actif';
CREATE TRIGGER motif_blocage_ref_ins BEFORE INSERT ON motif_blocage_ref FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER motif_blocage_ref_upd BEFORE UPDATE ON motif_blocage_ref FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER motif_blocage_ref_del BEFORE DELETE ON motif_blocage_ref FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 4.27 motif_blocage – Motif de blocage actif
CREATE TABLE motif_blocage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  motif_ref_id uuid NOT NULL,
  carte_assure_id uuid,
  tiers_id uuid,
  date_debut timestamptz NOT NULL,
  date_fin timestamptz,
  justification text NOT NULL,
  depose_par uuid,
  leve_par uuid
);
COMMENT ON TABLE motif_blocage IS 'Motif de blocage actif. Motif déposé sur une carte ou une personne couverte. [DD 4.27 ; ARC-RG-011, 012.]';
COMMENT ON COLUMN motif_blocage.motif_ref_id IS 'Motif';
COMMENT ON COLUMN motif_blocage.carte_assure_id IS 'Carte visée';
COMMENT ON COLUMN motif_blocage.tiers_id IS 'Personne visée (toutes ses cartes)';
COMMENT ON COLUMN motif_blocage.date_debut IS 'Dépôt';
COMMENT ON COLUMN motif_blocage.date_fin IS 'Levée';
COMMENT ON COLUMN motif_blocage.justification IS 'Justification';
COMMENT ON COLUMN motif_blocage.depose_par IS 'Auteur (vide si traitement planifié)';
COMMENT ON COLUMN motif_blocage.leve_par IS 'Auteur de la levée';
CREATE TRIGGER motif_blocage_ins BEFORE INSERT ON motif_blocage FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER motif_blocage_upd BEFORE UPDATE ON motif_blocage FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER motif_blocage_del BEFORE DELETE ON motif_blocage FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 4.28 reclamation – Réclamation
CREATE TABLE reclamation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  numero varchar(20) NOT NULL,
  tiers_id uuid NOT NULL,
  canal canal_notification NOT NULL,
  objet varchar(40) NOT NULL,
  objet_type varchar(60),
  objet_id uuid,
  description text NOT NULL,
  gestionnaire_id uuid,
  echeance date NOT NULL,
  statut statut_reclamation NOT NULL,
  reponse text,
  repondu_le timestamptz,
  CONSTRAINT reclamation_uk1 UNIQUE (numero)
);
COMMENT ON TABLE reclamation IS 'Réclamation. Module unique des réclamations de toute la Compagnie. [DD 4.28 ; § 8.10, SIN-RG-025, CONF-RG-006.]';
COMMENT ON COLUMN reclamation.numero IS 'Numéro de réclamation';
COMMENT ON COLUMN reclamation.tiers_id IS 'Réclamant';
COMMENT ON COLUMN reclamation.canal IS 'Canal de réception';
COMMENT ON COLUMN reclamation.objet IS 'PRODUCTION, SANTE, SINISTRE, COMMISSION, PORTAIL, DONNEES_PERSONNELLES';
COMMENT ON COLUMN reclamation.objet_type IS 'Objet concerné';
COMMENT ON COLUMN reclamation.objet_id IS 'Identifiant';
COMMENT ON COLUMN reclamation.description IS 'Description';
COMMENT ON COLUMN reclamation.gestionnaire_id IS 'Gestionnaire';
COMMENT ON COLUMN reclamation.echeance IS 'Échéance de réponse – 15 jours ouvrables par défaut';
COMMENT ON COLUMN reclamation.statut IS 'Statut';
COMMENT ON COLUMN reclamation.reponse IS 'Réponse';
COMMENT ON COLUMN reclamation.repondu_le IS 'Date de réponse';
CREATE TRIGGER reclamation_ins BEFORE INSERT ON reclamation FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER reclamation_upd BEFORE UPDATE ON reclamation FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER reclamation_del BEFORE DELETE ON reclamation FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 5.1 societe – Fiche de la Compagnie
CREATE TABLE societe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  raison_sociale varchar(200) NOT NULL,
  activite varchar(200) NOT NULL,
  forme_juridique varchar(60) NOT NULL,
  capital_social bigint NOT NULL,
  numero_agrement varchar(60) NOT NULL,
  logo_document_id uuid,
  pays varchar(60) NOT NULL,
  region varchar(60) NOT NULL,
  commune varchar(60) NOT NULL,
  quartier varchar(120) NOT NULL,
  telephone varchar(20) NOT NULL,
  courriel varchar(120) NOT NULL,
  site_internet varchar(200),
  rccm varchar(60) NOT NULL,
  nif varchar(40) NOT NULL,
  cle_tva varchar(40),
  numero_cnss varchar(40),
  commentaire text
);
COMMENT ON TABLE societe IS 'Fiche de la Compagnie. Fiche unique de la société utilisatrice ; ses données alimentent tous les documents. [DD 5.1 ; REF-RG-010 à 013, FIN-RG-070.]';
COMMENT ON COLUMN societe.raison_sociale IS 'Raison sociale';
COMMENT ON COLUMN societe.activite IS 'Activité';
COMMENT ON COLUMN societe.forme_juridique IS 'Forme juridique';
COMMENT ON COLUMN societe.capital_social IS 'Capital social (GNF)';
COMMENT ON COLUMN societe.numero_agrement IS 'Numéro d’agrément de la Compagnie';
COMMENT ON COLUMN societe.logo_document_id IS 'Logo';
COMMENT ON COLUMN societe.pays IS 'Pays';
COMMENT ON COLUMN societe.region IS 'Région';
COMMENT ON COLUMN societe.commune IS 'Commune';
COMMENT ON COLUMN societe.quartier IS 'Quartier (siège)';
COMMENT ON COLUMN societe.telephone IS 'Téléphone';
COMMENT ON COLUMN societe.courriel IS 'Courriel';
COMMENT ON COLUMN societe.site_internet IS 'Site internet';
COMMENT ON COLUMN societe.rccm IS 'RCCM';
COMMENT ON COLUMN societe.nif IS 'NIF';
COMMENT ON COLUMN societe.cle_tva IS 'Clé TVA';
COMMENT ON COLUMN societe.numero_cnss IS 'Numéro CNSS';
COMMENT ON COLUMN societe.commentaire IS 'Commentaire';
CREATE TRIGGER societe_ins BEFORE INSERT ON societe FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER societe_upd BEFORE UPDATE ON societe FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER societe_del BEFORE DELETE ON societe FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 5.2 societe_historique – Historique de la fiche Compagnie (journal : ajout seul)
CREATE TABLE societe_historique (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  champ varchar(60) NOT NULL,
  ancienne_valeur text,
  nouvelle_valeur text NOT NULL,
  date_effet date NOT NULL,
  auteur_id uuid NOT NULL,
  valide_par uuid NOT NULL
);
COMMENT ON TABLE societe_historique IS 'Historique de la fiche Compagnie. Versions datées des mentions légales. [DD 5.2 ; REF-RG-012, 013.]';
COMMENT ON COLUMN societe_historique.champ IS 'Champ modifié';
COMMENT ON COLUMN societe_historique.ancienne_valeur IS 'Ancienne valeur';
COMMENT ON COLUMN societe_historique.nouvelle_valeur IS 'Nouvelle valeur';
COMMENT ON COLUMN societe_historique.date_effet IS 'Date d’effet – Un document réimprimé porte les mentions en vigueur à sa date';
COMMENT ON COLUMN societe_historique.auteur_id IS 'Administrateur général';
COMMENT ON COLUMN societe_historique.valide_par IS 'DAF ou Direction générale';
CREATE TRIGGER societe_historique_ins BEFORE INSERT ON societe_historique FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER societe_historique_journal BEFORE UPDATE OR DELETE ON societe_historique FOR EACH ROW EXECUTE FUNCTION interdire_modification_journal();

-- 5.3 tiers – Tiers
CREATE TABLE tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  code_tiers varchar(12) NOT NULL,
  nature nature_tiers NOT NULL,
  nom varchar(120) NOT NULL,
  prenoms varchar(160),
  date_naissance date,
  sexe varchar(1),
  type_piece varchar(40),
  numero_piece varchar(60),
  telephone varchar(20),
  telephone_verifie boolean NOT NULL,
  courriel varchar(120),
  adresse varchar(300),
  langue_notification varchar(5) NOT NULL,
  canal_prefere canal_notification NOT NULL,
  rccm varchar(60),
  nif varchar(40),
  dirigeant_tiers_id uuid,
  groupe_sanguin varchar(3),
  accord_impression_groupe boolean,
  photo_document_id uuid,
  pep boolean,
  statut varchar(20) NOT NULL,
  fusionne_dans_id uuid,
  score_doublon_max numeric(5,2),
  CONSTRAINT tiers_uk1 UNIQUE (code_tiers),
  CONSTRAINT tiers_uk2 UNIQUE (type_piece, numero_piece),
  CONSTRAINT tiers_uk3 UNIQUE (nom, prenoms, date_naissance),
  CONSTRAINT tiers_uk4 UNIQUE (telephone)
);
COMMENT ON TABLE tiers IS 'Tiers. Fiche unique d’une personne physique ou morale, quels que soient ses rôles. [DD 5.3 ; REF-RG-001 à 009, 014.]';
COMMENT ON COLUMN tiers.code_tiers IS 'Code tiers – Unique';
COMMENT ON COLUMN tiers.nature IS 'Personne physique ou morale – Non modifiable ; 1er chiffre du numéro de police';
COMMENT ON COLUMN tiers.nom IS 'Nom (ou raison sociale)';
COMMENT ON COLUMN tiers.prenoms IS 'Prénoms (personne physique)';
COMMENT ON COLUMN tiers.date_naissance IS 'Date de naissance (obligatoire pour un assuré)';
COMMENT ON COLUMN tiers.sexe IS 'Sexe';
COMMENT ON COLUMN tiers.type_piece IS 'Type de pièce d’identité';
COMMENT ON COLUMN tiers.numero_piece IS 'Numéro de pièce – Contrôle de doublons';
COMMENT ON COLUMN tiers.telephone IS 'Téléphone principal';
COMMENT ON COLUMN tiers.telephone_verifie IS 'Téléphone vérifié par code';
COMMENT ON COLUMN tiers.courriel IS 'Courriel';
COMMENT ON COLUMN tiers.adresse IS 'Adresse (commune, quartier)';
COMMENT ON COLUMN tiers.langue_notification IS 'Langue des messages';
COMMENT ON COLUMN tiers.canal_prefere IS 'Canal de notification préféré';
COMMENT ON COLUMN tiers.rccm IS 'RCCM (personne morale)';
COMMENT ON COLUMN tiers.nif IS 'NIF';
COMMENT ON COLUMN tiers.dirigeant_tiers_id IS 'Dirigeant (personne morale)';
COMMENT ON COLUMN tiers.groupe_sanguin IS 'Groupe sanguin déclaré – Imprimé seulement avec accord (SAN-RG-017)';
COMMENT ON COLUMN tiers.accord_impression_groupe IS 'Accord pour l’impression du groupe sanguin';
COMMENT ON COLUMN tiers.photo_document_id IS 'Photo d’identité';
COMMENT ON COLUMN tiers.pep IS 'Personne politiquement exposée (déclaration) – CONF-RG-002';
COMMENT ON COLUMN tiers.statut IS 'ACTIF, FUSIONNE, DECEDE';
COMMENT ON COLUMN tiers.fusionne_dans_id IS 'Fiche conservée après fusion – FIN-RG-015 (fusion dans le seul référentiel)';
COMMENT ON COLUMN tiers.score_doublon_max IS 'Ressemblance maximale détectée à la création – REF-RG-002';
CREATE TRIGGER tiers_ins BEFORE INSERT ON tiers FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER tiers_upd BEFORE UPDATE ON tiers FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER tiers_del BEFORE DELETE ON tiers FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 5.4 tiers_role – Rôle d’un tiers
CREATE TABLE tiers_role (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  tiers_id uuid NOT NULL,
  role role_tiers NOT NULL,
  date_debut date NOT NULL,
  date_fin date,
  compte_auxiliaire_id uuid,
  CONSTRAINT tiers_role_uk1 UNIQUE (tiers_id, role, date_debut)
);
COMMENT ON TABLE tiers_role IS 'Rôle d’un tiers. Rôles portés par une même fiche. [DD 5.4 ; REF-RG-004.]';
COMMENT ON COLUMN tiers_role.tiers_id IS 'Tiers';
COMMENT ON COLUMN tiers_role.role IS 'Rôle';
COMMENT ON COLUMN tiers_role.date_debut IS 'Début';
COMMENT ON COLUMN tiers_role.date_fin IS 'Fin';
COMMENT ON COLUMN tiers_role.compte_auxiliaire_id IS 'Compte auxiliaire créé automatiquement – Pour un bénéficiaire : créé à l’acceptation d’une indemnité';
CREATE TRIGGER tiers_role_ins BEFORE INSERT ON tiers_role FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER tiers_role_upd BEFORE UPDATE ON tiers_role FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER tiers_role_del BEFORE DELETE ON tiers_role FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 5.5 lien_foyer – Lien familial
CREATE TABLE lien_foyer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  assure_principal_id uuid NOT NULL,
  membre_id uuid NOT NULL,
  lien lien_familial NOT NULL,
  parent_conjoint_id uuid,
  categorie_enfant categorie_enfant,
  justificatif_document_id uuid,
  justificatif_valide_jusqu_au date,
  date_debut date NOT NULL,
  date_fin date
);
COMMENT ON TABLE lien_foyer IS 'Lien familial. Conjoints et enfants rattachés à un assuré principal. [DD 5.5 ; REF-RG-007 à 009.]';
COMMENT ON COLUMN lien_foyer.assure_principal_id IS 'Assuré principal';
COMMENT ON COLUMN lien_foyer.membre_id IS 'Conjoint ou enfant';
COMMENT ON COLUMN lien_foyer.lien IS 'Nature du lien';
COMMENT ON COLUMN lien_foyer.parent_conjoint_id IS 'Conjoint parent de l’enfant – Représentant légal (REF-RG-008)';
COMMENT ON COLUMN lien_foyer.categorie_enfant IS 'Catégorie de l’enfant';
COMMENT ON COLUMN lien_foyer.justificatif_document_id IS 'Justificatif (scolarité, handicap)';
COMMENT ON COLUMN lien_foyer.justificatif_valide_jusqu_au IS 'Fin de validité du justificatif';
COMMENT ON COLUMN lien_foyer.date_debut IS 'Début';
COMMENT ON COLUMN lien_foyer.date_fin IS 'Fin';
CREATE TRIGGER lien_foyer_ins BEFORE INSERT ON lien_foyer FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER lien_foyer_upd BEFORE UPDATE ON lien_foyer FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER lien_foyer_del BEFORE DELETE ON lien_foyer FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 5.6 coordonnee_paiement – Coordonnées de paiement
CREATE TABLE coordonnee_paiement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  tiers_id uuid NOT NULL,
  type type_coordonnee NOT NULL,
  etablissement varchar(120) NOT NULL,
  numero bytea NOT NULL,
  intitule varchar(200) NOT NULL,
  principale boolean NOT NULL,
  statut varchar(20) NOT NULL,
  verifiee_par uuid,
  carence_jusqu_au timestamptz
);
COMMENT ON TABLE coordonnee_paiement IS 'Coordonnées de paiement. Comptes bancaires et de monnaie électronique d’un tiers. [DD 5.6 ; REF-RG-005, FIN-RG-051.]';
COMMENT ON COLUMN coordonnee_paiement.tiers_id IS 'Titulaire';
COMMENT ON COLUMN coordonnee_paiement.type IS 'Banque ou monnaie électronique';
COMMENT ON COLUMN coordonnee_paiement.etablissement IS 'Banque ou opérateur';
COMMENT ON COLUMN coordonnee_paiement.numero IS 'Numéro de compte ou de portefeuille (chiffré)';
COMMENT ON COLUMN coordonnee_paiement.intitule IS 'Intitulé du compte – Doit correspondre au nom du tiers';
COMMENT ON COLUMN coordonnee_paiement.principale IS 'Coordonnée principale';
COMMENT ON COLUMN coordonnee_paiement.statut IS 'A_VERIFIER, VERIFIEE, SUSPENDUE';
COMMENT ON COLUMN coordonnee_paiement.verifiee_par IS 'Second utilisateur ayant validé';
COMMENT ON COLUMN coordonnee_paiement.carence_jusqu_au IS 'Aucun paiement avant cette date – Délai de carence paramétrable';
CREATE TRIGGER coordonnee_paiement_ins BEFORE INSERT ON coordonnee_paiement FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER coordonnee_paiement_upd BEFORE UPDATE ON coordonnee_paiement FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER coordonnee_paiement_del BEFORE DELETE ON coordonnee_paiement FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 5.7 bureau – Bureau
CREATE TABLE bureau (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  code varchar(2) NOT NULL,
  nom varchar(120) NOT NULL,
  type type_bureau NOT NULL,
  adresse varchar(300) NOT NULL,
  statut statut_entite NOT NULL,
  CONSTRAINT bureau_uk1 UNIQUE (code)
);
COMMENT ON TABLE bureau IS 'Bureau. Bureau direct d’un agent général ou bureau Canal digital. [DD 5.7 ; REF-RG-020, 021, COM-RG-001, 003.]';
COMMENT ON COLUMN bureau.code IS 'Code bureau 01 à 99 – Unique, jamais réutilisé ; alerte à 90 codes';
COMMENT ON COLUMN bureau.nom IS 'Nom';
COMMENT ON COLUMN bureau.type IS 'Type';
COMMENT ON COLUMN bureau.adresse IS 'Adresse';
COMMENT ON COLUMN bureau.statut IS 'Statut';
CREATE TRIGGER bureau_ins BEFORE INSERT ON bureau FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER bureau_upd BEFORE UPDATE ON bureau FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER bureau_del BEFORE DELETE ON bureau FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 5.8 bureau_gestionnaire – Gestionnaire d’un bureau
CREATE TABLE bureau_gestionnaire (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  bureau_id uuid NOT NULL,
  intervenant_id uuid NOT NULL,
  date_debut date NOT NULL,
  date_fin date
);
COMMENT ON TABLE bureau_gestionnaire IS 'Gestionnaire d’un bureau. Historique des gestionnaires d’un bureau. [DD 5.8 ; COM-RG-001.]';
COMMENT ON COLUMN bureau_gestionnaire.bureau_id IS 'Bureau';
COMMENT ON COLUMN bureau_gestionnaire.intervenant_id IS 'Agent général ou cellule Canal digital';
COMMENT ON COLUMN bureau_gestionnaire.date_debut IS 'Début';
COMMENT ON COLUMN bureau_gestionnaire.date_fin IS 'Fin';
CREATE TRIGGER bureau_gestionnaire_ins BEFORE INSERT ON bureau_gestionnaire FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER bureau_gestionnaire_upd BEFORE UPDATE ON bureau_gestionnaire FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER bureau_gestionnaire_del BEFORE DELETE ON bureau_gestionnaire FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 5.9 produit – Produit
CREATE TABLE produit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  code varchar(2) NOT NULL,
  libelle varchar(120) NOT NULL,
  branche_bcrg varchar(60) NOT NULL,
  type_couverture type_couverture NOT NULL,
  type_contrat varchar(20) NOT NULL,
  age_min integer NOT NULL,
  age_max integer NOT NULL,
  duree_mois integer NOT NULL,
  documents_exiges jsonb NOT NULL,
  modele_cg_id uuid NOT NULL,
  modele_cp_id uuid NOT NULL,
  delai_renonciation_jours integer,
  ristourne_deces boolean NOT NULL,
  date_effet date NOT NULL,
  date_fin_commercialisation date,
  formule_remplacement_id uuid,
  CONSTRAINT produit_uk1 UNIQUE (code)
);
COMMENT ON TABLE produit IS 'Produit. Niveau 1 du catalogue. [DD 5.9 ; § 5.5, REF-RG-030 à 035.]';
COMMENT ON COLUMN produit.code IS 'Code produit – Unique ; utilisé dans le numéro de police';
COMMENT ON COLUMN produit.libelle IS 'Libellé';
COMMENT ON COLUMN produit.branche_bcrg IS 'Branche BCRG';
COMMENT ON COLUMN produit.type_couverture IS 'Type de couverture';
COMMENT ON COLUMN produit.type_contrat IS 'INDIVIDUEL ou COLLECTIF';
COMMENT ON COLUMN produit.age_min IS 'Âge minimal à la souscription';
COMMENT ON COLUMN produit.age_max IS 'Âge maximal';
COMMENT ON COLUMN produit.duree_mois IS 'Durée (12)';
COMMENT ON COLUMN produit.documents_exiges IS 'Pièces exigées';
COMMENT ON COLUMN produit.modele_cg_id IS 'Conditions générales';
COMMENT ON COLUMN produit.modele_cp_id IS 'Bulletin d’adhésion valant conditions particulières';
COMMENT ON COLUMN produit.delai_renonciation_jours IS 'Délai de renonciation (vente en ligne) – PROD-RG-074';
COMMENT ON COLUMN produit.ristourne_deces IS 'Ristourne au prorata en cas de décès – PROD-RG-041';
COMMENT ON COLUMN produit.date_effet IS 'Date d’effet';
COMMENT ON COLUMN produit.date_fin_commercialisation IS 'Fin de commercialisation';
COMMENT ON COLUMN produit.formule_remplacement_id IS 'Formule de remplacement à la fermeture – REF-RG-032';
CREATE TRIGGER produit_ins BEFORE INSERT ON produit FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER produit_upd BEFORE UPDATE ON produit FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER produit_del BEFORE DELETE ON produit FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 5.10 formule – Formule
CREATE TABLE formule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  produit_id uuid NOT NULL,
  code varchar(10) NOT NULL,
  libelle varchar(120) NOT NULL,
  version integer NOT NULL,
  composition jsonb NOT NULL,
  accessoires bigint NOT NULL,
  ticket_moderateur numeric(9,6) NOT NULL,
  plafond_annuel_personne bigint NOT NULL,
  plafond_annuel_famille bigint,
  nombre_actes_annuel integer,
  date_effet date NOT NULL,
  CONSTRAINT formule_uk1 UNIQUE (produit_id, code, version)
);
COMMENT ON TABLE formule IS 'Formule. Niveau 2 du catalogue (pack) ; trois au plus par produit. [DD 5.10 ; § 5.5, ARC-RG-020.]';
COMMENT ON COLUMN formule.produit_id IS 'Produit';
COMMENT ON COLUMN formule.code IS 'Code';
COMMENT ON COLUMN formule.libelle IS 'Libellé';
COMMENT ON COLUMN formule.version IS 'Version';
COMMENT ON COLUMN formule.composition IS 'Assuré principal, conjoints, enfants, nombre maximal de personnes';
COMMENT ON COLUMN formule.accessoires IS 'Accessoires (GNF)';
COMMENT ON COLUMN formule.ticket_moderateur IS 'Taux du ticket modérateur';
COMMENT ON COLUMN formule.plafond_annuel_personne IS 'Plafond annuel par personne (GNF)';
COMMENT ON COLUMN formule.plafond_annuel_famille IS 'Plafond annuel par famille (GNF)';
COMMENT ON COLUMN formule.nombre_actes_annuel IS 'Nombre d’actes annuel par personne';
COMMENT ON COLUMN formule.date_effet IS 'Date d’effet – Jamais appliquée aux périodes en cours';
CREATE TRIGGER formule_ins BEFORE INSERT ON formule FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER formule_upd BEFORE UPDATE ON formule FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER formule_del BEFORE DELETE ON formule FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 5.11 garantie – Garantie
CREATE TABLE garantie (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  formule_id uuid NOT NULL,
  code varchar(10) NOT NULL,
  libelle varchar(120) NOT NULL,
  type type_garantie NOT NULL,
  plafond bigint,
  nombre_actes integer,
  taux_prise_en_charge numeric(9,6) NOT NULL,
  carence_jours integer NOT NULL,
  accord_prealable boolean NOT NULL,
  seuil_accord_prealable bigint,
  beneficiaires varchar(40) NOT NULL,
  mode_calcul mode_calcul_garantie NOT NULL,
  capital bigint,
  indemnite_journaliere bigint,
  age_min_deces integer,
  CONSTRAINT garantie_uk1 UNIQUE (formule_id, code)
);
COMMENT ON TABLE garantie IS 'Garantie. Niveau 3 du catalogue. [DD 5.11 ; § 5.5, REF-RG-034, 035.]';
COMMENT ON COLUMN garantie.formule_id IS 'Formule';
COMMENT ON COLUMN garantie.code IS 'Code';
COMMENT ON COLUMN garantie.libelle IS 'Libellé';
COMMENT ON COLUMN garantie.type IS 'Type';
COMMENT ON COLUMN garantie.plafond IS 'Plafond (GNF)';
COMMENT ON COLUMN garantie.nombre_actes IS 'Nombre d’actes';
COMMENT ON COLUMN garantie.taux_prise_en_charge IS 'Taux de prise en charge';
COMMENT ON COLUMN garantie.carence_jours IS 'Délai de carence (jours)';
COMMENT ON COLUMN garantie.accord_prealable IS 'Accord préalable requis';
COMMENT ON COLUMN garantie.seuil_accord_prealable IS 'Montant au-delà duquel un accord est requis';
COMMENT ON COLUMN garantie.beneficiaires IS 'VICTIME ou AYANTS_DROIT';
COMMENT ON COLUMN garantie.mode_calcul IS 'Mode de calcul';
COMMENT ON COLUMN garantie.capital IS 'Capital (garantie décès, incapacité)';
COMMENT ON COLUMN garantie.indemnite_journaliere IS 'Indemnité journalière';
COMMENT ON COLUMN garantie.age_min_deces IS 'Âge minimal pour la garantie décès – 12 ans (art. 194), règle verrouillée';
CREATE TRIGGER garantie_ins BEFORE INSERT ON garantie FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER garantie_upd BEFORE UPDATE ON garantie FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER garantie_del BEFORE DELETE ON garantie FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 5.12 tarif – Grille tarifaire
CREATE TABLE tarif (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  formule_id uuid NOT NULL,
  qualite varchar(20) NOT NULL,
  age_min integer NOT NULL,
  age_max integer NOT NULL,
  prime_nette bigint NOT NULL,
  date_effet date NOT NULL
);
COMMENT ON TABLE tarif IS 'Grille tarifaire. Prime nette par tranche d’âge et par composition. [DD 5.12 ; REF-RG-030.]';
COMMENT ON COLUMN tarif.formule_id IS 'Formule';
COMMENT ON COLUMN tarif.qualite IS 'ASSURE_PRINCIPAL, CONJOINT, ENFANT, ADULTE (collectif)';
COMMENT ON COLUMN tarif.age_min IS 'Âge minimal de la tranche';
COMMENT ON COLUMN tarif.age_max IS 'Âge maximal';
COMMENT ON COLUMN tarif.prime_nette IS 'Prime nette annuelle (GNF)';
COMMENT ON COLUMN tarif.date_effet IS 'Date d’effet';
CREATE TRIGGER tarif_ins BEFORE INSERT ON tarif FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER tarif_upd BEFORE UPDATE ON tarif FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER tarif_del BEFORE DELETE ON tarif FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 5.13 exclusion – Exclusion
CREATE TABLE exclusion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  produit_id uuid NOT NULL,
  code varchar(20) NOT NULL,
  libelle varchar(300) NOT NULL,
  automatique boolean NOT NULL,
  actes jsonb
);
COMMENT ON TABLE exclusion IS 'Exclusion. Exclusions paramétrées par produit. [DD 5.13 ; SAN-RG-025.]';
COMMENT ON COLUMN exclusion.produit_id IS 'Produit';
COMMENT ON COLUMN exclusion.code IS 'Code';
COMMENT ON COLUMN exclusion.libelle IS 'Libellé affiché';
COMMENT ON COLUMN exclusion.automatique IS 'Contrôlée automatiquement à la prise en charge – L’antériorité d’un traitement n’est jamais automatique';
COMMENT ON COLUMN exclusion.actes IS 'Codes d’actes ou de médicaments concernés';
CREATE TRIGGER exclusion_ins BEFORE INSERT ON exclusion FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER exclusion_upd BEFORE UPDATE ON exclusion FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER exclusion_del BEFORE DELETE ON exclusion FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 5.14 nomenclature_acte – Nomenclature des actes
CREATE TABLE nomenclature_acte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  code varchar(20) NOT NULL,
  libelle varchar(300) NOT NULL,
  famille varchar(60) NOT NULL,
  specialite varchar(60),
  garantie_type type_garantie NOT NULL,
  actif boolean NOT NULL,
  CONSTRAINT nomenclature_acte_uk1 UNIQUE (code)
);
COMMENT ON TABLE nomenclature_acte IS 'Nomenclature des actes. Actes médicaux codifiés. [DD 5.14 ; § 5.6.]';
COMMENT ON COLUMN nomenclature_acte.code IS 'Code de l’acte';
COMMENT ON COLUMN nomenclature_acte.libelle IS 'Libellé';
COMMENT ON COLUMN nomenclature_acte.famille IS 'Consultation, analyse, imagerie, hospitalisation…';
COMMENT ON COLUMN nomenclature_acte.specialite IS 'Spécialité';
COMMENT ON COLUMN nomenclature_acte.garantie_type IS 'Type de garantie concerné';
COMMENT ON COLUMN nomenclature_acte.actif IS 'Actif';
CREATE TRIGGER nomenclature_acte_ins BEFORE INSERT ON nomenclature_acte FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER nomenclature_acte_upd BEFORE UPDATE ON nomenclature_acte FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER nomenclature_acte_del BEFORE DELETE ON nomenclature_acte FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 5.15 medicament – Médicament
CREATE TABLE medicament (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  code varchar(20) NOT NULL,
  denomination varchar(200) NOT NULL,
  dci varchar(200) NOT NULL,
  generique boolean NOT NULL,
  couvert boolean NOT NULL,
  quantite_max_ordonnance integer,
  CONSTRAINT medicament_uk1 UNIQUE (code)
);
COMMENT ON TABLE medicament IS 'Médicament. Liste des médicaments couverts. [DD 5.15 ; § 5.6, tableau 9.6.]';
COMMENT ON COLUMN medicament.code IS 'Code';
COMMENT ON COLUMN medicament.denomination IS 'Dénomination';
COMMENT ON COLUMN medicament.dci IS 'Dénomination commune';
COMMENT ON COLUMN medicament.generique IS 'Générique';
COMMENT ON COLUMN medicament.couvert IS 'Couvert';
COMMENT ON COLUMN medicament.quantite_max_ordonnance IS 'Quantité maximale par ordonnance';
CREATE TRIGGER medicament_ins BEFORE INSERT ON medicament FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER medicament_upd BEFORE UPDATE ON medicament FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER medicament_del BEFORE DELETE ON medicament FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 5.16 diagnostic – Diagnostic (CIM-10)
CREATE TABLE diagnostic (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  code varchar(10) NOT NULL,
  libelle varchar(300) NOT NULL,
  categorie_sensible boolean NOT NULL,
  CONSTRAINT diagnostic_uk1 UNIQUE (code)
);
COMMENT ON TABLE diagnostic IS 'Diagnostic (CIM-10). Codification des diagnostics. [DD 5.16 ; § 5.6.]';
COMMENT ON COLUMN diagnostic.code IS 'Code CIM-10';
COMMENT ON COLUMN diagnostic.libelle IS 'Libellé';
COMMENT ON COLUMN diagnostic.categorie_sensible IS 'Catégorie sensible masquable – SAN-RG-056';
CREATE TRIGGER diagnostic_ins BEFORE INSERT ON diagnostic FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER diagnostic_upd BEFORE UPDATE ON diagnostic FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER diagnostic_del BEFORE DELETE ON diagnostic FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 5.17 jour_ferie – Jour férié
CREATE TABLE jour_ferie (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  date date NOT NULL,
  libelle varchar(120) NOT NULL,
  CONSTRAINT jour_ferie_uk1 UNIQUE (date)
);
COMMENT ON TABLE jour_ferie IS 'Jour férié. Calendrier des jours fériés (calcul des délais). [DD 5.17 ; PROD-RG-028.]';
COMMENT ON COLUMN jour_ferie.date IS 'Date';
COMMENT ON COLUMN jour_ferie.libelle IS 'Libellé';
CREATE TRIGGER jour_ferie_ins BEFORE INSERT ON jour_ferie FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER jour_ferie_upd BEFORE UPDATE ON jour_ferie FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER jour_ferie_del BEFORE DELETE ON jour_ferie FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 6.1 intervenant – Intervenant commercial
CREATE TABLE intervenant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  tiers_id uuid NOT NULL,
  role role_intervenant NOT NULL,
  rattachement_id uuid,
  statut statut_intervenant NOT NULL,
  agrement_accorde_le date,
  visa_conformite_id uuid,
  traite_ou_contrat_document_id uuid,
  numero_inscription varchar(60),
  controles_conformite_le date,
  emission_activee boolean NOT NULL,
  date_entree date NOT NULL,
  date_sortie date,
  motif_sortie varchar(200)
);
COMMENT ON TABLE intervenant IS 'Intervenant commercial. Agent général, collaborateur, junior, prescripteur ou cellule Canal digital. [DD 6.1 ; COM-RG-060 à 066, REF-RG-014.]';
COMMENT ON COLUMN intervenant.tiers_id IS 'Fiche tiers – Junior et prescripteur : personne physique';
COMMENT ON COLUMN intervenant.role IS 'Rôle';
COMMENT ON COLUMN intervenant.rattachement_id IS 'Agent général de rattachement (collaborateur, junior)';
COMMENT ON COLUMN intervenant.statut IS 'Statut';
COMMENT ON COLUMN intervenant.agrement_accorde_le IS 'Date d’agrément par la Compagnie';
COMMENT ON COLUMN intervenant.visa_conformite_id IS 'Visa de la Conformité';
COMMENT ON COLUMN intervenant.traite_ou_contrat_document_id IS 'Traité de nomination ou contrat écrit';
COMMENT ON COLUMN intervenant.numero_inscription IS 'Numéro d’inscription éventuel';
COMMENT ON COLUMN intervenant.controles_conformite_le IS 'Date de validation des contrôles (junior) – Accès aux pièces clients seulement après';
COMMENT ON COLUMN intervenant.emission_activee IS 'Émission activée (agent général) – COM-RG-002';
COMMENT ON COLUMN intervenant.date_entree IS 'Entrée';
COMMENT ON COLUMN intervenant.date_sortie IS 'Sortie';
COMMENT ON COLUMN intervenant.motif_sortie IS 'Motif de sortie';
CREATE TRIGGER intervenant_ins BEFORE INSERT ON intervenant FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER intervenant_upd BEFORE UPDATE ON intervenant FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER intervenant_del BEFORE DELETE ON intervenant FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 6.2 prospect – Prospect (existant)
CREATE TABLE prospect (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  tiers_id uuid NOT NULL,
  intervenant_id uuid NOT NULL,
  exclusivite_jusqu_au date NOT NULL,
  statut statut_prospect NOT NULL,
  code_prescripteur_id uuid,
  converti_le timestamptz
);
COMMENT ON TABLE prospect IS 'Prospect (existant). Fiche de prospection existante de Prospect Pro, enrichie. [DD 6.2 ; REF-RG-003, COM-RG-071, annexe 1 de la Requête.]';
COMMENT ON COLUMN prospect.tiers_id IS 'Fiche tiers (même fiche à la conversion)';
COMMENT ON COLUMN prospect.intervenant_id IS 'Intervenant qui l’a enregistré (apporteur)';
COMMENT ON COLUMN prospect.exclusivite_jusqu_au IS 'Fin d’exclusivité – 90 jours par défaut';
COMMENT ON COLUMN prospect.statut IS 'Statut';
COMMENT ON COLUMN prospect.code_prescripteur_id IS 'Code saisi';
COMMENT ON COLUMN prospect.converti_le IS 'Conversion en client';
CREATE TRIGGER prospect_ins BEFORE INSERT ON prospect FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER prospect_upd BEFORE UPDATE ON prospect FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER prospect_del BEFORE DELETE ON prospect FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 6.3 compte_production_agent – Compte de production d’un bureau
CREATE TABLE compte_production_agent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  bureau_id uuid NOT NULL,
  intervenant_id uuid NOT NULL,
  compte_auxiliaire_id uuid NOT NULL,
  montant_minimum bigint NOT NULL,
  statut statut_compte_production NOT NULL,
  motif_gel motif_gel,
  solde bigint NOT NULL,
  seuil_alerte bigint,
  CONSTRAINT compte_production_agent_uk1 UNIQUE (bureau_id)
);
COMMENT ON TABLE compte_production_agent IS 'Compte de production d’un bureau. Compte de garantie : dette de la Compagnie envers l’agent, non rémunérée, affectée au paiement des primes émises ; un par bureau. [DD 6.3 ; COM-RG-003, 011, 020 à 025, 050 à 056, CONF-RG-009.]';
COMMENT ON COLUMN compte_production_agent.bureau_id IS 'Bureau – Un seul compte de production par bureau';
COMMENT ON COLUMN compte_production_agent.intervenant_id IS 'Agent général titulaire';
COMMENT ON COLUMN compte_production_agent.compte_auxiliaire_id IS 'Compte auxiliaire sous le collectif « Comptes de production des agents »';
COMMENT ON COLUMN compte_production_agent.montant_minimum IS 'Montant minimum d’approvisionnement applicable – Copie du paramètre à l’ouverture (exemple : 10 000 000 GNF)';
COMMENT ON COLUMN compte_production_agent.statut IS 'Statut';
COMMENT ON COLUMN compte_production_agent.motif_gel IS 'Motif du gel';
COMMENT ON COLUMN compte_production_agent.solde IS 'Solde (GNF) – ≥ 0 (contrainte en base) ; égal à la somme des mouvements';
COMMENT ON COLUMN compte_production_agent.seuil_alerte IS 'Seuil d’alerte choisi par l’agent';
CREATE TRIGGER compte_production_agent_ins BEFORE INSERT ON compte_production_agent FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER compte_production_agent_upd BEFORE UPDATE ON compte_production_agent FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER compte_production_agent_del BEFORE DELETE ON compte_production_agent FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 6.4 mouvement_compte_production – Mouvement du compte de production (journal : ajout seul)
CREATE TABLE mouvement_compte_production (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  compte_production_id uuid NOT NULL,
  date_heure timestamptz NOT NULL,
  nature nature_mouvement_compte_production NOT NULL,
  sens varchar(1) NOT NULL,
  montant bigint NOT NULL,
  solde_apres bigint NOT NULL,
  reference varchar(40) NOT NULL,
  ecriture_id uuid NOT NULL,
  utilisateur_id uuid NOT NULL
);
COMMENT ON TABLE mouvement_compte_production IS 'Mouvement du compte de production. Journal non modifiable des mouvements. [DD 6.4 ; COM-RG-020, 120.]';
COMMENT ON COLUMN mouvement_compte_production.compte_production_id IS 'Compte de production';
COMMENT ON COLUMN mouvement_compte_production.date_heure IS 'Date et heure';
COMMENT ON COLUMN mouvement_compte_production.nature IS 'Nature';
COMMENT ON COLUMN mouvement_compte_production.sens IS 'D (débit) ou C (crédit)';
COMMENT ON COLUMN mouvement_compte_production.montant IS 'Montant (GNF)';
COMMENT ON COLUMN mouvement_compte_production.solde_apres IS 'Solde après mouvement';
COMMENT ON COLUMN mouvement_compte_production.reference IS 'Police, reçu, facture de commissions, restitution…';
COMMENT ON COLUMN mouvement_compte_production.ecriture_id IS 'Écriture comptable générée';
COMMENT ON COLUMN mouvement_compte_production.utilisateur_id IS 'Auteur';
CREATE TRIGGER mouvement_compte_production_ins BEFORE INSERT ON mouvement_compte_production FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER mouvement_compte_production_journal BEFORE UPDATE OR DELETE ON mouvement_compte_production FOR EACH ROW EXECUTE FUNCTION interdire_modification_journal();

-- 6.5 approvisionnement_compte – Approvisionnement du compte de production
CREATE TABLE approvisionnement_compte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  numero_recu varchar(16) NOT NULL,
  compte_production_id uuid NOT NULL,
  moyen moyen_approvisionnement NOT NULL,
  montant bigint NOT NULL,
  reference_externe varchar(80),
  statut statut_approvisionnement NOT NULL,
  confirme_par uuid,
  confirme_le timestamptz,
  motif_rejet varchar(200),
  CONSTRAINT approvisionnement_compte_uk1 UNIQUE (numero_recu),
  CONSTRAINT approvisionnement_compte_uk2 UNIQUE (moyen, reference_externe)
);
COMMENT ON TABLE approvisionnement_compte IS 'Approvisionnement du compte de production. Versement de l’agent sur son compte de production. [DD 6.5 ; COM-RG-010 à 014.]';
COMMENT ON COLUMN approvisionnement_compte.numero_recu IS 'Reçu DEP + AAAA + 8 chiffres';
COMMENT ON COLUMN approvisionnement_compte.compte_production_id IS 'Compte de production';
COMMENT ON COLUMN approvisionnement_compte.moyen IS 'Moyen';
COMMENT ON COLUMN approvisionnement_compte.montant IS 'Montant (GNF) – ≥ montant minimum au premier versement, sans plafond de dépassement ; plafonds espèces';
COMMENT ON COLUMN approvisionnement_compte.reference_externe IS 'Référence banque ou opérateur – Idempotence des confirmations';
COMMENT ON COLUMN approvisionnement_compte.statut IS 'Statut';
COMMENT ON COLUMN approvisionnement_compte.confirme_par IS 'Caissier ou trésorier';
COMMENT ON COLUMN approvisionnement_compte.confirme_le IS 'Confirmation';
COMMENT ON COLUMN approvisionnement_compte.motif_rejet IS 'Motif de rejet';
CREATE TRIGGER approvisionnement_compte_ins BEFORE INSERT ON approvisionnement_compte FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER approvisionnement_compte_upd BEFORE UPDATE ON approvisionnement_compte FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER approvisionnement_compte_del BEFORE DELETE ON approvisionnement_compte FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 6.6 demande_restitution – Demande de restitution du compte de production
CREATE TABLE demande_restitution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  compte_production_id uuid NOT NULL,
  date_heure_demande timestamptz NOT NULL,
  motif motif_restitution NOT NULL,
  justification text,
  justificatif_document_id uuid,
  solde_fige bigint NOT NULL,
  sommes_dues bigint NOT NULL,
  montant_restitue bigint NOT NULL,
  etat_detaille_document_id uuid,
  coordonnee_paiement_id uuid NOT NULL,
  demande_validation_id uuid NOT NULL,
  ordre_paiement_id uuid,
  statut statut_validation NOT NULL,
  suite varchar(20)
);
COMMENT ON TABLE demande_restitution IS 'Demande de restitution du compte de production. Restitution du solde en fin d’activité ou sur demande motivée. [DD 6.6 ; COM-RG-050 à 053.]';
COMMENT ON COLUMN demande_restitution.compte_production_id IS 'Compte de production';
COMMENT ON COLUMN demande_restitution.date_heure_demande IS 'Date et heure de la demande';
COMMENT ON COLUMN demande_restitution.motif IS 'Motif';
COMMENT ON COLUMN demande_restitution.justification IS 'Exposé des motifs – Obligatoire si DEMANDE_MOTIVEE';
COMMENT ON COLUMN demande_restitution.justificatif_document_id IS 'Pièce justificative';
COMMENT ON COLUMN demande_restitution.solde_fige IS 'Solde figé (GNF) – Recevable seulement hors délai d’annulation';
COMMENT ON COLUMN demande_restitution.sommes_dues IS 'Sommes dues à la Compagnie à la date de la demande';
COMMENT ON COLUMN demande_restitution.montant_restitue IS 'Montant restitué – solde_fige − sommes_dues';
COMMENT ON COLUMN demande_restitution.etat_detaille_document_id IS 'État détaillé remis à l’agent';
COMMENT ON COLUMN demande_restitution.coordonnee_paiement_id IS 'Compte vérifié au nom de l’agent';
COMMENT ON COLUMN demande_restitution.demande_validation_id IS 'Circuit Direction commerciale puis DAF';
COMMENT ON COLUMN demande_restitution.ordre_paiement_id IS 'Ordre de paiement';
COMMENT ON COLUMN demande_restitution.statut IS 'Statut';
COMMENT ON COLUMN demande_restitution.suite IS 'REPRISE_ACTIVITE ou CLOTURE';
CREATE TRIGGER demande_restitution_ins BEFORE INSERT ON demande_restitution FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER demande_restitution_upd BEFORE UPDATE ON demande_restitution FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER demande_restitution_del BEFORE DELETE ON demande_restitution FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 6.7 police_intervenant – Intervenants d’une police
CREATE TABLE police_intervenant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  police_id uuid NOT NULL,
  intervenant_id uuid NOT NULL,
  qualite qualite_intervenant NOT NULL,
  cle_repartition numeric(9,6) NOT NULL,
  date_debut date NOT NULL,
  date_fin date
);
COMMENT ON TABLE police_intervenant IS 'Intervenants d’une police. Titulaire, apporteur, prescripteur et leur clé. [DD 6.7 ; COM-RG-040, 070.]';
COMMENT ON COLUMN police_intervenant.police_id IS 'Police';
COMMENT ON COLUMN police_intervenant.intervenant_id IS 'Intervenant';
COMMENT ON COLUMN police_intervenant.qualite IS 'Qualité';
COMMENT ON COLUMN police_intervenant.cle_repartition IS 'Part de la commission – Somme des clés d’une police = 100 %';
COMMENT ON COLUMN police_intervenant.date_debut IS 'Début';
COMMENT ON COLUMN police_intervenant.date_fin IS 'Fin (mouvement de portefeuille)';
CREATE TRIGGER police_intervenant_ins BEFORE INSERT ON police_intervenant FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER police_intervenant_upd BEFORE UPDATE ON police_intervenant FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER police_intervenant_del BEFORE DELETE ON police_intervenant FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 6.8 bareme_commission – Barème de commissions
CREATE TABLE bareme_commission (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  produit_id uuid NOT NULL,
  role role_intervenant NOT NULL,
  taux numeric(9,6) NOT NULL,
  assiette varchar(40) NOT NULL,
  prime_anticipation_type varchar(20),
  prime_anticipation_valeur numeric(15,4),
  date_effet date NOT NULL
);
COMMENT ON TABLE bareme_commission IS 'Barème de commissions. Taux par produit et par rôle (module existant enrichi). [DD 6.8 ; COM-RG-040, 046, 047.]';
COMMENT ON COLUMN bareme_commission.produit_id IS 'Produit';
COMMENT ON COLUMN bareme_commission.role IS 'Rôle';
COMMENT ON COLUMN bareme_commission.taux IS 'Taux sur la prime nette';
COMMENT ON COLUMN bareme_commission.assiette IS 'PRIME_NETTE par défaut';
COMMENT ON COLUMN bareme_commission.prime_anticipation_type IS 'POURCENTAGE ou FORFAIT';
COMMENT ON COLUMN bareme_commission.prime_anticipation_valeur IS 'Valeur';
COMMENT ON COLUMN bareme_commission.date_effet IS 'Date d’effet';
CREATE TRIGGER bareme_commission_ins BEFORE INSERT ON bareme_commission FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER bareme_commission_upd BEFORE UPDATE ON bareme_commission FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER bareme_commission_del BEFORE DELETE ON bareme_commission FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 6.9 commission – Commission
CREATE TABLE commission (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  police_id uuid NOT NULL,
  quittance_id uuid NOT NULL,
  intervenant_id uuid NOT NULL,
  type varchar(20) NOT NULL,
  assiette bigint NOT NULL,
  taux numeric(9,6),
  montant bigint NOT NULL,
  statut statut_commission NOT NULL,
  facture_commission_id uuid,
  ecriture_id uuid NOT NULL,
  echeance_legale date
);
COMMENT ON TABLE commission IS 'Commission. Commission ou prime de renouvellement anticipé acquise sur un encaissement. [DD 6.9 ; COM-RG-041 à 049.]';
COMMENT ON COLUMN commission.police_id IS 'Police';
COMMENT ON COLUMN commission.quittance_id IS 'Quittance encaissée';
COMMENT ON COLUMN commission.intervenant_id IS 'Bénéficiaire';
COMMENT ON COLUMN commission.type IS 'COMMISSION ou PRIME_ANTICIPATION';
COMMENT ON COLUMN commission.assiette IS 'Assiette (GNF)';
COMMENT ON COLUMN commission.taux IS 'Taux appliqué';
COMMENT ON COLUMN commission.montant IS 'Montant (GNF) – Arrondi FIN-RG-077';
COMMENT ON COLUMN commission.statut IS 'Statut';
COMMENT ON COLUMN commission.facture_commission_id IS 'Facture mensuelle – Base : montant effectivement encaissé ; versements programmés : au renouvellement';
COMMENT ON COLUMN commission.ecriture_id IS 'Écriture EVT-02, 03, 07, 19';
COMMENT ON COLUMN commission.echeance_legale IS 'Échéance du délai légal (art. 368) – Point de départ fixé par le juriste ; alerte COM-RG-044';
CREATE TRIGGER commission_ins BEFORE INSERT ON commission FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER commission_upd BEFORE UPDATE ON commission FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER commission_del BEFORE DELETE ON commission FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 6.10 facture_commission – Facture mensuelle de commissions
CREATE TABLE facture_commission (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  numero varchar(16) NOT NULL,
  intervenant_id uuid NOT NULL,
  mois varchar(7) NOT NULL,
  mode mode_facture_commission NOT NULL,
  document_id uuid,
  emise_par_otp_le timestamptz,
  montant_brut bigint NOT NULL,
  avoir bigint NOT NULL,
  retenue bigint NOT NULL,
  net bigint NOT NULL,
  recue_le timestamptz,
  date_limite_paiement date,
  montant_paye bigint NOT NULL,
  statut statut_facture_commission NOT NULL,
  valide_d_office boolean NOT NULL,
  demande_validation_id uuid,
  CONSTRAINT facture_commission_uk1 UNIQUE (numero),
  CONSTRAINT facture_commission_uk2 UNIQUE (intervenant_id, mois)
);
COMMENT ON TABLE facture_commission IS 'Facture mensuelle de commissions. Facture d’un commercial pour le mois, comme dans Prospect Pro. [DD 6.10 ; COM-RG-042 à 045, 121.]';
COMMENT ON COLUMN facture_commission.numero IS 'FC + AAAA + MM + 6 chiffres';
COMMENT ON COLUMN facture_commission.intervenant_id IS 'Bénéficiaire (agent général, junior, prescripteur)';
COMMENT ON COLUMN facture_commission.mois IS 'Mois facturé (AAAA-MM)';
COMMENT ON COLUMN facture_commission.mode IS 'Mode – Autofacturation : mandat prévu au contrat';
COMMENT ON COLUMN facture_commission.document_id IS 'Facture déposée ou générée';
COMMENT ON COLUMN facture_commission.emise_par_otp_le IS 'Émission par code à usage unique';
COMMENT ON COLUMN facture_commission.montant_brut IS 'Brut (GNF)';
COMMENT ON COLUMN facture_commission.avoir IS 'Avoir sur reprises du mois précédent – COM-RG-121';
COMMENT ON COLUMN facture_commission.retenue IS 'Retenue à la source';
COMMENT ON COLUMN facture_commission.net IS 'Net à payer';
COMMENT ON COLUMN facture_commission.recue_le IS 'Réception d’une facture conforme – Point de départ du délai de 30 jours';
COMMENT ON COLUMN facture_commission.date_limite_paiement IS 'Date limite de paiement – recue_le + délai paramétré';
COMMENT ON COLUMN facture_commission.montant_paye IS 'Cumul payé ou affecté – ≤ net';
COMMENT ON COLUMN facture_commission.statut IS 'Statut';
COMMENT ON COLUMN facture_commission.valide_d_office IS 'Validée par exception (COM-RG-045)';
COMMENT ON COLUMN facture_commission.demande_validation_id IS 'Validation Direction commerciale';
CREATE TRIGGER facture_commission_ins BEFORE INSERT ON facture_commission FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER facture_commission_upd BEFORE UPDATE ON facture_commission FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER facture_commission_del BEFORE DELETE ON facture_commission FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 6.11 paiement_facture_commission – Paiement d’une facture de commissions
CREATE TABLE paiement_facture_commission (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  facture_id uuid NOT NULL,
  rang integer NOT NULL,
  montant bigint NOT NULL,
  retenue bigint NOT NULL,
  net bigint NOT NULL,
  destination destination_paiement_commission NOT NULL,
  motif_fraction varchar(200),
  mandat_id uuid,
  ordre_paiement_id uuid,
  ecriture_id uuid NOT NULL,
  demande_validation_id uuid NOT NULL,
  paye_le timestamptz,
  CONSTRAINT paiement_facture_commission_uk1 UNIQUE (facture_id, rang)
);
COMMENT ON TABLE paiement_facture_commission IS 'Paiement d’une facture de commissions. Paiement total ou fraction ; une ligne par fraction. [DD 6.11 ; COM-RG-043, 044, 120.]';
COMMENT ON COLUMN paiement_facture_commission.facture_id IS 'Facture';
COMMENT ON COLUMN paiement_facture_commission.rang IS 'Rang de la fraction';
COMMENT ON COLUMN paiement_facture_commission.montant IS 'Brut payé';
COMMENT ON COLUMN paiement_facture_commission.retenue IS 'Retenue au prorata';
COMMENT ON COLUMN paiement_facture_commission.net IS 'Net versé ou affecté';
COMMENT ON COLUMN paiement_facture_commission.destination IS 'Destination – COMPTE_PRODUCTION : agent général seulement';
COMMENT ON COLUMN paiement_facture_commission.motif_fraction IS 'Motif du fractionnement – Obligatoire si la fraction ne solde pas la facture';
COMMENT ON COLUMN paiement_facture_commission.mandat_id IS 'Mandat d’affectation';
COMMENT ON COLUMN paiement_facture_commission.ordre_paiement_id IS 'Ordre de paiement';
COMMENT ON COLUMN paiement_facture_commission.ecriture_id IS 'Écriture EVT-05 ou EVT-27';
COMMENT ON COLUMN paiement_facture_commission.demande_validation_id IS 'Validation';
COMMENT ON COLUMN paiement_facture_commission.paye_le IS 'Date d’exécution';
CREATE TRIGGER paiement_facture_commission_ins BEFORE INSERT ON paiement_facture_commission FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER paiement_facture_commission_upd BEFORE UPDATE ON paiement_facture_commission FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER paiement_facture_commission_del BEFORE DELETE ON paiement_facture_commission FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 6.12 mandat_affectation_commission – Mandat d’affectation des commissions
CREATE TABLE mandat_affectation_commission (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  intervenant_id uuid NOT NULL,
  compte_production_id uuid NOT NULL,
  type varchar(20) NOT NULL,
  facture_id uuid,
  document_id uuid NOT NULL,
  date_debut date NOT NULL,
  revoque_le timestamptz,
  statut varchar(20) NOT NULL
);
COMMENT ON TABLE mandat_affectation_commission IS 'Mandat d’affectation des commissions. Demande écrite de l’agent général d’affecter le net de ses factures à son compte de production. [DD 6.12 ; COM-RG-120.]';
COMMENT ON COLUMN mandat_affectation_commission.intervenant_id IS 'Agent général';
COMMENT ON COLUMN mandat_affectation_commission.compte_production_id IS 'Compte de production crédité';
COMMENT ON COLUMN mandat_affectation_commission.type IS 'PONCTUEL ou PERMANENT';
COMMENT ON COLUMN mandat_affectation_commission.facture_id IS 'Facture visée (ponctuel)';
COMMENT ON COLUMN mandat_affectation_commission.document_id IS 'Demande signée';
COMMENT ON COLUMN mandat_affectation_commission.date_debut IS 'Début';
COMMENT ON COLUMN mandat_affectation_commission.revoque_le IS 'Révocation';
COMMENT ON COLUMN mandat_affectation_commission.statut IS 'ACTIF, REVOQUE, EPUISE';
CREATE TRIGGER mandat_affectation_commission_ins BEFORE INSERT ON mandat_affectation_commission FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER mandat_affectation_commission_upd BEFORE UPDATE ON mandat_affectation_commission FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER mandat_affectation_commission_del BEFORE DELETE ON mandat_affectation_commission FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 6.13 mouvement_portefeuille – Mouvement de portefeuille
CREATE TABLE mouvement_portefeuille (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  numero varchar(14) NOT NULL,
  type type_mouvement_portefeuille NOT NULL,
  cedant_id uuid NOT NULL,
  cessionnaire_id uuid NOT NULL,
  perimetre jsonb NOT NULL,
  date_effet date NOT NULL,
  motif varchar(300) NOT NULL,
  prix bigint,
  demande_validation_id uuid NOT NULL,
  statut statut_validation NOT NULL,
  CONSTRAINT mouvement_portefeuille_uk1 UNIQUE (numero)
);
COMMENT ON TABLE mouvement_portefeuille IS 'Mouvement de portefeuille. Cession, transfert ou réaffectation. [DD 6.13 ; COM-RG-072 à 076.]';
COMMENT ON COLUMN mouvement_portefeuille.numero IS 'MP + AAAA + 6 chiffres';
COMMENT ON COLUMN mouvement_portefeuille.type IS 'Type';
COMMENT ON COLUMN mouvement_portefeuille.cedant_id IS 'Cédant';
COMMENT ON COLUMN mouvement_portefeuille.cessionnaire_id IS 'Cessionnaire';
COMMENT ON COLUMN mouvement_portefeuille.perimetre IS 'Tout, partie ou profil de clients';
COMMENT ON COLUMN mouvement_portefeuille.date_effet IS 'Date d’effet';
COMMENT ON COLUMN mouvement_portefeuille.motif IS 'Motif';
COMMENT ON COLUMN mouvement_portefeuille.prix IS 'Prix convenu entre les parties (simplement enregistré)';
COMMENT ON COLUMN mouvement_portefeuille.demande_validation_id IS 'Validation Direction commerciale';
COMMENT ON COLUMN mouvement_portefeuille.statut IS 'Statut';
CREATE TRIGGER mouvement_portefeuille_ins BEFORE INSERT ON mouvement_portefeuille FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER mouvement_portefeuille_upd BEFORE UPDATE ON mouvement_portefeuille FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER mouvement_portefeuille_del BEFORE DELETE ON mouvement_portefeuille FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 6.14 code_prescripteur – Code prescripteur
CREATE TABLE code_prescripteur (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  intervenant_id uuid NOT NULL,
  code varchar(20) NOT NULL,
  code_normalise varchar(20) NOT NULL,
  statut varchar(20) NOT NULL,
  valide_le date,
  CONSTRAINT code_prescripteur_uk1 UNIQUE (code_normalise)
);
COMMENT ON TABLE code_prescripteur IS 'Code prescripteur. Code choisi avec le prescripteur. [DD 6.14 ; COM-RG-080 à 084.]';
COMMENT ON COLUMN code_prescripteur.intervenant_id IS 'Prescripteur';
COMMENT ON COLUMN code_prescripteur.code IS 'Code saisi (4 à 20 caractères)';
COMMENT ON COLUMN code_prescripteur.code_normalise IS 'Code normalisé (majuscules, sans accents, homoglyphes ramenés) – Unique ; contrôles de ressemblance';
COMMENT ON COLUMN code_prescripteur.statut IS 'ACTIF, SUSPENDU, RETIRE';
COMMENT ON COLUMN code_prescripteur.valide_le IS 'Validation';
CREATE TRIGGER code_prescripteur_ins BEFORE INSERT ON code_prescripteur FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER code_prescripteur_upd BEFORE UPDATE ON code_prescripteur FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER code_prescripteur_del BEFORE DELETE ON code_prescripteur FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 6.15 carte_professionnelle – Carte professionnelle
CREATE TABLE carte_professionnelle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  numero_serie varchar(12) NOT NULL,
  intervenant_id uuid NOT NULL,
  modele varchar(20) NOT NULL,
  jeton_qr varchar(200) NOT NULL,
  statut statut_carte_pro NOT NULL,
  remise_preuve_id uuid,
  remise_le timestamptz,
  CONSTRAINT carte_professionnelle_uk1 UNIQUE (numero_serie)
);
COMMENT ON TABLE carte_professionnelle IS 'Carte professionnelle. Carte numérique et physique d’un intervenant. [DD 6.15 ; COM-RG-100 à 104.]';
COMMENT ON COLUMN carte_professionnelle.numero_serie IS 'CP + AAAA + 6 chiffres';
COMMENT ON COLUMN carte_professionnelle.intervenant_id IS 'Porteur';
COMMENT ON COLUMN carte_professionnelle.modele IS 'AGENT_GENERAL ou APPORTEUR';
COMMENT ON COLUMN carte_professionnelle.jeton_qr IS 'Jeton signé révocable';
COMMENT ON COLUMN carte_professionnelle.statut IS 'Statut';
COMMENT ON COLUMN carte_professionnelle.remise_preuve_id IS 'Remise confirmée par code';
COMMENT ON COLUMN carte_professionnelle.remise_le IS 'Remise';
CREATE TRIGGER carte_professionnelle_ins BEFORE INSERT ON carte_professionnelle FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER carte_professionnelle_upd BEFORE UPDATE ON carte_professionnelle FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER carte_professionnelle_del BEFORE DELETE ON carte_professionnelle FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 7.1 dossier_souscription – Dossier de souscription (proposition)
CREATE TABLE dossier_souscription (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  numero_dossier varchar(16) NOT NULL,
  canal canal_souscription NOT NULL,
  souscripteur_id uuid NOT NULL,
  produit_id uuid NOT NULL,
  formule_id uuid NOT NULL,
  bureau_id uuid NOT NULL,
  prepare_par_id uuid NOT NULL,
  code_prescripteur_id uuid,
  etape_courante integer NOT NULL,
  donnees jsonb NOT NULL,
  prime_nette bigint,
  accessoires bigint,
  taxes bigint,
  prime_totale bigint,
  acceptation_preuve_id uuid,
  encaissement_attente_id uuid,
  statut statut_dossier NOT NULL,
  expire_le date NOT NULL,
  motif_rejet varchar(300),
  police_id uuid,
  CONSTRAINT dossier_souscription_uk1 UNIQUE (numero_dossier)
);
COMMENT ON TABLE dossier_souscription IS 'Dossier de souscription (proposition). Souscription en cours de préparation ; ni numéro ni écriture. [DD 7.1 ; PROD-RG-001, 009, COM-RG-063, PROD-RG-070 à 074.]';
COMMENT ON COLUMN dossier_souscription.numero_dossier IS 'Numéro provisoire';
COMMENT ON COLUMN dossier_souscription.canal IS 'Canal';
COMMENT ON COLUMN dossier_souscription.souscripteur_id IS 'Souscripteur';
COMMENT ON COLUMN dossier_souscription.produit_id IS 'Produit';
COMMENT ON COLUMN dossier_souscription.formule_id IS 'Formule';
COMMENT ON COLUMN dossier_souscription.bureau_id IS 'Bureau émetteur prévu';
COMMENT ON COLUMN dossier_souscription.prepare_par_id IS 'Agent, junior ou client en ligne';
COMMENT ON COLUMN dossier_souscription.code_prescripteur_id IS 'Code prescripteur saisi';
COMMENT ON COLUMN dossier_souscription.etape_courante IS 'Étape du parcours (1 à 8)';
COMMENT ON COLUMN dossier_souscription.donnees IS 'Données saisies (reprise possible, hors ligne)';
COMMENT ON COLUMN dossier_souscription.prime_nette IS 'Prime nette calculée';
COMMENT ON COLUMN dossier_souscription.accessoires IS 'Accessoires';
COMMENT ON COLUMN dossier_souscription.taxes IS 'Taxes';
COMMENT ON COLUMN dossier_souscription.prime_totale IS 'Prime totale – Calculée, jamais saisie (REF-RG-030)';
COMMENT ON COLUMN dossier_souscription.acceptation_preuve_id IS 'Acceptation du récapitulatif (étape 7)';
COMMENT ON COLUMN dossier_souscription.encaissement_attente_id IS 'Paiement en ligne reçu avant émission';
COMMENT ON COLUMN dossier_souscription.statut IS 'Statut';
COMMENT ON COLUMN dossier_souscription.expire_le IS 'Expiration – 30 jours par défaut';
COMMENT ON COLUMN dossier_souscription.motif_rejet IS 'Motif de rejet (cellule ou agent général)';
COMMENT ON COLUMN dossier_souscription.police_id IS 'Police émise';
CREATE TRIGGER dossier_souscription_ins BEFORE INSERT ON dossier_souscription FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER dossier_souscription_upd BEFORE UPDATE ON dossier_souscription FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER dossier_souscription_del BEFORE DELETE ON dossier_souscription FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 7.2 police – Police
CREATE TABLE police (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  numero varchar(15) NOT NULL,
  type_souscripteur varchar(1) NOT NULL,
  souscripteur_id uuid NOT NULL,
  produit_id uuid NOT NULL,
  formule_id uuid NOT NULL,
  bureau_emetteur_id uuid NOT NULL,
  bureau_gestion_id uuid NOT NULL,
  annee_premiere_emission integer NOT NULL,
  canal canal_souscription NOT NULL,
  date_premiere_effet date NOT NULL,
  statut statut_police NOT NULL,
  ne_pas_renouveler boolean NOT NULL,
  mode_emission varchar(20) NOT NULL,
  contrat_collectif boolean NOT NULL,
  nature_lien_collectif varchar(60),
  adhesion_obligatoire boolean,
  designation_deleguee boolean,
  CONSTRAINT police_uk1 UNIQUE (numero)
);
COMMENT ON TABLE police IS 'Police. Contrat individuel, familial ou collectif. [DD 7.2 ; Chapitre 6, PROD-RG-002 à 008, COM-RG-022.]';
COMMENT ON COLUMN police.numero IS 'Numéro de 15 chiffres (clé MOD 97-10) – Jamais réutilisé ni modifié';
COMMENT ON COLUMN police.type_souscripteur IS '1 = physique, 2 = morale';
COMMENT ON COLUMN police.souscripteur_id IS 'Souscripteur';
COMMENT ON COLUMN police.produit_id IS 'Produit';
COMMENT ON COLUMN police.formule_id IS 'Formule courante';
COMMENT ON COLUMN police.bureau_emetteur_id IS 'Bureau émetteur (fixe)';
COMMENT ON COLUMN police.bureau_gestion_id IS 'Bureau de gestion (modifiable)';
COMMENT ON COLUMN police.annee_premiere_emission IS 'Année sur 4 chiffres – NUM-RG-008';
COMMENT ON COLUMN police.canal IS 'Canal';
COMMENT ON COLUMN police.date_premiere_effet IS 'Date d’effet de la première souscription – Point de départ des carences';
COMMENT ON COLUMN police.statut IS 'Statut';
COMMENT ON COLUMN police.ne_pas_renouveler IS 'Demande de non-renouvellement – PROD-RG-060';
COMMENT ON COLUMN police.mode_emission IS 'DEPOT ou PAIEMENT_DIRECT – COM-RG-027';
COMMENT ON COLUMN police.contrat_collectif IS 'Contrat collectif';
COMMENT ON COLUMN police.nature_lien_collectif IS 'Nature du lien (art. 219)';
COMMENT ON COLUMN police.adhesion_obligatoire IS 'Adhésion obligatoire (collectif)';
COMMENT ON COLUMN police.designation_deleguee IS 'Désignation déléguée à l’adhérent – PROD-RG-037';
CREATE TRIGGER police_ins BEFORE INSERT ON police FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER police_upd BEFORE UPDATE ON police FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER police_del BEFORE DELETE ON police FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 7.3 police_periode – Période de garantie
CREATE TABLE police_periode (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  police_id uuid NOT NULL,
  rang integer NOT NULL,
  date_debut date NOT NULL,
  date_fin date NOT NULL,
  prime_nette bigint NOT NULL,
  prime_totale bigint NOT NULL,
  quittance_id uuid NOT NULL,
  remise_en_vigueur boolean NOT NULL,
  CONSTRAINT police_periode_uk1 UNIQUE (police_id, rang)
);
COMMENT ON TABLE police_periode IS 'Période de garantie. Période annuelle payée d’une police. [DD 7.3 ; PROD-RG-003, 024 à 027.]';
COMMENT ON COLUMN police_periode.police_id IS 'Police';
COMMENT ON COLUMN police_periode.rang IS 'Rang (1 = souscription)';
COMMENT ON COLUMN police_periode.date_debut IS 'Date d’effet';
COMMENT ON COLUMN police_periode.date_fin IS 'Veille de la même date l’année suivante, minuit';
COMMENT ON COLUMN police_periode.prime_nette IS 'Prime nette';
COMMENT ON COLUMN police_periode.prime_totale IS 'Prime totale';
COMMENT ON COLUMN police_periode.quittance_id IS 'Quittance de la période';
COMMENT ON COLUMN police_periode.remise_en_vigueur IS 'Période ouverte après échéance (jamais rétroactive)';
CREATE TRIGGER police_periode_ins BEFORE INSERT ON police_periode FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER police_periode_upd BEFORE UPDATE ON police_periode FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER police_periode_del BEFORE DELETE ON police_periode FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 7.4 police_assure – Personne couverte
CREATE TABLE police_assure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  police_id uuid NOT NULL,
  tiers_id uuid NOT NULL,
  qualite varchar(20) NOT NULL,
  adhesion_id uuid,
  rang_carte varchar(2) NOT NULL,
  date_entree date NOT NULL,
  date_sortie date,
  motif_sortie varchar(60)
);
COMMENT ON TABLE police_assure IS 'Personne couverte. Assuré principal, conjoint, enfant ou adhérent. [DD 7.4 ; REF-RG-007 à 009, PROD-RG-032.]';
COMMENT ON COLUMN police_assure.police_id IS 'Police';
COMMENT ON COLUMN police_assure.tiers_id IS 'Personne';
COMMENT ON COLUMN police_assure.qualite IS 'ASSURE_PRINCIPAL, CONJOINT, ENFANT, ADHERENT, AYANT_DROIT_ADHERENT';
COMMENT ON COLUMN police_assure.adhesion_id IS 'Adhésion (collectif)';
COMMENT ON COLUMN police_assure.rang_carte IS 'Rang sur la carte (00 à 99)';
COMMENT ON COLUMN police_assure.date_entree IS 'Entrée dans la couverture';
COMMENT ON COLUMN police_assure.date_sortie IS 'Sortie';
COMMENT ON COLUMN police_assure.motif_sortie IS 'Âge limite, sortie de l’effectif, décès, retrait';
CREATE TRIGGER police_assure_ins BEFORE INSERT ON police_assure FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER police_assure_upd BEFORE UPDATE ON police_assure FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER police_assure_del BEFORE DELETE ON police_assure FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 7.5 garantie_souscrite – Garantie souscrite
CREATE TABLE garantie_souscrite (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  police_assure_id uuid NOT NULL,
  garantie_id uuid NOT NULL,
  accordee boolean NOT NULL,
  motif_refus varchar(200),
  capital bigint
);
COMMENT ON TABLE garantie_souscrite IS 'Garantie souscrite. Garanties accordées à chaque personne couverte. [DD 7.5 ; REF-RG-034, PROD-RG-011, 035.]';
COMMENT ON COLUMN garantie_souscrite.police_assure_id IS 'Personne couverte';
COMMENT ON COLUMN garantie_souscrite.garantie_id IS 'Garantie';
COMMENT ON COLUMN garantie_souscrite.accordee IS 'Accordée – Garantie décès : âge ≥ 12 ans et consentement';
COMMENT ON COLUMN garantie_souscrite.motif_refus IS 'Motif de non-octroi';
COMMENT ON COLUMN garantie_souscrite.capital IS 'Capital garanti';
CREATE TRIGGER garantie_souscrite_ins BEFORE INSERT ON garantie_souscrite FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER garantie_souscrite_upd BEFORE UPDATE ON garantie_souscrite FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER garantie_souscrite_del BEFORE DELETE ON garantie_souscrite FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 7.6 consentement_assure – Consentement de l’assuré
CREATE TABLE consentement_assure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  police_assure_id uuid NOT NULL,
  type varchar(30) NOT NULL,
  capital_mentionne bigint,
  preuve_id uuid NOT NULL,
  donne_le timestamptz NOT NULL
);
COMMENT ON TABLE consentement_assure IS 'Consentement de l’assuré. Consentement écrit à la garantie décès et accord du représentant légal. [DD 7.6 ; PROD-RG-011, 035, REF-RG-034, art. 193 et 194.]';
COMMENT ON COLUMN consentement_assure.police_assure_id IS 'Assuré concerné';
COMMENT ON COLUMN consentement_assure.type IS 'GARANTIE_DECES, REPRESENTANT_LEGAL, TELECONSULTATION, DONNEES_SANTE';
COMMENT ON COLUMN consentement_assure.capital_mentionne IS 'Capital indiqué dans le consentement';
COMMENT ON COLUMN consentement_assure.preuve_id IS 'Preuve (signature certifiée ANDE pour le décès)';
COMMENT ON COLUMN consentement_assure.donne_le IS 'Date';
CREATE TRIGGER consentement_assure_ins BEFORE INSERT ON consentement_assure FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER consentement_assure_upd BEFORE UPDATE ON consentement_assure FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER consentement_assure_del BEFORE DELETE ON consentement_assure FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 7.7 designation_version – Désignation des bénéficiaires (version)
CREATE TABLE designation_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  police_id uuid NOT NULL,
  police_assure_id uuid,
  version integer NOT NULL,
  mode mode_designation NOT NULL,
  clause_texte text,
  date_effet timestamptz NOT NULL,
  preuve_id uuid NOT NULL,
  CONSTRAINT designation_version_uk1 UNIQUE (police_id, police_assure_id, version)
);
COMMENT ON TABLE designation_version IS 'Désignation des bénéficiaires (version). Version datée de la clause bénéficiaire. [DD 7.7 ; PROD-RG-010 à 015, 036, 037.]';
COMMENT ON COLUMN designation_version.police_id IS 'Police';
COMMENT ON COLUMN designation_version.police_assure_id IS 'Adhérent (désignation déléguée)';
COMMENT ON COLUMN designation_version.version IS 'Version';
COMMENT ON COLUMN designation_version.mode IS 'Mode';
COMMENT ON COLUMN designation_version.clause_texte IS 'Texte de la clause type ou collective';
COMMENT ON COLUMN designation_version.date_effet IS 'Date d’effet – La version en vigueur au décès s’applique';
COMMENT ON COLUMN designation_version.preuve_id IS 'Confirmation par le souscripteur';
CREATE TRIGGER designation_version_ins BEFORE INSERT ON designation_version FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER designation_version_upd BEFORE UPDATE ON designation_version FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER designation_version_del BEFORE DELETE ON designation_version FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 7.8 beneficiaire – Bénéficiaire désigné
CREATE TABLE beneficiaire (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  designation_version_id uuid NOT NULL,
  tiers_id uuid NOT NULL,
  quotite numeric(9,6) NOT NULL,
  rang integer NOT NULL,
  acceptant boolean NOT NULL
);
COMMENT ON TABLE beneficiaire IS 'Bénéficiaire désigné. Bénéficiaire et quotité d’une version de désignation. [DD 7.8 ; REF-RG-031, PROD-RG-013.]';
COMMENT ON COLUMN beneficiaire.designation_version_id IS 'Version';
COMMENT ON COLUMN beneficiaire.tiers_id IS 'Bénéficiaire';
COMMENT ON COLUMN beneficiaire.quotite IS 'Quotité – Somme = 100 % par version';
COMMENT ON COLUMN beneficiaire.rang IS 'Rang (à défaut de…)';
COMMENT ON COLUMN beneficiaire.acceptant IS 'A accepté (désignation irrévocable pour lui)';
CREATE TRIGGER beneficiaire_ins BEFORE INSERT ON beneficiaire FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER beneficiaire_upd BEFORE UPDATE ON beneficiaire FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER beneficiaire_del BEFORE DELETE ON beneficiaire FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 7.9 acceptation_beneficiaire – Acceptation par un bénéficiaire
CREATE TABLE acceptation_beneficiaire (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  beneficiaire_id uuid NOT NULL,
  preuve_beneficiaire_id uuid NOT NULL,
  preuve_souscripteur_id uuid NOT NULL,
  preuve_assure_id uuid,
  acceptee_le timestamptz NOT NULL
);
COMMENT ON TABLE acceptation_beneficiaire IS 'Acceptation par un bénéficiaire. Acceptation de l’art. 201. [DD 7.9 ; PROD-RG-013.]';
COMMENT ON COLUMN acceptation_beneficiaire.beneficiaire_id IS 'Bénéficiaire';
COMMENT ON COLUMN acceptation_beneficiaire.preuve_beneficiaire_id IS 'Accord du bénéficiaire (signature certifiée)';
COMMENT ON COLUMN acceptation_beneficiaire.preuve_souscripteur_id IS 'Accord du souscripteur';
COMMENT ON COLUMN acceptation_beneficiaire.preuve_assure_id IS 'Accord de l’assuré s’il est différent';
COMMENT ON COLUMN acceptation_beneficiaire.acceptee_le IS 'Date';
CREATE TRIGGER acceptation_beneficiaire_ins BEFORE INSERT ON acceptation_beneficiaire FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER acceptation_beneficiaire_upd BEFORE UPDATE ON acceptation_beneficiaire FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER acceptation_beneficiaire_del BEFORE DELETE ON acceptation_beneficiaire FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 7.10 quittance – Quittance
CREATE TABLE quittance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  numero varchar(14) NOT NULL,
  police_id uuid NOT NULL,
  type type_quittance NOT NULL,
  periode_debut date NOT NULL,
  periode_fin date NOT NULL,
  prime_nette bigint NOT NULL,
  accessoires bigint NOT NULL,
  taxes bigint NOT NULL,
  prime_totale bigint NOT NULL,
  mode_paiement varchar(30) NOT NULL,
  statut statut_quittance NOT NULL,
  ecriture_constatation_id uuid NOT NULL,
  ecriture_perception_id uuid,
  CONSTRAINT quittance_uk1 UNIQUE (numero)
);
COMMENT ON TABLE quittance IS 'Quittance. Prime due et son paiement pour une période ou un avenant. [DD 7.10 ; § 6.3, PROD-RG-033, § 11.12.]';
COMMENT ON COLUMN quittance.numero IS 'AAAA + code bureau + 6 chiffres – Continue par bureau et par année, sans trou';
COMMENT ON COLUMN quittance.police_id IS 'Police';
COMMENT ON COLUMN quittance.type IS 'Type';
COMMENT ON COLUMN quittance.periode_debut IS 'Début';
COMMENT ON COLUMN quittance.periode_fin IS 'Fin';
COMMENT ON COLUMN quittance.prime_nette IS 'Prime nette';
COMMENT ON COLUMN quittance.accessoires IS 'Accessoires';
COMMENT ON COLUMN quittance.taxes IS 'Taxes';
COMMENT ON COLUMN quittance.prime_totale IS 'Prime totale';
COMMENT ON COLUMN quittance.mode_paiement IS 'DEPOT, MONNAIE_ELECTRONIQUE, ESPECES_SIEGE, VIREMENT, VERSEMENTS';
COMMENT ON COLUMN quittance.statut IS 'Statut – Une quittance ordinaire est soldée le jour même';
COMMENT ON COLUMN quittance.ecriture_constatation_id IS 'Écriture de constatation';
COMMENT ON COLUMN quittance.ecriture_perception_id IS 'Écriture de perception';
CREATE TRIGGER quittance_ins BEFORE INSERT ON quittance FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER quittance_upd BEFORE UPDATE ON quittance FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER quittance_del BEFORE DELETE ON quittance FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 7.11 avenant – Avenant
CREATE TABLE avenant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  numero varchar(18) NOT NULL,
  police_id uuid NOT NULL,
  type type_avenant NOT NULL,
  date_effet date NOT NULL,
  description text NOT NULL,
  difference_prime bigint NOT NULL,
  quittance_id uuid,
  demande_validation_id uuid,
  preuve_id uuid,
  CONSTRAINT avenant_uk1 UNIQUE (numero)
);
COMMENT ON TABLE avenant IS 'Avenant. Modification en cours de contrat. [DD 7.11 ; PROD-RG-040 à 046.]';
COMMENT ON COLUMN avenant.numero IS 'N° de police + A + 2 chiffres';
COMMENT ON COLUMN avenant.police_id IS 'Police';
COMMENT ON COLUMN avenant.type IS 'Type';
COMMENT ON COLUMN avenant.date_effet IS 'Date d’effet';
COMMENT ON COLUMN avenant.description IS 'Description';
COMMENT ON COLUMN avenant.difference_prime IS 'Différence de prime (+/–)';
COMMENT ON COLUMN avenant.quittance_id IS 'Quittance (prime supplémentaire)';
COMMENT ON COLUMN avenant.demande_validation_id IS 'Validation (correction, résiliation)';
COMMENT ON COLUMN avenant.preuve_id IS 'Accusé du souscripteur';
CREATE TRIGGER avenant_ins BEFORE INSERT ON avenant FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER avenant_upd BEFORE UPDATE ON avenant FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER avenant_del BEFORE DELETE ON avenant FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 7.12 college – Collège
CREATE TABLE college (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  police_id uuid NOT NULL,
  code varchar(10) NOT NULL,
  libelle varchar(120) NOT NULL,
  formule_id uuid NOT NULL,
  tarif_adulte bigint NOT NULL,
  tarif_enfant bigint NOT NULL,
  CONSTRAINT college_uk1 UNIQUE (police_id, code)
);
COMMENT ON TABLE college IS 'Collège. Catégorie de personnel ou de membres d’un contrat collectif. [DD 7.12 ; REF-RG-033, PROD-RG-030.]';
COMMENT ON COLUMN college.police_id IS 'Contrat collectif';
COMMENT ON COLUMN college.code IS 'Code';
COMMENT ON COLUMN college.libelle IS 'Libellé';
COMMENT ON COLUMN college.formule_id IS 'Formule';
COMMENT ON COLUMN college.tarif_adulte IS 'Tarif annuel par adulte';
COMMENT ON COLUMN college.tarif_enfant IS 'Tarif annuel par enfant';
CREATE TRIGGER college_ins BEFORE INSERT ON college FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER college_upd BEFORE UPDATE ON college FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER college_del BEFORE DELETE ON college FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 7.13 adhesion – Adhésion
CREATE TABLE adhesion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  numero_adherent varchar(5) NOT NULL,
  police_id uuid NOT NULL,
  tiers_id uuid NOT NULL,
  college_id uuid NOT NULL,
  date_entree date NOT NULL,
  date_sortie date,
  notice_preuve_id uuid,
  exclusion_motif varchar(200),
  mise_en_demeure_le date,
  CONSTRAINT adhesion_uk1 UNIQUE (police_id, numero_adherent)
);
COMMENT ON TABLE adhesion IS 'Adhésion. Adhérent d’un contrat collectif. [DD 7.13 ; PROD-RG-032, 035, 038, 080.]';
COMMENT ON COLUMN adhesion.numero_adherent IS 'Numéro d’adhérent (5 chiffres) – Jamais réutilisé dans la police';
COMMENT ON COLUMN adhesion.police_id IS 'Contrat collectif';
COMMENT ON COLUMN adhesion.tiers_id IS 'Adhérent';
COMMENT ON COLUMN adhesion.college_id IS 'Collège';
COMMENT ON COLUMN adhesion.date_entree IS 'Entrée';
COMMENT ON COLUMN adhesion.date_sortie IS 'Sortie';
COMMENT ON COLUMN adhesion.notice_preuve_id IS 'Remise de la notice (art. 222)';
COMMENT ON COLUMN adhesion.exclusion_motif IS 'Motif d’exclusion (art. 221)';
COMMENT ON COLUMN adhesion.mise_en_demeure_le IS 'Date d’envoi de la mise en demeure du souscripteur – Exclusion refusée avant 40 jours';
CREATE TRIGGER adhesion_ins BEFORE INSERT ON adhesion FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER adhesion_upd BEFORE UPDATE ON adhesion FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER adhesion_del BEFORE DELETE ON adhesion FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 7.14 mouvement_effectif – Mouvement d’effectif
CREATE TABLE mouvement_effectif (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  adhesion_id uuid NOT NULL,
  type type_mouvement_effectif NOT NULL,
  date_effet date NOT NULL,
  declare_le timestamptz NOT NULL,
  declare_par uuid NOT NULL,
  regularisation_id uuid
);
COMMENT ON TABLE mouvement_effectif IS 'Mouvement d’effectif. Entrée, sortie ou changement de collège déclaré par le profil entreprise. [DD 7.14 ; PROD-RG-032, 034.]';
COMMENT ON COLUMN mouvement_effectif.adhesion_id IS 'Adhésion';
COMMENT ON COLUMN mouvement_effectif.type IS 'Type';
COMMENT ON COLUMN mouvement_effectif.date_effet IS 'Date d’effet – Pas plus de 30 jours avant la déclaration';
COMMENT ON COLUMN mouvement_effectif.declare_le IS 'Déclaration';
COMMENT ON COLUMN mouvement_effectif.declare_par IS 'Représentant habilité';
COMMENT ON COLUMN mouvement_effectif.regularisation_id IS 'Régularisation qui le reprend';
CREATE TRIGGER mouvement_effectif_ins BEFORE INSERT ON mouvement_effectif FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER mouvement_effectif_upd BEFORE UPDATE ON mouvement_effectif FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER mouvement_effectif_del BEFORE DELETE ON mouvement_effectif FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 7.15 appel_prime – Appel de prime
CREATE TABLE appel_prime (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  numero varchar(12) NOT NULL,
  police_id uuid NOT NULL,
  type varchar(20) NOT NULL,
  montant bigint NOT NULL,
  detail_colleges jsonb NOT NULL,
  echeance date NOT NULL,
  montant_recu bigint NOT NULL,
  statut statut_appel_prime NOT NULL,
  CONSTRAINT appel_prime_uk1 UNIQUE (numero)
);
COMMENT ON TABLE appel_prime IS 'Appel de prime. Demande de paiement d’un contrat collectif. [DD 7.15 ; PROD-RG-031, 033, 039.]';
COMMENT ON COLUMN appel_prime.numero IS 'AP + AAAA + 6 chiffres';
COMMENT ON COLUMN appel_prime.police_id IS 'Contrat';
COMMENT ON COLUMN appel_prime.type IS 'INITIAL, RENOUVELLEMENT, REGULARISATION';
COMMENT ON COLUMN appel_prime.montant IS 'Montant total';
COMMENT ON COLUMN appel_prime.detail_colleges IS 'Détail par collège';
COMMENT ON COLUMN appel_prime.echeance IS 'Échéance';
COMMENT ON COLUMN appel_prime.montant_recu IS 'Montant reçu (encaissements affectés)';
COMMENT ON COLUMN appel_prime.statut IS 'Statut';
CREATE TRIGGER appel_prime_ins BEFORE INSERT ON appel_prime FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER appel_prime_upd BEFORE UPDATE ON appel_prime FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER appel_prime_del BEFORE DELETE ON appel_prime FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 7.16 regularisation – Régularisation mensuelle
CREATE TABLE regularisation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  police_id uuid NOT NULL,
  mois varchar(7) NOT NULL,
  prime_entrees bigint NOT NULL,
  ristourne_sorties bigint NOT NULL,
  solde_net bigint NOT NULL,
  appel_prime_id uuid,
  ordre_paiement_id uuid,
  quittance_id uuid,
  CONSTRAINT regularisation_uk1 UNIQUE (police_id, mois)
);
COMMENT ON TABLE regularisation IS 'Régularisation mensuelle. Prime des entrées et ristourne des sorties du mois écoulé. [DD 7.16 ; PROD-RG-033.]';
COMMENT ON COLUMN regularisation.police_id IS 'Contrat';
COMMENT ON COLUMN regularisation.mois IS 'Mois (AAAA-MM)';
COMMENT ON COLUMN regularisation.prime_entrees IS 'Prime des entrées';
COMMENT ON COLUMN regularisation.ristourne_sorties IS 'Ristourne des sorties';
COMMENT ON COLUMN regularisation.solde_net IS 'Solde net (+ appel, – remboursement)';
COMMENT ON COLUMN regularisation.appel_prime_id IS 'Appel émis';
COMMENT ON COLUMN regularisation.ordre_paiement_id IS 'Remboursement au souscripteur';
COMMENT ON COLUMN regularisation.quittance_id IS 'Quittance à terme légal';
CREATE TRIGGER regularisation_ins BEFORE INSERT ON regularisation FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER regularisation_upd BEFORE UPDATE ON regularisation FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER regularisation_del BEFORE DELETE ON regularisation FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 7.17 mise_en_demeure – Mise en demeure (art. 30)
CREATE TABLE mise_en_demeure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  police_id uuid NOT NULL,
  quittance_id uuid NOT NULL,
  lettre_document_id uuid NOT NULL,
  envoyee_le date NOT NULL,
  suspension_le date NOT NULL,
  resiliation_possible_le date NOT NULL,
  statut varchar(20) NOT NULL
);
COMMENT ON TABLE mise_en_demeure IS 'Mise en demeure (art. 30). Procédure de non-paiement d’une prime due en cours de contrat. [DD 7.17 ; PROD-RG-028.]';
COMMENT ON COLUMN mise_en_demeure.police_id IS 'Police';
COMMENT ON COLUMN mise_en_demeure.quittance_id IS 'Quittance impayée';
COMMENT ON COLUMN mise_en_demeure.lettre_document_id IS 'Lettre générée';
COMMENT ON COLUMN mise_en_demeure.envoyee_le IS 'Date d’envoi recommandé – Jour d’envoi exclu des délais';
COMMENT ON COLUMN mise_en_demeure.suspension_le IS 'Date de suspension calculée (30 jours)';
COMMENT ON COLUMN mise_en_demeure.resiliation_possible_le IS 'Date de résiliation possible (+10 jours)';
COMMENT ON COLUMN mise_en_demeure.statut IS 'EN_COURS, LEVEE, RESILIEE';
CREATE TRIGGER mise_en_demeure_ins BEFORE INSERT ON mise_en_demeure FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER mise_en_demeure_upd BEFORE UPDATE ON mise_en_demeure FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER mise_en_demeure_del BEFORE DELETE ON mise_en_demeure FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 7.18 versement_programme – Versement programmé
CREATE TABLE versement_programme (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  numero_recu varchar(14) NOT NULL,
  police_id uuid NOT NULL,
  montant bigint NOT NULL,
  moyen varchar(30) NOT NULL,
  reference_externe varchar(80),
  recu_le timestamptz NOT NULL,
  statut varchar(20) NOT NULL,
  ecriture_id uuid NOT NULL,
  CONSTRAINT versement_programme_uk1 UNIQUE (numero_recu)
);
COMMENT ON TABLE versement_programme IS 'Versement programmé. Versement reçu d’avance pour un renouvellement. [DD 7.18 ; PROD-RG-050 à 054, CONF-RG-009.]';
COMMENT ON COLUMN versement_programme.numero_recu IS 'VP + AAAA + 8 chiffres';
COMMENT ON COLUMN versement_programme.police_id IS 'Police';
COMMENT ON COLUMN versement_programme.montant IS 'Montant';
COMMENT ON COLUMN versement_programme.moyen IS 'MONNAIE_ELECTRONIQUE ou BUREAU (débit du compte de production de l’agent)';
COMMENT ON COLUMN versement_programme.reference_externe IS 'Référence opérateur';
COMMENT ON COLUMN versement_programme.recu_le IS 'Réception';
COMMENT ON COLUMN versement_programme.statut IS 'RECU, AFFECTE, REMBOURSE';
COMMENT ON COLUMN versement_programme.ecriture_id IS 'EVT-21';
CREATE TRIGGER versement_programme_ins BEFORE INSERT ON versement_programme FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER versement_programme_upd BEFORE UPDATE ON versement_programme FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER versement_programme_del BEFORE DELETE ON versement_programme FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 7.19 encaissement_attente – Encaissement en attente
CREATE TABLE encaissement_attente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  origine varchar(30) NOT NULL,
  payeur_tiers_id uuid NOT NULL,
  montant bigint NOT NULL,
  moyen varchar(30) NOT NULL,
  reference_externe varchar(80) NOT NULL,
  statut varchar(20) NOT NULL,
  affecte_a uuid,
  ecriture_id uuid NOT NULL,
  CONSTRAINT encaissement_attente_uk1 UNIQUE (moyen, reference_externe)
);
COMMENT ON TABLE encaissement_attente IS 'Encaissement en attente. Paiement reçu avant émission ou partiel. [DD 7.19 ; PROD-RG-031, 072, EVT-23, 24.]';
COMMENT ON COLUMN encaissement_attente.origine IS 'SOUSCRIPTION_EN_LIGNE ou APPEL_PRIME';
COMMENT ON COLUMN encaissement_attente.payeur_tiers_id IS 'Payeur';
COMMENT ON COLUMN encaissement_attente.montant IS 'Montant';
COMMENT ON COLUMN encaissement_attente.moyen IS 'Monnaie électronique ou banque';
COMMENT ON COLUMN encaissement_attente.reference_externe IS 'Référence – Idempotence';
COMMENT ON COLUMN encaissement_attente.statut IS 'EN_ATTENTE, AFFECTE, REMBOURSE';
COMMENT ON COLUMN encaissement_attente.affecte_a IS 'Quittance ou appel de prime';
COMMENT ON COLUMN encaissement_attente.ecriture_id IS 'EVT-23';
CREATE TRIGGER encaissement_attente_ins BEFORE INSERT ON encaissement_attente FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER encaissement_attente_upd BEFORE UPDATE ON encaissement_attente FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER encaissement_attente_del BEFORE DELETE ON encaissement_attente FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 8.1 prestataire – Prestataire agréé
CREATE TABLE prestataire (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  code varchar(8) NOT NULL,
  tiers_id uuid NOT NULL,
  type varchar(40) NOT NULL,
  statut statut_prestataire NOT NULL,
  convention_document_id uuid,
  administrateur_id uuid,
  latitude numeric(9,6),
  longitude numeric(9,6),
  horaires jsonb,
  telephone_mode_degrade varchar(20),
  pin_mode_degrade_hash varchar(128),
  CONSTRAINT prestataire_uk1 UNIQUE (code)
);
COMMENT ON TABLE prestataire IS 'Prestataire agréé. Structure de soins ou pharmacie partenaire. [DD 8.1 ; SAN-RG-001 à 003, 060, 061.]';
COMMENT ON COLUMN prestataire.code IS 'Code prestataire';
COMMENT ON COLUMN prestataire.tiers_id IS 'Fiche tiers (personne morale)';
COMMENT ON COLUMN prestataire.type IS 'Clinique, hôpital, cabinet, laboratoire, imagerie, pharmacie, optique…';
COMMENT ON COLUMN prestataire.statut IS 'Statut – Seul AGREE donne accès au portail';
COMMENT ON COLUMN prestataire.convention_document_id IS 'Convention signée';
COMMENT ON COLUMN prestataire.administrateur_id IS 'Administrateur du prestataire (un seul)';
COMMENT ON COLUMN prestataire.latitude IS 'Latitude (annuaire)';
COMMENT ON COLUMN prestataire.longitude IS 'Longitude';
COMMENT ON COLUMN prestataire.horaires IS 'Horaires';
COMMENT ON COLUMN prestataire.telephone_mode_degrade IS 'Numéro enregistré pour le mode dégradé – SAN-RG-080';
COMMENT ON COLUMN prestataire.pin_mode_degrade_hash IS 'Empreinte du code PIN du mode dégradé';
CREATE TRIGGER prestataire_ins BEFORE INSERT ON prestataire FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER prestataire_upd BEFORE UPDATE ON prestataire FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER prestataire_del BEFORE DELETE ON prestataire FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 8.2 prestataire_option – Option d’une structure
CREATE TABLE prestataire_option (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  prestataire_id uuid NOT NULL,
  option varchar(30) NOT NULL,
  actif boolean NOT NULL,
  calendrier jsonb,
  CONSTRAINT prestataire_option_uk1 UNIQUE (prestataire_id, option)
);
COMMENT ON TABLE prestataire_option IS 'Option d’une structure. Garde, 24 h/24, urgences, téléconsultation. [DD 8.2 ; SAN-RG-060.]';
COMMENT ON COLUMN prestataire_option.prestataire_id IS 'Structure';
COMMENT ON COLUMN prestataire_option.option IS 'GARDE, H24, URGENCES, TELECONSULTATION, HOSPITALISATION';
COMMENT ON COLUMN prestataire_option.actif IS 'Active';
COMMENT ON COLUMN prestataire_option.calendrier IS 'Calendrier des gardes (option prévue)';
CREATE TRIGGER prestataire_option_ins BEFORE INSERT ON prestataire_option FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER prestataire_option_upd BEFORE UPDATE ON prestataire_option FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER prestataire_option_del BEFORE DELETE ON prestataire_option FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 8.3 professionnel_sante – Professionnel de santé agréé
CREATE TABLE professionnel_sante (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  tiers_id uuid NOT NULL,
  profession varchar(40) NOT NULL,
  specialite varchar(60),
  numero_ordre varchar(40) NOT NULL,
  diplome_document_id uuid NOT NULL,
  agree_le date,
  statut statut_entite NOT NULL,
  teleconsultation boolean NOT NULL,
  CONSTRAINT professionnel_sante_uk1 UNIQUE (numero_ordre)
);
COMMENT ON TABLE professionnel_sante IS 'Professionnel de santé agréé. Agrément individuel d’un médecin, biologiste, radiologue, pharmacien… [DD 8.3 ; SAN-RG-004, 006, 009.]';
COMMENT ON COLUMN professionnel_sante.tiers_id IS 'Personne';
COMMENT ON COLUMN professionnel_sante.profession IS 'Profession';
COMMENT ON COLUMN professionnel_sante.specialite IS 'Spécialité';
COMMENT ON COLUMN professionnel_sante.numero_ordre IS 'Numéro d’inscription à l’ordre';
COMMENT ON COLUMN professionnel_sante.diplome_document_id IS 'Diplôme';
COMMENT ON COLUMN professionnel_sante.agree_le IS 'Agrément par la Compagnie – Compte activable seulement après';
COMMENT ON COLUMN professionnel_sante.statut IS 'Statut – Fin d’agrément : comptes désactivés partout';
COMMENT ON COLUMN professionnel_sante.teleconsultation IS 'Habilité à la téléconsultation';
CREATE TRIGGER professionnel_sante_ins BEFORE INSERT ON professionnel_sante FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER professionnel_sante_upd BEFORE UPDATE ON professionnel_sante FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER professionnel_sante_del BEFORE DELETE ON professionnel_sante FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 8.4 exercice_professionnel – Exercice dans une structure
CREATE TABLE exercice_professionnel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  professionnel_id uuid NOT NULL,
  prestataire_id uuid NOT NULL,
  utilisateur_id uuid NOT NULL,
  cree_par_admin_id uuid NOT NULL,
  actif boolean NOT NULL,
  CONSTRAINT exercice_professionnel_uk1 UNIQUE (professionnel_id, prestataire_id)
);
COMMENT ON TABLE exercice_professionnel IS 'Exercice dans une structure. Rattachement d’un professionnel à un prestataire. [DD 8.4 ; SAN-RG-004, 007, 061.]';
COMMENT ON COLUMN exercice_professionnel.professionnel_id IS 'Professionnel';
COMMENT ON COLUMN exercice_professionnel.prestataire_id IS 'Structure';
COMMENT ON COLUMN exercice_professionnel.utilisateur_id IS 'Compte nominatif dans la structure';
COMMENT ON COLUMN exercice_professionnel.cree_par_admin_id IS 'Administrateur du prestataire';
COMMENT ON COLUMN exercice_professionnel.actif IS 'Actif – Désactivation immédiate, sessions fermées';
CREATE TRIGGER exercice_professionnel_ins BEFORE INSERT ON exercice_professionnel FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER exercice_professionnel_upd BEFORE UPDATE ON exercice_professionnel FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER exercice_professionnel_del BEFORE DELETE ON exercice_professionnel FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 8.5 convention_tarif – Tarif conventionné
CREATE TABLE convention_tarif (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  prestataire_id uuid NOT NULL,
  acte_code varchar(20),
  medicament_id uuid,
  forfait_code varchar(20),
  tarif bigint NOT NULL,
  date_effet date NOT NULL
);
COMMENT ON TABLE convention_tarif IS 'Tarif conventionné. Tarif négocié par prestataire. [DD 8.5 ; SAN-RG-003.]';
COMMENT ON COLUMN convention_tarif.prestataire_id IS 'Prestataire';
COMMENT ON COLUMN convention_tarif.acte_code IS 'Acte';
COMMENT ON COLUMN convention_tarif.medicament_id IS 'Médicament';
COMMENT ON COLUMN convention_tarif.forfait_code IS 'Forfait (hospitalisation)';
COMMENT ON COLUMN convention_tarif.tarif IS 'Tarif conventionné (GNF) – Une facture ne peut le dépasser';
COMMENT ON COLUMN convention_tarif.date_effet IS 'Date d’effet';
CREATE TRIGGER convention_tarif_ins BEFORE INSERT ON convention_tarif FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER convention_tarif_upd BEFORE UPDATE ON convention_tarif FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER convention_tarif_del BEFORE DELETE ON convention_tarif FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 8.6 carte_assure – Carte d’assuré
CREATE TABLE carte_assure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  numero varchar(24) NOT NULL,
  police_assure_id uuid NOT NULL,
  numero_serie varchar(16) NOT NULL,
  jeton_qr varchar(300) NOT NULL,
  statut statut_carte NOT NULL,
  production statut_production_carte NOT NULL,
  validite_support date,
  remise_preuve_id uuid,
  code_secours_hash varchar(128),
  remplace_carte_id uuid,
  CONSTRAINT carte_assure_uk1 UNIQUE (numero_serie)
);
COMMENT ON TABLE carte_assure IS 'Carte d’assuré. Carte numérique et, sur demande, physique. [DD 8.6 ; SAN-RG-011 à 019, § 6.3.]';
COMMENT ON COLUMN carte_assure.numero IS 'Police + rang, ou police + adhérent + rang';
COMMENT ON COLUMN carte_assure.police_assure_id IS 'Personne couverte';
COMMENT ON COLUMN carte_assure.numero_serie IS 'Numéro de série – Invalidé à tout remplacement';
COMMENT ON COLUMN carte_assure.jeton_qr IS 'Jeton signé sans donnée personnelle';
COMMENT ON COLUMN carte_assure.statut IS 'Statut technique';
COMMENT ON COLUMN carte_assure.production IS 'État de production – Physique sur demande (paramètre)';
COMMENT ON COLUMN carte_assure.validite_support IS 'Fin de validité du support physique (3 ans)';
COMMENT ON COLUMN carte_assure.remise_preuve_id IS 'Remise confirmée par code';
COMMENT ON COLUMN carte_assure.code_secours_hash IS 'Empreinte du code personnel de secours – SAN-RG-080';
COMMENT ON COLUMN carte_assure.remplace_carte_id IS 'Carte remplacée';
CREATE TRIGGER carte_assure_ins BEFORE INSERT ON carte_assure FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER carte_assure_upd BEFORE UPDATE ON carte_assure FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER carte_assure_del BEFORE DELETE ON carte_assure FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 8.7 compteur_garantie – Compteur de consommation
CREATE TABLE compteur_garantie (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  police_assure_id uuid NOT NULL,
  garantie_id uuid,
  periode_id uuid NOT NULL,
  montant_consomme bigint NOT NULL,
  montant_reserve bigint NOT NULL,
  actes_consommes integer NOT NULL,
  actes_reserves integer NOT NULL,
  plafond bigint NOT NULL,
  CONSTRAINT compteur_garantie_uk1 UNIQUE (police_assure_id, garantie_id, periode_id)
);
COMMENT ON TABLE compteur_garantie IS 'Compteur de consommation. Montants et actes consommés et réservés. [DD 8.7 ; SAN-RG-020 à 022, 027, 094.]';
COMMENT ON COLUMN compteur_garantie.police_assure_id IS 'Personne';
COMMENT ON COLUMN compteur_garantie.garantie_id IS 'Garantie (vide = plafond global)';
COMMENT ON COLUMN compteur_garantie.periode_id IS 'Période de garantie';
COMMENT ON COLUMN compteur_garantie.montant_consomme IS 'Consommé';
COMMENT ON COLUMN compteur_garantie.montant_reserve IS 'Réservé';
COMMENT ON COLUMN compteur_garantie.actes_consommes IS 'Actes décomptés';
COMMENT ON COLUMN compteur_garantie.actes_reserves IS 'Actes réservés';
COMMENT ON COLUMN compteur_garantie.plafond IS 'Plafond applicable – Consommé + réservé ≤ plafond (contrainte en base)';
CREATE TRIGGER compteur_garantie_ins BEFORE INSERT ON compteur_garantie FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER compteur_garantie_upd BEFORE UPDATE ON compteur_garantie FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER compteur_garantie_del BEFORE DELETE ON compteur_garantie FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 8.8 prise_en_charge – Prise en charge
CREATE TABLE prise_en_charge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  numero varchar(16) NOT NULL,
  type type_pec NOT NULL,
  carte_assure_id uuid NOT NULL,
  prestataire_id uuid NOT NULL,
  ouverte_par uuid NOT NULL,
  ouverte_le timestamptz NOT NULL,
  code_assure_verifie boolean NOT NULL,
  motif_urgence text,
  confirmee_le timestamptz,
  qualification_accident boolean NOT NULL,
  sinistre_id uuid,
  contrat_complementaire_id uuid,
  acces_carnet_jusqu_au timestamptz NOT NULL,
  statut statut_pec NOT NULL,
  CONSTRAINT prise_en_charge_uk1 UNIQUE (numero)
);
COMMENT ON TABLE prise_en_charge IS 'Prise en charge. Ouverture de la couverture d’un acte chez un prestataire. [DD 8.8 ; SAN-RG-018, 030, 034, 090 à 093, § 9.7.]';
COMMENT ON COLUMN prise_en_charge.numero IS 'PEC + AAAA + 8 chiffres (provisoire en mode dégradé)';
COMMENT ON COLUMN prise_en_charge.type IS 'Type';
COMMENT ON COLUMN prise_en_charge.carte_assure_id IS 'Carte';
COMMENT ON COLUMN prise_en_charge.prestataire_id IS 'Structure';
COMMENT ON COLUMN prise_en_charge.ouverte_par IS 'Professionnel';
COMMENT ON COLUMN prise_en_charge.ouverte_le IS 'Ouverture';
COMMENT ON COLUMN prise_en_charge.code_assure_verifie IS 'Code de l’assuré vérifié – Faux seulement en urgence';
COMMENT ON COLUMN prise_en_charge.motif_urgence IS 'Motif d’urgence';
COMMENT ON COLUMN prise_en_charge.confirmee_le IS 'Confirmation (urgence, mode dégradé)';
COMMENT ON COLUMN prise_en_charge.qualification_accident IS 'Acte qualifié « accident »';
COMMENT ON COLUMN prise_en_charge.sinistre_id IS 'Déclaration d’accident rattachée – SAN-RG-092';
COMMENT ON COLUMN prise_en_charge.contrat_complementaire_id IS 'Contrat payant en complément (cumul) – SAN-RG-093';
COMMENT ON COLUMN prise_en_charge.acces_carnet_jusqu_au IS 'Fin d’accès au carnet';
COMMENT ON COLUMN prise_en_charge.statut IS 'Statut';
CREATE TRIGGER prise_en_charge_ins BEFORE INSERT ON prise_en_charge FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER prise_en_charge_upd BEFORE UPDATE ON prise_en_charge FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER prise_en_charge_del BEFORE DELETE ON prise_en_charge FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 8.9 hospitalisation – Hospitalisation
CREATE TABLE hospitalisation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  prise_en_charge_id uuid NOT NULL,
  date_entree timestamptz NOT NULL,
  duree_prevue_jours integer NOT NULL,
  devis bigint NOT NULL,
  accord_prealable_id uuid NOT NULL,
  prolongations jsonb,
  date_sortie timestamptz,
  ecart_devis bigint
);
COMMENT ON TABLE hospitalisation IS 'Hospitalisation. Séjour hospitalier lié à une prise en charge. [DD 8.9 ; SAN-RG-091.]';
COMMENT ON COLUMN hospitalisation.prise_en_charge_id IS 'Prise en charge';
COMMENT ON COLUMN hospitalisation.date_entree IS 'Entrée';
COMMENT ON COLUMN hospitalisation.duree_prevue_jours IS 'Durée prévue';
COMMENT ON COLUMN hospitalisation.devis IS 'Devis (GNF)';
COMMENT ON COLUMN hospitalisation.accord_prealable_id IS 'Accord';
COMMENT ON COLUMN hospitalisation.prolongations IS 'Prolongations demandées et décisions';
COMMENT ON COLUMN hospitalisation.date_sortie IS 'Sortie';
COMMENT ON COLUMN hospitalisation.ecart_devis IS 'Écart facture / devis';
CREATE TRIGGER hospitalisation_ins BEFORE INSERT ON hospitalisation FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER hospitalisation_upd BEFORE UPDATE ON hospitalisation FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER hospitalisation_del BEFORE DELETE ON hospitalisation FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 8.10 accord_prealable – Accord préalable
CREATE TABLE accord_prealable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  prise_en_charge_id uuid NOT NULL,
  motif varchar(300) NOT NULL,
  montant_estime bigint,
  pieces jsonb,
  demande_le timestamptz NOT NULL,
  statut statut_accord NOT NULL,
  decide_par uuid,
  decide_le timestamptz,
  motivation text
);
COMMENT ON TABLE accord_prealable IS 'Accord préalable. Décision du médecin-conseil avant un acte. [DD 8.10 ; Tableau 9.6, SAN-RG-026.]';
COMMENT ON COLUMN accord_prealable.prise_en_charge_id IS 'Prise en charge';
COMMENT ON COLUMN accord_prealable.motif IS 'Acte ou traitement demandé';
COMMENT ON COLUMN accord_prealable.montant_estime IS 'Montant estimé';
COMMENT ON COLUMN accord_prealable.pieces IS 'Pièces jointes';
COMMENT ON COLUMN accord_prealable.demande_le IS 'Demande';
COMMENT ON COLUMN accord_prealable.statut IS 'Statut';
COMMENT ON COLUMN accord_prealable.decide_par IS 'Médecin-conseil';
COMMENT ON COLUMN accord_prealable.decide_le IS 'Décision – Délai cible 4 heures ouvrées';
COMMENT ON COLUMN accord_prealable.motivation IS 'Motivation';
CREATE TRIGGER accord_prealable_ins BEFORE INSERT ON accord_prealable FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER accord_prealable_upd BEFORE UPDATE ON accord_prealable FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER accord_prealable_del BEFORE DELETE ON accord_prealable FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 8.11 acte – Acte réalisé
CREATE TABLE acte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  prise_en_charge_id uuid NOT NULL,
  acte_code varchar(20) NOT NULL,
  garantie_id uuid NOT NULL,
  diagnostic_code bytea,
  realise_par uuid NOT NULL,
  cout_conventionne bigint NOT NULL,
  part_compagnie bigint NOT NULL,
  ticket_moderateur bigint NOT NULL,
  part_non_couverte bigint NOT NULL,
  consultation_controle boolean NOT NULL,
  bon_execute_id uuid
);
COMMENT ON TABLE acte IS 'Acte réalisé. Acte saisi pendant une prise en charge. [DD 8.11 ; § 9.7, SAN-RG-024, 027.]';
COMMENT ON COLUMN acte.prise_en_charge_id IS 'Prise en charge';
COMMENT ON COLUMN acte.acte_code IS 'Code de l’acte';
COMMENT ON COLUMN acte.garantie_id IS 'Garantie imputée';
COMMENT ON COLUMN acte.diagnostic_code IS 'Diagnostic CIM-10 (chiffré)';
COMMENT ON COLUMN acte.realise_par IS 'Professionnel';
COMMENT ON COLUMN acte.cout_conventionne IS 'Coût conventionné';
COMMENT ON COLUMN acte.part_compagnie IS 'Part Compagnie';
COMMENT ON COLUMN acte.ticket_moderateur IS 'Ticket modérateur';
COMMENT ON COLUMN acte.part_non_couverte IS 'Part non couverte';
COMMENT ON COLUMN acte.consultation_controle IS 'Consultation de contrôle (non facturée, non décomptée)';
COMMENT ON COLUMN acte.bon_execute_id IS 'Bon exécuté';
CREATE TRIGGER acte_ins BEFORE INSERT ON acte FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER acte_upd BEFORE UPDATE ON acte FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER acte_del BEFORE DELETE ON acte FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 8.12 ordonnance – Ordonnance
CREATE TABLE ordonnance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  numero varchar(14) NOT NULL,
  prise_en_charge_id uuid NOT NULL,
  prescripteur_id uuid NOT NULL,
  emise_le timestamptz NOT NULL,
  valide_jusqu_au date NOT NULL,
  signature_preuve_id uuid NOT NULL,
  statut statut_ordonnance NOT NULL,
  longue_duree boolean NOT NULL,
  CONSTRAINT ordonnance_uk1 UNIQUE (numero)
);
COMMENT ON TABLE ordonnance IS 'Ordonnance. Prescription de médicaments numérique. [DD 8.12 ; SAN-RG-023, 030 à 032, § 6.3.]';
COMMENT ON COLUMN ordonnance.numero IS 'BO + AAAA + 8 chiffres';
COMMENT ON COLUMN ordonnance.prise_en_charge_id IS 'Prise en charge de prescription';
COMMENT ON COLUMN ordonnance.prescripteur_id IS 'Prescripteur';
COMMENT ON COLUMN ordonnance.emise_le IS 'Émission';
COMMENT ON COLUMN ordonnance.valide_jusqu_au IS 'Fin de validité (7 jours)';
COMMENT ON COLUMN ordonnance.signature_preuve_id IS 'Signature électronique';
COMMENT ON COLUMN ordonnance.statut IS 'Statut';
COMMENT ON COLUMN ordonnance.longue_duree IS 'Traitement de plus d’un mois (accord préalable)';
CREATE TRIGGER ordonnance_ins BEFORE INSERT ON ordonnance FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER ordonnance_upd BEFORE UPDATE ON ordonnance FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER ordonnance_del BEFORE DELETE ON ordonnance FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 8.13 ligne_ordonnance – Ligne d’ordonnance
CREATE TABLE ligne_ordonnance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  ordonnance_id uuid NOT NULL,
  medicament_id uuid NOT NULL,
  posologie varchar(300) NOT NULL,
  quantite_prescrite integer NOT NULL,
  quantite_servie integer NOT NULL
);
COMMENT ON TABLE ligne_ordonnance IS 'Ligne d’ordonnance. Médicament prescrit et quantités servies. [DD 8.13 ; SAN-RG-031, 033.]';
COMMENT ON COLUMN ligne_ordonnance.ordonnance_id IS 'Ordonnance';
COMMENT ON COLUMN ligne_ordonnance.medicament_id IS 'Médicament';
COMMENT ON COLUMN ligne_ordonnance.posologie IS 'Posologie';
COMMENT ON COLUMN ligne_ordonnance.quantite_prescrite IS 'Quantité prescrite';
COMMENT ON COLUMN ligne_ordonnance.quantite_servie IS 'Quantité déjà servie – Jamais supérieure à la prescrite, toutes pharmacies';
CREATE TRIGGER ligne_ordonnance_ins BEFORE INSERT ON ligne_ordonnance FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER ligne_ordonnance_upd BEFORE UPDATE ON ligne_ordonnance FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER ligne_ordonnance_del BEFORE DELETE ON ligne_ordonnance FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 8.14 bon_examen – Bon d’examen
CREATE TABLE bon_examen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  numero varchar(14) NOT NULL,
  prise_en_charge_id uuid NOT NULL,
  prescripteur_id uuid NOT NULL,
  actes jsonb NOT NULL,
  valide_jusqu_au date NOT NULL,
  statut statut_ordonnance NOT NULL,
  CONSTRAINT bon_examen_uk1 UNIQUE (numero)
);
COMMENT ON TABLE bon_examen IS 'Bon d’examen. Prescription d’analyses, d’imagerie ou d’autres actes. [DD 8.14 ; SAN-RG-034 à 036, § 6.3.]';
COMMENT ON COLUMN bon_examen.numero IS 'BA ou BX + AAAA + 8 chiffres';
COMMENT ON COLUMN bon_examen.prise_en_charge_id IS 'Prise en charge de prescription';
COMMENT ON COLUMN bon_examen.prescripteur_id IS 'Prescripteur';
COMMENT ON COLUMN bon_examen.actes IS 'Examens prescrits';
COMMENT ON COLUMN bon_examen.valide_jusqu_au IS 'Fin de validité';
COMMENT ON COLUMN bon_examen.statut IS 'Statut – Un examen n’est réalisé qu’une fois';
CREATE TRIGGER bon_examen_ins BEFORE INSERT ON bon_examen FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER bon_examen_upd BEFORE UPDATE ON bon_examen FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER bon_examen_del BEFORE DELETE ON bon_examen FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 8.15 dispensation – Dispensation
CREATE TABLE dispensation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  prise_en_charge_id uuid NOT NULL,
  ligne_ordonnance_id uuid NOT NULL,
  quantite integer NOT NULL,
  medicament_delivre_id uuid NOT NULL,
  substitution_generique boolean NOT NULL,
  premier_passage boolean NOT NULL
);
COMMENT ON TABLE dispensation IS 'Dispensation. Délivrance en pharmacie, totale ou partielle. [DD 8.15 ; SAN-RG-031, 032, 027.]';
COMMENT ON COLUMN dispensation.prise_en_charge_id IS 'Prise en charge en pharmacie';
COMMENT ON COLUMN dispensation.ligne_ordonnance_id IS 'Ligne servie';
COMMENT ON COLUMN dispensation.quantite IS 'Quantité délivrée';
COMMENT ON COLUMN dispensation.medicament_delivre_id IS 'Médicament délivré';
COMMENT ON COLUMN dispensation.substitution_generique IS 'Substitution par un générique (tracée)';
COMMENT ON COLUMN dispensation.premier_passage IS 'Premier passage sur l’ordonnance – Seul le premier passage décompte un acte';
CREATE TRIGGER dispensation_ins BEFORE INSERT ON dispensation FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER dispensation_upd BEFORE UPDATE ON dispensation FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER dispensation_del BEFORE DELETE ON dispensation FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 8.16 facture_prestation – Facture de prestation
CREATE TABLE facture_prestation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  numero varchar(24) NOT NULL,
  prise_en_charge_id uuid NOT NULL,
  prestataire_id uuid NOT NULL,
  professionnel_id uuid NOT NULL,
  date_acte date NOT NULL,
  montant_compagnie bigint NOT NULL,
  statut_controle statut_ligne_facture NOT NULL,
  motif_rejet varchar(300),
  facture_mensuelle_id uuid,
  CONSTRAINT facture_prestation_uk1 UNIQUE (numero)
);
COMMENT ON TABLE facture_prestation IS 'Facture de prestation. Facture générée à la clôture de l’acte. [DD 8.16 ; SAN-RG-008, 040, § 6.3.]';
COMMENT ON COLUMN facture_prestation.numero IS 'FS, FO ou FA + code prestataire + AAAAMM + séquence';
COMMENT ON COLUMN facture_prestation.prise_en_charge_id IS 'Prise en charge';
COMMENT ON COLUMN facture_prestation.prestataire_id IS 'Structure créancière';
COMMENT ON COLUMN facture_prestation.professionnel_id IS 'Professionnel auteur';
COMMENT ON COLUMN facture_prestation.date_acte IS 'Date de l’acte';
COMMENT ON COLUMN facture_prestation.montant_compagnie IS 'Part Compagnie';
COMMENT ON COLUMN facture_prestation.statut_controle IS 'Résultat du contrôle';
COMMENT ON COLUMN facture_prestation.motif_rejet IS 'Motif (délai de facturation, tarif, doublon…)';
COMMENT ON COLUMN facture_prestation.facture_mensuelle_id IS 'Facture mensuelle';
CREATE TRIGGER facture_prestation_ins BEFORE INSERT ON facture_prestation FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER facture_prestation_upd BEFORE UPDATE ON facture_prestation FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER facture_prestation_del BEFORE DELETE ON facture_prestation FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 8.17 facture_mensuelle – Facture mensuelle
CREATE TABLE facture_mensuelle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  numero varchar(18) NOT NULL,
  prestataire_id uuid NOT NULL,
  mois varchar(7) NOT NULL,
  montant bigint NOT NULL,
  soumise_le timestamptz,
  echeance_paiement date,
  statut statut_facture NOT NULL,
  demande_validation_id uuid,
  ecriture_id uuid,
  ordre_paiement_id uuid,
  CONSTRAINT facture_mensuelle_uk1 UNIQUE (numero),
  CONSTRAINT facture_mensuelle_uk2 UNIQUE (prestataire_id, mois)
);
COMMENT ON TABLE facture_mensuelle IS 'Facture mensuelle. Regroupement mensuel par prestataire. [DD 8.17 ; SAN-RG-041 à 045.]';
COMMENT ON COLUMN facture_mensuelle.numero IS 'FM + code prestataire + AAAAMM';
COMMENT ON COLUMN facture_mensuelle.prestataire_id IS 'Prestataire';
COMMENT ON COLUMN facture_mensuelle.mois IS 'Mois (AAAA-MM)';
COMMENT ON COLUMN facture_mensuelle.montant IS 'Montant (GNF)';
COMMENT ON COLUMN facture_mensuelle.soumise_le IS 'Soumission par le prestataire';
COMMENT ON COLUMN facture_mensuelle.echeance_paiement IS 'Soumission + 30 jours';
COMMENT ON COLUMN facture_mensuelle.statut IS 'Statut';
COMMENT ON COLUMN facture_mensuelle.demande_validation_id IS 'Validation';
COMMENT ON COLUMN facture_mensuelle.ecriture_id IS 'EVT-08';
COMMENT ON COLUMN facture_mensuelle.ordre_paiement_id IS 'Paiement (EVT-09)';
CREATE TRIGGER facture_mensuelle_ins BEFORE INSERT ON facture_mensuelle FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER facture_mensuelle_upd BEFORE UPDATE ON facture_mensuelle FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER facture_mensuelle_del BEFORE DELETE ON facture_mensuelle FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 8.18 contestation_ligne – Contestation d’une ligne
CREATE TABLE contestation_ligne (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  facture_prestation_id uuid NOT NULL,
  motif text NOT NULL,
  decision varchar(20),
  decide_par uuid
);
COMMENT ON TABLE contestation_ligne IS 'Contestation d’une ligne. Ligne de facture contestée par le prestataire. [DD 8.18 ; SAN-RG-041.]';
COMMENT ON COLUMN contestation_ligne.facture_prestation_id IS 'Facture contestée';
COMMENT ON COLUMN contestation_ligne.motif IS 'Motif';
COMMENT ON COLUMN contestation_ligne.decision IS 'ACCEPTEE ou REFUSEE';
COMMENT ON COLUMN contestation_ligne.decide_par IS 'Gestionnaire santé';
CREATE TRIGGER contestation_ligne_ins BEFORE INSERT ON contestation_ligne FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER contestation_ligne_upd BEFORE UPDATE ON contestation_ligne FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER contestation_ligne_del BEFORE DELETE ON contestation_ligne FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 8.19 carnet_entree – Entrée du carnet de santé (journal : ajout seul)
CREATE TABLE carnet_entree (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  tiers_id uuid NOT NULL,
  type varchar(30) NOT NULL,
  contenu bytea NOT NULL,
  prise_en_charge_id uuid,
  auteur_id uuid NOT NULL,
  vue_minimale vue_carnet NOT NULL,
  sensible boolean NOT NULL,
  masque boolean NOT NULL
);
COMMENT ON TABLE carnet_entree IS 'Entrée du carnet de santé. Élément du carnet unique de chaque personne couverte. [DD 8.19 ; SAN-RG-050 à 056.]';
COMMENT ON COLUMN carnet_entree.tiers_id IS 'Personne';
COMMENT ON COLUMN carnet_entree.type IS 'CONSULTATION, DIAGNOSTIC, PRESCRIPTION, RESULTAT, ALLERGIE, ANTECEDENT, TRAITEMENT, NOTE';
COMMENT ON COLUMN carnet_entree.contenu IS 'Contenu (chiffré, clé dédiée)';
COMMENT ON COLUMN carnet_entree.prise_en_charge_id IS 'Prise en charge d’origine';
COMMENT ON COLUMN carnet_entree.auteur_id IS 'Professionnel auteur';
COMMENT ON COLUMN carnet_entree.vue_minimale IS 'Vue minimale autorisée à la lire';
COMMENT ON COLUMN carnet_entree.sensible IS 'Catégorie sensible';
COMMENT ON COLUMN carnet_entree.masque IS 'Masqué par l’assuré – Levable en urgence avec trace';
CREATE TRIGGER carnet_entree_ins BEFORE INSERT ON carnet_entree FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER carnet_entree_journal BEFORE UPDATE OR DELETE ON carnet_entree FOR EACH ROW EXECUTE FUNCTION interdire_modification_journal();

-- 8.20 journal_acces_carnet – Journal des accès au carnet (journal : ajout seul)
CREATE TABLE journal_acces_carnet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  tiers_id uuid NOT NULL,
  utilisateur_id uuid NOT NULL,
  prise_en_charge_id uuid,
  acces_urgence boolean NOT NULL,
  motif varchar(300),
  horodatage timestamptz NOT NULL,
  empreinte varchar(128) NOT NULL
);
COMMENT ON TABLE journal_acces_carnet IS 'Journal des accès au carnet. Trace indélébile de chaque accès. [DD 8.20 ; SAN-RG-054.]';
COMMENT ON COLUMN journal_acces_carnet.tiers_id IS 'Personne';
COMMENT ON COLUMN journal_acces_carnet.utilisateur_id IS 'Professionnel';
COMMENT ON COLUMN journal_acces_carnet.prise_en_charge_id IS 'Prise en charge';
COMMENT ON COLUMN journal_acces_carnet.acces_urgence IS 'Accès d’urgence';
COMMENT ON COLUMN journal_acces_carnet.motif IS 'Motif (urgence)';
COMMENT ON COLUMN journal_acces_carnet.horodatage IS 'Date et heure';
COMMENT ON COLUMN journal_acces_carnet.empreinte IS 'Empreinte chaînée';
CREATE TRIGGER journal_acces_carnet_ins BEFORE INSERT ON journal_acces_carnet FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER journal_acces_carnet_journal BEFORE UPDATE OR DELETE ON journal_acces_carnet FOR EACH ROW EXECUTE FUNCTION interdire_modification_journal();

-- 8.21 creneau – Créneau de téléconsultation
CREATE TABLE creneau (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  professionnel_id uuid NOT NULL,
  prestataire_id uuid NOT NULL,
  debut timestamptz NOT NULL,
  duree_minutes integer NOT NULL,
  disponible boolean NOT NULL
);
COMMENT ON TABLE creneau IS 'Créneau de téléconsultation. Agenda tenu par le médecin. [DD 8.21 ; SAN-RG-071.]';
COMMENT ON COLUMN creneau.professionnel_id IS 'Médecin habilité';
COMMENT ON COLUMN creneau.prestataire_id IS 'Structure (option téléconsultation)';
COMMENT ON COLUMN creneau.debut IS 'Début';
COMMENT ON COLUMN creneau.duree_minutes IS 'Durée';
COMMENT ON COLUMN creneau.disponible IS 'Disponible';
CREATE TRIGGER creneau_ins BEFORE INSERT ON creneau FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER creneau_upd BEFORE UPDATE ON creneau FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER creneau_del BEFORE DELETE ON creneau FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 8.22 rendez_vous – Rendez-vous de téléconsultation
CREATE TABLE rendez_vous (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  numero varchar(16) NOT NULL,
  creneau_id uuid NOT NULL,
  carte_assure_id uuid NOT NULL,
  reserve_par uuid NOT NULL,
  statut statut_rdv NOT NULL,
  reference_paiement_tm varchar(80),
  prise_en_charge_id uuid,
  CONSTRAINT rendez_vous_uk1 UNIQUE (numero)
);
COMMENT ON TABLE rendez_vous IS 'Rendez-vous de téléconsultation. Réservation d’un créneau par l’assuré. [DD 8.22 ; SAN-RG-072 à 077.]';
COMMENT ON COLUMN rendez_vous.numero IS 'RDV + AAAA + 8 chiffres';
COMMENT ON COLUMN rendez_vous.creneau_id IS 'Créneau';
COMMENT ON COLUMN rendez_vous.carte_assure_id IS 'Carte';
COMMENT ON COLUMN rendez_vous.reserve_par IS 'Assuré, agent ou guichet (tracé)';
COMMENT ON COLUMN rendez_vous.statut IS 'Statut';
COMMENT ON COLUMN rendez_vous.reference_paiement_tm IS 'Référence de paiement du ticket modérateur (compte marchand de la structure)';
COMMENT ON COLUMN rendez_vous.prise_en_charge_id IS 'Prise en charge ouverte';
CREATE TRIGGER rendez_vous_ins BEFORE INSERT ON rendez_vous FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER rendez_vous_upd BEFORE UPDATE ON rendez_vous FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER rendez_vous_del BEFORE DELETE ON rendez_vous FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 8.23 appel_teleconsultation – Journal d’appel de téléconsultation (journal : ajout seul)
CREATE TABLE appel_teleconsultation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  rendez_vous_id uuid NOT NULL,
  canal varchar(20) NOT NULL,
  identifiant_fournisseur varchar(120) NOT NULL,
  debut timestamptz NOT NULL,
  fin timestamptz,
  duree_secondes integer,
  confirmation_assure_id uuid
);
COMMENT ON TABLE appel_teleconsultation IS 'Journal d’appel de téléconsultation. Preuve de l’appel lancé par la plateforme. [DD 8.23 ; SAN-RG-074.]';
COMMENT ON COLUMN appel_teleconsultation.rendez_vous_id IS 'Rendez-vous';
COMMENT ON COLUMN appel_teleconsultation.canal IS 'WHATSAPP_VIDEO ou TELEPHONE';
COMMENT ON COLUMN appel_teleconsultation.identifiant_fournisseur IS 'Identifiant de l’appel chez le fournisseur';
COMMENT ON COLUMN appel_teleconsultation.debut IS 'Début';
COMMENT ON COLUMN appel_teleconsultation.fin IS 'Fin';
COMMENT ON COLUMN appel_teleconsultation.duree_secondes IS 'Durée';
COMMENT ON COLUMN appel_teleconsultation.confirmation_assure_id IS 'Confirmation de l’assuré à la clôture – Sans journal ni confirmation : non facturable';
CREATE TRIGGER appel_teleconsultation_ins BEFORE INSERT ON appel_teleconsultation FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER appel_teleconsultation_journal BEFORE UPDATE OR DELETE ON appel_teleconsultation FOR EACH ROW EXECUTE FUNCTION interdire_modification_journal();

-- 9.1 declarant – Déclarant
CREATE TABLE declarant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  tiers_id uuid NOT NULL,
  lien_assure varchar(60) NOT NULL,
  police_id uuid NOT NULL,
  telephone_verifie boolean NOT NULL
);
COMMENT ON TABLE declarant IS 'Déclarant. Compte de déclarant habilité. [DD 9.1 ; SIN-RG-001, 002.]';
COMMENT ON COLUMN declarant.tiers_id IS 'Personne';
COMMENT ON COLUMN declarant.lien_assure IS 'Assuré, membre du foyer, bénéficiaire, représentant habilité, responsable de groupement';
COMMENT ON COLUMN declarant.police_id IS 'Police concernée';
COMMENT ON COLUMN declarant.telephone_verifie IS 'Téléphone vérifié par code';
CREATE TRIGGER declarant_ins BEFORE INSERT ON declarant FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER declarant_upd BEFORE UPDATE ON declarant FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER declarant_del BEFORE DELETE ON declarant FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 9.2 sinistre – Dossier de sinistre
CREATE TABLE sinistre (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  numero varchar(14) NOT NULL,
  police_id uuid NOT NULL,
  victime_id uuid NOT NULL,
  type type_sinistre NOT NULL,
  date_evenement date NOT NULL,
  lieu varchar(200) NOT NULL,
  circonstances text NOT NULL,
  declarant_id uuid NOT NULL,
  assiste_par uuid,
  declaration_preuve_id uuid NOT NULL,
  declare_le timestamptz NOT NULL,
  tardif boolean NOT NULL,
  dossier_complet_le timestamptz,
  gestionnaire_id uuid,
  provision_courante bigint NOT NULL,
  statut statut_sinistre NOT NULL,
  doublon_probable_de uuid,
  CONSTRAINT sinistre_uk1 UNIQUE (numero),
  CONSTRAINT sinistre_uk2 UNIQUE (victime_id, type, date_evenement)
);
COMMENT ON TABLE sinistre IS 'Dossier de sinistre. Dossier accident ou décès. [DD 9.2 ; SIN-RG-003 à 006, 010 à 034.]';
COMMENT ON COLUMN sinistre.numero IS 'SIN + AAAA + 6 chiffres';
COMMENT ON COLUMN sinistre.police_id IS 'Police';
COMMENT ON COLUMN sinistre.victime_id IS 'Victime';
COMMENT ON COLUMN sinistre.type IS 'Type';
COMMENT ON COLUMN sinistre.date_evenement IS 'Date de l’accident ou du décès';
COMMENT ON COLUMN sinistre.lieu IS 'Lieu';
COMMENT ON COLUMN sinistre.circonstances IS 'Circonstances';
COMMENT ON COLUMN sinistre.declarant_id IS 'Déclarant';
COMMENT ON COLUMN sinistre.assiste_par IS 'Agent ou guichet ayant assisté';
COMMENT ON COLUMN sinistre.declaration_preuve_id IS 'Déclaration validée par code';
COMMENT ON COLUMN sinistre.declare_le IS 'Déclaration';
COMMENT ON COLUMN sinistre.tardif IS 'Déclaration tardive (signalée)';
COMMENT ON COLUMN sinistre.dossier_complet_le IS 'Dossier complet – Point de départ du délai de décision';
COMMENT ON COLUMN sinistre.gestionnaire_id IS 'Gestionnaire';
COMMENT ON COLUMN sinistre.provision_courante IS 'Provision de dossier (GNF)';
COMMENT ON COLUMN sinistre.statut IS 'Statut';
COMMENT ON COLUMN sinistre.doublon_probable_de IS 'Dossier rapproché (± 1 jour)';
CREATE TRIGGER sinistre_ins BEFORE INSERT ON sinistre FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER sinistre_upd BEFORE UPDATE ON sinistre FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER sinistre_del BEFORE DELETE ON sinistre FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 9.3 sinistre_garantie – Garantie sollicitée
CREATE TABLE sinistre_garantie (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  sinistre_id uuid NOT NULL,
  garantie_id uuid NOT NULL,
  taux_incapacite numeric(9,6),
  jours_incapacite integer,
  montant_calcule bigint
);
COMMENT ON TABLE sinistre_garantie IS 'Garantie sollicitée. Garanties mises en jeu par le dossier. [DD 9.3 ; SIN-RG-011, 023.]';
COMMENT ON COLUMN sinistre_garantie.sinistre_id IS 'Dossier';
COMMENT ON COLUMN sinistre_garantie.garantie_id IS 'Garantie';
COMMENT ON COLUMN sinistre_garantie.taux_incapacite IS 'Taux d’incapacité';
COMMENT ON COLUMN sinistre_garantie.jours_incapacite IS 'Jours d’incapacité';
COMMENT ON COLUMN sinistre_garantie.montant_calcule IS 'Montant calculé';
CREATE TRIGGER sinistre_garantie_ins BEFORE INSERT ON sinistre_garantie FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER sinistre_garantie_upd BEFORE UPDATE ON sinistre_garantie FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER sinistre_garantie_del BEFORE DELETE ON sinistre_garantie FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 9.4 piece_exigee – Pièce exigée (paramètre)
CREATE TABLE piece_exigee (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  type_sinistre type_sinistre NOT NULL,
  libelle varchar(200) NOT NULL,
  original_requis boolean NOT NULL
);
COMMENT ON TABLE piece_exigee IS 'Pièce exigée (paramètre). Liste paramétrée des pièces par type de sinistre. [DD 9.4 ; SIN-RG-012, DIG-RG-003.]';
COMMENT ON COLUMN piece_exigee.type_sinistre IS 'Type';
COMMENT ON COLUMN piece_exigee.libelle IS 'Pièce';
COMMENT ON COLUMN piece_exigee.original_requis IS 'Original légalement requis (vérifié au bureau puis rendu)';
CREATE TRIGGER piece_exigee_ins BEFORE INSERT ON piece_exigee FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER piece_exigee_upd BEFORE UPDATE ON piece_exigee FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER piece_exigee_del BEFORE DELETE ON piece_exigee FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 9.5 piece_recue – Pièce reçue
CREATE TABLE piece_recue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  sinistre_id uuid NOT NULL,
  piece_exigee_id uuid NOT NULL,
  document_id uuid NOT NULL,
  conforme boolean,
  original_verifie_par uuid
);
COMMENT ON TABLE piece_recue IS 'Pièce reçue. Pièce déposée numériquement. [DD 9.5 ; SIN-RG-012, 013.]';
COMMENT ON COLUMN piece_recue.sinistre_id IS 'Dossier';
COMMENT ON COLUMN piece_recue.piece_exigee_id IS 'Pièce attendue';
COMMENT ON COLUMN piece_recue.document_id IS 'Fichier déposé';
COMMENT ON COLUMN piece_recue.conforme IS 'Conforme';
COMMENT ON COLUMN piece_recue.original_verifie_par IS 'Vérification de l’original (si requis)';
CREATE TRIGGER piece_recue_ins BEFORE INSERT ON piece_recue FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER piece_recue_upd BEFORE UPDATE ON piece_recue FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER piece_recue_del BEFORE DELETE ON piece_recue FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 9.6 expertise – Expertise médicale
CREATE TABLE expertise (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  sinistre_id uuid NOT NULL,
  expert_tiers_id uuid NOT NULL,
  conclusions bytea,
  facture_achat_id uuid
);
COMMENT ON TABLE expertise IS 'Expertise médicale. Expertise demandée par le gestionnaire. [DD 9.6 ; SIN-RG-022.]';
COMMENT ON COLUMN expertise.sinistre_id IS 'Dossier';
COMMENT ON COLUMN expertise.expert_tiers_id IS 'Médecin expert (fournisseur)';
COMMENT ON COLUMN expertise.conclusions IS 'Conclusions (chiffrées)';
COMMENT ON COLUMN expertise.facture_achat_id IS 'Facture d’achat rattachée (EVT-15)';
CREATE TRIGGER expertise_ins BEFORE INSERT ON expertise FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER expertise_upd BEFORE UPDATE ON expertise FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER expertise_del BEFORE DELETE ON expertise FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 9.7 mouvement_provision – Mouvement de provision de dossier (journal : ajout seul)
CREATE TABLE mouvement_provision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  sinistre_id uuid NOT NULL,
  ancienne_valeur bigint NOT NULL,
  nouvelle_valeur bigint NOT NULL,
  motif varchar(300) NOT NULL,
  demande_validation_id uuid,
  auteur_id uuid NOT NULL
);
COMMENT ON TABLE mouvement_provision IS 'Mouvement de provision de dossier. Constitution et réévaluations historisées. [DD 9.7 ; SIN-RG-021, FIN-RG-061.]';
COMMENT ON COLUMN mouvement_provision.sinistre_id IS 'Dossier';
COMMENT ON COLUMN mouvement_provision.ancienne_valeur IS 'Avant';
COMMENT ON COLUMN mouvement_provision.nouvelle_valeur IS 'Après';
COMMENT ON COLUMN mouvement_provision.motif IS 'Motif';
COMMENT ON COLUMN mouvement_provision.demande_validation_id IS 'Validation si l’écart dépasse 5 000 000 GNF';
COMMENT ON COLUMN mouvement_provision.auteur_id IS 'Auteur';
CREATE TRIGGER mouvement_provision_ins BEFORE INSERT ON mouvement_provision FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER mouvement_provision_journal BEFORE UPDATE OR DELETE ON mouvement_provision FOR EACH ROW EXECUTE FUNCTION interdire_modification_journal();

-- 9.8 decision_sinistre – Décision
CREATE TABLE decision_sinistre (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  sinistre_id uuid NOT NULL,
  decision varchar(10) NOT NULL,
  montant_total bigint,
  motif text NOT NULL,
  demande_validation_id uuid NOT NULL,
  lettre_document_id uuid
);
COMMENT ON TABLE decision_sinistre IS 'Décision. Acceptation ou rejet validé selon les délégations. [DD 9.8 ; SIN-RG-024, 025.]';
COMMENT ON COLUMN decision_sinistre.sinistre_id IS 'Dossier';
COMMENT ON COLUMN decision_sinistre.decision IS 'ACCEPTE ou REJETE';
COMMENT ON COLUMN decision_sinistre.montant_total IS 'Montant accordé';
COMMENT ON COLUMN decision_sinistre.motif IS 'Motif, clause, voies de recours';
COMMENT ON COLUMN decision_sinistre.demande_validation_id IS 'Circuit de validation';
COMMENT ON COLUMN decision_sinistre.lettre_document_id IS 'Lettre motivée';
CREATE TRIGGER decision_sinistre_ins BEFORE INSERT ON decision_sinistre FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER decision_sinistre_upd BEFORE UPDATE ON decision_sinistre FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER decision_sinistre_del BEFORE DELETE ON decision_sinistre FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 9.9 offre_indemnite – Offre d’indemnité
CREATE TABLE offre_indemnite (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  sinistre_id uuid NOT NULL,
  detail_calcul jsonb NOT NULL,
  delai_paiement_jours integer NOT NULL,
  envoyee_le timestamptz NOT NULL
);
COMMENT ON TABLE offre_indemnite IS 'Offre d’indemnité. Proposition envoyée aux bénéficiaires. [DD 9.9 ; SIN-RG-030, 031.]';
COMMENT ON COLUMN offre_indemnite.sinistre_id IS 'Dossier';
COMMENT ON COLUMN offre_indemnite.detail_calcul IS 'Calcul';
COMMENT ON COLUMN offre_indemnite.delai_paiement_jours IS 'Délai de paiement';
COMMENT ON COLUMN offre_indemnite.envoyee_le IS 'Envoi';
CREATE TRIGGER offre_indemnite_ins BEFORE INSERT ON offre_indemnite FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER offre_indemnite_upd BEFORE UPDATE ON offre_indemnite FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER offre_indemnite_del BEFORE DELETE ON offre_indemnite FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 9.10 beneficiaire_reglement – Bénéficiaire d’un règlement
CREATE TABLE beneficiaire_reglement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  offre_id uuid NOT NULL,
  tiers_id uuid NOT NULL,
  representant_legal_id uuid,
  montant bigint NOT NULL,
  acceptation_preuve_id uuid,
  compte_auxiliaire_id uuid,
  ordre_paiement_id uuid,
  bloque_attente_tutelle boolean NOT NULL
);
COMMENT ON TABLE beneficiaire_reglement IS 'Bénéficiaire d’un règlement. Part de chaque bénéficiaire et son paiement. [DD 9.10 ; SIN-RG-031, 032, 038.]';
COMMENT ON COLUMN beneficiaire_reglement.offre_id IS 'Offre';
COMMENT ON COLUMN beneficiaire_reglement.tiers_id IS 'Bénéficiaire';
COMMENT ON COLUMN beneficiaire_reglement.representant_legal_id IS 'Représentant légal ou tuteur (mineur)';
COMMENT ON COLUMN beneficiaire_reglement.montant IS 'Montant';
COMMENT ON COLUMN beneficiaire_reglement.acceptation_preuve_id IS 'Acceptation (signature certifiée ANDE)';
COMMENT ON COLUMN beneficiaire_reglement.compte_auxiliaire_id IS 'Compte créé à l’acceptation (REF-RG-004)';
COMMENT ON COLUMN beneficiaire_reglement.ordre_paiement_id IS 'Paiement (EVT-11)';
COMMENT ON COLUMN beneficiaire_reglement.bloque_attente_tutelle IS 'Bloqué jusqu’à désignation du tuteur';
CREATE TRIGGER beneficiaire_reglement_ins BEFORE INSERT ON beneficiaire_reglement FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER beneficiaire_reglement_upd BEFORE UPDATE ON beneficiaire_reglement FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER beneficiaire_reglement_del BEFORE DELETE ON beneficiaire_reglement FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 9.11 recours – Recours
CREATE TABLE recours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  sinistre_id uuid NOT NULL,
  tiers_responsable_id uuid NOT NULL,
  montant_reclame bigint NOT NULL,
  montant_reconnu bigint,
  montant_encaisse bigint NOT NULL,
  statut varchar(20) NOT NULL,
  ecriture_id uuid
);
COMMENT ON TABLE recours IS 'Recours. Recours contre un tiers responsable. [DD 9.11 ; SIN-RG-035.]';
COMMENT ON COLUMN recours.sinistre_id IS 'Dossier';
COMMENT ON COLUMN recours.tiers_responsable_id IS 'Responsable ou son assureur';
COMMENT ON COLUMN recours.montant_reclame IS 'Montant réclamé';
COMMENT ON COLUMN recours.montant_reconnu IS 'Montant reconnu';
COMMENT ON COLUMN recours.montant_encaisse IS 'Encaissé';
COMMENT ON COLUMN recours.statut IS 'OUVERT, RECONNU, ENCAISSE, ABANDONNE';
COMMENT ON COLUMN recours.ecriture_id IS 'EVT-25';
CREATE TRIGGER recours_ins BEFORE INSERT ON recours FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER recours_upd BEFORE UPDATE ON recours FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER recours_del BEFORE DELETE ON recours FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 10.1 exercice – Exercice comptable
CREATE TABLE exercice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  code varchar(6) NOT NULL,
  date_debut date NOT NULL,
  date_fin date NOT NULL,
  statut statut_exercice NOT NULL,
  CONSTRAINT exercice_uk1 UNIQUE (code)
);
COMMENT ON TABLE exercice IS 'Exercice comptable. Exercice et ses dates. [DD 10.1 ; FIN-RG-071, 064.]';
COMMENT ON COLUMN exercice.code IS 'Code (ex. 2026)';
COMMENT ON COLUMN exercice.date_debut IS 'Début';
COMMENT ON COLUMN exercice.date_fin IS 'Fin';
COMMENT ON COLUMN exercice.statut IS 'Statut – 2 ouverts au plus';
CREATE TRIGGER exercice_ins BEFORE INSERT ON exercice FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER exercice_upd BEFORE UPDATE ON exercice FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER exercice_del BEFORE DELETE ON exercice FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 10.2 periode – Période comptable
CREATE TABLE periode (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  exercice_id uuid NOT NULL,
  mois varchar(7) NOT NULL,
  statut varchar(20) NOT NULL,
  cloturee_par uuid,
  anomalies jsonb,
  CONSTRAINT periode_uk1 UNIQUE (exercice_id, mois)
);
COMMENT ON TABLE periode IS 'Période comptable. Période mensuelle clôturable. [DD 10.2 ; FIN-RG-072.]';
COMMENT ON COLUMN periode.exercice_id IS 'Exercice';
COMMENT ON COLUMN periode.mois IS 'Mois';
COMMENT ON COLUMN periode.statut IS 'OUVERTE, CLOTUREE_PROVISOIRE, CLOTUREE';
COMMENT ON COLUMN periode.cloturee_par IS 'Auteur';
COMMENT ON COLUMN periode.anomalies IS 'Anomalies levées avant clôture';
CREATE TRIGGER periode_ins BEFORE INSERT ON periode FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER periode_upd BEFORE UPDATE ON periode FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER periode_del BEFORE DELETE ON periode FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 10.3 journee_comptable – Journée comptable
CREATE TABLE journee_comptable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  date date NOT NULL,
  caisses_arretees boolean NOT NULL,
  anomalies jsonb,
  CONSTRAINT journee_comptable_uk1 UNIQUE (date)
);
COMMENT ON TABLE journee_comptable IS 'Journée comptable. Journée basculée automatiquement à minuit. [DD 10.3 ; FIN-RG-041.]';
COMMENT ON COLUMN journee_comptable.date IS 'Journée';
COMMENT ON COLUMN journee_comptable.caisses_arretees IS 'Caisses arrêtées par la Trésorerie';
COMMENT ON COLUMN journee_comptable.anomalies IS 'Anomalies listées (non bloquantes)';
CREATE TRIGGER journee_comptable_ins BEFORE INSERT ON journee_comptable FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER journee_comptable_upd BEFORE UPDATE ON journee_comptable FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER journee_comptable_del BEFORE DELETE ON journee_comptable FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 10.4 nature_compte – Nature de compte
CREATE TABLE nature_compte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  code varchar(20) NOT NULL,
  libelle varchar(120) NOT NULL,
  tranche_defaut varchar(20) NOT NULL,
  controles jsonb NOT NULL,
  CONSTRAINT nature_compte_uk1 UNIQUE (code)
);
COMMENT ON TABLE nature_compte IS 'Nature de compte. Table unique des natures et de leurs contrôles. [DD 10.4 ; FIN-RG-078.]';
COMMENT ON COLUMN nature_compte.code IS 'Code';
COMMENT ON COLUMN nature_compte.libelle IS 'Libellé';
COMMENT ON COLUMN nature_compte.tranche_defaut IS 'Tranche par défaut';
COMMENT ON COLUMN nature_compte.controles IS 'Contrôles associés';
CREATE TRIGGER nature_compte_ins BEFORE INSERT ON nature_compte FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER nature_compte_upd BEFORE UPDATE ON nature_compte FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER nature_compte_del BEFORE DELETE ON nature_compte FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 10.5 compte – Compte général
CREATE TABLE compte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  numero varchar(8) NOT NULL,
  libelle varchar(200) NOT NULL,
  classe varchar(1) NOT NULL,
  parent_id uuid,
  type varchar(10) NOT NULL,
  nature_id uuid NOT NULL,
  imputable boolean NOT NULL,
  collectif boolean NOT NULL,
  sens_habituel varchar(1) NOT NULL,
  report_a_nouveau varchar(10) NOT NULL,
  lettrable boolean NOT NULL,
  analytique_obligatoire boolean NOT NULL,
  code_taxe_id uuid,
  ligne_etat_bcrg varchar(40) NOT NULL,
  en_sommeil boolean NOT NULL,
  date_effet date NOT NULL,
  CONSTRAINT compte_uk1 UNIQUE (numero)
);
COMMENT ON TABLE compte IS 'Compte général. Compte du plan BCRG. [DD 10.5 ; FIN-RG-001 à 007.]';
COMMENT ON COLUMN compte.numero IS 'Numéro (8 caractères, complété par des zéros)';
COMMENT ON COLUMN compte.libelle IS 'Libellé';
COMMENT ON COLUMN compte.classe IS 'Classe 1 à 7';
COMMENT ON COLUMN compte.parent_id IS 'Compte parent';
COMMENT ON COLUMN compte.type IS 'BILAN ou GESTION';
COMMENT ON COLUMN compte.nature_id IS 'Nature';
COMMENT ON COLUMN compte.imputable IS 'Détail (imputable) ou total';
COMMENT ON COLUMN compte.collectif IS 'Compte collectif';
COMMENT ON COLUMN compte.sens_habituel IS 'D ou C';
COMMENT ON COLUMN compte.report_a_nouveau IS 'AUCUN, SOLDE, DETAIL';
COMMENT ON COLUMN compte.lettrable IS 'Lettrage';
COMMENT ON COLUMN compte.analytique_obligatoire IS 'Analytique obligatoire';
COMMENT ON COLUMN compte.code_taxe_id IS 'Code taxe associé';
COMMENT ON COLUMN compte.ligne_etat_bcrg IS 'Ligne des états BCRG – FIN-RG-004';
COMMENT ON COLUMN compte.en_sommeil IS 'En sommeil';
COMMENT ON COLUMN compte.date_effet IS 'Date d’effet';
CREATE TRIGGER compte_ins BEFORE INSERT ON compte FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER compte_upd BEFORE UPDATE ON compte FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER compte_del BEFORE DELETE ON compte FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 10.6 compte_auxiliaire – Compte auxiliaire (tiers comptable)
CREATE TABLE compte_auxiliaire (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  code varchar(10) NOT NULL,
  tiers_id uuid NOT NULL,
  collectif_id uuid NOT NULL,
  categorie_comptable varchar(40),
  modele_reglement_id uuid,
  statut varchar(20) NOT NULL,
  CONSTRAINT compte_auxiliaire_uk1 UNIQUE (code)
);
COMMENT ON TABLE compte_auxiliaire IS 'Compte auxiliaire (tiers comptable). Compte individuel d’un tiers sous un collectif ; attributs comptables seulement. [DD 10.6 ; FIN-RG-003, 010 à 019.]';
COMMENT ON COLUMN compte_auxiliaire.code IS 'Préfixe du collectif + séquence (10 caractères) – Capacité surveillée, alerte à 90 %';
COMMENT ON COLUMN compte_auxiliaire.tiers_id IS 'Tiers (identité lue dans le référentiel)';
COMMENT ON COLUMN compte_auxiliaire.collectif_id IS 'Compte mère – Imputable et collectif ; non modifiable une fois mouvementé';
COMMENT ON COLUMN compte_auxiliaire.categorie_comptable IS 'Catégorie comptable';
COMMENT ON COLUMN compte_auxiliaire.modele_reglement_id IS 'Conditions de règlement';
COMMENT ON COLUMN compte_auxiliaire.statut IS 'ACTIF, EN_SOMMEIL, BLOQUE';
CREATE TRIGGER compte_auxiliaire_ins BEFORE INSERT ON compte_auxiliaire FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER compte_auxiliaire_upd BEFORE UPDATE ON compte_auxiliaire FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER compte_auxiliaire_del BEFORE DELETE ON compte_auxiliaire FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 10.7 journal – Journal
CREATE TABLE journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  code varchar(6) NOT NULL,
  libelle varchar(120) NOT NULL,
  type type_journal NOT NULL,
  mode varchar(12) NOT NULL,
  compte_tresorerie_id uuid,
  numerotation varchar(30) NOT NULL,
  rapprochement boolean NOT NULL,
  ferme boolean NOT NULL,
  CONSTRAINT journal_uk1 UNIQUE (code)
);
COMMENT ON TABLE journal IS 'Journal. Journal comptable automatique ou manuel. [DD 10.7 ; FIN-RG-030 à 035, § 11.7.]';
COMMENT ON COLUMN journal.code IS 'Code (DEP, EMI, ENC, COM, SAN, SIN, ACH, BQx, CAI, INV, OD, AUT, AN)';
COMMENT ON COLUMN journal.libelle IS 'Libellé';
COMMENT ON COLUMN journal.type IS 'Type';
COMMENT ON COLUMN journal.mode IS 'AUTOMATIQUE ou MANUEL – Un journal manuel ne reçoit aucune écriture générée';
COMMENT ON COLUMN journal.compte_tresorerie_id IS 'Compte de trésorerie';
COMMENT ON COLUMN journal.numerotation IS 'Mode de numérotation (FIN-RG-075)';
COMMENT ON COLUMN journal.rapprochement IS 'Rapprochement bancaire';
COMMENT ON COLUMN journal.ferme IS 'Fermé pour l’avenir';
CREATE TRIGGER journal_ins BEFORE INSERT ON journal FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER journal_upd BEFORE UPDATE ON journal FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER journal_del BEFORE DELETE ON journal FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 10.8 schema_comptable – Schéma comptable
CREATE TABLE schema_comptable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  code_evt varchar(6) NOT NULL,
  type_evenement varchar(60) NOT NULL,
  journal_id uuid NOT NULL,
  libelle_modele varchar(200) NOT NULL,
  actif boolean NOT NULL,
  date_effet date NOT NULL,
  CONSTRAINT schema_comptable_uk1 UNIQUE (code_evt, date_effet)
);
COMMENT ON TABLE schema_comptable IS 'Schéma comptable. Traduction paramétrée d’un événement en écriture. [DD 10.8 ; FIN-RG-020, 021, § 11.13.]';
COMMENT ON COLUMN schema_comptable.code_evt IS 'Code EVT-01 à EVT-26';
COMMENT ON COLUMN schema_comptable.type_evenement IS 'Événement métier déclencheur – Un et un seul schéma par événement financier';
COMMENT ON COLUMN schema_comptable.journal_id IS 'Journal';
COMMENT ON COLUMN schema_comptable.libelle_modele IS 'Libellé avec variables';
COMMENT ON COLUMN schema_comptable.actif IS 'Actif';
COMMENT ON COLUMN schema_comptable.date_effet IS 'Date d’effet';
CREATE TRIGGER schema_comptable_ins BEFORE INSERT ON schema_comptable FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER schema_comptable_upd BEFORE UPDATE ON schema_comptable FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER schema_comptable_del BEFORE DELETE ON schema_comptable FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 10.9 ligne_schema – Ligne de schéma
CREATE TABLE ligne_schema (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  schema_id uuid NOT NULL,
  rang integer NOT NULL,
  compte_id uuid,
  compte_regle varchar(120),
  sens varchar(1) NOT NULL,
  formule_montant varchar(200) NOT NULL,
  axes jsonb
);
COMMENT ON TABLE ligne_schema IS 'Ligne de schéma. Compte, sens et règle de calcul d’une ligne. [DD 10.9 ; FIN-RG-020.]';
COMMENT ON COLUMN ligne_schema.schema_id IS 'Schéma';
COMMENT ON COLUMN ligne_schema.rang IS 'Ordre';
COMMENT ON COLUMN ligne_schema.compte_id IS 'Compte fixe';
COMMENT ON COLUMN ligne_schema.compte_regle IS 'Règle de détermination (auxiliaire du tiers, branche…)';
COMMENT ON COLUMN ligne_schema.sens IS 'D ou C';
COMMENT ON COLUMN ligne_schema.formule_montant IS 'Règle de calcul du montant';
COMMENT ON COLUMN ligne_schema.axes IS 'Axes analytiques alimentés';
CREATE TRIGGER ligne_schema_ins BEFORE INSERT ON ligne_schema FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER ligne_schema_upd BEFORE UPDATE ON ligne_schema FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER ligne_schema_del BEFORE DELETE ON ligne_schema FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 10.10 ecriture – Écriture (pièce)
CREATE TABLE ecriture (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  numero_piece varchar(20) NOT NULL,
  journal_id uuid NOT NULL,
  date_comptable date NOT NULL,
  date_origine date,
  libelle varchar(200) NOT NULL,
  reference varchar(60) NOT NULL,
  origine origine_ecriture NOT NULL,
  evenement_id uuid,
  fiche_imputation_id uuid,
  statut statut_ecriture NOT NULL,
  extourne_de_id uuid,
  piece_justificative_id uuid NOT NULL,
  valide_par uuid,
  valide_le timestamptz,
  scellement_lot_id uuid,
  CONSTRAINT ecriture_uk1 UNIQUE (numero_piece),
  CONSTRAINT ecriture_uk2 UNIQUE (journal_id, date_comptable)
);
COMMENT ON TABLE ecriture IS 'Écriture (pièce). Pièce comptable équilibrée. [DD 10.10 ; FIN-RG-022 à 025, 075, 112.]';
COMMENT ON COLUMN ecriture.numero_piece IS 'Code journal + AAAA + séquence (attribué à la validation)';
COMMENT ON COLUMN ecriture.journal_id IS 'Journal';
COMMENT ON COLUMN ecriture.date_comptable IS 'Date comptable';
COMMENT ON COLUMN ecriture.date_origine IS 'Date d’origine (période clôturée)';
COMMENT ON COLUMN ecriture.libelle IS 'Libellé';
COMMENT ON COLUMN ecriture.reference IS 'Référence';
COMMENT ON COLUMN ecriture.origine IS 'Origine';
COMMENT ON COLUMN ecriture.evenement_id IS 'Événement source';
COMMENT ON COLUMN ecriture.fiche_imputation_id IS 'Fiche d’imputation';
COMMENT ON COLUMN ecriture.statut IS 'Statut – Jamais modifiée après validation ; correction par extourne';
COMMENT ON COLUMN ecriture.extourne_de_id IS 'Pièce extournée';
COMMENT ON COLUMN ecriture.piece_justificative_id IS 'Pièce justificative';
COMMENT ON COLUMN ecriture.valide_par IS 'Valideur (manuelle)';
COMMENT ON COLUMN ecriture.valide_le IS 'Validation';
COMMENT ON COLUMN ecriture.scellement_lot_id IS 'Lot de scellement';
CREATE TRIGGER ecriture_ins BEFORE INSERT ON ecriture FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER ecriture_upd BEFORE UPDATE ON ecriture FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER ecriture_del BEFORE DELETE ON ecriture FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 10.11 ligne_ecriture – Ligne d’écriture
CREATE TABLE ligne_ecriture (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  ecriture_id uuid NOT NULL,
  compte_id uuid NOT NULL,
  compte_auxiliaire_id uuid,
  libelle varchar(200) NOT NULL,
  debit bigint NOT NULL,
  credit bigint NOT NULL,
  echeance date,
  code_taxe_id uuid,
  lettrage_id uuid
);
COMMENT ON TABLE ligne_ecriture IS 'Ligne d’écriture. Ligne débit ou crédit. [DD 10.11 ; FIN-RG-003, 074.]';
COMMENT ON COLUMN ligne_ecriture.ecriture_id IS 'Pièce';
COMMENT ON COLUMN ligne_ecriture.compte_id IS 'Compte général – Imputable et actif';
COMMENT ON COLUMN ligne_ecriture.compte_auxiliaire_id IS 'Compte auxiliaire – Obligatoire sur un collectif';
COMMENT ON COLUMN ligne_ecriture.libelle IS 'Libellé';
COMMENT ON COLUMN ligne_ecriture.debit IS 'Débit (GNF)';
COMMENT ON COLUMN ligne_ecriture.credit IS 'Crédit (GNF)';
COMMENT ON COLUMN ligne_ecriture.echeance IS 'Échéance (comptes de tiers)';
COMMENT ON COLUMN ligne_ecriture.code_taxe_id IS 'Code taxe';
COMMENT ON COLUMN ligne_ecriture.lettrage_id IS 'Lettrage';
CREATE TRIGGER ligne_ecriture_ins BEFORE INSERT ON ligne_ecriture FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER ligne_ecriture_upd BEFORE UPDATE ON ligne_ecriture FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER ligne_ecriture_del BEFORE DELETE ON ligne_ecriture FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 10.12 plan_analytique – Plan analytique
CREATE TABLE plan_analytique (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  code varchar(10) NOT NULL,
  libelle varchar(120) NOT NULL,
  CONSTRAINT plan_analytique_uk1 UNIQUE (code)
);
COMMENT ON TABLE plan_analytique IS 'Plan analytique. Axe analytique (cinq en phase 1). [DD 10.12 ; FIN-RG-080.]';
COMMENT ON COLUMN plan_analytique.code IS 'Code';
COMMENT ON COLUMN plan_analytique.libelle IS 'Produit, Branche BCRG, Bureau direct, Département et service, Prestataire';
CREATE TRIGGER plan_analytique_ins BEFORE INSERT ON plan_analytique FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER plan_analytique_upd BEFORE UPDATE ON plan_analytique FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER plan_analytique_del BEFORE DELETE ON plan_analytique FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 10.13 section – Section analytique
CREATE TABLE section (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  plan_id uuid NOT NULL,
  code varchar(20) NOT NULL,
  libelle varchar(120) NOT NULL,
  parent_id uuid,
  attente boolean NOT NULL,
  CONSTRAINT section_uk1 UNIQUE (plan_id, code)
);
COMMENT ON TABLE section IS 'Section analytique. Section hiérarchisée d’un axe. [DD 10.13 ; FIN-RG-080.]';
COMMENT ON COLUMN section.plan_id IS 'Axe';
COMMENT ON COLUMN section.code IS 'Code';
COMMENT ON COLUMN section.libelle IS 'Libellé';
COMMENT ON COLUMN section.parent_id IS 'Section parente';
COMMENT ON COLUMN section.attente IS 'Section d’attente';
CREATE TRIGGER section_ins BEFORE INSERT ON section FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER section_upd BEFORE UPDATE ON section FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER section_del BEFORE DELETE ON section FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 10.14 ligne_analytique – Ventilation analytique
CREATE TABLE ligne_analytique (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  ligne_ecriture_id uuid NOT NULL,
  section_id uuid NOT NULL,
  montant bigint NOT NULL
);
COMMENT ON TABLE ligne_analytique IS 'Ventilation analytique. Répartition d’une ligne d’écriture. [DD 10.14 ; FIN-RG-081, 082.]';
COMMENT ON COLUMN ligne_analytique.ligne_ecriture_id IS 'Ligne';
COMMENT ON COLUMN ligne_analytique.section_id IS 'Section';
COMMENT ON COLUMN ligne_analytique.montant IS 'Montant – Somme = montant de la ligne';
CREATE TRIGGER ligne_analytique_ins BEFORE INSERT ON ligne_analytique FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER ligne_analytique_upd BEFORE UPDATE ON ligne_analytique FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER ligne_analytique_del BEFORE DELETE ON ligne_analytique FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 10.15 grille_ventilation – Grille de ventilation
CREATE TABLE grille_ventilation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  code varchar(20) NOT NULL,
  repartition jsonb NOT NULL,
  CONSTRAINT grille_ventilation_uk1 UNIQUE (code)
);
COMMENT ON TABLE grille_ventilation IS 'Grille de ventilation. Répartition réutilisable. [DD 10.15 ; FIN-RG-081.]';
COMMENT ON COLUMN grille_ventilation.code IS 'Code';
COMMENT ON COLUMN grille_ventilation.repartition IS 'Sections et pourcentages – Total = 100 %';
CREATE TRIGGER grille_ventilation_ins BEFORE INSERT ON grille_ventilation FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER grille_ventilation_upd BEFORE UPDATE ON grille_ventilation FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER grille_ventilation_del BEFORE DELETE ON grille_ventilation FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 10.16 lettrage – Lettrage
CREATE TABLE lettrage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  code varchar(10) NOT NULL,
  compte_auxiliaire_id uuid NOT NULL,
  type varchar(10) NOT NULL,
  partiel boolean NOT NULL,
  auteur_id uuid,
  delettre_le timestamptz
);
COMMENT ON TABLE lettrage IS 'Lettrage. Rapprochement d’écritures d’un compte de tiers. [DD 10.16 ; FIN-RG-016, 026.]';
COMMENT ON COLUMN lettrage.code IS 'Code de lettrage';
COMMENT ON COLUMN lettrage.compte_auxiliaire_id IS 'Compte';
COMMENT ON COLUMN lettrage.type IS 'AUTOMATIQUE ou MANUEL';
COMMENT ON COLUMN lettrage.partiel IS 'Partiel';
COMMENT ON COLUMN lettrage.auteur_id IS 'Auteur (manuel)';
COMMENT ON COLUMN lettrage.delettre_le IS 'Délettrage (tracé)';
CREATE TRIGGER lettrage_ins BEFORE INSERT ON lettrage FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER lettrage_upd BEFORE UPDATE ON lettrage FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER lettrage_del BEFORE DELETE ON lettrage FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 10.17 code_taxe – Code taxe
CREATE TABLE code_taxe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  code varchar(10) NOT NULL,
  libelle varchar(120) NOT NULL,
  type varchar(30) NOT NULL,
  taux numeric(9,6) NOT NULL,
  assiette varchar(40) NOT NULL,
  regime varchar(30),
  pourcentage_recuperable numeric(9,6),
  compte_id uuid NOT NULL,
  exigibilite varchar(20) NOT NULL,
  type_tiers varchar(30),
  date_effet date NOT NULL
);
COMMENT ON TABLE code_taxe IS 'Code taxe. Taxes sur primes, retenues, taxes sur achats. [DD 10.17 ; FIN-RG-090, 034, 095.]';
COMMENT ON COLUMN code_taxe.code IS 'Code';
COMMENT ON COLUMN code_taxe.libelle IS 'Libellé';
COMMENT ON COLUMN code_taxe.type IS 'TAXE_PRIMES, COLLECTEE, DEDUCTIBLE, RETENUE_SOURCE';
COMMENT ON COLUMN code_taxe.taux IS 'Taux (saisi par la Compagnie)';
COMMENT ON COLUMN code_taxe.assiette IS 'Assiette';
COMMENT ON COLUMN code_taxe.regime IS 'NON_RECUPERABLE, RECUPERABLE, PARTIEL';
COMMENT ON COLUMN code_taxe.pourcentage_recuperable IS 'Part récupérable';
COMMENT ON COLUMN code_taxe.compte_id IS 'Compte de taxe';
COMMENT ON COLUMN code_taxe.exigibilite IS 'EMISSION ou ENCAISSEMENT';
COMMENT ON COLUMN code_taxe.type_tiers IS 'Type de tiers (retenue à la source)';
COMMENT ON COLUMN code_taxe.date_effet IS 'Date d’effet';
CREATE TRIGGER code_taxe_ins BEFORE INSERT ON code_taxe FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER code_taxe_upd BEFORE UPDATE ON code_taxe FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER code_taxe_del BEFORE DELETE ON code_taxe FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 10.18 declaration_taxe – Déclaration de taxe
CREATE TABLE declaration_taxe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  numero varchar(16) NOT NULL,
  code_taxe_id uuid NOT NULL,
  periode varchar(7) NOT NULL,
  assiette bigint NOT NULL,
  montant_collecte bigint NOT NULL,
  montant_recuperable bigint NOT NULL,
  solde bigint NOT NULL,
  statut varchar(20) NOT NULL,
  reference_depot varchar(60),
  ecriture_id uuid,
  document_id uuid,
  CONSTRAINT declaration_taxe_uk1 UNIQUE (numero)
);
COMMENT ON TABLE declaration_taxe IS 'Déclaration de taxe. Déclaration périodique préparée puis validée. [DD 10.18 ; FIN-RG-092 à 094.]';
COMMENT ON COLUMN declaration_taxe.numero IS 'Code taxe + AAAAMM';
COMMENT ON COLUMN declaration_taxe.code_taxe_id IS 'Taxe';
COMMENT ON COLUMN declaration_taxe.periode IS 'Période';
COMMENT ON COLUMN declaration_taxe.assiette IS 'Assiette';
COMMENT ON COLUMN declaration_taxe.montant_collecte IS 'Collecté';
COMMENT ON COLUMN declaration_taxe.montant_recuperable IS 'Récupérable';
COMMENT ON COLUMN declaration_taxe.solde IS 'Solde à payer ou crédit – Égal au solde des comptes de taxe';
COMMENT ON COLUMN declaration_taxe.statut IS 'PREPAREE, VALIDEE, DEPOSEE, PAYEE';
COMMENT ON COLUMN declaration_taxe.reference_depot IS 'Référence de dépôt';
COMMENT ON COLUMN declaration_taxe.ecriture_id IS 'EVT-14';
COMMENT ON COLUMN declaration_taxe.document_id IS 'PDF archivé';
CREATE TRIGGER declaration_taxe_ins BEFORE INSERT ON declaration_taxe FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER declaration_taxe_upd BEFORE UPDATE ON declaration_taxe FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER declaration_taxe_del BEFORE DELETE ON declaration_taxe FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 10.19 modele_reglement – Modèle de règlement
CREATE TABLE modele_reglement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  code varchar(10) NOT NULL,
  mode varchar(30) NOT NULL,
  condition varchar(40) NOT NULL,
  CONSTRAINT modele_reglement_uk1 UNIQUE (code)
);
COMMENT ON TABLE modele_reglement IS 'Modèle de règlement. Mode et condition de paiement. [DD 10.19 ; FIN-RG-101.]';
COMMENT ON COLUMN modele_reglement.code IS 'Code';
COMMENT ON COLUMN modele_reglement.mode IS 'Virement, chèque, espèces, monnaie électronique';
COMMENT ON COLUMN modele_reglement.condition IS 'Comptant, X jours, X jours fin de mois, jour J';
CREATE TRIGGER modele_reglement_ins BEFORE INSERT ON modele_reglement FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER modele_reglement_upd BEFORE UPDATE ON modele_reglement FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER modele_reglement_del BEFORE DELETE ON modele_reglement FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 10.20 modele_ecriture – Modèle de saisie
CREATE TABLE modele_ecriture (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  code varchar(20) NOT NULL,
  libelle varchar(120) NOT NULL,
  lignes jsonb NOT NULL,
  CONSTRAINT modele_ecriture_uk1 UNIQUE (code)
);
COMMENT ON TABLE modele_ecriture IS 'Modèle de saisie. Écriture type pour la fiche d’imputation. [DD 10.20 ; FIN-RG-100.]';
COMMENT ON COLUMN modele_ecriture.code IS 'Code';
COMMENT ON COLUMN modele_ecriture.libelle IS 'Libellé';
COMMENT ON COLUMN modele_ecriture.lignes IS 'Comptes, sens, formules, taxe, analytique';
CREATE TRIGGER modele_ecriture_ins BEFORE INSERT ON modele_ecriture FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER modele_ecriture_upd BEFORE UPDATE ON modele_ecriture FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER modele_ecriture_del BEFORE DELETE ON modele_ecriture FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 10.21 fiche_imputation – Fiche d’imputation
CREATE TABLE fiche_imputation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  numero_provisoire varchar(12) NOT NULL,
  journal_id uuid NOT NULL,
  modele_id uuid,
  tiers_id uuid,
  reference varchar(60) NOT NULL,
  piece_document_id uuid NOT NULL,
  lignes jsonb NOT NULL,
  etabli_par uuid NOT NULL,
  verifie_par uuid,
  approuve_par uuid,
  ecriture_id uuid,
  CONSTRAINT fiche_imputation_uk1 UNIQUE (numero_provisoire)
);
COMMENT ON TABLE fiche_imputation IS 'Fiche d’imputation. Mode principal de saisie manuelle, achats compris. [DD 10.21 ; FIN-RG-033, 110, 116.]';
COMMENT ON COLUMN fiche_imputation.numero_provisoire IS 'FI + AAAA + 6 chiffres';
COMMENT ON COLUMN fiche_imputation.journal_id IS 'Journal manuel';
COMMENT ON COLUMN fiche_imputation.modele_id IS 'Modèle';
COMMENT ON COLUMN fiche_imputation.tiers_id IS 'Tiers';
COMMENT ON COLUMN fiche_imputation.reference IS 'Référence';
COMMENT ON COLUMN fiche_imputation.piece_document_id IS 'Pièce jointe obligatoire';
COMMENT ON COLUMN fiche_imputation.lignes IS 'Lignes (compte, libellé, analytique, débit, crédit, taxe, échéance)';
COMMENT ON COLUMN fiche_imputation.etabli_par IS 'Établi par';
COMMENT ON COLUMN fiche_imputation.verifie_par IS 'Vérifié par';
COMMENT ON COLUMN fiche_imputation.approuve_par IS 'Approuvé par – Visas électroniques';
COMMENT ON COLUMN fiche_imputation.ecriture_id IS 'Écriture validée';
CREATE TRIGGER fiche_imputation_ins BEFORE INSERT ON fiche_imputation FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER fiche_imputation_upd BEFORE UPDATE ON fiche_imputation FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER fiche_imputation_del BEFORE DELETE ON fiche_imputation FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 10.22 banque_operateur – Banque ou opérateur
CREATE TABLE banque_operateur (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  code varchar(10) NOT NULL,
  nom varchar(120) NOT NULL,
  compte_id uuid NOT NULL,
  journal_id uuid NOT NULL,
  format_virement varchar(40),
  format_releve varchar(40),
  responsable_id uuid NOT NULL,
  CONSTRAINT banque_operateur_uk1 UNIQUE (code)
);
COMMENT ON TABLE banque_operateur IS 'Banque ou opérateur. Banques et opérateurs de monnaie électronique de la Compagnie. [DD 10.22 ; FIN-RG-103.]';
COMMENT ON COLUMN banque_operateur.code IS 'Code';
COMMENT ON COLUMN banque_operateur.nom IS 'Nom';
COMMENT ON COLUMN banque_operateur.compte_id IS 'Compte de trésorerie';
COMMENT ON COLUMN banque_operateur.journal_id IS 'Journal';
COMMENT ON COLUMN banque_operateur.format_virement IS 'Format des fichiers de virements';
COMMENT ON COLUMN banque_operateur.format_releve IS 'Format d’import des relevés';
COMMENT ON COLUMN banque_operateur.responsable_id IS 'Responsable';
CREATE TRIGGER banque_operateur_ins BEFORE INSERT ON banque_operateur FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER banque_operateur_upd BEFORE UPDATE ON banque_operateur FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER banque_operateur_del BEFORE DELETE ON banque_operateur FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 10.23 releve_ligne – Ligne de relevé importée
CREATE TABLE releve_ligne (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  banque_operateur_id uuid NOT NULL,
  date_operation date NOT NULL,
  libelle varchar(200) NOT NULL,
  montant bigint NOT NULL,
  reference varchar(80),
  ligne_ecriture_id uuid,
  statut varchar(20) NOT NULL
);
COMMENT ON TABLE releve_ligne IS 'Ligne de relevé importée. Opération bancaire ou d’opérateur à rapprocher. [DD 10.23 ; FIN-RG-042, 043.]';
COMMENT ON COLUMN releve_ligne.banque_operateur_id IS 'Banque';
COMMENT ON COLUMN releve_ligne.date_operation IS 'Date';
COMMENT ON COLUMN releve_ligne.libelle IS 'Libellé';
COMMENT ON COLUMN releve_ligne.montant IS 'Montant (signé)';
COMMENT ON COLUMN releve_ligne.reference IS 'Référence';
COMMENT ON COLUMN releve_ligne.ligne_ecriture_id IS 'Écriture rapprochée';
COMMENT ON COLUMN releve_ligne.statut IS 'A_RAPPROCHER, RAPPROCHEE, ECART';
CREATE TRIGGER releve_ligne_ins BEFORE INSERT ON releve_ligne FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER releve_ligne_upd BEFORE UPDATE ON releve_ligne FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER releve_ligne_del BEFORE DELETE ON releve_ligne FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 10.24 ordre_paiement – Ordre de paiement
CREATE TABLE ordre_paiement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  numero varchar(14) NOT NULL,
  type varchar(30) NOT NULL,
  beneficiaire_tiers_id uuid NOT NULL,
  coordonnee_paiement_id uuid NOT NULL,
  montant bigint NOT NULL,
  objet_type varchar(60) NOT NULL,
  objet_id uuid NOT NULL,
  demande_validation_id uuid NOT NULL,
  lot_paiement_id uuid,
  statut statut_ordre_paiement NOT NULL,
  execute_par uuid,
  execute_le timestamptz,
  ecriture_id uuid,
  avis_document_id uuid,
  CONSTRAINT ordre_paiement_uk1 UNIQUE (numero)
);
COMMENT ON TABLE ordre_paiement IS 'Ordre de paiement. Chaîne liquidation → exécution de toute sortie d’argent. [DD 10.24 ; FIN-RG-050 à 053.]';
COMMENT ON COLUMN ordre_paiement.numero IS 'Numéro';
COMMENT ON COLUMN ordre_paiement.type IS 'PRESTATAIRE, INDEMNITE, COMMISSION, REMBOURSEMENT_DEPOT, FOURNISSEUR, TAXE, RISTOURNE, VERSEMENT';
COMMENT ON COLUMN ordre_paiement.beneficiaire_tiers_id IS 'Bénéficiaire';
COMMENT ON COLUMN ordre_paiement.coordonnee_paiement_id IS 'Coordonnées vérifiées';
COMMENT ON COLUMN ordre_paiement.montant IS 'Montant';
COMMENT ON COLUMN ordre_paiement.objet_type IS 'Objet payé';
COMMENT ON COLUMN ordre_paiement.objet_id IS 'Identifiant';
COMMENT ON COLUMN ordre_paiement.demande_validation_id IS 'Validation';
COMMENT ON COLUMN ordre_paiement.lot_paiement_id IS 'Lot';
COMMENT ON COLUMN ordre_paiement.statut IS 'Statut';
COMMENT ON COLUMN ordre_paiement.execute_par IS 'Trésorier';
COMMENT ON COLUMN ordre_paiement.execute_le IS 'Exécution';
COMMENT ON COLUMN ordre_paiement.ecriture_id IS 'Écriture';
COMMENT ON COLUMN ordre_paiement.avis_document_id IS 'Avis de paiement';
CREATE TRIGGER ordre_paiement_ins BEFORE INSERT ON ordre_paiement FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER ordre_paiement_upd BEFORE UPDATE ON ordre_paiement FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER ordre_paiement_del BEFORE DELETE ON ordre_paiement FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 10.25 lot_paiement – Lot de paiement
CREATE TABLE lot_paiement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  numero varchar(14) NOT NULL,
  banque_operateur_id uuid NOT NULL,
  nombre integer NOT NULL,
  total bigint NOT NULL,
  fichier_document_id uuid,
  CONSTRAINT lot_paiement_uk1 UNIQUE (numero)
);
COMMENT ON TABLE lot_paiement IS 'Lot de paiement. Fichier de virements ou paiement de masse. [DD 10.25 ; FIN-RG-052.]';
COMMENT ON COLUMN lot_paiement.numero IS 'Numéro';
COMMENT ON COLUMN lot_paiement.banque_operateur_id IS 'Banque ou opérateur';
COMMENT ON COLUMN lot_paiement.nombre IS 'Nombre d’ordres';
COMMENT ON COLUMN lot_paiement.total IS 'Total';
COMMENT ON COLUMN lot_paiement.fichier_document_id IS 'Fichier généré';
CREATE TRIGGER lot_paiement_ins BEFORE INSERT ON lot_paiement FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER lot_paiement_upd BEFORE UPDATE ON lot_paiement FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER lot_paiement_del BEFORE DELETE ON lot_paiement FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 10.26 provision_calcul – Calcul de provision technique
CREATE TABLE provision_calcul (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  periode_id uuid NOT NULL,
  type varchar(10) NOT NULL,
  composante varchar(40) NOT NULL,
  objet_type varchar(60),
  objet_id uuid,
  montant bigint NOT NULL,
  ecriture_id uuid
);
COMMENT ON TABLE provision_calcul IS 'Calcul de provision technique. Provision calculée à chaque clôture. [DD 10.26 ; FIN-RG-060 à 063.]';
COMMENT ON COLUMN provision_calcul.periode_id IS 'Période';
COMMENT ON COLUMN provision_calcul.type IS 'PPNA ou PSAP';
COMMENT ON COLUMN provision_calcul.composante IS 'Police, prestations, factures soumises, dossiers, IBNR';
COMMENT ON COLUMN provision_calcul.objet_type IS 'Objet';
COMMENT ON COLUMN provision_calcul.objet_id IS 'Identifiant';
COMMENT ON COLUMN provision_calcul.montant IS 'Montant';
COMMENT ON COLUMN provision_calcul.ecriture_id IS 'EVT-13';
CREATE TRIGGER provision_calcul_ins BEFORE INSERT ON provision_calcul FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER provision_calcul_upd BEFORE UPDATE ON provision_calcul FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER provision_calcul_del BEFORE DELETE ON provision_calcul FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 10.27 scellement_lot – Lot de scellement (journal : ajout seul)
CREATE TABLE scellement_lot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  horodatage timestamptz NOT NULL,
  premiere_ecriture_id uuid NOT NULL,
  derniere_ecriture_id uuid NOT NULL,
  empreinte varchar(128) NOT NULL,
  empreinte_precedente varchar(128) NOT NULL
);
COMMENT ON TABLE scellement_lot IS 'Lot de scellement. Scellement différé des écritures. [DD 10.27 ; FIN-RG-023.]';
COMMENT ON COLUMN scellement_lot.horodatage IS 'Scellement';
COMMENT ON COLUMN scellement_lot.premiere_ecriture_id IS 'Première pièce';
COMMENT ON COLUMN scellement_lot.derniere_ecriture_id IS 'Dernière pièce';
COMMENT ON COLUMN scellement_lot.empreinte IS 'Empreinte du lot';
COMMENT ON COLUMN scellement_lot.empreinte_precedente IS 'Empreinte du lot précédent';
CREATE TRIGGER scellement_lot_ins BEFORE INSERT ON scellement_lot FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER scellement_lot_journal BEFORE UPDATE OR DELETE ON scellement_lot FOR EACH ROW EXECUTE FUNCTION interdire_modification_journal();

-- 10.28 categorie_immobilisation – Catégorie d’immobilisation
CREATE TABLE categorie_immobilisation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  code varchar(10) NOT NULL,
  libelle varchar(120) NOT NULL,
  compte_immo_id uuid NOT NULL,
  compte_amort_id uuid,
  compte_dotation_id uuid,
  duree_annees integer,
  taux_affiche numeric(9,6),
  faible_valeur_autorisee boolean NOT NULL,
  date_effet date NOT NULL,
  CONSTRAINT categorie_immobilisation_uk1 UNIQUE (code)
);
COMMENT ON TABLE categorie_immobilisation IS 'Catégorie d’immobilisation. Comptes, durée et taux par catégorie. [DD 10.28 ; § 11.19, FIN-RG-140.]';
COMMENT ON COLUMN categorie_immobilisation.code IS 'Code';
COMMENT ON COLUMN categorie_immobilisation.libelle IS 'Libellé';
COMMENT ON COLUMN categorie_immobilisation.compte_immo_id IS 'Compte d’immobilisation';
COMMENT ON COLUMN categorie_immobilisation.compte_amort_id IS 'Compte d’amortissement';
COMMENT ON COLUMN categorie_immobilisation.compte_dotation_id IS 'Compte de dotation';
COMMENT ON COLUMN categorie_immobilisation.duree_annees IS 'Durée';
COMMENT ON COLUMN categorie_immobilisation.taux_affiche IS 'Taux (expression de la durée)';
COMMENT ON COLUMN categorie_immobilisation.faible_valeur_autorisee IS 'Passage en charge possible (art. 101-VIII)';
COMMENT ON COLUMN categorie_immobilisation.date_effet IS 'Date d’effet';
CREATE TRIGGER categorie_immobilisation_ins BEFORE INSERT ON categorie_immobilisation FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER categorie_immobilisation_upd BEFORE UPDATE ON categorie_immobilisation FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER categorie_immobilisation_del BEFORE DELETE ON categorie_immobilisation FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 10.29 immobilisation – Immobilisation
CREATE TABLE immobilisation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  numero_inventaire varchar(14) NOT NULL,
  designation varchar(200) NOT NULL,
  categorie_id uuid NOT NULL,
  fournisseur_tiers_id uuid,
  fiche_imputation_id uuid,
  date_acquisition date NOT NULL,
  date_mise_en_service date,
  valeur_origine bigint NOT NULL,
  localisation jsonb NOT NULL,
  responsable_id uuid,
  duree_annees integer NOT NULL,
  statut statut_immobilisation NOT NULL,
  cumul_amortissements bigint NOT NULL,
  usage_domestique boolean NOT NULL,
  CONSTRAINT immobilisation_uk1 UNIQUE (numero_inventaire)
);
COMMENT ON TABLE immobilisation IS 'Immobilisation. Fiche du registre des immobilisations. [DD 10.29 ; FIN-RG-140 à 149.]';
COMMENT ON COLUMN immobilisation.numero_inventaire IS 'IMM + AAAA + 6 chiffres';
COMMENT ON COLUMN immobilisation.designation IS 'Désignation';
COMMENT ON COLUMN immobilisation.categorie_id IS 'Catégorie';
COMMENT ON COLUMN immobilisation.fournisseur_tiers_id IS 'Fournisseur';
COMMENT ON COLUMN immobilisation.fiche_imputation_id IS 'Facture d’origine (création automatique)';
COMMENT ON COLUMN immobilisation.date_acquisition IS 'Acquisition';
COMMENT ON COLUMN immobilisation.date_mise_en_service IS 'Mise en service';
COMMENT ON COLUMN immobilisation.valeur_origine IS 'Valeur d’origine (taxe non récupérable incluse)';
COMMENT ON COLUMN immobilisation.localisation IS 'Département, service, bureau';
COMMENT ON COLUMN immobilisation.responsable_id IS 'Responsable';
COMMENT ON COLUMN immobilisation.duree_annees IS 'Durée';
COMMENT ON COLUMN immobilisation.statut IS 'Statut';
COMMENT ON COLUMN immobilisation.cumul_amortissements IS 'Cumul – ≤ valeur d’origine';
COMMENT ON COLUMN immobilisation.usage_domestique IS 'Usage domestique (état fiscal)';
CREATE TRIGGER immobilisation_ins BEFORE INSERT ON immobilisation FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER immobilisation_upd BEFORE UPDATE ON immobilisation FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER immobilisation_del BEFORE DELETE ON immobilisation FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 10.30 plan_amortissement – Plan d’amortissement
CREATE TABLE plan_amortissement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  immobilisation_id uuid NOT NULL,
  exercice_id uuid NOT NULL,
  dotation bigint NOT NULL,
  non_deductible bigint NOT NULL,
  ecriture_id uuid
);
COMMENT ON TABLE plan_amortissement IS 'Plan d’amortissement. Annuités calculées sur la durée. [DD 10.30 ; FIN-RG-142, 143.]';
COMMENT ON COLUMN plan_amortissement.immobilisation_id IS 'Bien';
COMMENT ON COLUMN plan_amortissement.exercice_id IS 'Exercice';
COMMENT ON COLUMN plan_amortissement.dotation IS 'Dotation (valeur ÷ durée, prorata jours réels)';
COMMENT ON COLUMN plan_amortissement.non_deductible IS 'Part non déductible (état fiscal)';
COMMENT ON COLUMN plan_amortissement.ecriture_id IS 'EVT-17';
CREATE TRIGGER plan_amortissement_ins BEFORE INSERT ON plan_amortissement FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER plan_amortissement_upd BEFORE UPDATE ON plan_amortissement FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER plan_amortissement_del BEFORE DELETE ON plan_amortissement FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 10.31 mouvement_immobilisation – Mouvement d’immobilisation
CREATE TABLE mouvement_immobilisation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  immobilisation_id uuid,
  type varchar(30) NOT NULL,
  date date NOT NULL,
  montant bigint,
  motif varchar(300) NOT NULL,
  biens_remplaces jsonb,
  demande_validation_id uuid,
  ecriture_id uuid
);
COMMENT ON TABLE mouvement_immobilisation IS 'Mouvement d’immobilisation. Transfert, révision, dépréciation, cession, rebut, passage en charge. [DD 10.31 ; FIN-RG-146 à 148.]';
COMMENT ON COLUMN mouvement_immobilisation.immobilisation_id IS 'Bien';
COMMENT ON COLUMN mouvement_immobilisation.type IS 'TRANSFERT, REVISION, DEPRECIATION, CESSION, REBUT, PASSAGE_EN_CHARGE';
COMMENT ON COLUMN mouvement_immobilisation.date IS 'Date';
COMMENT ON COLUMN mouvement_immobilisation.montant IS 'Prix de cession ou montant';
COMMENT ON COLUMN mouvement_immobilisation.motif IS 'Motif (obligatoire pour un passage en charge)';
COMMENT ON COLUMN mouvement_immobilisation.biens_remplaces IS 'Biens remplacés (mobilier)';
COMMENT ON COLUMN mouvement_immobilisation.demande_validation_id IS 'Validation';
COMMENT ON COLUMN mouvement_immobilisation.ecriture_id IS 'EVT-18';
CREATE TRIGGER mouvement_immobilisation_ins BEFORE INSERT ON mouvement_immobilisation FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER mouvement_immobilisation_upd BEFORE UPDATE ON mouvement_immobilisation FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER mouvement_immobilisation_del BEFORE DELETE ON mouvement_immobilisation FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 10.32 correspondance_etat – Correspondance comptes ↔ états BCRG
CREATE TABLE correspondance_etat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  etat varchar(40) NOT NULL,
  rubrique varchar(60) NOT NULL,
  comptes varchar(200) NOT NULL,
  signe varchar(1) NOT NULL
);
COMMENT ON TABLE correspondance_etat IS 'Correspondance comptes ↔ états BCRG. Table d’agrégation des états réglementaires. [DD 10.32 ; FIN-RG-004, ETA-RG-001, 002.]';
COMMENT ON COLUMN correspondance_etat.etat IS 'État (bilan, compte de résultat, annexes)';
COMMENT ON COLUMN correspondance_etat.rubrique IS 'Rubrique';
COMMENT ON COLUMN correspondance_etat.comptes IS 'Comptes ou tranches';
COMMENT ON COLUMN correspondance_etat.signe IS '+ ou –';
CREATE TRIGGER correspondance_etat_ins BEFORE INSERT ON correspondance_etat FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER correspondance_etat_upd BEFORE UPDATE ON correspondance_etat FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER correspondance_etat_del BEFORE DELETE ON correspondance_etat FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 11.1 dossier_vigilance – Dossier de vigilance
CREATE TABLE dossier_vigilance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  tiers_id uuid NOT NULL,
  niveau varchar(20) NOT NULL,
  motif varchar(200) NOT NULL,
  origine_fonds text,
  declaration_preuve_id uuid,
  valide_par uuid
);
COMMENT ON TABLE dossier_vigilance IS 'Dossier de vigilance. Niveau de vigilance d’un tiers. [DD 11.1 ; CONF-RG-001, 002.]';
COMMENT ON COLUMN dossier_vigilance.tiers_id IS 'Tiers';
COMMENT ON COLUMN dossier_vigilance.niveau IS 'SIMPLIFIEE ou RENFORCEE';
COMMENT ON COLUMN dossier_vigilance.motif IS 'Seuil, PPE, mode de paiement';
COMMENT ON COLUMN dossier_vigilance.origine_fonds IS 'Origine des fonds déclarée';
COMMENT ON COLUMN dossier_vigilance.declaration_preuve_id IS 'Déclaration validée par code';
COMMENT ON COLUMN dossier_vigilance.valide_par IS 'Responsable conformité';
CREATE TRIGGER dossier_vigilance_ins BEFORE INSERT ON dossier_vigilance FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER dossier_vigilance_upd BEFORE UPDATE ON dossier_vigilance FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER dossier_vigilance_del BEFORE DELETE ON dossier_vigilance FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 11.2 liste_sanctions – Liste de sanctions
CREATE TABLE liste_sanctions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  source varchar(60) NOT NULL,
  nom varchar(200) NOT NULL,
  date_naissance date,
  identifiants jsonb,
  importe_le timestamptz NOT NULL
);
COMMENT ON TABLE liste_sanctions IS 'Liste de sanctions. Entrées des listes importées. [DD 11.2 ; CONF-RG-003.]';
COMMENT ON COLUMN liste_sanctions.source IS 'Liste source';
COMMENT ON COLUMN liste_sanctions.nom IS 'Nom';
COMMENT ON COLUMN liste_sanctions.date_naissance IS 'Date de naissance';
COMMENT ON COLUMN liste_sanctions.identifiants IS 'Identifiants';
COMMENT ON COLUMN liste_sanctions.importe_le IS 'Import';
CREATE TRIGGER liste_sanctions_ins BEFORE INSERT ON liste_sanctions FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER liste_sanctions_upd BEFORE UPDATE ON liste_sanctions FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER liste_sanctions_del BEFORE DELETE ON liste_sanctions FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 11.3 criblage – Résultat de criblage
CREATE TABLE criblage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  tiers_id uuid NOT NULL,
  liste_sanctions_id uuid NOT NULL,
  score numeric(5,2) NOT NULL,
  statut varchar(20) NOT NULL,
  decide_par uuid,
  decision_motif text
);
COMMENT ON TABLE criblage IS 'Résultat de criblage. Correspondance potentielle d’un tiers. [DD 11.3 ; CONF-RG-003.]';
COMMENT ON COLUMN criblage.tiers_id IS 'Tiers';
COMMENT ON COLUMN criblage.liste_sanctions_id IS 'Entrée';
COMMENT ON COLUMN criblage.score IS 'Score';
COMMENT ON COLUMN criblage.statut IS 'A_EXAMINER, FAUX_POSITIF, CONFIRME';
COMMENT ON COLUMN criblage.decide_par IS 'Conformité';
COMMENT ON COLUMN criblage.decision_motif IS 'Motif – Opérations financières suspendues jusqu’à décision';
CREATE TRIGGER criblage_ins BEFORE INSERT ON criblage FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER criblage_upd BEFORE UPDATE ON criblage FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER criblage_del BEFORE DELETE ON criblage FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 11.4 alerte_conformite – Alerte de conformité
CREATE TABLE alerte_conformite (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  type varchar(40) NOT NULL,
  objet_type varchar(60) NOT NULL,
  objet_id uuid NOT NULL,
  gravite varchar(10) NOT NULL,
  statut varchar(20) NOT NULL,
  decision text,
  traite_par uuid
);
COMMENT ON TABLE alerte_conformite IS 'Alerte de conformité. Alerte automatique. [DD 11.4 ; CONF-RG-004, COM-RG-014, SAN-RG-092.]';
COMMENT ON COLUMN alerte_conformite.type IS 'Approvisionnement, fractionnement, coordonnées, consommation, sinistre précoce, fraude carte, accident';
COMMENT ON COLUMN alerte_conformite.objet_type IS 'Objet';
COMMENT ON COLUMN alerte_conformite.objet_id IS 'Identifiant';
COMMENT ON COLUMN alerte_conformite.gravite IS 'FAIBLE, MOYENNE, FORTE';
COMMENT ON COLUMN alerte_conformite.statut IS 'OUVERTE, EN_EXAMEN, CLOSE';
COMMENT ON COLUMN alerte_conformite.decision IS 'Décision tracée';
COMMENT ON COLUMN alerte_conformite.traite_par IS 'Auteur';
CREATE TRIGGER alerte_conformite_ins BEFORE INSERT ON alerte_conformite FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER alerte_conformite_upd BEFORE UPDATE ON alerte_conformite FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER alerte_conformite_del BEFORE DELETE ON alerte_conformite FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 11.5 declaration_soupcon – Déclaration de soupçon (journal : ajout seul)
CREATE TABLE declaration_soupcon (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  tiers_id uuid NOT NULL,
  contenu bytea NOT NULL,
  transmise_le date,
  auteur_id uuid NOT NULL
);
COMMENT ON TABLE declaration_soupcon IS 'Déclaration de soupçon. Accès restreint au responsable conformité et à son suppléant. [DD 11.5 ; CONF-RG-005.]';
COMMENT ON COLUMN declaration_soupcon.tiers_id IS 'Tiers concerné';
COMMENT ON COLUMN declaration_soupcon.contenu IS 'Contenu (chiffré)';
COMMENT ON COLUMN declaration_soupcon.transmise_le IS 'Transmission à la cellule de renseignement financier';
COMMENT ON COLUMN declaration_soupcon.auteur_id IS 'Responsable conformité';
CREATE TRIGGER declaration_soupcon_ins BEFORE INSERT ON declaration_soupcon FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER declaration_soupcon_journal BEFORE UPDATE OR DELETE ON declaration_soupcon FOR EACH ROW EXECUTE FUNCTION interdire_modification_journal();

-- 11.6 consentement_donnees – Consentement au traitement des données
CREATE TABLE consentement_donnees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  tiers_id uuid NOT NULL,
  type varchar(30) NOT NULL,
  preuve_id uuid NOT NULL,
  donne_le timestamptz NOT NULL,
  retire_le timestamptz
);
COMMENT ON TABLE consentement_donnees IS 'Consentement au traitement des données. Consentement général et données de santé. [DD 11.6 ; CONF-RG-006.]';
COMMENT ON COLUMN consentement_donnees.tiers_id IS 'Personne';
COMMENT ON COLUMN consentement_donnees.type IS 'DONNEES_PERSONNELLES ou DONNEES_SANTE';
COMMENT ON COLUMN consentement_donnees.preuve_id IS 'Preuve';
COMMENT ON COLUMN consentement_donnees.donne_le IS 'Date';
COMMENT ON COLUMN consentement_donnees.retire_le IS 'Retrait';
CREATE TRIGGER consentement_donnees_ins BEFORE INSERT ON consentement_donnees FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER consentement_donnees_upd BEFORE UPDATE ON consentement_donnees FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER consentement_donnees_del BEFORE DELETE ON consentement_donnees FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 11.7 demande_droit – Demande d’exercice de droits
CREATE TABLE demande_droit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  tiers_id uuid NOT NULL,
  droit varchar(20) NOT NULL,
  reclamation_id uuid NOT NULL,
  reponse text,
  donnees_conservees_motif varchar(300)
);
COMMENT ON TABLE demande_droit IS 'Demande d’exercice de droits. Accès, rectification, opposition, limitation, effacement. [DD 11.7 ; CONF-RG-006, CA-CONF-04.]';
COMMENT ON COLUMN demande_droit.tiers_id IS 'Personne';
COMMENT ON COLUMN demande_droit.droit IS 'ACCES, RECTIFICATION, OPPOSITION, LIMITATION, EFFACEMENT';
COMMENT ON COLUMN demande_droit.reclamation_id IS 'Traitement via le module des réclamations';
COMMENT ON COLUMN demande_droit.reponse IS 'Réponse motivée';
COMMENT ON COLUMN demande_droit.donnees_conservees_motif IS 'Données conservées au titre d’une obligation légale';
CREATE TRIGGER demande_droit_ins BEFORE INSERT ON demande_droit FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER demande_droit_upd BEFORE UPDATE ON demande_droit FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER demande_droit_del BEFORE DELETE ON demande_droit FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 11.8 registre_traitement – Registre des traitements
CREATE TABLE registre_traitement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  traitement varchar(200) NOT NULL,
  finalite text NOT NULL,
  categories_donnees text NOT NULL,
  destinataires text NOT NULL,
  transfert_hors_guinee boolean NOT NULL,
  transfert_valide_par uuid,
  duree_conservation varchar(60) NOT NULL
);
COMMENT ON TABLE registre_traitement IS 'Registre des traitements. Registre tenu par la Conformité. [DD 11.8 ; CONF-RG-008.]';
COMMENT ON COLUMN registre_traitement.traitement IS 'Traitement';
COMMENT ON COLUMN registre_traitement.finalite IS 'Finalité';
COMMENT ON COLUMN registre_traitement.categories_donnees IS 'Catégories de données';
COMMENT ON COLUMN registre_traitement.destinataires IS 'Destinataires';
COMMENT ON COLUMN registre_traitement.transfert_hors_guinee IS 'Transfert hors de Guinée';
COMMENT ON COLUMN registre_traitement.transfert_valide_par IS 'Validation écrite de la Conformité';
COMMENT ON COLUMN registre_traitement.duree_conservation IS 'Durée de conservation';
CREATE TRIGGER registre_traitement_ins BEFORE INSERT ON registre_traitement FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER registre_traitement_upd BEFORE UPDATE ON registre_traitement FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER registre_traitement_del BEFORE DELETE ON registre_traitement FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 11.9 violation_donnees – Violation de données
CREATE TABLE violation_donnees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  detectee_le timestamptz NOT NULL,
  description text NOT NULL,
  personnes_concernees integer,
  notifiee_le timestamptz,
  mesures text
);
COMMENT ON TABLE violation_donnees IS 'Violation de données. Incident de sécurité touchant des données personnelles. [DD 11.9 ; CONF-RG-008.]';
COMMENT ON COLUMN violation_donnees.detectee_le IS 'Détection';
COMMENT ON COLUMN violation_donnees.description IS 'Description';
COMMENT ON COLUMN violation_donnees.personnes_concernees IS 'Nombre de personnes';
COMMENT ON COLUMN violation_donnees.notifiee_le IS 'Notification à l’autorité';
COMMENT ON COLUMN violation_donnees.mesures IS 'Mesures prises';
CREATE TRIGGER violation_donnees_ins BEFORE INSERT ON violation_donnees FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER violation_donnees_upd BEFORE UPDATE ON violation_donnees FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER violation_donnees_del BEFORE DELETE ON violation_donnees FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 12.1 traite_reassurance – Traité de réassurance (Prévu : table vide)
CREATE TABLE traite_reassurance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  code varchar(10) NOT NULL,
  branche varchar(60) NOT NULL,
  exercice_id uuid NOT NULL,
  type varchar(20) NOT NULL,
  taux_cession numeric(9,6),
  commission_reassurance numeric(9,6),
  parts jsonb NOT NULL
);
COMMENT ON TABLE traite_reassurance IS 'Traité de réassurance. Traité par branche et exercice. Fonction « Prévu » : table créée vide, sans écran ni traitement. [DD 12.1 ; REA-RG-001.]';
COMMENT ON COLUMN traite_reassurance.code IS 'Code';
COMMENT ON COLUMN traite_reassurance.branche IS 'Branche';
COMMENT ON COLUMN traite_reassurance.exercice_id IS 'Exercice';
COMMENT ON COLUMN traite_reassurance.type IS 'QUOTE_PART ou EXCEDENT_SINISTRE';
COMMENT ON COLUMN traite_reassurance.taux_cession IS 'Taux de cession';
COMMENT ON COLUMN traite_reassurance.commission_reassurance IS 'Commission';
COMMENT ON COLUMN traite_reassurance.parts IS 'Réassureurs et parts';
CREATE TRIGGER traite_reassurance_ins BEFORE INSERT ON traite_reassurance FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER traite_reassurance_upd BEFORE UPDATE ON traite_reassurance FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER traite_reassurance_del BEFORE DELETE ON traite_reassurance FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- 12.2 coassurance_part – Part de coassurance (Prévu : table vide)
CREATE TABLE coassurance_part (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  police_id uuid NOT NULL,
  coassureur_tiers_id uuid NOT NULL,
  quote_part numeric(9,6) NOT NULL
);
COMMENT ON TABLE coassurance_part IS 'Part de coassurance. Quote-part d’un coassureur sur une police. Fonction « Prévu » : table créée vide, sans écran ni traitement. [DD 12.2 ; REA-RG-003.]';
COMMENT ON COLUMN coassurance_part.police_id IS 'Police';
COMMENT ON COLUMN coassurance_part.coassureur_tiers_id IS 'Coassureur';
COMMENT ON COLUMN coassurance_part.quote_part IS 'Quote-part – Somme = 100 %';
CREATE TRIGGER coassurance_part_ins BEFORE INSERT ON coassurance_part FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER coassurance_part_upd BEFORE UPDATE ON coassurance_part FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER coassurance_part_del BEFORE DELETE ON coassurance_part FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- Clés étrangères
ALTER TABLE departement ADD CONSTRAINT departement_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE departement ADD CONSTRAINT departement_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE departement ADD CONSTRAINT departement_responsable_id_fk FOREIGN KEY (responsable_id) REFERENCES utilisateur(id);
ALTER TABLE service ADD CONSTRAINT service_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE service ADD CONSTRAINT service_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE service ADD CONSTRAINT service_departement_id_fk FOREIGN KEY (departement_id) REFERENCES departement(id);
ALTER TABLE service ADD CONSTRAINT service_responsable_id_fk FOREIGN KEY (responsable_id) REFERENCES utilisateur(id);
ALTER TABLE fonction ADD CONSTRAINT fonction_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE fonction ADD CONSTRAINT fonction_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE fonction ADD CONSTRAINT fonction_service_id_fk FOREIGN KEY (service_id) REFERENCES service(id);
ALTER TABLE fonction ADD CONSTRAINT fonction_profil_defaut_id_fk FOREIGN KEY (profil_defaut_id) REFERENCES profil(id);
ALTER TABLE historique_organisation ADD CONSTRAINT historique_organisation_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE historique_organisation ADD CONSTRAINT historique_organisation_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE historique_organisation ADD CONSTRAINT historique_organisation_valide_par_fk FOREIGN KEY (valide_par) REFERENCES utilisateur(id);
ALTER TABLE utilisateur ADD CONSTRAINT utilisateur_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE utilisateur ADD CONSTRAINT utilisateur_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE utilisateur ADD CONSTRAINT utilisateur_tiers_id_fk FOREIGN KEY (tiers_id) REFERENCES tiers(id);
ALTER TABLE utilisateur ADD CONSTRAINT utilisateur_fonction_id_fk FOREIGN KEY (fonction_id) REFERENCES fonction(id);
ALTER TABLE utilisateur ADD CONSTRAINT utilisateur_prestataire_id_fk FOREIGN KEY (prestataire_id) REFERENCES prestataire(id);
ALTER TABLE utilisateur ADD CONSTRAINT utilisateur_intervenant_id_fk FOREIGN KEY (intervenant_id) REFERENCES intervenant(id);
ALTER TABLE utilisateur ADD CONSTRAINT utilisateur_cree_par_admin_id_fk FOREIGN KEY (cree_par_admin_id) REFERENCES utilisateur(id);
ALTER TABLE utilisateur ADD CONSTRAINT utilisateur_valide_par_fk FOREIGN KEY (valide_par) REFERENCES utilisateur(id);
ALTER TABLE profil ADD CONSTRAINT profil_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE profil ADD CONSTRAINT profil_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE droit ADD CONSTRAINT droit_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE droit ADD CONSTRAINT droit_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE profil_droit ADD CONSTRAINT profil_droit_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE profil_droit ADD CONSTRAINT profil_droit_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE profil_droit ADD CONSTRAINT profil_droit_profil_id_fk FOREIGN KEY (profil_id) REFERENCES profil(id);
ALTER TABLE profil_droit ADD CONSTRAINT profil_droit_droit_id_fk FOREIGN KEY (droit_id) REFERENCES droit(id);
ALTER TABLE utilisateur_profil ADD CONSTRAINT utilisateur_profil_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE utilisateur_profil ADD CONSTRAINT utilisateur_profil_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE utilisateur_profil ADD CONSTRAINT utilisateur_profil_utilisateur_id_fk FOREIGN KEY (utilisateur_id) REFERENCES utilisateur(id);
ALTER TABLE utilisateur_profil ADD CONSTRAINT utilisateur_profil_profil_id_fk FOREIGN KEY (profil_id) REFERENCES profil(id);
ALTER TABLE utilisateur_profil ADD CONSTRAINT utilisateur_profil_attribue_par_fk FOREIGN KEY (attribue_par) REFERENCES utilisateur(id);
ALTER TABLE utilisateur_profil ADD CONSTRAINT utilisateur_profil_valide_par_fk FOREIGN KEY (valide_par) REFERENCES utilisateur(id);
ALTER TABLE incompatibilite_profil ADD CONSTRAINT incompatibilite_profil_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE incompatibilite_profil ADD CONSTRAINT incompatibilite_profil_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE incompatibilite_profil ADD CONSTRAINT incompatibilite_profil_profil_a_id_fk FOREIGN KEY (profil_a_id) REFERENCES profil(id);
ALTER TABLE incompatibilite_profil ADD CONSTRAINT incompatibilite_profil_profil_b_id_fk FOREIGN KEY (profil_b_id) REFERENCES profil(id);
ALTER TABLE delegation_validation ADD CONSTRAINT delegation_validation_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE delegation_validation ADD CONSTRAINT delegation_validation_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE delegation_validation ADD CONSTRAINT delegation_validation_profil_id_fk FOREIGN KEY (profil_id) REFERENCES profil(id);
ALTER TABLE interim ADD CONSTRAINT interim_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE interim ADD CONSTRAINT interim_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE interim ADD CONSTRAINT interim_delegant_id_fk FOREIGN KEY (delegant_id) REFERENCES utilisateur(id);
ALTER TABLE interim ADD CONSTRAINT interim_delegataire_id_fk FOREIGN KEY (delegataire_id) REFERENCES utilisateur(id);
ALTER TABLE journal_audit ADD CONSTRAINT journal_audit_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE journal_audit ADD CONSTRAINT journal_audit_utilisateur_id_fk FOREIGN KEY (utilisateur_id) REFERENCES utilisateur(id);
ALTER TABLE parametre ADD CONSTRAINT parametre_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE parametre ADD CONSTRAINT parametre_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE parametre ADD CONSTRAINT parametre_regle_legale_id_fk FOREIGN KEY (regle_legale_id) REFERENCES regle_legale(id);
ALTER TABLE parametre_historique ADD CONSTRAINT parametre_historique_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE parametre_historique ADD CONSTRAINT parametre_historique_parametre_id_fk FOREIGN KEY (parametre_id) REFERENCES parametre(id);
ALTER TABLE parametre_historique ADD CONSTRAINT parametre_historique_auteur_id_fk FOREIGN KEY (auteur_id) REFERENCES utilisateur(id);
ALTER TABLE parametre_historique ADD CONSTRAINT parametre_historique_decision_comite_id_fk FOREIGN KEY (decision_comite_id) REFERENCES demande_validation(id);
ALTER TABLE regle_legale ADD CONSTRAINT regle_legale_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE regle_legale ADD CONSTRAINT regle_legale_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE regle_legale ADD CONSTRAINT regle_legale_visa_conformite_id_fk FOREIGN KEY (visa_conformite_id) REFERENCES utilisateur(id);
ALTER TABLE modele_document ADD CONSTRAINT modele_document_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE modele_document ADD CONSTRAINT modele_document_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE document ADD CONSTRAINT document_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE document ADD CONSTRAINT document_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE document ADD CONSTRAINT document_modele_document_id_fk FOREIGN KEY (modele_document_id) REFERENCES modele_document(id);
ALTER TABLE dossier_preuve ADD CONSTRAINT dossier_preuve_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE dossier_preuve ADD CONSTRAINT dossier_preuve_document_id_fk FOREIGN KEY (document_id) REFERENCES document(id);
ALTER TABLE dossier_preuve ADD CONSTRAINT dossier_preuve_signataire_tiers_id_fk FOREIGN KEY (signataire_tiers_id) REFERENCES tiers(id);
ALTER TABLE dossier_preuve ADD CONSTRAINT dossier_preuve_assistant_id_fk FOREIGN KEY (assistant_id) REFERENCES utilisateur(id);
ALTER TABLE modele_notification ADD CONSTRAINT modele_notification_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE modele_notification ADD CONSTRAINT modele_notification_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE notification ADD CONSTRAINT notification_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE notification ADD CONSTRAINT notification_destinataire_tiers_id_fk FOREIGN KEY (destinataire_tiers_id) REFERENCES tiers(id);
ALTER TABLE notification ADD CONSTRAINT notification_modele_notification_id_fk FOREIGN KEY (modele_notification_id) REFERENCES modele_notification(id);
ALTER TABLE compteur_numerotation ADD CONSTRAINT compteur_numerotation_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE compteur_numerotation ADD CONSTRAINT compteur_numerotation_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE evenement_metier ADD CONSTRAINT evenement_metier_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE demande_validation ADD CONSTRAINT demande_validation_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE demande_validation ADD CONSTRAINT demande_validation_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE demande_validation ADD CONSTRAINT demande_validation_initiateur_id_fk FOREIGN KEY (initiateur_id) REFERENCES utilisateur(id);
ALTER TABLE validation_etape ADD CONSTRAINT validation_etape_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE validation_etape ADD CONSTRAINT validation_etape_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE validation_etape ADD CONSTRAINT validation_etape_demande_validation_id_fk FOREIGN KEY (demande_validation_id) REFERENCES demande_validation(id);
ALTER TABLE validation_etape ADD CONSTRAINT validation_etape_valideur_id_fk FOREIGN KEY (valideur_id) REFERENCES utilisateur(id);
ALTER TABLE validation_etape ADD CONSTRAINT validation_etape_interim_id_fk FOREIGN KEY (interim_id) REFERENCES interim(id);
ALTER TABLE motif_blocage_ref ADD CONSTRAINT motif_blocage_ref_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE motif_blocage_ref ADD CONSTRAINT motif_blocage_ref_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE motif_blocage ADD CONSTRAINT motif_blocage_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE motif_blocage ADD CONSTRAINT motif_blocage_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE motif_blocage ADD CONSTRAINT motif_blocage_motif_ref_id_fk FOREIGN KEY (motif_ref_id) REFERENCES motif_blocage_ref(id);
ALTER TABLE motif_blocage ADD CONSTRAINT motif_blocage_carte_assure_id_fk FOREIGN KEY (carte_assure_id) REFERENCES carte_assure(id);
ALTER TABLE motif_blocage ADD CONSTRAINT motif_blocage_tiers_id_fk FOREIGN KEY (tiers_id) REFERENCES tiers(id);
ALTER TABLE motif_blocage ADD CONSTRAINT motif_blocage_depose_par_fk FOREIGN KEY (depose_par) REFERENCES utilisateur(id);
ALTER TABLE motif_blocage ADD CONSTRAINT motif_blocage_leve_par_fk FOREIGN KEY (leve_par) REFERENCES utilisateur(id);
ALTER TABLE reclamation ADD CONSTRAINT reclamation_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE reclamation ADD CONSTRAINT reclamation_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE reclamation ADD CONSTRAINT reclamation_tiers_id_fk FOREIGN KEY (tiers_id) REFERENCES tiers(id);
ALTER TABLE reclamation ADD CONSTRAINT reclamation_gestionnaire_id_fk FOREIGN KEY (gestionnaire_id) REFERENCES utilisateur(id);
ALTER TABLE societe ADD CONSTRAINT societe_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE societe ADD CONSTRAINT societe_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE societe ADD CONSTRAINT societe_logo_document_id_fk FOREIGN KEY (logo_document_id) REFERENCES document(id);
ALTER TABLE societe_historique ADD CONSTRAINT societe_historique_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE societe_historique ADD CONSTRAINT societe_historique_auteur_id_fk FOREIGN KEY (auteur_id) REFERENCES utilisateur(id);
ALTER TABLE societe_historique ADD CONSTRAINT societe_historique_valide_par_fk FOREIGN KEY (valide_par) REFERENCES utilisateur(id);
ALTER TABLE tiers ADD CONSTRAINT tiers_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE tiers ADD CONSTRAINT tiers_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE tiers ADD CONSTRAINT tiers_dirigeant_tiers_id_fk FOREIGN KEY (dirigeant_tiers_id) REFERENCES tiers(id);
ALTER TABLE tiers ADD CONSTRAINT tiers_photo_document_id_fk FOREIGN KEY (photo_document_id) REFERENCES document(id);
ALTER TABLE tiers ADD CONSTRAINT tiers_fusionne_dans_id_fk FOREIGN KEY (fusionne_dans_id) REFERENCES tiers(id);
ALTER TABLE tiers_role ADD CONSTRAINT tiers_role_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE tiers_role ADD CONSTRAINT tiers_role_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE tiers_role ADD CONSTRAINT tiers_role_tiers_id_fk FOREIGN KEY (tiers_id) REFERENCES tiers(id);
ALTER TABLE tiers_role ADD CONSTRAINT tiers_role_compte_auxiliaire_id_fk FOREIGN KEY (compte_auxiliaire_id) REFERENCES compte_auxiliaire(id);
ALTER TABLE lien_foyer ADD CONSTRAINT lien_foyer_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE lien_foyer ADD CONSTRAINT lien_foyer_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE lien_foyer ADD CONSTRAINT lien_foyer_assure_principal_id_fk FOREIGN KEY (assure_principal_id) REFERENCES tiers(id);
ALTER TABLE lien_foyer ADD CONSTRAINT lien_foyer_membre_id_fk FOREIGN KEY (membre_id) REFERENCES tiers(id);
ALTER TABLE lien_foyer ADD CONSTRAINT lien_foyer_parent_conjoint_id_fk FOREIGN KEY (parent_conjoint_id) REFERENCES tiers(id);
ALTER TABLE lien_foyer ADD CONSTRAINT lien_foyer_justificatif_document_id_fk FOREIGN KEY (justificatif_document_id) REFERENCES document(id);
ALTER TABLE coordonnee_paiement ADD CONSTRAINT coordonnee_paiement_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE coordonnee_paiement ADD CONSTRAINT coordonnee_paiement_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE coordonnee_paiement ADD CONSTRAINT coordonnee_paiement_tiers_id_fk FOREIGN KEY (tiers_id) REFERENCES tiers(id);
ALTER TABLE coordonnee_paiement ADD CONSTRAINT coordonnee_paiement_verifiee_par_fk FOREIGN KEY (verifiee_par) REFERENCES utilisateur(id);
ALTER TABLE bureau ADD CONSTRAINT bureau_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE bureau ADD CONSTRAINT bureau_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE bureau_gestionnaire ADD CONSTRAINT bureau_gestionnaire_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE bureau_gestionnaire ADD CONSTRAINT bureau_gestionnaire_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE bureau_gestionnaire ADD CONSTRAINT bureau_gestionnaire_bureau_id_fk FOREIGN KEY (bureau_id) REFERENCES bureau(id);
ALTER TABLE bureau_gestionnaire ADD CONSTRAINT bureau_gestionnaire_intervenant_id_fk FOREIGN KEY (intervenant_id) REFERENCES intervenant(id);
ALTER TABLE produit ADD CONSTRAINT produit_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE produit ADD CONSTRAINT produit_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE produit ADD CONSTRAINT produit_modele_cg_id_fk FOREIGN KEY (modele_cg_id) REFERENCES modele_document(id);
ALTER TABLE produit ADD CONSTRAINT produit_modele_cp_id_fk FOREIGN KEY (modele_cp_id) REFERENCES modele_document(id);
ALTER TABLE produit ADD CONSTRAINT produit_formule_remplacement_id_fk FOREIGN KEY (formule_remplacement_id) REFERENCES formule(id);
ALTER TABLE formule ADD CONSTRAINT formule_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE formule ADD CONSTRAINT formule_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE formule ADD CONSTRAINT formule_produit_id_fk FOREIGN KEY (produit_id) REFERENCES produit(id);
ALTER TABLE garantie ADD CONSTRAINT garantie_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE garantie ADD CONSTRAINT garantie_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE garantie ADD CONSTRAINT garantie_formule_id_fk FOREIGN KEY (formule_id) REFERENCES formule(id);
ALTER TABLE tarif ADD CONSTRAINT tarif_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE tarif ADD CONSTRAINT tarif_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE tarif ADD CONSTRAINT tarif_formule_id_fk FOREIGN KEY (formule_id) REFERENCES formule(id);
ALTER TABLE exclusion ADD CONSTRAINT exclusion_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE exclusion ADD CONSTRAINT exclusion_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE exclusion ADD CONSTRAINT exclusion_produit_id_fk FOREIGN KEY (produit_id) REFERENCES produit(id);
ALTER TABLE nomenclature_acte ADD CONSTRAINT nomenclature_acte_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE nomenclature_acte ADD CONSTRAINT nomenclature_acte_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE medicament ADD CONSTRAINT medicament_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE medicament ADD CONSTRAINT medicament_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE diagnostic ADD CONSTRAINT diagnostic_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE diagnostic ADD CONSTRAINT diagnostic_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE jour_ferie ADD CONSTRAINT jour_ferie_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE jour_ferie ADD CONSTRAINT jour_ferie_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE intervenant ADD CONSTRAINT intervenant_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE intervenant ADD CONSTRAINT intervenant_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE intervenant ADD CONSTRAINT intervenant_tiers_id_fk FOREIGN KEY (tiers_id) REFERENCES tiers(id);
ALTER TABLE intervenant ADD CONSTRAINT intervenant_rattachement_id_fk FOREIGN KEY (rattachement_id) REFERENCES intervenant(id);
ALTER TABLE intervenant ADD CONSTRAINT intervenant_visa_conformite_id_fk FOREIGN KEY (visa_conformite_id) REFERENCES utilisateur(id);
ALTER TABLE intervenant ADD CONSTRAINT intervenant_traite_ou_contrat_document_id_fk FOREIGN KEY (traite_ou_contrat_document_id) REFERENCES document(id);
ALTER TABLE prospect ADD CONSTRAINT prospect_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE prospect ADD CONSTRAINT prospect_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE prospect ADD CONSTRAINT prospect_tiers_id_fk FOREIGN KEY (tiers_id) REFERENCES tiers(id);
ALTER TABLE prospect ADD CONSTRAINT prospect_intervenant_id_fk FOREIGN KEY (intervenant_id) REFERENCES intervenant(id);
ALTER TABLE prospect ADD CONSTRAINT prospect_code_prescripteur_id_fk FOREIGN KEY (code_prescripteur_id) REFERENCES code_prescripteur(id);
ALTER TABLE compte_production_agent ADD CONSTRAINT compte_production_agent_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE compte_production_agent ADD CONSTRAINT compte_production_agent_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE compte_production_agent ADD CONSTRAINT compte_production_agent_bureau_id_fk FOREIGN KEY (bureau_id) REFERENCES bureau(id);
ALTER TABLE compte_production_agent ADD CONSTRAINT compte_production_agent_intervenant_id_fk FOREIGN KEY (intervenant_id) REFERENCES intervenant(id);
ALTER TABLE compte_production_agent ADD CONSTRAINT compte_production_agent_compte_auxiliaire_id_fk FOREIGN KEY (compte_auxiliaire_id) REFERENCES compte_auxiliaire(id);
ALTER TABLE mouvement_compte_production ADD CONSTRAINT mouvement_compte_production_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE mouvement_compte_production ADD CONSTRAINT mouvement_compte_production_compte_production_id_fk FOREIGN KEY (compte_production_id) REFERENCES compte_production_agent(id);
ALTER TABLE mouvement_compte_production ADD CONSTRAINT mouvement_compte_production_ecriture_id_fk FOREIGN KEY (ecriture_id) REFERENCES ecriture(id);
ALTER TABLE mouvement_compte_production ADD CONSTRAINT mouvement_compte_production_utilisateur_id_fk FOREIGN KEY (utilisateur_id) REFERENCES utilisateur(id);
ALTER TABLE approvisionnement_compte ADD CONSTRAINT approvisionnement_compte_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE approvisionnement_compte ADD CONSTRAINT approvisionnement_compte_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE approvisionnement_compte ADD CONSTRAINT approvisionnement_compte_compte_production_id_fk FOREIGN KEY (compte_production_id) REFERENCES compte_production_agent(id);
ALTER TABLE approvisionnement_compte ADD CONSTRAINT approvisionnement_compte_confirme_par_fk FOREIGN KEY (confirme_par) REFERENCES utilisateur(id);
ALTER TABLE demande_restitution ADD CONSTRAINT demande_restitution_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE demande_restitution ADD CONSTRAINT demande_restitution_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE demande_restitution ADD CONSTRAINT demande_restitution_compte_production_id_fk FOREIGN KEY (compte_production_id) REFERENCES compte_production_agent(id);
ALTER TABLE demande_restitution ADD CONSTRAINT demande_restitution_justificatif_document_id_fk FOREIGN KEY (justificatif_document_id) REFERENCES document(id);
ALTER TABLE demande_restitution ADD CONSTRAINT demande_restitution_etat_detaille_document_id_fk FOREIGN KEY (etat_detaille_document_id) REFERENCES document(id);
ALTER TABLE demande_restitution ADD CONSTRAINT demande_restitution_coordonnee_paiement_id_fk FOREIGN KEY (coordonnee_paiement_id) REFERENCES coordonnee_paiement(id);
ALTER TABLE demande_restitution ADD CONSTRAINT demande_restitution_demande_validation_id_fk FOREIGN KEY (demande_validation_id) REFERENCES demande_validation(id);
ALTER TABLE demande_restitution ADD CONSTRAINT demande_restitution_ordre_paiement_id_fk FOREIGN KEY (ordre_paiement_id) REFERENCES ordre_paiement(id);
ALTER TABLE police_intervenant ADD CONSTRAINT police_intervenant_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE police_intervenant ADD CONSTRAINT police_intervenant_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE police_intervenant ADD CONSTRAINT police_intervenant_police_id_fk FOREIGN KEY (police_id) REFERENCES police(id);
ALTER TABLE police_intervenant ADD CONSTRAINT police_intervenant_intervenant_id_fk FOREIGN KEY (intervenant_id) REFERENCES intervenant(id);
ALTER TABLE bareme_commission ADD CONSTRAINT bareme_commission_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE bareme_commission ADD CONSTRAINT bareme_commission_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE bareme_commission ADD CONSTRAINT bareme_commission_produit_id_fk FOREIGN KEY (produit_id) REFERENCES produit(id);
ALTER TABLE commission ADD CONSTRAINT commission_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE commission ADD CONSTRAINT commission_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE commission ADD CONSTRAINT commission_police_id_fk FOREIGN KEY (police_id) REFERENCES police(id);
ALTER TABLE commission ADD CONSTRAINT commission_quittance_id_fk FOREIGN KEY (quittance_id) REFERENCES quittance(id);
ALTER TABLE commission ADD CONSTRAINT commission_intervenant_id_fk FOREIGN KEY (intervenant_id) REFERENCES intervenant(id);
ALTER TABLE commission ADD CONSTRAINT commission_facture_commission_id_fk FOREIGN KEY (facture_commission_id) REFERENCES facture_commission(id);
ALTER TABLE commission ADD CONSTRAINT commission_ecriture_id_fk FOREIGN KEY (ecriture_id) REFERENCES ecriture(id);
ALTER TABLE facture_commission ADD CONSTRAINT facture_commission_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE facture_commission ADD CONSTRAINT facture_commission_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE facture_commission ADD CONSTRAINT facture_commission_intervenant_id_fk FOREIGN KEY (intervenant_id) REFERENCES intervenant(id);
ALTER TABLE facture_commission ADD CONSTRAINT facture_commission_document_id_fk FOREIGN KEY (document_id) REFERENCES document(id);
ALTER TABLE facture_commission ADD CONSTRAINT facture_commission_demande_validation_id_fk FOREIGN KEY (demande_validation_id) REFERENCES demande_validation(id);
ALTER TABLE paiement_facture_commission ADD CONSTRAINT paiement_facture_commission_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE paiement_facture_commission ADD CONSTRAINT paiement_facture_commission_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE paiement_facture_commission ADD CONSTRAINT paiement_facture_commission_facture_id_fk FOREIGN KEY (facture_id) REFERENCES facture_commission(id);
ALTER TABLE paiement_facture_commission ADD CONSTRAINT paiement_facture_commission_mandat_id_fk FOREIGN KEY (mandat_id) REFERENCES mandat_affectation_commission(id);
ALTER TABLE paiement_facture_commission ADD CONSTRAINT paiement_facture_commission_ordre_paiement_id_fk FOREIGN KEY (ordre_paiement_id) REFERENCES ordre_paiement(id);
ALTER TABLE paiement_facture_commission ADD CONSTRAINT paiement_facture_commission_ecriture_id_fk FOREIGN KEY (ecriture_id) REFERENCES ecriture(id);
ALTER TABLE paiement_facture_commission ADD CONSTRAINT paiement_facture_commission_demande_validation_id_fk FOREIGN KEY (demande_validation_id) REFERENCES demande_validation(id);
ALTER TABLE mandat_affectation_commission ADD CONSTRAINT mandat_affectation_commission_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE mandat_affectation_commission ADD CONSTRAINT mandat_affectation_commission_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE mandat_affectation_commission ADD CONSTRAINT mandat_affectation_commission_intervenant_id_fk FOREIGN KEY (intervenant_id) REFERENCES intervenant(id);
ALTER TABLE mandat_affectation_commission ADD CONSTRAINT mandat_affectation_commission_compte_production_id_fk FOREIGN KEY (compte_production_id) REFERENCES compte_production_agent(id);
ALTER TABLE mandat_affectation_commission ADD CONSTRAINT mandat_affectation_commission_facture_id_fk FOREIGN KEY (facture_id) REFERENCES facture_commission(id);
ALTER TABLE mandat_affectation_commission ADD CONSTRAINT mandat_affectation_commission_document_id_fk FOREIGN KEY (document_id) REFERENCES document(id);
ALTER TABLE mouvement_portefeuille ADD CONSTRAINT mouvement_portefeuille_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE mouvement_portefeuille ADD CONSTRAINT mouvement_portefeuille_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE mouvement_portefeuille ADD CONSTRAINT mouvement_portefeuille_cedant_id_fk FOREIGN KEY (cedant_id) REFERENCES intervenant(id);
ALTER TABLE mouvement_portefeuille ADD CONSTRAINT mouvement_portefeuille_cessionnaire_id_fk FOREIGN KEY (cessionnaire_id) REFERENCES intervenant(id);
ALTER TABLE mouvement_portefeuille ADD CONSTRAINT mouvement_portefeuille_demande_validation_id_fk FOREIGN KEY (demande_validation_id) REFERENCES demande_validation(id);
ALTER TABLE code_prescripteur ADD CONSTRAINT code_prescripteur_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE code_prescripteur ADD CONSTRAINT code_prescripteur_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE code_prescripteur ADD CONSTRAINT code_prescripteur_intervenant_id_fk FOREIGN KEY (intervenant_id) REFERENCES intervenant(id);
ALTER TABLE carte_professionnelle ADD CONSTRAINT carte_professionnelle_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE carte_professionnelle ADD CONSTRAINT carte_professionnelle_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE carte_professionnelle ADD CONSTRAINT carte_professionnelle_intervenant_id_fk FOREIGN KEY (intervenant_id) REFERENCES intervenant(id);
ALTER TABLE carte_professionnelle ADD CONSTRAINT carte_professionnelle_remise_preuve_id_fk FOREIGN KEY (remise_preuve_id) REFERENCES dossier_preuve(id);
ALTER TABLE dossier_souscription ADD CONSTRAINT dossier_souscription_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE dossier_souscription ADD CONSTRAINT dossier_souscription_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE dossier_souscription ADD CONSTRAINT dossier_souscription_souscripteur_id_fk FOREIGN KEY (souscripteur_id) REFERENCES tiers(id);
ALTER TABLE dossier_souscription ADD CONSTRAINT dossier_souscription_produit_id_fk FOREIGN KEY (produit_id) REFERENCES produit(id);
ALTER TABLE dossier_souscription ADD CONSTRAINT dossier_souscription_formule_id_fk FOREIGN KEY (formule_id) REFERENCES formule(id);
ALTER TABLE dossier_souscription ADD CONSTRAINT dossier_souscription_bureau_id_fk FOREIGN KEY (bureau_id) REFERENCES bureau(id);
ALTER TABLE dossier_souscription ADD CONSTRAINT dossier_souscription_prepare_par_id_fk FOREIGN KEY (prepare_par_id) REFERENCES intervenant(id);
ALTER TABLE dossier_souscription ADD CONSTRAINT dossier_souscription_code_prescripteur_id_fk FOREIGN KEY (code_prescripteur_id) REFERENCES code_prescripteur(id);
ALTER TABLE dossier_souscription ADD CONSTRAINT dossier_souscription_acceptation_preuve_id_fk FOREIGN KEY (acceptation_preuve_id) REFERENCES dossier_preuve(id);
ALTER TABLE dossier_souscription ADD CONSTRAINT dossier_souscription_encaissement_attente_id_fk FOREIGN KEY (encaissement_attente_id) REFERENCES encaissement_attente(id);
ALTER TABLE dossier_souscription ADD CONSTRAINT dossier_souscription_police_id_fk FOREIGN KEY (police_id) REFERENCES police(id);
ALTER TABLE police ADD CONSTRAINT police_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE police ADD CONSTRAINT police_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE police ADD CONSTRAINT police_souscripteur_id_fk FOREIGN KEY (souscripteur_id) REFERENCES tiers(id);
ALTER TABLE police ADD CONSTRAINT police_produit_id_fk FOREIGN KEY (produit_id) REFERENCES produit(id);
ALTER TABLE police ADD CONSTRAINT police_formule_id_fk FOREIGN KEY (formule_id) REFERENCES formule(id);
ALTER TABLE police ADD CONSTRAINT police_bureau_emetteur_id_fk FOREIGN KEY (bureau_emetteur_id) REFERENCES bureau(id);
ALTER TABLE police ADD CONSTRAINT police_bureau_gestion_id_fk FOREIGN KEY (bureau_gestion_id) REFERENCES bureau(id);
ALTER TABLE police_periode ADD CONSTRAINT police_periode_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE police_periode ADD CONSTRAINT police_periode_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE police_periode ADD CONSTRAINT police_periode_police_id_fk FOREIGN KEY (police_id) REFERENCES police(id);
ALTER TABLE police_periode ADD CONSTRAINT police_periode_quittance_id_fk FOREIGN KEY (quittance_id) REFERENCES quittance(id);
ALTER TABLE police_assure ADD CONSTRAINT police_assure_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE police_assure ADD CONSTRAINT police_assure_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE police_assure ADD CONSTRAINT police_assure_police_id_fk FOREIGN KEY (police_id) REFERENCES police(id);
ALTER TABLE police_assure ADD CONSTRAINT police_assure_tiers_id_fk FOREIGN KEY (tiers_id) REFERENCES tiers(id);
ALTER TABLE police_assure ADD CONSTRAINT police_assure_adhesion_id_fk FOREIGN KEY (adhesion_id) REFERENCES adhesion(id);
ALTER TABLE garantie_souscrite ADD CONSTRAINT garantie_souscrite_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE garantie_souscrite ADD CONSTRAINT garantie_souscrite_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE garantie_souscrite ADD CONSTRAINT garantie_souscrite_police_assure_id_fk FOREIGN KEY (police_assure_id) REFERENCES police_assure(id);
ALTER TABLE garantie_souscrite ADD CONSTRAINT garantie_souscrite_garantie_id_fk FOREIGN KEY (garantie_id) REFERENCES garantie(id);
ALTER TABLE consentement_assure ADD CONSTRAINT consentement_assure_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE consentement_assure ADD CONSTRAINT consentement_assure_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE consentement_assure ADD CONSTRAINT consentement_assure_police_assure_id_fk FOREIGN KEY (police_assure_id) REFERENCES police_assure(id);
ALTER TABLE consentement_assure ADD CONSTRAINT consentement_assure_preuve_id_fk FOREIGN KEY (preuve_id) REFERENCES dossier_preuve(id);
ALTER TABLE designation_version ADD CONSTRAINT designation_version_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE designation_version ADD CONSTRAINT designation_version_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE designation_version ADD CONSTRAINT designation_version_police_id_fk FOREIGN KEY (police_id) REFERENCES police(id);
ALTER TABLE designation_version ADD CONSTRAINT designation_version_police_assure_id_fk FOREIGN KEY (police_assure_id) REFERENCES police_assure(id);
ALTER TABLE designation_version ADD CONSTRAINT designation_version_preuve_id_fk FOREIGN KEY (preuve_id) REFERENCES dossier_preuve(id);
ALTER TABLE beneficiaire ADD CONSTRAINT beneficiaire_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE beneficiaire ADD CONSTRAINT beneficiaire_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE beneficiaire ADD CONSTRAINT beneficiaire_designation_version_id_fk FOREIGN KEY (designation_version_id) REFERENCES designation_version(id);
ALTER TABLE beneficiaire ADD CONSTRAINT beneficiaire_tiers_id_fk FOREIGN KEY (tiers_id) REFERENCES tiers(id);
ALTER TABLE acceptation_beneficiaire ADD CONSTRAINT acceptation_beneficiaire_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE acceptation_beneficiaire ADD CONSTRAINT acceptation_beneficiaire_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE acceptation_beneficiaire ADD CONSTRAINT acceptation_beneficiaire_beneficiaire_id_fk FOREIGN KEY (beneficiaire_id) REFERENCES beneficiaire(id);
ALTER TABLE acceptation_beneficiaire ADD CONSTRAINT acceptation_beneficiaire_preuve_beneficiaire_id_fk FOREIGN KEY (preuve_beneficiaire_id) REFERENCES dossier_preuve(id);
ALTER TABLE acceptation_beneficiaire ADD CONSTRAINT acceptation_beneficiaire_preuve_souscripteur_id_fk FOREIGN KEY (preuve_souscripteur_id) REFERENCES dossier_preuve(id);
ALTER TABLE acceptation_beneficiaire ADD CONSTRAINT acceptation_beneficiaire_preuve_assure_id_fk FOREIGN KEY (preuve_assure_id) REFERENCES dossier_preuve(id);
ALTER TABLE quittance ADD CONSTRAINT quittance_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE quittance ADD CONSTRAINT quittance_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE quittance ADD CONSTRAINT quittance_police_id_fk FOREIGN KEY (police_id) REFERENCES police(id);
ALTER TABLE quittance ADD CONSTRAINT quittance_ecriture_constatation_id_fk FOREIGN KEY (ecriture_constatation_id) REFERENCES ecriture(id);
ALTER TABLE quittance ADD CONSTRAINT quittance_ecriture_perception_id_fk FOREIGN KEY (ecriture_perception_id) REFERENCES ecriture(id);
ALTER TABLE avenant ADD CONSTRAINT avenant_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE avenant ADD CONSTRAINT avenant_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE avenant ADD CONSTRAINT avenant_police_id_fk FOREIGN KEY (police_id) REFERENCES police(id);
ALTER TABLE avenant ADD CONSTRAINT avenant_quittance_id_fk FOREIGN KEY (quittance_id) REFERENCES quittance(id);
ALTER TABLE avenant ADD CONSTRAINT avenant_demande_validation_id_fk FOREIGN KEY (demande_validation_id) REFERENCES demande_validation(id);
ALTER TABLE avenant ADD CONSTRAINT avenant_preuve_id_fk FOREIGN KEY (preuve_id) REFERENCES dossier_preuve(id);
ALTER TABLE college ADD CONSTRAINT college_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE college ADD CONSTRAINT college_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE college ADD CONSTRAINT college_police_id_fk FOREIGN KEY (police_id) REFERENCES police(id);
ALTER TABLE college ADD CONSTRAINT college_formule_id_fk FOREIGN KEY (formule_id) REFERENCES formule(id);
ALTER TABLE adhesion ADD CONSTRAINT adhesion_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE adhesion ADD CONSTRAINT adhesion_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE adhesion ADD CONSTRAINT adhesion_police_id_fk FOREIGN KEY (police_id) REFERENCES police(id);
ALTER TABLE adhesion ADD CONSTRAINT adhesion_tiers_id_fk FOREIGN KEY (tiers_id) REFERENCES tiers(id);
ALTER TABLE adhesion ADD CONSTRAINT adhesion_college_id_fk FOREIGN KEY (college_id) REFERENCES college(id);
ALTER TABLE adhesion ADD CONSTRAINT adhesion_notice_preuve_id_fk FOREIGN KEY (notice_preuve_id) REFERENCES dossier_preuve(id);
ALTER TABLE mouvement_effectif ADD CONSTRAINT mouvement_effectif_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE mouvement_effectif ADD CONSTRAINT mouvement_effectif_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE mouvement_effectif ADD CONSTRAINT mouvement_effectif_adhesion_id_fk FOREIGN KEY (adhesion_id) REFERENCES adhesion(id);
ALTER TABLE mouvement_effectif ADD CONSTRAINT mouvement_effectif_declare_par_fk FOREIGN KEY (declare_par) REFERENCES utilisateur(id);
ALTER TABLE mouvement_effectif ADD CONSTRAINT mouvement_effectif_regularisation_id_fk FOREIGN KEY (regularisation_id) REFERENCES regularisation(id);
ALTER TABLE appel_prime ADD CONSTRAINT appel_prime_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE appel_prime ADD CONSTRAINT appel_prime_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE appel_prime ADD CONSTRAINT appel_prime_police_id_fk FOREIGN KEY (police_id) REFERENCES police(id);
ALTER TABLE regularisation ADD CONSTRAINT regularisation_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE regularisation ADD CONSTRAINT regularisation_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE regularisation ADD CONSTRAINT regularisation_police_id_fk FOREIGN KEY (police_id) REFERENCES police(id);
ALTER TABLE regularisation ADD CONSTRAINT regularisation_appel_prime_id_fk FOREIGN KEY (appel_prime_id) REFERENCES appel_prime(id);
ALTER TABLE regularisation ADD CONSTRAINT regularisation_ordre_paiement_id_fk FOREIGN KEY (ordre_paiement_id) REFERENCES ordre_paiement(id);
ALTER TABLE regularisation ADD CONSTRAINT regularisation_quittance_id_fk FOREIGN KEY (quittance_id) REFERENCES quittance(id);
ALTER TABLE mise_en_demeure ADD CONSTRAINT mise_en_demeure_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE mise_en_demeure ADD CONSTRAINT mise_en_demeure_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE mise_en_demeure ADD CONSTRAINT mise_en_demeure_police_id_fk FOREIGN KEY (police_id) REFERENCES police(id);
ALTER TABLE mise_en_demeure ADD CONSTRAINT mise_en_demeure_quittance_id_fk FOREIGN KEY (quittance_id) REFERENCES quittance(id);
ALTER TABLE mise_en_demeure ADD CONSTRAINT mise_en_demeure_lettre_document_id_fk FOREIGN KEY (lettre_document_id) REFERENCES document(id);
ALTER TABLE versement_programme ADD CONSTRAINT versement_programme_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE versement_programme ADD CONSTRAINT versement_programme_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE versement_programme ADD CONSTRAINT versement_programme_police_id_fk FOREIGN KEY (police_id) REFERENCES police(id);
ALTER TABLE versement_programme ADD CONSTRAINT versement_programme_ecriture_id_fk FOREIGN KEY (ecriture_id) REFERENCES ecriture(id);
ALTER TABLE encaissement_attente ADD CONSTRAINT encaissement_attente_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE encaissement_attente ADD CONSTRAINT encaissement_attente_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE encaissement_attente ADD CONSTRAINT encaissement_attente_payeur_tiers_id_fk FOREIGN KEY (payeur_tiers_id) REFERENCES tiers(id);
ALTER TABLE encaissement_attente ADD CONSTRAINT encaissement_attente_ecriture_id_fk FOREIGN KEY (ecriture_id) REFERENCES ecriture(id);
ALTER TABLE prestataire ADD CONSTRAINT prestataire_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE prestataire ADD CONSTRAINT prestataire_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE prestataire ADD CONSTRAINT prestataire_tiers_id_fk FOREIGN KEY (tiers_id) REFERENCES tiers(id);
ALTER TABLE prestataire ADD CONSTRAINT prestataire_convention_document_id_fk FOREIGN KEY (convention_document_id) REFERENCES document(id);
ALTER TABLE prestataire ADD CONSTRAINT prestataire_administrateur_id_fk FOREIGN KEY (administrateur_id) REFERENCES utilisateur(id);
ALTER TABLE prestataire_option ADD CONSTRAINT prestataire_option_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE prestataire_option ADD CONSTRAINT prestataire_option_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE prestataire_option ADD CONSTRAINT prestataire_option_prestataire_id_fk FOREIGN KEY (prestataire_id) REFERENCES prestataire(id);
ALTER TABLE professionnel_sante ADD CONSTRAINT professionnel_sante_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE professionnel_sante ADD CONSTRAINT professionnel_sante_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE professionnel_sante ADD CONSTRAINT professionnel_sante_tiers_id_fk FOREIGN KEY (tiers_id) REFERENCES tiers(id);
ALTER TABLE professionnel_sante ADD CONSTRAINT professionnel_sante_diplome_document_id_fk FOREIGN KEY (diplome_document_id) REFERENCES document(id);
ALTER TABLE exercice_professionnel ADD CONSTRAINT exercice_professionnel_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE exercice_professionnel ADD CONSTRAINT exercice_professionnel_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE exercice_professionnel ADD CONSTRAINT exercice_professionnel_professionnel_id_fk FOREIGN KEY (professionnel_id) REFERENCES professionnel_sante(id);
ALTER TABLE exercice_professionnel ADD CONSTRAINT exercice_professionnel_prestataire_id_fk FOREIGN KEY (prestataire_id) REFERENCES prestataire(id);
ALTER TABLE exercice_professionnel ADD CONSTRAINT exercice_professionnel_utilisateur_id_fk FOREIGN KEY (utilisateur_id) REFERENCES utilisateur(id);
ALTER TABLE exercice_professionnel ADD CONSTRAINT exercice_professionnel_cree_par_admin_id_fk FOREIGN KEY (cree_par_admin_id) REFERENCES utilisateur(id);
ALTER TABLE convention_tarif ADD CONSTRAINT convention_tarif_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE convention_tarif ADD CONSTRAINT convention_tarif_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE convention_tarif ADD CONSTRAINT convention_tarif_prestataire_id_fk FOREIGN KEY (prestataire_id) REFERENCES prestataire(id);
ALTER TABLE convention_tarif ADD CONSTRAINT convention_tarif_medicament_id_fk FOREIGN KEY (medicament_id) REFERENCES medicament(id);
ALTER TABLE carte_assure ADD CONSTRAINT carte_assure_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE carte_assure ADD CONSTRAINT carte_assure_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE carte_assure ADD CONSTRAINT carte_assure_police_assure_id_fk FOREIGN KEY (police_assure_id) REFERENCES police_assure(id);
ALTER TABLE carte_assure ADD CONSTRAINT carte_assure_remise_preuve_id_fk FOREIGN KEY (remise_preuve_id) REFERENCES dossier_preuve(id);
ALTER TABLE carte_assure ADD CONSTRAINT carte_assure_remplace_carte_id_fk FOREIGN KEY (remplace_carte_id) REFERENCES carte_assure(id);
ALTER TABLE compteur_garantie ADD CONSTRAINT compteur_garantie_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE compteur_garantie ADD CONSTRAINT compteur_garantie_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE compteur_garantie ADD CONSTRAINT compteur_garantie_police_assure_id_fk FOREIGN KEY (police_assure_id) REFERENCES police_assure(id);
ALTER TABLE compteur_garantie ADD CONSTRAINT compteur_garantie_garantie_id_fk FOREIGN KEY (garantie_id) REFERENCES garantie(id);
ALTER TABLE compteur_garantie ADD CONSTRAINT compteur_garantie_periode_id_fk FOREIGN KEY (periode_id) REFERENCES police_periode(id);
ALTER TABLE prise_en_charge ADD CONSTRAINT prise_en_charge_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE prise_en_charge ADD CONSTRAINT prise_en_charge_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE prise_en_charge ADD CONSTRAINT prise_en_charge_carte_assure_id_fk FOREIGN KEY (carte_assure_id) REFERENCES carte_assure(id);
ALTER TABLE prise_en_charge ADD CONSTRAINT prise_en_charge_prestataire_id_fk FOREIGN KEY (prestataire_id) REFERENCES prestataire(id);
ALTER TABLE prise_en_charge ADD CONSTRAINT prise_en_charge_ouverte_par_fk FOREIGN KEY (ouverte_par) REFERENCES utilisateur(id);
ALTER TABLE prise_en_charge ADD CONSTRAINT prise_en_charge_sinistre_id_fk FOREIGN KEY (sinistre_id) REFERENCES sinistre(id);
ALTER TABLE prise_en_charge ADD CONSTRAINT prise_en_charge_contrat_complementaire_id_fk FOREIGN KEY (contrat_complementaire_id) REFERENCES police(id);
ALTER TABLE hospitalisation ADD CONSTRAINT hospitalisation_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE hospitalisation ADD CONSTRAINT hospitalisation_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE hospitalisation ADD CONSTRAINT hospitalisation_prise_en_charge_id_fk FOREIGN KEY (prise_en_charge_id) REFERENCES prise_en_charge(id);
ALTER TABLE hospitalisation ADD CONSTRAINT hospitalisation_accord_prealable_id_fk FOREIGN KEY (accord_prealable_id) REFERENCES accord_prealable(id);
ALTER TABLE accord_prealable ADD CONSTRAINT accord_prealable_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE accord_prealable ADD CONSTRAINT accord_prealable_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE accord_prealable ADD CONSTRAINT accord_prealable_prise_en_charge_id_fk FOREIGN KEY (prise_en_charge_id) REFERENCES prise_en_charge(id);
ALTER TABLE accord_prealable ADD CONSTRAINT accord_prealable_decide_par_fk FOREIGN KEY (decide_par) REFERENCES utilisateur(id);
ALTER TABLE acte ADD CONSTRAINT acte_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE acte ADD CONSTRAINT acte_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE acte ADD CONSTRAINT acte_prise_en_charge_id_fk FOREIGN KEY (prise_en_charge_id) REFERENCES prise_en_charge(id);
ALTER TABLE acte ADD CONSTRAINT acte_garantie_id_fk FOREIGN KEY (garantie_id) REFERENCES garantie(id);
ALTER TABLE acte ADD CONSTRAINT acte_realise_par_fk FOREIGN KEY (realise_par) REFERENCES utilisateur(id);
ALTER TABLE acte ADD CONSTRAINT acte_bon_execute_id_fk FOREIGN KEY (bon_execute_id) REFERENCES bon_examen(id);
ALTER TABLE ordonnance ADD CONSTRAINT ordonnance_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE ordonnance ADD CONSTRAINT ordonnance_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE ordonnance ADD CONSTRAINT ordonnance_prise_en_charge_id_fk FOREIGN KEY (prise_en_charge_id) REFERENCES prise_en_charge(id);
ALTER TABLE ordonnance ADD CONSTRAINT ordonnance_prescripteur_id_fk FOREIGN KEY (prescripteur_id) REFERENCES utilisateur(id);
ALTER TABLE ordonnance ADD CONSTRAINT ordonnance_signature_preuve_id_fk FOREIGN KEY (signature_preuve_id) REFERENCES dossier_preuve(id);
ALTER TABLE ligne_ordonnance ADD CONSTRAINT ligne_ordonnance_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE ligne_ordonnance ADD CONSTRAINT ligne_ordonnance_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE ligne_ordonnance ADD CONSTRAINT ligne_ordonnance_ordonnance_id_fk FOREIGN KEY (ordonnance_id) REFERENCES ordonnance(id);
ALTER TABLE ligne_ordonnance ADD CONSTRAINT ligne_ordonnance_medicament_id_fk FOREIGN KEY (medicament_id) REFERENCES medicament(id);
ALTER TABLE bon_examen ADD CONSTRAINT bon_examen_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE bon_examen ADD CONSTRAINT bon_examen_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE bon_examen ADD CONSTRAINT bon_examen_prise_en_charge_id_fk FOREIGN KEY (prise_en_charge_id) REFERENCES prise_en_charge(id);
ALTER TABLE bon_examen ADD CONSTRAINT bon_examen_prescripteur_id_fk FOREIGN KEY (prescripteur_id) REFERENCES utilisateur(id);
ALTER TABLE dispensation ADD CONSTRAINT dispensation_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE dispensation ADD CONSTRAINT dispensation_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE dispensation ADD CONSTRAINT dispensation_prise_en_charge_id_fk FOREIGN KEY (prise_en_charge_id) REFERENCES prise_en_charge(id);
ALTER TABLE dispensation ADD CONSTRAINT dispensation_ligne_ordonnance_id_fk FOREIGN KEY (ligne_ordonnance_id) REFERENCES ligne_ordonnance(id);
ALTER TABLE dispensation ADD CONSTRAINT dispensation_medicament_delivre_id_fk FOREIGN KEY (medicament_delivre_id) REFERENCES medicament(id);
ALTER TABLE facture_prestation ADD CONSTRAINT facture_prestation_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE facture_prestation ADD CONSTRAINT facture_prestation_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE facture_prestation ADD CONSTRAINT facture_prestation_prise_en_charge_id_fk FOREIGN KEY (prise_en_charge_id) REFERENCES prise_en_charge(id);
ALTER TABLE facture_prestation ADD CONSTRAINT facture_prestation_prestataire_id_fk FOREIGN KEY (prestataire_id) REFERENCES prestataire(id);
ALTER TABLE facture_prestation ADD CONSTRAINT facture_prestation_professionnel_id_fk FOREIGN KEY (professionnel_id) REFERENCES utilisateur(id);
ALTER TABLE facture_prestation ADD CONSTRAINT facture_prestation_facture_mensuelle_id_fk FOREIGN KEY (facture_mensuelle_id) REFERENCES facture_mensuelle(id);
ALTER TABLE facture_mensuelle ADD CONSTRAINT facture_mensuelle_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE facture_mensuelle ADD CONSTRAINT facture_mensuelle_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE facture_mensuelle ADD CONSTRAINT facture_mensuelle_prestataire_id_fk FOREIGN KEY (prestataire_id) REFERENCES prestataire(id);
ALTER TABLE facture_mensuelle ADD CONSTRAINT facture_mensuelle_demande_validation_id_fk FOREIGN KEY (demande_validation_id) REFERENCES demande_validation(id);
ALTER TABLE facture_mensuelle ADD CONSTRAINT facture_mensuelle_ecriture_id_fk FOREIGN KEY (ecriture_id) REFERENCES ecriture(id);
ALTER TABLE facture_mensuelle ADD CONSTRAINT facture_mensuelle_ordre_paiement_id_fk FOREIGN KEY (ordre_paiement_id) REFERENCES ordre_paiement(id);
ALTER TABLE contestation_ligne ADD CONSTRAINT contestation_ligne_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE contestation_ligne ADD CONSTRAINT contestation_ligne_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE contestation_ligne ADD CONSTRAINT contestation_ligne_facture_prestation_id_fk FOREIGN KEY (facture_prestation_id) REFERENCES facture_prestation(id);
ALTER TABLE contestation_ligne ADD CONSTRAINT contestation_ligne_decide_par_fk FOREIGN KEY (decide_par) REFERENCES utilisateur(id);
ALTER TABLE carnet_entree ADD CONSTRAINT carnet_entree_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE carnet_entree ADD CONSTRAINT carnet_entree_tiers_id_fk FOREIGN KEY (tiers_id) REFERENCES tiers(id);
ALTER TABLE carnet_entree ADD CONSTRAINT carnet_entree_prise_en_charge_id_fk FOREIGN KEY (prise_en_charge_id) REFERENCES prise_en_charge(id);
ALTER TABLE carnet_entree ADD CONSTRAINT carnet_entree_auteur_id_fk FOREIGN KEY (auteur_id) REFERENCES utilisateur(id);
ALTER TABLE journal_acces_carnet ADD CONSTRAINT journal_acces_carnet_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE journal_acces_carnet ADD CONSTRAINT journal_acces_carnet_tiers_id_fk FOREIGN KEY (tiers_id) REFERENCES tiers(id);
ALTER TABLE journal_acces_carnet ADD CONSTRAINT journal_acces_carnet_utilisateur_id_fk FOREIGN KEY (utilisateur_id) REFERENCES utilisateur(id);
ALTER TABLE journal_acces_carnet ADD CONSTRAINT journal_acces_carnet_prise_en_charge_id_fk FOREIGN KEY (prise_en_charge_id) REFERENCES prise_en_charge(id);
ALTER TABLE creneau ADD CONSTRAINT creneau_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE creneau ADD CONSTRAINT creneau_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE creneau ADD CONSTRAINT creneau_professionnel_id_fk FOREIGN KEY (professionnel_id) REFERENCES professionnel_sante(id);
ALTER TABLE creneau ADD CONSTRAINT creneau_prestataire_id_fk FOREIGN KEY (prestataire_id) REFERENCES prestataire(id);
ALTER TABLE rendez_vous ADD CONSTRAINT rendez_vous_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE rendez_vous ADD CONSTRAINT rendez_vous_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE rendez_vous ADD CONSTRAINT rendez_vous_creneau_id_fk FOREIGN KEY (creneau_id) REFERENCES creneau(id);
ALTER TABLE rendez_vous ADD CONSTRAINT rendez_vous_carte_assure_id_fk FOREIGN KEY (carte_assure_id) REFERENCES carte_assure(id);
ALTER TABLE rendez_vous ADD CONSTRAINT rendez_vous_reserve_par_fk FOREIGN KEY (reserve_par) REFERENCES utilisateur(id);
ALTER TABLE rendez_vous ADD CONSTRAINT rendez_vous_prise_en_charge_id_fk FOREIGN KEY (prise_en_charge_id) REFERENCES prise_en_charge(id);
ALTER TABLE appel_teleconsultation ADD CONSTRAINT appel_teleconsultation_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE appel_teleconsultation ADD CONSTRAINT appel_teleconsultation_rendez_vous_id_fk FOREIGN KEY (rendez_vous_id) REFERENCES rendez_vous(id);
ALTER TABLE appel_teleconsultation ADD CONSTRAINT appel_teleconsultation_confirmation_assure_id_fk FOREIGN KEY (confirmation_assure_id) REFERENCES dossier_preuve(id);
ALTER TABLE declarant ADD CONSTRAINT declarant_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE declarant ADD CONSTRAINT declarant_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE declarant ADD CONSTRAINT declarant_tiers_id_fk FOREIGN KEY (tiers_id) REFERENCES tiers(id);
ALTER TABLE declarant ADD CONSTRAINT declarant_police_id_fk FOREIGN KEY (police_id) REFERENCES police(id);
ALTER TABLE sinistre ADD CONSTRAINT sinistre_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE sinistre ADD CONSTRAINT sinistre_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE sinistre ADD CONSTRAINT sinistre_police_id_fk FOREIGN KEY (police_id) REFERENCES police(id);
ALTER TABLE sinistre ADD CONSTRAINT sinistre_victime_id_fk FOREIGN KEY (victime_id) REFERENCES tiers(id);
ALTER TABLE sinistre ADD CONSTRAINT sinistre_declarant_id_fk FOREIGN KEY (declarant_id) REFERENCES declarant(id);
ALTER TABLE sinistre ADD CONSTRAINT sinistre_assiste_par_fk FOREIGN KEY (assiste_par) REFERENCES utilisateur(id);
ALTER TABLE sinistre ADD CONSTRAINT sinistre_declaration_preuve_id_fk FOREIGN KEY (declaration_preuve_id) REFERENCES dossier_preuve(id);
ALTER TABLE sinistre ADD CONSTRAINT sinistre_gestionnaire_id_fk FOREIGN KEY (gestionnaire_id) REFERENCES utilisateur(id);
ALTER TABLE sinistre ADD CONSTRAINT sinistre_doublon_probable_de_fk FOREIGN KEY (doublon_probable_de) REFERENCES sinistre(id);
ALTER TABLE sinistre_garantie ADD CONSTRAINT sinistre_garantie_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE sinistre_garantie ADD CONSTRAINT sinistre_garantie_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE sinistre_garantie ADD CONSTRAINT sinistre_garantie_sinistre_id_fk FOREIGN KEY (sinistre_id) REFERENCES sinistre(id);
ALTER TABLE sinistre_garantie ADD CONSTRAINT sinistre_garantie_garantie_id_fk FOREIGN KEY (garantie_id) REFERENCES garantie(id);
ALTER TABLE piece_exigee ADD CONSTRAINT piece_exigee_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE piece_exigee ADD CONSTRAINT piece_exigee_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE piece_recue ADD CONSTRAINT piece_recue_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE piece_recue ADD CONSTRAINT piece_recue_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE piece_recue ADD CONSTRAINT piece_recue_sinistre_id_fk FOREIGN KEY (sinistre_id) REFERENCES sinistre(id);
ALTER TABLE piece_recue ADD CONSTRAINT piece_recue_piece_exigee_id_fk FOREIGN KEY (piece_exigee_id) REFERENCES piece_exigee(id);
ALTER TABLE piece_recue ADD CONSTRAINT piece_recue_document_id_fk FOREIGN KEY (document_id) REFERENCES document(id);
ALTER TABLE piece_recue ADD CONSTRAINT piece_recue_original_verifie_par_fk FOREIGN KEY (original_verifie_par) REFERENCES utilisateur(id);
ALTER TABLE expertise ADD CONSTRAINT expertise_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE expertise ADD CONSTRAINT expertise_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE expertise ADD CONSTRAINT expertise_sinistre_id_fk FOREIGN KEY (sinistre_id) REFERENCES sinistre(id);
ALTER TABLE expertise ADD CONSTRAINT expertise_expert_tiers_id_fk FOREIGN KEY (expert_tiers_id) REFERENCES tiers(id);
ALTER TABLE expertise ADD CONSTRAINT expertise_facture_achat_id_fk FOREIGN KEY (facture_achat_id) REFERENCES fiche_imputation(id);
ALTER TABLE mouvement_provision ADD CONSTRAINT mouvement_provision_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE mouvement_provision ADD CONSTRAINT mouvement_provision_sinistre_id_fk FOREIGN KEY (sinistre_id) REFERENCES sinistre(id);
ALTER TABLE mouvement_provision ADD CONSTRAINT mouvement_provision_demande_validation_id_fk FOREIGN KEY (demande_validation_id) REFERENCES demande_validation(id);
ALTER TABLE mouvement_provision ADD CONSTRAINT mouvement_provision_auteur_id_fk FOREIGN KEY (auteur_id) REFERENCES utilisateur(id);
ALTER TABLE decision_sinistre ADD CONSTRAINT decision_sinistre_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE decision_sinistre ADD CONSTRAINT decision_sinistre_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE decision_sinistre ADD CONSTRAINT decision_sinistre_sinistre_id_fk FOREIGN KEY (sinistre_id) REFERENCES sinistre(id);
ALTER TABLE decision_sinistre ADD CONSTRAINT decision_sinistre_demande_validation_id_fk FOREIGN KEY (demande_validation_id) REFERENCES demande_validation(id);
ALTER TABLE decision_sinistre ADD CONSTRAINT decision_sinistre_lettre_document_id_fk FOREIGN KEY (lettre_document_id) REFERENCES document(id);
ALTER TABLE offre_indemnite ADD CONSTRAINT offre_indemnite_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE offre_indemnite ADD CONSTRAINT offre_indemnite_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE offre_indemnite ADD CONSTRAINT offre_indemnite_sinistre_id_fk FOREIGN KEY (sinistre_id) REFERENCES sinistre(id);
ALTER TABLE beneficiaire_reglement ADD CONSTRAINT beneficiaire_reglement_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE beneficiaire_reglement ADD CONSTRAINT beneficiaire_reglement_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE beneficiaire_reglement ADD CONSTRAINT beneficiaire_reglement_offre_id_fk FOREIGN KEY (offre_id) REFERENCES offre_indemnite(id);
ALTER TABLE beneficiaire_reglement ADD CONSTRAINT beneficiaire_reglement_tiers_id_fk FOREIGN KEY (tiers_id) REFERENCES tiers(id);
ALTER TABLE beneficiaire_reglement ADD CONSTRAINT beneficiaire_reglement_representant_legal_id_fk FOREIGN KEY (representant_legal_id) REFERENCES tiers(id);
ALTER TABLE beneficiaire_reglement ADD CONSTRAINT beneficiaire_reglement_acceptation_preuve_id_fk FOREIGN KEY (acceptation_preuve_id) REFERENCES dossier_preuve(id);
ALTER TABLE beneficiaire_reglement ADD CONSTRAINT beneficiaire_reglement_compte_auxiliaire_id_fk FOREIGN KEY (compte_auxiliaire_id) REFERENCES compte_auxiliaire(id);
ALTER TABLE beneficiaire_reglement ADD CONSTRAINT beneficiaire_reglement_ordre_paiement_id_fk FOREIGN KEY (ordre_paiement_id) REFERENCES ordre_paiement(id);
ALTER TABLE recours ADD CONSTRAINT recours_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE recours ADD CONSTRAINT recours_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE recours ADD CONSTRAINT recours_sinistre_id_fk FOREIGN KEY (sinistre_id) REFERENCES sinistre(id);
ALTER TABLE recours ADD CONSTRAINT recours_tiers_responsable_id_fk FOREIGN KEY (tiers_responsable_id) REFERENCES tiers(id);
ALTER TABLE recours ADD CONSTRAINT recours_ecriture_id_fk FOREIGN KEY (ecriture_id) REFERENCES ecriture(id);
ALTER TABLE exercice ADD CONSTRAINT exercice_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE exercice ADD CONSTRAINT exercice_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE periode ADD CONSTRAINT periode_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE periode ADD CONSTRAINT periode_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE periode ADD CONSTRAINT periode_exercice_id_fk FOREIGN KEY (exercice_id) REFERENCES exercice(id);
ALTER TABLE periode ADD CONSTRAINT periode_cloturee_par_fk FOREIGN KEY (cloturee_par) REFERENCES utilisateur(id);
ALTER TABLE journee_comptable ADD CONSTRAINT journee_comptable_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE journee_comptable ADD CONSTRAINT journee_comptable_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE nature_compte ADD CONSTRAINT nature_compte_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE nature_compte ADD CONSTRAINT nature_compte_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE compte ADD CONSTRAINT compte_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE compte ADD CONSTRAINT compte_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE compte ADD CONSTRAINT compte_parent_id_fk FOREIGN KEY (parent_id) REFERENCES compte(id);
ALTER TABLE compte ADD CONSTRAINT compte_nature_id_fk FOREIGN KEY (nature_id) REFERENCES nature_compte(id);
ALTER TABLE compte ADD CONSTRAINT compte_code_taxe_id_fk FOREIGN KEY (code_taxe_id) REFERENCES code_taxe(id);
ALTER TABLE compte_auxiliaire ADD CONSTRAINT compte_auxiliaire_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE compte_auxiliaire ADD CONSTRAINT compte_auxiliaire_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE compte_auxiliaire ADD CONSTRAINT compte_auxiliaire_tiers_id_fk FOREIGN KEY (tiers_id) REFERENCES tiers(id);
ALTER TABLE compte_auxiliaire ADD CONSTRAINT compte_auxiliaire_collectif_id_fk FOREIGN KEY (collectif_id) REFERENCES compte(id);
ALTER TABLE compte_auxiliaire ADD CONSTRAINT compte_auxiliaire_modele_reglement_id_fk FOREIGN KEY (modele_reglement_id) REFERENCES modele_reglement(id);
ALTER TABLE journal ADD CONSTRAINT journal_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE journal ADD CONSTRAINT journal_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE journal ADD CONSTRAINT journal_compte_tresorerie_id_fk FOREIGN KEY (compte_tresorerie_id) REFERENCES compte(id);
ALTER TABLE schema_comptable ADD CONSTRAINT schema_comptable_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE schema_comptable ADD CONSTRAINT schema_comptable_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE schema_comptable ADD CONSTRAINT schema_comptable_journal_id_fk FOREIGN KEY (journal_id) REFERENCES journal(id);
ALTER TABLE ligne_schema ADD CONSTRAINT ligne_schema_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE ligne_schema ADD CONSTRAINT ligne_schema_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE ligne_schema ADD CONSTRAINT ligne_schema_schema_id_fk FOREIGN KEY (schema_id) REFERENCES schema_comptable(id);
ALTER TABLE ligne_schema ADD CONSTRAINT ligne_schema_compte_id_fk FOREIGN KEY (compte_id) REFERENCES compte(id);
ALTER TABLE ecriture ADD CONSTRAINT ecriture_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE ecriture ADD CONSTRAINT ecriture_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE ecriture ADD CONSTRAINT ecriture_journal_id_fk FOREIGN KEY (journal_id) REFERENCES journal(id);
ALTER TABLE ecriture ADD CONSTRAINT ecriture_evenement_id_fk FOREIGN KEY (evenement_id) REFERENCES evenement_metier(id);
ALTER TABLE ecriture ADD CONSTRAINT ecriture_fiche_imputation_id_fk FOREIGN KEY (fiche_imputation_id) REFERENCES fiche_imputation(id);
ALTER TABLE ecriture ADD CONSTRAINT ecriture_extourne_de_id_fk FOREIGN KEY (extourne_de_id) REFERENCES ecriture(id);
ALTER TABLE ecriture ADD CONSTRAINT ecriture_piece_justificative_id_fk FOREIGN KEY (piece_justificative_id) REFERENCES document(id);
ALTER TABLE ecriture ADD CONSTRAINT ecriture_valide_par_fk FOREIGN KEY (valide_par) REFERENCES utilisateur(id);
ALTER TABLE ecriture ADD CONSTRAINT ecriture_scellement_lot_id_fk FOREIGN KEY (scellement_lot_id) REFERENCES scellement_lot(id);
ALTER TABLE ligne_ecriture ADD CONSTRAINT ligne_ecriture_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE ligne_ecriture ADD CONSTRAINT ligne_ecriture_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE ligne_ecriture ADD CONSTRAINT ligne_ecriture_ecriture_id_fk FOREIGN KEY (ecriture_id) REFERENCES ecriture(id);
ALTER TABLE ligne_ecriture ADD CONSTRAINT ligne_ecriture_compte_id_fk FOREIGN KEY (compte_id) REFERENCES compte(id);
ALTER TABLE ligne_ecriture ADD CONSTRAINT ligne_ecriture_compte_auxiliaire_id_fk FOREIGN KEY (compte_auxiliaire_id) REFERENCES compte_auxiliaire(id);
ALTER TABLE ligne_ecriture ADD CONSTRAINT ligne_ecriture_code_taxe_id_fk FOREIGN KEY (code_taxe_id) REFERENCES code_taxe(id);
ALTER TABLE ligne_ecriture ADD CONSTRAINT ligne_ecriture_lettrage_id_fk FOREIGN KEY (lettrage_id) REFERENCES lettrage(id);
ALTER TABLE plan_analytique ADD CONSTRAINT plan_analytique_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE plan_analytique ADD CONSTRAINT plan_analytique_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE section ADD CONSTRAINT section_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE section ADD CONSTRAINT section_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE section ADD CONSTRAINT section_plan_id_fk FOREIGN KEY (plan_id) REFERENCES plan_analytique(id);
ALTER TABLE section ADD CONSTRAINT section_parent_id_fk FOREIGN KEY (parent_id) REFERENCES section(id);
ALTER TABLE ligne_analytique ADD CONSTRAINT ligne_analytique_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE ligne_analytique ADD CONSTRAINT ligne_analytique_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE ligne_analytique ADD CONSTRAINT ligne_analytique_ligne_ecriture_id_fk FOREIGN KEY (ligne_ecriture_id) REFERENCES ligne_ecriture(id);
ALTER TABLE ligne_analytique ADD CONSTRAINT ligne_analytique_section_id_fk FOREIGN KEY (section_id) REFERENCES section(id);
ALTER TABLE grille_ventilation ADD CONSTRAINT grille_ventilation_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE grille_ventilation ADD CONSTRAINT grille_ventilation_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE lettrage ADD CONSTRAINT lettrage_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE lettrage ADD CONSTRAINT lettrage_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE lettrage ADD CONSTRAINT lettrage_compte_auxiliaire_id_fk FOREIGN KEY (compte_auxiliaire_id) REFERENCES compte_auxiliaire(id);
ALTER TABLE lettrage ADD CONSTRAINT lettrage_auteur_id_fk FOREIGN KEY (auteur_id) REFERENCES utilisateur(id);
ALTER TABLE code_taxe ADD CONSTRAINT code_taxe_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE code_taxe ADD CONSTRAINT code_taxe_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE code_taxe ADD CONSTRAINT code_taxe_compte_id_fk FOREIGN KEY (compte_id) REFERENCES compte(id);
ALTER TABLE declaration_taxe ADD CONSTRAINT declaration_taxe_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE declaration_taxe ADD CONSTRAINT declaration_taxe_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE declaration_taxe ADD CONSTRAINT declaration_taxe_code_taxe_id_fk FOREIGN KEY (code_taxe_id) REFERENCES code_taxe(id);
ALTER TABLE declaration_taxe ADD CONSTRAINT declaration_taxe_ecriture_id_fk FOREIGN KEY (ecriture_id) REFERENCES ecriture(id);
ALTER TABLE declaration_taxe ADD CONSTRAINT declaration_taxe_document_id_fk FOREIGN KEY (document_id) REFERENCES document(id);
ALTER TABLE modele_reglement ADD CONSTRAINT modele_reglement_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE modele_reglement ADD CONSTRAINT modele_reglement_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE modele_ecriture ADD CONSTRAINT modele_ecriture_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE modele_ecriture ADD CONSTRAINT modele_ecriture_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE fiche_imputation ADD CONSTRAINT fiche_imputation_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE fiche_imputation ADD CONSTRAINT fiche_imputation_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE fiche_imputation ADD CONSTRAINT fiche_imputation_journal_id_fk FOREIGN KEY (journal_id) REFERENCES journal(id);
ALTER TABLE fiche_imputation ADD CONSTRAINT fiche_imputation_modele_id_fk FOREIGN KEY (modele_id) REFERENCES modele_ecriture(id);
ALTER TABLE fiche_imputation ADD CONSTRAINT fiche_imputation_tiers_id_fk FOREIGN KEY (tiers_id) REFERENCES tiers(id);
ALTER TABLE fiche_imputation ADD CONSTRAINT fiche_imputation_piece_document_id_fk FOREIGN KEY (piece_document_id) REFERENCES document(id);
ALTER TABLE fiche_imputation ADD CONSTRAINT fiche_imputation_etabli_par_fk FOREIGN KEY (etabli_par) REFERENCES utilisateur(id);
ALTER TABLE fiche_imputation ADD CONSTRAINT fiche_imputation_verifie_par_fk FOREIGN KEY (verifie_par) REFERENCES utilisateur(id);
ALTER TABLE fiche_imputation ADD CONSTRAINT fiche_imputation_approuve_par_fk FOREIGN KEY (approuve_par) REFERENCES utilisateur(id);
ALTER TABLE fiche_imputation ADD CONSTRAINT fiche_imputation_ecriture_id_fk FOREIGN KEY (ecriture_id) REFERENCES ecriture(id);
ALTER TABLE banque_operateur ADD CONSTRAINT banque_operateur_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE banque_operateur ADD CONSTRAINT banque_operateur_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE banque_operateur ADD CONSTRAINT banque_operateur_compte_id_fk FOREIGN KEY (compte_id) REFERENCES compte(id);
ALTER TABLE banque_operateur ADD CONSTRAINT banque_operateur_journal_id_fk FOREIGN KEY (journal_id) REFERENCES journal(id);
ALTER TABLE banque_operateur ADD CONSTRAINT banque_operateur_responsable_id_fk FOREIGN KEY (responsable_id) REFERENCES utilisateur(id);
ALTER TABLE releve_ligne ADD CONSTRAINT releve_ligne_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE releve_ligne ADD CONSTRAINT releve_ligne_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE releve_ligne ADD CONSTRAINT releve_ligne_banque_operateur_id_fk FOREIGN KEY (banque_operateur_id) REFERENCES banque_operateur(id);
ALTER TABLE releve_ligne ADD CONSTRAINT releve_ligne_ligne_ecriture_id_fk FOREIGN KEY (ligne_ecriture_id) REFERENCES ligne_ecriture(id);
ALTER TABLE ordre_paiement ADD CONSTRAINT ordre_paiement_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE ordre_paiement ADD CONSTRAINT ordre_paiement_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE ordre_paiement ADD CONSTRAINT ordre_paiement_beneficiaire_tiers_id_fk FOREIGN KEY (beneficiaire_tiers_id) REFERENCES tiers(id);
ALTER TABLE ordre_paiement ADD CONSTRAINT ordre_paiement_coordonnee_paiement_id_fk FOREIGN KEY (coordonnee_paiement_id) REFERENCES coordonnee_paiement(id);
ALTER TABLE ordre_paiement ADD CONSTRAINT ordre_paiement_demande_validation_id_fk FOREIGN KEY (demande_validation_id) REFERENCES demande_validation(id);
ALTER TABLE ordre_paiement ADD CONSTRAINT ordre_paiement_lot_paiement_id_fk FOREIGN KEY (lot_paiement_id) REFERENCES lot_paiement(id);
ALTER TABLE ordre_paiement ADD CONSTRAINT ordre_paiement_execute_par_fk FOREIGN KEY (execute_par) REFERENCES utilisateur(id);
ALTER TABLE ordre_paiement ADD CONSTRAINT ordre_paiement_ecriture_id_fk FOREIGN KEY (ecriture_id) REFERENCES ecriture(id);
ALTER TABLE ordre_paiement ADD CONSTRAINT ordre_paiement_avis_document_id_fk FOREIGN KEY (avis_document_id) REFERENCES document(id);
ALTER TABLE lot_paiement ADD CONSTRAINT lot_paiement_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE lot_paiement ADD CONSTRAINT lot_paiement_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE lot_paiement ADD CONSTRAINT lot_paiement_banque_operateur_id_fk FOREIGN KEY (banque_operateur_id) REFERENCES banque_operateur(id);
ALTER TABLE lot_paiement ADD CONSTRAINT lot_paiement_fichier_document_id_fk FOREIGN KEY (fichier_document_id) REFERENCES document(id);
ALTER TABLE provision_calcul ADD CONSTRAINT provision_calcul_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE provision_calcul ADD CONSTRAINT provision_calcul_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE provision_calcul ADD CONSTRAINT provision_calcul_periode_id_fk FOREIGN KEY (periode_id) REFERENCES periode(id);
ALTER TABLE provision_calcul ADD CONSTRAINT provision_calcul_ecriture_id_fk FOREIGN KEY (ecriture_id) REFERENCES ecriture(id);
ALTER TABLE scellement_lot ADD CONSTRAINT scellement_lot_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE scellement_lot ADD CONSTRAINT scellement_lot_premiere_ecriture_id_fk FOREIGN KEY (premiere_ecriture_id) REFERENCES ecriture(id);
ALTER TABLE scellement_lot ADD CONSTRAINT scellement_lot_derniere_ecriture_id_fk FOREIGN KEY (derniere_ecriture_id) REFERENCES ecriture(id);
ALTER TABLE categorie_immobilisation ADD CONSTRAINT categorie_immobilisation_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE categorie_immobilisation ADD CONSTRAINT categorie_immobilisation_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE categorie_immobilisation ADD CONSTRAINT categorie_immobilisation_compte_immo_id_fk FOREIGN KEY (compte_immo_id) REFERENCES compte(id);
ALTER TABLE categorie_immobilisation ADD CONSTRAINT categorie_immobilisation_compte_amort_id_fk FOREIGN KEY (compte_amort_id) REFERENCES compte(id);
ALTER TABLE categorie_immobilisation ADD CONSTRAINT categorie_immobilisation_compte_dotation_id_fk FOREIGN KEY (compte_dotation_id) REFERENCES compte(id);
ALTER TABLE immobilisation ADD CONSTRAINT immobilisation_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE immobilisation ADD CONSTRAINT immobilisation_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE immobilisation ADD CONSTRAINT immobilisation_categorie_id_fk FOREIGN KEY (categorie_id) REFERENCES categorie_immobilisation(id);
ALTER TABLE immobilisation ADD CONSTRAINT immobilisation_fournisseur_tiers_id_fk FOREIGN KEY (fournisseur_tiers_id) REFERENCES tiers(id);
ALTER TABLE immobilisation ADD CONSTRAINT immobilisation_fiche_imputation_id_fk FOREIGN KEY (fiche_imputation_id) REFERENCES fiche_imputation(id);
ALTER TABLE immobilisation ADD CONSTRAINT immobilisation_responsable_id_fk FOREIGN KEY (responsable_id) REFERENCES utilisateur(id);
ALTER TABLE plan_amortissement ADD CONSTRAINT plan_amortissement_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE plan_amortissement ADD CONSTRAINT plan_amortissement_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE plan_amortissement ADD CONSTRAINT plan_amortissement_immobilisation_id_fk FOREIGN KEY (immobilisation_id) REFERENCES immobilisation(id);
ALTER TABLE plan_amortissement ADD CONSTRAINT plan_amortissement_exercice_id_fk FOREIGN KEY (exercice_id) REFERENCES exercice(id);
ALTER TABLE plan_amortissement ADD CONSTRAINT plan_amortissement_ecriture_id_fk FOREIGN KEY (ecriture_id) REFERENCES ecriture(id);
ALTER TABLE mouvement_immobilisation ADD CONSTRAINT mouvement_immobilisation_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE mouvement_immobilisation ADD CONSTRAINT mouvement_immobilisation_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE mouvement_immobilisation ADD CONSTRAINT mouvement_immobilisation_immobilisation_id_fk FOREIGN KEY (immobilisation_id) REFERENCES immobilisation(id);
ALTER TABLE mouvement_immobilisation ADD CONSTRAINT mouvement_immobilisation_demande_validation_id_fk FOREIGN KEY (demande_validation_id) REFERENCES demande_validation(id);
ALTER TABLE mouvement_immobilisation ADD CONSTRAINT mouvement_immobilisation_ecriture_id_fk FOREIGN KEY (ecriture_id) REFERENCES ecriture(id);
ALTER TABLE correspondance_etat ADD CONSTRAINT correspondance_etat_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE correspondance_etat ADD CONSTRAINT correspondance_etat_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE dossier_vigilance ADD CONSTRAINT dossier_vigilance_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE dossier_vigilance ADD CONSTRAINT dossier_vigilance_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE dossier_vigilance ADD CONSTRAINT dossier_vigilance_tiers_id_fk FOREIGN KEY (tiers_id) REFERENCES tiers(id);
ALTER TABLE dossier_vigilance ADD CONSTRAINT dossier_vigilance_declaration_preuve_id_fk FOREIGN KEY (declaration_preuve_id) REFERENCES dossier_preuve(id);
ALTER TABLE dossier_vigilance ADD CONSTRAINT dossier_vigilance_valide_par_fk FOREIGN KEY (valide_par) REFERENCES utilisateur(id);
ALTER TABLE liste_sanctions ADD CONSTRAINT liste_sanctions_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE liste_sanctions ADD CONSTRAINT liste_sanctions_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE criblage ADD CONSTRAINT criblage_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE criblage ADD CONSTRAINT criblage_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE criblage ADD CONSTRAINT criblage_tiers_id_fk FOREIGN KEY (tiers_id) REFERENCES tiers(id);
ALTER TABLE criblage ADD CONSTRAINT criblage_liste_sanctions_id_fk FOREIGN KEY (liste_sanctions_id) REFERENCES liste_sanctions(id);
ALTER TABLE criblage ADD CONSTRAINT criblage_decide_par_fk FOREIGN KEY (decide_par) REFERENCES utilisateur(id);
ALTER TABLE alerte_conformite ADD CONSTRAINT alerte_conformite_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE alerte_conformite ADD CONSTRAINT alerte_conformite_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE alerte_conformite ADD CONSTRAINT alerte_conformite_traite_par_fk FOREIGN KEY (traite_par) REFERENCES utilisateur(id);
ALTER TABLE declaration_soupcon ADD CONSTRAINT declaration_soupcon_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE declaration_soupcon ADD CONSTRAINT declaration_soupcon_tiers_id_fk FOREIGN KEY (tiers_id) REFERENCES tiers(id);
ALTER TABLE declaration_soupcon ADD CONSTRAINT declaration_soupcon_auteur_id_fk FOREIGN KEY (auteur_id) REFERENCES utilisateur(id);
ALTER TABLE consentement_donnees ADD CONSTRAINT consentement_donnees_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE consentement_donnees ADD CONSTRAINT consentement_donnees_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE consentement_donnees ADD CONSTRAINT consentement_donnees_tiers_id_fk FOREIGN KEY (tiers_id) REFERENCES tiers(id);
ALTER TABLE consentement_donnees ADD CONSTRAINT consentement_donnees_preuve_id_fk FOREIGN KEY (preuve_id) REFERENCES dossier_preuve(id);
ALTER TABLE demande_droit ADD CONSTRAINT demande_droit_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE demande_droit ADD CONSTRAINT demande_droit_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE demande_droit ADD CONSTRAINT demande_droit_tiers_id_fk FOREIGN KEY (tiers_id) REFERENCES tiers(id);
ALTER TABLE demande_droit ADD CONSTRAINT demande_droit_reclamation_id_fk FOREIGN KEY (reclamation_id) REFERENCES reclamation(id);
ALTER TABLE registre_traitement ADD CONSTRAINT registre_traitement_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE registre_traitement ADD CONSTRAINT registre_traitement_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE registre_traitement ADD CONSTRAINT registre_traitement_transfert_valide_par_fk FOREIGN KEY (transfert_valide_par) REFERENCES utilisateur(id);
ALTER TABLE violation_donnees ADD CONSTRAINT violation_donnees_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE violation_donnees ADD CONSTRAINT violation_donnees_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE traite_reassurance ADD CONSTRAINT traite_reassurance_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE traite_reassurance ADD CONSTRAINT traite_reassurance_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE traite_reassurance ADD CONSTRAINT traite_reassurance_exercice_id_fk FOREIGN KEY (exercice_id) REFERENCES exercice(id);
ALTER TABLE coassurance_part ADD CONSTRAINT coassurance_part_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);
ALTER TABLE coassurance_part ADD CONSTRAINT coassurance_part_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);
ALTER TABLE coassurance_part ADD CONSTRAINT coassurance_part_police_id_fk FOREIGN KEY (police_id) REFERENCES police(id);
ALTER TABLE coassurance_part ADD CONSTRAINT coassurance_part_coassureur_tiers_id_fk FOREIGN KEY (coassureur_tiers_id) REFERENCES tiers(id);

-- Index (clés étrangères et index déclarés au DD)
CREATE INDEX departement_responsable_id_idx ON departement (responsable_id);
CREATE INDEX service_departement_id_idx ON service (departement_id);
CREATE INDEX service_responsable_id_idx ON service (responsable_id);
CREATE INDEX fonction_service_id_idx ON fonction (service_id);
CREATE INDEX fonction_profil_defaut_id_idx ON fonction (profil_defaut_id);
CREATE INDEX historique_organisation_valide_par_idx ON historique_organisation (valide_par);
CREATE INDEX utilisateur_tiers_id_idx ON utilisateur (tiers_id);
CREATE INDEX utilisateur_fonction_id_idx ON utilisateur (fonction_id);
CREATE INDEX utilisateur_prestataire_id_idx ON utilisateur (prestataire_id);
CREATE INDEX utilisateur_intervenant_id_idx ON utilisateur (intervenant_id);
CREATE INDEX utilisateur_cree_par_admin_id_idx ON utilisateur (cree_par_admin_id);
CREATE INDEX utilisateur_valide_par_idx ON utilisateur (valide_par);
CREATE INDEX profil_droit_droit_id_idx ON profil_droit (droit_id);
CREATE INDEX utilisateur_profil_utilisateur_id_idx ON utilisateur_profil (utilisateur_id);
CREATE INDEX utilisateur_profil_profil_id_idx ON utilisateur_profil (profil_id);
CREATE INDEX utilisateur_profil_attribue_par_idx ON utilisateur_profil (attribue_par);
CREATE INDEX utilisateur_profil_valide_par_idx ON utilisateur_profil (valide_par);
CREATE INDEX incompatibilite_profil_profil_b_id_idx ON incompatibilite_profil (profil_b_id);
CREATE INDEX delegation_validation_profil_id_idx ON delegation_validation (profil_id);
CREATE INDEX interim_delegant_id_idx ON interim (delegant_id);
CREATE INDEX interim_delegataire_id_idx ON interim (delegataire_id);
CREATE INDEX journal_audit_utilisateur_id_idx ON journal_audit (utilisateur_id);
CREATE INDEX parametre_regle_legale_id_idx ON parametre (regle_legale_id);
CREATE INDEX parametre_historique_parametre_id_idx ON parametre_historique (parametre_id);
CREATE INDEX parametre_historique_auteur_id_idx ON parametre_historique (auteur_id);
CREATE INDEX parametre_historique_decision_comite_id_idx ON parametre_historique (decision_comite_id);
CREATE INDEX regle_legale_visa_conformite_id_idx ON regle_legale (visa_conformite_id);
CREATE INDEX document_modele_document_id_idx ON document (modele_document_id);
CREATE INDEX dossier_preuve_document_id_idx ON dossier_preuve (document_id);
CREATE INDEX dossier_preuve_signataire_tiers_id_idx ON dossier_preuve (signataire_tiers_id);
CREATE INDEX dossier_preuve_assistant_id_idx ON dossier_preuve (assistant_id);
CREATE INDEX notification_destinataire_tiers_id_idx ON notification (destinataire_tiers_id);
CREATE INDEX notification_modele_notification_id_idx ON notification (modele_notification_id);
CREATE INDEX demande_validation_initiateur_id_idx ON demande_validation (initiateur_id);
CREATE INDEX validation_etape_demande_validation_id_idx ON validation_etape (demande_validation_id);
CREATE INDEX validation_etape_valideur_id_idx ON validation_etape (valideur_id);
CREATE INDEX validation_etape_interim_id_idx ON validation_etape (interim_id);
CREATE INDEX motif_blocage_motif_ref_id_idx ON motif_blocage (motif_ref_id);
CREATE INDEX motif_blocage_tiers_id_idx ON motif_blocage (tiers_id);
CREATE INDEX motif_blocage_depose_par_idx ON motif_blocage (depose_par);
CREATE INDEX motif_blocage_leve_par_idx ON motif_blocage (leve_par);
CREATE INDEX motif_blocage_ix1 ON motif_blocage (carte_assure_id, date_fin);
CREATE INDEX reclamation_tiers_id_idx ON reclamation (tiers_id);
CREATE INDEX reclamation_gestionnaire_id_idx ON reclamation (gestionnaire_id);
CREATE INDEX societe_logo_document_id_idx ON societe (logo_document_id);
CREATE INDEX societe_historique_auteur_id_idx ON societe_historique (auteur_id);
CREATE INDEX societe_historique_valide_par_idx ON societe_historique (valide_par);
CREATE INDEX tiers_dirigeant_tiers_id_idx ON tiers (dirigeant_tiers_id);
CREATE INDEX tiers_photo_document_id_idx ON tiers (photo_document_id);
CREATE INDEX tiers_fusionne_dans_id_idx ON tiers (fusionne_dans_id);
CREATE INDEX tiers_role_compte_auxiliaire_id_idx ON tiers_role (compte_auxiliaire_id);
CREATE INDEX lien_foyer_assure_principal_id_idx ON lien_foyer (assure_principal_id);
CREATE INDEX lien_foyer_parent_conjoint_id_idx ON lien_foyer (parent_conjoint_id);
CREATE INDEX lien_foyer_justificatif_document_id_idx ON lien_foyer (justificatif_document_id);
CREATE INDEX lien_foyer_ix1 ON lien_foyer (membre_id, lien, date_fin);
CREATE INDEX coordonnee_paiement_tiers_id_idx ON coordonnee_paiement (tiers_id);
CREATE INDEX coordonnee_paiement_verifiee_par_idx ON coordonnee_paiement (verifiee_par);
CREATE INDEX bureau_gestionnaire_bureau_id_idx ON bureau_gestionnaire (bureau_id);
CREATE INDEX bureau_gestionnaire_intervenant_id_idx ON bureau_gestionnaire (intervenant_id);
CREATE INDEX produit_modele_cg_id_idx ON produit (modele_cg_id);
CREATE INDEX produit_modele_cp_id_idx ON produit (modele_cp_id);
CREATE INDEX produit_formule_remplacement_id_idx ON produit (formule_remplacement_id);
CREATE INDEX tarif_formule_id_idx ON tarif (formule_id);
CREATE INDEX exclusion_produit_id_idx ON exclusion (produit_id);
CREATE INDEX intervenant_tiers_id_idx ON intervenant (tiers_id);
CREATE INDEX intervenant_rattachement_id_idx ON intervenant (rattachement_id);
CREATE INDEX intervenant_visa_conformite_id_idx ON intervenant (visa_conformite_id);
CREATE INDEX intervenant_traite_ou_contrat_document_id_idx ON intervenant (traite_ou_contrat_document_id);
CREATE INDEX prospect_tiers_id_idx ON prospect (tiers_id);
CREATE INDEX prospect_intervenant_id_idx ON prospect (intervenant_id);
CREATE INDEX prospect_code_prescripteur_id_idx ON prospect (code_prescripteur_id);
CREATE INDEX compte_production_agent_intervenant_id_idx ON compte_production_agent (intervenant_id);
CREATE INDEX compte_production_agent_compte_auxiliaire_id_idx ON compte_production_agent (compte_auxiliaire_id);
CREATE INDEX mouvement_compte_production_compte_production_id_idx ON mouvement_compte_production (compte_production_id);
CREATE INDEX mouvement_compte_production_ecriture_id_idx ON mouvement_compte_production (ecriture_id);
CREATE INDEX mouvement_compte_production_utilisateur_id_idx ON mouvement_compte_production (utilisateur_id);
CREATE INDEX approvisionnement_compte_compte_production_id_idx ON approvisionnement_compte (compte_production_id);
CREATE INDEX approvisionnement_compte_confirme_par_idx ON approvisionnement_compte (confirme_par);
CREATE INDEX demande_restitution_compte_production_id_idx ON demande_restitution (compte_production_id);
CREATE INDEX demande_restitution_justificatif_document_id_idx ON demande_restitution (justificatif_document_id);
CREATE INDEX demande_restitution_etat_detaille_document_id_idx ON demande_restitution (etat_detaille_document_id);
CREATE INDEX demande_restitution_coordonnee_paiement_id_idx ON demande_restitution (coordonnee_paiement_id);
CREATE INDEX demande_restitution_demande_validation_id_idx ON demande_restitution (demande_validation_id);
CREATE INDEX demande_restitution_ordre_paiement_id_idx ON demande_restitution (ordre_paiement_id);
CREATE INDEX police_intervenant_police_id_idx ON police_intervenant (police_id);
CREATE INDEX police_intervenant_intervenant_id_idx ON police_intervenant (intervenant_id);
CREATE INDEX bareme_commission_produit_id_idx ON bareme_commission (produit_id);
CREATE INDEX commission_police_id_idx ON commission (police_id);
CREATE INDEX commission_quittance_id_idx ON commission (quittance_id);
CREATE INDEX commission_intervenant_id_idx ON commission (intervenant_id);
CREATE INDEX commission_facture_commission_id_idx ON commission (facture_commission_id);
CREATE INDEX commission_ecriture_id_idx ON commission (ecriture_id);
CREATE INDEX facture_commission_document_id_idx ON facture_commission (document_id);
CREATE INDEX facture_commission_demande_validation_id_idx ON facture_commission (demande_validation_id);
CREATE INDEX paiement_facture_commission_mandat_id_idx ON paiement_facture_commission (mandat_id);
CREATE INDEX paiement_facture_commission_ordre_paiement_id_idx ON paiement_facture_commission (ordre_paiement_id);
CREATE INDEX paiement_facture_commission_ecriture_id_idx ON paiement_facture_commission (ecriture_id);
CREATE INDEX paiement_facture_commission_demande_validation_id_idx ON paiement_facture_commission (demande_validation_id);
CREATE INDEX mandat_affectation_commission_intervenant_id_idx ON mandat_affectation_commission (intervenant_id);
CREATE INDEX mandat_affectation_commission_compte_production_id_idx ON mandat_affectation_commission (compte_production_id);
CREATE INDEX mandat_affectation_commission_facture_id_idx ON mandat_affectation_commission (facture_id);
CREATE INDEX mandat_affectation_commission_document_id_idx ON mandat_affectation_commission (document_id);
CREATE INDEX mouvement_portefeuille_cedant_id_idx ON mouvement_portefeuille (cedant_id);
CREATE INDEX mouvement_portefeuille_cessionnaire_id_idx ON mouvement_portefeuille (cessionnaire_id);
CREATE INDEX mouvement_portefeuille_demande_validation_id_idx ON mouvement_portefeuille (demande_validation_id);
CREATE INDEX code_prescripteur_intervenant_id_idx ON code_prescripteur (intervenant_id);
CREATE INDEX carte_professionnelle_intervenant_id_idx ON carte_professionnelle (intervenant_id);
CREATE INDEX carte_professionnelle_remise_preuve_id_idx ON carte_professionnelle (remise_preuve_id);
CREATE INDEX dossier_souscription_souscripteur_id_idx ON dossier_souscription (souscripteur_id);
CREATE INDEX dossier_souscription_produit_id_idx ON dossier_souscription (produit_id);
CREATE INDEX dossier_souscription_formule_id_idx ON dossier_souscription (formule_id);
CREATE INDEX dossier_souscription_bureau_id_idx ON dossier_souscription (bureau_id);
CREATE INDEX dossier_souscription_prepare_par_id_idx ON dossier_souscription (prepare_par_id);
CREATE INDEX dossier_souscription_code_prescripteur_id_idx ON dossier_souscription (code_prescripteur_id);
CREATE INDEX dossier_souscription_acceptation_preuve_id_idx ON dossier_souscription (acceptation_preuve_id);
CREATE INDEX dossier_souscription_encaissement_attente_id_idx ON dossier_souscription (encaissement_attente_id);
CREATE INDEX dossier_souscription_police_id_idx ON dossier_souscription (police_id);
CREATE INDEX police_souscripteur_id_idx ON police (souscripteur_id);
CREATE INDEX police_produit_id_idx ON police (produit_id);
CREATE INDEX police_formule_id_idx ON police (formule_id);
CREATE INDEX police_bureau_emetteur_id_idx ON police (bureau_emetteur_id);
CREATE INDEX police_bureau_gestion_id_idx ON police (bureau_gestion_id);
CREATE INDEX police_periode_quittance_id_idx ON police_periode (quittance_id);
CREATE INDEX police_assure_police_id_idx ON police_assure (police_id);
CREATE INDEX police_assure_tiers_id_idx ON police_assure (tiers_id);
CREATE INDEX police_assure_adhesion_id_idx ON police_assure (adhesion_id);
CREATE INDEX garantie_souscrite_police_assure_id_idx ON garantie_souscrite (police_assure_id);
CREATE INDEX garantie_souscrite_garantie_id_idx ON garantie_souscrite (garantie_id);
CREATE INDEX consentement_assure_police_assure_id_idx ON consentement_assure (police_assure_id);
CREATE INDEX consentement_assure_preuve_id_idx ON consentement_assure (preuve_id);
CREATE INDEX designation_version_police_assure_id_idx ON designation_version (police_assure_id);
CREATE INDEX designation_version_preuve_id_idx ON designation_version (preuve_id);
CREATE INDEX beneficiaire_designation_version_id_idx ON beneficiaire (designation_version_id);
CREATE INDEX beneficiaire_tiers_id_idx ON beneficiaire (tiers_id);
CREATE INDEX acceptation_beneficiaire_beneficiaire_id_idx ON acceptation_beneficiaire (beneficiaire_id);
CREATE INDEX acceptation_beneficiaire_preuve_beneficiaire_id_idx ON acceptation_beneficiaire (preuve_beneficiaire_id);
CREATE INDEX acceptation_beneficiaire_preuve_souscripteur_id_idx ON acceptation_beneficiaire (preuve_souscripteur_id);
CREATE INDEX acceptation_beneficiaire_preuve_assure_id_idx ON acceptation_beneficiaire (preuve_assure_id);
CREATE INDEX quittance_police_id_idx ON quittance (police_id);
CREATE INDEX quittance_ecriture_constatation_id_idx ON quittance (ecriture_constatation_id);
CREATE INDEX quittance_ecriture_perception_id_idx ON quittance (ecriture_perception_id);
CREATE INDEX avenant_police_id_idx ON avenant (police_id);
CREATE INDEX avenant_quittance_id_idx ON avenant (quittance_id);
CREATE INDEX avenant_demande_validation_id_idx ON avenant (demande_validation_id);
CREATE INDEX avenant_preuve_id_idx ON avenant (preuve_id);
CREATE INDEX college_formule_id_idx ON college (formule_id);
CREATE INDEX adhesion_tiers_id_idx ON adhesion (tiers_id);
CREATE INDEX adhesion_college_id_idx ON adhesion (college_id);
CREATE INDEX adhesion_notice_preuve_id_idx ON adhesion (notice_preuve_id);
CREATE INDEX mouvement_effectif_adhesion_id_idx ON mouvement_effectif (adhesion_id);
CREATE INDEX mouvement_effectif_declare_par_idx ON mouvement_effectif (declare_par);
CREATE INDEX mouvement_effectif_regularisation_id_idx ON mouvement_effectif (regularisation_id);
CREATE INDEX appel_prime_police_id_idx ON appel_prime (police_id);
CREATE INDEX regularisation_appel_prime_id_idx ON regularisation (appel_prime_id);
CREATE INDEX regularisation_ordre_paiement_id_idx ON regularisation (ordre_paiement_id);
CREATE INDEX regularisation_quittance_id_idx ON regularisation (quittance_id);
CREATE INDEX mise_en_demeure_police_id_idx ON mise_en_demeure (police_id);
CREATE INDEX mise_en_demeure_quittance_id_idx ON mise_en_demeure (quittance_id);
CREATE INDEX mise_en_demeure_lettre_document_id_idx ON mise_en_demeure (lettre_document_id);
CREATE INDEX versement_programme_police_id_idx ON versement_programme (police_id);
CREATE INDEX versement_programme_ecriture_id_idx ON versement_programme (ecriture_id);
CREATE INDEX encaissement_attente_payeur_tiers_id_idx ON encaissement_attente (payeur_tiers_id);
CREATE INDEX encaissement_attente_ecriture_id_idx ON encaissement_attente (ecriture_id);
CREATE INDEX prestataire_tiers_id_idx ON prestataire (tiers_id);
CREATE INDEX prestataire_convention_document_id_idx ON prestataire (convention_document_id);
CREATE INDEX prestataire_administrateur_id_idx ON prestataire (administrateur_id);
CREATE INDEX professionnel_sante_tiers_id_idx ON professionnel_sante (tiers_id);
CREATE INDEX professionnel_sante_diplome_document_id_idx ON professionnel_sante (diplome_document_id);
CREATE INDEX exercice_professionnel_prestataire_id_idx ON exercice_professionnel (prestataire_id);
CREATE INDEX exercice_professionnel_utilisateur_id_idx ON exercice_professionnel (utilisateur_id);
CREATE INDEX exercice_professionnel_cree_par_admin_id_idx ON exercice_professionnel (cree_par_admin_id);
CREATE INDEX convention_tarif_prestataire_id_idx ON convention_tarif (prestataire_id);
CREATE INDEX convention_tarif_medicament_id_idx ON convention_tarif (medicament_id);
CREATE INDEX carte_assure_police_assure_id_idx ON carte_assure (police_assure_id);
CREATE INDEX carte_assure_remise_preuve_id_idx ON carte_assure (remise_preuve_id);
CREATE INDEX carte_assure_remplace_carte_id_idx ON carte_assure (remplace_carte_id);
CREATE INDEX compteur_garantie_garantie_id_idx ON compteur_garantie (garantie_id);
CREATE INDEX compteur_garantie_periode_id_idx ON compteur_garantie (periode_id);
CREATE INDEX prise_en_charge_carte_assure_id_idx ON prise_en_charge (carte_assure_id);
CREATE INDEX prise_en_charge_prestataire_id_idx ON prise_en_charge (prestataire_id);
CREATE INDEX prise_en_charge_ouverte_par_idx ON prise_en_charge (ouverte_par);
CREATE INDEX prise_en_charge_sinistre_id_idx ON prise_en_charge (sinistre_id);
CREATE INDEX prise_en_charge_contrat_complementaire_id_idx ON prise_en_charge (contrat_complementaire_id);
CREATE INDEX hospitalisation_prise_en_charge_id_idx ON hospitalisation (prise_en_charge_id);
CREATE INDEX hospitalisation_accord_prealable_id_idx ON hospitalisation (accord_prealable_id);
CREATE INDEX accord_prealable_prise_en_charge_id_idx ON accord_prealable (prise_en_charge_id);
CREATE INDEX accord_prealable_decide_par_idx ON accord_prealable (decide_par);
CREATE INDEX acte_prise_en_charge_id_idx ON acte (prise_en_charge_id);
CREATE INDEX acte_garantie_id_idx ON acte (garantie_id);
CREATE INDEX acte_realise_par_idx ON acte (realise_par);
CREATE INDEX acte_bon_execute_id_idx ON acte (bon_execute_id);
CREATE INDEX ordonnance_prise_en_charge_id_idx ON ordonnance (prise_en_charge_id);
CREATE INDEX ordonnance_prescripteur_id_idx ON ordonnance (prescripteur_id);
CREATE INDEX ordonnance_signature_preuve_id_idx ON ordonnance (signature_preuve_id);
CREATE INDEX ligne_ordonnance_ordonnance_id_idx ON ligne_ordonnance (ordonnance_id);
CREATE INDEX ligne_ordonnance_medicament_id_idx ON ligne_ordonnance (medicament_id);
CREATE INDEX bon_examen_prise_en_charge_id_idx ON bon_examen (prise_en_charge_id);
CREATE INDEX bon_examen_prescripteur_id_idx ON bon_examen (prescripteur_id);
CREATE INDEX dispensation_prise_en_charge_id_idx ON dispensation (prise_en_charge_id);
CREATE INDEX dispensation_ligne_ordonnance_id_idx ON dispensation (ligne_ordonnance_id);
CREATE INDEX dispensation_medicament_delivre_id_idx ON dispensation (medicament_delivre_id);
CREATE INDEX facture_prestation_prise_en_charge_id_idx ON facture_prestation (prise_en_charge_id);
CREATE INDEX facture_prestation_prestataire_id_idx ON facture_prestation (prestataire_id);
CREATE INDEX facture_prestation_professionnel_id_idx ON facture_prestation (professionnel_id);
CREATE INDEX facture_prestation_facture_mensuelle_id_idx ON facture_prestation (facture_mensuelle_id);
CREATE INDEX facture_mensuelle_demande_validation_id_idx ON facture_mensuelle (demande_validation_id);
CREATE INDEX facture_mensuelle_ecriture_id_idx ON facture_mensuelle (ecriture_id);
CREATE INDEX facture_mensuelle_ordre_paiement_id_idx ON facture_mensuelle (ordre_paiement_id);
CREATE INDEX contestation_ligne_facture_prestation_id_idx ON contestation_ligne (facture_prestation_id);
CREATE INDEX contestation_ligne_decide_par_idx ON contestation_ligne (decide_par);
CREATE INDEX carnet_entree_tiers_id_idx ON carnet_entree (tiers_id);
CREATE INDEX carnet_entree_prise_en_charge_id_idx ON carnet_entree (prise_en_charge_id);
CREATE INDEX carnet_entree_auteur_id_idx ON carnet_entree (auteur_id);
CREATE INDEX journal_acces_carnet_tiers_id_idx ON journal_acces_carnet (tiers_id);
CREATE INDEX journal_acces_carnet_utilisateur_id_idx ON journal_acces_carnet (utilisateur_id);
CREATE INDEX journal_acces_carnet_prise_en_charge_id_idx ON journal_acces_carnet (prise_en_charge_id);
CREATE INDEX creneau_professionnel_id_idx ON creneau (professionnel_id);
CREATE INDEX creneau_prestataire_id_idx ON creneau (prestataire_id);
CREATE INDEX rendez_vous_creneau_id_idx ON rendez_vous (creneau_id);
CREATE INDEX rendez_vous_carte_assure_id_idx ON rendez_vous (carte_assure_id);
CREATE INDEX rendez_vous_reserve_par_idx ON rendez_vous (reserve_par);
CREATE INDEX rendez_vous_prise_en_charge_id_idx ON rendez_vous (prise_en_charge_id);
CREATE INDEX appel_teleconsultation_rendez_vous_id_idx ON appel_teleconsultation (rendez_vous_id);
CREATE INDEX appel_teleconsultation_confirmation_assure_id_idx ON appel_teleconsultation (confirmation_assure_id);
CREATE INDEX declarant_tiers_id_idx ON declarant (tiers_id);
CREATE INDEX declarant_police_id_idx ON declarant (police_id);
CREATE INDEX sinistre_police_id_idx ON sinistre (police_id);
CREATE INDEX sinistre_declarant_id_idx ON sinistre (declarant_id);
CREATE INDEX sinistre_assiste_par_idx ON sinistre (assiste_par);
CREATE INDEX sinistre_declaration_preuve_id_idx ON sinistre (declaration_preuve_id);
CREATE INDEX sinistre_gestionnaire_id_idx ON sinistre (gestionnaire_id);
CREATE INDEX sinistre_doublon_probable_de_idx ON sinistre (doublon_probable_de);
CREATE INDEX sinistre_garantie_sinistre_id_idx ON sinistre_garantie (sinistre_id);
CREATE INDEX sinistre_garantie_garantie_id_idx ON sinistre_garantie (garantie_id);
CREATE INDEX piece_recue_sinistre_id_idx ON piece_recue (sinistre_id);
CREATE INDEX piece_recue_piece_exigee_id_idx ON piece_recue (piece_exigee_id);
CREATE INDEX piece_recue_document_id_idx ON piece_recue (document_id);
CREATE INDEX piece_recue_original_verifie_par_idx ON piece_recue (original_verifie_par);
CREATE INDEX expertise_sinistre_id_idx ON expertise (sinistre_id);
CREATE INDEX expertise_expert_tiers_id_idx ON expertise (expert_tiers_id);
CREATE INDEX expertise_facture_achat_id_idx ON expertise (facture_achat_id);
CREATE INDEX mouvement_provision_sinistre_id_idx ON mouvement_provision (sinistre_id);
CREATE INDEX mouvement_provision_demande_validation_id_idx ON mouvement_provision (demande_validation_id);
CREATE INDEX mouvement_provision_auteur_id_idx ON mouvement_provision (auteur_id);
CREATE INDEX decision_sinistre_sinistre_id_idx ON decision_sinistre (sinistre_id);
CREATE INDEX decision_sinistre_demande_validation_id_idx ON decision_sinistre (demande_validation_id);
CREATE INDEX decision_sinistre_lettre_document_id_idx ON decision_sinistre (lettre_document_id);
CREATE INDEX offre_indemnite_sinistre_id_idx ON offre_indemnite (sinistre_id);
CREATE INDEX beneficiaire_reglement_offre_id_idx ON beneficiaire_reglement (offre_id);
CREATE INDEX beneficiaire_reglement_tiers_id_idx ON beneficiaire_reglement (tiers_id);
CREATE INDEX beneficiaire_reglement_representant_legal_id_idx ON beneficiaire_reglement (representant_legal_id);
CREATE INDEX beneficiaire_reglement_acceptation_preuve_id_idx ON beneficiaire_reglement (acceptation_preuve_id);
CREATE INDEX beneficiaire_reglement_compte_auxiliaire_id_idx ON beneficiaire_reglement (compte_auxiliaire_id);
CREATE INDEX beneficiaire_reglement_ordre_paiement_id_idx ON beneficiaire_reglement (ordre_paiement_id);
CREATE INDEX recours_sinistre_id_idx ON recours (sinistre_id);
CREATE INDEX recours_tiers_responsable_id_idx ON recours (tiers_responsable_id);
CREATE INDEX recours_ecriture_id_idx ON recours (ecriture_id);
CREATE INDEX periode_cloturee_par_idx ON periode (cloturee_par);
CREATE INDEX compte_parent_id_idx ON compte (parent_id);
CREATE INDEX compte_nature_id_idx ON compte (nature_id);
CREATE INDEX compte_code_taxe_id_idx ON compte (code_taxe_id);
CREATE INDEX compte_auxiliaire_tiers_id_idx ON compte_auxiliaire (tiers_id);
CREATE INDEX compte_auxiliaire_collectif_id_idx ON compte_auxiliaire (collectif_id);
CREATE INDEX compte_auxiliaire_modele_reglement_id_idx ON compte_auxiliaire (modele_reglement_id);
CREATE INDEX journal_compte_tresorerie_id_idx ON journal (compte_tresorerie_id);
CREATE INDEX schema_comptable_journal_id_idx ON schema_comptable (journal_id);
CREATE INDEX ligne_schema_schema_id_idx ON ligne_schema (schema_id);
CREATE INDEX ligne_schema_compte_id_idx ON ligne_schema (compte_id);
CREATE INDEX ecriture_evenement_id_idx ON ecriture (evenement_id);
CREATE INDEX ecriture_fiche_imputation_id_idx ON ecriture (fiche_imputation_id);
CREATE INDEX ecriture_extourne_de_id_idx ON ecriture (extourne_de_id);
CREATE INDEX ecriture_piece_justificative_id_idx ON ecriture (piece_justificative_id);
CREATE INDEX ecriture_valide_par_idx ON ecriture (valide_par);
CREATE INDEX ecriture_scellement_lot_id_idx ON ecriture (scellement_lot_id);
CREATE INDEX ligne_ecriture_ecriture_id_idx ON ligne_ecriture (ecriture_id);
CREATE INDEX ligne_ecriture_code_taxe_id_idx ON ligne_ecriture (code_taxe_id);
CREATE INDEX ligne_ecriture_lettrage_id_idx ON ligne_ecriture (lettrage_id);
CREATE INDEX ligne_ecriture_ix1 ON ligne_ecriture (compte_id);
CREATE INDEX ligne_ecriture_ix2 ON ligne_ecriture (compte_auxiliaire_id, lettrage_id);
CREATE INDEX section_parent_id_idx ON section (parent_id);
CREATE INDEX ligne_analytique_ligne_ecriture_id_idx ON ligne_analytique (ligne_ecriture_id);
CREATE INDEX ligne_analytique_section_id_idx ON ligne_analytique (section_id);
CREATE INDEX lettrage_compte_auxiliaire_id_idx ON lettrage (compte_auxiliaire_id);
CREATE INDEX lettrage_auteur_id_idx ON lettrage (auteur_id);
CREATE INDEX code_taxe_compte_id_idx ON code_taxe (compte_id);
CREATE INDEX declaration_taxe_code_taxe_id_idx ON declaration_taxe (code_taxe_id);
CREATE INDEX declaration_taxe_ecriture_id_idx ON declaration_taxe (ecriture_id);
CREATE INDEX declaration_taxe_document_id_idx ON declaration_taxe (document_id);
CREATE INDEX fiche_imputation_journal_id_idx ON fiche_imputation (journal_id);
CREATE INDEX fiche_imputation_modele_id_idx ON fiche_imputation (modele_id);
CREATE INDEX fiche_imputation_tiers_id_idx ON fiche_imputation (tiers_id);
CREATE INDEX fiche_imputation_piece_document_id_idx ON fiche_imputation (piece_document_id);
CREATE INDEX fiche_imputation_etabli_par_idx ON fiche_imputation (etabli_par);
CREATE INDEX fiche_imputation_verifie_par_idx ON fiche_imputation (verifie_par);
CREATE INDEX fiche_imputation_approuve_par_idx ON fiche_imputation (approuve_par);
CREATE INDEX fiche_imputation_ecriture_id_idx ON fiche_imputation (ecriture_id);
CREATE INDEX banque_operateur_compte_id_idx ON banque_operateur (compte_id);
CREATE INDEX banque_operateur_journal_id_idx ON banque_operateur (journal_id);
CREATE INDEX banque_operateur_responsable_id_idx ON banque_operateur (responsable_id);
CREATE INDEX releve_ligne_banque_operateur_id_idx ON releve_ligne (banque_operateur_id);
CREATE INDEX releve_ligne_ligne_ecriture_id_idx ON releve_ligne (ligne_ecriture_id);
CREATE INDEX ordre_paiement_beneficiaire_tiers_id_idx ON ordre_paiement (beneficiaire_tiers_id);
CREATE INDEX ordre_paiement_coordonnee_paiement_id_idx ON ordre_paiement (coordonnee_paiement_id);
CREATE INDEX ordre_paiement_demande_validation_id_idx ON ordre_paiement (demande_validation_id);
CREATE INDEX ordre_paiement_lot_paiement_id_idx ON ordre_paiement (lot_paiement_id);
CREATE INDEX ordre_paiement_execute_par_idx ON ordre_paiement (execute_par);
CREATE INDEX ordre_paiement_ecriture_id_idx ON ordre_paiement (ecriture_id);
CREATE INDEX ordre_paiement_avis_document_id_idx ON ordre_paiement (avis_document_id);
CREATE INDEX lot_paiement_banque_operateur_id_idx ON lot_paiement (banque_operateur_id);
CREATE INDEX lot_paiement_fichier_document_id_idx ON lot_paiement (fichier_document_id);
CREATE INDEX provision_calcul_periode_id_idx ON provision_calcul (periode_id);
CREATE INDEX provision_calcul_ecriture_id_idx ON provision_calcul (ecriture_id);
CREATE INDEX scellement_lot_premiere_ecriture_id_idx ON scellement_lot (premiere_ecriture_id);
CREATE INDEX scellement_lot_derniere_ecriture_id_idx ON scellement_lot (derniere_ecriture_id);
CREATE INDEX categorie_immobilisation_compte_immo_id_idx ON categorie_immobilisation (compte_immo_id);
CREATE INDEX categorie_immobilisation_compte_amort_id_idx ON categorie_immobilisation (compte_amort_id);
CREATE INDEX categorie_immobilisation_compte_dotation_id_idx ON categorie_immobilisation (compte_dotation_id);
CREATE INDEX immobilisation_categorie_id_idx ON immobilisation (categorie_id);
CREATE INDEX immobilisation_fournisseur_tiers_id_idx ON immobilisation (fournisseur_tiers_id);
CREATE INDEX immobilisation_fiche_imputation_id_idx ON immobilisation (fiche_imputation_id);
CREATE INDEX immobilisation_responsable_id_idx ON immobilisation (responsable_id);
CREATE INDEX plan_amortissement_immobilisation_id_idx ON plan_amortissement (immobilisation_id);
CREATE INDEX plan_amortissement_exercice_id_idx ON plan_amortissement (exercice_id);
CREATE INDEX plan_amortissement_ecriture_id_idx ON plan_amortissement (ecriture_id);
CREATE INDEX mouvement_immobilisation_immobilisation_id_idx ON mouvement_immobilisation (immobilisation_id);
CREATE INDEX mouvement_immobilisation_demande_validation_id_idx ON mouvement_immobilisation (demande_validation_id);
CREATE INDEX mouvement_immobilisation_ecriture_id_idx ON mouvement_immobilisation (ecriture_id);
CREATE INDEX dossier_vigilance_tiers_id_idx ON dossier_vigilance (tiers_id);
CREATE INDEX dossier_vigilance_declaration_preuve_id_idx ON dossier_vigilance (declaration_preuve_id);
CREATE INDEX dossier_vigilance_valide_par_idx ON dossier_vigilance (valide_par);
CREATE INDEX criblage_tiers_id_idx ON criblage (tiers_id);
CREATE INDEX criblage_liste_sanctions_id_idx ON criblage (liste_sanctions_id);
CREATE INDEX criblage_decide_par_idx ON criblage (decide_par);
CREATE INDEX alerte_conformite_traite_par_idx ON alerte_conformite (traite_par);
CREATE INDEX declaration_soupcon_tiers_id_idx ON declaration_soupcon (tiers_id);
CREATE INDEX declaration_soupcon_auteur_id_idx ON declaration_soupcon (auteur_id);
CREATE INDEX consentement_donnees_tiers_id_idx ON consentement_donnees (tiers_id);
CREATE INDEX consentement_donnees_preuve_id_idx ON consentement_donnees (preuve_id);
CREATE INDEX demande_droit_tiers_id_idx ON demande_droit (tiers_id);
CREATE INDEX demande_droit_reclamation_id_idx ON demande_droit (reclamation_id);
CREATE INDEX registre_traitement_transfert_valide_par_idx ON registre_traitement (transfert_valide_par);
CREATE INDEX traite_reassurance_exercice_id_idx ON traite_reassurance (exercice_id);
CREATE INDEX coassurance_part_police_id_idx ON coassurance_part (police_id);
CREATE INDEX coassurance_part_coassureur_tiers_id_idx ON coassurance_part (coassureur_tiers_id);

-- Down Migration

DROP TABLE IF EXISTS coassurance_part CASCADE;
DROP TABLE IF EXISTS traite_reassurance CASCADE;
DROP TABLE IF EXISTS violation_donnees CASCADE;
DROP TABLE IF EXISTS registre_traitement CASCADE;
DROP TABLE IF EXISTS demande_droit CASCADE;
DROP TABLE IF EXISTS consentement_donnees CASCADE;
DROP TABLE IF EXISTS declaration_soupcon CASCADE;
DROP TABLE IF EXISTS alerte_conformite CASCADE;
DROP TABLE IF EXISTS criblage CASCADE;
DROP TABLE IF EXISTS liste_sanctions CASCADE;
DROP TABLE IF EXISTS dossier_vigilance CASCADE;
DROP TABLE IF EXISTS correspondance_etat CASCADE;
DROP TABLE IF EXISTS mouvement_immobilisation CASCADE;
DROP TABLE IF EXISTS plan_amortissement CASCADE;
DROP TABLE IF EXISTS immobilisation CASCADE;
DROP TABLE IF EXISTS categorie_immobilisation CASCADE;
DROP TABLE IF EXISTS scellement_lot CASCADE;
DROP TABLE IF EXISTS provision_calcul CASCADE;
DROP TABLE IF EXISTS lot_paiement CASCADE;
DROP TABLE IF EXISTS ordre_paiement CASCADE;
DROP TABLE IF EXISTS releve_ligne CASCADE;
DROP TABLE IF EXISTS banque_operateur CASCADE;
DROP TABLE IF EXISTS fiche_imputation CASCADE;
DROP TABLE IF EXISTS modele_ecriture CASCADE;
DROP TABLE IF EXISTS modele_reglement CASCADE;
DROP TABLE IF EXISTS declaration_taxe CASCADE;
DROP TABLE IF EXISTS code_taxe CASCADE;
DROP TABLE IF EXISTS lettrage CASCADE;
DROP TABLE IF EXISTS grille_ventilation CASCADE;
DROP TABLE IF EXISTS ligne_analytique CASCADE;
DROP TABLE IF EXISTS section CASCADE;
DROP TABLE IF EXISTS plan_analytique CASCADE;
DROP TABLE IF EXISTS ligne_ecriture CASCADE;
DROP TABLE IF EXISTS ecriture CASCADE;
DROP TABLE IF EXISTS ligne_schema CASCADE;
DROP TABLE IF EXISTS schema_comptable CASCADE;
DROP TABLE IF EXISTS journal CASCADE;
DROP TABLE IF EXISTS compte_auxiliaire CASCADE;
DROP TABLE IF EXISTS compte CASCADE;
DROP TABLE IF EXISTS nature_compte CASCADE;
DROP TABLE IF EXISTS journee_comptable CASCADE;
DROP TABLE IF EXISTS periode CASCADE;
DROP TABLE IF EXISTS exercice CASCADE;
DROP TABLE IF EXISTS recours CASCADE;
DROP TABLE IF EXISTS beneficiaire_reglement CASCADE;
DROP TABLE IF EXISTS offre_indemnite CASCADE;
DROP TABLE IF EXISTS decision_sinistre CASCADE;
DROP TABLE IF EXISTS mouvement_provision CASCADE;
DROP TABLE IF EXISTS expertise CASCADE;
DROP TABLE IF EXISTS piece_recue CASCADE;
DROP TABLE IF EXISTS piece_exigee CASCADE;
DROP TABLE IF EXISTS sinistre_garantie CASCADE;
DROP TABLE IF EXISTS sinistre CASCADE;
DROP TABLE IF EXISTS declarant CASCADE;
DROP TABLE IF EXISTS appel_teleconsultation CASCADE;
DROP TABLE IF EXISTS rendez_vous CASCADE;
DROP TABLE IF EXISTS creneau CASCADE;
DROP TABLE IF EXISTS journal_acces_carnet CASCADE;
DROP TABLE IF EXISTS carnet_entree CASCADE;
DROP TABLE IF EXISTS contestation_ligne CASCADE;
DROP TABLE IF EXISTS facture_mensuelle CASCADE;
DROP TABLE IF EXISTS facture_prestation CASCADE;
DROP TABLE IF EXISTS dispensation CASCADE;
DROP TABLE IF EXISTS bon_examen CASCADE;
DROP TABLE IF EXISTS ligne_ordonnance CASCADE;
DROP TABLE IF EXISTS ordonnance CASCADE;
DROP TABLE IF EXISTS acte CASCADE;
DROP TABLE IF EXISTS accord_prealable CASCADE;
DROP TABLE IF EXISTS hospitalisation CASCADE;
DROP TABLE IF EXISTS prise_en_charge CASCADE;
DROP TABLE IF EXISTS compteur_garantie CASCADE;
DROP TABLE IF EXISTS carte_assure CASCADE;
DROP TABLE IF EXISTS convention_tarif CASCADE;
DROP TABLE IF EXISTS exercice_professionnel CASCADE;
DROP TABLE IF EXISTS professionnel_sante CASCADE;
DROP TABLE IF EXISTS prestataire_option CASCADE;
DROP TABLE IF EXISTS prestataire CASCADE;
DROP TABLE IF EXISTS encaissement_attente CASCADE;
DROP TABLE IF EXISTS versement_programme CASCADE;
DROP TABLE IF EXISTS mise_en_demeure CASCADE;
DROP TABLE IF EXISTS regularisation CASCADE;
DROP TABLE IF EXISTS appel_prime CASCADE;
DROP TABLE IF EXISTS mouvement_effectif CASCADE;
DROP TABLE IF EXISTS adhesion CASCADE;
DROP TABLE IF EXISTS college CASCADE;
DROP TABLE IF EXISTS avenant CASCADE;
DROP TABLE IF EXISTS quittance CASCADE;
DROP TABLE IF EXISTS acceptation_beneficiaire CASCADE;
DROP TABLE IF EXISTS beneficiaire CASCADE;
DROP TABLE IF EXISTS designation_version CASCADE;
DROP TABLE IF EXISTS consentement_assure CASCADE;
DROP TABLE IF EXISTS garantie_souscrite CASCADE;
DROP TABLE IF EXISTS police_assure CASCADE;
DROP TABLE IF EXISTS police_periode CASCADE;
DROP TABLE IF EXISTS police CASCADE;
DROP TABLE IF EXISTS dossier_souscription CASCADE;
DROP TABLE IF EXISTS carte_professionnelle CASCADE;
DROP TABLE IF EXISTS code_prescripteur CASCADE;
DROP TABLE IF EXISTS mouvement_portefeuille CASCADE;
DROP TABLE IF EXISTS mandat_affectation_commission CASCADE;
DROP TABLE IF EXISTS paiement_facture_commission CASCADE;
DROP TABLE IF EXISTS facture_commission CASCADE;
DROP TABLE IF EXISTS commission CASCADE;
DROP TABLE IF EXISTS bareme_commission CASCADE;
DROP TABLE IF EXISTS police_intervenant CASCADE;
DROP TABLE IF EXISTS demande_restitution CASCADE;
DROP TABLE IF EXISTS approvisionnement_compte CASCADE;
DROP TABLE IF EXISTS mouvement_compte_production CASCADE;
DROP TABLE IF EXISTS compte_production_agent CASCADE;
DROP TABLE IF EXISTS prospect CASCADE;
DROP TABLE IF EXISTS intervenant CASCADE;
DROP TABLE IF EXISTS jour_ferie CASCADE;
DROP TABLE IF EXISTS diagnostic CASCADE;
DROP TABLE IF EXISTS medicament CASCADE;
DROP TABLE IF EXISTS nomenclature_acte CASCADE;
DROP TABLE IF EXISTS exclusion CASCADE;
DROP TABLE IF EXISTS tarif CASCADE;
DROP TABLE IF EXISTS garantie CASCADE;
DROP TABLE IF EXISTS formule CASCADE;
DROP TABLE IF EXISTS produit CASCADE;
DROP TABLE IF EXISTS bureau_gestionnaire CASCADE;
DROP TABLE IF EXISTS bureau CASCADE;
DROP TABLE IF EXISTS coordonnee_paiement CASCADE;
DROP TABLE IF EXISTS lien_foyer CASCADE;
DROP TABLE IF EXISTS tiers_role CASCADE;
DROP TABLE IF EXISTS tiers CASCADE;
DROP TABLE IF EXISTS societe_historique CASCADE;
DROP TABLE IF EXISTS societe CASCADE;
DROP TABLE IF EXISTS reclamation CASCADE;
DROP TABLE IF EXISTS motif_blocage CASCADE;
DROP TABLE IF EXISTS motif_blocage_ref CASCADE;
DROP TABLE IF EXISTS validation_etape CASCADE;
DROP TABLE IF EXISTS demande_validation CASCADE;
DROP TABLE IF EXISTS evenement_metier CASCADE;
DROP TABLE IF EXISTS compteur_numerotation CASCADE;
DROP TABLE IF EXISTS notification CASCADE;
DROP TABLE IF EXISTS modele_notification CASCADE;
DROP TABLE IF EXISTS dossier_preuve CASCADE;
DROP TABLE IF EXISTS document CASCADE;
DROP TABLE IF EXISTS modele_document CASCADE;
DROP TABLE IF EXISTS regle_legale CASCADE;
DROP TABLE IF EXISTS parametre_historique CASCADE;
DROP TABLE IF EXISTS parametre CASCADE;
DROP TABLE IF EXISTS journal_audit CASCADE;
DROP TABLE IF EXISTS interim CASCADE;
DROP TABLE IF EXISTS delegation_validation CASCADE;
DROP TABLE IF EXISTS incompatibilite_profil CASCADE;
DROP TABLE IF EXISTS utilisateur_profil CASCADE;
DROP TABLE IF EXISTS profil_droit CASCADE;
DROP TABLE IF EXISTS droit CASCADE;
DROP TABLE IF EXISTS profil CASCADE;
DROP TABLE IF EXISTS utilisateur CASCADE;
DROP TABLE IF EXISTS historique_organisation CASCADE;
DROP TABLE IF EXISTS fonction CASCADE;
DROP TABLE IF EXISTS service CASCADE;
DROP TABLE IF EXISTS departement CASCADE;
DROP FUNCTION IF EXISTS interdire_modification_journal(), interdire_suppression(), colonnes_techniques_update(), colonnes_techniques_insert(), app_utilisateur_courant();
DROP DOMAIN IF EXISTS action_droit;
DROP DOMAIN IF EXISTS canal_notification;
DROP DOMAIN IF EXISTS canal_souscription;
DROP DOMAIN IF EXISTS categorie_enfant;
DROP DOMAIN IF EXISTS destination_paiement_commission;
DROP DOMAIN IF EXISTS lien_familial;
DROP DOMAIN IF EXISTS mode_calcul_garantie;
DROP DOMAIN IF EXISTS mode_designation;
DROP DOMAIN IF EXISTS mode_facture_commission;
DROP DOMAIN IF EXISTS mode_regle;
DROP DOMAIN IF EXISTS motif_gel;
DROP DOMAIN IF EXISTS motif_restitution;
DROP DOMAIN IF EXISTS moyen_approvisionnement;
DROP DOMAIN IF EXISTS nature_mouvement_compte_production;
DROP DOMAIN IF EXISTS nature_tiers;
DROP DOMAIN IF EXISTS niveau_signature;
DROP DOMAIN IF EXISTS origine_ecriture;
DROP DOMAIN IF EXISTS qualite_intervenant;
DROP DOMAIN IF EXISTS role_intervenant;
DROP DOMAIN IF EXISTS role_tiers;
DROP DOMAIN IF EXISTS statut_accord;
DROP DOMAIN IF EXISTS statut_appel_prime;
DROP DOMAIN IF EXISTS statut_approvisionnement;
DROP DOMAIN IF EXISTS statut_carte;
DROP DOMAIN IF EXISTS statut_carte_pro;
DROP DOMAIN IF EXISTS statut_commission;
DROP DOMAIN IF EXISTS statut_compte;
DROP DOMAIN IF EXISTS statut_compte_production;
DROP DOMAIN IF EXISTS statut_dossier;
DROP DOMAIN IF EXISTS statut_ecriture;
DROP DOMAIN IF EXISTS statut_entite;
DROP DOMAIN IF EXISTS statut_envoi;
DROP DOMAIN IF EXISTS statut_evenement;
DROP DOMAIN IF EXISTS statut_exercice;
DROP DOMAIN IF EXISTS statut_facture;
DROP DOMAIN IF EXISTS statut_facture_commission;
DROP DOMAIN IF EXISTS statut_immobilisation;
DROP DOMAIN IF EXISTS statut_intervenant;
DROP DOMAIN IF EXISTS statut_ligne_facture;
DROP DOMAIN IF EXISTS statut_ordonnance;
DROP DOMAIN IF EXISTS statut_ordre_paiement;
DROP DOMAIN IF EXISTS statut_pec;
DROP DOMAIN IF EXISTS statut_police;
DROP DOMAIN IF EXISTS statut_prestataire;
DROP DOMAIN IF EXISTS statut_production_carte;
DROP DOMAIN IF EXISTS statut_prospect;
DROP DOMAIN IF EXISTS statut_quittance;
DROP DOMAIN IF EXISTS statut_rdv;
DROP DOMAIN IF EXISTS statut_reclamation;
DROP DOMAIN IF EXISTS statut_sinistre;
DROP DOMAIN IF EXISTS statut_validation;
DROP DOMAIN IF EXISTS type_avenant;
DROP DOMAIN IF EXISTS type_bureau;
DROP DOMAIN IF EXISTS type_compte;
DROP DOMAIN IF EXISTS type_coordonnee;
DROP DOMAIN IF EXISTS type_couverture;
DROP DOMAIN IF EXISTS type_garantie;
DROP DOMAIN IF EXISTS type_journal;
DROP DOMAIN IF EXISTS type_mouvement_effectif;
DROP DOMAIN IF EXISTS type_mouvement_portefeuille;
DROP DOMAIN IF EXISTS type_operation_org;
DROP DOMAIN IF EXISTS type_pec;
DROP DOMAIN IF EXISTS type_quittance;
DROP DOMAIN IF EXISTS type_sinistre;
DROP DOMAIN IF EXISTS vue_carnet;
