/** Impayés et mises en demeure (PR-06 ; PROD-RG-028, article 30) ; alertes de conformité (COM-RG-084). */
import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, date, dateHeure, montant, ouvrirFichier } from '../../noyau/api';
import { Carte, Champ, Chargement, Indicateur, Message, MessageErreur, Modale, Page, Statut, useAvis } from '../../noyau/composants';
import { useAction, useDonnees } from '../../noyau/donnees';
import { useSession } from '../../noyau/session';

interface Impaye {
  id: string; numero: string; police_id: string; police: string; statut_police: string; souscripteur: string; telephone: string | null; prime_totale: number; echeance: string; bureau: string;
  relance_le: string | null; mise_id: string | null; mise_statut: string | null; envoyee_le: string | null; suspension_le: string | null; resiliation_possible_le: string | null;
  lettre_document_id: string | null; miseEnDemeurePrevueLe: string; resiliable: boolean;
}

function etape(i: Impaye): [string, string] {
  if (i.statut_police === 'SUSPENDUE') return i.resiliable ? ['Résiliable', 'rouge'] : ['Suspendue', 'rouge'];
  if (i.mise_statut === 'EN_COURS') return ['Mise en demeure envoyée', 'orange'];
  if (i.mise_statut === 'A_VALIDER') return ['Lettre à valider', 'violet'];
  if (i.relance_le) return ['Relancé', 'bleu'];
  return ['Échu', 'gris'];
}

export function PageImpayes() {
  const { peut } = useSession();
  const l = useDonnees<Impaye[]>('/impayes');
  const [choisi, setChoisi] = useState<Impaye | null>(null);
  const action = useAction();
  const { avis, Avis } = useAvis();
  const liste = l.donnees ?? [];
  return (
    <Page fil={['Production', 'Impayés']} titre="Impayés et mises en demeure" actions={peut('AVENANT:VALIDER') && <button className="bouton secondaire" disabled={action.enCours}
      onClick={() => void action.executer(() => api<{ relances: number; misesEnDemeure: number; suspensions: number; reprises: number }>('POST', '/impayes/traitement'))
        .then(r => { if (r) { avis(`${r.relances} relance(s), ${r.misesEnDemeure} lettre(s) générée(s), ${r.suspensions} suspension(s), ${r.reprises} reprise(s).`); void l.recharger(); } })}>Lancer le traitement du jour</button>}>
      <div className="grille quatre">
        <Indicateur libelle="Primes impayées" valeur={liste.length} detail={`${montant(liste.reduce((s, x) => s + x.prime_totale, 0))} GNF`} />
        <Indicateur libelle="Lettres à valider" valeur={liste.filter(x => x.mise_statut === 'A_VALIDER').length} couleur="orange" />
        <Indicateur libelle="Polices suspendues" valeur={liste.filter(x => x.statut_police === 'SUSPENDUE').length} couleur="rouge" detail="cartes bloquées" />
        <Indicateur libelle="Résiliables" valeur={liste.filter(x => x.resiliable).length} detail="délais légaux écoulés" />
      </div>
      <MessageErreur erreur={action.erreur} />
      <Carte titre="Quittances à terme légal impayées">
        {l.chargement ? <Chargement /> : !liste.length ? <div className="vide">Aucune prime impayée.</div> :
          <table className="tableau"><thead><tr><th>Quittance</th><th>Police</th><th>Souscripteur</th><th className="nombre">Montant</th><th>Échéance</th><th>Relance</th><th>Mise en demeure</th><th>Suspension</th><th>Étape</th><th /></tr></thead>
            <tbody>{liste.map(i => { const [e, c] = etape(i); return <tr key={i.id}>
              <td className="code">{i.numero}</td><td className="code"><Link to={`/production/polices/${i.police_id}`}>{i.police}</Link></td><td>{i.souscripteur}</td><td className="nombre">{montant(i.prime_totale)}</td>
              <td>{date(i.echeance)}</td><td>{i.relance_le ? dateHeure(i.relance_le) : '—'}</td>
              <td>{i.envoyee_le && i.mise_statut === 'EN_COURS' ? `envoyée le ${date(i.envoyee_le)}` : i.mise_statut === 'A_VALIDER' ? 'à valider' : `prévue le ${date(i.miseEnDemeurePrevueLe)}`}</td>
              <td>{i.suspension_le ? date(i.suspension_le) : '—'}</td><td><Statut couleur={c}>{e}</Statut></td>
              <td>{i.mise_id && <button className="lien" onClick={() => setChoisi(i)}>{i.mise_statut === 'A_VALIDER' ? 'Valider l\'envoi' : 'Calendrier'}</button>}</td>
            </tr>; })}</tbody></table>}
      </Carte>
      <Message>Délais de l'article 30, non réductibles : relance à l'échéance, mise en demeure à J+10 (lettre recommandée, seul courrier papier du système), suspension 30 jours après l'envoi, résiliation possible 10 jours plus tard sur décision validée. Le paiement des sommes dues lève la suspension le lendemain à midi ; les soins reçus pendant la suspension ne sont pas couverts.</Message>
      {choisi && <MiseEnDemeure i={choisi} fermer={() => setChoisi(null)} apres={m => { setChoisi(null); avis(m); void l.recharger(); }} />}
      <Avis />
    </Page>
  );
}

