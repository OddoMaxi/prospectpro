/** Démarrage : configuration validée, migrations appliquées, adaptateurs branchés, écoute HTTP. */
import 'dotenv/config';
import { chargerConfig } from './config.js';
import { initialiserPool } from './db/pool.js';
import { migrer } from './db/migrer.js';
import { brancherAdaptateur, Simulateur } from './moteurs/notifications.js';
import { creerApplication } from './app.js';

const config = chargerConfig();
initialiserPool(config.DATABASE_URL);
const appliquees = await migrer(config.DATABASE_URL, 'up');
if (appliquees.length) console.log(`Migrations appliquées : ${appliquees.join(', ')}`);

// Lot 1 : simulateurs. Les adaptateurs des fournisseurs (SMS, WhatsApp…) sont branchés à la signature des contrats (risque R01).
if (config.NODE_ENV === 'production') throw new Error('Aucun adaptateur SMS de production branché : démarrage en production refusé');
const sms = new Simulateur();
brancherAdaptateur('SMS', { envoyer: async (a, t) => { console.log(`[SMS simulé] ${a} : ${t}`); return sms.envoyer(a, t); } });

const { app } = creerApplication(config);
app.listen(config.PORT, () => console.log(`Prospect Pro (serveur cible) – port ${config.PORT}, environnement ${config.NODE_ENV}`));
