/** Sous-lot 2.9 – Réseau commercial : CA-COM-08, 13, 15, 16, 19 ; COM-RG-070 à 075, 080 à 084, 100 à 104. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool, transaction } from '../src/db/pool.js';
import { Acteur } from '../src/noyau/acteur.js';
import { aujourdhui } from '../src/noyau/dates.js';
import { attribuerCode, controlerCode, formeCanonique, statistiquesPrescripteur, tropProches } from '../src/modules/commercial/prescripteurs.js';
import { enregistrerProspect, relationExistante } from '../src/modules/commercial/prospects.js';
import { confirmerRemise, demanderRemise, listerCartes, produireCarte, validerCarte, verifierCarte } from '../src/modules/commercial/cartes.js';
import { proposerMouvement } from '../src/modules/commercial/portefeuille.js';
import { changerStatutIntervenant, creerIntervenant, enregistrerTraite, proposerAgrement, validerControlesJunior } from '../src/modules/commercial/intervenants.js';
import { creerUtilisateur } from '../src/modules/habilitations/service.js';
import { accepterRecapitulatif, enregistrerDonnees, ouvrirDossier, presenterRecapitulatif, tarifierDossier } from '../src/modules/production/dossiers.js';
import { emettre } from '../src/modules/production/emission.js';
import { emettrePolice, personne, preparer, telephone, valider, type Contexte } from './contexte-production.js';
import { fermer, MDP, ouvrir, pieceFictive, sms, utilisateur } from './outils.js';

let c: Contexte, conformite: Acteur, prescripteur: string, junior: string, juniorU: Acteur;
const agree = async (role: 'AGENT_GENERAL' | 'PRESCRIPTEUR', nom: string) => {
  const t = await personne(c.admin, nom, '1980-01-01', true);
  const id = await transaction(c.resp1.utilisateurId, q => creerIntervenant(q, c.resp1, { tiersId: t, role }));
  await transaction(c.resp1.utilisateurId, async q => enregistrerTraite(q, c.resp1, id, await pieceFictive()));
  const a = await transaction(c.resp1.utilisateurId, q => proposerAgrement(q, c.resp1, id));
  await valider(c.resp2, a.id);
  await valider(conformite, a.id);
  return id;
};
/** Souscription au bureau, avec un code prescripteur éventuel, par l'agent ou son junior. */
async function souscrire(qui: Acteur, nom: string, codePrescripteur?: string, souscripteur?: string) {
  const s = souscripteur ?? await personne(c.admin, nom, '1986-03-03', true);
  const o = await transaction(qui.utilisateurId, q => ouvrirDossier(q, qui, { souscripteurId: s, formuleId: c.formuleId, bureauId: c.bureau, codePrescripteur }));
  await transaction(qui.utilisateurId, q => enregistrerDonnees(q, qui, o.id, { dateEffet: aujourdhui(), assures: [{ tiersId: s, qualite: 'ASSURE_PRINCIPAL' }], consentementsDeces: [], pieces: [] }, 5));
  await transaction(qui.utilisateurId, q => tarifierDossier(q, qui, o.id));
  const r = await transaction(qui.utilisateurId, q => presenterRecapitulatif(q, qui, o.id));
  await transaction(qui.utilisateurId, async q => accepterRecapitulatif(q, qui, o.id, r.documentId, sms.dernier(await telephone(s))!.texte.match(/code (\d{6})/)![1]!));
  return { dossierId: o.id, souscripteur: s };
}

beforeAll(async () => {
  await ouvrir();
  c = await preparer();
  conformite = new Acteur((await getPool().query(`SELECT id FROM utilisateur WHERE identifiant = 'conformite'`)).rows[0].id);
  prescripteur = await agree('PRESCRIPTEUR', 'DIABATE');
  const jt = await personne(c.admin, 'BARRY', '1999-01-01', true);
  junior = await transaction(c.resp1.utilisateurId, q => creerIntervenant(q, c.resp1, { tiersId: jt, role: 'JUNIOR', rattachementId: c.agent }));
  await transaction(c.agentU.utilisateurId, q => validerControlesJunior(q, c.agentU, junior));
  const u = await transaction(c.admin.utilisateurId, async q => creerUtilisateur(q, c.admin, { identifiant: 'junior.barry', tiersId: jt, typeCompte: 'JUNIOR', motDePasse: MDP, telephone: await telephone(jt) }));
  await getPool().query(`UPDATE utilisateur SET statut = 'ACTIF' WHERE id = $1`, [u]);
  juniorU = new Acteur(u);
}, 120_000);
afterAll(fermer);

