-- Sous-lot 1.4 : compléments des référentiels (écarts X15 et X16).

-- Up Migration

-- X15 : la fiche Compagnie se renseigne progressivement ; REF-RG-010 bloque émissions et écritures tant qu'elle est incomplète.
-- Les champs obligatoires du DD sont donc contrôlés par l'application, et non par NOT NULL. Une seule fiche (une seule compagnie).
ALTER TABLE societe
  ALTER COLUMN raison_sociale DROP NOT NULL, ALTER COLUMN activite DROP NOT NULL, ALTER COLUMN forme_juridique DROP NOT NULL,
  ALTER COLUMN capital_social DROP NOT NULL, ALTER COLUMN numero_agrement DROP NOT NULL, ALTER COLUMN pays DROP NOT NULL,
  ALTER COLUMN region DROP NOT NULL, ALTER COLUMN commune DROP NOT NULL, ALTER COLUMN quartier DROP NOT NULL,
  ALTER COLUMN telephone DROP NOT NULL, ALTER COLUMN courriel DROP NOT NULL, ALTER COLUMN rccm DROP NOT NULL, ALTER COLUMN nif DROP NOT NULL;
CREATE UNIQUE INDEX societe_unique ON societe ((true));
CREATE INDEX societe_historique_champ_date ON societe_historique (champ, date_effet);

-- X16 : taxes applicables « paramétrables par produit » (§ 5.5) : le DD ne relie pas code_taxe et produit.
CREATE TABLE produit_taxe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid REFERENCES utilisateur(id),
  modifie_le timestamptz,
  modifie_par uuid REFERENCES utilisateur(id),
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  produit_id uuid NOT NULL REFERENCES produit(id),
  code_taxe_id uuid NOT NULL REFERENCES code_taxe(id),
  date_effet date NOT NULL,
  date_fin date,
  CONSTRAINT produit_taxe_uk1 UNIQUE (produit_id, code_taxe_id, date_effet)
);
CREATE TRIGGER produit_taxe_ins BEFORE INSERT ON produit_taxe FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER produit_taxe_upd BEFORE UPDATE ON produit_taxe FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER produit_taxe_del BEFORE DELETE ON produit_taxe FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- Rôles : un seul rôle actif d'un même type par tiers.
CREATE UNIQUE INDEX tiers_role_actif ON tiers_role (tiers_id, role) WHERE date_fin IS NULL AND supprime_le IS NULL;
-- FIN-RG-012 : un compte auxiliaire par tiers et par collectif.
ALTER TABLE compte_auxiliaire ADD CONSTRAINT compte_auxiliaire_uk2 UNIQUE (tiers_id, collectif_id);
ALTER TABLE compte_auxiliaire ADD CONSTRAINT compte_auxiliaire_statut_ck CHECK (statut IN ('ACTIF', 'EN_SOMMEIL', 'BLOQUE'));
-- REF-RG-005
ALTER TABLE coordonnee_paiement ADD CONSTRAINT coordonnee_paiement_statut_ck CHECK (statut IN ('A_VERIFIER', 'VERIFIEE', 'SUSPENDUE'));
CREATE UNIQUE INDEX coordonnee_paiement_principale ON coordonnee_paiement (tiers_id) WHERE principale AND statut = 'VERIFIEE' AND supprime_le IS NULL;
-- Catalogue
CREATE INDEX tarif_recherche ON tarif (formule_id, qualite, date_effet);
ALTER TABLE tarif ADD CONSTRAINT tarif_tranche_ck CHECK (age_min >= 0 AND age_max >= age_min);
ALTER TABLE produit ADD CONSTRAINT produit_ages_ck CHECK (age_min >= 0 AND age_max >= age_min);
ALTER TABLE lien_foyer ADD CONSTRAINT lien_foyer_distinct_ck CHECK (assure_principal_id <> membre_id);

-- Down Migration

ALTER TABLE lien_foyer DROP CONSTRAINT lien_foyer_distinct_ck;
ALTER TABLE produit DROP CONSTRAINT produit_ages_ck;
ALTER TABLE tarif DROP CONSTRAINT tarif_tranche_ck;
DROP INDEX tarif_recherche;
DROP INDEX coordonnee_paiement_principale;
ALTER TABLE coordonnee_paiement DROP CONSTRAINT coordonnee_paiement_statut_ck;
ALTER TABLE compte_auxiliaire DROP CONSTRAINT compte_auxiliaire_statut_ck;
ALTER TABLE compte_auxiliaire DROP CONSTRAINT compte_auxiliaire_uk2;
DROP INDEX tiers_role_actif;
DROP TABLE produit_taxe;
DROP INDEX societe_historique_champ_date;
DROP INDEX societe_unique;
ALTER TABLE societe
  ALTER COLUMN raison_sociale SET NOT NULL, ALTER COLUMN activite SET NOT NULL, ALTER COLUMN forme_juridique SET NOT NULL,
  ALTER COLUMN capital_social SET NOT NULL, ALTER COLUMN numero_agrement SET NOT NULL, ALTER COLUMN pays SET NOT NULL,
  ALTER COLUMN region SET NOT NULL, ALTER COLUMN commune SET NOT NULL, ALTER COLUMN quartier SET NOT NULL,
  ALTER COLUMN telephone SET NOT NULL, ALTER COLUMN courriel SET NOT NULL, ALTER COLUMN rccm SET NOT NULL, ALTER COLUMN nif SET NOT NULL;
