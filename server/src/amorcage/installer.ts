/**
 * Installation sur une base vide (rapport L0, B.2) : référentiel initial et premier Administrateur général.
 * Une seule transaction : tout ou rien. Écart X8 : la fiche tiers de l'administrateur est créée dans la même transaction.
 */
import type { Executant } from '../db/pool.js';
import { Acteur } from '../noyau/acteur.js';
import { exiger } from '../noyau/erreurs.js';
import { journaliser } from '../moteurs/audit.js';
import { controlerValeur } from '../moteurs/parametres.js';
import { creer } from '../modules/organisation/service.js';
import { attribuerProfil, creerUtilisateur } from '../modules/habilitations/service.js';
import { creerTiers } from '../modules/referentiels/tiers.js';
import { creerCompteGeneral, creerNature } from '../modules/comptabilite/plan.js';
import { creerExercice } from '../modules/comptabilite/exercices.js';
import { enregistrerSchema } from '../modules/comptabilite/schemas.js';
import {
  BRANCHES, COMPTES_PROPOSES, DELEGATIONS, DEPARTEMENTS, JOURNAUX, MOTIFS_BLOCAGE, NATURES_COMPTE, SCHEMAS, FONCTION_ADMIN, FONCTIONS_SYSTEME, INCOMPATIBILITES, MATRICE, MODELES_NOTIFICATION,
  PARAMETRES, PROFILS, REGLES_LEGALES,
} from './referentiel-initial.js';

/** Qui saisit, valide, paramètre ou exporte une fonction peut aussi la consulter (annexe B : « S, P » sans « C » pour le comptable, par exemple). */
const ACTIONS = { C: ['CONSULTER'], S: ['CONSULTER', 'CREER', 'MODIFIER'], M: ['CONSULTER', 'MODIFIER'], V1: ['CONSULTER', 'VALIDER'], V2: ['CONSULTER', 'VALIDER'], P: ['CONSULTER', 'PARAMETRER'], X: ['CONSULTER', 'EXPORTER'] } as const;
/** Fonctions d'administration du système : seules fonctions où l'administrateur peut valider (ORG-RG-044). */
const FONCTIONS_ADMINISTRATIVES = new Set(['ORGANISATION', 'UTILISATEURS']);

export interface CompteInitial {
  identifiant: string; nom: string; prenoms: string; telephone: string; motDePasse: string;
}

/**
 * Deux comptes sont créés : l'Administrateur général et un représentant de la Direction générale.
 * Sans ce second compte, aucune attribution de profil privilégié ne pourrait être validée par une seconde personne
 * (ORG-RG-044) : écart X14.
 */
