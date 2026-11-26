/**
 * Jeu d'essai du lot 2 sur la base de DÉVELOPPEMENT : npm run jeu-essai -- --confirmer
 *
 * Recrée la base de développement (DATABASE_URL), l'installe avec les paramètres à jour, puis crée un jeu de données
 * pour essayer les écrans : utilisateurs de chaque département, catalogue, agent général agréé, bureau et compte de
 * production approvisionné, polices émises, approvisionnement à confirmer, facture de commissions, fiche d'imputation.
 * Refuse de s'exécuter en production ou sur une base dont le nom ne contient pas « dev ».
 */
import 'dotenv/config';
import { resolve } from 'node:path';

const url = process.env.DATABASE_URL ?? '';
if (process.env.NODE_ENV === 'production' || !/dev/.test(url.split('/').pop() ?? '')) throw new Error(`Refusé : base « ${url.split('/').pop()} » (seule une base de développement est autorisée)`);
if (!process.argv.includes('--confirmer')) throw new Error('La base de développement sera VIDÉE : relancer avec --confirmer');
process.env.BASE_JEU_ESSAI = url;
process.env.STOCKAGE_JEU_ESSAI = resolve(process.env.STOCKAGE_DIR ?? './stockage');

// Base recréée de zéro : aucun écart possible avec les migrations du dépôt
const pg = (await import('pg')).default;
const nom = url.split('/').pop()!;
const admin = new pg.Client({ connectionString: url.replace(/\/[^/]*$/, '/postgres') });
await admin.connect();
await admin.query(`DROP DATABASE IF EXISTS "${nom}" WITH (FORCE)`);
await admin.query(`CREATE DATABASE "${nom}"`);
await admin.end();
const { migrer } = await import('../src/db/migrer.js');
await migrer(url, 'up');
const { getPool, transaction } = await import('../src/db/pool.js');
const { aujourdhui, ajouterJours } = await import('../src/noyau/dates.js');
const { ouvrir, fermer, utilisateur, pieceFictive, MDP } = await import('../test/outils.js');
const { preparer, emettrePolice, fixerEcheance, valider } = await import('../test/contexte-production.js');
const { compteProductionDuBureau, declarerApprovisionnement } = await import('../src/modules/commercial/comptesProduction.js');
const { creerBanqueOperateur } = await import('../src/modules/finances/tresorerie.js');
const { creerCodeTaxe } = await import('../src/modules/comptabilite/plan.js');
const { etablirFactures, demanderEmission, confirmerEmission } = await import('../src/modules/commercial/factures.js');
const { creerFicheImputation } = await import('../src/modules/finances/saisie.js');
const { sms } = await import('../test/outils.js');
const { Acteur } = await import('../src/noyau/acteur.js');

await ouvrir();
console.log('Base vidée et réinstallée…');
const c = await preparer();
// Profil privilégié de l'agent général : attribution validée par la Direction générale
for (const { id } of (await getPool().query(`SELECT id FROM demande_validation WHERE type_operation = 'ATTRIBUTION_PROFIL_PRIVILEGIE' AND statut = 'EN_ATTENTE'`)).rows) await valider(c.dg, id);
const comptable = await utilisateur(c.admin, 'comptable', [{ code: 'COMPTABLE' }], c.dg);
const chef = await utilisateur(c.admin, 'chef.comptable', [{ code: 'COMPTABLE' }], c.dg);
await transaction(c.admin.utilisateurId, q => creerBanqueOperateur(q, c.admin, { code: 'BICI', nom: 'BICIGUI', type: 'BANQUE', compteNumero: '5621', responsableId: c.tresorier.utilisateurId! }));
await transaction(c.admin.utilisateurId, q => creerCodeTaxe(q, c.admin, { code: 'RAS', libelle: 'Retenue à la source sur commissions', type: 'RETENUE_SOURCE', taux: 0.10, assiette: 'COMMISSION', compteNumero: '4371', exigibilite: 'ENCAISSEMENT', dateEffet: '2020-01-01' }));

console.log('Polices…');
const polices = [];
for (const nom of ['CAMARA', 'KEITA', 'DIALLO', 'CISSE']) polices.push(await emettrePolice(c, nom));
const echue = await emettrePolice(c, 'BAH');
await fixerEcheance(echue.policeId, ajouterJours(aujourdhui(), 12)); // à renouveler sous 30 jours

