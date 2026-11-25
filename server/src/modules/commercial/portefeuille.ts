/**
 * Mouvements de portefeuille (CDC § 7.5.8 ; COM-RG-072 à 075 ; CA-COM-08, 15).
 *
 * Une fonction unique couvre :
 * - la CESSION entre agents généraux (qualité de titulaire), ou par un junior de sa qualité d'apporteur à un autre
 *   junior du même réseau seulement ;
 * - le TRANSFERT, par l'agent général, des clients d'un junior de son réseau : départ sans cession, suspension,
 *   inactivité prolongée ou accord écrit du junior ;
 * - la RÉAFFECTATION d'office par la Direction commerciale (agent sorti sans repreneur : cellule Canal digital).
 * Tout le portefeuille, une partie (liste de polices) ; date d'effet, motif, prix éventuel simplement enregistré ;
 * validation par la Direction commerciale. Les commissions acquises restent au cédant ; les suivantes reviennent au
 * nouveau titulaire (les renouvellements lisent les intervenants en cours). Le client est informé par SMS.
 */
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger, interdit, nonTrouve } from '../../noyau/erreurs.js';
import { ajouterJours, aujourdhui, dateValide } from '../../noyau/dates.js';
import { journaliser } from '../../moteurs/audit.js';
import { attribuer } from '../../moteurs/numerotation.js';
import { notifier } from '../../moteurs/notifications.js';
import { entier } from '../../moteurs/parametres.js';
import { enregistrerOperation, soumettre } from '../../moteurs/validation.js';

export const OPERATION_MOUVEMENT = 'MOUVEMENT_PORTEFEUILLE';
export type TypeMouvement = 'CESSION' | 'TRANSFERT' | 'REAFFECTATION';
export type CasTransfert = 'DEPART' | 'SUSPENSION' | 'INACTIVITE' | 'ACCORD_ECRIT';

interface Intervenant { id: string; role: string; statut: string; rattachement_id: string | null; tiers_id: string; nom: string; telephone: string | null }
const lire = async (q: Executant, id: string): Promise<Intervenant> => {
  const i = (await q.query<Intervenant>(
    `SELECT i.id, i.role, i.statut, i.rattachement_id, i.tiers_id, trim(t.nom || ' ' || COALESCE(t.prenoms, '')) AS nom, t.telephone
       FROM intervenant i JOIN tiers t ON t.id = i.tiers_id WHERE i.id = $1 AND i.supprime_le IS NULL`, [id])).rows[0];
  if (!i) throw nonTrouve('Intervenant');
  return i;
};

/** Qualité transmise par le mouvement : titulaire entre agents (ou réaffectation), apporteur entre juniors. */
const qualiteDe = (cedant: Intervenant) => (cedant.role === 'JUNIOR' ? 'APPORTEUR' : 'TITULAIRE');

/** Polices où le cédant détient la qualité transmise, dans le périmètre demandé (toutes si aucune liste). */
async function policesDuPerimetre(q: Executant, cedantId: string, qualite: string, polices?: string[]) {
  return (await q.query<{ police_id: string; numero: string }>(
    `SELECT pi.police_id, p.numero FROM police_intervenant pi JOIN police p ON p.id = pi.police_id
      WHERE pi.intervenant_id = $1 AND pi.qualite = $2 AND pi.date_fin IS NULL AND p.statut IN ('ACTIVE', 'ECHUE')
        AND ($3::uuid[] IS NULL OR pi.police_id = ANY($3)) ORDER BY p.numero`, [cedantId, qualite, polices?.length ? polices : null])).rows;
}

