/** AG-02 Accueil : tableau de bord du portefeuille (COM-RG-110, COM-RG-024). */
import { Link } from 'react-router-dom';
import { date, montant } from '../noyau/api';
import { Message } from '../noyau/composants';
import { Entete, estAgentGeneral, useAgent } from './Agent';

export function PageAccueilAgent() {
  const { accueil: a } = useAgent();
  const i = a.intervenant;
  const ag = estAgentGeneral(a);
  const sousSeuil = a.bureaux.filter(b => b.seuil_alerte !== null && Number(b.solde) < Number(b.seuil_alerte));
  return (
    <>
      <Entete titre={`Bonjour ${i.prenoms ?? i.nom}`} sousTitre={`${ag ? i.nom : `${i.role === 'JUNIOR' ? 'Junior' : 'Collaborateur'} · ${i.agent}`}${a.bureaux.length ? ` · Bureau ${a.bureaux.map(b => `${b.code} ${b.nom}`).join(', ')}` : ''}`} />
      {i.prospectionSeule && <Message type="attention">Vos contrôles de conformité ne sont pas encore validés : vous travaillez en prospection seule.</Message>}
      {ag && !i.emissionActivee && <Message type="attention">L'émission n'est pas encore activée sur votre compte : contactez la Direction commerciale.</Message>}
      <div className="ag-grille">
        {a.bureaux.map(b => <Link key={b.id} to={`/agent/compte/${b.code}`} className="ag-tuile">
          <small>Compte de production<br />bureau {b.code}</small>
          <b className={b.seuil_alerte !== null && Number(b.solde) < Number(b.seuil_alerte) ? 'orange' : ''}>{montant(b.solde ?? 0)}</b><span>GNF{b.compte_statut === 'GELE' ? ' · gelé' : ''}</span></Link>)}
        <div className="ag-tuile"><small>Polices actives</small><b>{a.policesActives}</b></div>
      </div>
      {sousSeuil.map(b => <Message key={b.id} type="attention">Bureau {b.code} : solde sous votre seuil ({montant(b.seuil_alerte)} GNF). <Link to={`/agent/compte/${b.code}`}>Approvisionner</Link> <span className="repere">1</span></Message>)}
      <section className="ag-carte">
        <h2>Échéances à 30 jours <span className="repere">2</span></h2>
        {!a.echeances.length ? <p className="doux">Aucune échéance dans les 30 prochains jours.</p> : a.echeances.map(e => (
          <Link key={e.id} to={`/agent/renouveler/${e.id}`} className="ag-ligne">
            <div><b>{e.souscripteur}</b><small>{e.numero} · échéance {date(e.echeance)}</small></div>
            {Number(e.versements) > 0 ? <span className="statut gris">Versements {Math.round(100 * Number(e.versements) / Number(e.derniere_prime))} %</span>
              : e.statut === 'ECHUE' ? <span className="statut orange">Échue</span> : <span className="montant">{montant(e.derniere_prime)}</span>}
          </Link>))}
      </section>
      <section className="ag-carte">
        <h2>{ag ? 'Mon réseau' : 'Mon activité'} <span className="repere">3</span></h2>
        <dl className="ag-details">
          {ag && <><dt>Dossiers juniors à valider</dt><dd><Link to="/agent/dossiers">{a.reseau.dossiersAValider}</Link></dd></>}
          <dt>Mes dossiers en cours</dt><dd><Link to="/agent/dossiers">{a.reseau.mesDossiersEnCours}</Link></dd>
          <dt>Taux de renouvellement {new Date().getFullYear()}</dt><dd>{a.reseau.tauxRenouvellement === null ? '—' : `${a.reseau.tauxRenouvellement} %`}</dd>
          <dt>Commissions dues</dt><dd><Link to="/agent/factures">{montant(a.reseau.commissionsDues)} GNF</Link></dd>
        </dl>
      </section>
    </>
  );
}
