/**
 * Démonstration du lot 1 : npm run demo
 *
 * Parcours commenté, de bout en bout, par l'API HTTP réelle, sur une base dédiée `prospectpro_demo`
 * recréée à chaque lancement (la base de développement et la production ne sont jamais touchées).
 * Les SMS sont simulés et affichés ; les codes TOTP sont calculés comme le ferait l'application du téléphone.
 */
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import pg from 'pg';
import { chargerConfig } from '../src/config.js';
import { fermerPool, getPool, initialiserPool, transaction } from '../src/db/pool.js';
import { migrer } from '../src/db/migrer.js';
import { installer } from '../src/amorcage/installer.js';
import { brancherAdaptateur, Simulateur } from '../src/moteurs/notifications.js';
import { codeTotp } from '../src/modules/auth/totp.js';
import { creerApplication } from '../src/app.js';

const BASE = (process.env.DEMO_ADMIN_URL ?? 'postgres://localhost:5432/postgres');
const URL_DEMO = BASE.replace(/\/[^/]*$/, '/prospectpro_demo');
const MDP = 'Demonstration#2026';
const AUJOURDHUI = new Date().toISOString().slice(0, 10);

// ------------------------------------------------------------------ affichage
const vert = (s: string) => `\x1b[32m${s}\x1b[0m`, rouge = (s: string) => `\x1b[31m${s}\x1b[0m`,
  gris = (s: string) => `\x1b[90m${s}\x1b[0m`, gras = (s: string) => `\x1b[1m${s}\x1b[0m`;
let etape = 0, echecs = 0;
const titre = (t: string) => console.log(`\n${gras(`${++etape}. ${t}`)}`);
const info = (t: string) => console.log(gris(`   ${t}`));
function constat(ok: boolean, t: string) {
  if (!ok) echecs++;
  console.log(`   ${ok ? vert('✔') : rouge('✘')} ${t}`);
}

// ------------------------------------------------------------------ base dédiée
const admin = new pg.Client({ connectionString: BASE });
await admin.connect();
await admin.query('DROP DATABASE IF EXISTS prospectpro_demo WITH (FORCE)');
await admin.query('CREATE DATABASE prospectpro_demo');
await admin.end();
await migrer(URL_DEMO, 'up');
initialiserPool(URL_DEMO);

const sms = new Simulateur();
brancherAdaptateur('SMS', { envoyer: async (a, t) => { info(`📱 SMS simulé vers ${a} : « ${t} »`); return sms.envoyer(a, t); } });

const config = chargerConfig({ NODE_ENV: 'development', DATABASE_URL: URL_DEMO, JWT_SECRET: randomBytes(32).toString('hex'), CLE_MAITRESSE_LOCALE: randomBytes(32).toString('hex') });
const { app } = creerApplication(config);
const serveur = app.listen(0);
const URL_API = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}/api`;

type Rep = { statut: number; corps: any };
async function api(methode: string, chemin: string, jeton?: string, corps?: unknown): Promise<Rep> {
  const r = await fetch(URL_API + chemin, {
    method: methode,
    headers: { 'Content-Type': 'application/json', ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}) },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const texte = await r.text();
  let c: unknown = texte;
  try { c = JSON.parse(texte); } catch { /* CSV ou vide */ }
  return { statut: r.status, corps: c };
}

const secrets = new Map<string, string>();
/** Connexion complète : mot de passe, code SMS (ou TOTP), puis enrôlement TOTP pour un compte privilégié. */
async function seConnecter(identifiant: string, bavard = false): Promise<string> {
  const r1 = await api('POST', '/auth/connexion', undefined, { identifiant, motDePasse: MDP });
  if (r1.statut !== 200) throw new Error(`${identifiant} : ${JSON.stringify(r1.corps)}`);
  if (r1.corps.methode === 'TOTP') {
    if (bavard) info('Mot de passe accepté ; second facteur demandé : code de l\'application d\'authentification');
    return (await api('POST', '/auth/second-facteur', r1.corps.jeton, { code: codeTotp(secrets.get(identifiant)!) })).corps.jeton;
  }
  const tel = (await getPool().query('SELECT telephone_verifie FROM utilisateur WHERE identifiant = $1', [identifiant])).rows[0].telephone_verifie;
  const code = sms.dernier(tel)!.texte.match(/\d{6}/)![0];
  if (bavard) info(`Mot de passe accepté ; l'utilisateur saisit le code reçu par SMS (${code})`);
  const r2 = await api('POST', '/auth/second-facteur', r1.corps.jeton, { code });
  if (r2.corps.etape === 'OUVERTE') return r2.corps.jeton;
  if (bavard) {
    constat(r2.corps.etape === 'ENROLEMENT_TOTP', 'Compte privilégié : enregistrement de l\'application d\'authentification exigé');
    const m = await api('GET', '/auth/moi', r2.corps.jeton);
    constat(m.statut === 401, 'Tant que ce n\'est pas fait, aucune fonction n\'est accessible');
  }
  const e = await api('POST', '/auth/totp/enrolement', r2.corps.jeton);
  secrets.set(identifiant, e.corps.secret);
  if (bavard) info(`QR code proposé à scanner (Google Authenticator, Microsoft Authenticator…) : secret ${e.corps.secret}`);
  const r3 = await api('POST', '/auth/totp/confirmation', r2.corps.jeton, { code: codeTotp(e.corps.secret) });
  if (bavard && r3.corps.codesSecours) info(`${r3.corps.codesSecours.length} codes de secours remis à l'utilisateur, à conserver hors ligne`);
  return r3.corps.jeton;
}

