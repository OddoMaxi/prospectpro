/** Composants communs, conformes aux conventions graphiques de la maquette (page 4). */
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, type ErreurApi } from './api';

export function Page({ fil, titre, actions, children }: { fil?: ReactNode[]; titre: ReactNode; actions?: ReactNode; children: ReactNode }) {
  useEffect(() => { if (typeof titre === 'string') document.title = `${titre} – Prospect Pro`; }, [titre]);
  return (
    <>
      {fil && <div className="fil">{fil.map((f, i) => <span key={i}>{i > 0 && ' › '}{f}</span>)}</div>}
      <div className="entete"><h1>{titre}</h1>{actions && <div className="actions">{actions}</div>}</div>
      {children}
    </>
  );
}

export const Carte = ({ titre, repere, actions, children }: { titre?: ReactNode; repere?: number; actions?: ReactNode; children: ReactNode }) => (
  <section className="carte">
    {(titre || actions) && (
      <div className="entete" style={{ marginBottom: 6 }}>
        {titre && <h2>{repere && <span className="repere">{repere}</span>}{titre}</h2>}
        {actions && <div className="actions">{actions}</div>}
      </div>
    )}
    {children}
  </section>
);

const COULEURS: Record<string, string> = {
  ACTIF: 'vert', ACTIVE: 'vert', VALIDE: 'vert', VALIDEE: 'vert', VERIFIEE: 'vert', TRAITE: 'vert', REPONDUE: 'vert', COUVERT: 'vert', OUI: 'vert', INTEGRE: 'vert',
  EN_ATTENTE: 'orange', A_VALIDER: 'orange', A_VERIFIER: 'orange', A_TRAITER: 'orange', OUVERTE: 'orange', AFFECTEE: 'bleu', EN_COURS: 'bleu', ALERTE: 'orange', ATTENTION: 'orange',
  REJETE: 'rouge', SUSPENDU: 'rouge', SUSPENDUE: 'rouge', BLOQUE: 'rouge', ESCALADEE: 'rouge', EN_ERREUR: 'rouge', ABANDONNE: 'rouge', ALTERE: 'rouge',
  INFO: 'bleu', SOLDEE: 'vert', EMISE: 'bleu', CONFIRME: 'vert', DECLARE: 'orange', EXECUTE: 'bleu', GELE: 'orange', INACTIF: 'gris', DESACTIVE: 'gris', CLOSE: 'gris', NON: 'gris', RAPPEL: 'violet', NOTIFICATION: 'violet',
};
const LIBELLES: Record<string, string> = {
  EN_ATTENTE: 'En attente', A_VALIDER: 'À valider', A_VERIFIER: 'À vérifier', A_TRAITER: 'À traiter', EN_COURS: 'En cours', VALIDE: 'Validé', REJETE: 'Rejeté',
  ESCALADEE: 'Escaladée', AFFECTEE: 'Affectée', OUVERTE: 'Ouverte', REPONDUE: 'Répondue', CLOSE: 'Close', VERIFIEE: 'Vérifiée', SUSPENDUE: 'Suspendue', SUSPENDU: 'Suspendu',
  DESACTIVE: 'Désactivé', EN_ERREUR: 'En erreur', ABANDONNE: 'Abandonné', TRAITE: 'Traité', SOLDEE: 'Soldée', EMISE: 'Émise', CONFIRME: 'Confirmé', DECLARE: 'Déclaré', ACTIF: 'Actif', ACTIVE: 'Active', GELE: 'Gelé',
};
export const Statut = ({ valeur, couleur, children }: { valeur?: string | null; couleur?: string; children?: ReactNode }) =>
  valeur || children ? <span className={`statut ${couleur ?? COULEURS[valeur ?? ''] ?? 'gris'}`}>{children ?? LIBELLES[valeur!] ?? valeur!.replace(/_/g, ' ')}</span> : <>—</>;

export const Message = ({ type = 'info', titre, children }: { type?: 'info' | 'succes' | 'attention' | 'erreur'; titre?: ReactNode; children: ReactNode }) => (
  <div className={`message ${type}`} role={type === 'erreur' ? 'alert' : undefined}>{titre && <b>{titre} :</b>}{children}</div>
);

