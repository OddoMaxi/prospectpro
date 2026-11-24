/** Outils communs : base vidée, installation, acteurs, création rapide d'utilisateurs. */
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { fermerPool, getPool, initialiserPool, transaction } from '../src/db/pool.js';
import { installer } from '../src/amorcage/installer.js';
import { Acteur } from '../src/noyau/acteur.js';
import { attribuerProfil, creerUtilisateur } from '../src/modules/habilitations/service.js';
import { creerTiers } from '../src/modules/referentiels/tiers.js';
import { brancherAdaptateur, Simulateur } from '../src/moteurs/notifications.js';
import { decider } from '../src/moteurs/validation.js';
import { URL_TEST } from './env.js';

export const MDP = 'Motdepasse#2026';
export const sms = new Simulateur();
brancherAdaptateur('SMS', sms);

export async function ouvrir() {
  initialiserPool(URL_TEST);
  return getPool();
}
export const fermer = fermerPool;

export async function viderBase(): Promise<void> {
  const c = new pg.Client({ connectionString: URL_TEST });
  await c.connect();
  const t = await c.query(`SELECT string_agg(quote_ident(table_name), ', ') AS l FROM information_schema.tables
                            WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> 'pgmigrations'`);
  await c.query(`TRUNCATE ${t.rows[0].l} CASCADE`);
  await c.end();
}

let n = 0;
const tel = () => `+2246${String(Date.now() % 1e7).padStart(7, '0')}${n++ % 10}`.slice(0, 13);

/** Base vide, installée, avec l'administrateur initial. */
export async function installee() {
  await viderBase();
  const r = await transaction(null, q => installer(q,
    { identifiant: 'admin', nom: 'DIALLO', prenoms: 'Aïssatou', telephone: '+224620000001', motDePasse: MDP },
    { identifiant: 'direction', nom: 'CAMARA', prenoms: 'Mamadou', telephone: '+224620000002', motDePasse: MDP }));
  return { admin: new Acteur(r.utilisateurId), dg: new Acteur(r.directionId) };
}

export async function idProfil(code: string): Promise<string> {
  return (await getPool().query('SELECT id FROM profil WHERE code = $1', [code])).rows[0].id;
}

/**
 * Crée un utilisateur interne avec ses profils. Les profils privilégiés sont validés par `valideur`
 * (un second administrateur), comme l'exige ORG-RG-044.
 */
export async function utilisateur(admin: Acteur, identifiant: string, profils: { code: string; perimetre?: object }[] = [], valideur?: Acteur) {
  const id = await transaction(admin.utilisateurId, async q => {
    const fonction = (await q.query(`SELECT id FROM fonction WHERE code = 'ADMIN_GENERAL'`)).rows[0].id;
    const tiersId = await creerTiers(q, admin, { nature: 'PHYSIQUE', nom: identifiant.toUpperCase(), prenoms: 'Test', telephone: tel() });
    return creerUtilisateur(q, admin, { identifiant, tiersId, typeCompte: 'INTERNE', fonctionId: fonction, motDePasse: MDP, telephone: tel() });
  });
  for (const p of profils) {
    const r = await transaction(admin.utilisateurId, async q => attribuerProfil(q, admin, { utilisateurId: id, profilId: await idProfil(p.code), perimetre: p.perimetre as never }));
    if (r.demandeValidation) {
      if (!valideur) throw new Error(`Profil ${p.code} privilégié : un valideur est nécessaire`);
      await transaction(valideur.utilisateurId, q => decider(q, valideur, r.demandeValidation!, 'VALIDE'));
    }
  }
  return new Acteur(id);
}

export const jeton = () => randomBytes(32).toString('hex');
