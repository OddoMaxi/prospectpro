-- Lot 2 (fin) : procédure de non-paiement de l'article 30 et alertes de conformité (CDC § 8.7, 7.5.9 ;
-- PROD-RG-028, COM-RG-084 ; CA-PROD-14, 15).

-- Up Migration

-- Mise en demeure : générée par le traitement quotidien (A_VALIDER), envoi validé par la gestion (EN_COURS),
-- levée par le paiement (LEVEE, reprise le lendemain à midi), close par la résiliation (RESILIEE) ou sans objet (ANNULEE)
ALTER TABLE mise_en_demeure ADD CONSTRAINT mise_en_demeure_statut_ck CHECK (statut IN ('A_VALIDER', 'EN_COURS', 'LEVEE', 'RESILIEE', 'ANNULEE'));
ALTER TABLE mise_en_demeure ADD COLUMN levee_effet_le timestamptz;
COMMENT ON COLUMN mise_en_demeure.levee_effet_le IS 'Reprise des garanties après paiement : le lendemain à midi (PROD-RG-028)';
ALTER TABLE mise_en_demeure ADD COLUMN validee_par uuid;
COMMENT ON COLUMN mise_en_demeure.validee_par IS 'Gestionnaire qui a validé l''envoi';
CREATE UNIQUE INDEX mise_en_demeure_active ON mise_en_demeure (quittance_id) WHERE statut IN ('A_VALIDER', 'EN_COURS') AND supprime_le IS NULL;

-- Alerte de conformité : motif lisible et données du contrôle ; une seule alerte ouverte par règle et par objet
ALTER TABLE alerte_conformite ADD COLUMN description text;
ALTER TABLE alerte_conformite ADD COLUMN donnees jsonb;
ALTER TABLE alerte_conformite ADD CONSTRAINT alerte_conformite_statut_ck CHECK (statut IN ('OUVERTE', 'EN_EXAMEN', 'CLOSE'));
ALTER TABLE alerte_conformite ADD CONSTRAINT alerte_conformite_gravite_ck CHECK (gravite IN ('FAIBLE', 'MOYENNE', 'FORTE'));
CREATE UNIQUE INDEX alerte_conformite_ouverte ON alerte_conformite (type, objet_id) WHERE statut <> 'CLOSE' AND supprime_le IS NULL;

-- La prime supplémentaire d'un avenant est désormais une quittance à terme légal émise à la validation
DROP INDEX avenant_a_regler;

-- Down Migration

CREATE UNIQUE INDEX avenant_a_regler ON avenant (police_id) WHERE difference_prime > 0 AND quittance_id IS NULL AND type = 'CORRECTION' AND supprime_le IS NULL;
DROP INDEX alerte_conformite_ouverte;
ALTER TABLE alerte_conformite DROP CONSTRAINT alerte_conformite_gravite_ck;
ALTER TABLE alerte_conformite DROP CONSTRAINT alerte_conformite_statut_ck;
ALTER TABLE alerte_conformite DROP COLUMN donnees;
ALTER TABLE alerte_conformite DROP COLUMN description;
DROP INDEX mise_en_demeure_active;
ALTER TABLE mise_en_demeure DROP COLUMN validee_par;
ALTER TABLE mise_en_demeure DROP COLUMN levee_effet_le;
ALTER TABLE mise_en_demeure DROP CONSTRAINT mise_en_demeure_statut_ck;
