-- Sous-lot 2.6 (suite) : factures d'achat, immobilisations et amortissements, dépôt et paiement des déclarations de taxes
-- (CDC § 11.8, 11.14, 11.19 ; FIN-RG-033, 034, 093, 094, 140 à 147).

-- Up Migration

-- FIN-RG-145, 146 : un bien de faible valeur passé en charge reste suivi à l'inventaire (CA-FIN-24)
ALTER DOMAIN statut_immobilisation DROP CONSTRAINT statut_immobilisation_check;
ALTER DOMAIN statut_immobilisation ADD CONSTRAINT statut_immobilisation_check CHECK (VALUE IN ('EN_SERVICE', 'CEDE', 'MIS_AU_REBUT', 'PASSE_EN_CHARGE'));
-- Une ligne de plan par bien et par exercice : dotations cumulées de l'exercice (FIN-RG-142, 143)
CREATE UNIQUE INDEX plan_amortissement_exercice ON plan_amortissement (immobilisation_id, exercice_id);
ALTER TABLE immobilisation ADD CONSTRAINT immobilisation_cumul_ck CHECK (cumul_amortissements >= 0 AND cumul_amortissements <= valeur_origine);
ALTER TABLE mouvement_immobilisation ADD CONSTRAINT mouvement_immobilisation_type_ck
  CHECK (type IN ('ACQUISITION', 'PASSAGE_CHARGE', 'SORTIE_REMPLACEMENT', 'TRANSFERT', 'REVISION', 'DEPRECIATION', 'CESSION', 'REBUT'));
-- FIN-RG-094 : date de dépôt enregistrée avec sa référence
ALTER TABLE declaration_taxe ADD COLUMN date_depot date;
COMMENT ON COLUMN declaration_taxe.date_depot IS 'Date de dépôt de la déclaration (FIN-RG-094)';
ALTER TABLE declaration_taxe ADD CONSTRAINT declaration_taxe_statut_ck CHECK (statut IN ('PREPAREE', 'VALIDEE', 'DEPOSEE', 'PAYEE', 'REJETEE'));
-- Modèles de règlement : condition codifiée (COMPTANT, J30, J30FM, J45FM, LE10…) (FIN-RG-101)
ALTER TABLE modele_reglement ADD CONSTRAINT modele_reglement_condition_ck CHECK (condition ~ '^(COMPTANT|J[0-9]{1,3}|J[0-9]{1,3}FM|LE[0-9]{1,2})$');

-- Down Migration

ALTER TABLE modele_reglement DROP CONSTRAINT modele_reglement_condition_ck;
ALTER TABLE declaration_taxe DROP CONSTRAINT declaration_taxe_statut_ck;
ALTER TABLE declaration_taxe DROP COLUMN date_depot;
ALTER TABLE mouvement_immobilisation DROP CONSTRAINT mouvement_immobilisation_type_ck;
ALTER TABLE immobilisation DROP CONSTRAINT immobilisation_cumul_ck;
DROP INDEX plan_amortissement_exercice;
ALTER DOMAIN statut_immobilisation DROP CONSTRAINT statut_immobilisation_check;
ALTER DOMAIN statut_immobilisation ADD CONSTRAINT statut_immobilisation_check CHECK (VALUE IN ('EN_SERVICE', 'CEDE', 'MIS_AU_REBUT'));