/** Erreur métier de l'API, avec ses détails utiles (liste des manques, fiches proches…). */
export function MessageErreur({ erreur }: { erreur: ErreurApi | null }) {
  if (!erreur) return null;
  const d = erreur.details as { manquants?: string[]; champ?: string; message?: string }[] | { manquants?: string[] } | undefined;
  const liste = Array.isArray(d) ? d.filter(x => x.champ).map(x => `${x.champ} : ${x.message}`) : d?.manquants ?? [];
  return (
    <Message type="erreur" titre={erreur.statut === 403 ? 'Refusé' : 'Impossible'}>
      {erreur.message}
      {liste.length > 0 && <ul>{liste.map(l => <li key={l}>{l}</li>)}</ul>}
    </Message>
  );
}

export function Champ({ libelle, aide, erreur, large, children }: { libelle: ReactNode; aide?: ReactNode; erreur?: boolean; large?: boolean; children: ReactNode }) {
  return (
    <div className={`champ${large ? ' large' : ''}${erreur ? ' en-erreur' : ''}`}>
      <label>{libelle}</label>
      {children}
      {aide && <span className="aide">{aide}</span>}
    </div>
  );
}

export function Modale({ titre, fermer, large, children }: { titre: ReactNode; fermer: () => void; large?: boolean; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') fermer(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [fermer]);
  return (
    <div className="voile" onMouseDown={e => { if (e.target === e.currentTarget) fermer(); }}>
      <div className={`modale${large ? ' large' : ''}`} role="dialog" aria-modal="true">
        <header><h2>{titre}</h2><button className="fermer" onClick={fermer} aria-label="Fermer">×</button></header>
        {children}
      </div>
    </div>
  );
}

export function Onglets<T extends string>({ onglets, actif, choisir }: { onglets: { code: T; libelle: string }[]; actif: T; choisir: (c: T) => void }) {
  return <div className="onglets" role="tablist">{onglets.map(o => <button key={o.code} role="tab" className={o.code === actif ? 'actif' : ''} onClick={() => choisir(o.code)}>{o.libelle}</button>)}</div>;
}

export const Chargement = () => <div className="chargement">Chargement…</div>;

/** Message bref après une action réussie. */
export function useAvis() {
  const [avis, setAvis] = useState<string | null>(null);
  useEffect(() => { if (!avis) return; const t = setTimeout(() => setAvis(null), 5000); return () => clearTimeout(t); }, [avis]);
  const Avis = () => (avis ? <div className="notification-flottante"><Message type="succes">{avis}</Message></div> : null);
  return { avis: setAvis, Avis };
}

export const LienTiers = ({ id, children }: { id: string; children: ReactNode }) => <Link to={`/referentiels/tiers/${id}`}>{children}</Link>;

/** Libellés des opérations soumises à validation. */
export const OPERATIONS: Record<string, string> = {
  ORGANISATION: 'Réorganisation', ATTRIBUTION_PROFIL_PRIVILEGIE: 'Attribution d\'un profil privilégié', PARAMETRAGE: 'Changement de paramètre',
  PARAMETRAGE_REGLE_LEGALE: 'Changement d\'un paramètre légal', FICHE_SOCIETE: 'Modification de la fiche de la Compagnie',
  COORDONNEE_PAIEMENT: 'Coordonnées de paiement', CATALOGUE: 'Modification du catalogue',
  // Lot 2
  SCHEMA_COMPTABLE: 'Schéma comptable', EXTOURNE_ECRITURE: 'Contre-passation d\'écriture', AGREMENT_INTERVENANT: 'Agrément d\'un intervenant',
  FACTURE_COMMISSION: 'Facture de commissions', PAIEMENT_COMMISSION: 'Paiement de commissions', AFFECTATION_COMMISSION: 'Affectation au compte de production',
  ANNULATION_ERREUR: 'Annulation pour erreur', RESTITUTION_COMPTE_PRODUCTION: 'Restitution du compte de production', ECRITURE_MANUELLE: 'Fiche d\'imputation',
  DECLARATION_TAXE: 'Déclaration de taxe', PAIEMENT_PRESTATAIRE: 'Paiement prestataire', PAIEMENT_INDEMNITE: 'Paiement d\'indemnité',
  PAIEMENT_REMBOURSEMENT_DEPOT: 'Remboursement de versements', PAIEMENT_FOURNISSEUR: 'Paiement fournisseur', PAIEMENT_TAXE: 'Paiement de taxe', PAIEMENT_RIST: 'Paiement de ristourne',
  MOUVEMENT_PORTEFEUILLE: 'Mouvement de portefeuille', AVENANT_CORRECTION: 'Avenant de correction', RETRAIT_AYANT_DROIT: 'Retrait d\'un ayant droit (décès)', RESILIATION: 'Résiliation de police',
};

/** Tuile d'indicateur (maquette : cartes de chiffres en tête d'écran). */
export const Indicateur = ({ libelle, valeur, detail, couleur }: { libelle: ReactNode; valeur: ReactNode; detail?: ReactNode; couleur?: 'vert' | 'rouge' | 'orange' }) => (
  <div className="indicateur"><small>{libelle}</small><b style={couleur ? { color: `var(--${couleur})` } : undefined}>{valeur}</b>{detail && <span>{detail}</span>}</div>
);

/** Choix d'un tiers par recherche (nom, téléphone ou code). */
export function ChoixTiers({ valeur, choisir }: { valeur: { id: string; nom: string } | null; choisir: (t: { id: string; nom: string } | null) => void }) {
  const [saisie, setSaisie] = useState('');
  const [trouves, setTrouves] = useState<{ id: string; code_tiers: string; nom: string; prenoms: string | null }[]>([]);
  useEffect(() => {
    if (saisie.trim().length < 2) { setTrouves([]); return; }
    const t = setTimeout(() => void api<typeof trouves>('GET', `/tiers?recherche=${encodeURIComponent(saisie.trim())}`).then(setTrouves).catch(() => setTrouves([])), 250);
    return () => clearTimeout(t);
  }, [saisie]);
  if (valeur) return <div className="filtres" style={{ margin: 0 }}><b>{valeur.nom}</b><button type="button" className="lien" onClick={() => choisir(null)}>changer</button></div>;
  return (
    <div>
      <input value={saisie} onChange={e => setSaisie(e.target.value)} placeholder="Nom, téléphone ou code tiers" />
      {trouves.length > 0 && <ul className="choix">{trouves.slice(0, 8).map(t => <li key={t.id}><button type="button" className="lien" onClick={() => { choisir({ id: t.id, nom: `${t.prenoms ?? ''} ${t.nom}`.trim() }); setSaisie(''); }}>{t.prenoms} {t.nom} <span className="doux code">{t.code_tiers}</span></button></li>)}</ul>}
    </div>
  );
}

/** Dépôt d'une pièce justificative (PDF, JPEG, PNG) rattachée à un objet ; renvoie l'identifiant du document. */
export function DepotPiece({ objetType, objetId, typeDocument, depose, libelle = 'Joindre la pièce' }: { objetType: string; objetId: string; typeDocument: string; depose: (d: { id: string; nom: string }) => void; libelle?: string }) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [nom, setNom] = useState<string | null>(null);
  const envoyer = async (f: File) => {
    setErreur(null);
    try {
      const r = await api<{ id: string }>('POST', `/pieces?${new URLSearchParams({ objetType, objetId, typeDocument })}`, f);
      setNom(f.name); depose({ id: r.id, nom: f.name });
    } catch (e) { setErreur((e as Error).message); }
  };
  return (
    <div>
      <label className="bouton secondaire petit">{nom ? `${nom} ✓` : libelle}<input type="file" hidden accept="application/pdf,image/jpeg,image/png" onChange={e => { const f = e.target.files?.[0]; if (f) void envoyer(f); e.target.value = ''; }} /></label>
      {erreur && <span className="aide" style={{ color: 'var(--rouge)' }}> {erreur}</span>}
    </div>
  );
}
