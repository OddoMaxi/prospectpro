-- Sous-lot 2.4 (suite) : avenant de correction, retrait d'un ayant droit, changement de souscripteur, résiliation
-- et renonciation (CDC § 8.8, 8.9, 8.11 ; PROD-RG-041, 045, 046, 061, 062, 074).

-- Up Migration

-- PROD-RG-061 : la ristourne éventuelle d'une résiliation suit le paramétrage du produit (prorata des jours non couverts)
ALTER TABLE produit ADD COLUMN ristourne_resiliation boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN produit.ristourne_resiliation IS 'Ristourne au prorata en cas de résiliation par la Compagnie (PROD-RG-061)';
-- Une commission reprise par ristourne est une ligne négative de type REPRISE (déduite de la facture suivante, COM-RG-121)
ALTER TABLE commission ADD CONSTRAINT commission_reprise_ck CHECK (montant >= 0 OR type = 'REPRISE');
-- Un avenant à régler (prime supplémentaire) n'a pas encore de quittance ; un seul avenant non réglé par police
CREATE UNIQUE INDEX avenant_a_regler ON avenant (police_id) WHERE difference_prime > 0 AND quittance_id IS NULL AND type = 'CORRECTION' AND supprime_le IS NULL;

-- Down Migration

DROP INDEX avenant_a_regler;
ALTER TABLE commission DROP CONSTRAINT commission_reprise_ck;
ALTER TABLE produit DROP COLUMN ristourne_resiliation;
