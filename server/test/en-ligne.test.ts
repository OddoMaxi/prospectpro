/**
 * Souscription en ligne et cellule Canal digital : CA-COM-14, 18 ; CA-PROD-17 ; CA-FIN-33 ;
 * PROD-RG-070 à 072, COM-RG-071, 083.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool, transaction } from '../src/db/pool.js';
import { Acteur } from '../src/noyau/acteur.js';
import { aujourdhui } from '../src/noyau/dates.js';
import { normaliserNumero } from '../src/modules/comptabilite/plan.js';
import { creerIntervenant, enregistrerTraite, proposerAgrement, validerControlesJunior } from '../src/modules/commercial/intervenants.js';
import { attribuerCode } from '../src/modules/commercial/prescripteurs.js';
import { enregistrerProspect } from '../src/modules/commercial/prospects.js';
import { accepterRecapitulatif, presenterRecapitulatif, tarifierDossier } from '../src/modules/production/dossiers.js';
import { emettre } from '../src/modules/production/emission.js';
import {
  confirmerIdentification, confirmerPaiement, corbeilleCellule, demanderPaiement, identifier, installerCanalDigital, ouvrirDossierEnLigne, rejeterDossierEnLigne,
} from '../src/modules/production/enLigne.js';
import { anomalies } from '../src/modules/finances/cloture.js';
import { emettrePolice, personne, preparer, telephone, valider, type Contexte } from './contexte-production.js';
import { fermer, ouvrir, pieceFictive, sms, utilisateur } from './outils.js';

let c: Contexte, cellule: Acteur, conformite: Acteur, prescripteur: string, junior: string, juniorU: Acteur, canal: { bureauId: string; code: string; intervenantId: string };
const client = new Acteur(null, '203.0.113.7', 'navigateur');
const code = (tel: string) => sms.dernier(tel)!.texte.match(/(\d{6})/)![1]!;
const solde = async (numero: string) => Number((await getPool().query(
  `SELECT COALESCE(sum(l.debit - l.credit), 0)::bigint AS s FROM ligne_ecriture l JOIN ecriture e ON e.id = l.ecriture_id JOIN compte c ON c.id = l.compte_id
    WHERE c.numero = $1 AND e.statut = 'VALIDEE' AND e.supprime_le IS NULL`, [normaliserNumero(numero)])).rows[0].s);
let n = 0;
const nomAleatoire = () => Array.from({ length: 9 }, () => 'ABCDEFGHJKLMNPRSTUVWXZ'[Math.floor(Math.random() * 22)]).join('');

/** Parcours du client : identification, dossier, étapes 6 et 7, puis paiement confirmé par l'opérateur. */
async function parcours(o: { telephone?: string; nom?: string; codePrescripteur?: string; payer?: boolean } = {}) {
  const tel = o.telephone ?? `+22466${String(++n).padStart(7, '0')}`;
  const id = await transaction(null, q => identifier(q, client, { nom: o.nom ?? nomAleatoire(), prenoms: nomAleatoire(), dateNaissance: `19${70 + (n % 25)}-0${1 + (n % 9)}-1${n % 10}`, telephone: tel }));
  await transaction(null, q => confirmerIdentification(q, client, id.tiersId, code(tel)));
  const d = await transaction(null, q => ouvrirDossierEnLigne(q, client, id.tiersId, { formuleId: c.formuleId, codePrescripteur: o.codePrescripteur }));
  const t = await transaction(null, q => tarifierDossier(q, client, d.id));
  await expect(demanderPaiement(getPool(), id.tiersId, d.id, { operateur: 'OM', telephone: tel })).rejects.toMatchObject({ code: 'ACCEPTATION_REQUISE' });
  const r = await transaction(null, q => presenterRecapitulatif(q, client, d.id));
  await transaction(null, q => accepterRecapitulatif(q, client, d.id, r.documentId, code(tel)));
  const p = await demanderPaiement(getPool(), id.tiersId, d.id, { operateur: 'OM', telephone: tel });
  if (o.payer !== false) await transaction(null, q => confirmerPaiement(q, client, { reference: p.reference, operateur: 'OM', montant: p.montant!, referenceExterne: `OM-${n}-${Date.now()}` }));
  return { tiersId: id.tiersId, dossierId: d.id, numero: d.numero, prime: t.primeTotale, telephone: tel, reference: p.reference };
}
const intervenants = async (policeId: string) => (await getPool().query(
  `SELECT pi.intervenant_id, pi.qualite FROM police_intervenant pi WHERE pi.police_id = $1 AND pi.date_fin IS NULL ORDER BY pi.qualite`, [policeId])).rows as { intervenant_id: string; qualite: string }[];