console.log('Vie du contrat : correction à valider, police souscrite en ligne (renonciation possible)…');
const { proposerCorrection } = await import('../src/modules/production/vieContrat.js');
const camara = (await getPool().query(`SELECT id FROM police_assure WHERE police_id = $1 AND qualite = 'ASSURE_PRINCIPAL'`, [polices[0]!.policeId])).rows[0].id;
await transaction(c.agentU.utilisateurId, q => proposerCorrection(q, c.agentU, polices[0]!.policeId, { policeAssureId: camara, dateNaissance: '1983-02-02', dateEffet: ajouterJours(aujourdhui(), 1), motif: 'Acte de naissance produit par le client' }));
const enLigne = await emettrePolice(c, 'TOURE');
await getPool().query(`UPDATE police SET canal = 'EN_LIGNE' WHERE id = $1`, [enLigne.policeId]);

console.log('Approvisionnement bancaire déclaré, à confirmer par la Trésorerie…');
const cp = await compteProductionDuBureau(getPool(), c.bureau);
await transaction(c.agentU.utilisateurId, q => declarerApprovisionnement(q, c.agentU, { compteId: cp.id, moyen: 'BANQUE', banque: 'BICI', montant: 15_000_000, referenceExterne: 'VIR-88231' }));

console.log('Facture de commissions du mois, émise par l\'agent…');
const agentTiers = (await getPool().query('SELECT tiers_id FROM intervenant WHERE id = $1', [c.agent])).rows[0].tiers_id;
await getPool().query('UPDATE tiers SET telephone_verifie = true WHERE id = $1', [agentTiers]);
const [f] = await transaction(null, q => etablirFactures(q, Acteur.systeme(), aujourdhui().slice(0, 7)));
if (f) {
  const factureId = (await getPool().query('SELECT id FROM facture_commission WHERE numero = $1', [f.numero])).rows[0].id as string;
  await transaction(c.agentU.utilisateurId, q => demanderEmission(q, c.agentU, factureId));
  const tel = (await getPool().query('SELECT telephone FROM tiers WHERE id = $1', [agentTiers])).rows[0].telephone;
  const code = sms.dernier(tel)!.texte.match(/code (\d{6})/)![1]!;
  await transaction(c.agentU.utilisateurId, q => confirmerEmission(q, c.agentU, factureId, code));
}

console.log('Junior rattaché à l\'agent, avec un dossier soumis…');
const { creerIntervenant, validerControlesJunior } = await import('../src/modules/commercial/intervenants.js');
const { creerUtilisateur } = await import('../src/modules/habilitations/service.js');
const { personne, telephone } = await import('../test/contexte-production.js');
const { ouvrirDossier, enregistrerDonnees, tarifierDossier, presenterRecapitulatif, accepterRecapitulatif, soumettreDossier } = await import('../src/modules/production/dossiers.js');
const jt = await personne(c.admin, 'BARRY', '1999-03-03');
const junior = await transaction(c.resp1.utilisateurId, q => creerIntervenant(q, c.resp1, { tiersId: jt, role: 'JUNIOR', rattachementId: c.agent }));
await transaction(c.agentU.utilisateurId, q => validerControlesJunior(q, c.agentU, junior));
const uj = await transaction(c.admin.utilisateurId, async q => creerUtilisateur(q, c.admin, { identifiant: 'junior.barry', tiersId: jt, typeCompte: 'JUNIOR', motDePasse: MDP, telephone: await telephone(jt) }));
const juniorU = new Acteur(uj);
const sj = await personne(c.admin, 'SYLLA', '1990-07-07', true);
const dj = await transaction(uj, q => ouvrirDossier(q, juniorU, { souscripteurId: sj, formuleId: c.formuleId, bureauId: c.bureau }));
await transaction(uj, q => enregistrerDonnees(q, juniorU, dj.id, { dateEffet: aujourdhui(), assures: [{ tiersId: sj, qualite: 'ASSURE_PRINCIPAL' }], consentementsDeces: [], pieces: [] }, 5));
await transaction(uj, q => tarifierDossier(q, juniorU, dj.id));
const rj = await transaction(uj, q => presenterRecapitulatif(q, juniorU, dj.id));
await transaction(uj, async q => accepterRecapitulatif(q, juniorU, dj.id, rj.documentId, sms.dernier(await telephone(sj))!.texte.match(/code (\d{6})/)![1]!));
await transaction(uj, q => soumettreDossier(q, juniorU, dj.id));

