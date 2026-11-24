/**
 * Moteur de numérotation (CDC chapitre 6 ; DD 4.22 ; NUM-RG-001 à 010).
 *
 * - Attribution dans la transaction appelante : si elle échoue, rien n'est consommé (NUM-RG-003, CA-NUM-05).
 * - Compteur verrouillé (SELECT … FOR UPDATE) : pas de doublon sous concurrence (CA-NUM-04).
 * - Alerte à 95 % de la capacité, blocage au maximum (NUM-RG-009, CA-NUM-08).
 * - Chaque attribution est journalisée (NUM-RG-010).
 */
import type { Executant } from '../db/pool.js';
import { ErreurMetier, exiger } from '../noyau/erreurs.js';
import type { Acteur } from '../noyau/acteur.js';
import { journaliser } from './audit.js';

export interface Attribution { valeur: number; alerte: boolean }

/** Prochaine valeur du compteur (type, clé). La ligne du compteur est créée au premier usage. */
export async function prochaineValeur(q: Executant, typeObjet: string, cle: string, valeurMax: number): Promise<Attribution> {
  await q.query(
    `INSERT INTO compteur_numerotation (type_objet, cle_compteur, derniere_valeur, valeur_max) VALUES ($1,$2,0,$3)
     ON CONFLICT (type_objet, cle_compteur) DO NOTHING`, [typeObjet, cle, valeurMax]);
  const r = await q.query<{ id: string; derniere_valeur: number; valeur_max: number }>(
    'SELECT id, derniere_valeur, valeur_max FROM compteur_numerotation WHERE type_objet=$1 AND cle_compteur=$2 FOR UPDATE', [typeObjet, cle]);
  const c = r.rows[0]!;
  if (c.derniere_valeur >= c.valeur_max) {
    throw new ErreurMetier('COMPTEUR_EPUISE',
      `Numérotation ${typeObjet} épuisée pour ${cle} (${c.valeur_max} atteint) : émission bloquée, l'administrateur est alerté`, 409);
  }
  const valeur = c.derniere_valeur + 1;
  await q.query('UPDATE compteur_numerotation SET derniere_valeur=$2 WHERE id=$1', [c.id, valeur]);
  return { valeur, alerte: valeur >= Math.ceil(c.valeur_max * 0.95) };
}

// ---------------------------------------------------------------- Clé ISO/IEC 7064 MOD 97-10 (NUM-RG-004)

function mod97(chiffres: string): number {
  let r = 0;
  for (const ch of chiffres) r = (r * 10 + Number(ch)) % 97;
  return r;
}

/** K = 98 − ((B × 100) mod 97), sur 2 chiffres. */
export function cleMod97(base: string): string {
  exiger(/^\d+$/.test(base), 'NUMERO_INVALIDE', 'Base numérique attendue');
  return String(98 - mod97(base + '00')).padStart(2, '0');
}

export function numeroPoliceValide(numero: string): boolean {
  return /^[12]\d{14}$/.test(numero) && mod97(numero) === 1;
}

/** Contrôle à la saisie ou à la recherche (CA-NUM-06). */
export function controlerNumeroPolice(numero: string): void {
  const n = numero.replace(/\s/g, '');
  exiger(numeroPoliceValide(n), 'CLE_INCORRECTE', `Numéro de police ${numero} rejeté : clé de contrôle incorrecte`);
}

/** Composition d'un numéro de police (NUM-RG-001, 002, 008). */
export function composerNumeroPolice(p: { nature: 'PHYSIQUE' | 'MORALE'; codeBureau: string; codeProduit: string; sequence: number; annee: number }): string {
  exiger(/^\d{2}$/.test(p.codeBureau) && /^\d{2}$/.test(p.codeProduit), 'CODE_INVALIDE', 'Codes bureau et produit sur 2 chiffres');
  exiger(p.sequence >= 1 && p.sequence <= 999_999, 'SEQUENCE_INVALIDE', 'Séquence hors limites');
  exiger(p.annee >= 2000 && p.annee <= 2099, 'ANNEE_INVALIDE', 'Année sur 4 chiffres attendue');
  const base = `${p.nature === 'PHYSIQUE' ? 1 : 2}${p.codeBureau}${p.codeProduit}${String(p.sequence).padStart(6, '0')}${String(p.annee).slice(2)}`;
  return base + cleMod97(base);
}

// ---------------------------------------------------------------- Formats (§ 6.1 et 6.3)

const pad = (n: number, l: number) => String(n).padStart(l, '0');