const commissions = async (policeId: string) => (await getPool().query(`SELECT intervenant_id, montant::bigint AS montant FROM commission WHERE police_id = $1`, [policeId])).rows as { intervenant_id: string; montant: number }[];

beforeAll(async () => {
  await ouvrir();
  c = await preparer();
  conformite = new Acteur((await getPool().query(`SELECT id FROM utilisateur WHERE identifiant = 'conformite'`)).rows[0].id);
  cellule = await utilisateur(c.admin, 'canal.digital', [{ code: 'CANAL_DIGITAL' }], c.dg);
  canal = await transaction(c.resp1.utilisateurId, q => installerCanalDigital(q, c.resp1, { code: '90', nom: 'Canal digital', adresse: 'Siège, Kaloum' }));
  // Prescripteur agréé avec son code ; junior de l'agent général
  const pt = await personne(c.admin, 'DIABATE', '1980-01-01', true);
  prescripteur = await transaction(c.resp1.utilisateurId, q => creerIntervenant(q, c.resp1, { tiersId: pt, role: 'PRESCRIPTEUR' }));
  await transaction(c.resp1.utilisateurId, async q => enregistrerTraite(q, c.resp1, prescripteur, await pieceFictive()));
  const a = await transaction(c.resp1.utilisateurId, q => proposerAgrement(q, c.resp1, prescripteur));
  await valider(c.resp2, a.id);
  await valider(conformite, a.id);
  await transaction(c.resp1.utilisateurId, q => attribuerCode(q, c.resp1, prescripteur, 'KARAMOKO'));
  const jt = await personne(c.admin, 'BARRY', '1999-01-01', true);
  junior = await transaction(c.resp1.utilisateurId, q => creerIntervenant(q, c.resp1, { tiersId: jt, role: 'JUNIOR', rattachementId: c.agent }));
  await transaction(c.agentU.utilisateurId, q => validerControlesJunior(q, c.agentU, junior));
  juniorU = new Acteur(null);
  void juniorU;
}, 120_000);
afterAll(fermer);