console.log('Prescripteur avec son code, prospect, carte de l\'agent…');
const { enregistrerTraite, proposerAgrement } = await import('../src/modules/commercial/intervenants.js');
const { attribuerCode } = await import('../src/modules/commercial/prescripteurs.js');
const { enregistrerProspect } = await import('../src/modules/commercial/prospects.js');
const { listerCartes, validerCarte, produireCarte, demanderRemise, confirmerRemise } = await import('../src/modules/commercial/cartes.js');
const conformite = new Acteur((await getPool().query(`SELECT id FROM utilisateur WHERE identifiant = 'conformite'`)).rows[0].id);
const tp = await personne(c.admin, 'DIABATE', '1992-04-04', true);
const prescripteur = await transaction(c.resp1.utilisateurId, q => creerIntervenant(q, c.resp1, { tiersId: tp, role: 'PRESCRIPTEUR' }));
await transaction(c.resp1.utilisateurId, async q => enregistrerTraite(q, c.resp1, prescripteur, await pieceFictive()));
const ap = await transaction(c.resp1.utilisateurId, q => proposerAgrement(q, c.resp1, prescripteur));
await valider(c.resp2, ap.id); await valider(conformite, ap.id);
await transaction(c.resp1.utilisateurId, q => attribuerCode(q, c.resp1, prescripteur, 'Karamoko'));
await transaction(c.admin.utilisateurId, async q => creerUtilisateur(q, c.admin, { identifiant: 'prescripteur.diabate', tiersId: tp, typeCompte: 'PRESCRIPTEUR', motDePasse: MDP, telephone: await telephone(tp) }));
const pr = await personne(c.admin, 'KOUYATE', '1991-09-09', true);
await transaction(c.agentU.utilisateurId, q => enregistrerProspect(q, c.agentU, c.agent, pr));
const carte = (await listerCartes(getPool(), { intervenantId: c.agent }))[0];
if (carte) {
  await transaction(c.resp1.utilisateurId, q => validerCarte(q, c.resp1, carte.id));
  await transaction(c.resp1.utilisateurId, q => produireCarte(q, c.resp1, carte.id, 'http://localhost:5173/verification/carte'));
  await transaction(c.resp1.utilisateurId, q => demanderRemise(q, c.resp1, carte.id));
  await transaction(c.resp1.utilisateurId, async q => confirmerRemise(q, c.resp1, carte.id, sms.dernier(await telephone(agentTiers))!.texte.match(/code (\d{6})/)![1]!));
}

console.log('Fiche d\'imputation au brouillard…');
await transaction(comptable.utilisateurId, async q => creerFicheImputation(q, comptable, {
  journal: 'OD', reference: 'REG-2026-01', libelle: 'Frais d\'expertise payés en caisse', pieceDocumentId: await pieceFictive('piece_comptable'),
  lignes: [{ compte: '6026', libelle: 'Frais d\'expertise', debit: 250_000, credit: 0 }, { compte: '571', libelle: 'Caisse du siège', debit: 0, credit: 250_000 }],
}));

console.log('Achats : serveurs immobilisés et mis en service, facture de fournitures à valider…');
const { saisirFactureAchat } = await import('../src/modules/finances/achats.js');
const { completerBien } = await import('../src/modules/finances/immobilisations.js');
await transaction(c.admin.utilisateurId, q => creerCodeTaxe(q, c.admin, { code: 'TVA', libelle: 'Taxe sur les achats (non récupérable)', type: 'DEDUCTIBLE', taux: 0.18, assiette: 'HT', compteNumero: '4351', exigibilite: 'EMISSION', dateEffet: '2020-01-01' }));
const fournisseur = await personne(c.admin, 'INFOTECH GUINEE', '1980-01-01');
const annee = aujourdhui().slice(0, 4);
const serveurs = await transaction(comptable.utilisateurId, async q => saisirFactureAchat(q, comptable, { fournisseurTiersId: fournisseur, numeroFacture: 'IT-2026-118', dateFacture: `${annee}-09-20`,
  pieceDocumentId: await pieceFictive('piece_comptable'), modeleReglement: '30JFM', lignes: [{ modele: 'INFORMATIQUE', libelle: 'Serveurs', montantHT: 9_000_000, codeTaxe: 'TVA' }] }));
