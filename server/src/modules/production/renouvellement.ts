/**
 * Renouvellement et vie du contrat (CDC § 8.7, 8.12 ; PROD-RG-020 à 027, 050 à 054, 060 ; COM-RG-041, 046 ;
 * CA-PROD-03 à 06, 18, 19 ; CA-COM-12, 23).
 *
 * Le système prépare tout mais n'ouvre jamais une période sans paiement et ne débite jamais le compte de production
 * d'un agent sans son action. Trois modes : compte de production (EVT-02), paiement direct du client (EVT-03),
 * affectation des versements programmés (EVT-03). Même numéro, nouvelle quittance, nouvelle période.
 */
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger, nonTrouve } from '../../noyau/erreurs.js';
import { ajouterAnnees, ajouterJours, aujourdhui } from '../../noyau/dates.js';
import { journaliser } from '../../moteurs/audit.js';
import { booleen, entier, valeurParametre } from '../../moteurs/parametres.js';
import { attribuer } from '../../moteurs/numerotation.js';
import { notifier } from '../../moteurs/notifications.js';
import { publier } from '../../moteurs/evenements.js';
import { genererDocument } from '../../moteurs/documents.js';
import { exigerFicheComplete } from '../referentiels/societe.js';
import { comptabiliser, type CompteResolu } from '../comptabilite/moteur.js';
import { ouvrirCompteAuxiliaire } from '../comptabilite/plan.js';
import { tarifer, type Tarification } from '../catalogue/service.js';
import { tresorerieDe, type Moyen } from '../finances/tresorerie.js';
import { compteComptable, compteProductionDuBureau, lireCompteProduction, mouvementer } from '../commercial/comptesProduction.js';

const gnf = (n: number) => `${n.toLocaleString('fr-FR').replace(/ /g, ' ')} GNF`;
const fr = (d: string) => d.split('-').reverse().join('/');

export interface PoliceVie {
  id: string; numero: string; statut: string; souscripteur_id: string; produit_id: string; formule_id: string; bureau_gestion_id: string;
  bureau: string; ne_pas_renouveler: boolean; echeance: string; telephone: string | null; branche: string; produit_ferme: string | null; formule_remplacement_id: string | null;
}

export async function lirePoliceVie(q: Executant, id: string, verrou = false): Promise<PoliceVie> {
  const r = await q.query<PoliceVie>(
    `SELECT p.id, p.numero, p.statut, p.souscripteur_id, p.produit_id, p.formule_id, p.bureau_gestion_id, b.code AS bureau, p.ne_pas_renouveler,
            (SELECT max(date_fin)::text FROM police_periode pp WHERE pp.police_id = p.id) AS echeance, t.telephone, pr.branche_bcrg AS branche,
            pr.date_fin_commercialisation::text AS produit_ferme, pr.formule_remplacement_id
       FROM police p JOIN bureau b ON b.id = p.bureau_gestion_id JOIN tiers t ON t.id = p.souscripteur_id JOIN produit pr ON pr.id = p.produit_id
      WHERE p.id = $1${verrou ? ' FOR UPDATE OF p' : ''}`, [id]);
  if (!r.rows[0]) throw nonTrouve('Police');
  return r.rows[0];
}

/** Assurés couverts à une date (sortis exclus) et leur qualité de tarif. */
async function assuresCouverts(q: Executant, policeId: string, date: string) {
  return (await q.query<{ tiers_id: string; qualite: 'ASSURE_PRINCIPAL' | 'CONJOINT' | 'ENFANT'; date_naissance: string }>(
    `SELECT pa.tiers_id, pa.qualite, t.date_naissance::text FROM police_assure pa JOIN tiers t ON t.id = pa.tiers_id
      WHERE pa.police_id = $1 AND (pa.date_sortie IS NULL OR pa.date_sortie > $2)`, [policeId, date])).rows;
}

/** PROD-RG-020 : prime de la période suivante, au tarif et à l'âge en vigueur, sur la formule de remplacement si la formule est fermée. */
export async function primeRenouvellement(q: Executant, p: PoliceVie, dateDebut: string): Promise<{ formuleId: string; tarif: Tarification }> {
  const formuleId = p.produit_ferme && p.produit_ferme <= dateDebut && p.formule_remplacement_id ? p.formule_remplacement_id : p.formule_id;
  const assures = await assuresCouverts(q, p.id, dateDebut);
  return { formuleId, tarif: await tarifer(q, formuleId, assures.map(a => ({ qualite: a.qualite, dateNaissance: a.date_naissance })), dateDebut) };
}

