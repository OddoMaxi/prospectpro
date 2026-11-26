/**
 * Moteur de droits et compteurs (CDC § 9.6 ; SAN-RG-020 à 027, 094 ; CA-SAN-02, 03, 24).
 *
 * - Évaluation, avant l'acte, de chaque ligne demandée (acte de la nomenclature ou médicament) : droits ouverts
 *   (carte, police, période payée), garantie de la formule qui couvre la famille de l'acte, exclusions automatiques
 *   du produit, carence (sauf accident), médicament couvert et quantité maximale, accord préalable requis, nombre
 *   d'actes (par personne et par garantie), plafonds (par garantie, par personne, par famille) ; part de la Compagnie,
 *   ticket modérateur et part non couverte, motifs affichés au prestataire et à l'assuré.
 * - Compteurs en temps réel, sur la période de garantie (année d'assurance) : réservation à l'ouverture de la prise en
 *   charge, consommation à la validation, libération à l'annulation. Consommé + réservé ne dépasse jamais le plafond :
 *   contrainte en base, compteurs verrouillés pendant la réservation.
 * - Une prestation décompte un acte, par personne et par garantie concernée (SAN-RG-027) ; une consultation de contrôle
 *   n'en décompte aucun (SAN-RG-024, décidé par la prise en charge).
 */
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, nonTrouve } from '../../noyau/erreurs.js';
import { ajouterJours, aujourdhui } from '../../noyau/dates.js';
import { journaliser } from '../../moteurs/audit.js';
import { motifsActifs } from '../droits/blocages.js';
import { MOTIFS_POLICE } from './cartes.js';

const fr = (d: string) => d.slice(0, 10).split('-').reverse().join('/');
const gnf = (n: number) => `${n.toLocaleString('fr-FR').replace(/ /g, ' ')} GNF`;

export interface LigneDemandee { acteCode?: string; medicamentCode?: string; quantite?: number; montant: number }
export interface LigneEvaluee {
  index: number; code: string; libelle: string; famille: string; quantite: number; montant: number;
  garantieId: string | null; garantie: string | null; couvert: boolean; motif: string | null; accordPrealable: boolean;
  partCompagnie: number; ticketModerateur: number; partNonCouverte: number;
}
interface Garantie { id: string; code: string; libelle: string; type: string; plafond: string | null; nombre_actes: number | null; taux_prise_en_charge: string; carence_jours: number; accord_prealable: boolean; seuil_accord_prealable: string | null; familles_actes: string[] | null }
interface Personne { police_assure_id: string; police_id: string; police_statut: string; formule_id: string; produit_id: string; date_entree: string; date_sortie: string | null; tiers_id: string; principal_id: string; plafond_personne: string; plafond_famille: string | null; actes_annuel: number | null }

export interface Evaluation {
  ouvert: boolean; motif: string | null; policeAssureId: string; periodeId: string | null; date: string;
  lignes: LigneEvaluee[]; totaux: { montant: number; partCompagnie: number; ticketModerateur: number; partNonCouverte: number };
  accordPrealableRequis: boolean; soldes: Solde[];
}
export interface Solde { niveau: 'GARANTIE' | 'PERSONNE' | 'FAMILLE'; garantie: string | null; plafond: number | null; consomme: number; reserve: number; disponible: number | null; actesMax: number | null; actes: number }

async function personne(q: Executant, policeAssureId: string): Promise<Personne> {
  const r = (await q.query<Personne>(
    `SELECT pa.id AS police_assure_id, p.id AS police_id, p.statut AS police_statut, p.formule_id, p.produit_id, pa.date_entree::text, pa.date_sortie::text, pa.tiers_id,
            (SELECT x.id FROM police_assure x WHERE x.police_id = p.id AND x.qualite = 'ASSURE_PRINCIPAL' ORDER BY x.date_entree LIMIT 1) AS principal_id,
            f.plafond_annuel_personne AS plafond_personne, f.plafond_annuel_famille AS plafond_famille, f.nombre_actes_annuel AS actes_annuel
       FROM police_assure pa JOIN police p ON p.id = pa.police_id JOIN formule f ON f.id = p.formule_id WHERE pa.id = $1`, [policeAssureId])).rows[0];
  if (!r) throw nonTrouve('Personne couverte');
  return r;
}

