-- Lot 3, sous-lot 3.1 : prestataires agréés, professionnels de santé, nomenclatures, tarifs conventionnés
-- (CDC § 9.4, 9.4.1, 9.11 ; SAN-RG-001 à 010, 060 ; CA-SAN-08, 10, 11, 13).

-- Up Migration

-- SAN-RG-001, 005, 060 : types de prestataires paramétrables (écart X : table absente du DD 1.1, citée au § 9.14
-- « profil_type_prestataire ») ; chaque type fixe les professions admises, donc les profils, et ses options par défaut
CREATE TABLE type_prestataire (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid,
  modifie_le timestamptz,
  modifie_par uuid,
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  code varchar(30) NOT NULL,
  libelle varchar(120) NOT NULL,
  professions jsonb NOT NULL,
  options jsonb NOT NULL DEFAULT '[]',
  actif boolean NOT NULL DEFAULT true,
  CONSTRAINT type_prestataire_uk1 UNIQUE (code)
);
COMMENT ON TABLE type_prestataire IS 'Type de prestataire. Professions admises (donc profils) et options par défaut, fixés par la Compagnie. [SAN-RG-001, 005, 060.]';
COMMENT ON COLUMN type_prestataire.professions IS 'Professions admises dans ce type de structure (chacune porte un profil)';
COMMENT ON COLUMN type_prestataire.options IS 'Options proposées par défaut (GARDE, H24, URGENCES, TELECONSULTATION, HOSPITALISATION)';
CREATE TRIGGER type_prestataire_ins BEFORE INSERT ON type_prestataire FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER type_prestataire_upd BEFORE UPDATE ON type_prestataire FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER type_prestataire_del BEFORE DELETE ON type_prestataire FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- Une structure par fiche tiers ; un administrateur unique
CREATE UNIQUE INDEX prestataire_tiers ON prestataire (tiers_id) WHERE supprime_le IS NULL;
ALTER TABLE prestataire_option ADD CONSTRAINT prestataire_option_ck CHECK (option IN ('GARDE', 'H24', 'URGENCES', 'TELECONSULTATION', 'HOSPITALISATION'));
-- Professions reconnues (SAN-RG-004) ; un compte nominatif par professionnel et par structure
ALTER TABLE professionnel_sante ADD CONSTRAINT professionnel_sante_profession_ck
  CHECK (profession IN ('MEDECIN', 'CHIRURGIEN_DENTISTE', 'SAGE_FEMME', 'BIOLOGISTE', 'RADIOLOGUE', 'PHARMACIEN', 'OPTICIEN', 'KINESITHERAPEUTE', 'AUTRE'));
CREATE UNIQUE INDEX professionnel_sante_tiers ON professionnel_sante (tiers_id) WHERE supprime_le IS NULL;
CREATE UNIQUE INDEX exercice_professionnel_utilisateur ON exercice_professionnel (utilisateur_id);
-- SAN-RG-003 : un tarif porte sur un acte, un médicament ou un forfait, avec sa date d'effet
ALTER TABLE convention_tarif ADD CONSTRAINT convention_tarif_objet_ck CHECK (num_nonnulls(acte_code, medicament_id, forfait_code) = 1);
ALTER TABLE convention_tarif ADD CONSTRAINT convention_tarif_montant_ck CHECK (tarif > 0);
CREATE UNIQUE INDEX convention_tarif_unique ON convention_tarif (prestataire_id, COALESCE(acte_code, ''), COALESCE(medicament_id::text, ''), COALESCE(forfait_code, ''), date_effet) WHERE supprime_le IS NULL;
ALTER TABLE medicament ADD CONSTRAINT medicament_quantite_ck CHECK (quantite_max_ordonnance IS NULL OR quantite_max_ordonnance > 0);

-- Down Migration

ALTER TABLE medicament DROP CONSTRAINT medicament_quantite_ck;
DROP INDEX convention_tarif_unique;
ALTER TABLE convention_tarif DROP CONSTRAINT convention_tarif_montant_ck;
ALTER TABLE convention_tarif DROP CONSTRAINT convention_tarif_objet_ck;
DROP INDEX exercice_professionnel_utilisateur;
DROP INDEX professionnel_sante_tiers;
ALTER TABLE professionnel_sante DROP CONSTRAINT professionnel_sante_profession_ck;
ALTER TABLE prestataire_option DROP CONSTRAINT prestataire_option_ck;
DROP INDEX prestataire_tiers;
DROP TABLE type_prestataire;
