/** Routes du back-office ; toute page hors connexion exige une session ouverte. */
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Coquille } from './noyau/Coquille';
import { Chargement, Message, Page } from './noyau/composants';
import { useSession } from './noyau/session';
import { Connexion } from './pages/Connexion';
import { PageAccueil } from './pages/Accueil';
import { PageValidations } from './pages/Validations';
import { PageCompagnie } from './pages/administration/Compagnie';
import { PageOrganigramme } from './pages/administration/Organigramme';
import { PageUtilisateurs } from './pages/administration/Utilisateurs';
import { PageProfils } from './pages/administration/Profils';
import { PageDelegations } from './pages/administration/Delegations';
import { PageParametres } from './pages/administration/Parametres';
import { PageAudit } from './pages/administration/Audit';
import { PageExploitation } from './pages/administration/Exploitation';
import { PageNouveauTiers, PageTiers } from './pages/referentiels/Tiers';
import { PageFicheTiers } from './pages/referentiels/FicheTiers';
import { PageBureaux, PageModeles, PageNomenclatures, PagePlanComptes } from './pages/referentiels/Divers';
import { PageCatalogue } from './pages/production/Catalogue';
import { PageReclamations } from './pages/production/Reclamations';

function Protege({ droit, children }: { droit?: string; children: JSX.Element }) {
  const { peut } = useSession();
  if (droit && !peut(droit)) return <Page titre="Accès refusé"><Message type="erreur">Cette fonction ne fait pas partie de vos droits.</Message></Page>;
  return children;
}

export function App() {
  const { moi, pret } = useSession();
  const lieu = useLocation();
  if (!pret) return <div className="contenu"><Chargement /></div>;
  return (
    <Routes>
      <Route path="/connexion" element={<Connexion />} />
      <Route element={moi ? <Coquille /> : <Navigate to="/connexion" replace state={{ depuis: lieu.pathname }} />}>
        <Route index element={<PageAccueil />} />
        <Route path="validations" element={<PageValidations />} />
        <Route path="administration/compagnie" element={<Protege droit="SOCIETE:CONSULTER"><PageCompagnie /></Protege>} />
        <Route path="administration/organigramme" element={<Protege droit="ORGANISATION:CONSULTER"><PageOrganigramme /></Protege>} />
        <Route path="administration/utilisateurs" element={<Protege droit="UTILISATEURS:CONSULTER"><PageUtilisateurs /></Protege>} />
        <Route path="administration/profils" element={<Protege droit="UTILISATEURS:CONSULTER"><PageProfils /></Protege>} />
        <Route path="administration/delegations" element={<Protege droit="DELEGATIONS:CONSULTER"><PageDelegations /></Protege>} />
        <Route path="administration/parametres" element={<Protege droit="PARAMETRES:CONSULTER"><PageParametres /></Protege>} />
        <Route path="administration/audit" element={<Protege droit="AUDIT:CONSULTER"><PageAudit /></Protege>} />
        <Route path="administration/exploitation" element={<Protege droit="AUDIT:CONSULTER"><PageExploitation /></Protege>} />
        <Route path="referentiels/tiers" element={<Protege droit="TIERS:CONSULTER"><PageTiers /></Protege>} />
        <Route path="referentiels/tiers/nouveau" element={<Protege droit="TIERS:CREER"><PageNouveauTiers /></Protege>} />
        <Route path="referentiels/tiers/:id" element={<Protege droit="TIERS:CONSULTER"><PageFicheTiers /></Protege>} />
        <Route path="referentiels/nomenclatures" element={<Protege droit="NOMENCLATURES:CONSULTER"><PageNomenclatures /></Protege>} />
        <Route path="referentiels/modeles" element={<Protege droit="MODELES:CONSULTER"><PageModeles /></Protege>} />
        <Route path="commercial/bureaux" element={<Protege droit="BUREAUX:CONSULTER"><PageBureaux /></Protege>} />
        <Route path="production/catalogue" element={<Protege droit="CATALOGUE:CONSULTER"><PageCatalogue /></Protege>} />
        <Route path="production/reclamations" element={<Protege droit="RECLAMATIONS:CONSULTER"><PageReclamations /></Protege>} />
        <Route path="comptabilite/plan" element={<Protege droit="PLAN_COMPTES:PARAMETRER"><PagePlanComptes /></Protege>} />
        <Route path="*" element={<Page titre="Page introuvable"><Message>Cette adresse ne correspond à aucun écran.</Message></Page>} />
      </Route>
    </Routes>
  );
}
