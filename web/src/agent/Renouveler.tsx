/** AG-17 Renouveler une police au bureau (PROD-RG-020 à 024) : prime recalculée, même numéro, débit du compte de production. */
import { Fragment, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, date, montant } from '../noyau/api';
import { Chargement, Message, MessageErreur } from '../noyau/composants';
import { useAction, useDonnees } from '../noyau/donnees';
import { Entete, estAgentGeneral, useAgent } from './Agent';

interface Apercu { echeance: string; dateDebut: string; tarif: { primeNette: number; accessoires: number; primeTotale: number; taxes: { libelle: string; montant: number }[] }; versements: number; statut: string; nePasRenouveler: boolean }

export function PageRenouvelerAgent() {
  const { id } = useParams();
  const { accueil, recharger } = useAgent();
  const aller = useNavigate();
  const e = accueil.echeances.find(x => x.id === id);
  const r = useDonnees<Apercu>(`/polices/${id}/renouvellement`);
  const [fait, setFait] = useState<string | null>(null);
  const action = useAction();
  const bureau = accueil.bureaux.find(b => b.code === e?.bureau) ?? accueil.bureaux[0];
  if (!r.donnees) return <><Entete titre="Renouveler" retour="/agent" />{r.erreur ? <MessageErreur erreur={r.erreur} /> : <Chargement />}</>;
  const x = r.donnees;
  const versementsComplets = Number(x.versements) >= x.tarif.primeTotale;
  const renouveler = () => void action.executer(() => api<{ numeroQuittance?: string; quittance?: string }>('POST', `/polices/${id}/renouvellement`, { type: versementsComplets ? 'VERSEMENTS' : 'COMPTE_PRODUCTION' }))
    .then(async y => { if (y) { setFait(y.quittance ?? y.numeroQuittance ?? ''); await recharger(); } });
  const insuffisant = action.erreur?.code === 'SOLDE_INSUFFISANT' ? (action.erreur.details as { manque: number }) : null;
  return (
    <>
      <Entete titre="Renouveler" sousTitre={e ? `${e.souscripteur} · police ${e.numero}` : undefined} retour="/agent" />
      {fait !== null ? <section className="ag-carte ag-succes"><h2>Police renouvelée</h2><p>Même numéro de police, nouvelle période à partir du {date(x.dateDebut)}{fait ? ` ; quittance ${fait}` : ''}.</p>
        <button className="bouton large" onClick={() => aller('/agent')}>Retour à l'accueil</button></section> : <>
        <section className="ag-carte">
          <h2>Prime de la nouvelle période <span className="repere">1</span></h2>
          <dl className="ag-details"><dt>Échéance</dt><dd>{date(x.echeance)}</dd><dt>Nouvelle période</dt><dd>à partir du {date(x.dateDebut)}</dd>
            <dt>Prime nette</dt><dd>{montant(x.tarif.primeNette)}</dd><dt>Accessoires</dt><dd>{montant(x.tarif.accessoires)}</dd>
            {x.tarif.taxes.map(t => <Fragment key={t.libelle}><dt>{t.libelle}</dt><dd>{montant(t.montant)}</dd></Fragment>)}
            <dt><b>Prime totale</b></dt><dd><b>{montant(x.tarif.primeTotale)} GNF</b></dd>
            {Number(x.versements) > 0 && <><dt>Versements programmés</dt><dd>{montant(x.versements)} GNF</dd></>}</dl>
          <p className="doux">Recalculée au tarif et à l'âge en vigueur ; le renouvellement conserve le numéro de police <span className="repere">2</span>.</p>
        </section>
        {x.nePasRenouveler && <Message type="attention">Le client a demandé le non-renouvellement.</Message>}
        {!estAgentGeneral(accueil) ? <Message>Le renouvellement au bureau est fait par votre agent général.</Message> : <>
          {insuffisant ? <section className="ag-carte ag-refus"><h2>Solde insuffisant</h2><p>Il manque <b>{montant(insuffisant.manque)} GNF</b> sur le compte du bureau {bureau?.code}.</p>
            <Link className="bouton large" to={`/agent/compte/${bureau?.code ?? ''}`}>Approvisionner le compte</Link></section> : <MessageErreur erreur={action.erreur} />}
          <button className="bouton large" disabled={action.enCours || x.nePasRenouveler} onClick={renouveler}>
            {versementsComplets ? 'Renouveler avec les versements programmés' : `Renouveler · débit de ${montant(x.tarif.primeTotale)} GNF`}</button>
          <p className="doux">Une action suffit ; le compte de production du bureau est débité <span className="repere">3</span>.</p>
        </>}
      </>}
    </>
  );
}