function MiseEnDemeure({ i, fermer, apres }: { i: Impaye; fermer: () => void; apres: (m: string) => void }) {
  const { peut } = useSession();
  const [envoi, setEnvoi] = useState(new Date().toISOString().slice(0, 10));
  const [justification, setJustification] = useState('');
  const action = useAction();
  const avalider = i.mise_statut === 'A_VALIDER';
  const jalons: [string | null, string, string][] = [
    [i.echeance, 'Échéance et relance automatique', 'bleu'],
    [avalider ? envoi : i.envoyee_le, `${avalider ? 'Envoi prévu' : 'Envoi'} de la mise en demeure (au plus tôt J+10)`, 'orange'],
    [i.suspension_le, 'Police SUSPENDUE (30 jours après l\'envoi, jour d\'envoi exclu)', 'rouge'],
    [i.resiliation_possible_le, 'Résiliation possible sur décision validée', 'rouge'],
  ];
  return (
    <Modale titre={avalider ? 'Mise en demeure à valider' : `Mise en demeure – police ${i.police}`} large fermer={fermer}>
      <div className="grille cote">
        <Carte titre="Lettre générée">
          <p>Mention expresse de mise en demeure, {i.souscripteur}, police {i.police}, montant {montant(i.prime_totale)} GNF, échéance du {date(i.echeance)}, reproduction de l'article 30.</p>
          {i.lettre_document_id && <button className="bouton secondaire" onClick={() => void ouvrirFichier('GET', `/documents/${i.lettre_document_id}/fichier`)}>Ouvrir la lettre (PDF)</button>}
          <p className="doux">Envoi recommandé avec accusé de réception (papier tant que l'envoi électronique n'est pas admis).</p>
        </Carte>
        <Carte titre="Calendrier calculé">
          <ul className="jalons">{jalons.map(([d, l, c]) => <li key={l}><Statut couleur={c}>{d ? date(d) : 'à l\'envoi'}</Statut> {l}</li>)}</ul>
          {avalider && <p className="doux">Les dates de suspension et de résiliation sont recalculées à partir de la date d'envoi validée ; un dernier jour férié reporte l'échéance au jour ouvré suivant.</p>}
        </Carte>
      </div>
      <MessageErreur erreur={action.erreur} />
      {avalider && peut('AVENANT:VALIDER') && <div className="filtres">
        <Champ libelle="Date d'envoi recommandé"><input type="date" value={envoi} onChange={e => setEnvoi(e.target.value)} /></Champ>
        <button className="bouton" disabled={action.enCours} onClick={() => void action.executer(() => api<{ suspension: string; resiliation: string }>('POST', `/mises-en-demeure/${i.mise_id}/envoi`, { dateEnvoi: envoi }))
          .then(r => r && apres(`Envoi validé : suspension le ${date(r.suspension)}, résiliation possible le ${date(r.resiliation)}.`))}>Valider l'envoi</button>
      </div>}
      {i.resiliable && peut('AVENANT:CREER') && <>
        <h3>Résiliation pour non-paiement</h3>
        <div className="filtres"><input style={{ minWidth: 360 }} value={justification} onChange={e => setJustification(e.target.value)} placeholder="Motif de la décision" />
          <button className="bouton danger" disabled={!justification.trim() || action.enCours}
            onClick={() => void action.executer(() => api('POST', `/polices/${i.police_id}/resiliation`, { motif: 'NON_PAIEMENT', justification }))
              .then(r => r && apres('Résiliation pour non-paiement soumise à la gestion production puis à la DAF.'))}>Proposer la résiliation</button></div>
      </>}
    </Modale>
  );
}

// ---------------------------------------------------------------- alertes de conformité

