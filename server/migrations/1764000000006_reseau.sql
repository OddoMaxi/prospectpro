-- Sous-lot 2.9 : réseau commercial (CDC § 7.5.8 à 7.5.11) : prospects, codes prescripteurs, cartes professionnelles,
-- mouvements de portefeuille.

-- Up Migration

-- COM-RG-082 : statuts d'un code prescripteur (TEXTE(20) au DD)
ALTER TABLE code_prescripteur ADD CONSTRAINT code_prescripteur_statut_ck CHECK (statut IN ('ACTIF', 'SUSPENDU', 'RETIRE'));
-- COM-RG-100 : une carte en cours par intervenant ; le jeton du QR code est unique
CREATE UNIQUE INDEX carte_professionnelle_en_cours ON carte_professionnelle (intervenant_id) WHERE statut <> 'RETIREE' AND supprime_le IS NULL;
CREATE UNIQUE INDEX carte_professionnelle_jeton ON carte_professionnelle (jeton_qr);
ALTER TABLE carte_professionnelle ADD CONSTRAINT carte_professionnelle_modele_ck CHECK (modele IN ('AGENT_GENERAL', 'APPORTEUR'));
-- COM-RG-071 : recherche de l'exclusivité d'un tiers
CREATE INDEX prospect_exclusivite ON prospect (tiers_id, exclusivite_jusqu_au) WHERE statut NOT IN ('CONVERTI', 'PERDU') AND supprime_le IS NULL;

-- Down Migration

DROP INDEX prospect_exclusivite;
ALTER TABLE carte_professionnelle DROP CONSTRAINT carte_professionnelle_modele_ck;
DROP INDEX carte_professionnelle_jeton;
DROP INDEX carte_professionnelle_en_cours;
ALTER TABLE code_prescripteur DROP CONSTRAINT code_prescripteur_statut_ck;
