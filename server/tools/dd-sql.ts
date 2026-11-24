/**
 * Génère la migration initiale (schéma cible complet) à partir de src/db/dictionnaire.json.
 *
 * Traduction des types logiques : DD § 2.2. Colonnes techniques : DD § 2.4.
 * Tables « journal » : ajout seul, garanti par déclencheur. Suppression physique interdite partout (DD § 2.5).
 *
 * Ce générateur ne sert qu'à produire la migration 0001. Toute évolution ultérieure du schéma
 * passe par une nouvelle migration écrite à la main (DEV-RG-002).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { Champ, Dictionnaire, Table } from '../src/db/dictionnaire-types.js';

const dd: Dictionnaire = JSON.parse(readFileSync(new URL('../src/db/dictionnaire.json', import.meta.url), 'utf8'));
const sortie = process.argv[2] ?? new URL('../migrations/1764000000000_schema-dd-1-1.sql', import.meta.url).pathname;

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const nomsTables = new Set(dd.tables.map(t => t.nom));
for (const e of Object.keys(dd.enumerations)) {
  if (nomsTables.has(e)) throw new Error(`Collision de nom entre l'énumération et la table ${e}`);
}

function typePhysique(c: Champ): string {
  const t = c.type;
  let m: RegExpMatchArray | null;
  if (t === 'UUID') return 'uuid';
  if ((m = t.match(/^(?:TEXTE|CODE)\((\d+)\)$/))) return `varchar(${m[1]})`;
  if (t === 'TEXT') return 'text';
  if (t === 'INTEGER') return 'integer';
  if (t === 'MONTANT') return 'bigint';
  if (t === 'TAUX') return 'numeric(9,6)';
  if ((m = t.match(/^DÉCIMAL\((\d+),(\d+)\)$/))) return `numeric(${m[1]},${m[2]})`;
  if (t === 'DATE') return 'date';
  if (t === 'HORODATAGE') return 'timestamptz';
  if (t === 'BOOLÉEN') return 'boolean';
  if (t === 'JSON') return 'jsonb';
  if (t === 'CHIFFRÉ') return 'bytea';
  if (t === 'EMPREINTE') return 'varchar(128)';
  if ((m = t.match(/^ÉNUM (.+)$/))) return m[1]!;
  if (t.startsWith('RÉF → ')) return 'uuid';
  throw new Error(`Type inconnu : ${t}`);
}

const out: string[] = [];
const p = (s = '') => out.push(s);

p(`-- Migration générée par tools/dd-sql.ts depuis le dictionnaire des données ${dd.version} du ${dd.date}.`);
p(`-- ${dd.tables.length} tables, ${dd.tables.reduce((s, t) => s + t.champs.length, 0)} champs métier, ${Object.keys(dd.enumerations).length} énumérations.`);
p('-- Ne pas modifier à la main : toute évolution passe par une nouvelle migration.');
p();
p('-- Up Migration');
p();
p('-- Énumérations (DD chapitre 13) : un domaine par liste fermée.');
for (const [nom, valeurs] of Object.entries(dd.enumerations)) {
  p(`CREATE DOMAIN ${nom} AS varchar(40) CHECK (VALUE IN (${valeurs.map(lit).join(', ')}));`);
}
p();
p(`-- Colonnes techniques (DD § 2.4) : renseignées par déclencheur.
-- L'application déclare l'utilisateur de la transaction par : SET LOCAL app.utilisateur_id = '<uuid>'.
CREATE FUNCTION app_utilisateur_courant() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.utilisateur_id', true), '')::uuid
$$;

CREATE FUNCTION colonnes_techniques_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.cree_le := COALESCE(NEW.cree_le, now());
  NEW.cree_par := COALESCE(NEW.cree_par, app_utilisateur_courant());
  RETURN NEW;
END $$;

-- Verrou optimiste : l'application met à jour avec « WHERE version_ligne = <version lue> » ;
-- la version est incrémentée ici et ne peut pas être forcée.
CREATE FUNCTION colonnes_techniques_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.cree_le <> OLD.cree_le OR NEW.cree_par IS DISTINCT FROM OLD.cree_par THEN
    RAISE EXCEPTION 'Colonnes de création non modifiables (%)', TG_TABLE_NAME USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.supprime_le IS NOT NULL AND NEW.supprime_le IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Ligne supprimée logiquement : modification interdite (%)', TG_TABLE_NAME USING ERRCODE = 'check_violation';
  END IF;
  NEW.version_ligne := OLD.version_ligne + 1;
  NEW.modifie_le := now();
  NEW.modifie_par := COALESCE(app_utilisateur_courant(), NEW.modifie_par);
  RETURN NEW;
END $$;

-- Aucune donnée métier n'est supprimée physiquement (DD § 2.4) ; les tables « journal » sont en ajout seul (DD § 2.5).
CREATE FUNCTION interdire_suppression() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Suppression physique interdite sur % : utiliser supprime_le', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END $$;

CREATE FUNCTION interdire_modification_journal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Table journal % : ajout seul (% interdit)', TG_TABLE_NAME, TG_OP USING ERRCODE = 'restrict_violation';
END $$;`);
p();

const fks: string[] = [];
const idx: string[] = [];

function creerTable(t: Table) {
  const cols: string[] = [];
  cols.push('id uuid PRIMARY KEY DEFAULT gen_random_uuid()');
  cols.push('cree_le timestamptz NOT NULL DEFAULT now()');
  cols.push('cree_par uuid');
  if (!t.journal) {
    cols.push('modifie_le timestamptz', 'modifie_par uuid', 'version_ligne integer NOT NULL DEFAULT 1', 'supprime_le timestamptz');
  }
  for (const c of t.champs) {
    cols.push(`${c.nom} ${typePhysique(c)}${c.obligatoire ? ' NOT NULL' : ''}`);
  }
  t.unicites.forEach((u, k) => cols.push(`CONSTRAINT ${t.nom}_uk${k + 1} UNIQUE (${u.join(', ')})`));

  p(`-- ${t.section} ${t.nom} – ${t.libelle}${t.prevu ? ' (Prévu : table vide)' : ''}${t.journal ? ' (journal : ajout seul)' : ''}`);
  p(`CREATE TABLE ${t.nom} (\n  ${cols.join(',\n  ')}\n);`);
  p(`COMMENT ON TABLE ${t.nom} IS ${lit(`${t.libelle}. ${t.role} [DD ${t.section} ; ${t.reglesServies}]`)};`);
  for (const c of t.champs) {
    p(`COMMENT ON COLUMN ${t.nom}.${c.nom} IS ${lit(c.description + (c.regle ? ` – ${c.regle}` : ''))};`);
  }
  p(`CREATE TRIGGER ${t.nom}_ins BEFORE INSERT ON ${t.nom} FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_insert();`);
  if (t.journal) {
    p(`CREATE TRIGGER ${t.nom}_journal BEFORE UPDATE OR DELETE ON ${t.nom} FOR EACH ROW EXECUTE FUNCTION interdire_modification_journal();`);
  } else {
    p(`CREATE TRIGGER ${t.nom}_upd BEFORE UPDATE ON ${t.nom} FOR EACH ROW EXECUTE FUNCTION colonnes_techniques_update();`);
    p(`CREATE TRIGGER ${t.nom}_del BEFORE DELETE ON ${t.nom} FOR EACH ROW EXECUTE FUNCTION interdire_suppression();`);
  }
  p();

  // Clés étrangères (créées après toutes les tables : le modèle comporte des références croisées)
  fks.push(`ALTER TABLE ${t.nom} ADD CONSTRAINT ${t.nom}_cree_par_fk FOREIGN KEY (cree_par) REFERENCES utilisateur(id);`);
  if (!t.journal) fks.push(`ALTER TABLE ${t.nom} ADD CONSTRAINT ${t.nom}_modifie_par_fk FOREIGN KEY (modifie_par) REFERENCES utilisateur(id);`);
  const premieres = new Set([...t.unicites, ...t.index].map(u => u[0]));
  for (const c of t.champs) {
    const ref = c.type.match(/^RÉF → (.+)$/)?.[1];
    if (!ref) continue;
    fks.push(`ALTER TABLE ${t.nom} ADD CONSTRAINT ${t.nom}_${c.nom}_fk FOREIGN KEY (${c.nom}) REFERENCES ${ref}(id);`);
    if (!premieres.has(c.nom)) idx.push(`CREATE INDEX ${t.nom}_${c.nom}_idx ON ${t.nom} (${c.nom});`);
  }
  t.index.forEach((u, k) => idx.push(`CREATE INDEX ${t.nom}_ix${k + 1} ON ${t.nom} (${u.join(', ')});`));
}

for (const t of dd.tables) creerTable(t);
p('-- Clés étrangères');
fks.forEach(f => p(f));
p();
p('-- Index (clés étrangères et index déclarés au DD)');
idx.forEach(x => p(x));
p();
p('-- Down Migration');
p();
for (const t of [...dd.tables].reverse()) p(`DROP TABLE IF EXISTS ${t.nom} CASCADE;`);
p('DROP FUNCTION IF EXISTS interdire_modification_journal(), interdire_suppression(), colonnes_techniques_update(), colonnes_techniques_insert(), app_utilisateur_courant();');
for (const nom of Object.keys(dd.enumerations)) p(`DROP DOMAIN IF EXISTS ${nom};`);

writeFileSync(sortie, out.join('\n') + '\n');
console.log(`Migration écrite : ${sortie} (${fks.length} clés étrangères, ${idx.length} index)`);
