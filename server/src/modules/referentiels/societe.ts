/**
 * Fiche de la Compagnie (CDC § 5.2 ; REF-RG-010 à 013 ; DD societe, societe_historique).
 *
 * - Chaque valeur est historisée avec une date d'effet : un document porte les mentions en vigueur à sa date (REF-RG-012, CA-REF-06).
 * - Toute modification est proposée par l'Administrateur général et validée par la DAF ou la Direction générale (REF-RG-013).
 * - Tant que la fiche est incomplète, émissions et écritures sont refusées avec la liste des manques (REF-RG-010, CA-REF-05).
 * - La ligne `societe` est l'image de la fiche à la date du jour ; la source de vérité est l'historique.
 */
import { z } from 'zod';
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger } from '../../noyau/erreurs.js';
import { aujourdhui, dateValide } from '../../noyau/dates.js';
import { journaliser } from '../../moteurs/audit.js';
import { enregistrerOperation, soumettre } from '../../moteurs/validation.js';

export const OPERATION_FICHE_SOCIETE = 'FICHE_SOCIETE';

const texte = (max: number) => z.string().trim().min(1).max(max);
/** Champs de la fiche : libellé, caractère obligatoire, format. Ordre = ordre d'affichage. */
export const CHAMPS_SOCIETE = {
  raison_sociale: { libelle: 'Raison sociale', obligatoire: true, format: texte(200) },
  activite: { libelle: 'Activité', obligatoire: true, format: texte(200) },
  forme_juridique: { libelle: 'Forme juridique', obligatoire: true, format: texte(60) },
  capital_social: { libelle: 'Capital social', obligatoire: true, format: z.coerce.number().int().positive() },
  numero_agrement: { libelle: 'Numéro d\'agrément', obligatoire: true, format: texte(60) },
  commentaire: { libelle: 'Commentaire', obligatoire: false, format: z.string().max(2000) },
  pays: { libelle: 'Pays', obligatoire: true, format: texte(60) },
  region: { libelle: 'Région', obligatoire: true, format: texte(60) },
  commune: { libelle: 'Commune', obligatoire: true, format: texte(60) },
  quartier: { libelle: 'Quartier', obligatoire: true, format: texte(120) },
  telephone: { libelle: 'Téléphone', obligatoire: true, format: z.string().regex(/^\+?\d{8,15}$/, 'Téléphone invalide') },
  courriel: { libelle: 'E-mail', obligatoire: true, format: z.email() },
  site_internet: { libelle: 'Site internet', obligatoire: false, format: z.string().max(200) },
  rccm: { libelle: 'RCCM', obligatoire: true, format: texte(60) },
  nif: { libelle: 'NIF', obligatoire: true, format: texte(60) },
  cle_tva: { libelle: 'Clé TVA', obligatoire: false, format: z.string().max(60) },
  numero_cnss: { libelle: 'Numéro CNSS', obligatoire: false, format: z.string().max(60) },
} as const;
export type ChampSociete = keyof typeof CHAMPS_SOCIETE;
const CHAMPS = Object.keys(CHAMPS_SOCIETE) as ChampSociete[];

export type FicheSociete = Partial<Record<ChampSociete, string>>;

/** Fiche en vigueur à une date, reconstituée depuis l'historique. */
export async function ficheSociete(q: Executant, date = aujourdhui()): Promise<FicheSociete> {
  const r = await q.query<{ champ: ChampSociete; nouvelle_valeur: string }>(
    `SELECT DISTINCT ON (champ) champ, nouvelle_valeur FROM societe_historique
      WHERE date_effet <= $1 ORDER BY champ, date_effet DESC, cree_le DESC`, [date]);
  const f: FicheSociete = {};
  for (const l of r.rows) if (l.nouvelle_valeur !== '') f[l.champ] = l.nouvelle_valeur;
  return f;
}

/** Libellés des champs obligatoires non renseignés à une date. */
export async function champsManquants(q: Executant, date = aujourdhui()): Promise<string[]> {
  const f = await ficheSociete(q, date);
  return CHAMPS.filter(c => CHAMPS_SOCIETE[c].obligatoire && !f[c]).map(c => CHAMPS_SOCIETE[c].libelle);
}

/** REF-RG-010 : à appeler avant toute émission de police et toute écriture comptable. */
export async function exigerFicheComplete(q: Executant, date = aujourdhui()): Promise<void> {
  const manquants = await champsManquants(q, date);
  if (manquants.length) {
    throw new ErreurMetier('FICHE_SOCIETE_INCOMPLETE',
      `Fiche de la Compagnie incomplète : ${manquants.join(', ')}. Émissions et écritures sont bloquées jusqu'à son achèvement.`, 422, { manquants });
  }
}

