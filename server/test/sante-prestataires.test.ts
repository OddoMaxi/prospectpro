/** Lot 3, sous-lot 3.1 – Prestataires agréés et professionnels de santé : CA-SAN-08, 10, 11, 13 ; SAN-RG-001 à 010. */
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool, transaction } from '../src/db/pool.js';
import { Acteur } from '../src/noyau/acteur.js';
import { GardienLocal, MoteurChiffrement } from '../src/moteurs/chiffrement.js';
import { decider } from '../src/moteurs/validation.js';
import { controlerDroit } from '../src/modules/habilitations/droits.js';
import { creerTiers } from '../src/modules/referentiels/tiers.js';
import { proposerCoordonnee } from '../src/modules/referentiels/coordonnees.js';
import { enregistrerActe, enregistrerMedicament, importer, listerActes } from '../src/modules/sante/nomenclatures.js';
import {
  activerProfessionnel, ajouterProfessionnel, ajouterTarif, changerStatutPrestataire, changerStatutProfessionnel, creerPrestataire, modifierPrestataire,
  proposerAgrementPrestataire, tarifEnVigueur, type NouveauProfessionnel,
} from '../src/modules/sante/prestataires.js';
import { fermer, installee, MDP, ouvrir, pieceFictive, sms, utilisateur } from './outils.js';

let admin: Acteur, dg: Acteur, gest: Acteur, mc: Acteur, daf: Acteur, comptable: Acteur;
const chiffrement = new MoteurChiffrement(new GardienLocal(randomBytes(32)));
const valider = (qui: Acteur, id: string) => transaction(qui.utilisateurId, q => decider(q, qui, id, 'VALIDE'));
let n = 0;
const tel = () => `+2246255${String(++n).padStart(4, '0')}`;
const statut = async (utilisateurId: string) => (await getPool().query('SELECT statut FROM utilisateur WHERE id = $1', [utilisateurId])).rows[0].statut as string;
const sessionOuverte = async (utilisateurId: string) => (await getPool().query<{ id: string }>(
  `INSERT INTO session_utilisateur (utilisateur_id, etape, expire_le) VALUES ($1, 'OUVERTE', now() + interval '1 hour') RETURNING id`, [utilisateurId])).rows[0]!.id;
const revoquee = async (sessionId: string) => (await getPool().query('SELECT revoquee_le FROM session_utilisateur WHERE id = $1', [sessionId])).rows[0].revoquee_le !== null;

/** Structure agréée : convention, coordonnées vérifiées, tarif, administrateur ; validée par le médecin-conseil puis la DAF. */
async function structureAgreee(nom: string, type: string) {
  const tiersId = await transaction(gest.utilisateurId, q => creerTiers(q, gest, { nature: 'MORALE', nom, telephone: tel(), adresse: 'Conakry' }));
  const p = await transaction(gest.utilisateurId, q => creerPrestataire(q, gest, { tiersId, type }));
  await transaction(gest.utilisateurId, q => ajouterTarif(q, gest, p.id, { acteCode: 'C01', tarif: 150_000, dateEffet: '2020-01-01' }));
  await transaction(gest.utilisateurId, async q => modifierPrestataire(q, gest, p.id, { conventionDocumentId: await pieceFictive('prestataire') }));
  const c = await transaction(gest.utilisateurId, q => proposerCoordonnee(q, gest, chiffrement, { tiersId, type: 'BANQUE', etablissement: 'Ecobank', numero: `GN00${randomBytes(6).toString('hex')}`, intitule: nom }));
  await valider(comptable, c.demandeValidation);
  const resp = await transaction(gest.utilisateurId, q => creerTiers(q, gest, { nature: 'PHYSIQUE', nom: `ADMIN ${nom}`, prenoms: 'Responsable', telephone: tel() }));
  const a = await transaction(gest.utilisateurId, q => proposerAgrementPrestataire(q, gest, p.id, { tiersId: resp, identifiant: `admin.${nom.toLowerCase().replace(/\W/g, '')}`, motDePasse: MDP }));
  await valider(mc, a.demandeValidation);
  await valider(daf, a.demandeValidation);
  return { ...p, tiersId, admin: new Acteur(a.administrateurId) };
}
const pro = async (profession: NouveauProfessionnel['profession'], numeroOrdre: string, identifiant: string, nom = 'KOUROUMA'): Promise<NouveauProfessionnel> => ({
  nom, prenoms: identifiant, telephone: tel(), typePiece: 'CNI', numeroPiece: `CNI${numeroOrdre}`, profession, numeroOrdre, identifiant, motDePasse: MDP,
  diplomeDocumentId: await pieceFictive('prestataire'), pieceDocumentId: await pieceFictive('prestataire'),
});

