/**
 * Installation initiale : npm run installer
 * Variables : DATABASE_URL, puis ADMIN_* et DG_* (identifiant, nom, prénoms, téléphone, mot de passe).
 * Les mots de passe ne sont jamais passés en argument de ligne de commande (historique du terminal).
 */
import 'dotenv/config';
import { initialiserPool, fermerPool, transaction } from '../db/pool.js';
import { migrer } from '../db/migrer.js';
import { installer, type CompteInitial } from './installer.js';

const lire = (p: string): CompteInitial => {
  const v = (k: string) => {
    const x = process.env[`${p}_${k}`];
    if (!x) throw new Error(`Variable ${p}_${k} manquante`);
    return x;
  };
  return { identifiant: v('IDENTIFIANT'), nom: v('NOM'), prenoms: v('PRENOMS'), telephone: v('TELEPHONE'), motDePasse: v('MOT_DE_PASSE') };
};

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL manquant');
await migrer(url, 'up');
initialiserPool(url);
const r = await transaction(null, q => installer(q, lire('ADMIN'), lire('DG')));
console.log(`Installation terminée. Administrateur général : ${r.utilisateurId} ; Direction générale : ${r.directionId}.`);
console.log('À la première connexion, chaque compte privilégié enregistre son application d\'authentification (TOTP).');
await fermerPool();