async function periode(q: Executant, policeId: string, date: string) {
  return (await q.query<{ id: string; date_debut: string; date_fin: string }>(
    'SELECT id, date_debut::text, date_fin::text FROM police_periode WHERE police_id = $1 AND date_debut <= $2 AND date_fin >= $2', [policeId, date])).rows[0] ?? null;
}

/** Compteurs de la période (ceux qui n'existent pas encore valent zéro). */
async function compteurs(q: Executant, pers: Personne, periodeId: string, verrou = false) {
  const rows = (await q.query<{ id: string; niveau: string; garantie_id: string | null; police_assure_id: string; montant_consomme: string; montant_reserve: string; actes_consommes: number; actes_reserves: number; plafond: string | null; actes_max: number | null }>(
    `SELECT id, niveau, garantie_id, police_assure_id, montant_consomme, montant_reserve, actes_consommes, actes_reserves, plafond, actes_max FROM compteur_garantie
      WHERE periode_id = $1 AND supprime_le IS NULL AND ((police_assure_id = $2 AND niveau IN ('GARANTIE', 'PERSONNE')) OR (police_assure_id = $3 AND niveau = 'FAMILLE'))${verrou ? ' FOR UPDATE' : ''}`,
    [periodeId, pers.police_assure_id, pers.principal_id])).rows;
  const cle = (niveau: string, garantieId: string | null) => rows.find(r => r.niveau === niveau && r.garantie_id === garantieId);
  const utilise = (niveau: string, garantieId: string | null) => { const r = cle(niveau, garantieId); return { montant: r ? Number(r.montant_consomme) + Number(r.montant_reserve) : 0, actes: r ? r.actes_consommes + r.actes_reserves : 0, r }; };
  return { rows, utilise };
}

function garantieDe(garanties: Garantie[], famille: string): Garantie | null {
  if (famille === 'TELECONSULTATION') return garanties.find(g => g.type === 'TELECONSULTATION') ?? null;
  const soins = garanties.filter(g => g.type === 'FRAIS_SOINS');
  return soins.find(g => g.familles_actes?.includes(famille)) ?? soins.find(g => !g.familles_actes?.length) ?? null;
}