export async function proposerMouvement(q: Executant, acteur: Acteur, demandeur: { intervenantId?: string; directionCommerciale?: boolean }, d: {
  type: TypeMouvement; cedantId: string; cessionnaireId: string; polices?: string[]; dateEffet: string; motif: string; prix?: number;
  casTransfert?: CasTransfert; accordDocumentId?: string;
}) {
  exiger(d.motif?.trim(), 'MOTIF_REQUIS', 'Motif obligatoire (COM-RG-074)');
  exiger(dateValide(d.dateEffet), 'DATE_INVALIDE', 'Date d\'effet invalide');
  exiger(d.prix === undefined || (Number.isInteger(d.prix) && d.prix >= 0), 'PRIX_INVALIDE', 'Prix en francs entiers');
  exiger(d.cedantId !== d.cessionnaireId, 'MEME_INTERVENANT', 'Le cédant et le cessionnaire sont distincts');
  const [cedant, cessionnaire] = [await lire(q, d.cedantId), await lire(q, d.cessionnaireId)];
  exiger(cessionnaire.statut === 'ACTIF', 'CESSIONNAIRE_INACTIF', 'Le cessionnaire doit être en activité');

  if (d.type === 'CESSION') {
    if (cedant.role === 'JUNIOR') {
      // Un junior ne cède sa qualité d'apporteur qu'à un junior du même réseau (CA-COM-15)
      exiger(cessionnaire.role === 'JUNIOR' && cessionnaire.rattachement_id === cedant.rattachement_id, 'HORS_RESEAU',
        'Un junior ne cède son portefeuille qu\'à un junior du même réseau (COM-RG-072)');
      if (demandeur.intervenantId !== cedant.id && demandeur.intervenantId !== cedant.rattachement_id) throw interdit('Seul le junior ou son agent général propose cette cession');
    } else {
      exiger(cedant.role === 'AGENT_GENERAL' && cessionnaire.role === 'AGENT_GENERAL', 'ROLES_INVALIDES', 'La cession de portefeuille se fait entre agents généraux');
      if (demandeur.intervenantId !== cedant.id && !demandeur.directionCommerciale) throw interdit('Seul l\'agent cédant propose la cession de son portefeuille');
    }
  } else if (d.type === 'TRANSFERT') {
    exiger(cedant.role === 'JUNIOR', 'ROLES_INVALIDES', 'Le transfert porte sur les clients d\'un junior');
    if (demandeur.intervenantId !== cedant.rattachement_id) throw interdit('Seul l\'agent général du junior transfère ses clients');
    exiger(cessionnaire.id === cedant.rattachement_id || (cessionnaire.role === 'JUNIOR' && cessionnaire.rattachement_id === cedant.rattachement_id), 'HORS_RESEAU',
      'Les clients d\'un junior vont à l\'agent général ou à un autre junior de son réseau');
    // COM-RG-073 : quatre cas seulement
    switch (d.casTransfert) {
      case 'DEPART': exiger(cedant.statut === 'SORTI', 'CAS_INVALIDE', 'Le junior n\'est pas sorti du réseau'); break;
      case 'SUSPENSION': exiger(cedant.statut === 'SUSPENDU', 'CAS_INVALIDE', 'Le junior n\'est pas suspendu'); break;
      case 'INACTIVITE': {
        const mois = await entier(q, 'COM_INACTIVITE_JUNIOR_MOIS');
        const recent = await q.query(`SELECT 1 FROM dossier_souscription WHERE prepare_par_id = $1 AND cree_le > now() - make_interval(months => $2) LIMIT 1`, [cedant.id, mois]);
        exiger(!recent.rowCount, 'CAS_INVALIDE', `Le junior a préparé un dossier depuis moins de ${mois} mois`);
        break;
      }
      case 'ACCORD_ECRIT': {
        const doc = d.accordDocumentId ? await q.query('SELECT 1 FROM document WHERE id = $1 AND supprime_le IS NULL', [d.accordDocumentId]) : { rowCount: 0 };
        exiger(doc.rowCount, 'ACCORD_REQUIS', 'L\'accord écrit du junior doit être joint');
        break;
      }
      default: throw new ErreurMetier('CAS_REQUIS', 'Transfert possible seulement en cas de départ, suspension, inactivité prolongée ou accord écrit (COM-RG-073)', 422);
    }
  } else {
    exiger(demandeur.directionCommerciale, 'INTERDIT', 'La réaffectation d\'office relève de la Direction commerciale', 403);
    exiger(['AGENT_GENERAL', 'CANAL_DIGITAL'].includes(cessionnaire.role), 'ROLES_INVALIDES', 'Le portefeuille est réaffecté à un agent général ou à la cellule Canal digital (COM-RG-092)');
  }

  const qualite = d.type === 'TRANSFERT' ? 'APPORTEUR' : qualiteDe(cedant);
  const polices = await policesDuPerimetre(q, cedant.id, qualite, d.polices);
  exiger(polices.length, 'PERIMETRE_VIDE', 'Aucune police en cours dans ce périmètre');
  exiger(!d.polices?.length || polices.length === new Set(d.polices).size, 'PERIMETRE_INVALIDE', 'Certaines polices n\'appartiennent pas au portefeuille du cédant');
  const enCours = await q.query(
    `SELECT 1 FROM mouvement_portefeuille m WHERE m.cedant_id = $1 AND m.statut = 'EN_ATTENTE' AND m.perimetre->'polices' ?| $2::text[]`, [cedant.id, polices.map(p => p.police_id)]);
  exiger(!enCours.rowCount, 'MOUVEMENT_EN_COURS', 'Une partie de ces polices fait déjà l\'objet d\'un mouvement en attente de validation');

  const id = crypto.randomUUID();
  const numero = await attribuer(q, acteur, { type: 'MOUVEMENT_PORTEFEUILLE', annee: Number(aujourdhui().slice(0, 4)) }, { type: 'mouvement_portefeuille', id });
  const perimetre = { qualite, polices: polices.map(p => p.police_id), tout: !d.polices?.length, casTransfert: d.casTransfert ?? null, accordDocumentId: d.accordDocumentId ?? null };
  const demande = await soumettre(q, acteur, { typeOperation: OPERATION_MOUVEMENT, objetType: 'mouvement_portefeuille', objetId: id, montant: d.prix,
    donnees: { numero, type: d.type, cedant: cedant.nom, cessionnaire: cessionnaire.nom, polices: polices.length, dateEffet: d.dateEffet, motif: d.motif } });
  await q.query(
    `INSERT INTO mouvement_portefeuille (id, numero, type, cedant_id, cessionnaire_id, perimetre, date_effet, motif, prix, demande_validation_id, statut)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'EN_ATTENTE')`,
    [id, numero, d.type, cedant.id, cessionnaire.id, JSON.stringify(perimetre), d.dateEffet, d.motif.slice(0, 300), d.prix ?? null, demande.id]);
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'mouvement_portefeuille', objetId: id, apres: { numero, ...d, polices: polices.length } });
  return { id, numero, polices: polices.length, demandeValidation: demande.id };
}

