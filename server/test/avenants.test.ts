/** Sous-lot 2.4 – Avenants : CA-PROD-07, 12 ; PROD-RG-012, 013, 040. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool, transaction } from '../src/db/pool.js';
import { ajouterJours, aujourdhui } from '../src/noyau/dates.js';
import { compteProductionDuBureau } from '../src/modules/commercial/comptesProduction.js';
import { ajouterAyantDroit, confirmerChangementBeneficiaires, enregistrerAcceptationBeneficiaire, preparerChangementBeneficiaires, prorata } from '../src/modules/production/avenants.js';
import { lirePolice } from '../src/modules/production/emission.js';
import { Refus } from '../src/modules/auth/service.js';
import { emettrePolice, personne, preparer, telephone, type Contexte } from './contexte-production.js';
import { fermer, ouvrir, sms } from './outils.js';

let c: Contexte;
const T = aujourdhui();
beforeAll(async () => { await ouvrir(); c = await preparer(); }, 60_000);
afterAll(fermer);

describe('Ajout d\'un ayant droit (PROD-RG-040)', () => {
  it('le prorata compte les jours réels sur la durée réelle de la période', () => {
    expect(prorata(3_650_000, '2027-03-16', '2027-01-01', '2027-12-31')).toBe(2_910_000); // 291 jours sur 365 (exemple de CA-PROD-09)
    expect(prorata(366_000, '2028-12-31', '2028-01-01', '2028-12-31')).toBe(1_000); // année bissextile
  });

  it('CA-PROD-07 : enfant ajouté à mi-période : prime au prorata au jour près, payée avant l\'entrée, carence à partir de l\'entrée', async () => {
    const p = await emettrePolice(c, 'FAMILLE');
    const solde = (await compteProductionDuBureau(getPool(), c.bureau)).solde;
    const enfant = await personne(c.admin, 'FAMILLE-ENF', '2020-05-05');
    const jour = ajouterJours(T, 100);
    const r = await transaction(c.agentU.utilisateurId, q => ajouterAyantDroit(q, c.agentU, p.policeId, { tiersId: enfant, qualite: 'ENFANT', paiement: { type: 'COMPTE_PRODUCTION' } }, jour));
    const periode = (await getPool().query('SELECT date_debut::text, date_fin::text FROM police_periode WHERE police_id = $1', [p.policeId])).rows[0];
    expect(r.primeNette).toBe(prorata(100_000, jour, periode.date_debut, periode.date_fin));
    expect(r.primeTotale).toBe(r.primeNette + Math.round(r.primeNette * 0.05));
    expect(r.numero).toBe(`${p.numero}A01`);
    expect((await compteProductionDuBureau(getPool(), c.bureau)).solde).toBe(solde - r.primeTotale);
    const police = await lirePolice(getPool(), p.policeId);
    const ajoute = police.assures.find((a: { tiers_id: string }) => a.tiers_id === enfant);
    expect(String(ajoute.date_entree).slice(0, 10)).toBe(jour);
    expect(police.quittances.find((x: { type: string }) => x.type === 'AVENANT')).toMatchObject({ statut: 'SOLDEE' });
  });
});

describe('Bénéficiaires du capital décès (PROD-RG-012, 013)', () => {
  it('nouvelle version confirmée par code du souscripteur ; CA-PROD-12 : la quotité d\'un acceptant ne bouge pas sans son accord', async () => {
    const p = await emettrePolice(c, 'BENEF');
    const [a, b] = [await personne(c.admin, 'BENEF-A', '1990-01-01'), await personne(c.admin, 'BENEF-B', '1992-01-01')];
    const prep = await transaction(c.agentU.utilisateurId, q => preparerChangementBeneficiaires(q, c.agentU, p.policeId, [{ tiersId: a, quotite: 50, rang: 1 }, { tiersId: b, quotite: 50, rang: 1 }]));
    expect(await transaction(c.agentU.utilisateurId, q => confirmerChangementBeneficiaires(q, c.agentU, prep.avenantId, '000000'))).toBeInstanceOf(Refus);
    const code = sms.dernier(await telephone(p.souscripteur))!.texte.match(/code (\d{6})/)![1]!;
    expect(await transaction(c.agentU.utilisateurId, q => confirmerChangementBeneficiaires(q, c.agentU, prep.avenantId, code))).toEqual({ version: 1 });
    // Acceptation par A (accords écrits du bénéficiaire et du souscripteur)
    const preuve = (await getPool().query('SELECT preuve_id FROM avenant WHERE id = $1', [prep.avenantId])).rows[0].preuve_id;
    await transaction(c.agentU.utilisateurId, q => enregistrerAcceptationBeneficiaire(q, c.agentU, { policeId: p.policeId, tiersId: a, preuveBeneficiaireId: preuve, preuveSouscripteurId: preuve }));
    await expect(transaction(c.agentU.utilisateurId, q => preparerChangementBeneficiaires(q, c.agentU, p.policeId, [{ tiersId: a, quotite: 30, rang: 1 }, { tiersId: b, quotite: 70, rang: 1 }])))
      .rejects.toMatchObject({ code: 'ACCORD_BENEFICIAIRE_REQUIS' });
    await expect(transaction(c.agentU.utilisateurId, q => preparerChangementBeneficiaires(q, c.agentU, p.policeId, [{ tiersId: a, quotite: 50, rang: 1 }, { tiersId: b, quotite: 40, rang: 1 }])))
      .rejects.toMatchObject({ code: 'QUOTITES_INCOMPLETES' });
  });
});