/** Évaluation des droits avant l'acte (réponse au prestataire), sans rien réserver. */
export async function evaluerDroits(q: Executant, d: { policeAssureId: string; date?: string; accident?: boolean; lignes: LigneDemandee[] }): Promise<Evaluation> {
  const date = d.date ?? aujourdhui();
  const pers = await personne(q, d.policeAssureId);
  const per = await periode(q, pers.police_id, date);
  const vide = (motif: string): Evaluation => ({ ouvert: false, motif, policeAssureId: pers.police_assure_id, periodeId: per?.id ?? null, date, lignes: [], totaux: { montant: 0, partCompagnie: 0, ticketModerateur: 0, partNonCouverte: 0 }, accordPrealableRequis: false, soldes: [] });
  // Droits ouverts à la date de l'acte (CA-SAN-01)
  if (pers.police_statut !== 'ACTIVE') return vide(MOTIFS_POLICE[pers.police_statut] ?? 'Police non active');
  if (pers.date_sortie && pers.date_sortie <= date) return vide('Personne sortie du contrat');
  if (date < pers.date_entree) return vide('Personne pas encore entrée au contrat');
  if (!per) return vide('Aucune période de garantie payée à cette date');
  const blocages = await motifsActifs(q, { tiersId: pers.tiers_id });
  if (blocages.length) return vide(blocages[0]!.libelle_prestataire);

  const garanties = (await q.query<Garantie>(
    `SELECT id, code, libelle, type, plafond, nombre_actes, taux_prise_en_charge, carence_jours, accord_prealable, seuil_accord_prealable, familles_actes
       FROM garantie WHERE formule_id = $1 AND supprime_le IS NULL`, [pers.formule_id])).rows;
  const exclusions = (await q.query<{ libelle: string; actes: string[] }>('SELECT libelle, actes FROM exclusion WHERE produit_id = $1 AND automatique AND supprime_le IS NULL', [pers.produit_id])).rows;
  const c = await compteurs(q, pers, per.id);

  // Nombre d'actes de la personne (toutes prestations confondues, SAN-RG-027) : au plafond, aucune nouvelle prise en charge
  const actesPersonne = c.utilise('PERSONNE', null).actes;
  const limitePersonne = pers.actes_annuel !== null && actesPersonne >= pers.actes_annuel;

  const lignes: LigneEvaluee[] = [];
  for (const [index, l] of d.lignes.entries()) {
    if (!Number.isInteger(l.montant) || l.montant < 0) throw new ErreurMetier('MONTANT_INVALIDE', 'Montant de ligne invalide', 422);
    let code: string, libelle: string, famille: string, quantite = l.quantite ?? 1, couvrable = l.montant, motif: string | null = null;
    if (l.medicamentCode) {
      const m = (await q.query<{ denomination: string; couvert: boolean; quantite_max_ordonnance: number | null }>('SELECT denomination, couvert, quantite_max_ordonnance FROM medicament WHERE code = $1 AND supprime_le IS NULL', [l.medicamentCode])).rows[0];
      if (!m) throw new ErreurMetier('MEDICAMENT_INCONNU', `Médicament ${l.medicamentCode} inconnu`, 422);
      code = l.medicamentCode; libelle = m.denomination; famille = 'MEDICAMENT';
      if (!m.couvert) motif = 'Médicament non couvert : à la charge de l\'assuré';
      else if (m.quantite_max_ordonnance && quantite > m.quantite_max_ordonnance) couvrable = Math.round(l.montant * m.quantite_max_ordonnance / quantite);
    } else {
      const a = (await q.query<{ libelle: string; famille: string; actif: boolean }>('SELECT libelle, famille, actif FROM nomenclature_acte WHERE code = $1', [l.acteCode])).rows[0];
      if (!a) throw new ErreurMetier('ACTE_INCONNU', `Acte ${l.acteCode} absent de la nomenclature`, 422);
      code = l.acteCode!; libelle = a.libelle; famille = a.famille;
      if (!a.actif) motif = 'Acte retiré de la nomenclature';
    }
    const g = garantieDe(garanties, famille);
    if (!motif && !g) motif = 'Acte non couvert par la formule';
    // SAN-RG-025 : exclusions automatiques du produit, motif affiché
    const exclu = exclusions.find(x => x.actes.includes(code));
    if (!motif && exclu) motif = `Exclusion : ${exclu.libelle}`;
    // Carence de la garantie à compter de l'entrée de la personne, sauf accident (CA-SAN-02)
    if (!motif && g && g.carence_jours > 0 && !d.accident) {
      const fin = ajouterJours(pers.date_entree, g.carence_jours);
      if (date < fin) motif = `Garantie « ${g.libelle} » en carence jusqu'au ${fr(ajouterJours(fin, -1))}`;
    }
    // Nombre d'actes (CA-SAN-03, 24) : la personne, puis la garantie
    if (!motif && limitePersonne) motif = `Nombre d'actes annuel atteint (${pers.actes_annuel}) : prise en charge refusée`;
    if (!motif && g?.nombre_actes !== null && g?.nombre_actes !== undefined && c.utilise('GARANTIE', g.id).actes >= g.nombre_actes) motif = `Nombre d'actes de la garantie « ${g.libelle} » atteint (${g.nombre_actes})`;
    const accordPrealable = !motif && !!g?.accord_prealable && (g.seuil_accord_prealable === null || l.montant > Number(g.seuil_accord_prealable));
    const part = motif ? 0 : Math.round(couvrable * Number(g!.taux_prise_en_charge));
    lignes.push({ index, code, libelle, famille, quantite, montant: l.montant, garantieId: motif ? null : g!.id, garantie: g?.libelle ?? null, couvert: !motif, motif, accordPrealable,
      partCompagnie: part, ticketModerateur: motif ? 0 : couvrable - part, partNonCouverte: motif ? l.montant : l.montant - couvrable });
  }

  // Plafonds (SAN-RG-020, 021) : la part de la Compagnie est limitée au disponible ; le reste est à la charge de l'assuré
  const dispo = (plafond: string | number | null, utilise: number) => (plafond === null ? Infinity : Math.max(0, Number(plafond) - utilise));
  let personneDispo = dispo(pers.plafond_personne, c.utilise('PERSONNE', null).montant);
  let familleDispo = pers.plafond_famille === null ? Infinity : dispo(pers.plafond_famille, c.utilise('FAMILLE', null).montant);
  const garantieDispo = new Map<string, number>();
  for (const l of lignes.filter(x => x.couvert)) {
    const g = garanties.find(x => x.id === l.garantieId)!;
    if (!garantieDispo.has(g.id)) garantieDispo.set(g.id, dispo(g.plafond, c.utilise('GARANTIE', g.id).montant));
    const possible = Math.min(l.partCompagnie, garantieDispo.get(g.id)!, personneDispo, familleDispo);
    if (possible < l.partCompagnie) {
      l.partNonCouverte += l.partCompagnie - possible;
      l.motif = possible === 0 ? 'Plafond atteint : à la charge de l\'assuré' : `Plafond atteint : ${gnf(l.partCompagnie - possible)} à la charge de l'assuré`;
      l.partCompagnie = possible;
      if (possible === 0) l.couvert = false;
    }
    garantieDispo.set(g.id, garantieDispo.get(g.id)! - possible); personneDispo -= possible; familleDispo -= possible;
  }
  const somme = (k: 'montant' | 'partCompagnie' | 'ticketModerateur' | 'partNonCouverte') => lignes.reduce((s, x) => s + x[k], 0);
  const ouvert = lignes.some(x => x.couvert);
  return {
    ouvert, motif: ouvert ? null : lignes[0]?.motif ?? 'Aucune ligne couverte', policeAssureId: pers.police_assure_id, periodeId: per.id, date, lignes,
    totaux: { montant: somme('montant'), partCompagnie: somme('partCompagnie'), ticketModerateur: somme('ticketModerateur'), partNonCouverte: somme('partNonCouverte') },
    accordPrealableRequis: lignes.some(x => x.accordPrealable), soldes: await soldesDe(q, pers, per.id, garanties),
  };
}