describe('Parcours en ligne (PROD-RG-070 à 072)', () => {
  it('nouveau client : paiement en attente (EVT-23, CA-FIN-33), émission par la cellule (EVT-03) ; la cellule est titulaire, le prescripteur rémunéré', async () => {
    const om = await solde('5631');
    const p = await parcours({ codePrescripteur: 'karamoko' });
    // CA-FIN-33 : payé, non émis à la clôture de la journée : au compte d'encaissements en attente, opérateur équilibré
    expect(await solde('471')).toBe(-p.prime);
    expect(await solde('5631')).toBe(om + p.prime);
    expect(await anomalies(getPool())).toEqual([]);
    expect((await corbeilleCellule(getPool())).find(d => d.id === p.dossierId)).toMatchObject({ statut: 'PAYE_A_EMETTRE', code_prescripteur: 'KARAMOKO', operateur: 'OM' });
    expect(sms.dernier(p.telephone)!.texte).toContain('paiement');
  });

  it('émission et rémunération : titulaire cellule (non rémunérée), prescripteur selon la clé ; numéro au code du bureau Canal digital', async () => {
    const p = await parcours({ codePrescripteur: 'KARAMOKO' });
    const e = await transaction(cellule.utilisateurId, q => emettre(q, cellule, p.dossierId));
    expect(e.numero.slice(1, 3)).toBe(canal.code);
    expect(e.solde).toBeNull();
    expect(await solde('471')).toBe(-(await getPool().query(`SELECT COALESCE(sum(montant), 0)::bigint AS s FROM encaissement_attente WHERE statut = 'EN_ATTENTE'`)).rows[0].s);
    const i = await intervenants(e.policeId);
    expect(i).toEqual(expect.arrayContaining([{ intervenant_id: prescripteur, qualite: 'PRESCRIPTEUR' }, { intervenant_id: canal.intervenantId, qualite: 'TITULAIRE' }]));
    const com = await commissions(e.policeId);
    expect(com.map(x => x.intervenant_id)).toEqual([prescripteur]);
    const police = (await getPool().query('SELECT canal, mode_emission, bureau_emetteur_id, bureau_gestion_id FROM police WHERE id = $1', [e.policeId])).rows[0];
    expect(police).toMatchObject({ canal: 'EN_LIGNE', mode_emission: 'PAIEMENT_EN_LIGNE', bureau_emetteur_id: canal.bureauId, bureau_gestion_id: canal.bureauId });
    expect((await getPool().query(`SELECT ea.statut FROM encaissement_attente ea JOIN dossier_souscription d ON d.encaissement_attente_id = ea.id WHERE d.id = $1`, [p.dossierId])).rows[0].statut).toBe('AFFECTE');
    await expect(transaction(cellule.utilisateurId, q => emettre(q, cellule, p.dossierId))).rejects.toMatchObject({ code: 'DOSSIER_NON_PAYE' });
  });

  it('paiement : intégral, une seule fois (référence de l\'opérateur), jamais avant l\'acceptation ; dossier non payé non émis', async () => {
    const p = await parcours({ payer: false });
    await expect(transaction(cellule.utilisateurId, q => emettre(q, cellule, p.dossierId))).rejects.toMatchObject({ code: 'DOSSIER_NON_PAYE' });
    await expect(transaction(null, q => confirmerPaiement(q, client, { reference: p.reference, operateur: 'OM', montant: p.prime - 1, referenceExterne: 'OM-PARTIEL' }))).rejects.toMatchObject({ code: 'MONTANT_DIFFERENT' });
    const r1 = await transaction(null, q => confirmerPaiement(q, client, { reference: p.reference, operateur: 'OM', montant: p.prime, referenceExterne: 'OM-UNIQUE' }));
    const r2 = await transaction(null, q => confirmerPaiement(q, client, { reference: p.reference, operateur: 'OM', montant: p.prime, referenceExterne: 'OM-UNIQUE' }));
    expect(r2).toEqual({ encaissementId: r1.encaissementId, dejaRecu: true });
  });

  it('CA-PROD-17 : dossier payé puis rejeté par la cellule : remboursement automatique (EVT-24), aucune police', async () => {
    const avant471 = await solde('471'), avantOm = await solde('5631');
    const p = await parcours();
    const r = await transaction(cellule.utilisateurId, q => rejeterDossierEnLigne(q, cellule, p.dossierId, 'Pièce d\'identité illisible'));
    expect(r.rembourse).toBe(p.prime);
    expect(await solde('471')).toBe(avant471);
    expect(await solde('5631')).toBe(avantOm);
    const d = (await getPool().query('SELECT statut, police_id FROM dossier_souscription WHERE id = $1', [p.dossierId])).rows[0];
    expect(d).toEqual({ statut: 'REJETE', police_id: null });
    expect(sms.dernier(p.telephone)!.texte).toContain('remboursés');
  });
});

describe('Titulaire d\'un client venu en ligne (COM-RG-071)', () => {
  it('CA-COM-14 : client actif d\'un agent qui souscrit en ligne avec un code prescripteur : titulaire inchangé', async () => {
    const p0 = await emettrePolice(c, 'CLIENT-AGENT');
    const tel = await telephone(p0.souscripteur);
    const p = await parcours({ telephone: tel, codePrescripteur: 'KARAMOKO' });
    expect(p.tiersId).toBe(p0.souscripteur);
    const e = await transaction(cellule.utilisateurId, q => emettre(q, cellule, p.dossierId));
    const i = await intervenants(e.policeId);
    expect(i).toEqual(expect.arrayContaining([{ intervenant_id: c.agent, qualite: 'TITULAIRE' }, { intervenant_id: prescripteur, qualite: 'PRESCRIPTEUR' }]));
    expect((await getPool().query('SELECT bureau_gestion_id, bureau_emetteur_id FROM police WHERE id = $1', [e.policeId])).rows[0]).toEqual({ bureau_gestion_id: c.bureau, bureau_emetteur_id: canal.bureauId });
    expect((await commissions(e.policeId)).map(x => x.intervenant_id).sort()).toEqual([c.agent, prescripteur].sort());
  });

  it('CA-COM-18 : prospect d\'un junior enregistré il y a 20 jours, souscrit en ligne avec un code : titulaire l\'agent, apporteur le junior, émission par la cellule', async () => {
    const tel = `+22466${String(++n).padStart(7, '0')}`;
    const t = await personne(c.admin, 'PROSPECT-JUNIOR', '1990-05-05');
    await getPool().query('UPDATE tiers SET telephone = $2 WHERE id = $1', [t, tel]);
    const pr = await transaction(c.agentU.utilisateurId, q => enregistrerProspect(q, c.agentU, junior, t));
    await getPool().query(`UPDATE prospect SET exclusivite_jusqu_au = current_date + 70 WHERE id = $1`, [pr.id]);
    const p = await parcours({ telephone: tel, codePrescripteur: 'KARAMOKO' });
    expect(p.tiersId).toBe(t);
    const e = await transaction(cellule.utilisateurId, q => emettre(q, cellule, p.dossierId));
    const i = await intervenants(e.policeId);
    expect(i).toEqual(expect.arrayContaining([{ intervenant_id: c.agent, qualite: 'TITULAIRE' }, { intervenant_id: junior, qualite: 'APPORTEUR' }, { intervenant_id: prescripteur, qualite: 'PRESCRIPTEUR' }]));
    expect(e.numero.slice(1, 3)).toBe(canal.code);
  });
});

