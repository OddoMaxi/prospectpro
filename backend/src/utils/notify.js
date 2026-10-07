const { v4: uuidv4 } = require('uuid');
const { run } = require('../database');

// Crée une notification (user_id null = tous les administrateurs). dedup_key évite les doublons.
async function notify({ userId = null, type, titre, message = null, lien = null, dedupKey = null }) {
  await run(
    `INSERT INTO notifications (id, user_id, type, titre, message, lien, dedup_key)
     VALUES (?,?,?,?,?,?,?) ON CONFLICT (dedup_key) DO NOTHING`,
    [uuidv4(), userId, type, titre, message, lien, dedupKey]
  );
}

module.exports = { notify };
