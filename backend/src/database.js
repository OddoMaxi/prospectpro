const { createClient } = require('@libsql/client');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '../../data');
const DB_PATH  = path.join(DATA_DIR, 'prospection.db');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const isRemote = !!process.env.TURSO_DATABASE_URL;
const db = createClient({
  url: isRemote ? process.env.TURSO_DATABASE_URL : ('file:' + DB_PATH.replace(/\\/g, '/')),
  authToken: process.env.TURSO_AUTH_TOKEN
});

async function initializeSchema() {
  await db.execute("PRAGMA foreign_keys = ON");

  await db.execute(`CREATE TABLE IF NOT EXISTS users (
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
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS prospects (
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
    date_prospection TEXT DEFAULT (date('now')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    nom TEXT NOT NULL,
    description TEXT,
    prime_annuelle REAL NOT NULL DEFAULT 0,
    taux_commission REAL NOT NULL DEFAULT 5.0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS agent_product_objectives (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    objectif_mensuel INTEGER DEFAULT 0,
    periode TEXT NOT NULL DEFAULT 'annuel',
    objectif_annuel INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(agent_id, product_id)
  )`);

  // Migrations bases existantes
  try { await db.execute("ALTER TABLE prospects ADD COLUMN produit_id TEXT"); } catch(_) {}
  try { await db.execute("ALTER TABLE users ADD COLUMN type_agent TEXT DEFAULT 'physique'"); } catch(_) {}
  try { await db.execute("ALTER TABLE users ADD COLUMN raison_sociale TEXT"); } catch(_) {}
  try { await db.execute("ALTER TABLE users ADD COLUMN representant_legal TEXT"); } catch(_) {}

  const r = await db.execute("SELECT id FROM users WHERE role = 'admin'");
  if (r.rows.length === 0) {
    const hash = bcrypt.hashSync('Admin@2024', 10);
    await db.execute({
      sql: `INSERT INTO users (id, nom, prenom, email, role, username, password_hash, must_change_password, objectif_mensuel, objectif_annuel)
            VALUES (?, 'Administrateur', 'Système', 'admin@prospection.com', 'admin', 'admin', ?, 0, 0, 0)`,
      args: [uuidv4(), hash]
    });
    console.log('Admin créé — identifiant: admin, mot de passe: Admin@2024');
  }
}

// Helper: get first row or null
async function get(sql, args = []) {
  const r = await db.execute({ sql, args });
  return r.rows.length > 0 ? r.rows[0] : null;
}

// Helper: get all rows
async function all(sql, args = []) {
  const r = await db.execute({ sql, args });
  return r.rows;
}

// Helper: execute write (INSERT/UPDATE/DELETE)
async function run(sql, args = []) {
  return db.execute({ sql, args });
}

module.exports = { db, initializeSchema, get, all, run };
