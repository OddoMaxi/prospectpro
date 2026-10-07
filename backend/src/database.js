const { Pool, types } = require('pg');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const LIEUX_DATA = require('./data/lieux');
const { PROFESSIONS, SECTEURS } = require('./data/referentiels');
const { normalize } = require('./utils/text');

// DATE → chaîne 'YYYY-MM-DD' (évite les décalages de fuseau), BIGINT/NUMERIC → nombre
types.setTypeParser(1082, v => v);
types.setTypeParser(20, v => (v === null ? null : Number(v)));
types.setTypeParser(1700, v => (v === null ? null : Number(v)));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Converts ? placeholders to $1, $2, ... for PostgreSQL
function toPositional(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function makeHelpers(q) {
  return {
    async get(sql, args = []) {
      const result = await q.query(toPositional(sql), args);
      return result.rows[0] || null;
    },
    async all(sql, args = []) {
      const result = await q.query(toPositional(sql), args);
      return result.rows;
    },
    async run(sql, args = []) {
      const result = await q.query(toPositional(sql), args);
      return { rowsAffected: result.rowCount };
    },
  };
}

const { get, all, run } = makeHelpers(pool);

// Exécute fn({ get, all, run }) dans une transaction
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(makeHelpers(client));
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Wraps multiple statements in a single transaction (replaces libsql db.batch)
const db = {
  async batch(statements) {
    await tx(async t => {
      for (const stmt of statements) await t.run(stmt.sql, stmt.args);
    });
  }
};

const DEFAULT_PARAMETRES = [
  ['inactivite_jours',        '30', "Durée d'inactivité avant transfert temporaire (jours)", 'int'],
  ['inactivite_alerte_jours', '5',  "Alerte à l'administrateur avant le seuil d'inactivité (jours)", 'int'],
  ['interim_defaut_id',       '',   'Agent intérimaire par défaut (Séniors inactifs)', 'agent'],
  ['echeance_seuil_jours',    '60', 'Seuil « À échéance » (jours avant échéance)', 'int'],
  ['alertes_echeance_jours',  '60,45,30', 'Alertes échéance envoyées aux agents (jours, séparés par des virgules)', 'text'],
  ['delai_anticipation_mois', '1',  "Délai d'anticipation par défaut des nouveaux produits (mois)", 'int'],
  ['duree_contrat_mois',      '12', 'Durée par défaut des nouveaux contrats (mois)', 'int'],
  ['similarite_correction',   '0.85', 'Seuil de correction automatique Profession/Secteur (0 à 1)', 'float'],
  ['message_relance', 'Bonjour {client}, votre contrat {contrat} arrive à échéance le {echeance}. Renouvelez avant le {date_limite} pour bénéficier des meilleures conditions. Votre conseiller : {agent}.', 'Modèle de message de relance client (SMS / WhatsApp)', 'textarea'],
];

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
  // Statut : actif | inactif | suspendu | supprime
  await pool.query(`ALTER TABLE users
    ADD COLUMN IF NOT EXISTS statut TEXT DEFAULT 'actif',
    ADD COLUMN IF NOT EXISTS statut_depuis TIMESTAMP DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS interim_agent_id TEXT,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS deleted_by TEXT`);

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
    date_prospection DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
  // statut : prospect | en_cours | perdu | converti
  await pool.query(`ALTER TABLE prospects
    ADD COLUMN IF NOT EXISTS date_naissance DATE,
    ADD COLUMN IF NOT EXISTS client_id TEXT,
    ADD COLUMN IF NOT EXISTS converted_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS created_by TEXT,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS deleted_by TEXT`);

  await pool.query(`CREATE TABLE IF NOT EXISTS branches (
    id TEXT PRIMARY KEY,
    nom TEXT NOT NULL,
    description TEXT,
    taux_taxe REAL NOT NULL DEFAULT 0,
    statut TEXT NOT NULL DEFAULT 'actif',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP,
    deleted_by TEXT
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    nom TEXT NOT NULL,
    description TEXT,
    prime_annuelle REAL NOT NULL DEFAULT 0,
    taux_commission REAL NOT NULL DEFAULT 5.0,
    taux_commission_sous_agent REAL DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
  // taux_commission = taux total souscription ; *_junior = part du Junior (le Sénior touche la différence)
  // taux_taxe NULL = taux de la branche ; statut : actif | suspendu | supprime
  await pool.query(`ALTER TABLE products
    ADD COLUMN IF NOT EXISTS branche_id TEXT,
    ADD COLUMN IF NOT EXISTS prime_pure DOUBLE PRECISION DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cout_police DOUBLE PRECISION DEFAULT 0,
    ADD COLUMN IF NOT EXISTS accessoires DOUBLE PRECISION DEFAULT 0,
    ADD COLUMN IF NOT EXISTS taux_taxe REAL,
    ADD COLUMN IF NOT EXISTS taux_renouvellement REAL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS taux_renouvellement_junior REAL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS performance_active INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS taux_performance REAL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS taux_performance_junior REAL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS delai_anticipation_mois INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS statut TEXT DEFAULT 'actif',
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS deleted_by TEXT`);

  // Objectif = nombre de contrats par mois et par produit ; periode = horizon d'affichage
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

  await pool.query(`CREATE TABLE IF NOT EXISTS objectifs_historique (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    objectifs JSONB NOT NULL,
    valid_from TIMESTAMP,
    valid_to TIMESTAMP NOT NULL DEFAULT NOW(),
    modifie_par TEXT
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
    date_prospection TEXT,
    duree_contrat INTEGER,
    converted_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
  )`);
  // statut : actif | supprime (les contrats sont dans la table contrats)
  await pool.query(`ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS prospect_id TEXT,
    ADD COLUMN IF NOT EXISTS date_naissance DATE,
    ADD COLUMN IF NOT EXISTS statut TEXT DEFAULT 'actif',
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS deleted_by TEXT`);

  await pool.query(`CREATE TABLE IF NOT EXISTS lieux (
    id TEXT PRIMARY KEY,
    region TEXT NOT NULL,
    commune TEXT NOT NULL,
    quartier TEXT NOT NULL,
    UNIQUE(region, commune, quartier)
  )`);

  // ── Contrats ─────────────────────────────────────────────────────────────
  // statut stocké : actif | resilie (en cours / à échéance / renouvelé / expiré sont calculés, voir v_contrats)
  await pool.query(`CREATE TABLE IF NOT EXISTS contrats (
    id TEXT PRIMARY KEY,
    numero_contrat TEXT UNIQUE NOT NULL,
    client_id TEXT NOT NULL,
    duree_mois INTEGER NOT NULL DEFAULT 12,
    date_effet DATE NOT NULL,
    statut TEXT NOT NULL DEFAULT 'actif',
    resilie_le DATE,
    resilie_motif TEXT,
    resilie_par TEXT,
    created_by TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS contrat_produits (
    id TEXT PRIMARY KEY,
    contrat_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    nb_beneficiaires INTEGER NOT NULL DEFAULT 1
  )`);

  // Une période par souscription puis par renouvellement
  await pool.query(`CREATE TABLE IF NOT EXISTS contrat_periodes (
    id TEXT PRIMARY KEY,
    contrat_id TEXT NOT NULL,
    numero INTEGER NOT NULL,
    type TEXT NOT NULL,
    date_debut DATE NOT NULL,
    date_echeance DATE NOT NULL,
    prime_pure DOUBLE PRECISION NOT NULL DEFAULT 0,
    prime_commerciale DOUBLE PRECISION NOT NULL DEFAULT 0,
    prime_ttc DOUBLE PRECISION NOT NULL DEFAULT 0,
    montant_paye DOUBLE PRECISION NOT NULL DEFAULT 0,
    date_paiement_integral DATE,
    anticipe INTEGER NOT NULL DEFAULT 0,
    agent_id TEXT NOT NULL,
    statut TEXT NOT NULL DEFAULT 'active',
    created_by TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(contrat_id, numero)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS periode_lignes (
    id TEXT PRIMARY KEY,
    periode_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_nom TEXT,
    nb_beneficiaires INTEGER NOT NULL DEFAULT 1,
    prime_pure DOUBLE PRECISION NOT NULL DEFAULT 0,
    cout_police DOUBLE PRECISION NOT NULL DEFAULT 0,
    accessoires DOUBLE PRECISION NOT NULL DEFAULT 0,
    prime_commerciale DOUBLE PRECISION NOT NULL DEFAULT 0,
    taux_taxe REAL NOT NULL DEFAULT 0,
    taxes DOUBLE PRECISION NOT NULL DEFAULT 0,
    prime_ttc DOUBLE PRECISION NOT NULL DEFAULT 0
  )`);

  // Encaissements des primes clients
  await pool.query(`CREATE TABLE IF NOT EXISTS encaissements (
    id TEXT PRIMARY KEY,
    periode_id TEXT NOT NULL,
    date_paiement DATE NOT NULL,
    montant DOUBLE PRECISION NOT NULL,
    mode TEXT,
    reference TEXT,
    annule INTEGER NOT NULL DEFAULT 0,
    annule_le TIMESTAMP,
    annule_par TEXT,
    motif_annulation TEXT,
    created_by TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  // ── Commissions ──────────────────────────────────────────────────────────
  // nature : commission | performance | retrocession | ajustement
  // role   : direct (Sénior vendeur) | junior | senior (part du Sénior sur la vente d'un Junior)
  await pool.query(`CREATE TABLE IF NOT EXISTS commission_lignes (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    facture_id TEXT,
    mois TEXT NOT NULL,
    contrat_id TEXT,
    periode_id TEXT,
    client_id TEXT,
    product_id TEXT,
    product_nom TEXT,
    operation TEXT,
    nature TEXT NOT NULL,
    role TEXT,
    source_agent_id TEXT,
    base DOUBLE PRECISION NOT NULL DEFAULT 0,
    taux REAL NOT NULL DEFAULT 0,
    montant DOUBLE PRECISION NOT NULL DEFAULT 0,
    date_acquisition DATE NOT NULL,
    reverse_of TEXT,
    libelle TEXT,
    created_by TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  // statut : brouillon | validee | partiel | payee
  await pool.query(`CREATE TABLE IF NOT EXISTS factures (
    id TEXT PRIMARY KEY,
    numero TEXT UNIQUE NOT NULL,
    agent_id TEXT NOT NULL,
    mois TEXT NOT NULL,
    statut TEXT NOT NULL DEFAULT 'brouillon',
    total DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_paye DOUBLE PRECISION NOT NULL DEFAULT 0,
    validee_le TIMESTAMP,
    validee_par TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(agent_id, mois)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS facture_paiements (
    id TEXT PRIMARY KEY,
    facture_id TEXT NOT NULL,
    numero_recu TEXT UNIQUE NOT NULL,
    date_paiement DATE NOT NULL,
    montant DOUBLE PRECISION NOT NULL,
    mode TEXT NOT NULL,
    reference TEXT,
    created_by TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  // ── Affectations, audit, paramètres, notifications, référentiels ─────────
  // type : definitif | temporaire ; motif : creation | inactivite | suppression | manuel | restitution
  await pool.query(`CREATE TABLE IF NOT EXISTS affectations (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    agent_origine_id TEXT,
    agent_destinataire_id TEXT NOT NULL,
    date_debut TIMESTAMP NOT NULL DEFAULT NOW(),
    date_fin TIMESTAMP,
    type TEXT NOT NULL DEFAULT 'definitif',
    motif TEXT NOT NULL,
    auteur_id TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_affectations_entity ON affectations(entity_type, entity_id)');

  await pool.query(`CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMP DEFAULT NOW(),
    user_id TEXT,
    user_label TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    entity_label TEXT,
    avant JSONB,
    apres JSONB
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS parametres (
    cle TEXT PRIMARY KEY,
    valeur TEXT,
    libelle TEXT,
    type TEXT DEFAULT 'text',
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  // user_id NULL = destinée à tous les administrateurs
  await pool.query(`CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    type TEXT NOT NULL,
    titre TEXT NOT NULL,
    message TEXT,
    lien TEXT,
    dedup_key TEXT UNIQUE,
    lu_le TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  // type : profession | secteur ; statut : valide | a_valider
  await pool.query(`CREATE TABLE IF NOT EXISTS referentiels (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    valeur TEXT NOT NULL,
    valeur_norm TEXT NOT NULL,
    statut TEXT NOT NULL DEFAULT 'valide',
    created_by TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(type, valeur_norm)
  )`);

  // Vue contrat : période couvrante (dernière période soldée, sinon la souscription) et statut calculé
  await pool.query('DROP VIEW IF EXISTS v_contrats');
  await pool.query(`CREATE VIEW v_contrats AS
    SELECT c.*,
      cl.agent_id, cl.numero AS client_numero, cl.type AS client_type, cl.nom AS client_nom,
      cl.prenom AS client_prenom, cl.telephone AS client_telephone, cl.statut AS client_statut,
      cov.id AS periode_id, cov.numero AS periode_numero, cov.type AS periode_type,
      cov.date_debut AS periode_debut, cov.date_echeance AS date_echeance,
      cov.prime_pure, cov.prime_commerciale, cov.prime_ttc,
      cov.montant_paye AS periode_montant_paye, cov.date_paiement_integral AS periode_paiement_integral,
      der.id AS derniere_periode_id,
      (der.id <> cov.id) AS renouvellement_en_attente,
      (cov.date_echeance - CURRENT_DATE) AS jours_restants,
      CASE
        WHEN c.statut = 'resilie' THEN 'resilie'
        WHEN cov.date_echeance < CURRENT_DATE THEN 'expire'
        WHEN cov.date_echeance - CURRENT_DATE <= COALESCE(
          (SELECT NULLIF(valeur,'')::int FROM parametres WHERE cle = 'echeance_seuil_jours'), 60) THEN 'a_echeance'
        WHEN cov.type = 'renouvellement' THEN 'renouvele'
        ELSE 'en_cours'
      END AS statut_calcule
    FROM contrats c
    JOIN clients cl ON cl.id = c.client_id
    JOIN LATERAL (
      SELECT * FROM contrat_periodes p
      WHERE p.contrat_id = c.id AND p.statut = 'active'
      ORDER BY CASE WHEN p.date_paiement_integral IS NOT NULL THEN 2 WHEN p.numero = 1 THEN 1 ELSE 0 END DESC,
               p.numero DESC
      LIMIT 1
    ) cov ON true
    JOIN LATERAL (
      SELECT id FROM contrat_periodes p
      WHERE p.contrat_id = c.id AND p.statut = 'active'
      ORDER BY p.numero DESC LIMIT 1
    ) der ON true`);

  // ── Données initiales ───────────────────────────────────────────────────
  for (const [cle, valeur, libelle, type] of DEFAULT_PARAMETRES) {
    await pool.query(
      `INSERT INTO parametres (cle, valeur, libelle, type) VALUES ($1,$2,$3,$4)
       ON CONFLICT (cle) DO UPDATE SET libelle = EXCLUDED.libelle, type = EXCLUDED.type`,
      [cle, valeur, libelle, type]
    );
  }

  for (const [type, list] of [['profession', PROFESSIONS], ['secteur', SECTEURS]]) {
    for (const valeur of list) {
      await pool.query(
        `INSERT INTO referentiels (id, type, valeur, valeur_norm, statut) VALUES ($1,$2,$3,$4,'valide')
         ON CONFLICT (type, valeur_norm) DO NOTHING`,
        [uuidv4(), type, valeur, normalize(valeur)]
      );
    }
  }

  // Seed lieux — ON CONFLICT DO NOTHING remplace INSERT OR IGNORE de SQLite
  const lieuxCount = await pool.query('SELECT COUNT(*) c FROM lieux');
  if (Number(lieuxCount.rows[0].c) === 0) {
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

  // Reprise des données de la version précédente (une seule fois)
  const log = await require('./migrations/v2').migrationV2(tx);
  if (log && log.length) console.log(`Migration des données :\n  - ${log.join('\n  - ')}`);
}

module.exports = { db, pool, tx, initializeSchema, get, all, run, DEFAULT_PARAMETRES };
