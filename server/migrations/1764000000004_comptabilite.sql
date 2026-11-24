-- Sous-lot 2.1 : moteur comptable (CDC § 11.3 à 11.13). Écarts X19 à X22.

-- Up Migration

-- X19 : un événement peut produire plusieurs écritures dans des journaux différents (EVT-02 : EMI, ENC, COM).
ALTER TABLE schema_comptable DROP CONSTRAINT schema_comptable_uk1;
ALTER TABLE schema_comptable ADD CONSTRAINT schema_comptable_uk1 UNIQUE (code_evt, journal_id, date_effet);
ALTER TABLE ligne_schema ADD CONSTRAINT ligne_schema_sens_ck CHECK (sens IN ('D', 'C'));
ALTER TABLE ligne_schema ADD CONSTRAINT ligne_schema_compte_ck CHECK ((compte_id IS NULL) <> (compte_regle IS NULL));

-- X20 : l'unicité (journal, date comptable) du DD n'admettrait qu'une pièce par journal et par jour.
ALTER TABLE ecriture DROP CONSTRAINT ecriture_uk2;
-- X21 : ordre strict des pièces pour le scellement chaîné (FIN-RG-023).
ALTER TABLE ecriture ADD COLUMN rang bigint GENERATED ALWAYS AS IDENTITY;
ALTER TABLE ecriture ADD CONSTRAINT ecriture_rang_uk UNIQUE (rang);
CREATE INDEX ecriture_non_scellee ON ecriture (rang) WHERE scellement_lot_id IS NULL AND statut = 'VALIDEE';
CREATE INDEX ecriture_evenement ON ecriture (evenement_id);
CREATE INDEX ligne_ecriture_compte ON ligne_ecriture (compte_id);
CREATE INDEX ligne_ecriture_auxiliaire ON ligne_ecriture (compte_auxiliaire_id) WHERE compte_auxiliaire_id IS NOT NULL;
ALTER TABLE ligne_ecriture ADD CONSTRAINT ligne_ecriture_montant_ck CHECK (debit >= 0 AND credit >= 0 AND (debit = 0) <> (credit = 0));
ALTER TABLE lettrage ADD CONSTRAINT lettrage_uk UNIQUE (code);
-- X23 : TEXTE(10) au DD pour des valeurs « AUTOMATIQUE » (11 caractères) ou « MANUEL ».
ALTER TABLE lettrage ALTER COLUMN type TYPE varchar(12);
ALTER TABLE lettrage ADD CONSTRAINT lettrage_type_ck CHECK (type IN ('AUTOMATIQUE', 'MANUEL'));

-- X22 : comptes de chaque branche BCRG (primes, annulations, sinistres), paramétrables (FIN-RG-020 : aucun compte codé en dur).
CREATE TABLE branche_comptable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par uuid REFERENCES utilisateur(id),
  modifie_le timestamptz,
  modifie_par uuid REFERENCES utilisateur(id),
  version_ligne integer NOT NULL DEFAULT 1,
  supprime_le timestamptz,
  code varchar(30) NOT NULL UNIQUE,
  libelle varchar(120) NOT NULL,
  compte_primes_id uuid NOT NULL REFERENCES compte(id),
  compte_annulations_id uuid NOT NULL REFERENCES compte(id),
  compte_sinistres_id uuid NOT NULL REFERENCES compte(id)
);
CREATE TRIGGER branche_comptable_ins BEFORE INSERT ON branche_comptable FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();
CREATE TRIGGER branche_comptable_upd BEFORE UPDATE ON branche_comptable FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();
CREATE TRIGGER branche_comptable_del BEFORE DELETE ON branche_comptable FOR EACH ROW EXECUTE FUNCTION interdire_suppression();

-- FIN-RG-002 : seuls les comptes imputables et actifs reçoivent des écritures ; un collectif exige son auxiliaire (FIN-RG-003).
CREATE FUNCTION controler_ligne_ecriture() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c record; a record;
BEGIN
  SELECT imputable, en_sommeil, collectif, numero INTO c FROM compte WHERE id = NEW.compte_id;
  IF NOT c.imputable OR c.en_sommeil THEN
    RAISE EXCEPTION 'Compte % non imputable ou en sommeil (FIN-RG-002)', c.numero USING ERRCODE = 'check_violation';
  END IF;
  IF c.collectif AND NEW.compte_auxiliaire_id IS NULL THEN
    RAISE EXCEPTION 'Le collectif % exige un compte auxiliaire (FIN-RG-003)', c.numero USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.compte_auxiliaire_id IS NOT NULL THEN
    SELECT collectif_id, statut, code INTO a FROM compte_auxiliaire WHERE id = NEW.compte_auxiliaire_id;
    IF a.collectif_id <> NEW.compte_id THEN
      RAISE EXCEPTION 'L''auxiliaire % n''appartient pas au collectif %', a.code, c.numero USING ERRCODE = 'check_violation';
    END IF;
    IF a.statut = 'EN_SOMMEIL' THEN
      RAISE EXCEPTION 'Compte auxiliaire % en sommeil (FIN-RG-014)', a.code USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ligne_ecriture_controle BEFORE INSERT ON ligne_ecriture FOR EACH ROW EXECUTE FUNCTION controler_ligne_ecriture();