/** REF-RG-011 : variables de modèle des mentions légales, en vigueur à la date du document. */
export async function mentionsLegales(q: Executant, date: string): Promise<Record<string, string>> {
  const f = await ficheSociete(q, date);
  const capital = f.capital_social ? `${Number(f.capital_social).toLocaleString('fr-FR').replace(/ /g, ' ')} GNF` : '';
  return {
    societe_raison_sociale: f.raison_sociale ?? '',
    societe_forme_juridique: f.forme_juridique ?? '',
    societe_capital_social: capital,
    societe_siege: [f.quartier, f.commune, f.region, f.pays].filter(Boolean).join(', '),
    societe_rccm: f.rccm ?? '',
    societe_nif: f.nif ?? '',
    societe_agrement: f.numero_agrement ?? '',
    societe_telephone: f.telephone ?? '',
    societe_courriel: f.courriel ?? '',
    mentions_legales: [
      `${f.raison_sociale ?? ''}, ${f.forme_juridique ?? ''} au capital de ${capital}`,
      `Siège : ${[f.quartier, f.commune, f.region, f.pays].filter(Boolean).join(', ')}`,
      `RCCM ${f.rccm ?? ''} – NIF ${f.nif ?? ''} – Agrément n° ${f.numero_agrement ?? ''}`,
    ].join(' – '),
  };
}

export async function historiqueSociete(q: Executant) {
  return (await q.query(
    `SELECT h.champ, h.ancienne_valeur, h.nouvelle_valeur, h.date_effet, h.cree_le, a.identifiant AS auteur, v.identifiant AS valideur
       FROM societe_historique h JOIN utilisateur a ON a.id = h.auteur_id JOIN utilisateur v ON v.id = h.valide_par
      ORDER BY h.date_effet DESC, h.cree_le DESC`)).rows;
}

/**
 * Propose une modification. La première saisie d'un champ peut porter toute date d'effet ;
 * une modification ultérieure prend effet au plus tôt aujourd'hui : les documents déjà émis ne changent jamais.
 */
export async function proposerModificationSociete(q: Executant, acteur: Acteur, d: { valeurs: Record<string, unknown>; dateEffet?: string; motif: string }) {
  const dateEffet = d.dateEffet ?? aujourdhui();
  exiger(dateValide(dateEffet), 'DATE_INVALIDE', 'Date d\'effet invalide');
  exiger(d.motif?.trim(), 'MOTIF_REQUIS', 'Motif obligatoire');
  const valeurs: Record<string, string> = {};
  for (const [champ, v] of Object.entries(d.valeurs)) {
    exiger(champ in CHAMPS_SOCIETE, 'CHAMP_INCONNU', `Champ inconnu : ${champ}`);
    const def = CHAMPS_SOCIETE[champ as ChampSociete];
    const brut = v === null || v === undefined ? '' : String(v).trim();
    exiger(brut !== '' || !def.obligatoire, 'CHAMP_OBLIGATOIRE', `${def.libelle} : valeur obligatoire`);
    if (brut !== '') {
      const p = def.format.safeParse(brut);
      exiger(p.success, 'VALEUR_INVALIDE', `${def.libelle} : valeur invalide`);
    }
    valeurs[champ] = brut;
  }
  exiger(Object.keys(valeurs).length, 'AUCUNE_MODIFICATION', 'Aucune valeur à modifier');
  if (dateEffet < aujourdhui()) {
    const deja = await q.query<{ champ: string }>('SELECT DISTINCT champ FROM societe_historique WHERE champ = ANY($1)', [Object.keys(valeurs)]);
    exiger(!deja.rowCount, 'DATE_PASSEE',
      `Modification de ${deja.rows.map(r => CHAMPS_SOCIETE[r.champ as ChampSociete].libelle).join(', ')} : la date d'effet ne peut pas être antérieure à aujourd'hui (REF-RG-012)`);
  }
  const objetId = (await q.query<{ id: string }>('SELECT id FROM societe LIMIT 1')).rows[0]?.id
    ?? (await q.query<{ id: string }>('INSERT INTO societe DEFAULT VALUES RETURNING id')).rows[0]!.id;
  return soumettre(q, acteur, { typeOperation: OPERATION_FICHE_SOCIETE, objetType: 'societe', objetId, donnees: { valeurs, dateEffet, motif: d.motif } });
}

/** Met la ligne `societe` à l'image de la fiche du jour (à l'application d'une modification, puis chaque jour par l'ordonnanceur). */
export async function rafraichirSociete(q: Executant): Promise<void> {
  const f = await ficheSociete(q);
  const cols = CHAMPS.map((c, i) => `${c} = $${i + 1}`).join(', ');
  await q.query(`UPDATE societe SET ${cols}`, CHAMPS.map(c => (c === 'capital_social' ? (f[c] ? Number(f[c]) : null) : f[c] ?? null)));
}

enregistrerOperation(OPERATION_FICHE_SOCIETE, {
  administrative: false,
  async appliquer(q, demande, acteur) {
    const d = demande.donnees as { valeurs: Record<ChampSociete, string>; dateEffet: string };
    const avant = await ficheSociete(q, d.dateEffet);
    for (const [champ, valeur] of Object.entries(d.valeurs)) {
      await q.query(
        `INSERT INTO societe_historique (champ, ancienne_valeur, nouvelle_valeur, date_effet, auteur_id, valide_par) VALUES ($1,$2,$3,$4,$5,$6)`,
        [champ, avant[champ as ChampSociete] ?? null, valeur, d.dateEffet, demande.initiateur_id, acteur.utilisateurId]);
    }
    await rafraichirSociete(q);
    await journaliser(q, {
      ...acteur.trace(), action: 'MODIFICATION', objetType: 'societe', objetId: demande.objet_id,
      avant: Object.fromEntries(Object.keys(d.valeurs).map(c => [c, avant[c as ChampSociete] ?? null])), apres: d,
    });
  },
});
