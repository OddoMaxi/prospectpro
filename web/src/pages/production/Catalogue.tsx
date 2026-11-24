/** RF-04 Catalogue des produits (§ 5.5 ; REF-RG-030 à 035 ; ARC-RG-020). */
import { useState } from 'react';
import { api, aujourdhui, date, montant } from '../../noyau/api';
import { Carte, Champ, Chargement, Message, MessageErreur, Modale, Page, Statut, useAvis } from '../../noyau/composants';
import { useAction, useDonnees } from '../../noyau/donnees';
import { useSession } from '../../noyau/session';

interface Produit { id: string; code: string; libelle: string; branche_bcrg: string; type_couverture: string; type_contrat: string; age_min: number; age_max: number; formules: { id: string; code: string; libelle: string; version: number; date_effet: string }[] }
interface Garantie { code: string; libelle: string; type: string; plafond: number | null; nombre_actes: number | null; taux_prise_en_charge: string; carence_jours: number; accord_prealable: boolean; capital: number | null; age_min_deces: number | null; mode_calcul: string }
interface Tarif { qualite: string; age_min: number; age_max: number; prime_nette: number; date_effet: string }
interface Formule { id: string; code: string; libelle: string; version: number; date_effet: string; accessoires: number; ticket_moderateur: string; plafond_annuel_personne: number; plafond_annuel_famille: number | null; composition: { conjointsMax: number; enfantsMax: number; personnesMax: number }; garanties: Garantie[]; tarifs: Tarif[] }
const QUALITES: Record<string, string> = { ASSURE_PRINCIPAL: 'Assuré principal', CONJOINT: 'Conjoint', ENFANT: 'Enfant', ADULTE: 'Adulte (collectif)' };
const pct = (t: string | number) => `${Math.round(Number(t) * 100)} %`;

export function PageCatalogue() {
  const { peut } = useSession();
  const [dateCatalogue, setDateCatalogue] = useState(aujourdhui());
  const catalogue = useDonnees<Produit[]>(`/catalogue?date=${dateCatalogue}`);
  const [formuleId, setFormuleId] = useState<string | null>(null);
  const [nouveau, setNouveau] = useState(false);
  const { avis, Avis } = useAvis();
  return (
    <Page fil={['Production', 'Catalogue des produits']} titre="Catalogue des produits" actions={peut('CATALOGUE:CREER') && <button className="bouton" onClick={() => setNouveau(true)}>+ Nouveau produit</button>}>
      <div className="filtres"><label>Catalogue en vigueur au <input type="date" value={dateCatalogue} onChange={e => setDateCatalogue(e.target.value)} /></label></div>
      <Message><span className="repere">1</span> Produit → Formule → Garanties ; trois formules au plus par produit. <span className="repere">3</span> Toute modification crée une version datée, validée par le comité de paramétrage, et ne s'applique jamais aux périodes en cours.</Message>
      {catalogue.chargement ? <Chargement /> : catalogue.donnees?.length === 0 ? <Carte><div className="vide">Aucun produit commercialisé à cette date.</div></Carte> :
        catalogue.donnees?.map(p => <Carte key={p.id} titre={<>{p.libelle} <span className="doux code">produit {p.code}</span></>}>
          <dl className="details"><dt>Branche</dt><dd>{p.branche_bcrg}</dd><dt>Couverture</dt><dd>{p.type_couverture.toLowerCase()} – contrat {p.type_contrat.toLowerCase()}</dd><dt>Âges à la souscription</dt><dd>{p.age_min} à {p.age_max} ans</dd></dl>
          <table className="tableau" style={{ marginTop: 12 }}><thead><tr><th>Formule</th><th>Version</th><th>En vigueur depuis</th><th /></tr></thead>
            <tbody>{p.formules.map(f => <tr key={f.id} className="cliquable" onClick={() => setFormuleId(f.id)}><td>{f.libelle} <span className="doux code">{f.code}</span></td><td>v{f.version}</td><td>{date(f.date_effet)}</td><td><button className="lien">Détail, tarifs et simulation</button></td></tr>)}</tbody></table>
        </Carte>)}
      {formuleId && <DetailFormule id={formuleId} fermer={() => setFormuleId(null)} avis={avis} />}
      {nouveau && <NouveauProduit fermer={() => setNouveau(false)} apres={() => { setNouveau(false); avis('Produit soumis au comité de paramétrage.'); }} />}
      <Avis />
    </Page>
  );
}

