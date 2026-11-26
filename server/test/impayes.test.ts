/**
 * Non-paiement (article 30) et alertes de conformité : CA-PROD-14, 15 ; PROD-RG-028 ; COM-RG-084.
 * La prime due en cours de contrat est ici la prime supplémentaire d'un avenant de correction (quittance à terme légal).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool, transaction } from '../src/db/pool.js';
import { Acteur } from '../src/noyau/acteur.js';
import { ajouterJours, aujourdhui } from '../src/noyau/dates.js';
import { normaliserNumero } from '../src/modules/comptabilite/plan.js';
import { creerIntervenant, enregistrerTraite, proposerAgrement } from '../src/modules/commercial/intervenants.js';
import { attribuerCode } from '../src/modules/commercial/prescripteurs.js';
import { accepterRecapitulatif, enregistrerDonnees, ouvrirDossier, presenterRecapitulatif, tarifierDossier } from '../src/modules/production/dossiers.js';
import { emettre } from '../src/modules/production/emission.js';
import { proposerCorrection, proposerResiliation, reglerAvenant } from '../src/modules/production/vieContrat.js';
import { calendrierArticle30, listerImpayes, traiterImpayes, validerEnvoi } from '../src/modules/production/nonPaiement.js';
import { listerAlertes, traiterAlerte } from '../src/modules/conformite/alertes.js';
import { emettrePolice, personne, preparer, telephone, valider, type Contexte } from './contexte-production.js';
import { fermer, ouvrir, pieceFictive, sms } from './outils.js';

let c: Contexte, conformite: Acteur;
const T = aujourdhui();
const systeme = Acteur.systeme();
const solde = async (numero: string, aux?: string) => Number((await getPool().query(
  `SELECT COALESCE(sum(l.debit - l.credit), 0)::bigint AS s FROM ligne_ecriture l JOIN ecriture e ON e.id = l.ecriture_id JOIN compte c ON c.id = l.compte_id
    WHERE c.numero = $1 AND e.statut = 'VALIDEE' AND ($2::uuid IS NULL OR l.compte_auxiliaire_id = $2)`, [normaliserNumero(numero), aux ?? null])).rows[0].s);
const statutPolice = async (id: string) => (await getPool().query('SELECT statut FROM police WHERE id = $1', [id])).rows[0].statut as string;
const mise = async (policeId: string) => (await getPool().query(`SELECT * FROM mise_en_demeure WHERE police_id = $1 ORDER BY cree_le DESC LIMIT 1`, [policeId])).rows[0];

/** Police avec une prime supplémentaire impayée : date de naissance corrigée vers la tranche 46-65 ans. */
async function impaye(nom: string) {
  const p = await emettrePolice(c, nom);
  const pa = (await getPool().query(`SELECT id FROM police_assure WHERE police_id = $1 AND qualite = 'ASSURE_PRINCIPAL'`, [p.policeId])).rows[0].id;
  const prop = await transaction(c.agentU.utilisateurId, q => proposerCorrection(q, c.agentU, p.policeId, { policeAssureId: pa, dateNaissance: '1970-01-01', motif: 'Acte de naissance' }));
  await valider(c.gest, prop.demandeValidation);
  const a = (await getPool().query(`SELECT id, quittance_id FROM avenant WHERE police_id = $1 AND type = 'CORRECTION'`, [p.policeId])).rows[0];
  return { ...p, avenantId: a.id as string, quittanceId: a.quittance_id as string, montant: prop.totale };
}

beforeAll(async () => {
  await ouvrir();
  c = await preparer();
  conformite = new Acteur((await getPool().query(`SELECT id FROM utilisateur WHERE identifiant = 'conformite'`)).rows[0].id);
  await getPool().query(`UPDATE tarif SET age_max = 45 WHERE formule_id = $1 AND qualite = 'ASSURE_PRINCIPAL'`, [c.formuleId]);
  await getPool().query(`INSERT INTO tarif (formule_id, qualite, age_min, age_max, prime_nette, date_effet) SELECT formule_id, qualite, 46, 65, 6290000, date_effet FROM tarif WHERE formule_id = $1 AND qualite = 'ASSURE_PRINCIPAL'`, [c.formuleId]);
}, 90_000);
afterAll(fermer);

