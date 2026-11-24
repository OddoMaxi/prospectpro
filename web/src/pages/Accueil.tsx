/** CX-03 Page d'accueil : corbeilles de l'utilisateur et alertes, selon ses droits. */
import { Link } from 'react-router-dom';
import { date } from '../noyau/api';
import { Carte, Chargement, Message, MessageErreur, Page, Statut } from '../noyau/composants';
import { useDonnees } from '../noyau/donnees';
import { useSession } from '../noyau/session';

interface Accueil {
  corbeilles: { code: string; libelle: string; nombre: number; plusAncien: string | null; lien: string }[];
  alertes: { type: string; message: string; lien?: string }[];
}

export function PageAccueil() {
  const { moi } = useSession();
  const { donnees, erreur, chargement } = useDonnees<Accueil>('/accueil');
  const lien = (l: string) => l.replace('/reclamations', '/production/reclamations');
  return (
    <Page fil={['Accueil']} titre={`Bonjour ${moi?.prenoms?.split(' ')[0] ?? ''}`}>
      <MessageErreur erreur={erreur} />
      {chargement && <Chargement />}
      {donnees && <>
        <div className="grille quatre" style={{ marginBottom: 18 }}>
          {donnees.corbeilles.slice(0, 4).map(c => (
            <Link key={c.code} to={lien(c.lien)} className="indicateur" style={{ color: 'inherit', textDecoration: 'none' }}>
              <small>{c.libelle}</small><b>{c.nombre}</b><span>{c.plusAncien ? `plus ancien : ${date(c.plusAncien)}` : ' '}</span>
            </Link>
          ))}
        </div>
        <div className="grille deux">
          <Carte titre="Mes corbeilles" repere={1}>
            <table className="tableau"><thead><tr><th>Corbeille</th><th className="nombre">À traiter</th><th>Plus ancien</th></tr></thead>
              <tbody>{donnees.corbeilles.map(c => (
                <tr key={c.code}><td><Link to={lien(c.lien)}>{c.libelle}</Link></td><td className="nombre">{c.nombre}</td><td>{c.plusAncien ? date(c.plusAncien) : '—'}</td></tr>
              ))}</tbody></table>
          </Carte>
          <Carte titre="Notifications" repere={2}>
            {donnees.alertes.length === 0 && <div className="vide">Aucune notification.</div>}
            {donnees.alertes.length > 0 && <table className="tableau"><thead><tr><th>Type</th><th>Message</th></tr></thead>
              <tbody>{donnees.alertes.map((a, i) => (
                <tr key={i}><td><Statut valeur={a.type} /></td><td>{a.lien ? <Link to={a.lien}>{a.message}</Link> : a.message}</td></tr>
              ))}</tbody></table>}
          </Carte>
        </div>
        <Message>Le menu ne présente que les fonctions de vos départements. Une fonction absente signifie que vous n'y avez pas accès <span className="repere">3</span></Message>
      </>}
    </Page>
  );
}
