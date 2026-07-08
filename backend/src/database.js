const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const LIEUX_DATA = require('./data/lieux');
const PROFESSIONS_DATA = require('./data/professions');
const SECTEURS_DATA = require('./data/secteurs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Converts ? placeholders to $1, $2, ... for PostgreSQL
function toPositional(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function get(sql, args = []) {
  const result = await pool.query(toPositional(sql), args);
  return result.rows[0] || null;
}

async function all(sql, args = []) {
  const result = await pool.query(toPositional(sql), args);
  return result.rows;
}

async function run(sql, args = []) {
  const result = await pool.query(toPositional(sql), args);
  return { rowsAffected: result.rowCount };
}

// Wraps multiple statements in a single transaction (replaces libsql db.batch)
const db = {
  async batch(statements) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const stmt of statements) {
        await client.query(toPositional(stmt.sql), stmt.args);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
};

async function initializeSchema() {
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    nom TEXT NOT NULL,
    prenom TEXT NOT NULL,
    email TEXT UNIQUE,
    telephone TEXT,
    role TEXT NOT NULL DEFAULT 'agent',
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    must_change_password INTEGER DEFAULT 1,
    objectif_mensuel INTEGER DEFAULT 0,
    objectif_annuel INTEGER DEFAULT 0,
    taux_commission REAL DEFAULT 5.0,
    is_active INTEGER DEFAULT 1,
    type_agent TEXT DEFAULT 'physique',
    raison_sociale TEXT,
    representant_legal TEXT,
    parent_agent_id TEXT,
    taux_commission_parent REAL DEFAULT 0,
    sexe TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS prospects (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    type TEXT NOT NULL,
    nom TEXT NOT NULL,
    prenom TEXT,
    siret TEXT,
    nom_contact TEXT,
    prenom_contact TEXT,
    telephone TEXT,
    email TEXT,
    adresse TEXT,
    ville TEXT,
    code_postal TEXT,
    secteur_activite TEXT,
    notes TEXT,
    statut TEXT DEFAULT 'prospect',
    montant_potentiel REAL DEFAULT 0,
    taux_commission REAL DEFAULT 5.0,
    produit_id TEXT,
    lieu_residence_commune TEXT,
    lieu_residence_quartier TEXT,
    lieu_activite_commune TEXT,
    lieu_activite_quartier TEXT,
    siege_social_commune TEXT,
    siege_social_quartier TEXT,
    niveau_interet TEXT,
    profession TEXT,
    sexe TEXT,
    numero TEXT,
    cout_police_potentiel REAL DEFAULT 0,
    accessoire_potentiel REAL DEFAULT 0,
    date_prospection DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    nom TEXT NOT NULL,
    description TEXT,
    prime_annuelle REAL NOT NULL DEFAULT 0,
    taux_commission REAL NOT NULL DEFAULT 5.0,
    taux_commission_sous_agent REAL DEFAULT 0,
    cout_police REAL DEFAULT 0,
    montant_accessoire REAL DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS agent_product_objectives (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    objectif_mensuel INTEGER DEFAULT 0,
    periode TEXT NOT NULL DEFAULT 'annuel',
    objectif_annuel INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(agent_id, product_id)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS prospect_products (
    id TEXT PRIMARY KEY,
    prospect_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    nb_beneficiaires INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    numero TEXT UNIQUE,
    agent_id TEXT NOT NULL,
    type TEXT NOT NULL,
    nom TEXT NOT NULL,
    prenom TEXT,
    nom_contact TEXT,
    prenom_contact TEXT,
    telephone TEXT,
    email TEXT,
    secteur_activite TEXT,
    lieu_residence_commune TEXT,
    lieu_residence_quartier TEXT,
    lieu_activite_commune TEXT,
    lieu_activite_quartier TEXT,
    siege_social_commune TEXT,
    siege_social_quartier TEXT,
    profession TEXT,
    sexe TEXT,
    numero_contrat TEXT,
    date_effet TEXT,
    date_fin TEXT,
    prime_totale REAL DEFAULT 0,
    commission_totale REAL DEFAULT 0,
    taux_commission REAL DEFAULT 0,
    cout_police_total REAL DEFAULT 0,
    accessoire_total REAL DEFAULT 0,
    statut_renouvellement TEXT DEFAULT 'en_attente',
    date_prospection TEXT,
    duree_contrat INTEGER,
    converted_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS client_products (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    product_id TEXT,
    product_nom TEXT,
    nb_beneficiaires INTEGER DEFAULT 1,
    prime_payee REAL DEFAULT 0,
    commission REAL DEFAULT 0,
    cout_police REAL DEFAULT 0,
    accessoire REAL DEFAULT 0
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS lieux (
    id TEXT PRIMARY KEY,
    region TEXT NOT NULL,
    commune TEXT NOT NULL,
    quartier TEXT NOT NULL,
    UNIQUE(region, commune, quartier)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS professions (
    id TEXT PRIMARY KEY,
    nom TEXT NOT NULL UNIQUE
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS secteurs_activite (
    id TEXT PRIMARY KEY,
    nom TEXT NOT NULL UNIQUE
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS commissions (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    type TEXT DEFAULT 'direct',
    source_agent_id TEXT,
    montant_du REAL NOT NULL DEFAULT 0,
    montant_paye REAL DEFAULT 0,
    statut TEXT DEFAULT 'non_paye',
    date_paiement TEXT,
    reference_paiement TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS commission_payments (
    id TEXT PRIMARY KEY,
    commission_id TEXT NOT NULL,
    date_paiement TEXT NOT NULL,
    reference TEXT,
    libelle TEXT,
    montant REAL NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  // Migrations additives — nécessaires car CREATE TABLE IF NOT EXISTS est un no-op
  // sur les tables déjà créées en production (VPS)
  await pool.query(`ALTER TABLE prospects ADD COLUMN IF NOT EXISTS cout_police_potentiel REAL DEFAULT 0`);
  await pool.query(`ALTER TABLE prospects ADD COLUMN IF NOT EXISTS accessoire_potentiel REAL DEFAULT 0`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS cout_police REAL DEFAULT 0`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS montant_accessoire REAL DEFAULT 0`);
  await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS cout_police_total REAL DEFAULT 0`);
  await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS accessoire_total REAL DEFAULT 0`);
  await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS statut_renouvellement TEXT DEFAULT 'en_attente'`);
  await pool.query(`ALTER TABLE client_products ADD COLUMN IF NOT EXISTS cout_police REAL DEFAULT 0`);
  await pool.query(`ALTER TABLE client_products ADD COLUMN IF NOT EXISTS accessoire REAL DEFAULT 0`);

  // Seed lieux — ON CONFLICT DO NOTHING remplace INSERT OR IGNORE de SQLite
  for (const [region, communes] of Object.entries(LIEUX_DATA)) {
    for (const [commune, quartiers] of Object.entries(communes)) {
      const unique = [...new Set(quartiers)];
      for (const quartier of unique) {
        await pool.query(
          'INSERT INTO lieux (id, region, commune, quartier) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
          [uuidv4(), region, commune, quartier]
        );
      }
    }
  }

  // Seed professions et secteurs d'activité (liste de départ, complétée ensuite
  // automatiquement par les agents via la création de prospects)
  for (const nom of PROFESSIONS_DATA) {
    await pool.query('INSERT INTO professions (id, nom) VALUES ($1,$2) ON CONFLICT DO NOTHING', [uuidv4(), nom]);
  }
  for (const nom of SECTEURS_DATA) {
    await pool.query('INSERT INTO secteurs_activite (id, nom) VALUES ($1,$2) ON CONFLICT DO NOTHING', [uuidv4(), nom]);
  }

  const r = await pool.query("SELECT id FROM users WHERE role = 'admin'");
  if (r.rows.length === 0) {
    const hash = bcrypt.hashSync('Admin@2024', 10);
    await pool.query(
      `INSERT INTO users (id, nom, prenom, email, role, username, password_hash, must_change_password, objectif_mensuel, objectif_annuel)
       VALUES ($1, 'Administrateur', 'Système', 'admin@prospection.com', 'admin', 'admin', $2, 0, 0, 0)`,
      [uuidv4(), hash]
    );
    console.log('Admin créé — identifiant: admin, mot de passe: Admin@2024');
  }
}

module.exports = { db, pool, initializeSchema, get, all, run };