-- FIN-RG-024 : une ligne d'écriture ne se modifie jamais, sauf son lettrage.
CREATE FUNCTION proteger_ligne_ecriture() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - 'lettrage_id' - 'modifie_le' - 'modifie_par' - 'version_ligne') <> (to_jsonb(OLD) - 'lettrage_id' - 'modifie_le' - 'modifie_par' - 'version_ligne') THEN
    RAISE EXCEPTION 'Ligne d''écriture inaltérable : corriger par contre-passation (FIN-RG-024)' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ligne_ecriture_protection BEFORE UPDATE ON ligne_ecriture FOR EACH ROW EXECUTE FUNCTION proteger_ligne_ecriture();

-- Une pièce validée ne change plus, sauf son rattachement à un lot de scellement ; seul un brouillard se valide.
CREATE FUNCTION proteger_ecriture() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.statut = 'VALIDEE' THEN
    IF (to_jsonb(NEW) - 'scellement_lot_id' - 'modifie_le' - 'modifie_par' - 'version_ligne') <> (to_jsonb(OLD) - 'scellement_lot_id' - 'modifie_le' - 'modifie_par' - 'version_ligne')
       OR (OLD.scellement_lot_id IS NOT NULL AND NEW.scellement_lot_id IS DISTINCT FROM OLD.scellement_lot_id) THEN
      RAISE EXCEPTION 'Écriture validée inaltérable : corriger par contre-passation (FIN-RG-024)' USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ecriture_protection BEFORE UPDATE ON ecriture FOR EACH ROW EXECUTE FUNCTION proteger_ecriture();

-- Pièce équilibrée obligatoire (FIN-RG-074), contrôlée à la validation de la transaction.
CREATE FUNCTION controler_equilibre() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e uuid; d bigint; c bigint; n int;
BEGIN
  e := COALESCE(NEW.ecriture_id, OLD.ecriture_id);
  SELECT COALESCE(sum(debit), 0), COALESCE(sum(credit), 0), count(*) INTO d, c, n FROM ligne_ecriture WHERE ecriture_id = e;
  IF d <> c OR n < 2 THEN
    RAISE EXCEPTION 'Pièce déséquilibrée (débit % ≠ crédit %) ou incomplète', d, c USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER ligne_ecriture_equilibre AFTER INSERT ON ligne_ecriture DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION controler_equilibre();

-- Down Migration

DROP TRIGGER ligne_ecriture_equilibre ON ligne_ecriture;
DROP FUNCTION controler_equilibre();
DROP TRIGGER ecriture_protection ON ecriture;
DROP FUNCTION proteger_ecriture();
DROP TRIGGER ligne_ecriture_protection ON ligne_ecriture;
DROP FUNCTION proteger_ligne_ecriture();
DROP TRIGGER ligne_ecriture_controle ON ligne_ecriture;
DROP FUNCTION controler_ligne_ecriture();
DROP TABLE branche_comptable;
ALTER TABLE lettrage DROP CONSTRAINT lettrage_type_ck;
ALTER TABLE lettrage ALTER COLUMN type TYPE varchar(10);
ALTER TABLE lettrage DROP CONSTRAINT lettrage_uk;
ALTER TABLE ligne_ecriture DROP CONSTRAINT ligne_ecriture_montant_ck;
DROP INDEX ligne_ecriture_auxiliaire;
DROP INDEX ligne_ecriture_compte;
DROP INDEX ecriture_evenement;
DROP INDEX ecriture_non_scellee;
ALTER TABLE ecriture DROP CONSTRAINT ecriture_rang_uk;
ALTER TABLE ecriture DROP COLUMN rang;
ALTER TABLE ecriture ADD CONSTRAINT ecriture_uk2 UNIQUE (journal_id, date_comptable);
ALTER TABLE ligne_schema DROP CONSTRAINT ligne_schema_compte_ck;
ALTER TABLE ligne_schema DROP CONSTRAINT ligne_schema_sens_ck;
ALTER TABLE schema_comptable DROP CONSTRAINT schema_comptable_uk1;
ALTER TABLE schema_comptable ADD CONSTRAINT schema_comptable_uk1 UNIQUE (code_evt, date_effet);
