/**
 * Ordonnanceur (sous-lot 1.0) : traitements planifiés (pg-boss, file persistante en base, une seule exécution
 * par échéance même avec plusieurs serveurs) et distribution continue des événements métier.
 * Fuseau : Africa/Conakry. Chaque traitement s'exécute dans sa transaction, au nom du système, et il est journalisé.
 */
import { traiterImpayes } from './modules/production/nonPaiement.js';
import { basculerJournee } from './modules/finances/cloture.js';
import { PgBoss } from 'pg-boss';
import { transaction } from './db/pool.js';
import { Acteur } from './noyau/acteur.js';
import { ajouterJours, aujourdhui } from './noyau/dates.js';
import { journaliser } from './moteurs/audit.js';
import { distribuer } from './moteurs/evenements.js';
import { rafraichirSociete } from './modules/referentiels/societe.js';
import { traiterAgesLimites } from './modules/referentiels/foyer.js';
import { escaladerReclamations } from './modules/reclamations/service.js';
import { appliquerReorganisationsDifferees } from './modules/organisation/service.js';
import { scellerEcritures } from './modules/comptabilite/moteur.js';
import { expirerDossiers } from './modules/production/dossiers.js';
import { envoyerRappels, traiterEcheances } from './modules/production/renouvellement.js';
import { etablirFactures } from './modules/commercial/factures.js';

export interface Traitement { nom: string; cron: string; libelle: string; executer: () => Promise<unknown> }

const systeme = Acteur.systeme();
const quotidien = (nom: string, libelle: string, cron: string, fn: (q: Parameters<Parameters<typeof transaction>[1]>[0]) => Promise<unknown>): Traitement => ({
  nom, libelle, cron,
  executer: () => transaction(null, async q => {
    const resultat = await fn(q);
    await journaliser(q, { action: 'PARAMETRAGE', objetType: 'traitement_planifie', apres: { nom, resultat } });
    return resultat;
  }),
});

export const TRAITEMENTS: Traitement[] = [
  quotidien('scellement-ecritures', 'Scellement des écritures validées par lots chaînés (FIN-RG-023)', '*/5 * * * *', q => scellerEcritures(q)),
  quotidien('organisation-differee', 'Réorganisations validées dont la date d\'effet est atteinte (AD-06)', '1 0 * * *', q => appliquerReorganisationsDifferees(q)),
  quotidien('societe-du-jour', 'Fiche de la Compagnie : prise d\'effet des modifications datées', '5 0 * * *', q => rafraichirSociete(q)),
  quotidien('ages-limites', 'Enfants atteignant l\'âge limite : notification et sortie (REF-RG-009)', '0 6 * * *', q => traiterAgesLimites(q, systeme, aujourdhui())),
  quotidien('propositions-expiration', 'Expiration des propositions non finalisées (PROD-RG-001)', '10 0 * * *', q => expirerDossiers(q)),
  quotidien('echeances-polices', 'Échéances : renouvellement par versements, polices échues puis expirées (PROD-RG-025 à 027)', '20 0 * * *', q => traiterEcheances(q, systeme)),
  // Le 1er de chaque mois, factures du mois écoulé (COM-RG-042)
  quotidien('factures-commissions', 'Établissement des factures mensuelles de commissions (COM-RG-042)', '30 1 1 * *', q => {
    const d = new Date(); d.setUTCDate(0);
    return etablirFactures(q, systeme, d.toISOString().slice(0, 7));
  }),
  // Bascule de la journée écoulée : anomalies enregistrées, jamais bloquantes ce jour-là (CA-FIN-05)
  quotidien('journee-comptable', 'Bascule de la journée comptable et liste des anomalies (FIN-RG-041)', '0 0 * * *', q => basculerJournee(q, ajouterJours(aujourdhui(), -1))),
  // Article 30 : relances, mises en demeure à J+10, suspensions ; reprise le lendemain à midi du paiement (PROD-RG-028)
  quotidien('impayes-article-30', 'Primes impayées : relance, mise en demeure, suspension (PROD-RG-028)', '30 0 * * *', q => traiterImpayes(q, systeme)),
  quotidien('reprise-garanties', 'Reprise des polices suspendues payées la veille, à midi (PROD-RG-028)', '0 12 * * *', q => traiterImpayes(q, systeme)),
  quotidien('rappels-renouvellement', 'Rappels de renouvellement J-30, J-15, J-7, J-1 (PROD-RG-021)', '0 8 * * *', q => envoyerRappels(q)),
  quotidien('reclamations-escalade', 'Escalade des réclamations sans réponse à l\'échéance (§ 8.10)', '0 7 * * *', q => escaladerReclamations(q, systeme)),
];

export async function executerTraitement(nom: string): Promise<unknown> {
  const t = TRAITEMENTS.find(x => x.nom === nom);
  if (!t) throw new Error(`Traitement inconnu : ${nom}`);
  return t.executer();
}

/** Démarre l'ordonnanceur ; renvoie la fonction d'arrêt. */
export async function demarrerOrdonnanceur(databaseUrl: string, journal: (m: string) => void = console.log): Promise<() => Promise<void>> {
  const boss = new PgBoss({ connectionString: databaseUrl, schema: 'pgboss' });
  boss.on('error', e => journal(`[ordonnanceur] ${(e as Error).message}`));
  await boss.start();
  for (const t of TRAITEMENTS) {
    await boss.createQueue(t.nom);
    await boss.schedule(t.nom, t.cron, null, { tz: 'Africa/Conakry' });
    await boss.work(t.nom, async () => {
      const r = await t.executer();
      journal(`[ordonnanceur] ${t.libelle} : ${JSON.stringify(r)}`);
    });
  }

  // Distribution des événements : boucle courte, plusieurs serveurs possibles (SKIP LOCKED)
  let actif = true;
  const boucle = (async () => {
    while (actif) {
      try {
        const { traites, echecs } = await distribuer();
        if (echecs) journal(`[événements] ${echecs} distribution(s) en échec`);
        if (!traites && !echecs) await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        journal(`[événements] ${(e as Error).message}`);
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  })();

  return async () => {
    actif = false;
    await boucle;
    await boss.stop({ graceful: true });
  };
}