let n = 0;
/** Fiche tiers + compte + profils, comme le ferait l'administrateur dans l'écran Utilisateurs. */
function attendu(r: Rep, statut: number, quoi: string): Rep {
  if (r.statut !== statut) throw new Error(`${quoi} : ${r.statut} ${JSON.stringify(r.corps)}`);
  return r;
}
async function creerCompte(jAdmin: string, jValideur: string, identifiant: string, nom: string, fonctionId: string, profils: { code: string; perimetre?: object }[]) {
  const telephone = `+22462100${String(++n).padStart(4, '0')}`;
  const t = attendu(await api('POST', '/tiers', jAdmin, { nature: 'PHYSIQUE', nom, prenoms: 'Démo', telephone }), 201, 'fiche tiers');
  const u = attendu(await api('POST', '/admin/utilisateurs', jAdmin, { identifiant, tiersId: t.corps.id, typeCompte: 'INTERNE', fonctionId, motDePasse: MDP, telephone }), 201, 'compte');
  const tous = (await api('GET', '/admin/profils', jAdmin)).corps.profils as { id: string; code: string }[];
  for (const p of profils) {
    const a = attendu(await api('POST', `/admin/utilisateurs/${u.corps.id}/profils`, jAdmin, { profilId: tous.find(x => x.code === p.code)!.id, perimetre: p.perimetre }), 201, `profil ${p.code}`);
    if (a.corps.demandeValidation) {
      info(`Profil ${p.code} privilégié : attribution en attente de validation par une seconde personne`);
      attendu(await api('POST', `/admin/validations/${a.corps.demandeValidation}/decision`, jValideur, { decision: 'VALIDE' }), 200, 'validation');
    }
  }
  return u.corps.id as string;
}