describe('Codes prescripteurs (COM-RG-080 à 084)', () => {
  it('normalisation, homoglyphes et proximité', () => {
    expect(formeCanonique('Karamoko ')).toBe(formeCanonique('KARAM0K0'));
    expect(tropProches('KARAMOKO', 'KARAMOKA')).toBe(true); // une lettre
    expect(tropProches('KARAMOKO', 'KARAMOOK')).toBe(true); // deux voisines inversées
    expect(tropProches('KARAMOKO', 'KARAMOKOS')).toBe(true); // une lettre ajoutée
    expect(tropProches('KARAMOKO', 'DIABATE')).toBe(false);
  });

  it('CA-COM-13 et 19 : « KARAMOKA » et « KARAM0KO » refusés quand « KARAMOKO » existe', async () => {
    const r = await transaction(c.resp1.utilisateurId, q => attribuerCode(q, c.resp1, prescripteur, 'Karamoko'));
    expect(r.code).toBe('KARAMOKO');
    await expect(controlerCode(getPool(), 'KARAMOKA')).rejects.toMatchObject({ code: 'CODE_TROP_PROCHE' });
    await expect(controlerCode(getPool(), 'KARAM0KO')).rejects.toMatchObject({ code: 'CODE_TROP_PROCHE' });
    await expect(controlerCode(getPool(), 'CGSPROMO')).rejects.toMatchObject({ code: 'CODE_INTERDIT' });
    await expect(controlerCode(getPool(), 'ABC')).rejects.toMatchObject({ code: 'CODE_LONGUEUR' });
    expect(await controlerCode(getPool(), 'Fatou Star')).toBe('FATOUSTAR');
  });

  it('COM-RG-083 : le code saisi rattache le prescripteur, rémunéré selon la clé ; il ne voit que des statistiques anonymes', async () => {
    const { dossierId } = await souscrire(c.agentU, 'CLIENT-PRESCRIT', 'karamoko');
    const e = await transaction(c.agentU.utilisateurId, q => emettre(q, c.agentU, dossierId));
    expect(e.commissions.find(x => x.qualite === 'PRESCRIPTEUR')!.montant).toBe(Math.round(579_000 * 0.2));
    const s = await statistiquesPrescripteur(getPool(), prescripteur);
    expect(s.mois[0]!.polices).toBe(1);
    expect(JSON.stringify(s)).not.toContain('CLIENT-PRESCRIT');
    await expect(souscrire(c.agentU, 'CLIENT-X', 'INCONNU99')).rejects.toMatchObject({ code: 'CODE_INCONNU' });
  });
});

describe('Prospects (COM-RG-070, 071)', () => {
  it('exclusivité de 90 jours ; un autre réseau ne peut ni l\'enregistrer ni lui ouvrir un dossier ; le junior devient apporteur', async () => {
    const t = await personne(c.admin, 'PROSPECT-JUNIOR', '1990-01-01', true);
    const p = await transaction(juniorU.utilisateurId, q => enregistrerProspect(q, juniorU, junior, t));
    expect(p.exclusiviteJusquAu > aujourdhui()).toBe(true);
    expect((await relationExistante(getPool(), t))!.type).toBe('PROSPECT');
    const autre = await agree('AGENT_GENERAL', 'CAMARA');
    await expect(transaction(c.resp1.utilisateurId, q => enregistrerProspect(q, c.resp1, autre, t))).rejects.toMatchObject({ code: 'RELATION_EXISTANTE' });
    // L'agent général du junior émet : apporteur = le junior qui a enregistré le prospect
    const { dossierId } = await souscrire(c.agentU, '', undefined, t);
    const e = await transaction(c.agentU.utilisateurId, q => emettre(q, c.agentU, dossierId));
    expect(e.commissions.map(x => x.qualite).sort()).toEqual(['APPORTEUR', 'TITULAIRE']);
    expect((await getPool().query(`SELECT statut FROM prospect WHERE id = $1`, [p.id])).rows[0].statut).toBe('CONVERTI');
    // Client actif : il garde son titulaire
    expect((await relationExistante(getPool(), t))!.type).toBe('TITULAIRE');
  });
});