/** Versements programmés disponibles pour une police (PROD-RG-051, 053, 054). */
export async function disponibleVersements(q: Executant, policeId: string): Promise<number> {
  const r = (await q.query<{ recu: number; affecte: number }>(
    `SELECT (SELECT COALESCE(sum(montant), 0) FROM versement_programme WHERE police_id = $1 AND statut <> 'REMBOURSE')::bigint AS recu,
            (SELECT COALESCE(sum(prime_totale), 0) FROM quittance WHERE police_id = $1 AND mode_paiement = 'VERSEMENTS' AND statut <> 'ANNULEE')::bigint AS affecte`, [policeId])).rows[0]!;
  return Number(r.recu) - Number(r.affecte);
}

export type ModeRenouvellement =
  | { type: 'COMPTE_PRODUCTION' }
  | { type: 'PAIEMENT_DIRECT'; moyen: Moyen; banque?: string; reference?: string }
  | { type: 'VERSEMENTS' };

/** Compte « commissions à payer » d'un intervenant. */
async function compteCommissions(q: Executant, intervenantId: string): Promise<CompteResolu> {
  const r = (await q.query<{ compte_auxiliaire_id: string; collectif_id: string }>(
    `SELECT tr.compte_auxiliaire_id, a.collectif_id FROM intervenant i JOIN tiers_role tr ON tr.tiers_id = i.tiers_id AND tr.role = i.role AND tr.date_fin IS NULL
       JOIN compte_auxiliaire a ON a.id = tr.compte_auxiliaire_id WHERE i.id = $1`, [intervenantId])).rows[0];
  if (!r) throw new ErreurMetier('COMPTE_COMMISSIONS_ABSENT', 'Intervenant sans compte de commissions à payer', 422);
  return { compteId: r.collectif_id, auxiliaireId: r.compte_auxiliaire_id };
}

/** Compte des versements reçus d'avance du souscripteur (collectif 4191). */
async function compteVersements(q: Executant, acteur: Acteur, tiersId: string): Promise<CompteResolu> {
  const aux = await ouvrirCompteAuxiliaire(q, acteur, tiersId, await valeurParametre(q, 'COLLECTIF_VERSEMENTS_AVANCE'));
  const c = (await q.query<{ collectif_id: string }>('SELECT collectif_id FROM compte_auxiliaire WHERE id = $1', [aux.id])).rows[0]!;
  return { compteId: c.collectif_id, auxiliaireId: aux.id };
}

/**
 * Renouvelle la police (PROD-RG-022 à 026) : avant l'échéance (période contiguë) ou pendant la remise en vigueur
 * (période qui commence au paiement, jamais rétroactive). Au-delà, refus : nouvelle souscription (CA-PROD-06).
 */
