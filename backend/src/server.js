require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initializeSchema } = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',').map(o => o.trim());
app.use(cors({
  origin: (origin, cb) => (!origin || allowedOrigins.includes(origin) ? cb(null, true) : cb(new Error('CORS'))),
  credentials: true
}));
app.use(express.json());

app.use('/api/auth',      require('./routes/auth'));
app.use('/api/agents',    require('./routes/agents'));
app.use('/api/prospects', require('./routes/prospects'));
app.use('/api/products',  require('./routes/products'));
app.use('/api/stats',     require('./routes/stats'));
app.use('/api/clients',   require('./routes/clients'));
app.get('/api/health',    (_, res) => res.json({ status: 'ok' }));

// Global error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

initializeSchema()
  .then(() => app.listen(PORT, () => console.log(`Serveur démarré sur http://localhost:${PORT}`)))
  .catch(err => { console.error('Échec de l\'initialisation de la base de données:', err); process.exit(1); });
