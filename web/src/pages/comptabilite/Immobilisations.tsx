/** Immobilisations (FIN-RG-140 à 149) : registre, fiche et plan d'amortissement, sortie, état fiscal. */
import { Fragment, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, date, montant } from '../../noyau/api';
import { Carte, Champ, Chargement, Message, MessageErreur, Modale, Onglets, Page, Statut, useAvis } from '../../noyau/composants';
import { useAction, useDonnees } from '../../noyau/donnees';
import { useSession } from '../../noyau/session';

const STATUTS: Record<string, [string, string]> = {
  EN_SERVICE: ['En service', 'vert'], PASSE_EN_CHARGE: ['Passé en charge', 'orange'], CEDE: ['Cédé', 'gris'], MIS_AU_REBUT: ['Mis au rebut', 'gris'],
};
const StatutBien = ({ s }: { s: string }) => <Statut couleur={STATUTS[s]?.[1]}>{STATUTS[s]?.[0] ?? s}</Statut>;
const MOUVEMENTS: Record<string, string> = {
  ACQUISITION: 'Acquisition', PASSAGE_CHARGE: 'Passage en charge', SORTIE_REMPLACEMENT: 'Sortie (remplacé)', TRANSFERT: 'Transfert', REVISION: 'Révision', DEPRECIATION: 'Dépréciation', CESSION: 'Cession', REBUT: 'Mise au rebut',
};

interface LigneRegistre {
  id: string; numero_inventaire: string; designation: string; categorie: string; statut: string; date_acquisition: string; date_mise_en_service: string | null;
  valeur_origine: number; cumul: number; vnc: number; fournisseur: string | null; facture: string | null; localisation: Record<string, string>;
}
type Onglet = 'registre' | 'fiscal';