await valider(chef, serveurs.demandeValidation);
await valider(c.daf, serveurs.demandeValidation);
const srv = (await getPool().query('SELECT id FROM immobilisation WHERE fiche_imputation_id = $1', [serveurs.ficheId])).rows[0].id;
await transaction(comptable.utilisateurId, q => completerBien(q, comptable, srv, { dateMiseEnService: `${annee}-10-01`, localisation: { lieu: 'Salle serveurs, siège' } }));
await transaction(comptable.utilisateurId, async q => saisirFactureAchat(q, comptable, { fournisseurTiersId: fournisseur, numeroFacture: 'IT-2026-131', dateFacture: aujourdhui(),
  pieceDocumentId: await pieceFictive('piece_comptable'), modeleReglement: '30J', lignes: [{ modele: 'FOURNITURES', libelle: 'Papier et toner', montantHT: 1_500_000, codeTaxe: 'TVA' }] }));

console.log('Relevé BICIGUI importé : deux opérations rapprochées, des frais à comptabiliser…');
const { importerReleve, lireReleve } = await import('../src/modules/finances/rapprochement.js');
const { creerFicheImputation: fiche } = await import('../src/modules/finances/saisie.js');
const jour = (n: number) => ajouterJours(aujourdhui(), -n);
for (const [montant, reference, n] of [[25_000_000, 'VIR-DOT-2026', 5], [-1_770_000, 'CHQ-0007', 3], [-400_000, 'LOYER-NOV', 2]] as const) {
  const f = await transaction(comptable.utilisateurId, async q => fiche(q, comptable, { journal: 'OD', date: jour(n), reference, libelle: `Mouvement ${reference}`, pieceDocumentId: await pieceFictive('piece_comptable'),
    lignes: montant > 0 ? [{ compte: '5621', libelle: reference, debit: montant, credit: 0 }, { compte: '471', libelle: reference, debit: 0, credit: montant }]
      : [{ compte: '6321', libelle: reference, debit: -montant, credit: 0 }, { compte: '5621', libelle: reference, debit: 0, credit: -montant }] }));
  await valider(chef, f.demandeValidation);
  await valider(c.daf, f.demandeValidation);
}
const fmt = (d: string) => d.split('-').reverse().join('/');
await transaction(c.tresorier.utilisateurId, q => importerReleve(q, c.tresorier, 'BICI', lireReleve([
  `${fmt(jour(4))};Virement reçu;25000000;VIR-DOT-2026`, `${fmt(jour(2))};Chèque 0007;-1770000;`, `${fmt(jour(1))};Frais de tenue de compte;-25000;FR-NOV`].join('\n'))));

console.log('Canal digital : bureau 90, cellule, un dossier payé en ligne à émettre…');
const ligne = await import('../src/modules/production/enLigne.js');
const dossiersMod = await import('../src/modules/production/dossiers.js');
await utilisateur(c.admin, 'canal.digital', [{ code: 'CANAL_DIGITAL' }], c.dg);
await transaction(c.resp1.utilisateurId, q => ligne.installerCanalDigital(q, c.resp1, { code: '90', nom: 'Canal digital', adresse: 'Siège, Kaloum' }));
{
  const client = new Acteur(null);
  const tel = '+224661234567';
  const codeSms = () => sms.dernier(tel)!.texte.match(/(\d{6})/)![1]!;
  const id = await transaction(null, q => ligne.identifier(q, client, { nom: 'SYLLA', prenoms: 'Mariama', dateNaissance: '1992-08-14', telephone: tel, sexe: 'F' }));
  await transaction(null, q => ligne.confirmerIdentification(q, client, id.tiersId, codeSms()));
  const d = await transaction(null, q => ligne.ouvrirDossierEnLigne(q, client, id.tiersId, { formuleId: c.formuleId, codePrescripteur: 'KARAMOKO' }));
  await transaction(null, q => dossiersMod.tarifierDossier(q, client, d.id));
  const r = await transaction(null, q => dossiersMod.presenterRecapitulatif(q, client, d.id));
  await transaction(null, q => dossiersMod.accepterRecapitulatif(q, client, d.id, r.documentId, codeSms()));
  const p = await ligne.demanderPaiement(getPool(), id.tiersId, d.id, { operateur: 'OM', telephone: tel });
  await transaction(null, q => ligne.confirmerPaiement(q, client, { reference: p.reference, operateur: 'OM', montant: p.montant!, referenceExterne: 'OM-778812' }));
}