export async function renouveler(q: Executant, acteur: Acteur, policeId: string, mode: ModeRenouvellement, jour = aujourdhui(), datePaiement = jour) {
  const p = await lirePoliceVie(q, policeId, true);
  exiger(!p.ne_pas_renouveler, 'NE_PAS_RENOUVELER', 'Le souscripteur a demandé le non-renouvellement de cette police (PROD-RG-060)');
  const preparation = await entier(q, 'PROD_RENOUVELLEMENT_PREPARATION_JOURS');
  const remise = await entier(q, 'PROD_DELAI_REMISE_VIGUEUR_JOURS');
  let dateDebut: string, remiseEnVigueur = false;
  if (p.statut === 'ACTIVE') {
    exiger(jour >= ajouterJours(p.echeance, -preparation), 'TROP_TOT', `Renouvellement possible à partir du ${fr(ajouterJours(p.echeance, -preparation))} (PROD-RG-020)`);
    dateDebut = ajouterJours(p.echeance, 1);
  } else if (p.statut === 'ECHUE') {
    exiger(jour <= ajouterJours(p.echeance, remise), 'POLICE_EXPIREE', 'Délai de remise en vigueur dépassé : une nouvelle souscription est nécessaire (PROD-RG-027)');
    dateDebut = jour; remiseEnVigueur = true;
  } else {
    throw new ErreurMetier('POLICE_EXPIREE', p.statut === 'EXPIREE' ? 'Police expirée : une nouvelle souscription reçoit un nouveau numéro (PROD-RG-027, CA-PROD-06)' : `Police ${p.statut.toLowerCase()} : renouvellement impossible`, 422);
  }
  if (mode.type === 'PAIEMENT_DIRECT') exiger(await booleen(q, 'PROD_PAIEMENT_DIRECT_RENOUVELLEMENT'), 'PAIEMENT_DIRECT_INACTIF', 'Paiement direct du renouvellement désactivé (paramètre)');
  await exigerFicheComplete(q);
  const dateFin = ajouterJours(ajouterAnnees(dateDebut, 1), -1);
  const { formuleId, tarif } = await primeRenouvellement(q, p, dateDebut);

  // Mode de paiement : contrôles avant toute écriture
  let cp: Awaited<ReturnType<typeof lireCompteProduction>> | null = null;
  let perception: CompteResolu, journalTresorerie: string | undefined, modePaiement: string;
  if (mode.type === 'COMPTE_PRODUCTION') {
    cp = await lireCompteProduction(q, (await compteProductionDuBureau(q, p.bureau_gestion_id)).id, true);
    exiger(cp.statut === 'ACTIF', 'COMPTE_PRODUCTION_GELE', 'Compte de production gelé ou clôturé');
    if (cp.solde < tarif.primeTotale) throw new ErreurMetier('SOLDE_INSUFFISANT', `Solde insuffisant : il manque ${gnf(tarif.primeTotale - cp.solde)}`, 422, { manque: tarif.primeTotale - cp.solde });
    perception = compteComptable(cp); modePaiement = 'DEPOT';
  } else if (mode.type === 'PAIEMENT_DIRECT') {
    const t = await tresorerieDe(q, mode.moyen, mode.banque);
    perception = { compteId: t.compteId }; journalTresorerie = t.journal;
    modePaiement = mode.moyen === 'ESPECES_SIEGE' ? 'ESPECES_SIEGE' : mode.moyen === 'BANQUE' ? 'VIREMENT' : 'MONNAIE_ELECTRONIQUE';
  } else {
    const dispo = await disponibleVersements(q, policeId);
    exiger(dispo >= tarif.primeTotale, 'VERSEMENTS_INSUFFISANTS', `Versements programmés insuffisants : ${gnf(dispo)} pour une prime de ${gnf(tarif.primeTotale)} (PROD-RG-053)`);
    perception = await compteVersements(q, acteur, p.souscripteur_id); modePaiement = 'VERSEMENTS';
  }

  // Commissions de la période (COM-RG-041) : barème du titulaire, clé des intervenants de la police
  const b = (await q.query<{ taux: string; prime_anticipation_type: string | null; prime_anticipation_valeur: string | null }>(
    `SELECT taux, prime_anticipation_type, prime_anticipation_valeur FROM bareme_commission WHERE produit_id = $1 AND role = 'AGENT_GENERAL' AND date_effet <= $2 AND supprime_le IS NULL ORDER BY date_effet DESC LIMIT 1`,
    [p.produit_id, dateDebut])).rows[0];
  const intervenants = (await q.query<{ intervenant_id: string; cle_repartition: string }>(
    `SELECT intervenant_id, cle_repartition FROM police_intervenant WHERE police_id = $1 AND date_fin IS NULL ORDER BY cle_repartition DESC`, [policeId])).rows;
  const repartir = (total: number) => {
    const l = intervenants.map(i => ({ intervenantId: i.intervenant_id, montant: Math.round(total * Number(i.cle_repartition)) }));
    const ecart = total - l.reduce((s, x) => s + x.montant, 0);
    if (ecart && l[0]) l[0].montant += ecart;
    return l.filter(x => x.montant > 0);
  };
  const commissions = repartir(Math.round(tarif.primeNette * Number(b?.taux ?? 0)));

  const annee = Number(jour.slice(0, 4));
  const quittanceId = crypto.randomUUID();
  const numeroQuittance = await attribuer(q, acteur, { type: 'QUITTANCE', codeBureau: p.bureau, annee }, { type: 'quittance', id: quittanceId });
  const souscripteur = (await q.query<{ nom: string; prenoms: string | null }>('SELECT nom, prenoms FROM tiers WHERE id = $1', [p.souscripteur_id])).rows[0]!;
  const docQuittance = await genererDocument(q, acteur, {
    modeleCode: 'QUITTANCE', typeDocument: 'QUITTANCE', objet: { type: 'police', id: policeId },
    variables: { quittance: numeroQuittance, police: p.numero, souscripteur: `${souscripteur.prenoms ?? ''} ${souscripteur.nom}`.trim(), date_effet: fr(dateDebut), date_fin: fr(dateFin),
      lignes: [{ libelle: 'Prime nette', montant: gnf(tarif.primeNette) }, { libelle: 'Accessoires', montant: gnf(tarif.accessoires) }, ...tarif.taxes.map(t => ({ libelle: t.libelle, montant: gnf(t.montant) })), { libelle: 'Prime totale', montant: gnf(tarif.primeTotale) }],
      mode_paiement: { DEPOT: `débit du compte de production du bureau ${p.bureau}`, VERSEMENTS: 'affectation des versements programmés', ESPECES_SIEGE: 'espèces à la caisse du siège', VIREMENT: 'virement', MONNAIE_ELECTRONIQUE: 'monnaie électronique' }[modePaiement] },
  });
  const client = (await q.query<{ id: string; collectif_id: string }>(
    `SELECT a.id, a.collectif_id FROM tiers_role r JOIN compte_auxiliaire a ON a.id = r.compte_auxiliaire_id WHERE r.tiers_id = $1 AND r.role = 'SOUSCRIPTEUR' AND r.date_fin IS NULL`, [p.souscripteur_id])).rows[0];
  if (!client) throw new ErreurMetier('COMPTE_CLIENT_ABSENT', 'Souscripteur sans compte client', 422);
  const branche = (await q.query<{ compte_primes_id: string }>('SELECT compte_primes_id FROM branche_comptable WHERE code = $1', [p.branche])).rows[0]!;
  const ecritures = await comptabiliser(q, acteur, {
    codeEvt: mode.type === 'COMPTE_PRODUCTION' ? 'EVT-02' : 'EVT-03', reference: numeroQuittance, pieceDocumentId: docQuittance.id, journalTresorerie,
    libelle: { police: p.numero, bureau: p.bureau },
    montants: { PRIME_NETTE: tarif.primeNette, ACCESSOIRES: tarif.accessoires, PRIME_TOTALE: tarif.primeTotale, ENCAISSE: tarif.primeTotale, COMMISSION: commissions.reduce((s, c) => s + c.montant, 0) },
    comptes: {
      CLIENT: { compteId: client.collectif_id, auxiliaireId: client.id }, PRIMES_BRANCHE: { compteId: branche.compte_primes_id },
      TAXES: tarif.taxes.map(t => ({ compteId: t.compteId, montant: t.montant, codeTaxeId: t.codeTaxeId })),
      COMPTE_PRODUCTION: perception, TRESORERIE: perception,
      COMMISSIONS_A_PAYER: await Promise.all(commissions.map(async c => ({ ...(await compteCommissions(q, c.intervenantId)), montant: c.montant }))),
    },
  });
  const emi = ecritures.find(e => e.journal === 'EMI')!, enc = ecritures.find(e => e.journal !== 'EMI' && e.journal !== 'COM')!, com = ecritures.find(e => e.journal === 'COM');
  await q.query(
    `INSERT INTO quittance (id, numero, police_id, type, periode_debut, periode_fin, prime_nette, accessoires, taxes, prime_totale, mode_paiement, statut, ecriture_constatation_id, ecriture_perception_id)
     VALUES ($1,$2,$3,'RENOUVELLEMENT',$4,$5,$6,$7,$8,$9,$10,'SOLDEE',$11,$12)`,
    [quittanceId, numeroQuittance, policeId, dateDebut, dateFin, tarif.primeNette, tarif.accessoires, tarif.primeTotale - tarif.primeNette - tarif.accessoires, tarif.primeTotale, modePaiement, emi.id, enc.id]);
  const rang = (await q.query<{ r: number }>('SELECT COALESCE(max(rang), 0) + 1 AS r FROM police_periode WHERE police_id = $1', [policeId])).rows[0]!.r;
  await q.query(`INSERT INTO police_periode (police_id, rang, date_debut, date_fin, prime_nette, prime_totale, quittance_id, remise_en_vigueur) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [policeId, rang, dateDebut, dateFin, tarif.primeNette, tarif.primeTotale, quittanceId, remiseEnVigueur]);
  for (const c of commissions) {
    await q.query(`INSERT INTO commission (police_id, quittance_id, intervenant_id, type, assiette, taux, montant, statut, ecriture_id) VALUES ($1,$2,$3,'COMMISSION',$4,$5,$6,'DUE',$7)`,
      [policeId, quittanceId, c.intervenantId, tarif.primeNette, b?.taux ?? 0, c.montant, com!.id]);
  }
  if (cp) await mouvementer(q, acteur, { compteId: cp.id, nature: 'RENOUVELLEMENT', montant: tarif.primeTotale, reference: p.numero, ecritureId: enc.id });
  if (mode.type === 'VERSEMENTS') await q.query(`UPDATE versement_programme SET statut = 'AFFECTE' WHERE police_id = $1 AND statut = 'RECU'`, [policeId]);
  await q.query(`UPDATE police SET statut = 'ACTIVE', formule_id = $2 WHERE id = $1`, [policeId, formuleId]);

  // COM-RG-046, CA-COM-12 : prime de renouvellement anticipé si la prime est payée au moins N jours avant l'échéance
  let anticipation = 0;
  const delai = await entier(q, 'COM_PRIME_ANTICIPE_DELAI_JOURS');
  if (!remiseEnVigueur && datePaiement <= ajouterJours(p.echeance, -delai) && b?.prime_anticipation_type && b.prime_anticipation_valeur) {
    anticipation = b.prime_anticipation_type === 'FORFAIT' ? Math.round(Number(b.prime_anticipation_valeur)) : Math.round(tarif.primeNette * Number(b.prime_anticipation_valeur));
    for (const c of repartir(anticipation)) {
      const [e] = await comptabiliser(q, acteur, { codeEvt: 'EVT-07', reference: numeroQuittance, pieceDocumentId: docQuittance.id, montants: { MONTANT: c.montant },
        comptes: { COMMISSIONS_A_PAYER: await compteCommissions(q, c.intervenantId) } });
      await q.query(`INSERT INTO commission (police_id, quittance_id, intervenant_id, type, assiette, montant, statut, ecriture_id) VALUES ($1,$2,$3,'PRIME_ANTICIPATION',$4,$5,'DUE',$6)`,
        [policeId, quittanceId, c.intervenantId, tarif.primeNette, c.montant, e!.id]);
    }
    await publier(q, acteur, { type: 'PRIME_ANTICIPATION_ACQUISE', objet: { type: 'police', id: policeId }, charge: { montant: anticipation }, cleIdempotence: `anticipation:${quittanceId}` });
  }
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'quittance', objetId: quittanceId, apres: { police: p.numero, mode: mode.type, dateDebut, primeTotale: tarif.primeTotale, remiseEnVigueur, anticipation } });
  await publier(q, acteur, { type: 'POLICE_RENOUVELEE', objet: { type: 'police', id: policeId }, charge: { numero: p.numero, dateDebut, dateFin, remiseEnVigueur }, cleIdempotence: `police:${policeId}:renouvelee:${rang}` });
  if (p.telephone) {
    await notifier(q, { tiersId: p.souscripteur_id, code: 'POLICE_RENOUVELEE', canal: 'SMS', adresse: p.telephone, objet: { type: 'police', id: policeId },
      variables: { police: p.numero, debut: fr(dateDebut), fin: fr(dateFin) } }).catch(() => undefined);
  }
  return { quittance: numeroQuittance, dateDebut, dateFin, primeTotale: tarif.primeTotale, remiseEnVigueur, anticipation, solde: cp ? (await lireCompteProduction(q, cp.id)).solde : null };
}

// ---------------------------------------------------------------- traitements quotidiens

/** PROD-RG-021 : rappels à J-30, J-15, J-7, J-1 (paramètre), au client et à l'agent du bureau de gestion, une seule fois chacun. */
export async function envoyerRappels(q: Executant, date = aujourdhui()) {
  const jalons = (await valeurParametre(q, 'PROD_RAPPELS_RENOUVELLEMENT', date)).split(',').map(j => Number(j.trim().replace(/^J-/, ''))).filter(n => Number.isInteger(n));
  const envoyes: string[] = [];
  for (const j of jalons) {
    const echeance = ajouterJours(date, j);
    const polices = await q.query<{ id: string }>(
      `SELECT p.id FROM police p WHERE p.statut = 'ACTIVE' AND NOT p.ne_pas_renouveler AND NOT p.contrat_collectif
          AND (SELECT max(date_fin) FROM police_periode pp WHERE pp.police_id = p.id) = $1`, [echeance]);
    for (const { id } of polices.rows) {
      const p = await lirePoliceVie(q, id);
      const deja = await q.query(`SELECT 1 FROM notification n JOIN modele_notification m ON m.id = n.modele_notification_id
                                   WHERE m.code = 'RAPPEL_ECHEANCE' AND n.objet_id = $1 AND n.cree_le::date = $2::date`, [id, date]);
      if (deja.rowCount || !p.telephone) continue;
      const { tarif } = await primeRenouvellement(q, p, ajouterJours(p.echeance, 1));
      const dispo = await disponibleVersements(q, id);
      await notifier(q, { tiersId: p.souscripteur_id, code: 'RAPPEL_ECHEANCE', canal: 'SMS', adresse: p.telephone, objet: { type: 'police', id },
        variables: { police: p.numero, echeance: fr(p.echeance), prime: gnf(tarif.primeTotale), reste: gnf(Math.max(0, tarif.primeTotale - dispo)), bureau: p.bureau } }).catch(() => undefined);
      envoyes.push(p.numero);
    }
  }
  return envoyes;
}

/**
 * Échéances (PROD-RG-025 à 027, 052, 060) : renouvellement automatique par les versements programmés complets ;
 * sinon ÉCHUE à l'échéance (après le délai de grâce), puis EXPIRÉE à la fin du délai de remise en vigueur.
 */
export async function traiterEcheances(q: Executant, acteur: Acteur, date = aujourdhui()) {
  const grace = await entier(q, 'PROD_DELAI_GRACE_JOURS', date);
  const remise = await entier(q, 'PROD_DELAI_REMISE_VIGUEUR_JOURS', date);
  const res = { renouvelees: [] as string[], echues: [] as string[], expirees: [] as string[] };
  const echues = await q.query<{ id: string; numero: string; echeance: string; ne_pas_renouveler: boolean }>(
    `SELECT p.id, p.numero, (SELECT max(date_fin)::text FROM police_periode pp WHERE pp.police_id = p.id) AS echeance, p.ne_pas_renouveler
       FROM police p WHERE p.statut = 'ACTIVE' AND NOT p.contrat_collectif AND (SELECT max(date_fin) FROM police_periode pp WHERE pp.police_id = p.id) < $1`, [date]);
  for (const p of echues.rows) {
    if (!p.ne_pas_renouveler) {
      // Versements programmés complets : renouvellement automatique, période contiguë (PROD-RG-052)
      const dispo = await disponibleVersements(q, p.id);
      if (dispo > 0) {
        const { tarif } = await primeRenouvellement(q, await lirePoliceVie(q, p.id), ajouterJours(p.echeance, 1));
        if (dispo >= tarif.primeTotale) {
          // Date à laquelle le cumul a atteint la prime : elle décide de la prime de renouvellement anticipé (CA-PROD-18)
          const v = await q.query<{ montant: number; recu_le: Date }>(`SELECT montant, recu_le FROM versement_programme WHERE police_id = $1 AND statut = 'RECU' ORDER BY recu_le`, [p.id]);
          let cumul = dispo - v.rows.reduce((s, x) => s + Number(x.montant), 0), atteint = p.echeance;
          for (const x of v.rows) { cumul += Number(x.montant); if (cumul >= tarif.primeTotale) { atteint = new Date(x.recu_le).toISOString().slice(0, 10); break; } }
          await renouveler(q, acteur, p.id, { type: 'VERSEMENTS' }, p.echeance, atteint);
          res.renouvelees.push(p.numero);
          continue;
        }
      }
    }
    if (ajouterJours(p.echeance, grace) >= date) continue;
    const statut = p.ne_pas_renouveler ? 'EXPIREE' : 'ECHUE';
    await q.query('UPDATE police SET statut = $2 WHERE id = $1', [p.id, statut]);
    await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'police', objetId: p.id, apres: { statut, echeance: p.echeance, motif: p.ne_pas_renouveler ? 'Non-renouvellement demandé' : 'Échéance sans paiement' } });
    await publier(q, acteur, { type: statut === 'ECHUE' ? 'POLICE_ECHUE' : 'POLICE_EXPIREE', objet: { type: 'police', id: p.id }, charge: { numero: p.numero, echeance: p.echeance }, cleIdempotence: `police:${p.id}:${statut}:${p.echeance}` });
    (statut === 'ECHUE' ? res.echues : res.expirees).push(p.numero);
  }
  const expirees = await q.query<{ id: string; numero: string; echeance: string }>(
    `SELECT p.id, p.numero, (SELECT max(date_fin)::text FROM police_periode pp WHERE pp.police_id = p.id) AS echeance FROM police p
      WHERE p.statut = 'ECHUE' AND (SELECT max(date_fin) FROM police_periode pp WHERE pp.police_id = p.id) + $2::int < $1`, [date, remise]);
  for (const p of expirees.rows) {
    await q.query(`UPDATE police SET statut = 'EXPIREE' WHERE id = $1`, [p.id]);
    await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'police', objetId: p.id, apres: { statut: 'EXPIREE', motif: 'Délai de remise en vigueur dépassé' } });
    await publier(q, acteur, { type: 'POLICE_EXPIREE', objet: { type: 'police', id: p.id }, charge: { numero: p.numero }, cleIdempotence: `police:${p.id}:EXPIREE:${p.echeance}` });
    res.expirees.push(p.numero);
  }
  return res;
}

/** PROD-RG-060 : demande de non-renouvellement ; les rappels cessent et la police s'éteint à l'échéance. */
export async function demanderNonRenouvellement(q: Executant, acteur: Acteur, policeId: string, motif: string) {
  exiger(motif?.trim(), 'MOTIF_REQUIS', 'Motif obligatoire');
  const r = await q.query(`UPDATE police SET ne_pas_renouveler = true WHERE id = $1 AND statut = 'ACTIVE' AND NOT ne_pas_renouveler`, [policeId]);
  exiger(r.rowCount, 'STATUT_INVALIDE', 'Police non active ou déjà marquée « ne pas renouveler »');
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'police', objetId: policeId, apres: { ne_pas_renouveler: true, motif } });
}

// ---------------------------------------------------------------- versements programmés (PROD-RG-050 à 054)

export async function recevoirVersement(q: Executant, acteur: Acteur, d: { policeId: string; montant: number; moyen: 'MONNAIE_ELECTRONIQUE' | 'BUREAU'; banque?: string; reference?: string }) {
  exiger(Number.isInteger(d.montant) && d.montant > 0, 'MONTANT_INVALIDE', 'Montant en francs entiers, positif');
  const p = await lirePoliceVie(q, d.policeId, true);
  exiger(['ACTIVE', 'ECHUE'].includes(p.statut), 'STATUT_INVALIDE', 'Versements possibles sur une police active ou échue en délai de remise en vigueur');
  exiger(!p.ne_pas_renouveler, 'NE_PAS_RENOUVELER', 'Police marquée « ne pas renouveler »');
  await exigerFicheComplete(q);
  let tresorerie: CompteResolu, journalTresorerie: string | undefined, cp: Awaited<ReturnType<typeof lireCompteProduction>> | null = null;
  if (d.moyen === 'BUREAU') {
    // Versement remis à l'agent : débit du compte de production de son bureau, transaction protégée (COM-RG-023)
    cp = await lireCompteProduction(q, (await compteProductionDuBureau(q, p.bureau_gestion_id)).id, true);
    tresorerie = compteComptable(cp);
  } else {
    exiger(d.banque && d.reference?.trim(), 'REFERENCE_REQUISE', 'Opérateur et référence de l\'opération obligatoires');
    const t = await tresorerieDe(q, 'MONNAIE_ELECTRONIQUE', d.banque);
    tresorerie = { compteId: t.compteId }; journalTresorerie = t.journal;
  }
  const id = crypto.randomUUID();
  const numero = await attribuer(q, acteur, { type: 'VERSEMENT_PROGRAMME', annee: Number(aujourdhui().slice(0, 4)) }, { type: 'versement_programme', id });
  const avant = await disponibleVersements(q, d.policeId);
  const { tarif } = await primeRenouvellement(q, p, p.statut === 'ACTIVE' ? ajouterJours(p.echeance, 1) : aujourdhui());
  const cumul = avant + d.montant;
  const recu = await genererDocument(q, acteur, {
    modeleCode: 'RECU_VERSEMENT', typeDocument: 'RECU_VERSEMENT', objet: { type: 'police', id: d.policeId },
    variables: { numero, police: p.numero, montant: gnf(d.montant), cumul: gnf(cumul), reste: gnf(Math.max(0, tarif.primeTotale - cumul)), prime: gnf(tarif.primeTotale) },
  });
  const [e] = await comptabiliser(q, acteur, { codeEvt: 'EVT-21', reference: numero, pieceDocumentId: recu.id, journalTresorerie, montants: { MONTANT: d.montant },
    comptes: { TRESORERIE: tresorerie, VERSEMENTS_AVANCE: await compteVersements(q, acteur, p.souscripteur_id) } });
  if (cp) await mouvementer(q, acteur, { compteId: cp.id, nature: 'VERSEMENT_PROGRAMME', montant: d.montant, reference: numero, ecritureId: e!.id });
  await q.query(`INSERT INTO versement_programme (id, numero_recu, police_id, montant, moyen, reference_externe, recu_le, statut, ecriture_id) VALUES ($1,$2,$3,$4,$5,$6,now(),'RECU',$7)`,
    [id, numero, d.policeId, d.montant, d.moyen, d.reference ? `${d.banque}:${d.reference}` : null, e!.id]);
  await publier(q, acteur, { type: 'VERSEMENT_PROGRAMME_RECU', objet: { type: 'versement_programme', id }, charge: { police: p.numero, montant: d.montant, cumul }, cleIdempotence: `versement:${id}` });
  if (p.telephone) {
    await notifier(q, { tiersId: p.souscripteur_id, code: 'VERSEMENT_RECU', canal: 'SMS', adresse: p.telephone, objet: { type: 'police', id: d.policeId },
      variables: { numero, montant: gnf(d.montant), cumul: gnf(cumul), reste: gnf(Math.max(0, tarif.primeTotale - cumul)), police: p.numero } }).catch(() => undefined);
  }
  return { id, numero, cumul, reste: Math.max(0, tarif.primeTotale - cumul) };
}

/** PROD-RG-053, 054 : remboursement de l'avance à la demande de l'assuré (EVT-22). */
export async function rembourserVersements(q: Executant, acteur: Acteur, policeId: string, d: { banque: string; pieceDocumentId: string }) {
  const p = await lirePoliceVie(q, policeId, true);
  const montant = await disponibleVersements(q, policeId);
  exiger(montant > 0, 'AUCUNE_AVANCE', 'Aucun versement disponible à rembourser');
  const t = await tresorerieDe(q, 'MONNAIE_ELECTRONIQUE', d.banque);
  await comptabiliser(q, acteur, { codeEvt: 'EVT-22', reference: p.numero, pieceDocumentId: d.pieceDocumentId, journalTresorerie: t.journal, montants: { MONTANT: montant },
    comptes: { TRESORERIE: { compteId: t.compteId }, VERSEMENTS_AVANCE: await compteVersements(q, acteur, p.souscripteur_id) } });
  await q.query(`UPDATE versement_programme SET statut = 'REMBOURSE' WHERE police_id = $1 AND statut = 'RECU'`, [policeId]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'police', objetId: policeId, apres: { remboursementVersements: montant } });
  await publier(q, acteur, { type: 'VERSEMENT_PROGRAMME_REMBOURSE', objet: { type: 'police', id: policeId }, charge: { montant }, cleIdempotence: `versements:${policeId}:rembourses:${Date.now()}` });
  return { montant };
}

/** Polices à renouveler (PR-03) : échéances à venir et polices échues en délai de remise en vigueur. */
export async function policesARenouveler(q: Executant, bureaux: string[] | null, jours = 45) {
  return (await q.query(
    `SELECT p.id, p.numero, p.statut, p.ne_pas_renouveler, b.code AS bureau, trim(t.nom || ' ' || COALESCE(t.prenoms, '')) AS souscripteur, t.telephone,
            (SELECT max(date_fin) FROM police_periode pp WHERE pp.police_id = p.id) AS echeance,
            (SELECT COALESCE(sum(montant), 0) FROM versement_programme v WHERE v.police_id = p.id AND v.statut = 'RECU')::bigint AS versements,
            (SELECT prime_totale FROM police_periode pp WHERE pp.police_id = p.id ORDER BY rang DESC LIMIT 1) AS derniere_prime,
            (SELECT count(*)::int FROM notification n JOIN modele_notification m ON m.id = n.modele_notification_id
              WHERE m.code = 'RAPPEL_ECHEANCE' AND n.objet_type = 'police' AND n.objet_id = p.id
                AND n.cree_le >= (SELECT max(date_fin) FROM police_periode pp WHERE pp.police_id = p.id) - 45) AS rappels
       FROM police p JOIN bureau b ON b.id = p.bureau_gestion_id JOIN tiers t ON t.id = p.souscripteur_id
      WHERE NOT p.contrat_collectif AND ($2::text[] IS NULL OR b.code = ANY($2))
        AND ((p.statut = 'ACTIVE' AND (SELECT max(date_fin) FROM police_periode pp WHERE pp.police_id = p.id) <= current_date + $1::int) OR p.statut = 'ECHUE')
      ORDER BY echeance`, [jours, bureaux])).rows;
}