export function PageImmobilisations() {
  const [onglet, setOnglet] = useState<Onglet>('registre');
  const [statut, setStatut] = useState('EN_SERVICE');
  const liste = useDonnees<LigneRegistre[]>(`/immobilisations${statut ? `?statut=${statut}` : ''}`);
  const actifs = liste.donnees ?? [];
  return (
    <Page fil={['Comptabilité', 'Immobilisations']} titre="Immobilisations" actions={<Link className="bouton secondaire" to="/comptabilite/achats">Factures d'achat</Link>}>
      <Onglets<Onglet> actif={onglet} choisir={setOnglet} onglets={[{ code: 'registre', libelle: 'Registre' }, { code: 'fiscal', libelle: 'État fiscal' }]} />
      {onglet === 'registre' && <>
        <div className="grille quatre">
          <div className="indicateur"><small>Valeur d'origine</small><b>{montant(actifs.reduce((s, x) => s + Number(x.valeur_origine), 0))}</b><span>GNF, {actifs.length} bien(s)</span></div>
          <div className="indicateur"><small>Amortissements cumulés</small><b>{montant(actifs.reduce((s, x) => s + Number(x.cumul), 0))}</b><span>GNF</span></div>
          <div className="indicateur"><small>Valeur nette</small><b>{montant(actifs.reduce((s, x) => s + Number(x.vnc), 0))}</b><span>GNF</span></div>
          <div className="indicateur"><small>À mettre en service</small><b style={{ color: 'var(--orange)' }}>{actifs.filter(x => x.statut === 'EN_SERVICE' && !x.date_mise_en_service).length}</b><span>sans date de mise en service</span></div>
        </div>
        <div className="filtres"><select value={statut} onChange={e => setStatut(e.target.value)}><option value="">Tous les biens</option>{Object.entries(STATUTS).map(([c, [l]]) => <option key={c} value={c}>{l}</option>)}</select></div>
        <Carte titre="Registre des immobilisations">
          {liste.chargement ? <Chargement /> : !actifs.length ? <div className="vide">Aucun bien.</div> :
            <table className="tableau"><thead><tr><th>N° d'inventaire</th><th>Désignation</th><th>Catégorie</th><th>Acquis le</th><th>Mise en service</th><th className="nombre">Valeur d'origine</th><th className="nombre">Cumul</th><th className="nombre">Valeur nette</th><th>Statut</th></tr></thead>
              <tbody>{actifs.map(b => <tr key={b.id}><td className="code"><Link to={`/comptabilite/immobilisations/${b.id}`}>{b.numero_inventaire}</Link></td><td>{b.designation}</td><td>{b.categorie}</td>
                <td>{date(b.date_acquisition)}</td><td>{b.date_mise_en_service ? date(b.date_mise_en_service) : b.statut === 'EN_SERVICE' ? <Statut couleur="orange">À compléter</Statut> : '—'}</td>
                <td className="nombre">{montant(b.valeur_origine)}</td><td className="nombre">{montant(b.cumul)}</td><td className="nombre">{montant(b.vnc)}</td><td><StatutBien s={b.statut} /></td></tr>)}</tbody></table>}
        </Carte>
        <Message>Les fiches sont créées par la validation des factures d'achat imputées en immobilisation, une par unité. Les dotations sont comptabilisées à chaque clôture de période (EVT-17), au prorata temporis depuis la mise en service.</Message>
      </>}
      {onglet === 'fiscal' && <EtatFiscal />}
    </Page>
  );
}

interface Fiscal {
  dotations: { numero_inventaire: string; designation: string; categorie: string; valeur_origine: number; dotation: number; non_deductible: number; motif: string | null }[];
  totalDotations: number; aReintegrer: number;
  passagesEnCharge: { numero_inventaire: string; designation: string; valeur_origine: number; motif: string; date: string }[];
  biensRemplaces: { numero_inventaire: string; designation: string; date: string; facture: string }[];
  cessions: { numero_inventaire: string; designation: string; type: string; date: string; valeur_origine: number; cumul: number; prix: number; resultat: number }[];
}

function EtatFiscal() {
  const [exercice, setExercice] = useState(new Date().getFullYear().toString());
  const e = useDonnees<Fiscal>(`/immobilisations/etat-fiscal?exercice=${exercice}`);
  return (<>
    <div className="filtres"><Champ libelle="Exercice"><input value={exercice} onChange={x => setExercice(x.target.value.replace(/\D/g, '').slice(0, 4))} style={{ width: 90 }} /></Champ></div>
    {!e.donnees ? <Chargement /> : <>
      <div className="grille quatre">
        <div className="indicateur"><small>Dotations comptables</small><b>{montant(e.donnees.totalDotations)}</b><span>GNF</span></div>
        <div className="indicateur"><small>À réintégrer</small><b style={{ color: 'var(--rouge)' }}>{montant(e.donnees.aReintegrer)}</b><span>GNF non déductibles</span></div>
        <div className="indicateur"><small>Passés en charge</small><b>{e.donnees.passagesEnCharge.length}</b><span>biens de faible valeur</span></div>
      </div>
      <Carte titre="Dotations de l'exercice">{!e.donnees.dotations.length ? <div className="vide">Aucune dotation.</div> :
        <table className="tableau"><thead><tr><th>Bien</th><th>Catégorie</th><th className="nombre">Valeur d'origine</th><th className="nombre">Dotation</th><th className="nombre">Non déductible</th><th>Motif</th></tr></thead>
          <tbody>{e.donnees.dotations.map(d => <tr key={d.numero_inventaire}><td><span className="code">{d.numero_inventaire}</span> {d.designation}</td><td>{d.categorie}</td>
            <td className="nombre">{montant(d.valeur_origine)}</td><td className="nombre">{montant(d.dotation)}</td><td className="nombre">{Number(d.non_deductible) ? montant(d.non_deductible) : '—'}</td><td>{d.motif ?? '—'}</td></tr>)}</tbody></table>}</Carte>
      <div className="grille deux">
        <Carte titre="Biens passés en charge (art. 101-VIII)">{!e.donnees.passagesEnCharge.length ? <div className="vide">Aucun.</div> :
          <table className="tableau"><thead><tr><th>Bien</th><th className="nombre">Coût</th><th>Motif</th></tr></thead>
            <tbody>{e.donnees.passagesEnCharge.map(p => <tr key={p.numero_inventaire}><td><span className="code">{p.numero_inventaire}</span> {p.designation}</td><td className="nombre">{montant(p.valeur_origine)}</td><td>{p.motif}</td></tr>)}</tbody></table>}</Carte>
        <Carte titre="Biens remplacés">{!e.donnees.biensRemplaces.length ? <div className="vide">Aucun.</div> :
          <table className="tableau"><thead><tr><th>Bien</th><th>Sortie</th><th>Facture</th></tr></thead>
            <tbody>{e.donnees.biensRemplaces.map(p => <tr key={p.numero_inventaire}><td><span className="code">{p.numero_inventaire}</span> {p.designation}</td><td>{date(p.date)}</td><td className="code">{p.facture}</td></tr>)}</tbody></table>}</Carte>
      </div>
      <Carte titre="État des cessions">{!e.donnees.cessions.length ? <div className="vide">Aucune sortie.</div> :
        <table className="tableau"><thead><tr><th>Bien</th><th>Nature</th><th>Date</th><th className="nombre">Valeur d'origine</th><th className="nombre">Amortissements</th><th className="nombre">Prix</th><th className="nombre">Plus ou moins-value</th></tr></thead>
          <tbody>{e.donnees.cessions.map(c => <tr key={c.numero_inventaire}><td><span className="code">{c.numero_inventaire}</span> {c.designation}</td><td>{c.type === 'CESSION' ? 'Cession' : 'Rebut'}</td><td>{date(c.date)}</td>
            <td className="nombre">{montant(c.valeur_origine)}</td><td className="nombre">{montant(c.cumul)}</td><td className="nombre">{montant(c.prix)}</td>
            <td className="nombre" style={{ color: Number(c.resultat) < 0 ? 'var(--rouge)' : 'var(--vert)' }}>{montant(c.resultat)}</td></tr>)}</tbody></table>}</Carte>
    </>}
  </>);
}

interface Fiche {
  id: string; numero_inventaire: string; designation: string; categorie: string; categorie_code: string; statut: string; date_mise_en_service: string | null;
  valeur_origine: number; cumul_amortissements: number; duree_annees: number; usage_domestique: boolean;
  plan: { annee: number; dotation: number; cumul: number; vnc: number }[]; comptabilise: { exercice: string; dotation: number; non_deductible: number }[];
  mouvements: { type: string; date: string; montant: number | null; motif: string }[];
}

export function PageFicheImmobilisation() {
  const { id } = useParams();
  const { peut } = useSession();
  const f = useDonnees<Fiche>(`/immobilisations/${id}`);
  const [completer, setCompleter] = useState(false);
  const [sortie, setSortie] = useState(false);
  const { avis, Avis } = useAvis();
  if (f.erreur) return <Page titre="Immobilisation"><MessageErreur erreur={f.erreur} /></Page>;
  if (!f.donnees) return <Page titre="Immobilisation"><Chargement /></Page>;
  const b = f.donnees;
  const comptabilise = new Map(b.comptabilise.map(c => [Number(c.exercice), c]));
  return (
    <Page fil={['Comptabilité', <Link key="i" to="/comptabilite/immobilisations">Immobilisations</Link>, b.numero_inventaire]} titre={b.designation} actions={<>
      {['EN_SERVICE', 'PASSE_EN_CHARGE'].includes(b.statut) && peut('IMMOBILISATION:MODIFIER') && <button className="bouton secondaire" onClick={() => setCompleter(true)}>Compléter la fiche</button>}
      {b.statut === 'EN_SERVICE' && peut('IMMOBILISATION:CREER') && <button className="bouton danger" onClick={() => setSortie(true)}>Céder ou mettre au rebut</button>}</>}>
      <div className="filtres"><StatutBien s={b.statut} /><span className="doux">{b.numero_inventaire} · {b.categorie} · {b.duree_annees ? `${b.duree_annees} ans (${Math.round(100 / b.duree_annees * 100) / 100} %)` : 'non amortissable'}{b.usage_domestique ? ' · usage domestique' : ''}</span></div>
      <div className="grille trois">
        <Carte titre="Valeurs"><dl className="details"><dt>Valeur d'origine</dt><dd>{montant(b.valeur_origine)} GNF</dd><dt>Amortissements</dt><dd>{montant(b.cumul_amortissements)} GNF</dd>
          <dt>Valeur nette</dt><dd><b>{montant(b.valeur_origine - b.cumul_amortissements)} GNF</b></dd></dl></Carte>
        <Carte titre="Mise en service">{b.date_mise_en_service ? <dl className="details"><dt>Depuis le</dt><dd>{date(b.date_mise_en_service)}</dd><dt>Annuité</dt><dd>{b.duree_annees ? `${montant(Math.round(b.valeur_origine / b.duree_annees))} GNF` : '—'}</dd></dl>
          : <Message type="attention">Date de mise en service à saisir : le plan d'amortissement part de cette date.</Message>}</Carte>
        <Carte titre="Mouvements"><dl className="details">{b.mouvements.map((m, i) => <Fragment key={i}><dt>{date(m.date)}</dt><dd>{MOUVEMENTS[m.type] ?? m.type}{m.montant ? ` · ${montant(m.montant)} GNF` : ''}<br /><small className="doux">{m.motif}</small></dd></Fragment>)}</dl></Carte>
      </div>
      {b.statut !== 'PASSE_EN_CHARGE' && <Carte titre="Plan d'amortissement (linéaire, prorata temporis)">{!b.plan.length ? <div className="vide">Plan calculé à la mise en service.</div> :
        <table className="tableau"><thead><tr><th>Exercice</th><th className="nombre">Dotation prévue</th><th className="nombre">Cumul</th><th className="nombre">Valeur nette</th><th className="nombre">Comptabilisé</th><th className="nombre">Non déductible</th></tr></thead>
          <tbody>{b.plan.map(p => { const c = comptabilise.get(p.annee); return <tr key={p.annee}><td>{p.annee}</td><td className="nombre">{montant(p.dotation)}</td><td className="nombre">{montant(p.cumul)}</td><td className="nombre">{montant(p.vnc)}</td>
            <td className="nombre">{c ? montant(c.dotation) : '—'}</td><td className="nombre">{c && Number(c.non_deductible) ? montant(c.non_deductible) : '—'}</td></tr>; })}</tbody></table>}</Carte>}
      {completer && <Completer b={b} fermer={() => setCompleter(false)} apres={() => { setCompleter(false); avis('Fiche complétée.'); void f.recharger(); }} />}
      {sortie && <SortieBien b={b} fermer={() => setSortie(false)} apres={m => { setSortie(false); avis(m); void f.recharger(); }} />}
      <Avis />
    </Page>
  );
}

function Completer({ b, fermer, apres }: { b: Fiche; fermer: () => void; apres: () => void }) {
  const [mes, setMes] = useState(b.date_mise_en_service?.slice(0, 10) ?? '');
  const [lieu, setLieu] = useState('');
  const [domestique, setDomestique] = useState(b.usage_domestique);
  const action = useAction();
  return (
    <Modale titre={`Compléter ${b.numero_inventaire}`} fermer={fermer}>
      <div className="formulaire">
        <Champ libelle="Mise en service" aide={b.cumul_amortissements ? 'Figée : des dotations sont comptabilisées' : undefined}><input type="date" value={mes} disabled={!!b.cumul_amortissements} onChange={e => setMes(e.target.value)} /></Champ>
        <Champ libelle="Localisation" aide="Département, service ou bureau"><input value={lieu} onChange={e => setLieu(e.target.value)} /></Champ>
        <Champ libelle="Usage domestique" aide="Amortissement non déductible"><input type="checkbox" checked={domestique} onChange={e => setDomestique(e.target.checked)} /></Champ>
      </div>
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton" disabled={action.enCours} onClick={() => void action.executer(() => api('PATCH', `/immobilisations/${b.id}`, {
        dateMiseEnService: mes && !b.cumul_amortissements ? mes : undefined, localisation: lieu ? { lieu } : undefined, usageDomestique: domestique })).then(r => r !== undefined && apres())}>Enregistrer</button></div>
    </Modale>
  );
}

