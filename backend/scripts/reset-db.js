// Réinitialisation de la base (cahier des charges §9.1)
//  1. sauvegarde complète de toutes les tables dans backups/<date>.json ;
//  2. suppression de toutes les données métier et du paramétrage (branches, produits, taux…) ;
//  3. recréation de la structure à jour ;
//  4. conservation du ou des comptes administrateur (mot de passe inchangé).
// Les lieux et les valeurs validées des référentiels Profession / Secteur sont rechargés.
//
// Usage : node scripts/reset-db.js --confirm
// Docker : docker compose exec app node scripts/reset-db.js --confirm
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool, initializeSchema } = require('../src/database');

(async () => {
  if (!process.argv.includes('--confirm')) {
    console.error('Cette commande VIDE la base. Relancez avec --confirm pour continuer.');
    process.exit(2);
  }

  const { rows: tables } = await pool.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");

  // 1. Sauvegarde
  const dump = { date: new Date().toISOString(), tables: {} };
  for (const { tablename } of tables) {
    dump.tables[tablename] = (await pool.query(`SELECT * FROM "${tablename}"`)).rows;
  }
  const dir = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `sauvegarde-${dump.date.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(dump));
  console.log(`Sauvegarde : ${file}`);

  const admins = (await pool.query("SELECT * FROM users WHERE role = 'admin'")).rows;

  // 2. Suppression (les lieux sont conservés)
  await pool.query('DROP VIEW IF EXISTS v_contrats');
  for (const { tablename } of tables) {
    if (tablename === 'lieux') continue;
    await pool.query(`DROP TABLE IF EXISTS "${tablename}" CASCADE`);
  }

  // 3. Structure à jour
  await initializeSchema();

  // 4. Comptes administrateur d'origine
  if (admins.length) {
    await pool.query("DELETE FROM users WHERE role = 'admin'");
    for (const a of admins) {
      await pool.query(
        `INSERT INTO users (id, nom, prenom, email, telephone, role, username, password_hash, must_change_password, created_at)
         VALUES ($1,$2,$3,$4,$5,'admin',$6,$7,$8,$9)`,
        [a.id, a.nom, a.prenom, a.email, a.telephone, a.username, a.password_hash, a.must_change_password, a.created_at]);
    }
  }
  console.log(`Base réinitialisée. Compte(s) administrateur conservé(s) : ${admins.map(a => a.username).join(', ') || 'admin (nouveau)'}`);
  await pool.end();
})().catch(async e => { console.error(e); await pool.end(); process.exit(1); });