export async function installer(q: Executant, admin: CompteInitial, direction: CompteInitial, dateEffetInstallation?: string): Promise<{ utilisateurId: string; directionId: string }> {
  const deja = await q.query('SELECT 1 FROM utilisateur LIMIT 1');
  exiger(!deja.rowCount, 'DEJA_INSTALLE', 'Installation déjà faite : la base contient des utilisateurs');
  const systeme = Acteur.systeme();
  const dateEffet = dateEffetInstallation ?? new Date().toISOString().slice(0, 10);

  // Règles légales et paramètres
  const regles = new Map<string, string>();
  for (const r of REGLES_LEGALES) {
    const x = await q.query<{ id: string }>(
      `INSERT INTO regle_legale (code, texte_reference, description, mode, verrouillee) VALUES ($1,$2,$3,'BLOQUANT',$4) RETURNING id`,
      [r.code, r.texte, r.description, r.verrouillee]);
    regles.set(r.code, x.rows[0]!.id);
  }
  for (const [code, libelle, module, type, defaut, regle, sens] of PARAMETRES) {
    controlerValeur(type, defaut);
    const p = await q.query<{ id: string }>(
      `INSERT INTO parametre (code, libelle, module, type_valeur, valeur, valeur_defaut, regle_legale_id, date_effet, sens_protecteur)
       VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8) RETURNING id`,
      [code, libelle, module, type, defaut, regle ? regles.get(regle) : null, dateEffet, sens ?? null]);
    void p;
  }

  // Droits et profils (annexe B)
  const droits = new Map<string, string>();
  const droit = async (fonction: string, action: string, niveau: number | null) => {
    const k = `${fonction}|${action}|${niveau ?? ''}`;
    if (!droits.has(k)) {
      const r = await q.query<{ id: string }>('INSERT INTO droit (fonction_systeme, action, niveau_validation) VALUES ($1,$2,$3) RETURNING id', [fonction, action, niveau]);
      droits.set(k, r.rows[0]!.id);
    }
    return droits.get(k)!;
  };
  const profils = new Map<string, string>();
  const valideMetier = new Set<string>();
  for (const p of PROFILS) {
    const lignes = Object.entries(MATRICE).flatMap(([f, m]) => (m[p.code] ?? []).map(c => [f, c] as const));
    for (const [f] of lignes) exiger(f in FONCTIONS_SYSTEME, 'FONCTION_INCONNUE', `Fonction ${f} absente du référentiel`);
    const privilegie = lignes.some(([, c]) => c === 'V1' || c === 'V2' || c === 'P');
    if (lignes.some(([f, c]) => (c === 'V1' || c === 'V2') && !FONCTIONS_ADMINISTRATIVES.has(f))) valideMetier.add(p.code);
    const r = await q.query<{ id: string }>('INSERT INTO profil (code, libelle, externe, privilegie) VALUES ($1,$2,$3,$4) RETURNING id',
      [p.code, p.libelle, p.externe ?? false, privilegie]);
    profils.set(p.code, r.rows[0]!.id);
    for (const [f, c] of lignes) {
      for (const a of ACTIONS[c]) {
        const niveau = c === 'V1' ? 1 : c === 'V2' ? 2 : null;
        await q.query('INSERT INTO profil_droit (profil_id, droit_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [r.rows[0]!.id, await droit(f, a, niveau)]);
      }
    }
  }
  const incompat = async (a: string, b: string, motif: string) => {
    const [x, y] = [profils.get(a)!, profils.get(b)!].sort();
    await q.query('INSERT INTO incompatibilite_profil (profil_a_id, profil_b_id, motif) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [x, y, motif]);
  };
  for (const [a, b, motif] of INCOMPATIBILITES) await incompat(a, b, motif);
  for (const p of valideMetier) {
    await incompat('ADMIN_GENERAL', p, 'L\'Administrateur général ne dispose d\'aucun droit de validation métier ou financière (ORG-RG-044)');
  }

  for (const d of DELEGATIONS) {
    for (const n of d.niveaux) for (const p of n.profils) {
      await q.query('INSERT INTO delegation_validation (type_operation, niveau, profil_id, date_effet) VALUES ($1,$2,$3,$4)',
        [d.type, n.niveau, profils.get(p), dateEffet]);
    }
  }
  for (const m of MODELES_NOTIFICATION) {
    await q.query(`INSERT INTO modele_notification (code, canal, langue, contenu, actif) VALUES ($1,$2,'fr',$3,true)`, [m.code, m.canal, m.contenu]);
  }

  for (const m of MOTIFS_BLOCAGE) {
    await q.query('INSERT INTO motif_blocage_ref (code, libelle_assure, libelle_prestataire, module_deposant, actif, definitif) VALUES ($1,$2,$3,$4,true,$5)',
      [m.code, m.assure, m.prestataire, m.modules, m.definitif ?? false]);
  }

  // Natures et comptes proposés (FIN-RG-078, § 11.10)
  for (const n of NATURES_COMPTE) await creerNature(q, systeme, { code: n.code, libelle: n.libelle, trancheDefaut: n.tranche, controles: n.controles });
  for (const c of COMPTES_PROPOSES) {
    await creerCompteGeneral(q, systeme, { numero: c.numero, libelle: c.libelle, parentNumero: c.parent, collectif: c.collectif, imputable: c.imputable, sensHabituel: c.sens, dateEffet });
  }

  // Branches, journaux, exercice en cours et schémas comptables (§ 11.7, 11.10, 11.13)
  const compteId = async (n: string) => (await q.query<{ id: string }>(`SELECT id FROM compte WHERE numero = rpad($1, 8, '0')`, [n])).rows[0]!.id;
  for (const b of BRANCHES) {
    await q.query('INSERT INTO branche_comptable (code, libelle, compte_primes_id, compte_annulations_id, compte_sinistres_id) VALUES ($1,$2,$3,$4,$5)',
      [b.code, b.libelle, await compteId(b.primes), await compteId(b.annulations), await compteId(b.sinistres)]);
  }
  for (const j of JOURNAUX) {
    await q.query(`INSERT INTO journal (code, libelle, type, mode, compte_tresorerie_id, numerotation, rapprochement, ferme) VALUES ($1,$2,$3,$4,$5,'CONTINUE_JOURNAL_EXERCICE',$6,false)`,
      [j.code, j.libelle, j.type, j.mode, j.tresorerie ? await compteId(j.tresorerie) : null, j.type.startsWith('TRESORERIE')]);
  }
  const annee = dateEffet.slice(0, 4);
  await creerExercice(q, systeme, { code: annee, dateDebut: `${annee}-01-01`, dateFin: `${annee}-12-31` });
  for (const sc of SCHEMAS) await enregistrerSchema(q, systeme, { ...sc, dateEffet: `${annee}-01-01` });

  // Organisation (§ 3.2)
  const services = new Map<string, string>();
  for (const d of DEPARTEMENTS) {
    const id = await creer(q, systeme, 'DEPARTEMENT', { code: d.code, libelle: d.libelle, dateEffet });
    for (const [code, libelle] of d.services) services.set(code, await creer(q, systeme, 'SERVICE', { code, libelle, parentId: id, dateEffet }));
  }
  const fonctionAdmin = await creer(q, systeme, 'FONCTION', {
    code: FONCTION_ADMIN.code, libelle: FONCTION_ADMIN.libelle, parentId: services.get(FONCTION_ADMIN.service), profilDefautId: profils.get('ADMIN_GENERAL'), dateEffet,
  });

  const fonctionDg = await creer(q, systeme, 'FONCTION', {
    code: 'DIRECTEUR_GENERAL', libelle: 'Directeur général', parentId: services.get('DG_SEC'), profilDefautId: profils.get('DIRECTION_GENERALE'), dateEffet,
  });

  // Comptes initiaux (écart X8 : fiche tiers créée dans la même transaction)
  const compte = async (c: CompteInitial, fonctionId: string, profil: string) => {
    const tiersId = await creerTiers(q, systeme, { nature: 'PHYSIQUE', nom: c.nom, prenoms: c.prenoms, telephone: c.telephone });
    await q.query('UPDATE tiers SET telephone_verifie = true WHERE id = $1', [tiersId]);
    await q.query(`INSERT INTO tiers_role (tiers_id, role, date_debut) VALUES ($1,'EMPLOYE',$2)`, [tiersId, dateEffet]);
    const id = await creerUtilisateur(q, systeme, { identifiant: c.identifiant, tiersId, typeCompte: 'INTERNE', fonctionId, motDePasse: c.motDePasse, telephone: c.telephone });
    await attribuerProfil(q, systeme, { utilisateurId: id, profilId: profils.get(profil)!, dateDebut: dateEffet });
    return id;
  };
  exiger(admin.identifiant !== direction.identifiant && admin.telephone !== direction.telephone, 'COMPTES_DISTINCTS', 'Les deux comptes initiaux doivent appartenir à deux personnes distinctes');
  const utilisateurId = await compte(admin, fonctionAdmin, 'ADMIN_GENERAL');
  const directionId = await compte(direction, fonctionDg, 'DIRECTION_GENERALE');
  await journaliser(q, { action: 'PARAMETRAGE', objetType: 'installation', apres: { administrateur: admin.identifiant, direction: direction.identifiant, profils: PROFILS.length, parametres: PARAMETRES.length } });
  return { utilisateurId, directionId };
}