describe('Calendrier de l\'article 30', () => {
  it('jour d\'envoi exclu : envoi le 25/12/2026, suspension le 25/01/2027, résiliation possible le 04/02/2027 ; un dernier jour férié reporte l\'échéance', async () => {
    expect(await calendrierArticle30(getPool(), '2026-12-25')).toEqual({ suspension: '2027-01-25', resiliation: '2027-02-04' });
    await getPool().query(`INSERT INTO jour_ferie (date, libelle) VALUES ('2027-01-24', 'Férié de test')`);
    expect((await calendrierArticle30(getPool(), '2026-12-25')).suspension).toBe('2027-01-26');
  });
});

describe('Procédure de non-paiement (PROD-RG-028)', () => {
  it('CA-PROD-14 : relance à l\'échéance, mise en demeure à J+10 validée par la gestion, cartes actives jusqu\'à la fin du délai puis police suspendue', async () => {
    const p = await impaye('IMPAYE-A');
    const tel = await telephone(p.souscripteur);
    expect(await traiterImpayes(getPool(), systeme, T)).toMatchObject({ relances: 1, misesEnDemeure: 0 });
    expect(sms.dernier(tel)!.texte).toContain('est due depuis');
    expect((await traiterImpayes(getPool(), systeme, T)).relances).toBe(0); // une seule relance
    expect((await traiterImpayes(getPool(), systeme, ajouterJours(T, 9))).misesEnDemeure).toBe(0);
    expect((await traiterImpayes(getPool(), systeme, ajouterJours(T, 10))).misesEnDemeure).toBe(1);
    const m = await mise(p.policeId);
    expect(m).toMatchObject({ statut: 'A_VALIDER' });
    const ligne = (await listerImpayes(getPool())).find(x => x.id === p.quittanceId)!;
    expect(ligne).toMatchObject({ mise_statut: 'A_VALIDER', prime_totale: p.montant });
    // Envoi validé (date d'envoi confirmée) : calendrier recalculé et verrouillé
    await expect(transaction(c.gest.utilisateurId, q => validerEnvoi(q, c.gest, m.id, ajouterJours(T, 1)))).rejects.toMatchObject({ code: 'DATE_INVALIDE' });
    const v = await transaction(c.gest.utilisateurId, q => validerEnvoi(q, c.gest, m.id, T));
    expect(v).toMatchObject(await calendrierArticle30(getPool(), T));
    // Cartes actives jusqu'à la fin du délai, puis suspension
    await traiterImpayes(getPool(), systeme, ajouterJours(v.suspension, -1));
    expect(await statutPolice(p.policeId)).toBe('ACTIVE');
    expect((await traiterImpayes(getPool(), systeme, v.suspension)).suspensions).toBe(1);
    expect(await statutPolice(p.policeId)).toBe('SUSPENDUE');
    expect(sms.dernier(tel)!.texte).toContain('suspendues');
  });

  it('CA-PROD-15 : paiement pendant la suspension : reprise le lendemain à midi, période de suspension conservée', async () => {
    const p = await impaye('IMPAYE-B');
    await traiterImpayes(getPool(), systeme, ajouterJours(T, 10));
    const m = await mise(p.policeId);
    const v = await transaction(c.gest.utilisateurId, q => validerEnvoi(q, c.gest, m.id, T));
    await traiterImpayes(getPool(), systeme, v.suspension);
    expect(await statutPolice(p.policeId)).toBe('SUSPENDUE');
    const r = await transaction(c.agentU.utilisateurId, q => reglerAvenant(q, c.agentU, p.avenantId, { type: 'COMPTE_PRODUCTION' }));
    expect(r.reprise).toBe(`${ajouterJours(T, 1)}T12:00:00Z`);
    expect(sms.dernier(await telephone(p.souscripteur))!.texte).toContain('reprennent');
    const avantMidi = new Date(`${ajouterJours(T, 1)}T11:59:00Z`), midi = new Date(`${ajouterJours(T, 1)}T12:00:00Z`);
    await traiterImpayes(getPool(), systeme, ajouterJours(T, 1), avantMidi);
    expect(await statutPolice(p.policeId)).toBe('SUSPENDUE');
    expect((await traiterImpayes(getPool(), systeme, ajouterJours(T, 1), midi)).reprises).toBe(1);
    expect(await statutPolice(p.policeId)).toBe('ACTIVE');
    const levee = await mise(p.policeId);
    expect(levee).toMatchObject({ statut: 'LEVEE' });
    expect(String(levee.suspension_le)).toBeTruthy(); // période de suspension conservée : soins non couverts
    // Quittance soldée et lettrée, commission acquise à l'encaissement
    expect((await getPool().query('SELECT statut FROM quittance WHERE id = $1', [p.quittanceId])).rows[0].statut).toBe('SOLDEE');
    expect(Number((await getPool().query(`SELECT count(*) FROM commission WHERE quittance_id = $1 AND type = 'COMMISSION'`, [p.quittanceId])).rows[0].count)).toBe(1);
  });

  it('paiement avant l\'envoi : mise en demeure sans objet', async () => {
    const p = await impaye('IMPAYE-C');
    await traiterImpayes(getPool(), systeme, ajouterJours(T, 10));
    await transaction(c.agentU.utilisateurId, q => reglerAvenant(q, c.agentU, p.avenantId, { type: 'COMPTE_PRODUCTION' }));
    expect(await mise(p.policeId)).toMatchObject({ statut: 'ANNULEE' });
  });

  it('résiliation pour non-paiement : seulement après la suspension et le délai de 10 jours, validée ; la prime impayée est annulée', async () => {
    const p = await impaye('IMPAYE-D');
    await expect(transaction(c.resp1.utilisateurId, q => proposerResiliation(q, c.resp1, p.policeId, { motif: 'NON_PAIEMENT', justification: 'Impayé' })))
      .rejects.toMatchObject({ code: 'MISE_EN_DEMEURE_REQUISE' });
    await traiterImpayes(getPool(), systeme, ajouterJours(T, 10));
    const m = await mise(p.policeId);
    const v = await transaction(c.gest.utilisateurId, q => validerEnvoi(q, c.gest, m.id, T));
    await traiterImpayes(getPool(), systeme, v.suspension);
    await expect(transaction(c.resp1.utilisateurId, q => proposerResiliation(q, c.resp1, p.policeId, { motif: 'NON_PAIEMENT', justification: 'Impayé' })))
      .rejects.toMatchObject({ code: 'DELAI_LEGAL' });
    // Délais écoulés (simulation du temps)
    await getPool().query(`UPDATE mise_en_demeure SET resiliation_possible_le = current_date WHERE id = $1`, [m.id]);
    const aux = (await getPool().query(`SELECT compte_auxiliaire_id FROM tiers_role WHERE tiers_id = $1 AND role = 'SOUSCRIPTEUR'`, [p.souscripteur])).rows[0].compte_auxiliaire_id;
    expect(await solde('412', aux)).toBe(p.montant);
    const d = await transaction(c.resp1.utilisateurId, q => proposerResiliation(q, c.resp1, p.policeId, { motif: 'NON_PAIEMENT', justification: 'Impayé malgré mise en demeure' }));
    expect(d.ristourneEstimee).toBe(0);
    await valider(c.gest, d.demandeValidation);
    await valider(c.daf, d.demandeValidation);
    expect(await statutPolice(p.policeId)).toBe('RESILIEE');
    expect(await mise(p.policeId)).toMatchObject({ statut: 'RESILIEE' });
    expect((await getPool().query('SELECT statut FROM quittance WHERE id = $1', [p.quittanceId])).rows[0].statut).toBe('ANNULEE');
    expect(await solde('412', aux)).toBe(0);
  });
});