export type Numerotation =
  | { type: 'POLICE'; nature: 'PHYSIQUE' | 'MORALE'; codeBureau: string; codeProduit: string; annee: number }
  | { type: 'QUITTANCE'; codeBureau: string; annee: number }
  | { type: 'AVENANT'; numeroPolice: string }
  | { type: 'ADHERENT'; numeroPolice: string }
  | { type: 'ORDONNANCE' | 'BON_ANALYSE' | 'BON_AUTRE'; annee: number }
  | { type: 'APPEL_PRIME' | 'CARTE_PRO' | 'FICHE_IMPUTATION' | 'MOUVEMENT_PORTEFEUILLE' | 'SINISTRE' | 'IMMOBILISATION'; annee: number }
  | { type: 'RDV' | 'VERSEMENT_PROGRAMME' | 'PEC' | 'RECU_APPROVISIONNEMENT'; annee: number }
  | { type: 'FACTURE_COMMISSION'; annee: number; mois: number }
  | { type: 'RECLAMATION'; annee: number }
  | { type: 'TIERS' };

const PREFIXES6: Record<string, string> = {
  APPEL_PRIME: 'AP', CARTE_PRO: 'CP', FICHE_IMPUTATION: 'FI', MOUVEMENT_PORTEFEUILLE: 'MP', SINISTRE: 'SIN', IMMOBILISATION: 'IMM',
};
const PREFIXES8: Record<string, string> = {
  RDV: 'RDV', VERSEMENT_PROGRAMME: 'VP', PEC: 'PEC', RECU_APPROVISIONNEMENT: 'DEP', ORDONNANCE: 'BO', BON_ANALYSE: 'BA', BON_AUTRE: 'BX',
};

/** Attribue un numéro dans la transaction en cours et journalise l'attribution. */
export async function attribuer(q: Executant, acteur: Acteur, n: Numerotation, objet?: { type: string; id: string }): Promise<string> {
  let numero: string;
  let att: Attribution;
  switch (n.type) {
    case 'POLICE': {
      att = await prochaineValeur(q, 'POLICE', `${n.codeBureau}-${n.codeProduit}-${n.annee}`, 999_999);
      numero = composerNumeroPolice({ ...n, sequence: att.valeur });
      break;
    }
    case 'QUITTANCE':
      att = await prochaineValeur(q, 'QUITTANCE', `${n.codeBureau}-${n.annee}`, 999_999);
      numero = `${n.annee}${n.codeBureau}${pad(att.valeur, 6)}`;
      break;
    case 'AVENANT':
      att = await prochaineValeur(q, 'AVENANT', n.numeroPolice, 99);
      numero = `${n.numeroPolice}A${pad(att.valeur, 2)}`;
      break;
    case 'ADHERENT':
      att = await prochaineValeur(q, 'ADHERENT', n.numeroPolice, 99_999);
      numero = pad(att.valeur, 5);
      break;
    case 'FACTURE_COMMISSION': // écart X4 : format du DD 6.10, absent du § 6.3
      att = await prochaineValeur(q, 'FACTURE_COMMISSION', `${n.annee}${pad(n.mois, 2)}`, 999_999);
      numero = `FC${n.annee}${pad(n.mois, 2)}${pad(att.valeur, 6)}`;
      break;
    case 'RECLAMATION': // format non fixé par le CDC : REC + AAAA + 6 chiffres (proposition)
      att = await prochaineValeur(q, 'RECLAMATION', String(n.annee), 999_999);
      numero = `REC${n.annee}${pad(att.valeur, 6)}`;
      break;
    case 'TIERS': // CODE(12) au DD, format non fixé : T + 9 chiffres (compteur INTEGER)
      att = await prochaineValeur(q, 'TIERS', 'GLOBAL', 999_999_999);
      numero = `T${pad(att.valeur, 9)}`;
      break;
    default: {
      if (n.type in PREFIXES6) {
        att = await prochaineValeur(q, n.type, String(n.annee), 999_999);
        numero = `${PREFIXES6[n.type]}${n.annee}${pad(att.valeur, 6)}`;
      } else {
        att = await prochaineValeur(q, n.type, String(n.annee), 99_999_999);
        numero = `${PREFIXES8[n.type]}${n.annee}${pad(att.valeur, 8)}`;
      }
    }
  }
  await journaliser(q, {
    ...acteur.trace(), action: 'CREATION', objetType: 'numerotation', objetId: objet?.id ?? null,
    apres: { type: n.type, numero, objet: objet?.type ?? null, alerte_capacite: att.alerte },
  });
  return numero;
}

/** Numéro de carte d'assuré (§ 6.3, CA-NUM-09). */
export function numeroCarte(numeroPolice: string, rang: number, numeroAdherent?: string): string {
  controlerNumeroPolice(numeroPolice);
  exiger(rang >= 0 && rang <= 99, 'RANG_INVALIDE', 'Rang 00 à 99');
  return numeroAdherent ? `${numeroPolice}-${numeroAdherent}-${pad(rang, 2)}` : `${numeroPolice}-${pad(rang, 2)}`;
}