enregistrerOperation(OPERATION_MOUVEMENT, {
  administrative: false,
  async appliquer(q, demande, acteur) {
    const m = (await q.query<{ id: string; numero: string; type: TypeMouvement; cedant_id: string; cessionnaire_id: string; perimetre: { qualite: string; polices: string[] }; date_effet: string }>(
      `SELECT id, numero, type, cedant_id, cessionnaire_id, perimetre, date_effet::text FROM mouvement_portefeuille WHERE id = $1 FOR UPDATE`, [demande.objet_id])).rows[0]!;
    const cessionnaire = await lire(q, m.cessionnaire_id);
    const bureau = (await q.query<{ bureau_id: string }>(
      `SELECT g.bureau_id FROM bureau_gestionnaire g WHERE g.intervenant_id = $1 AND g.date_fin IS NULL AND g.supprime_le IS NULL ORDER BY g.date_debut LIMIT 1`, [cessionnaire.id])).rows[0];
    const fin = ajouterJours(m.date_effet, -1);
    let n = 0;
    for (const policeId of m.perimetre.polices) {
      const pi = (await q.query<{ id: string; cle_repartition: string }>(
        `SELECT id, cle_repartition FROM police_intervenant WHERE police_id = $1 AND intervenant_id = $2 AND qualite = $3 AND date_fin IS NULL FOR UPDATE`,
        [policeId, m.cedant_id, m.perimetre.qualite])).rows[0];
      if (!pi) continue; // police sortie du portefeuille entre-temps (annulée, expirée, déjà cédée)
      await q.query('UPDATE police_intervenant SET date_fin = GREATEST(date_debut, $2::date) WHERE id = $1', [pi.id, fin]);
      if (m.perimetre.qualite === 'APPORTEUR' && cessionnaire.role === 'AGENT_GENERAL') {
        // Clients d'un junior repris par son agent général : la part d'apporteur revient au titulaire
        await q.query(`UPDATE police_intervenant SET cle_repartition = cle_repartition + $3 WHERE police_id = $1 AND intervenant_id = $2 AND qualite = 'TITULAIRE' AND date_fin IS NULL`,
          [policeId, cessionnaire.id, pi.cle_repartition]);
      } else {
        await q.query('INSERT INTO police_intervenant (police_id, intervenant_id, qualite, cle_repartition, date_debut) VALUES ($1,$2,$3,$4,$5)',
          [policeId, cessionnaire.id, m.perimetre.qualite, pi.cle_repartition, m.date_effet]);
      }
      // Le numéro de police ne change jamais (NUM-RG-006) ; le bureau de gestion suit le titulaire
      if (m.perimetre.qualite === 'TITULAIRE' && bureau) await q.query('UPDATE police SET bureau_gestion_id = $2 WHERE id = $1', [policeId, bureau.bureau_id]);
      // COM-RG-075 : le client est informé de son nouvel interlocuteur
      const c = (await q.query<{ souscripteur_id: string; numero: string; telephone: string | null }>(
        'SELECT p.souscripteur_id, p.numero, t.telephone FROM police p JOIN tiers t ON t.id = p.souscripteur_id WHERE p.id = $1', [policeId])).rows[0]!;
      if (c.telephone) {
        await notifier(q, { tiersId: c.souscripteur_id, code: 'CHANGEMENT_INTERLOCUTEUR', canal: 'SMS', adresse: c.telephone, objet: { type: 'police', id: policeId },
          variables: { police: c.numero, interlocuteur: cessionnaire.nom, telephone: cessionnaire.telephone ?? 'votre bureau' } }).catch(() => undefined);
      }
      n++;
    }
    await q.query(`UPDATE mouvement_portefeuille SET statut = 'VALIDE' WHERE id = $1`, [m.id]);
    await journaliser(q, { ...acteur.trace(), action: 'VALIDATION', objetType: 'mouvement_portefeuille', objetId: m.id, apres: { polices: n } });
  },
  async rejeter(q, demande, acteur) {
    await q.query(`UPDATE mouvement_portefeuille SET statut = 'REJETE' WHERE id = $1`, [demande.objet_id]);
    await journaliser(q, { ...acteur.trace(), action: 'REJET', objetType: 'mouvement_portefeuille', objetId: demande.objet_id });
  },
});