beforeAll(async () => {
  await ouvrir();
  ({ admin, dg } = await installee());
  gest = await utilisateur(admin, 'gest.sante', [{ code: 'GEST_SANTE' }], dg);
  mc = await utilisateur(admin, 'medecin.conseil', [{ code: 'MEDECIN_CONSEIL' }], dg);
  daf = await utilisateur(admin, 'daf', [{ code: 'DAF' }], dg);
  comptable = await utilisateur(admin, 'comptable', [{ code: 'COMPTABLE' }], dg);
  await transaction(gest.utilisateurId, q => enregistrerActe(q, gest, { code: 'C01', libelle: 'Consultation de médecine générale', famille: 'CONSULTATION' }));
}, 90_000);
afterAll(fermer);

describe('Nomenclatures (§ 5.6)', () => {
  it('actes et médicaments codifiés ; import ligne par ligne avec erreurs rapportées', async () => {
    await transaction(gest.utilisateurId, q => enregistrerMedicament(q, gest, { code: 'AMOX500', denomination: 'Amoxicilline 500 mg', dci: 'amoxicilline', generique: true, couvert: true, quantiteMaxOrdonnance: 3 }));
    const r = await transaction(gest.utilisateurId, q => importer(q, gest, 'ACTES', 'code;libellé;famille\nB01;Numération formule sanguine;ANALYSE\nR01;Radiographie thoracique;IMAGERIE\nX;Code invalide;ANALYSE'));
    expect(r.importees).toBe(2);
    expect(r.erreurs).toHaveLength(1);
    expect((await listerActes(getPool(), { famille: 'IMAGERIE' })).map(a => a.code)).toEqual(['R01']);
  });
});

describe('Prestataires agréés (SAN-RG-001 à 003)', () => {
  it('agrément refusé sans convention, coordonnées ni tarifs ; validé, il active le compte de l\'administrateur ; tarif en vigueur daté', async () => {
    const tiersId = await transaction(gest.utilisateurId, q => creerTiers(q, gest, { nature: 'MORALE', nom: 'CLINIQUE AMBROISE', telephone: tel() }));
    const p = await transaction(gest.utilisateurId, q => creerPrestataire(q, gest, { tiersId, type: 'CLINIQUE' }));
    const opts = (await getPool().query('SELECT option FROM prestataire_option WHERE prestataire_id = $1 AND actif ORDER BY option', [p.id])).rows.map(r => r.option);
    expect(opts).toEqual(['H24', 'HOSPITALISATION', 'URGENCES']);
    const resp = await transaction(gest.utilisateurId, q => creerTiers(q, gest, { nature: 'PHYSIQUE', nom: 'BAH', prenoms: 'Responsable', telephone: tel() }));
    const proposer = () => transaction(gest.utilisateurId, q => proposerAgrementPrestataire(q, gest, p.id, { tiersId: resp, identifiant: 'admin.ambroise', motDePasse: MDP }));
    await expect(proposer()).rejects.toMatchObject({ code: 'CONVENTION_REQUISE' });
    const s = await structureAgreee('CLINIQUE PASTEUR', 'CLINIQUE');
    expect((await getPool().query('SELECT statut FROM prestataire WHERE id = $1', [s.id])).rows[0].statut).toBe('AGREE');
    expect(await statut(s.admin.utilisateurId!)).toBe('ACTIF');
    expect(await controlerDroit(getPool(), s.admin.utilisateurId!, 'MA_STRUCTURE', 'CREER')).toBeDefined();
    await transaction(gest.utilisateurId, q => ajouterTarif(q, gest, s.id, { acteCode: 'C01', tarif: 175_000, dateEffet: '2030-01-01' }));
    expect(await tarifEnVigueur(getPool(), s.id, { acteCode: 'C01' })).toBe(150_000);
    expect(await tarifEnVigueur(getPool(), s.id, { acteCode: 'C01' }, '2030-02-01')).toBe(175_000);
    expect(await tarifEnVigueur(getPool(), s.id, { acteCode: 'B01' })).toBeNull();
  });
});

