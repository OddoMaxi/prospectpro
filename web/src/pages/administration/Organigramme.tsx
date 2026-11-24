/** AD-01 Organigramme et réorganisation, AD-06 simulation (ORG-RG-001 à 008). */
import { useMemo, useState } from 'react';
import { api, aujourdhui, date } from '../../noyau/api';
import { Carte, Champ, Chargement, Message, MessageErreur, Modale, Onglets, Page, Statut, useAvis } from '../../noyau/composants';
import { useAction, useDonnees } from '../../noyau/donnees';
import { useSession } from '../../noyau/session';

export interface Noeud { id: string; type: 'DEPARTEMENT' | 'SERVICE' | 'FONCTION'; code: string; libelle: string; statut: string; enfants: Noeud[] }
interface Simulation { utilisateurs?: { identifiant: string }[]; droits?: unknown[]; taches?: unknown[]; [k: string]: unknown }
type Operation = 'DEPLACEMENT' | 'FUSION' | 'SCISSION';
const TYPES = { DEPARTEMENT: 'Département', SERVICE: 'Service', FONCTION: 'Fonction' };

export const aplatir = (n: Noeud[]): Noeud[] => n.flatMap(x => [x, ...aplatir(x.enfants)]);

function Arbre({ noeuds, choisi, choisir }: { noeuds: Noeud[]; choisi?: string; choisir: (n: Noeud) => void }) {
  return <ul>{noeuds.map(n => (
    <li key={n.id}>
      <span className={`noeud ${n.type}${choisi === n.id ? ' choisi' : ''}`} onClick={() => choisir(n)}>
        <span className="puce" /><span className={n.statut !== 'ACTIF' ? 'inactif' : ''}>{n.type === 'DEPARTEMENT' ? <b>{n.libelle}</b> : n.libelle}</span>
        <span className="doux code">{n.code}</span>
      </span>
      {n.enfants.length > 0 && <Arbre noeuds={n.enfants} choisi={choisi} choisir={choisir} />}
    </li>))}</ul>;
}