try {
  titre('Installation initiale');
  const r = await transaction(null, q => installer(q,
    { identifiant: 'admin', nom: 'DIALLO', prenoms: 'Aïssatou', telephone: '+224620000001', motDePasse: MDP },
    { identifiant: 'direction', nom: 'CAMARA', prenoms: 'Mamadou', telephone: '+224620000002', motDePasse: MDP }));
  const nb = async (t: string) => (await getPool().query(`SELECT count(*)::int n FROM ${t}`)).rows[0].n;
  constat(!!r.utilisateurId && !!r.directionId, 'Comptes « admin » (Administrateur général) et « direction » (Direction générale) créés');
  info(`${await nb('departement')} départements, ${await nb('service')} services, ${await nb('profil')} profils, ${await nb('parametre')} paramètres chargés`);

  titre('Connexion de l\'administrateur (mot de passe + SMS + application d\'authentification)');
  const faux = await api('POST', '/auth/connexion', undefined, { identifiant: 'admin', motDePasse: 'mauvais' });
  constat(faux.statut === 401, `Mauvais mot de passe refusé, sans dire si l'identifiant existe (« ${faux.corps.message} »)`);
  const jAdmin = await seConnecter('admin', true);
  const moi = await api('GET', '/auth/moi', jAdmin);
  constat(moi.statut === 200, `Session ouverte : ${moi.corps.prenoms} ${moi.corps.nom}, ${moi.corps.droits.length} droits`);
  const jDg = await seConnecter('direction');
  info('La Direction générale se connecte de la même façon');

  titre('Organisation : création de fonctions dans l\'organigramme');
  const service = async (c: string) => (await getPool().query('SELECT id FROM service WHERE code = $1', [c])).rows[0].id as string;
  const fGest = attendu(await api('POST', '/admin/organisation', jAdmin, { type: 'FONCTION', code: 'GEST_PROD', libelle: 'Gestionnaire de production', parentId: await service('PROD_SOU') }), 201, 'fonction');
  const fCdg = attendu(await api('POST', '/admin/organisation', jAdmin, { type: 'FONCTION', code: 'CTRL_GESTION', libelle: 'Contrôleur de gestion', parentId: await service('FIN_CDG') }), 201, 'fonction');
  constat(true, 'Fonctions « Gestionnaire de production » (Souscription) et « Contrôleur de gestion » créées');
  const tSans = attendu(await api('POST', '/tiers', jAdmin, { nature: 'PHYSIQUE', nom: 'SOUMAH', prenoms: 'Fatoumata', telephone: '+224621999999' }), 201, 'fiche tiers');
  const sansFonction = await api('POST', '/admin/utilisateurs', jAdmin, { identifiant: 'sans.fonction', tiersId: tSans.corps.id, typeCompte: 'INTERNE', motDePasse: MDP });
  constat(sansFonction.statut === 422 && sansFonction.corps.code === 'FONCTION_REQUISE', `Compte interne sans fonction refusé (« ${sansFonction.corps.message} »)`);

  titre('Bureaux et cloisonnement par périmètre (CA-ORG-03)');
  const b1 = await api('POST', '/bureaux', jAdmin, { nom: 'Bureau Kaloum', type: 'BUREAU_DIRECT', adresse: 'Kaloum, Conakry' });
  const b2 = await api('POST', '/bureaux', jAdmin, { nom: 'Bureau Kankan', type: 'BUREAU_DIRECT', adresse: 'Kankan' });
  constat(b1.corps.code === '01' && b2.corps.code === '02', `Bureaux créés avec les codes ${b1.corps.code} et ${b2.corps.code}`);
  await creerCompte(jAdmin, jDg, 'gest.kaloum', 'SYLLA', fGest.corps.id, [{ code: 'GEST_PRODUCTION', perimetre: { bureaux: ['01'] } }]);
  info('Compte « gest.kaloum » créé : gestionnaire de production, limité au bureau 01');
  const jGest = await seConnecter('gest.kaloum');
  const liste = await api('GET', '/bureaux', jGest);
  constat(liste.corps.length === 1 && liste.corps[0].code === '01', `Il ne voit que le bureau ${liste.corps.map((b: any) => b.code).join(', ')}`);
  const direct = await api('GET', `/bureaux/${b2.corps.id}`, jGest);
  constat(direct.statut === 404, 'En appelant directement le serveur sur le bureau 02 : introuvable (404)');
  const creer = await api('POST', '/bureaux', jGest, { nom: 'Pirate', type: 'BUREAU_DIRECT', adresse: 'X' });
  constat(creer.statut === 403, 'Créer un bureau, fonction hors de ses droits : refusé (403)');
  const adm = await api('GET', '/admin/utilisateurs', jGest);
  constat(adm.statut === 403, 'Écran d\'administration des utilisateurs : refusé (403)');

  titre('Séparation des pouvoirs');
  const self = await api('POST', `/admin/utilisateurs/${moi.corps.id}/profils`, jAdmin,
    { profilId: ((await api('GET', '/admin/profils', jAdmin)).corps.profils as any[]).find(p => p.code === 'GEST_PRODUCTION').id });
  constat(self.statut === 403, `L'administrateur ne peut pas s'attribuer un profil (« ${self.corps.message} »)`);

  titre('Fiches tiers et détection des doublons');
  const t1 = await api('POST', '/tiers', jGest, { nature: 'PHYSIQUE', nom: 'BAH', prenoms: 'Ibrahima', date_naissance: '1985-02-03', telephone: '+224622334455' });
  const code = (await api('GET', `/tiers/${t1.corps.id}`, jGest)).corps.code_tiers;
  constat(t1.statut === 201, `Fiche « BAH Ibrahima » créée, code ${code}`);
  const t2 = await api('POST', '/tiers', jGest, { nature: 'PHYSIQUE', nom: 'Bah', prenoms: 'Ibrahim', date_naissance: '1985-02-03' });
  constat(t2.statut === 409 && t2.corps.code === 'DOUBLON_PROBABLE',
    `« Bah Ibrahim », même date de naissance : création bloquée, doublon probable (score ${t2.corps.details?.candidats?.[0]?.score})`);
  const homonyme = { nature: 'PHYSIQUE', nom: 'Bah', prenoms: 'Ibrahim', date_naissance: '1985-02-03', decisionDoublon: { motif: 'Homonyme vérifié sur pièce d\'identité' } };
  const t3 = await api('POST', '/tiers', jAdmin, homonyme);
  constat(t3.statut === 403, 'Passer outre exige le droit de validation des tiers : refusé à l\'administrateur, qui ne l\'a pas');
  const t4 = await api('POST', '/tiers', jGest, homonyme);
  constat(t4.statut === 201, 'Le gestionnaire de production (validation niveau 1, annexe B) passe outre avec un motif écrit, tracé au journal');

  titre('Paramètres : changement soumis au comité de paramétrage');
  const d = await api('POST', '/admin/parametres/SECURITE_ECHECS_MAX/changements', jAdmin, { valeur: '3', dateEffet: AUJOURDHUI, motif: 'Politique de sécurité renforcée' });
  constat(d.statut === 201, 'L\'administrateur propose : verrouillage du compte après 3 échecs au lieu de 5');
  const auto = await api('POST', `/admin/validations/${d.corps.id}/decision`, jAdmin, { decision: 'VALIDE' });
  constat(auto.statut === 403, 'Il ne peut pas valider sa propre proposition');
  await creerCompte(jAdmin, jDg, 'comite1', 'KEITA', fCdg.corps.id, [{ code: 'COMITE_PARAMETRAGE' }]);
  const jComite = await seConnecter('comite1');
  const corb = await api('GET', '/admin/validations', jComite);
  constat(corb.corps.some((x: any) => x.id === d.corps.id), 'La demande apparaît dans la corbeille d\'un membre du comité');
  await api('POST', `/admin/validations/${d.corps.id}/decision`, jComite, { decision: 'VALIDE' });
  const p = (await api('GET', '/admin/parametres', jAdmin)).corps.find((x: any) => x.code === 'SECURITE_ECHECS_MAX');
  constat(p.valeur === '3', `Validée par le comité : la valeur en vigueur est ${p.valeur}`);

  titre('Verrouillage après échecs de connexion');
  let tentative = 0, rep: Rep;
  do rep = await api('POST', '/auth/connexion', undefined, { identifiant: 'gest.kaloum', motDePasse: 'erreur' });
  while (++tentative < 10 && rep.corps.code !== 'COMPTE_SUSPENDU');
  constat(tentative === 3, `Compte suspendu au ${tentative}e échec (« ${rep.corps.message} »)`);
  const bon = await api('POST', '/auth/connexion', undefined, { identifiant: 'gest.kaloum', motDePasse: MDP });
  constat(bon.statut === 403, 'Même avec le bon mot de passe, la connexion est refusée');

  titre('Protections de la base de données');
  const supp = await getPool().query(`DELETE FROM tiers WHERE id = $1`, [t1.corps.id]).then(() => 'acceptée', (e: Error) => e.message);
  constat(supp !== 'acceptée', `Suppression physique d'une fiche refusée par la base (« ${supp} »)`);
  const modif = await getPool().query(`UPDATE journal_audit SET action = 'CONSULTATION' WHERE rang = 5`).then(() => 'acceptée', (e: Error) => e.message);
  constat(modif !== 'acceptée', `Modification du journal d'audit refusée par la base (« ${modif} »)`);

  titre('Journal d\'audit infalsifiable');
  const v1 = await api('GET', '/admin/audit/verification', jAdmin);
  constat(v1.corps.premiereAlteration === null, `${v1.corps.lignes} lignes, chaîne intègre`);
  const csv = await api('GET', '/admin/audit/export', jAdmin);
  constat(typeof csv.corps === 'string' && csv.corps.split('\n').length > 10, 'Export CSV du journal (lui-même tracé comme export)');
  info('Simulation d\'une falsification par quelqu\'un ayant un accès direct au serveur de base de données…');
  await getPool().query('ALTER TABLE journal_audit DISABLE TRIGGER USER');
  await getPool().query(`UPDATE journal_audit SET action = 'CONSULTATION' WHERE rang = 5`);
  await getPool().query('ALTER TABLE journal_audit ENABLE TRIGGER USER');
  const v2 = await api('GET', '/admin/audit/verification', jAdmin);
  constat(v2.corps.premiereAlteration === 5, `Falsification détectée : première ligne altérée n° ${v2.corps.premiereAlteration}`);

  console.log(`\n${echecs ? rouge(`${echecs} constat(s) en échec`) : vert(gras('Démonstration terminée : tous les constats sont conformes.'))}`);
  console.log(gris('La base « prospectpro_demo » est conservée pour consultation (psql prospectpro_demo) ; elle est recréée au prochain lancement.\n'));
} finally {
  serveur.close();
  await fermerPool();
}
process.exit(echecs ? 1 : 0);