export async function listerMouvements(q: Executant, f: { intervenantId?: string; statut?: string }) {
  return (await q.query(
    `SELECT m.id, m.numero, m.type, m.statut, m.date_effet, m.motif, m.prix, jsonb_array_length(m.perimetre->'polices') AS polices, m.perimetre->>'qualite' AS qualite,
            m.perimetre->>'casTransfert' AS cas, m.cree_le, trim(tc.nom || ' ' || COALESCE(tc.prenoms, '')) AS cedant, trim(tn.nom || ' ' || COALESCE(tn.prenoms, '')) AS cessionnaire
       FROM mouvement_portefeuille m JOIN intervenant c ON c.id = m.cedant_id JOIN tiers tc ON tc.id = c.tiers_id JOIN intervenant n ON n.id = m.cessionnaire_id JOIN tiers tn ON tn.id = n.tiers_id
      WHERE ($1::uuid IS NULL OR m.cedant_id = $1 OR m.cessionnaire_id = $1 OR c.rattachement_id = $1) AND ($2::text IS NULL OR m.statut = $2)
      ORDER BY m.cree_le DESC LIMIT 300`, [f.intervenantId ?? null, f.statut ?? null])).rows;
}

/** Portefeuille d'un intervenant (polices en cours où il détient une qualité), pour choisir le périmètre. */
export async function portefeuille(q: Executant, intervenantId: string) {
  return (await q.query(
    `SELECT p.id, p.numero, p.statut, pi.qualite, trim(t.nom || ' ' || COALESCE(t.prenoms, '')) AS souscripteur, pr.libelle AS produit,
            (SELECT max(date_fin) FROM police_periode pp WHERE pp.police_id = p.id) AS echeance
       FROM police_intervenant pi JOIN police p ON p.id = pi.police_id JOIN tiers t ON t.id = p.souscripteur_id JOIN produit pr ON pr.id = p.produit_id
      WHERE pi.intervenant_id = $1 AND pi.date_fin IS NULL AND p.statut IN ('ACTIVE', 'ECHUE') ORDER BY t.nom`, [intervenantId])).rows;
}