export function PageOrganigramme() {
  const { peut } = useSession();
  const parametrer = peut('ORGANISATION:PARAMETRER');
  const [dateAffichage, setDateAffichage] = useState(aujourdhui());
  const [inactifs, setInactifs] = useState(false);
  const arbre = useDonnees<Noeud[]>(`/admin/organigramme?date=${dateAffichage}&inactifs=${inactifs ? 1 : 0}`);
  const [onglet, setOnglet] = useState<'ARBRE' | 'HISTORIQUE'>('ARBRE');
  const historique = useDonnees<{ operation: string; entite_type: string; date_effet: string; valideur: string | null; cree_le: string }[]>(onglet === 'HISTORIQUE' ? '/admin/organisation/historique' : null);
  const [choisi, setChoisi] = useState<Noeud | null>(null);
  const [creation, setCreation] = useState<null | 'DEPARTEMENT' | 'SERVICE' | 'FONCTION'>(null);
  const [operation, setOperation] = useState<Operation | null>(null);
  const { avis, Avis } = useAvis();
  const tous = useMemo(() => aplatir(arbre.donnees ?? []), [arbre.donnees]);

  return (
    <Page fil={['Administration', 'Organisation']} titre="Organigramme" actions={parametrer && <>
      <button className="bouton" onClick={() => setCreation('DEPARTEMENT')}>+ Département</button>
      <button className="bouton" disabled={choisi?.type !== 'DEPARTEMENT'} title="Choisissez un département" onClick={() => setCreation('SERVICE')}>+ Service</button>
      <button className="bouton" disabled={choisi?.type !== 'SERVICE'} title="Choisissez un service" onClick={() => setCreation('FONCTION')}>+ Fonction</button>
      <button className="bouton secondaire" onClick={() => setOperation('DEPLACEMENT')}>Déplacer</button>
      <button className="bouton secondaire" onClick={() => setOperation('FUSION')}>Fusionner</button>
      <button className="bouton secondaire" onClick={() => setOperation('SCISSION')}>Scinder</button>
    </>}>
      <Onglets onglets={[{ code: 'ARBRE', libelle: 'Arborescence' }, { code: 'HISTORIQUE', libelle: 'Historique' }]} actif={onglet} choisir={setOnglet} />
      {onglet === 'ARBRE' && <div className="grille cote">
        <Carte titre={`Arborescence au ${date(dateAffichage)}`} repere={1}>
          <div className="filtres">
            <span className="repere">2</span>
            <label>Date d'affichage <input type="date" value={dateAffichage} onChange={e => setDateAffichage(e.target.value || aujourdhui())} /></label>
            <label><input type="checkbox" checked={inactifs} onChange={e => setInactifs(e.target.checked)} /> Afficher les entités inactives</label>
          </div>
          {arbre.chargement ? <Chargement /> : <div className="arbre"><Arbre noeuds={arbre.donnees ?? []} choisi={choisi?.id} choisir={setChoisi} /></div>}
        </Carte>
        <div>{choisi ? <Fiche noeud={choisi} parametrer={parametrer} apres={m => { avis(m); setChoisi(null); void arbre.recharger(); }} />
          : <Message>Choisissez une entité pour la consulter, la renommer, la désactiver ou lui ajouter des éléments. Une date passée restitue l'organigramme de l'époque.</Message>}</div>
      </div>}
      {onglet === 'HISTORIQUE' && <Carte>
        {historique.chargement ? <Chargement /> : <table className="tableau"><thead><tr><th>Date d'effet</th><th>Opération</th><th>Entité</th><th>Validée par</th></tr></thead>
          <tbody>{historique.donnees?.map((h, i) => <tr key={i}><td>{date(h.date_effet)}</td><td>{h.operation}</td><td>{TYPES[h.entite_type as keyof typeof TYPES] ?? h.entite_type}</td><td>{h.valideur ?? '—'}</td></tr>)}</tbody></table>}
      </Carte>}
      {creation && <Creation type={creation} parent={creation === 'DEPARTEMENT' ? null : choisi} fermer={() => setCreation(null)} apres={m => { setCreation(null); avis(m); void arbre.recharger(); }} />}
      {operation && <Restructuration operation={operation} noeuds={tous} fermer={() => setOperation(null)} apres={m => { setOperation(null); avis(m); }} />}
      <Avis />
    </Page>
  );
}

function Fiche({ noeud, parametrer, apres }: { noeud: Noeud; parametrer: boolean; apres: (m: string) => void }) {
  const [libelle, setLibelle] = useState(noeud.libelle);
  const [dateEffet, setDateEffet] = useState(aujourdhui());
  const action = useAction();
  return (
    <Carte titre={`${TYPES[noeud.type]} ${noeud.code}`}>
      <dl className="details"><dt>Libellé</dt><dd>{noeud.libelle}</dd><dt>Statut</dt><dd><Statut valeur={noeud.statut} /></dd>
        <dt>Rattachés</dt><dd>{noeud.enfants.length ? noeud.enfants.map(e => e.libelle).join(', ') : '—'}</dd></dl>
      {parametrer && noeud.statut === 'ACTIF' && <>
        <h3>Renommer ou désactiver</h3>
        <div className="formulaire" style={{ '--colonnes': 2 } as React.CSSProperties}>
          <Champ libelle="Nouveau libellé"><input value={libelle} onChange={e => setLibelle(e.target.value)} /></Champ>
          <Champ libelle="Date d'effet" aide="Aujourd'hui ou une date passée"><input type="date" max={aujourdhui()} value={dateEffet} onChange={e => setDateEffet(e.target.value)} /></Champ>
        </div>
        <MessageErreur erreur={action.erreur} />
        <div className="boutons">
          <button className="bouton" disabled={action.enCours || libelle === noeud.libelle} onClick={() => void action.executer(() => api('POST', `/admin/organisation/${noeud.id}/renommage`, { type: noeud.type, libelle, dateEffet })).then(r => r !== undefined && apres('Entité renommée.'))}>Renommer</button>
          <button className="bouton danger" disabled={action.enCours} onClick={() => void action.executer(() => api('POST', `/admin/organisation/${noeud.id}/desactivation`, { type: noeud.type, dateEffet })).then(r => r !== undefined && apres('Entité désactivée ; elle reste visible dans l\'historique.'))}>Désactiver</button>
        </div>
      </>}
    </Carte>
  );
}