describe('Identification (PROD-RG-071)', () => {
  it('fiche très proche sous un autre téléphone : inscription en ligne refusée, sans rien révéler', async () => {
    await personne(c.admin, 'HOMONYME', '1975-07-07');
    await expect(transaction(null, q => identifier(q, client, { nom: 'HOMONYME', prenoms: 'Test', dateNaissance: '1975-07-07', telephone: '+224669999999' })))
      .rejects.toMatchObject({ code: 'IDENTIFICATION_IMPOSSIBLE' });
    expect(aujourdhui()).toBeTruthy();
  });
});

describe('Session en ligne (HTTP)', () => {
  it('le client ne voit que ses dossiers ; son jeton n\'ouvre pas le back-office ; les autres routes ne sont pas affectées', async () => {
    const { default: request } = await import('supertest');
    const { creerApplication } = await import('../src/app.js');
    const { configTest } = await import('./env.js');
    const { app } = creerApplication(configTest());
    await request(app).get('/api/bureaux').expect(401); // inchangé : authentification du back-office
    await request(app).get('/api/public/en-ligne/moi').expect(401);
    const offre = await request(app).get('/api/public/en-ligne/offre').expect(200);
    expect(offre.body.canal).toBe(true);
    const tel = `+22466${String(++n).padStart(7, '0')}`;
    const id = await request(app).post('/api/public/en-ligne/identification').send({ nom: nomAleatoire(), prenoms: nomAleatoire(), dateNaissance: '1991-02-03', telephone: tel }).expect(201);
    const v = await request(app).post('/api/public/en-ligne/verification').send({ tiersId: id.body.tiersId, code: code(tel) }).expect(200);
    const jeton = v.body.jeton as string;
    await request(app).get('/api/bureaux').set('Authorization', `Bearer ${jeton}`).expect(401);
    const d = await request(app).post('/api/public/en-ligne/dossiers').set('Authorization', `Bearer ${jeton}`).send({ formuleId: c.formuleId }).expect(201);
    const lu = await request(app).get(`/api/public/en-ligne/dossiers/${d.body.id}`).set('Authorization', `Bearer ${jeton}`).expect(200);
    expect(lu.body).toMatchObject({ statut: 'BROUILLON', anomalies: [] });
    // Le dossier d'un autre client reste introuvable
    const autre = await parcours({ payer: false });
    await request(app).get(`/api/public/en-ligne/dossiers/${autre.dossierId}`).set('Authorization', `Bearer ${jeton}`).expect(404);
    // Paiement simulé hors production
    await request(app).post(`/api/public/en-ligne/dossiers/${d.body.id}/tarif`).set('Authorization', `Bearer ${jeton}`).expect(200);
    const r = await request(app).post(`/api/public/en-ligne/dossiers/${d.body.id}/recapitulatif`).set('Authorization', `Bearer ${jeton}`).expect(201);
    await request(app).post(`/api/public/en-ligne/dossiers/${d.body.id}/acceptation`).set('Authorization', `Bearer ${jeton}`).send({ documentId: r.body.documentId, code: code(tel) }).expect(200);
    await request(app).post(`/api/public/en-ligne/dossiers/${d.body.id}/paiement/simulation`).set('Authorization', `Bearer ${jeton}`).send({ operateur: 'OM', telephone: tel }).expect(200);
    const moi = await request(app).get('/api/public/en-ligne/moi').set('Authorization', `Bearer ${jeton}`).expect(200);
    expect(moi.body.dossiers[0]).toMatchObject({ statut: 'PAYE_A_EMETTRE' });
    // Confirmation de l'opérateur : non configurée en test
    await request(app).post('/api/public/paiements/operateur').send({}).expect(503);
  });
});
