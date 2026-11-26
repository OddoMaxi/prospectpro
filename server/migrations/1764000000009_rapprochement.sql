-- Sous-lot 2.6 (fin) : import des relevés et rapprochement bancaire (CDC § 11.15 ; FIN-RG-042, 043 ; CA-FIN-19).

-- Up Migration

-- A_RAPPROCHER : importée sans écriture ; RAPPROCHEE : liée à une écriture validée du compte de la banque ;
-- GENEREE : opération de la banque (frais, agios) comptabilisée par modèle, en attente de validation
ALTER TABLE releve_ligne ADD CONSTRAINT releve_ligne_statut_ck CHECK (statut IN ('A_RAPPROCHER', 'RAPPROCHEE', 'GENEREE'));
ALTER TABLE releve_ligne ADD CONSTRAINT releve_ligne_montant_ck CHECK (montant <> 0);
-- Une ligne d'écriture n'est rapprochée qu'une fois
CREATE UNIQUE INDEX releve_ligne_ecriture ON releve_ligne (ligne_ecriture_id) WHERE ligne_ecriture_id IS NOT NULL AND supprime_le IS NULL;
CREATE INDEX releve_ligne_banque_date ON releve_ligne (banque_operateur_id, date_operation) WHERE supprime_le IS NULL;

-- Down Migration

DROP INDEX releve_ligne_banque_date;
DROP INDEX releve_ligne_ecriture;
ALTER TABLE releve_ligne DROP CONSTRAINT releve_ligne_montant_ck;
ALTER TABLE releve_ligne DROP CONSTRAINT releve_ligne_statut_ck;