describe('Professionnels de santé (SAN-RG-004 à 010)', () => {
  it('CA-SAN-13 : compte non activable avant l\'agrément du professionnel ; CA-SAN-08 : profils fixés par la Compagnie ; agrément individuel', async () => {
    const s = await structureAgreee('CENTRE MEDICAL KALOUM', 'CLINIQUE');
    // Profession non admise dans une clinique (le profil pharmacien relève des pharmacies)
    await expect(transaction(s.admin.utilisateurId, async q => ajouterProfessionnel(q, s.admin, await pro('PHARMACIEN', 'PH-1', 'ph.kaloum'))))
      .rejects.toMatchObject({ code: 'PROFESSION_NON_ADMISE' });
    const m = await transaction(s.admin.utilisateurId, async q => ajouterProfessionnel(q, s.admin, await pro('MEDECIN', 'ORD-1001', 'dr.camara', 'CAMARA')));
    expect(m).toMatchObject({ actif: false });
    expect(await statut(m.utilisateurId)).toBe('A_VALIDER');
    await expect(transaction(s.admin.utilisateurId, q => activerProfessionnel(q, s.admin, m.exerciceId, true, 'Arrivée'))).rejects.toMatchObject({ code: 'PROFESSIONNEL_NON_AGREE' });
    // L'administrateur ne peut ni paramétrer les profils ni gérer les habilitations de la Compagnie
    await expect(controlerDroit(getPool(), s.admin.utilisateurId!, 'UTILISATEURS', 'PARAMETRER')).rejects.toMatchObject({ statut: 403 });
    await expect(controlerDroit(getPool(), m.utilisateurId, 'MA_STRUCTURE', 'CONSULTER')).rejects.toMatchObject({ statut: 403 });
    const profil = (await getPool().query(`SELECT p.code FROM utilisateur_profil up JOIN profil p ON p.id = up.profil_id WHERE up.utilisateur_id = $1`, [m.utilisateurId])).rows.map(r => r.code);
    expect(profil).toEqual(['MEDECIN_PRESCRIPTEUR']);
    await valider(mc, m.demandeAgrement!);
    expect(await statut(m.utilisateurId)).toBe('ACTIF');
    expect(sms.dernier((await getPool().query('SELECT telephone FROM tiers t JOIN utilisateur u ON u.tiers_id = t.id WHERE u.id = $1', [m.utilisateurId])).rows[0].telephone)!.texte).toContain('agrément');
    // CA-SAN-10 (structure) : le même médecin exerce dans un second centre avec un compte nominatif propre, actif d'emblée
    const s2 = await structureAgreee('CABINET RATOMA', 'CABINET_MEDICAL');
    const m2 = await transaction(s2.admin.utilisateurId, async q => ajouterProfessionnel(q, s2.admin, await pro('MEDECIN', 'ORD-1001', 'dr.camara.ratoma', 'CAMARA')));
    expect(m2).toMatchObject({ professionnelId: m.professionnelId, actif: true, demandeAgrement: null });
    // SAN-RG-006 : la fin de l'agrément du professionnel désactive ses comptes dans toutes les structures
    await transaction(gest.utilisateurId, q => changerStatutProfessionnel(q, gest, m.professionnelId, false, 'Radiation de l\'ordre'));
    expect([await statut(m.utilisateurId), await statut(m2.utilisateurId)]).toEqual(['DESACTIVE', 'DESACTIVE']);
  });

  it('CA-SAN-11 : désactivation d\'un pharmacien par l\'administrateur (sessions fermées), puis fin de convention : tous les comptes désactivés', async () => {
    const s = await structureAgreee('PHARMACIE CENTRALE', 'PHARMACIE');
    const ph = await transaction(s.admin.utilisateurId, async q => ajouterProfessionnel(q, s.admin, await pro('PHARMACIEN', 'PH-2001', 'ph.diallo', 'DIALLO')));
    await valider(mc, ph.demandeAgrement!);
    const ph2 = await transaction(s.admin.utilisateurId, async q => ajouterProfessionnel(q, s.admin, await pro('PHARMACIEN', 'PH-2002', 'ph.sylla', 'SYLLA')));
    await valider(mc, ph2.demandeAgrement!);
    const session = await sessionOuverte(ph.utilisateurId);
    await transaction(s.admin.utilisateurId, q => activerProfessionnel(q, s.admin, ph.exerciceId, false, 'Départ'));
    expect(await statut(ph.utilisateurId)).toBe('DESACTIVE');
    expect(await revoquee(session)).toBe(true);
    const sessionAdmin = await sessionOuverte(s.admin.utilisateurId!);
    const r = await transaction(gest.utilisateurId, q => changerStatutPrestataire(q, gest, s.id, 'FIN_CONVENTION', 'Convention non renouvelée'));
    expect(r.comptesDesactives).toBe(2); // administrateur et second pharmacien
    expect([await statut(s.admin.utilisateurId!), await statut(ph2.utilisateurId)]).toEqual(['DESACTIVE', 'DESACTIVE']);
    expect(await revoquee(sessionAdmin)).toBe(true);
  });

  it('suspension de la structure puis nouvel agrément : comptes suspendus puis rétablis', async () => {
    const s = await structureAgreee('LABO BIOSANTE', 'LABORATOIRE');
    const b = await transaction(s.admin.utilisateurId, async q => ajouterProfessionnel(q, s.admin, await pro('BIOLOGISTE', 'BIO-1', 'bio.conde', 'CONDE')));
    await valider(mc, b.demandeAgrement!);
    await transaction(gest.utilisateurId, q => changerStatutPrestataire(q, gest, s.id, 'SUSPENDU', 'Contrôle en cours'));
    expect(await statut(b.utilisateurId)).toBe('SUSPENDU');
    const a = await transaction(gest.utilisateurId, q => proposerAgrementPrestataire(q, gest, s.id, { tiersId: crypto.randomUUID(), identifiant: 'x', motDePasse: MDP }));
    await valider(mc, a.demandeValidation);
    await valider(daf, a.demandeValidation);
    expect([await statut(s.admin.utilisateurId!), await statut(b.utilisateurId)]).toEqual(['ACTIF', 'ACTIF']);
  });
});