console.log('Impayé : prime supplémentaire d\'un avenant de correction, mise en demeure à valider…');
{
  const { proposerCorrection } = await import('../src/modules/production/vieContrat.js');
  const { traiterImpayes } = await import('../src/modules/production/nonPaiement.js');
  // Deuxième tranche de tarif (46-65 ans) pour qu'une correction de date de naissance change la prime
  await getPool().query(`UPDATE tarif SET age_max = 45 WHERE formule_id = $1 AND qualite = 'ASSURE_PRINCIPAL'`, [c.formuleId]);
  await getPool().query(`INSERT INTO tarif (formule_id, qualite, age_min, age_max, prime_nette, date_effet) SELECT formule_id, qualite, 46, 65, 6290000, date_effet FROM tarif WHERE formule_id = $1 AND qualite = 'ASSURE_PRINCIPAL'`, [c.formuleId]);
  const keita = (await getPool().query(`SELECT id FROM police_assure WHERE police_id = $1 AND qualite = 'ASSURE_PRINCIPAL'`, [polices[1]!.policeId])).rows[0].id;
  const prop = await transaction(c.agentU.utilisateurId, q => proposerCorrection(q, c.agentU, polices[1]!.policeId, { policeAssureId: keita, dateNaissance: '1970-03-03', motif: 'Erreur sur l\'année de naissance' }));
  await valider(c.gest, prop.demandeValidation);
  await transaction(null, q => traiterImpayes(q, new Acteur(null), ajouterJours(aujourdhui(), 10)));
}

