-- Compléments techniques du socle (lot 1), hors DD 1.1. Chaque ajout est signalé à la maîtrise d'ouvrage
-- (écarts X9 à X12 du suivi de réalisation) pour intégration au dictionnaire.

-- Up Migration

-- X9 – Journal chaîné : ordre strict des lignes pour recalculer la chaîne d'empreintes (§ 4.6, inaltérabilité).
ALTER TABLE journal_audit ADD COLUMN rang bigint GENERATED ALWAYS AS IDENTITY;
ALTER TABLE journal_audit ADD CONSTRAINT journal_audit_rang_uk UNIQUE (rang);
CREATE INDEX journal_audit_objet_idx ON journal_audit (objet_type, objet_id);
CREATE INDEX journal_audit_utilisateur_idx ON journal_audit (utilisateur_id, horodatage);

-- X10 – Opération soumise à validation : contenu proposé, appliqué seulement à la décision finale
-- (fusion, scission, changement de paramètre, modification de la fiche Compagnie…).
ALTER TABLE demande_validation ADD COLUMN donnees jsonb;
ALTER TABLE demande_validation ADD COLUMN decide_le timestamptz;
CREATE INDEX demande_validation_statut_idx ON demande_validation (statut, type_operation);

-- X11 – historique_organisation.valide_par : seconde validation exigée pour fusion, scission et déplacement
-- (ORG-RG-005) ; les autres opérations sont tracées à leur auteur seul.
ALTER TABLE historique_organisation ALTER COLUMN valide_par DROP NOT NULL;
ALTER TABLE historique_organisation ADD CONSTRAINT historique_organisation_validation_ck
  CHECK (operation NOT IN ('FUSION', 'SCISSION', 'DEPLACEMENT') OR (valide_par IS NOT NULL AND valide_par IS DISTINCT FROM cree_par));
CREATE INDEX historique_organisation_entite_idx ON historique_organisation (entite_type, entite_id, date_effet);

-- Paramètre portant une règle légale verrouillée : sens dans lequel la valeur est plus protectrice (ARC-RG-003).
ALTER TABLE parametre ADD COLUMN sens_protecteur varchar(10) CHECK (sens_protecteur IN ('HAUSSE', 'BAISSE'));

-- X12 – Double authentification (ORG-RG-022) : facteurs, codes à usage unique, sessions.
CREATE TABLE facteur_authentification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  utilisateur_id uuid NOT NULL REFERENCES utilisateur(id),
  type varchar(10) NOT NULL CHECK (type IN ('TOTP', 'SMS')),
  secret_chiffre bytea,                 -- TOTP : secret chiffré par enveloppe (domaine « securite »)
  codes_secours jsonb,                  -- empreintes Argon2id des codes de secours restants
  active_le timestamptz,                -- vide tant que le premier code n'a pas été vérifié
  revoque_le timestamptz
);
CREATE UNIQUE INDEX facteur_authentification_actif_uk ON facteur_authentification (utilisateur_id, type) WHERE revoque_le IS NULL;

CREATE TABLE code_usage_unique (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  utilisateur_id uuid REFERENCES utilisateur(id),
  tiers_id uuid REFERENCES tiers(id),
  objet varchar(40) NOT NULL,           -- CONNEXION, ACCEPTATION_DOCUMENT, VALIDATION_FACTURE…
  objet_id uuid,
  empreinte_code varchar(128) NOT NULL, -- jamais le code en clair
  telephone varchar(20),
  expire_le timestamptz NOT NULL,
  tentatives integer NOT NULL DEFAULT 0,
  utilise_le timestamptz
);
CREATE INDEX code_usage_unique_utilisateur_idx ON code_usage_unique (utilisateur_id, objet, cree_le);

CREATE TABLE session_utilisateur (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  utilisateur_id uuid NOT NULL REFERENCES utilisateur(id),
  etape varchar(20) NOT NULL CHECK (etape IN ('SECOND_FACTEUR', 'ENROLEMENT_TOTP', 'OUVERTE')),
  expire_le timestamptz NOT NULL,
  revoquee_le timestamptz,
  adresse_ip varchar(45),
  appareil varchar(200)
);
CREATE INDEX session_utilisateur_idx ON session_utilisateur (utilisateur_id, revoquee_le);

-- Chiffrement par enveloppe (rapport L0, partie G) : clés de données (DEK) chiffrées par la clé maîtresse
-- du domaine (Vault Transit en recette et production). Aucune clé en clair en base.
CREATE TABLE cle_donnees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  domaine varchar(20) NOT NULL CHECK (domaine IN ('finances', 'sante', 'conformite', 'securite', 'recherche')),
  version integer NOT NULL,
  cle_chiffree text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  CONSTRAINT cle_donnees_uk UNIQUE (domaine, version)
);
CREATE UNIQUE INDEX cle_donnees_active_uk ON cle_donnees (domaine) WHERE active;

-- Down Migration

DROP TABLE IF EXISTS cle_donnees, session_utilisateur, code_usage_unique, facteur_authentification;
ALTER TABLE parametre DROP COLUMN IF EXISTS sens_protecteur;
DROP INDEX IF EXISTS historique_organisation_entite_idx;
ALTER TABLE historique_organisation DROP CONSTRAINT IF EXISTS historique_organisation_validation_ck;
ALTER TABLE historique_organisation ALTER COLUMN valide_par SET NOT NULL;
DROP INDEX IF EXISTS demande_validation_statut_idx;
ALTER TABLE demande_validation DROP COLUMN IF EXISTS decide_le, DROP COLUMN IF EXISTS donnees;
DROP INDEX IF EXISTS journal_audit_utilisateur_idx, journal_audit_objet_idx;
ALTER TABLE journal_audit DROP CONSTRAINT IF EXISTS journal_audit_rang_uk;
ALTER TABLE journal_audit DROP COLUMN IF EXISTS rang;