function SortieBien({ b, fermer, apres }: { b: Fiche; fermer: () => void; apres: (m: string) => void }) {
  const banques = useDonnees<{ code: string; nom: string }[]>('/banques-operateurs');
  const [type, setType] = useState<'CESSION' | 'REBUT'>('CESSION');
  const [jour, setJour] = useState(new Date().toISOString().slice(0, 10));
  const [prix, setPrix] = useState('');
  const [banque, setBanque] = useState('');
  const [motif, setMotif] = useState('');
  const action = useAction();
  return (
    <Modale titre={`Sortie de ${b.numero_inventaire}`} fermer={fermer}>
      <Message>Après validation (comptable puis DAF), une dotation complémentaire est comptabilisée jusqu'au jour de la sortie, puis le bien sort du registre (EVT-18) ; la plus- ou moins-value figure à l'état des cessions.</Message>
      <div className="formulaire">
        <Champ libelle="Nature"><select value={type} onChange={e => setType(e.target.value as typeof type)}><option value="CESSION">Cession</option><option value="REBUT">Mise au rebut</option></select></Champ>
        <Champ libelle="Date de sortie"><input type="date" value={jour} onChange={e => setJour(e.target.value)} /></Champ>
        {type === 'CESSION' && <><Champ libelle="Prix de cession (GNF)"><input inputMode="numeric" value={prix} onChange={e => setPrix(e.target.value.replace(/\D/g, ''))} /></Champ>
          <Champ libelle="Encaissé sur"><select value={banque} onChange={e => setBanque(e.target.value)}><option value="">Choisir…</option>{banques.donnees?.map(x => <option key={x.code} value={x.code}>{x.nom}</option>)}</select></Champ></>}
        <Champ libelle="Motif" large><input value={motif} onChange={e => setMotif(e.target.value)} /></Champ>
      </div>
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton danger" disabled={!motif.trim() || action.enCours || (type === 'CESSION' && Number(prix) > 0 && !banque)}
        onClick={() => void action.executer(() => api<{ vncEstimee: number; resultatEstime: number }>('POST', `/immobilisations/${b.id}/sortie`, { type, date: jour, prix: type === 'CESSION' ? Number(prix) : undefined, banque: banque || undefined, motif }))
          .then(r => r && apres(`Sortie soumise à validation : valeur nette estimée ${montant(r.vncEstimee)} GNF, ${r.resultatEstime >= 0 ? 'plus' : 'moins'}-value ${montant(Math.abs(r.resultatEstime))} GNF.`))}>Soumettre</button></div>
    </Modale>
  );
}
