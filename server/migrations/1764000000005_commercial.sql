-- Sous-lot 2.2 : intervenants et comptes de production (CDC § 7.5.1 à 7.5.7). Écart X24.

-- Up Migration

-- X24 : FIN-RG-012 (un auxiliaire par tiers et par collectif) contredit COM-RG-003 (un compte de production par bureau :
-- un agent à deux bureaux a deux auxiliaires sous le collectif des comptes de production). L'unicité est contrôlée
-- par l'application, sauf pour ce collectif.
ALTER TABLE compte_auxiliaire DROP CONSTRAINT compte_auxiliaire_uk2;
CREATE INDEX compte_auxiliaire_tiers_collectif ON compte_auxiliaire (tiers_id, collectif_id);

-- § 7.7 : solde ≥ 0 en base (pas de crédit de prime)
ALTER TABLE compte_production_agent ADD CONSTRAINT compte_production_solde_ck CHECK (solde >= 0);
-- COM-RG-001 : un seul gestionnaire actif par bureau
CREATE UNIQUE INDEX bureau_gestionnaire_actif ON bureau_gestionnaire (bureau_id) WHERE date_fin IS NULL AND supprime_le IS NULL;
-- Un intervenant en activité par fiche et par rôle
CREATE UNIQUE INDEX intervenant_actif ON intervenant (tiers_id, role) WHERE statut <> 'SORTI' AND supprime_le IS NULL;
CREATE INDEX mouvement_compte_production_compte ON mouvement_compte_production (compte_production_id, date_heure);
CREATE INDEX approvisionnement_compte_statut ON approvisionnement_compte (compte_production_id, statut);

-- X25 : compteur_numerotation.type_objet TEXTE(20) au DD, alors que RECU_APPROVISIONNEMENT ou MOUVEMENT_PORTEFEUILLE comptent 22 caractères.
ALTER TABLE compteur_numerotation ALTER COLUMN type_objet TYPE varchar(40);

-- Down Migration

DROP INDEX approvisionnement_compte_statut;
ALTER TABLE compteur_numerotation ALTER COLUMN type_objet TYPE varchar(20);
DROP INDEX mouvement_compte_production_compte;
DROP INDEX intervenant_actif;
DROP INDEX bureau_gestionnaire_actif;
ALTER TABLE compte_production_agent DROP CONSTRAINT compte_production_solde_ck;
DROP INDEX compte_auxiliaire_tiers_collectif;
ALTER TABLE compte_auxiliaire ADD CONSTRAINT compte_auxiliaire_uk2 UNIQUE (tiers_id, collectif_id);