console.log('Santé : nomenclatures, clinique agréée avec son administrateur et un médecin, pharmacie en agrément…');
{
  const { creerTiers } = await import('../src/modules/referentiels/tiers.js');
  const { proposerCoordonnee } = await import('../src/modules/referentiels/coordonnees.js');
  const { GardienLocal, MoteurChiffrement } = await import('../src/moteurs/chiffrement.js');
  const { randomBytes } = await import('node:crypto');
  const { importer } = await import('../src/modules/sante/nomenclatures.js');
  const sante = await import('../src/modules/sante/prestataires.js');
  const gestS = await utilisateur(c.admin, 'gest.sante', [{ code: 'GEST_SANTE' }], c.dg);
  const mc = await utilisateur(c.admin, 'medecin.conseil', [{ code: 'MEDECIN_CONSEIL' }], c.dg);
  await transaction(gestS.utilisateurId, q => importer(q, gestS, 'ACTES', ['C01;Consultation de médecine générale;CONSULTATION', 'C02;Consultation de spécialiste;CONSULTATION;Pédiatrie',
    'B01;Numération formule sanguine;ANALYSE', 'B02;Goutte épaisse (paludisme);ANALYSE', 'R01;Radiographie thoracique;IMAGERIE', 'E01;Échographie abdominale;IMAGERIE',
    'H01;Journée d\'hospitalisation;HOSPITALISATION', 'T01;Téléconsultation;TELECONSULTATION'].join('\n')));
  await transaction(gestS.utilisateurId, q => importer(q, gestS, 'MEDICAMENTS', ['AMOX500;Amoxicilline 500 mg gélules;amoxicilline;oui;oui;3', 'PARA500;Paracétamol 500 mg comprimés;paracétamol;oui;oui;4',
    'ARTE80;Artéméther-luméfantrine 80/480;artéméther-luméfantrine;oui;oui;2'].join('\n')));
  const chiffre = new MoteurChiffrement(new GardienLocal(randomBytes(32)));
  const structure = async (nom: string, type: string, tarifs: [string, number][], admin?: { identifiant: string; nom: string; tel: string }) => {
    const tiersId = await transaction(gestS.utilisateurId, q => creerTiers(q, gestS, { nature: 'MORALE', nom, telephone: `+2246${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`, adresse: 'Kaloum, Conakry' }));
    const p = await transaction(gestS.utilisateurId, q => sante.creerPrestataire(q, gestS, { tiersId, type, latitude: 9.5092, longitude: -13.7122 }));
    for (const [acte, tarif] of tarifs) await transaction(gestS.utilisateurId, q => sante.ajouterTarif(q, gestS, p.id, { acteCode: acte, tarif, dateEffet: '2020-01-01' }));
    if (!admin) return p;
    await transaction(gestS.utilisateurId, async q => sante.modifierPrestataire(q, gestS, p.id, { conventionDocumentId: await pieceFictive('prestataire') }));
    const co = await transaction(gestS.utilisateurId, q => proposerCoordonnee(q, gestS, chiffre, { tiersId, type: 'BANQUE', etablissement: 'Ecobank', numero: 'GN0012345678901234', intitule: nom }));
    await valider(comptable, co.demandeValidation);
    const resp = await transaction(gestS.utilisateurId, q => creerTiers(q, gestS, { nature: 'PHYSIQUE', nom: admin.nom, prenoms: 'Responsable', telephone: admin.tel }));
    const a = await transaction(gestS.utilisateurId, q => sante.proposerAgrementPrestataire(q, gestS, p.id, { tiersId: resp, identifiant: admin.identifiant, motDePasse: MDP }));
    await valider(mc, a.demandeValidation);
    await valider(c.daf, a.demandeValidation);
    return { ...p, admin: new Acteur(a.administrateurId) };
  };
  const clinique = await structure('CLINIQUE PASTEUR', 'CLINIQUE', [['C01', 150_000], ['C02', 250_000], ['H01', 600_000]], { identifiant: 'admin.clinique', nom: 'BARRY', tel: '+224628001122' }) as { id: string; admin: InstanceType<typeof Acteur> };
  const m = await transaction(clinique.admin.utilisateurId, async q => sante.ajouterProfessionnel(q, clinique.admin, {
    nom: 'CAMARA', prenoms: 'Fatoumata', telephone: '+224628334455', typePiece: 'CNI', numeroPiece: 'CNI-77812', profession: 'MEDECIN', specialite: 'Médecine générale',
    numeroOrdre: 'ONMG-2011-0457', diplomeDocumentId: await pieceFictive('prestataire'), pieceDocumentId: await pieceFictive('prestataire'), identifiant: 'dr.camara', motDePasse: MDP }));
  await valider(mc, m.demandeAgrement!);
  await structure('PHARMACIE DU NIGER', 'PHARMACIE', [['C01', 1]].slice(0, 0) as [string, number][]);
}

console.log('Cartes : une carte physique demandée, une imprimée à remettre…');
{
  const cartes = await import('../src/modules/sante/cartes.js');
  const idCarte = async (policeId: string) => (await getPool().query(`SELECT c.id FROM carte_assure c JOIN police_assure pa ON pa.id = c.police_assure_id WHERE pa.police_id = $1 AND c.statut = 'ACTIVE' ORDER BY pa.rang_carte LIMIT 1`, [policeId])).rows[0].id as string;
  const a = await idCarte(polices[2]!.policeId), b = await idCarte(polices[3]!.policeId);
  await transaction(c.agentU.utilisateurId, q => cartes.demanderCartePhysique(q, c.agentU, a, { lieu: 'BUREAU', bureauId: c.bureau }));
  await transaction(c.agentU.utilisateurId, q => cartes.demanderCartePhysique(q, c.agentU, b, { lieu: 'SIEGE', office: true }));
  await transaction(c.gest.utilisateurId, q => cartes.imprimerCarte(q, c.gest, b));
}

// Comptes utilisables sans activation ni second facteur en développement (voir SECOND_FACTEUR_DISPENSE)
await getPool().query(`UPDATE utilisateur SET statut = 'ACTIF' WHERE statut <> 'ACTIF'`);
const comptes = (await getPool().query(`SELECT identifiant FROM utilisateur ORDER BY identifiant`)).rows.map(r => r.identifiant);
console.log(`\nJeu d'essai prêt. Mot de passe de tous les comptes : ${MDP}\nComptes : ${comptes.join(', ')}`);
console.log(`Pour se connecter sans second facteur : SECOND_FACTEUR_DISPENSE=${comptes.join(',')} dans .env, puis redémarrer le serveur.`);
void valider; void chef;
await fermer();
