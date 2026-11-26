-- Lot 3, sous-lot 3.2 : cartes d'assuré (CDC § 9.5 ; SAN-RG-011 à 019 ; CA-SAN-01, 20 ; maquettes SA-04, AS-02).

-- Up Migration

-- Une seule carte en cours par personne couverte ; un jeton de QR code unique
CREATE UNIQUE INDEX carte_assure_en_cours ON carte_assure (police_assure_id) WHERE statut <> 'REVOQUEE' AND supprime_le IS NULL;
CREATE UNIQUE INDEX carte_assure_jeton ON carte_assure (jeton_qr);
-- File de production (SA-04) : motif, lieu de retrait, dates de suivi (SAN-RG-015)
ALTER TABLE carte_assure ADD COLUMN motif_production varchar(30);
ALTER TABLE carte_assure ADD CONSTRAINT carte_assure_motif_ck CHECK (motif_production IS NULL OR motif_production IN ('DEMANDE_ASSURE', 'OFFICE', 'REMPLACEMENT_PERTE', 'REMPLACEMENT_VOL'));
ALTER TABLE carte_assure ADD COLUMN lieu_retrait varchar(20);
ALTER TABLE carte_assure ADD CONSTRAINT carte_assure_lieu_ck CHECK (lieu_retrait IS NULL OR lieu_retrait IN ('BUREAU', 'SIEGE', 'LIVRAISON'));
ALTER TABLE carte_assure ADD COLUMN bureau_retrait_id uuid REFERENCES bureau(id);
ALTER TABLE carte_assure ADD COLUMN adresse_livraison varchar(300);
ALTER TABLE carte_assure ADD COLUMN demandee_le timestamptz;
ALTER TABLE carte_assure ADD COLUMN imprimee_le timestamptz;
ALTER TABLE carte_assure ADD COLUMN remise_le timestamptz;
ALTER TABLE carte_assure ADD COLUMN revoquee_le timestamptz;
ALTER TABLE carte_assure ADD COLUMN motif_revocation varchar(30);
-- SAN-RG-017 : groupe sanguin seulement s'il est déclaré et que son impression est consentie
ALTER TABLE carte_assure ADD COLUMN groupe_sanguin varchar(3);
ALTER TABLE carte_assure ADD CONSTRAINT carte_assure_groupe_ck CHECK (groupe_sanguin IS NULL OR groupe_sanguin IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'));
COMMENT ON COLUMN carte_assure.groupe_sanguin IS 'Groupe sanguin imprimé – seulement s''il est déclaré et que l''assuré consent à son impression (SAN-RG-017)';

-- Down Migration

ALTER TABLE carte_assure DROP CONSTRAINT carte_assure_groupe_ck;
ALTER TABLE carte_assure DROP COLUMN groupe_sanguin;
ALTER TABLE carte_assure DROP COLUMN motif_revocation;
ALTER TABLE carte_assure DROP COLUMN revoquee_le;
ALTER TABLE carte_assure DROP COLUMN remise_le;
ALTER TABLE carte_assure DROP COLUMN imprimee_le;
ALTER TABLE carte_assure DROP COLUMN demandee_le;
ALTER TABLE carte_assure DROP COLUMN adresse_livraison;
ALTER TABLE carte_assure DROP COLUMN bureau_retrait_id;
ALTER TABLE carte_assure DROP CONSTRAINT carte_assure_lieu_ck;
ALTER TABLE carte_assure DROP COLUMN lieu_retrait;
ALTER TABLE carte_assure DROP CONSTRAINT carte_assure_motif_ck;
ALTER TABLE carte_assure DROP COLUMN motif_production;
DROP INDEX carte_assure_jeton;
DROP INDEX carte_assure_en_cours;
