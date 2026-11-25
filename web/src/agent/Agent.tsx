/**
 * Application agent, version web (maquettes AG-01 à AG-21) : conçue pour le téléphone, utilisable sur ordinateur.
 * Onglets du bas comme la maquette ; l'application mobile installable (Flutter) viendra en fin de projet.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Chargement, Message, MessageErreur } from '../noyau/composants';
import { useDonnees } from '../noyau/donnees';
import { useSession } from '../noyau/session';
import { PageAccueilAgent } from './Accueil';
import { PageCompteAgent } from './Compte';
import { PageDossiersAgent } from './Dossiers';
import { PageSouscription } from './Souscription';
import { PageProfilAgent, PageFacturesAgent, PageReseauAgent } from './Profil';
import { PageRenouvelerAgent } from './Renouveler';
import { PageCarteAgent, PageEspacePrescripteur, PageMouvementsAgent, PageProspects } from './Reseau';

export interface Bureau { id: string; code: string; nom: string; compte_id: string | null; solde: number | null; seuil_alerte: number | null; compte_statut: string | null; motif_gel: string | null }
export interface AccueilAgent {
  intervenant: { id: string; role: string; statut: string; emissionActivee: boolean; prospectionSeule: boolean; nom: string; prenoms: string | null; tiersId: string; agent: string };
  bureaux: Bureau[]; policesActives: number;
  echeances: { id: string; numero: string; statut: string; souscripteur: string; echeance: string; versements: number; derniere_prime: number; ne_pas_renouveler: boolean; bureau: string }[];
  reseau: { dossiersAValider: number; mesDossiersEnCours: number; commissionsDues: number; tauxRenouvellement: number | null };
}

const Ctx = createContext<{ accueil: AccueilAgent; recharger: () => Promise<void> } | null>(null);
export function useAgent() {
  const c = useContext(Ctx);
  if (!c) throw new Error('Hors application agent');
  return c;
}
export const estAgentGeneral = (a: AccueilAgent) => a.intervenant.role === 'AGENT_GENERAL';
export const ROLES_RESEAU = ['AGENT_GENERAL', 'COLLABORATEUR', 'JUNIOR', 'PRESCRIPTEUR'];

/** En-tête d'écran : titre, retour éventuel, action à droite. */
export function Entete({ titre, sousTitre, retour, action }: { titre: ReactNode; sousTitre?: ReactNode; retour?: string; action?: ReactNode }) {
  const aller = useNavigate();
  return (
    <header className="ag-entete">
      {retour !== undefined && <button className="ag-retour" aria-label="Retour" onClick={() => (retour ? aller(retour) : aller(-1))}>‹</button>}
      <div className="ag-titre"><h1>{titre}</h1>{sousTitre && <small>{sousTitre}</small>}</div>
      {action}
    </header>
  );
}

const ONGLETS = [
  { chemin: '/agent', libelle: 'Accueil', fin: true, icone: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z' },
  { chemin: '/agent/prospects', libelle: 'Prospects', icone: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 8v6M14 11h6' },
  { chemin: '/agent/souscrire', libelle: 'Souscrire', icone: 'M12 5v14M5 12h14' },
  { chemin: '/agent/compte', libelle: 'Compte', icone: 'M3 7h18v12H3zM3 11h18M7 15h4' },
  { chemin: '/agent/profil', libelle: 'Profil', icone: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0' },
];

export function ApplicationAgent() {
  const { moi } = useSession();
  const a = useDonnees<AccueilAgent>('/agent/accueil');
  const prescripteur = a.donnees?.intervenant.role === 'PRESCRIPTEUR';
  // Le prescripteur n'émet ni n'encaisse (COM-RG-064) : accueil, factures, carte et profil seulement
  const onglets = prescripteur ? ONGLETS.filter(o => ['/agent', '/agent/profil'].includes(o.chemin)) : ONGLETS;
  if (!moi) return <Navigate to="/connexion" replace />;
  if (a.erreur) return <div className="ag-app"><main className="ag-contenu"><Entete titre="Prospect Pro" /><MessageErreur erreur={a.erreur} />
    <Message>Cet espace est réservé aux intervenants du réseau commercial. <Link to="/">Retour au back-office</Link></Message></main></div>;
  if (!a.donnees) return <div className="ag-app"><main className="ag-contenu"><Chargement /></main></div>;
  return (
    <Ctx.Provider value={{ accueil: a.donnees, recharger: a.recharger }}>
      <div className="ag-app">
        <main className="ag-contenu">
          <Routes>
            <Route index element={prescripteur ? <PageEspacePrescripteur /> : <PageAccueilAgent />} />
            <Route path="prospects" element={<PageProspects />} />
            <Route path="carte" element={<PageCarteAgent />} />
            <Route path="mouvements" element={<PageMouvementsAgent />} />
            <Route path="dossiers" element={<PageDossiersAgent />} />
            <Route path="souscrire" element={<PageSouscription />} />
            <Route path="souscrire/:id" element={<PageSouscription />} />
            <Route path="compte" element={<PageCompteAgent />} />
            <Route path="compte/:bureau" element={<PageCompteAgent />} />
            <Route path="renouveler/:id" element={<PageRenouvelerAgent />} />
            <Route path="profil" element={<PageProfilAgent />} />
            <Route path="factures" element={<PageFacturesAgent />} />
            <Route path="reseau" element={<PageReseauAgent />} />
            <Route path="*" element={<Navigate to="/agent" replace />} />
          </Routes>
        </main>
        <nav className="ag-onglets" aria-label="Navigation" style={{ gridTemplateColumns: `repeat(${onglets.length}, 1fr)` }}>
          {onglets.map(o => <NavLink key={o.chemin} to={o.chemin} end={o.fin} className={({ isActive }) => (isActive ? 'actif' : '')}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={o.icone} /></svg>{o.libelle}</NavLink>)}
        </nav>
      </div>
    </Ctx.Provider>
  );
}