describe('Cartes professionnelles (COM-RG-100 à 104)', () => {
  it('demandée à l\'activation, validée, produite, remise par code ; vérification publique ; CA-COM-16 : bloquée puis retirée', async () => {
    const carte = (await listerCartes(getPool(), { intervenantId: junior }))[0]!;
    expect(carte.statut).toBe('DEMANDEE');
    expect(carte.modele).toBe('APPORTEUR');
    await transaction(c.resp1.utilisateurId, q => validerCarte(q, c.resp1, carte.id));
    await transaction(c.resp1.utilisateurId, q => produireCarte(q, c.resp1, carte.id, 'https://exemple/verification/carte'));
    await transaction(c.resp1.utilisateurId, q => demanderRemise(q, c.resp1, carte.id));
    const tel = (await getPool().query('SELECT t.telephone FROM intervenant i JOIN tiers t ON t.id = i.tiers_id WHERE i.id = $1', [junior])).rows[0].telephone;
    await transaction(c.resp1.utilisateurId, q => confirmerRemise(q, c.resp1, carte.id, sms.dernier(tel)!.texte.match(/code (\d{6})/)![1]!));
    let v = await verifierCarte(getPool(), carte.jeton_qr);
    expect(v).toMatchObject({ trouvee: true, valide: true, etat: 'VALIDE', qualite: 'Junior' });
    await transaction(c.resp1.utilisateurId, q => changerStatutIntervenant(q, c.resp1, junior, 'SUSPENDU', 'Contrôle'));
    expect((await verifierCarte(getPool(), carte.jeton_qr))).toMatchObject({ valide: false, etat: 'SUSPENDUE' });
    await transaction(c.resp1.utilisateurId, q => changerStatutIntervenant(q, c.resp1, junior, 'ACTIF', 'Levée'));
    expect((await verifierCarte(getPool(), carte.jeton_qr)).valide).toBe(true);
    v = await verifierCarte(getPool(), 'inexistant-jeton-0000');
    expect(v.trouvee).toBe(false);
  });
});