async function soldesDe(q: Executant, pers: Personne, periodeId: string, garanties: Garantie[]): Promise<Solde[]> {
  const c = await compteurs(q, pers, periodeId);
  const solde = (niveau: Solde['niveau'], garantie: Garantie | null, plafond: string | number | null, actesMax: number | null): Solde => {
    const r = c.rows.find(x => x.niveau === niveau && x.garantie_id === (garantie?.id ?? null));
    const consomme = r ? Number(r.montant_consomme) : 0, reserve = r ? Number(r.montant_reserve) : 0;
    return { niveau, garantie: garantie?.libelle ?? null, plafond: plafond === null ? null : Number(plafond), consomme, reserve,
      disponible: plafond === null ? null : Math.max(0, Number(plafond) - consomme - reserve), actesMax, actes: r ? r.actes_consommes + r.actes_reserves : 0 };
  };
  return [
    solde('PERSONNE', null, pers.plafond_personne, pers.actes_annuel),
    ...(pers.plafond_famille === null ? [] : [solde('FAMILLE', null, pers.plafond_famille, null)]),
    ...garanties.filter(g => ['FRAIS_SOINS', 'TELECONSULTATION'].includes(g.type)).map(g => solde('GARANTIE', g, g.plafond, g.nombre_actes)),
  ];
}

/** SAN-RG-022 : soldes d'une personne à une date (espace assuré, portail du prestataire). */
export async function soldes(q: Executant, policeAssureId: string, date = aujourdhui()) {
  const pers = await personne(q, policeAssureId);
  const per = await periode(q, pers.police_id, date);
  if (!per) return { periode: null, soldes: [] as Solde[] };
  const garanties = (await q.query<Garantie>('SELECT id, code, libelle, type, plafond, nombre_actes, taux_prise_en_charge, carence_jours, accord_prealable, seuil_accord_prealable, familles_actes FROM garantie WHERE formule_id = $1 AND supprime_le IS NULL', [pers.formule_id])).rows;
  return { periode: per, soldes: await soldesDe(q, pers, per.id, garanties) };
}

// ---------------------------------------------------------------- compteurs (SAN-RG-020)

export interface Reservation { periodeId: string; mouvements: { compteurId: string; montant: number; actes: number }[] }

/** Compteur de la période, créé au besoin avec son plafond, verrouillé. */
async function compteur(q: Executant, d: { policeAssureId: string; periodeId: string; niveau: 'GARANTIE' | 'PERSONNE' | 'FAMILLE'; garantieId: string | null; plafond: number | null; actesMax: number | null }) {
  await q.query(
    `INSERT INTO compteur_garantie (police_assure_id, garantie_id, periode_id, niveau, montant_consomme, montant_reserve, actes_consommes, actes_reserves, plafond, actes_max)
     VALUES ($1,$2,$3,$4,0,0,0,0,$5,$6) ON CONFLICT (police_assure_id, COALESCE(garantie_id, '00000000-0000-0000-0000-000000000000'), periode_id, niveau) DO NOTHING`,
    [d.policeAssureId, d.garantieId, d.periodeId, d.niveau, d.plafond, d.actesMax]);
  return (await q.query<{ id: string }>(
    `SELECT id FROM compteur_garantie WHERE police_assure_id = $1 AND garantie_id IS NOT DISTINCT FROM $2 AND periode_id = $3 AND niveau = $4 FOR UPDATE`,
    [d.policeAssureId, d.garantieId, d.periodeId, d.niveau])).rows[0]!.id;
}