describe('Alertes de conformité (COM-RG-084)', () => {
  it('concentration anormale sur un code prescripteur : alerte unique, gravité relevée au double du seuil, clôture motivée', async () => {
    const id = (await getPool().query(`SELECT id FROM parametre WHERE code = 'COM_CONCENTRATION_CODE_NOMBRE'`)).rows[0].id;
    await getPool().query(`INSERT INTO parametre_historique (parametre_id, nouvelle_valeur, date_effet, motif) SELECT $1, '2', '2020-01-01', 'Test' WHERE EXISTS (SELECT 1 FROM parametre WHERE id = $1)`, [id]).catch(async () => {
      await getPool().query(`UPDATE parametre SET valeur_defaut = '2' WHERE id = $1`, [id]);
    });
    const pt = await personne(c.admin, 'PRESCR', '1980-01-01', true);
    const presc = await transaction(c.resp1.utilisateurId, q => creerIntervenant(q, c.resp1, { tiersId: pt, role: 'PRESCRIPTEUR' }));
    await transaction(c.resp1.utilisateurId, async q => enregistrerTraite(q, c.resp1, presc, await pieceFictive()));
    const a = await transaction(c.resp1.utilisateurId, q => proposerAgrement(q, c.resp1, presc));
    await valider(c.resp2, a.id);
    await valider(conformite, a.id);
    const code = await transaction(c.resp1.utilisateurId, q => attribuerCode(q, c.resp1, presc, 'MAFOUDIA'));
    const souscrire = async (nom: string) => {
      const s = await personne(c.admin, nom, '1986-03-03', true);
      const o = await transaction(c.agentU.utilisateurId, q => ouvrirDossier(q, c.agentU, { souscripteurId: s, formuleId: c.formuleId, bureauId: c.bureau, codePrescripteur: 'MAFOUDIA' }));
      await transaction(c.agentU.utilisateurId, q => enregistrerDonnees(q, c.agentU, o.id, { dateEffet: T, assures: [{ tiersId: s, qualite: 'ASSURE_PRINCIPAL' }], consentementsDeces: [], pieces: [] }, 5));
      await transaction(c.agentU.utilisateurId, q => tarifierDossier(q, c.agentU, o.id));
      const r = await transaction(c.agentU.utilisateurId, q => presenterRecapitulatif(q, c.agentU, o.id));
      await transaction(c.agentU.utilisateurId, async q => accepterRecapitulatif(q, c.agentU, o.id, r.documentId, sms.dernier(await telephone(s))!.texte.match(/code (\d{6})/)![1]!));
      await transaction(c.agentU.utilisateurId, q => emettre(q, c.agentU, o.id));
    };
    const alertes = async () => (await listerAlertes(getPool(), { statut: 'ACTIVES' })).filter(x => x.objet_id === code.id);
    await souscrire('CONCENTRE-UN');
    expect(await alertes()).toHaveLength(0);
    await souscrire('CONCENTRE-DEUX');
    expect(await alertes()).toMatchObject([{ type: 'CONCENTRATION_CODE_PRESCRIPTEUR', gravite: 'MOYENNE', statut: 'OUVERTE' }]);
    await souscrire('CONCENTRE-TROIS');
    await souscrire('CONCENTRE-QUATRE');
    const [al] = await alertes();
    expect(al).toMatchObject({ gravite: 'FORTE' });
    expect(al.description).toContain('4 polices');
    await expect(transaction(conformite.utilisateurId, q => traiterAlerte(q, conformite, al.id, { statut: 'CLOSE' }))).rejects.toMatchObject({ code: 'DECISION_REQUISE' });
    await transaction(conformite.utilisateurId, q => traiterAlerte(q, conformite, al.id, { statut: 'EN_EXAMEN' }));
    await transaction(conformite.utilisateurId, q => traiterAlerte(q, conformite, al.id, { statut: 'CLOSE', decision: 'Campagne de recommandation déclarée par le partenaire : pas d\'anomalie' }));
    expect(await alertes()).toHaveLength(0);
    // Une nouvelle concentration après la clôture ouvre une nouvelle alerte
    await souscrire('CONCENTRE-CINQ');
    expect(await alertes()).toHaveLength(1);
  });
});