interface Alerte { id: string; type: string; objet_type: string; gravite: string; statut: string; description: string; donnees: Record<string, unknown> | null; decision: string | null; cree_le: string; modifie_le: string | null; traite_par: string | null }
const TYPES: Record<string, string> = { CONCENTRATION_CODE_PRESCRIPTEUR: 'Concentration sur un code prescripteur' };
const GRAVITES: Record<string, string> = { FORTE: 'rouge', MOYENNE: 'orange', FAIBLE: 'gris' };
const STATUTS_ALERTE: Record<string, [string, string]> = { OUVERTE: ['Ouverte', 'rouge'], EN_EXAMEN: ['En examen', 'orange'], CLOSE: ['Close', 'gris'] };

export function PageAlertesConformite() {
  const { peut } = useSession();
  const [filtre, setFiltre] = useState('ACTIVES');
  const l = useDonnees<Alerte[]>(`/conformite/alertes${filtre ? `?statut=${filtre}` : ''}`);
  const [choisie, setChoisie] = useState<Alerte | null>(null);
  const action = useAction();
  const { avis, Avis } = useAvis();
  return (
    <Page fil={['Conformité', 'Alertes']} titre="Alertes de conformité">
      <div className="filtres"><select value={filtre} onChange={e => setFiltre(e.target.value)}><option value="ACTIVES">À traiter</option><option value="CLOSE">Closes</option><option value="">Toutes</option></select></div>
      <MessageErreur erreur={action.erreur} />
      <Carte titre="Alertes">
        {l.chargement ? <Chargement /> : !l.donnees?.length ? <div className="vide">Aucune alerte.</div> :
          <table className="tableau"><thead><tr><th>Date</th><th>Règle</th><th>Motif</th><th>Gravité</th><th>Statut</th><th>Décision</th><th /></tr></thead>
            <tbody>{l.donnees.map(a => <tr key={a.id}><td>{dateHeure(a.cree_le)}</td><td>{TYPES[a.type] ?? a.type}</td><td>{a.description}</td>
              <td><Statut couleur={GRAVITES[a.gravite]}>{a.gravite.toLowerCase()}</Statut></td><td><Statut couleur={STATUTS_ALERTE[a.statut]?.[1]}>{STATUTS_ALERTE[a.statut]?.[0]}</Statut></td>
              <td>{a.decision ? <>{a.decision}<br /><small className="doux">{a.traite_par}</small></> : '—'}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{a.statut !== 'CLOSE' && peut('ALERTES_CONFORMITE:MODIFIER') && <>
                {a.statut === 'OUVERTE' && <><button className="lien" onClick={() => void action.executer(() => api('POST', `/conformite/alertes/${a.id}`, { statut: 'EN_EXAMEN' })).then(r => { if (r !== undefined) void l.recharger(); })}>Examiner</button>{' · '}</>}
                <button className="lien" onClick={() => setChoisie(a)}>Clore</button></>}</td></tr>)}</tbody></table>}
      </Carte>
      <Message>Une seule alerte reste ouverte par règle et par objet : une nouvelle occurrence la complète et peut en relever la gravité. La clôture porte une décision motivée, conservée au journal d'audit.</Message>
      {choisie && <Cloture a={choisie} fermer={() => setChoisie(null)} apres={() => { setChoisie(null); avis('Alerte close.'); void l.recharger(); }} />}
      <Avis />
    </Page>
  );
}

function Cloture({ a, fermer, apres }: { a: Alerte; fermer: () => void; apres: () => void }) {
  const [decision, setDecision] = useState('');
  const action = useAction();
  const bureaux = (a.donnees?.bureaux ?? {}) as Record<string, number>;
  return (
    <Modale titre="Clore l'alerte" fermer={fermer}>
      <p>{a.description}</p>
      {!!Object.keys(bureaux).length && <dl className="details">{Object.entries(bureaux).map(([b, n]) => <Fragment key={b}><dt>Bureau {b}</dt><dd>{n} police(s)</dd></Fragment>)}</dl>}
      <div className="formulaire"><Champ libelle="Décision" large><textarea value={decision} onChange={e => setDecision(e.target.value)} placeholder="Constat, mesures prises (suspension du code, signalement…)" /></Champ></div>
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton" disabled={!decision.trim() || action.enCours}
        onClick={() => void action.executer(() => api('POST', `/conformite/alertes/${a.id}`, { statut: 'CLOSE', decision })).then(r => r !== undefined && apres())}>Clore</button></div>
    </Modale>
  );
}