function Creation({ type, parent, fermer, apres }: { type: 'DEPARTEMENT' | 'SERVICE' | 'FONCTION'; parent: Noeud | null; fermer: () => void; apres: (m: string) => void }) {
  const [d, setD] = useState({ code: '', libelle: '', dateEffet: aujourdhui() });
  const action = useAction();
  return (
    <Modale titre={`Nouveau ${TYPES[type].toLowerCase()}${parent ? ` dans « ${parent.libelle} »` : ''}`} fermer={fermer}>
      <div className="formulaire">
        <Champ libelle="Code" aide="Unique, jamais réutilisé"><input value={d.code} onChange={e => setD({ ...d, code: e.target.value.toUpperCase() })} /></Champ>
        <Champ libelle="Libellé"><input value={d.libelle} onChange={e => setD({ ...d, libelle: e.target.value })} /></Champ>
        <Champ libelle="Date d'effet"><input type="date" max={aujourdhui()} value={d.dateEffet} onChange={e => setD({ ...d, dateEffet: e.target.value })} /></Champ>
      </div>
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton" disabled={action.enCours || !d.code || !d.libelle}
        onClick={() => void action.executer(() => api('POST', '/admin/organisation', { type, ...d, parentId: parent?.id })).then(r => r && apres(`${TYPES[type]} créé.`))}>Créer</button>
        <button className="bouton secondaire" onClick={fermer}>Annuler</button></div>
    </Modale>
  );
}