describe('Mouvements de portefeuille (COM-RG-072 à 075)', () => {
  it('CA-COM-15 : un junior ne cède pas son portefeuille à un junior d\'un autre réseau', async () => {
    const autreAgent = (await getPool().query(`SELECT id FROM intervenant WHERE role = 'AGENT_GENERAL' AND id <> $1 AND statut = 'ACTIF' LIMIT 1`, [c.agent])).rows[0].id;
    const t = await personne(c.admin, 'JUNIOR-AILLEURS', '1998-01-01');
    const autreJunior = await transaction(c.resp1.utilisateurId, q => creerIntervenant(q, c.resp1, { tiersId: t, role: 'JUNIOR', rattachementId: autreAgent }));
    await expect(transaction(c.agentU.utilisateurId, q => proposerMouvement(q, c.agentU, { intervenantId: c.agent }, {
      type: 'CESSION', cedantId: junior, cessionnaireId: autreJunior, dateEffet: aujourdhui(), motif: 'Cession',
    }))).rejects.toMatchObject({ code: 'HORS_RESEAU' });
  });

  it('transfert des clients d\'un junior : seulement dans les quatre cas', async () => {
    await expect(transaction(c.agentU.utilisateurId, q => proposerMouvement(q, c.agentU, { intervenantId: c.agent }, {
      type: 'TRANSFERT', cedantId: junior, cessionnaireId: c.agent, dateEffet: aujourdhui(), motif: 'Réorganisation',
    }))).rejects.toMatchObject({ code: 'CAS_REQUIS' });
    await expect(transaction(c.agentU.utilisateurId, q => proposerMouvement(q, c.agentU, { intervenantId: c.agent }, {
      type: 'TRANSFERT', cedantId: junior, cessionnaireId: c.agent, dateEffet: aujourdhui(), motif: 'Départ', casTransfert: 'DEPART',
    }))).rejects.toMatchObject({ code: 'CAS_INVALIDE' });
    const m = await transaction(c.agentU.utilisateurId, async q => proposerMouvement(q, c.agentU, { intervenantId: c.agent }, {
      type: 'TRANSFERT', cedantId: junior, cessionnaireId: c.agent, dateEffet: aujourdhui(), motif: 'Accord du junior', casTransfert: 'ACCORD_ECRIT', accordDocumentId: await pieceFictive(),
    }));
    await valider(c.resp1, m.demandeValidation);
    const r = (await getPool().query(`SELECT count(*) FILTER (WHERE qualite = 'APPORTEUR' AND date_fin IS NULL)::int AS apporteurs,
      max(cle_repartition) FILTER (WHERE qualite = 'TITULAIRE' AND date_fin IS NULL) AS cle FROM police_intervenant WHERE police_id IN (SELECT id FROM police)`)).rows[0];
    expect(r.apporteurs).toBe(0);
    expect(Number(r.cle)).toBe(1);
  });

  it('CA-COM-08 : départ d\'un agent général : portefeuille réaffecté (numéros inchangés, client informé), cartes retirées', async () => {
    const autre = await agree('AGENT_GENERAL', 'SOUMAH');
    const polices = (await getPool().query(`SELECT p.id, p.numero FROM police p JOIN police_intervenant pi ON pi.police_id = p.id AND pi.qualite = 'TITULAIRE' AND pi.date_fin IS NULL WHERE pi.intervenant_id = $1`, [c.agent])).rows;
    await transaction(c.resp1.utilisateurId, q => changerStatutIntervenant(q, c.resp1, c.agent, 'SORTI', 'Fin de traité'));
    expect((await listerCartes(getPool(), { intervenantId: c.agent })).every(x => x.statut === 'RETIREE')).toBe(true);
    const m = await transaction(c.resp1.utilisateurId, q => proposerMouvement(q, c.resp1, { directionCommerciale: true }, {
      type: 'REAFFECTATION', cedantId: c.agent, cessionnaireId: autre, dateEffet: aujourdhui(), motif: 'Départ sans repreneur désigné', prix: 0,
    }));
    expect(m.polices).toBe(polices.length);
    await valider(c.resp2, m.demandeValidation);
    const apres = (await getPool().query(`SELECT p.numero, pi.intervenant_id FROM police p JOIN police_intervenant pi ON pi.police_id = p.id AND pi.qualite = 'TITULAIRE' AND pi.date_fin IS NULL WHERE p.id = ANY($1)`, [polices.map(p => p.id)])).rows;
    expect(apres.every(x => x.intervenant_id === autre)).toBe(true);
    expect(apres.map(x => x.numero).sort()).toEqual(polices.map(p => p.numero).sort());
    const n = (await getPool().query(`SELECT count(*)::int AS n FROM notification n JOIN modele_notification m ON m.id = n.modele_notification_id WHERE m.code = 'CHANGEMENT_INTERLOCUTEUR'`)).rows[0].n;
    expect(n).toBeGreaterThan(0);
  });
});

describe('Comptes du réseau', () => {
  it('un prescripteur ne prépare aucune souscription', async () => {
    const t = (await getPool().query('SELECT tiers_id FROM intervenant WHERE id = $1', [prescripteur])).rows[0].tiers_id;
    const u = await transaction(c.admin.utilisateurId, async q => creerUtilisateur(q, c.admin, { identifiant: 'prescripteur.diabate', tiersId: t, typeCompte: 'PRESCRIPTEUR', motDePasse: MDP, telephone: await telephone(t) }));
    await expect(souscrire(new Acteur(u), 'CLIENT-P')).rejects.toMatchObject({ code: 'INTERDIT' });
    await expect(emettrePolice).toBeDefined();
    void utilisateur;
  });
});