/**
 * Réservation à l'ouverture de la prise en charge : parts de la Compagnie des lignes couvertes, un acte par personne
 * et par garantie (sauf consultation de contrôle). La contrainte en base garantit le plafond même en cas de concurrence.
 */
export async function reserver(q: Executant, acteur: Acteur, e: Evaluation, options: { decompterActe?: boolean } = {}): Promise<Reservation> {
  if (!e.ouvert || !e.periodeId) throw new ErreurMetier('DROITS_FERMES', e.motif ?? 'Droits non ouverts', 422);
  const pers = await personne(q, e.policeAssureId);
  const decompte = options.decompterActe !== false ? 1 : 0;
  const couvertes = e.lignes.filter(l => l.couvert);
  const total = couvertes.reduce((s, l) => s + l.partCompagnie, 0);
  const parGarantie = new Map<string, number>();
  for (const l of couvertes) parGarantie.set(l.garantieId!, (parGarantie.get(l.garantieId!) ?? 0) + l.partCompagnie);
  const mouvements: Reservation['mouvements'] = [];
  mouvements.push({ compteurId: await compteur(q, { policeAssureId: pers.police_assure_id, periodeId: e.periodeId, niveau: 'PERSONNE', garantieId: null, plafond: Number(pers.plafond_personne), actesMax: pers.actes_annuel }), montant: total, actes: decompte });
  if (pers.plafond_famille !== null) mouvements.push({ compteurId: await compteur(q, { policeAssureId: pers.principal_id, periodeId: e.periodeId, niveau: 'FAMILLE', garantieId: null, plafond: Number(pers.plafond_famille), actesMax: null }), montant: total, actes: 0 });
  for (const [garantieId, montant] of parGarantie) {
    const g = (await q.query<{ plafond: string | null; nombre_actes: number | null }>('SELECT plafond, nombre_actes FROM garantie WHERE id = $1', [garantieId])).rows[0]!;
    mouvements.push({ compteurId: await compteur(q, { policeAssureId: pers.police_assure_id, periodeId: e.periodeId, niveau: 'GARANTIE', garantieId, plafond: g.plafond === null ? null : Number(g.plafond), actesMax: g.nombre_actes }), montant, actes: decompte });
  }
  try {
    for (const m of mouvements) await q.query('UPDATE compteur_garantie SET montant_reserve = montant_reserve + $2, actes_reserves = actes_reserves + $3 WHERE id = $1', [m.compteurId, m.montant, m.actes]);
  } catch (x) {
    if ((x as { code?: string }).code === '23514') throw new ErreurMetier('PLAFOND_ATTEINT', 'Plafond ou nombre d\'actes atteint entre-temps : réévaluer les droits', 409);
    throw x;
  }
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'compteur_garantie', objetId: mouvements[0]!.compteurId, apres: { reservation: total, actes: decompte } });
  return { periodeId: e.periodeId, mouvements };
}

/** Consommation à la validation de la prestation : réservé → consommé (montant réel au plus égal au réservé). */
export async function consommer(q: Executant, r: Reservation, montantReel?: number) {
  const total = r.mouvements[0]?.montant ?? 0;
  const ratio = montantReel === undefined || total === 0 ? 1 : Math.min(1, montantReel / total);
  for (const m of r.mouvements) {
    const conso = Math.round(m.montant * ratio);
    await q.query(`UPDATE compteur_garantie SET montant_reserve = montant_reserve - $2, montant_consomme = montant_consomme + $3, actes_reserves = actes_reserves - $4, actes_consommes = actes_consommes + $4 WHERE id = $1`,
      [m.compteurId, m.montant, conso, m.actes]);
  }
}

/** Libération à l'annulation de la prise en charge. */
export async function liberer(q: Executant, r: Reservation) {
  for (const m of r.mouvements) await q.query('UPDATE compteur_garantie SET montant_reserve = montant_reserve - $2, actes_reserves = actes_reserves - $3 WHERE id = $1', [m.compteurId, m.montant, m.actes]);
}
