-- Sous-lot 1.5 : moteurs communs (événements, motifs de blocage, réclamations, documents). Écarts X17 et X18.

-- Up Migration

-- X17 : evenement_metier est une table journal (ajout seul) : l'événement publié ne change plus.
-- Sa distribution, qui évolue (tentatives, erreurs), est suivie par abonné dans une table technique.
CREATE TABLE distribution_evenement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  evenement_id uuid NOT NULL REFERENCES evenement_metier(id),
  abonne varchar(80) NOT NULL,
  statut varchar(20) NOT NULL DEFAULT 'A_TRAITER' CHECK (statut IN ('A_TRAITER', 'TRAITE', 'EN_ERREUR', 'ABANDONNE')),
  tentatives integer NOT NULL DEFAULT 0,
  prochain_essai timestamptz NOT NULL DEFAULT now(),
  erreur text,
  traite_le timestamptz,
  CONSTRAINT distribution_evenement_uk1 UNIQUE (evenement_id, abonne)
);
CREATE INDEX distribution_evenement_a_traiter ON distribution_evenement (prochain_essai) WHERE statut IN ('A_TRAITER', 'EN_ERREUR');
CREATE TRIGGER distribution_evenement_del BEFORE DELETE ON distribution_evenement FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- X18 : un motif « définitif » (ex. décès constaté) ne se lève pas ; le DD ne permet pas de le dire.
ALTER TABLE motif_blocage_ref ADD COLUMN definitif boolean NOT NULL DEFAULT false;
ALTER TABLE motif_blocage ADD CONSTRAINT motif_blocage_cible_ck CHECK ((carte_assure_id IS NULL) <> (tiers_id IS NULL));
CREATE INDEX motif_blocage_actif_tiers ON motif_blocage (tiers_id) WHERE date_fin IS NULL AND supprime_le IS NULL;
CREATE INDEX motif_blocage_actif_carte ON motif_blocage (carte_assure_id) WHERE date_fin IS NULL AND supprime_le IS NULL;

CREATE INDEX reclamation_suivi ON reclamation (statut, echeance);
CREATE INDEX document_objet ON document (objet_type, objet_id);

-- Down Migration

DROP INDEX document_objet;
DROP INDEX reclamation_suivi;
DROP INDEX motif_blocage_actif_carte;
DROP INDEX motif_blocage_actif_tiers;
ALTER TABLE motif_blocage DROP CONSTRAINT motif_blocage_cible_ck;
ALTER TABLE motif_blocage_ref DROP COLUMN definitif;
DROP TABLE distribution_evenement;