function DetailFormule({ id, fermer, avis }: { id: string; fermer: () => void; avis: (m: string) => void }) {
  const { peut } = useSession();
  const { donnees: f, chargement } = useDonnees<Formule>(`/catalogue/formules/${id}`);
  const [membres, setMembres] = useState([{ qualite: 'ASSURE_PRINCIPAL', dateNaissance: '1988-01-01' }]);
  const [dateTarif, setDateTarif] = useState(aujourdhui());
  const [resultat, setResultat] = useState<{ dateTarif: string; lignes: { qualite: string; age: number; primeNette: number }[]; primeNette: number; accessoires: number; taxes: { libelle: string; montant: number }[]; primeTotale: number } | null>(null);
  const [grille, setGrille] = useState<Tarif[] | null>(null);
  const [effetGrille, setEffetGrille] = useState(aujourdhui());
  const [motif, setMotif] = useState('');
  const action = useAction();
  if (chargement || !f) return <Modale titre="Formule" fermer={fermer}><Chargement /></Modale>;
  const dates = [...new Set(f.tarifs.map(t => String(t.date_effet).slice(0, 10)))].sort().reverse();
  return (
    <Modale titre={`${f.libelle} – version ${f.version}`} large fermer={fermer}>
      <dl className="details"><dt>Composition</dt><dd>{f.composition.conjointsMax} conjoint(s), {f.composition.enfantsMax} enfant(s), {f.composition.personnesMax} personnes au plus</dd>
        <dt>Plafond annuel</dt><dd>{montant(f.plafond_annuel_personne)} GNF par personne{f.plafond_annuel_famille ? `, ${montant(f.plafond_annuel_famille)} GNF par famille` : ''}</dd>
        <dt>Ticket modérateur</dt><dd>{pct(f.ticket_moderateur)}</dd><dt>Accessoires</dt><dd>{montant(f.accessoires)} GNF</dd></dl>
      <h3>Garanties <span className="repere">2</span></h3>
      <table className="tableau"><thead><tr><th>Garantie</th><th className="nombre">Plafond</th><th className="nombre">Actes</th><th className="nombre">Taux</th><th className="nombre">Carence</th><th>Accord préalable</th></tr></thead>
        <tbody>{f.garanties.map(g => <tr key={g.code}><td>{g.libelle}{g.type === 'DECES' && <div className="doux">Capital {montant(g.capital)} GNF – à partir de {g.age_min_deces} ans (art. 194)</div>}</td>
          <td className="nombre">{montant(g.plafond)}</td><td className="nombre">{g.nombre_actes ?? '—'}</td><td className="nombre">{pct(g.taux_prise_en_charge)}</td><td className="nombre">{g.carence_jours} j</td><td>{g.accord_prealable ? 'Oui' : 'Non'}</td></tr>)}</tbody></table>
      <h3>Grilles de tarifs (prime nette annuelle, GNF)</h3>
      {dates.map(d => <div key={d}><div className="doux" style={{ margin: '8px 0 4px' }}>En vigueur à partir du {date(d)} {d > aujourdhui() && <Statut couleur="bleu">À venir</Statut>}</div>
        <table className="tableau"><tbody>{f.tarifs.filter(t => String(t.date_effet).slice(0, 10) === d).map((t, i) => <tr key={i}><td>{QUALITES[t.qualite]}</td><td>{t.age_min} – {t.age_max} ans</td><td className="nombre">{montant(t.prime_nette)}</td></tr>)}</tbody></table></div>)}
      <h3>Simulation de prime (REF-RG-030)</h3>
      {membres.map((m, i) => <div key={i} className="filtres">
        <select value={m.qualite} onChange={e => setMembres(membres.map((x, j) => j === i ? { ...x, qualite: e.target.value } : x))}>{Object.entries(QUALITES).map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select>
        <label>né(e) le <input type="date" value={m.dateNaissance} onChange={e => setMembres(membres.map((x, j) => j === i ? { ...x, dateNaissance: e.target.value } : x))} /></label>
        {i > 0 && <button className="lien" onClick={() => setMembres(membres.filter((_, j) => j !== i))}>retirer</button>}</div>)}
      <div className="filtres"><button className="bouton secondaire petit" onClick={() => setMembres([...membres, { qualite: 'ENFANT', dateNaissance: '2018-01-01' }])}>+ Personne</button>
        <label>Date de la période <input type="date" value={dateTarif} onChange={e => setDateTarif(e.target.value)} /></label>
        <button className="bouton petit" onClick={() => void action.executer(() => api<typeof resultat>('POST', '/catalogue/tarification', { formuleId: f.id, membres, date: dateTarif })).then(r => r && setResultat(r))}>Calculer</button></div>
      {resultat && <table className="tableau"><tbody>
        {resultat.lignes.map((l, i) => <tr key={i}><td>{QUALITES[l.qualite]} ({l.age} ans)</td><td className="nombre">{montant(l.primeNette)}</td></tr>)}
        <tr><td>Prime nette (grille du {date(resultat.dateTarif)})</td><td className="nombre">{montant(resultat.primeNette)}</td></tr>
        <tr><td>Accessoires</td><td className="nombre">{montant(resultat.accessoires)}</td></tr>
        {resultat.taxes.map(t => <tr key={t.libelle}><td>{t.libelle}</td><td className="nombre">{montant(t.montant)}</td></tr>)}
        <tr><td><b>Prime totale</b></td><td className="nombre"><b>{montant(resultat.primeTotale)} GNF</b></td></tr></tbody></table>}
      {peut('CATALOGUE:CREER') && <>
        <h3>Proposer une nouvelle grille de tarifs</h3>
        {!grille ? <button className="bouton secondaire" onClick={() => setGrille(f.tarifs.filter(t => String(t.date_effet).slice(0, 10) === dates.find(d => d <= aujourdhui())))}>Partir de la grille en vigueur</button> : <>
          <table className="tableau"><tbody>{grille.map((t, i) => <tr key={i}><td>{QUALITES[t.qualite]}</td><td>{t.age_min} – {t.age_max} ans</td>
            <td><input type="number" value={t.prime_nette} onChange={e => setGrille(grille.map((x, j) => j === i ? { ...x, prime_nette: Number(e.target.value) } : x))} /></td></tr>)}</tbody></table>
          <div className="formulaire" style={{ '--colonnes': 2 } as React.CSSProperties}>
            <Champ libelle="Date d'effet" aide="Au plus tôt aujourd'hui ; les polices en cours gardent leur tarif"><input type="date" min={aujourdhui()} value={effetGrille} onChange={e => setEffetGrille(e.target.value)} /></Champ>
            <Champ libelle="Motif"><input value={motif} onChange={e => setMotif(e.target.value)} /></Champ></div>
          <div className="boutons"><button className="bouton" disabled={!motif.trim() || action.enCours} onClick={() => void action.executer(() => api('POST', '/catalogue/propositions', {
            motif, operation: { type: 'GRILLE_TARIFS', dateEffet: effetGrille, formuleId: f.id, tarifs: grille.map(t => ({ qualite: t.qualite, ageMin: t.age_min, ageMax: t.age_max, primeNette: Number(t.prime_nette) })) },
          })).then(r => { if (r) { setGrille(null); avis('Nouvelle grille soumise au comité de paramétrage.'); } })}>Soumettre au comité</button></div>
        </>}
      </>}
      <MessageErreur erreur={action.erreur} />
    </Modale>
  );
}

const GARANTIE_VIDE = { code: '', libelle: '', type: 'FRAIS_SOINS', plafond: '', tauxPriseEnCharge: '80', carenceJours: '30', accordPrealable: false, modeCalcul: 'COUT_REEL', capital: '', ageMinDeces: '' };
const TARIF_VIDE = { qualite: 'ASSURE_PRINCIPAL', ageMin: '18', ageMax: '65', primeNette: '' };

function NouveauProduit({ fermer, apres }: { fermer: () => void; apres: () => void }) {
  const modeles = useDonnees<{ id: string; code: string; version: number; libelle: string }[]>('/modeles');
  const [p, setP] = useState({ code: '', libelle: '', brancheBcrg: 'Assurance maladie', typeCouverture: 'FAMILLE', typeContrat: 'INDIVIDUEL', ageMin: '18', ageMax: '65', modeleCgId: '', modeleCpId: '' });
  const [f, setF] = useState({ code: '', libelle: '', conjointsMax: '1', enfantsMax: '4', personnesMax: '6', accessoires: '10000', ticketModerateur: '20', plafondAnnuelPersonne: '', plafondAnnuelFamille: '' });
  const [garanties, setGaranties] = useState([{ ...GARANTIE_VIDE }]);
  const [tarifs, setTarifs] = useState([{ ...TARIF_VIDE }]);
  const [dateEffet, setDateEffet] = useState(aujourdhui());
  const [motif, setMotif] = useState('Lancement');
  const action = useAction();
  const n = (s: string) => (s === '' ? undefined : Number(s));
  const envoyer = () => action.executer(() => api('POST', '/catalogue/propositions', {
    motif, operation: {
      type: 'CREER_PRODUIT', dateEffet, produit: {
        ...p, ageMin: Number(p.ageMin), ageMax: Number(p.ageMax), formules: [{
          code: f.code, libelle: f.libelle, composition: { conjointsMax: Number(f.conjointsMax), enfantsMax: Number(f.enfantsMax), personnesMax: Number(f.personnesMax) },
          accessoires: Number(f.accessoires), ticketModerateur: Number(f.ticketModerateur) / 100, plafondAnnuelPersonne: Number(f.plafondAnnuelPersonne), plafondAnnuelFamille: n(f.plafondAnnuelFamille),
          garanties: garanties.map(g => ({ code: g.code, libelle: g.libelle, type: g.type, plafond: n(g.plafond), tauxPriseEnCharge: Number(g.tauxPriseEnCharge) / 100, carenceJours: Number(g.carenceJours),
            accordPrealable: g.accordPrealable, beneficiaires: g.type === 'DECES' || g.type === 'FRAIS_FUNERAIRES' ? 'AYANTS_DROIT' : 'VICTIME', modeCalcul: g.modeCalcul, capital: n(g.capital), ageMinDeces: n(g.ageMinDeces) })),
          tarifs: tarifs.map(t => ({ qualite: t.qualite, ageMin: Number(t.ageMin), ageMax: Number(t.ageMax), primeNette: Number(t.primeNette) })),
        }],
      },
    },
  })).then(r => r && apres());
  const entree = (v: string, maj: (s: string) => void, attrs: Record<string, unknown> = {}) => <input value={v} onChange={e => maj(e.target.value)} {...attrs} />;
  return (
    <Modale titre="Nouveau produit (proposition au comité)" large fermer={fermer}>
      <h3>Produit</h3>
      <div className="formulaire" style={{ '--colonnes': 4 } as React.CSSProperties}>
        <Champ libelle="Code (2 chiffres)">{entree(p.code, v => setP({ ...p, code: v }), { maxLength: 2 })}</Champ>
        <Champ libelle="Libellé">{entree(p.libelle, v => setP({ ...p, libelle: v }))}</Champ>
        <Champ libelle="Branche BCRG">{entree(p.brancheBcrg, v => setP({ ...p, brancheBcrg: v }))}</Champ>
        <Champ libelle="Couverture"><select value={p.typeCouverture} onChange={e => setP({ ...p, typeCouverture: e.target.value })}><option>INDIVIDUEL</option><option>FAMILLE</option><option>GROUPE</option></select></Champ>
        <Champ libelle="Contrat"><select value={p.typeContrat} onChange={e => setP({ ...p, typeContrat: e.target.value })}><option>INDIVIDUEL</option><option>COLLECTIF</option></select></Champ>
        <Champ libelle="Âge min.">{entree(p.ageMin, v => setP({ ...p, ageMin: v }), { type: 'number' })}</Champ>
        <Champ libelle="Âge max.">{entree(p.ageMax, v => setP({ ...p, ageMax: v }), { type: 'number' })}</Champ>
        <Champ libelle="Date d'effet"><input type="date" min={aujourdhui()} value={dateEffet} onChange={e => setDateEffet(e.target.value)} /></Champ>
        <Champ libelle="Conditions générales"><select value={p.modeleCgId} onChange={e => setP({ ...p, modeleCgId: e.target.value })}><option value="">—</option>{modeles.donnees?.map(m => <option key={m.id} value={m.id}>{m.code} v{m.version}</option>)}</select></Champ>
        <Champ libelle="Bulletin (conditions particulières)"><select value={p.modeleCpId} onChange={e => setP({ ...p, modeleCpId: e.target.value })}><option value="">—</option>{modeles.donnees?.map(m => <option key={m.id} value={m.id}>{m.code} v{m.version}</option>)}</select></Champ>
      </div>
      <h3>Formule</h3>
      <div className="formulaire" style={{ '--colonnes': 4 } as React.CSSProperties}>
        <Champ libelle="Code">{entree(f.code, v => setF({ ...f, code: v.toUpperCase() }))}</Champ>
        <Champ libelle="Libellé">{entree(f.libelle, v => setF({ ...f, libelle: v }))}</Champ>
        <Champ libelle="Conjoints / enfants / personnes max."><div style={{ display: 'flex', gap: 6 }}>{entree(f.conjointsMax, v => setF({ ...f, conjointsMax: v }), { type: 'number' })}{entree(f.enfantsMax, v => setF({ ...f, enfantsMax: v }), { type: 'number' })}{entree(f.personnesMax, v => setF({ ...f, personnesMax: v }), { type: 'number' })}</div></Champ>
        <Champ libelle="Accessoires (GNF)">{entree(f.accessoires, v => setF({ ...f, accessoires: v }), { type: 'number' })}</Champ>
        <Champ libelle="Ticket modérateur (%)">{entree(f.ticketModerateur, v => setF({ ...f, ticketModerateur: v }), { type: 'number' })}</Champ>
        <Champ libelle="Plafond / personne (GNF)">{entree(f.plafondAnnuelPersonne, v => setF({ ...f, plafondAnnuelPersonne: v }), { type: 'number' })}</Champ>
        <Champ libelle="Plafond / famille (GNF)">{entree(f.plafondAnnuelFamille, v => setF({ ...f, plafondAnnuelFamille: v }), { type: 'number' })}</Champ>
      </div>
      <h3>Garanties</h3>
      <div className="defile"><table className="tableau"><thead><tr><th>Code</th><th>Libellé</th><th>Type</th><th>Plafond</th><th>Taux %</th><th>Carence (j)</th><th>Capital</th><th>Âge min. décès</th><th>Accord</th></tr></thead>
        <tbody>{garanties.map((g, i) => { const maj = (k: string, v: string | boolean) => setGaranties(garanties.map((x, j) => j === i ? { ...x, [k]: v } : x)); return <tr key={i}>
          <td>{entree(g.code, v => maj('code', v.toUpperCase()), { style: { width: 80 } })}</td><td>{entree(g.libelle, v => maj('libelle', v))}</td>
          <td><select value={g.type} onChange={e => { maj('type', e.target.value); if (e.target.value === 'DECES') maj('modeCalcul', 'FORFAIT'); }}>{['FRAIS_SOINS', 'INCAPACITE_TEMPORAIRE', 'INCAPACITE_PERMANENTE', 'DECES', 'FRAIS_FUNERAIRES', 'TELECONSULTATION', 'AUTRE'].map(t => <option key={t}>{t}</option>)}</select></td>
          <td>{entree(g.plafond, v => maj('plafond', v), { type: 'number', style: { width: 110 } })}</td><td>{entree(g.tauxPriseEnCharge, v => maj('tauxPriseEnCharge', v), { type: 'number', style: { width: 60 } })}</td>
          <td>{entree(g.carenceJours, v => maj('carenceJours', v), { type: 'number', style: { width: 60 } })}</td><td>{entree(g.capital, v => maj('capital', v), { type: 'number', style: { width: 110 } })}</td>
          <td>{entree(g.ageMinDeces, v => maj('ageMinDeces', v), { type: 'number', style: { width: 60 } })}</td><td><input type="checkbox" checked={g.accordPrealable} onChange={e => maj('accordPrealable', e.target.checked)} /></td></tr>; })}</tbody></table></div>
      <button className="bouton secondaire petit" onClick={() => setGaranties([...garanties, { ...GARANTIE_VIDE }])}>+ Garantie</button>
      <h3>Tarifs (prime nette annuelle)</h3>
      <table className="tableau"><tbody>{tarifs.map((t, i) => { const maj = (k: string, v: string) => setTarifs(tarifs.map((x, j) => j === i ? { ...x, [k]: v } : x)); return <tr key={i}>
        <td><select value={t.qualite} onChange={e => maj('qualite', e.target.value)}>{Object.entries(QUALITES).map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select></td>
        <td>{entree(t.ageMin, v => maj('ageMin', v), { type: 'number', style: { width: 70 } })} à {entree(t.ageMax, v => maj('ageMax', v), { type: 'number', style: { width: 70 } })} ans</td>
        <td>{entree(t.primeNette, v => maj('primeNette', v), { type: 'number', placeholder: 'GNF' })}</td></tr>; })}</tbody></table>
      <button className="bouton secondaire petit" onClick={() => setTarifs([...tarifs, { ...TARIF_VIDE, qualite: 'ENFANT', ageMin: '0', ageMax: '20' }])}>+ Tranche</button>
      <div style={{ maxWidth: 420, marginTop: 12 }}><Champ libelle="Motif">{entree(motif, setMotif)}</Champ></div>
      <Message type="attention">Une garantie décès exige un âge minimal d'au moins 12 ans (art. 194) et un capital ; la proposition est refusée sinon.</Message>
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton" disabled={action.enCours} onClick={() => void envoyer()}>Soumettre au comité</button><button className="bouton secondaire" onClick={fermer}>Annuler</button></div>
    </Modale>
  );
}
