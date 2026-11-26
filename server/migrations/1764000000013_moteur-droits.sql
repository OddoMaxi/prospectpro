-- Lot 3, sous-lot 3.3 : moteur de droits et compteurs (CDC § 9.6 ; SAN-RG-020 à 027, 094 ; CA-SAN-02, 03, 24).

-- Up Migration

-- Rattachement des actes aux garanties : familles d'actes couvertes par une garantie de frais de soins
-- (vide = toutes les familles non couvertes par une autre garantie de la formule) ; écart : absent du DD 1.1
ALTER TABLE garantie ADD COLUMN familles_actes jsonb;
COMMENT ON COLUMN garantie.familles_actes IS 'Familles d''actes couvertes (CONSULTATION, ANALYSE, MEDICAMENT…) ; vide = garantie générale de frais de soins';

-- Compteurs à trois niveaux : garantie (par personne), personne (plafond annuel et nombre d'actes de la formule),
-- famille (plafond annuel famille, porté par l'assuré principal) ; plafonds facultatifs (garantie sans plafond)
ALTER TABLE compteur_garantie ADD COLUMN niveau varchar(10) NOT NULL DEFAULT 'GARANTIE';
ALTER TABLE compteur_garantie ADD CONSTRAINT compteur_niveau_ck CHECK (niveau IN ('GARANTIE', 'PERSONNE', 'FAMILLE') AND ((niveau = 'GARANTIE') = (garantie_id IS NOT NULL)));
ALTER TABLE compteur_garantie ALTER COLUMN plafond DROP NOT NULL;
ALTER TABLE compteur_garantie ADD COLUMN actes_max integer;
ALTER TABLE compteur_garantie DROP CONSTRAINT compteur_garantie_uk1;
CREATE UNIQUE INDEX compteur_garantie_uk1 ON compteur_garantie (police_assure_id, COALESCE(garantie_id, '00000000-0000-0000-0000-000000000000'), periode_id, niveau);
-- SAN-RG-020 : consommé + réservé ne dépasse jamais le plafond (contrainte en base) ; jamais négatif
ALTER TABLE compteur_garantie ADD CONSTRAINT compteur_plafond_ck CHECK (plafond IS NULL OR montant_consomme + montant_reserve <= plafond);
ALTER TABLE compteur_garantie ADD CONSTRAINT compteur_actes_ck CHECK (actes_max IS NULL OR actes_consommes + actes_reserves <= actes_max);
ALTER TABLE compteur_garantie ADD CONSTRAINT compteur_positif_ck CHECK (montant_consomme >= 0 AND montant_reserve >= 0 AND actes_consommes >= 0 AND actes_reserves >= 0);
ALTER TABLE exclusion ADD CONSTRAINT exclusion_uk UNIQUE (produit_id, code);

-- Down Migration

ALTER TABLE exclusion DROP CONSTRAINT exclusion_uk;
ALTER TABLE compteur_garantie DROP CONSTRAINT compteur_positif_ck;
ALTER TABLE compteur_garantie DROP CONSTRAINT compteur_actes_ck;
ALTER TABLE compteur_garantie DROP CONSTRAINT compteur_plafond_ck;
DROP INDEX compteur_garantie_uk1;
ALTER TABLE compteur_garantie ADD CONSTRAINT compteur_garantie_uk1 UNIQUE (police_assure_id, garantie_id, periode_id);
ALTER TABLE compteur_garantie DROP COLUMN actes_max;
ALTER TABLE compteur_garantie ALTER COLUMN plafond SET NOT NULL;
ALTER TABLE compteur_garantie DROP CONSTRAINT compteur_niveau_ck;
ALTER TABLE compteur_garantie DROP COLUMN niveau;
ALTER TABLE garantie DROP COLUMN familles_actes;