function Restructuration({ operation, noeuds, fermer, apres }: { operation: Operation; noeuds: Noeud[]; fermer: () => void; apres: (m: string) => void }) {
  const actifs = noeuds.filter(n => n.statut === 'ACTIF');
  const [type, setType] = useState<'DEPARTEMENT' | 'SERVICE' | 'FONCTION'>(operation === 'DEPLACEMENT' ? 'SERVICE' : 'SERVICE');
  const [dateEffet, setDateEffet] = useState(aujourdhui());
  const [id, setId] = useState('');
  const [parentId, setParentId] = useState('');
  const [sources, setSources] = useState<string[]>([]);
  const [cibleId, setCibleId] = useState('');
  const [nouvelles, setNouvelles] = useState([{ code: '', libelle: '', enfants: [] as string[] }, { code: '', libelle: '', enfants: [] as string[] }]);
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const action = useAction();
  const deType = (t: string) => actifs.filter(n => n.type === t);
  const typeParent = type === 'FONCTION' ? 'SERVICE' : 'DEPARTEMENT';
  const source = actifs.find(n => n.id === id);
  const corps = () => operation === 'DEPLACEMENT' ? { operation, type, id, nouveauParentId: parentId, dateEffet }
    : operation === 'FUSION' ? { operation, type, sources, cibleId, dateEffet }
      : { operation, type, sourceId: id, dateEffet, nouvelles: nouvelles.map(n => ({ ...n, parentId: undefined })) };

  return (
    <Modale titre={{ DEPLACEMENT: 'Déplacer une entité', FUSION: 'Fusionner des entités', SCISSION: 'Scinder une entité' }[operation]} large fermer={fermer}>
      <div className="formulaire">
        <Champ libelle="Type d'entité"><select value={type} onChange={e => { setType(e.target.value as typeof type); setId(''); setSources([]); setSimulation(null); }}>
          {(operation === 'DEPLACEMENT' ? ['SERVICE', 'FONCTION'] : ['DEPARTEMENT', 'SERVICE']).map(t => <option key={t} value={t}>{TYPES[t as keyof typeof TYPES]}</option>)}
        </select></Champ>
        <Champ libelle="Date d'effet" aide="Peut être future"><input type="date" value={dateEffet} onChange={e => setDateEffet(e.target.value)} /></Champ>
        {operation === 'DEPLACEMENT' && <>
          <Champ libelle={`${TYPES[type]} à déplacer`}><select value={id} onChange={e => setId(e.target.value)}><option value="">—</option>{deType(type).map(n => <option key={n.id} value={n.id}>{n.libelle}</option>)}</select></Champ>
          <Champ libelle={`Nouveau ${TYPES[typeParent].toLowerCase()} de rattachement`}><select value={parentId} onChange={e => setParentId(e.target.value)}><option value="">—</option>{deType(typeParent).map(n => <option key={n.id} value={n.id}>{n.libelle}</option>)}</select></Champ>
        </>}
        {operation === 'FUSION' && <>
          <Champ libelle="Entités à fusionner" large>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>{deType(type).map(n => <label key={n.id}><input type="checkbox" checked={sources.includes(n.id)}
              onChange={e => setSources(e.target.checked ? [...sources, n.id] : sources.filter(s => s !== n.id))} /> {n.libelle}</label>)}</div>
          </Champ>
          <Champ libelle="Entité cible (conservée)"><select value={cibleId} onChange={e => setCibleId(e.target.value)}><option value="">—</option>{deType(type).filter(n => !sources.includes(n.id)).map(n => <option key={n.id} value={n.id}>{n.libelle}</option>)}</select></Champ>
        </>}
        {operation === 'SCISSION' && <>
          <Champ libelle={`${TYPES[type]} à scinder`}><select value={id} onChange={e => setId(e.target.value)}><option value="">—</option>{deType(type).map(n => <option key={n.id} value={n.id}>{n.libelle}</option>)}</select></Champ>
          {nouvelles.map((n, i) => <div key={i} className="champ large"><label>Nouvelle entité {i + 1}</label>
            <div className="formulaire" style={{ '--colonnes': 2 } as React.CSSProperties}>
              <input placeholder="Code" value={n.code} onChange={e => setNouvelles(nouvelles.map((x, j) => j === i ? { ...x, code: e.target.value.toUpperCase() } : x))} />
              <input placeholder="Libellé" value={n.libelle} onChange={e => setNouvelles(nouvelles.map((x, j) => j === i ? { ...x, libelle: e.target.value } : x))} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 6 }}>{source?.enfants.map(c => <label key={c.id}><input type="radio" name={`enfant-${c.id}`}
              checked={n.enfants.includes(c.id)} onChange={() => setNouvelles(nouvelles.map((x, j) => ({ ...x, enfants: j === i ? [...x.enfants.filter(e => e !== c.id), c.id] : x.enfants.filter(e => e !== c.id) })))} /> {c.libelle}</label>)}</div>
          </div>)}
        </>}
      </div>
      {simulation && <Message titre="Simulation"><span className="repere">4</span> {simulation.utilisateurs?.length ?? 0} utilisateur(s), {simulation.droits?.length ?? 0} habilitation(s) limitée(s) à l'entité et {simulation.taches?.length ?? 0} tâche(s) en cours seront transférés. Les anciennes entités passeront INACTIVES et resteront visibles dans l'historique.
        {simulation.utilisateurs?.length ? <div className="doux">Utilisateurs : {simulation.utilisateurs.map(u => u.identifiant).join(', ')}</div> : null}</Message>}
      <MessageErreur erreur={action.erreur} />
      <div className="boutons">
        <button className="bouton secondaire" disabled={action.enCours} onClick={() => void action.executer(() => api<Simulation>('POST', '/admin/organisation/simulation', corps())).then(s => s && setSimulation(s))}>Lancer la simulation</button>
        <button className="bouton" disabled={action.enCours || !simulation} onClick={() => void action.executer(() => api('POST', '/admin/organisation/restructurations', corps())).then(r => r && apres('Réorganisation soumise à la validation d\'un second administrateur ou de la Direction générale.'))}>Soumettre à validation</button>
        <button className="bouton secondaire" onClick={fermer}>Annuler</button><span className="repere">5</span>
      </div>
    </Modale>
  );
}
