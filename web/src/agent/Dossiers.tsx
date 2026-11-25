/** Dossiers de souscription du bureau : à valider (AG-14, juniors), en cours, émis, rejetés. */
import { Link } from 'react-router-dom';
import { date, montant } from '../noyau/api';
import { Chargement, Message } from '../noyau/composants';
import { useDonnees } from '../noyau/donnees';
import { Entete, estAgentGeneral, useAgent } from './Agent';

interface Ligne { id: string; numero_dossier: string; canal: string; statut: string; etape_courante: number; prime_totale: number | null; expire_le: string; cree_le: string; motif_rejet: string | null; bureau: string; souscripteur: string; produit: string; formule: string; prepare_par: string; police: string | null }

export function PageDossiersAgent() {
  const { accueil } = useAgent();
  const l = useDonnees<Ligne[]>('/dossiers');
  const ag = estAgentGeneral(accueil);
  const groupes: [string, Ligne[], string?][] = [
    [ag ? 'Dossiers des juniors à valider' : 'Soumis à mon agent général', (l.donnees ?? []).filter(d => d.statut === 'A_VALIDER'), ag ? 'Contrôlez les assurés, les pièces et l\'acceptation du client, puis émettez sur le compte de production du bureau ou rejetez avec un motif.' : undefined],
    ['En cours', (l.donnees ?? []).filter(d => d.statut === 'BROUILLON')],
    ['Rejetés', (l.donnees ?? []).filter(d => d.statut === 'REJETE')],
    ['Émis récemment', (l.donnees ?? []).filter(d => d.statut === 'EMIS').slice(0, 15)],
  ];
  return (
    <>
      <Entete titre="Dossiers" action={<Link className="bouton petit" to="/agent/souscrire">+ Nouveau</Link>} />
      {l.chargement ? <Chargement /> : groupes.map(([titre, liste, aide]) => liste.length > 0 && <section key={titre} className="ag-carte">
        <h2>{titre} ({liste.length})</h2>
        {aide && <p className="doux">{aide}</p>}
        {liste.map(d => <Link key={d.id} to={`/agent/souscrire/${d.id}`} className="ag-ligne">
          <div><b>{d.souscripteur}</b><small>{d.numero_dossier} · {d.produit} {d.formule}{d.canal === 'JUNIOR' ? ` · préparé par ${d.prepare_par}` : ''}</small>
            <small>{d.statut === 'EMIS' ? `Police ${d.police}` : d.statut === 'REJETE' ? `Rejeté : ${d.motif_rejet ?? ''}` : `Étape ${Math.min(d.etape_courante + 1, 8)}/8 · expire le ${date(d.expire_le)}`}</small></div>
          {d.prime_totale !== null && <span className="montant">{montant(d.prime_totale)}</span>}
        </Link>)}
      </section>)}
      {!l.chargement && !(l.donnees ?? []).length && <Message>Aucun dossier. <Link to="/agent/souscrire">Commencer une souscription</Link></Message>}
    </>
  );
}
