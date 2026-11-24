/** Mise en page du back-office (maquette CX-03) : menu par département à gauche, recherche et utilisateur en haut. */
import { useState, type FormEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { MENU } from './menu';
import { useSession } from './session';

export function Coquille() {
  const { moi, peut, fermer } = useSession();
  const lieu = useLocation();
  const aller = useNavigate();
  const rubriques = MENU.map(r => ({ ...r, entrees: r.entrees.filter(e => peut(e.droit)) })).filter(r => r.entrees.length);
  const courante = rubriques.find(r => r.entrees.some(e => lieu.pathname.startsWith(e.chemin)))?.rubrique;
  const [ouvertes, setOuvertes] = useState<Set<string>>(new Set(courante ? [courante] : []));
  const [recherche, setRecherche] = useState('');
  const basculer = (r: string) => setOuvertes(o => { const n = new Set(o); if (n.has(r)) n.delete(r); else n.add(r); return n; });
  const chercher = (e: FormEvent) => { e.preventDefault(); if (recherche.trim().length >= 2) aller(`/referentiels/tiers?recherche=${encodeURIComponent(recherche.trim())}`); };
  const initiales = `${moi?.prenoms?.[0] ?? ''}${moi?.nom?.[0] ?? ''}`.toUpperCase();

  return (
    <div className="coquille">
      <aside className="menu">
        <div className="marque"><b>Prospect Pro</b><span>Back-office</span></div>
        <nav aria-label="Menu principal">
          <NavLink to="/" end className={({ isActive }) => `entree racine${isActive ? ' active' : ''}`}>Accueil</NavLink>
          <NavLink to="/validations" className={({ isActive }) => `entree racine${isActive ? ' active' : ''}`}>Validations</NavLink>
          {rubriques.map(r => (
            <div key={r.rubrique}>
              <button className={`rubrique${ouvertes.has(r.rubrique) || courante === r.rubrique ? ' ouverte' : ''}`} onClick={() => basculer(r.rubrique)} aria-expanded={ouvertes.has(r.rubrique)}>
                {r.rubrique}<span className="fleche">{ouvertes.has(r.rubrique) || courante === r.rubrique ? '▼' : '▶'}</span>
              </button>
              {(ouvertes.has(r.rubrique) || courante === r.rubrique) && r.entrees.map(e => (
                <NavLink key={e.chemin} to={e.chemin} className={({ isActive }) => `entree${isActive ? ' active' : ''}`}>{e.libelle}</NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="pied">Le menu ne présente que les fonctions de vos départements.</div>
      </aside>
      <div className="principal">
        <header className="barre">
          <form className="recherche" onSubmit={chercher} role="search">
            <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Rechercher un client (nom, téléphone, code tiers)…" aria-label="Rechercher" />
          </form>
          <div className="espace" />
          <div className="utilisateur">
            <div className="avatar">{initiales}</div>
            <div><b>{moi?.prenoms} {moi?.nom}</b><small>{moi?.fonction ?? moi?.identifiant}</small></div>
            <button className="bouton secondaire petit" onClick={() => void fermer().then(() => aller('/connexion'))}>Se déconnecter</button>
          </div>
        </header>
        <main className="contenu"><Outlet /></main>
      </div>
    </div>
  );
}
