/** Profil : AG-16 factures de commissions, AG-15 mon réseau, déconnexion. Carte professionnelle (AG-20) à venir. */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, date, montant, ouvrirFichier } from '../noyau/api';
import { Chargement, DepotPiece, Message, MessageErreur, Statut, useAvis } from '../noyau/composants';
import { useAction, useDonnees } from '../noyau/donnees';
import { useSession } from '../noyau/session';
import { Entete, estAgentGeneral, useAgent } from './Agent';

const ROLES: Record<string, string> = { AGENT_GENERAL: 'Agent général', COLLABORATEUR: 'Collaborateur', JUNIOR: 'Junior', PRESCRIPTEUR: 'Prescripteur' };

export function PageProfilAgent() {
  const { accueil } = useAgent();
  const { moi, fermer } = useSession();
  const aller = useNavigate();
  const i = accueil.intervenant;
  return (
    <>
      <Entete titre="Profil" />
      <section className="ag-carte ag-identite">
        <div className="ag-avatar">{`${i.prenoms?.[0] ?? ''}${i.nom[0] ?? ''}`.toUpperCase()}</div>
        <div><b>{i.prenoms} {i.nom}</b><small>{ROLES[i.role] ?? i.role}{i.role !== 'AGENT_GENERAL' ? ` · ${i.agent}` : ''}</small><small>Identifiant : {moi?.identifiant}</small></div>
      </section>
      <nav className="ag-carte ag-liens">
        <Link to="/agent/factures">Factures de commissions<span>›</span></Link>
        {estAgentGeneral(accueil) && <Link to="/agent/reseau">Mon réseau<span>›</span></Link>}
        <Link to="/agent/compte">Compte de production<span>›</span></Link>
      </nav>
      <Message>Carte professionnelle numérique vérifiable par QR code (AG-20) : disponible avec la gestion des cartes professionnelles.</Message>
      <button className="bouton secondaire large" onClick={() => void fermer().then(() => aller('/connexion'))}>Se déconnecter</button>
    </>
  );
}

// ---------------------------------------------------------------- AG-16

interface Facture { id: string; numero: string; mois: string; mode: string | null; statut: string; montant_brut: number; avoir: number; retenue: number; net: number; montant_paye: number; date_limite_paiement: string | null; paiements: { rang: number; montant: number; net: number; destination: string; paye_le: string | null }[] | null }
const STATUTS: Record<string, [string, string]> = { ETABLIE: ['À émettre', 'orange'], EMISE: ['Émise', 'bleu'], CONTESTEE: ['Contestée', 'rouge'], VALIDEE: ['Validée', 'vert'], PARTIELLEMENT_PAYEE: ['Partiellement payée', 'orange'], PAYEE: ['Payée', 'vert'] };
const mois = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function PageFacturesAgent() {
  const l = useDonnees<Facture[]>('/factures-commissions');
  const [choisie, setChoisie] = useState<string | null>(null);
  const { avis, Avis } = useAvis();
  const f = l.donnees?.find(x => x.id === choisie);
  return (
    <>
      <Entete titre="Factures de commissions" retour="/agent/profil" />
      {l.chargement ? <Chargement /> : !l.donnees?.length ? <Message>Aucune facture : elle est établie le 1er du mois pour les commissions du mois écoulé.</Message> :
        l.donnees.map(x => <button key={x.id} className={`ag-ligne${x.id === choisie ? ' choisie' : ''}`} onClick={() => setChoisie(x.id === choisie ? null : x.id)}>
          <div><b>{mois(x.mois)}</b><small>{x.numero}{x.date_limite_paiement ? ` · paiement au plus tard le ${date(x.date_limite_paiement)}` : ''}</small></div>
          <div className="droite"><span className="montant">{montant(x.net)}</span><Statut couleur={STATUTS[x.statut]?.[1]}>{STATUTS[x.statut]?.[0] ?? x.statut}</Statut></div></button>)}
      {f && <FicheFacture f={f} apres={m => { avis(m); void l.recharger(); }} />}
      <Message>Facture mensuelle préparée par le système : vous l'émettez par code, ou déposez la vôtre (même référence, même montant) <span className="repere">1</span>. Paiement sous 30 jours après réception, en une ou plusieurs fois, avec un avis de paiement <span className="repere">3</span>.</Message>
      <Avis />
    </>
  );
}

function FicheFacture({ f, apres }: { f: Facture; apres: (m: string) => void }) {
  const objetId = useMemo(() => f.id, [f.id]);
  const [code, setCode] = useState('');
  const [envoye, setEnvoye] = useState(false);
  const [depot, setDepot] = useState<{ id: string; nom: string } | null>(null);
  const [motif, setMotif] = useState('');
  const action = useAction();
  const aEmettre = ['ETABLIE', 'CONTESTEE'].includes(f.statut);
  return (
    <section className="ag-carte">
      <h2>Facture {f.numero}</h2>
      <dl className="ag-details"><dt>Commissions brutes</dt><dd>{montant(f.montant_brut)}</dd>{Number(f.avoir) > 0 && <><dt>Avoir (reprises)</dt><dd>−{montant(f.avoir)}</dd></>}
        <dt>Retenue à la source</dt><dd>−{montant(f.retenue)}</dd><dt><b>Net à payer</b></dt><dd><b>{montant(f.net)} GNF</b></dd><dt>Déjà payé</dt><dd>{montant(f.montant_paye)}</dd></dl>
      <button className="lien" onClick={() => void api<{ id: string; type_document: string }[]>('GET', `/documents?objetType=facture_commission&objetId=${f.id}`).then(d => d[0] && ouvrirFichier('GET', `/documents/${d[0].id}/fichier`))}>Voir la facture (PDF)</button>
      {f.paiements?.length ? <><h3>Paiements</h3>{f.paiements.map(p => <div key={p.rang} className="ag-ligne statique"><div><b>Fraction {p.rang}</b><small>{p.destination === 'COMPTE_PRODUCTION' ? 'affectée au compte de production' : p.destination.toLowerCase().replace(/_/g, ' ')}</small></div>
        <div className="droite">{montant(p.net)}<small>{p.paye_le ? date(p.paye_le) : 'en cours'}</small></div></div>)}</> : null}
      {aEmettre && <>
        <h3>Émettre la facture</h3>
        {!envoye ? <button className="bouton large" disabled={action.enCours} onClick={() => void action.executer(() => api('POST', `/factures-commissions/${f.id}/code-emission`)).then(x => x !== undefined && setEnvoye(true))}>Recevoir le code d'émission par SMS</button>
          : <><input className="ag-code" inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} aria-label="Code d'émission" />
            <button className="bouton large" disabled={code.length !== 6 || action.enCours} onClick={() => void action.executer(() => api('POST', `/factures-commissions/${f.id}/emission`, { code })).then(x => x && apres('Facture émise : elle est transmise à la Direction commerciale pour validation.'))}>Émettre</button></>}
        <h3>Ou déposer votre propre facture</h3>
        <p className="doux">Même référence ({f.numero}) et même montant net ({montant(f.net)} GNF).</p>
        <DepotPiece objetType="facture_commission" objetId={objetId} typeDocument="FACTURE_COMMISSION_DEPOSEE" depose={setDepot} libelle="Joindre ma facture" />
        {depot && <button className="bouton secondaire large" disabled={action.enCours} onClick={() => void action.executer(() => api('POST', `/factures-commissions/${f.id}/depot`, { documentId: depot.id, reference: f.numero, montantNet: Number(f.net) })).then(x => x && apres('Facture déposée.'))}>Déposer</button>}
        <h3>Contester</h3>
        <textarea value={motif} onChange={e => setMotif(e.target.value)} placeholder="Ce qui est inexact (police, montant…)" />
        <button className="bouton danger" disabled={!motif.trim() || action.enCours} onClick={() => void action.executer(() => api('POST', `/factures-commissions/${f.id}/contestation`, { motif })).then(x => x !== undefined && apres('Contestation transmise à la Direction commerciale.'))}>Contester</button>
      </>}
      <MessageErreur erreur={action.erreur} />
    </section>
  );
}

// ---------------------------------------------------------------- AG-15

interface Membre { id: string; role: string; statut: string; date_entree: string; controles_conformite_le: string | null; limite_controles: string; tiers_id: string; nom: string; prenoms: string | null; telephone: string | null; dossiers_soumis: number; polices: number }

export function PageReseauAgent() {
  const l = useDonnees<Membre[]>('/agent/reseau');
  const action = useAction();
  const { avis, Avis } = useAvis();
  const valider = (m: Membre) => void action.executer(() => api('POST', `/intervenants/${m.id}/controles-conformite`)).then(x => { if (x !== undefined) { avis(`Contrôles de ${m.prenoms ?? ''} ${m.nom} validés : il peut souscrire.`); void l.recharger(); } });
  return (
    <>
      <Entete titre="Mon réseau" retour="/agent/profil" />
      <MessageErreur erreur={action.erreur} />
      {l.chargement ? <Chargement /> : !l.donnees?.length ? <Message>Aucun collaborateur ni junior rattaché.</Message> : <section className="ag-carte">
        <h2>Collaborateurs et juniors <span className="repere">1</span></h2>
        {l.donnees.map(m => <div key={m.id} className="ag-ligne statique">
          <div><b>{m.prenoms} {m.nom}</b><small>{ROLES[m.role] ?? m.role} · depuis le {date(m.date_entree)} · {m.polices} police(s){m.dossiers_soumis ? ` · ${m.dossiers_soumis} dossier(s) à valider` : ''}</small>
            {m.role === 'JUNIOR' && !m.controles_conformite_le && m.statut === 'ACTIF' && <small className="orange">Contrôles à valider avant le {date(m.limite_controles)}</small>}</div>
          <div className="droite">{m.role === 'JUNIOR' && !m.controles_conformite_le && m.statut === 'ACTIF'
            ? <button className="bouton petit" disabled={action.enCours} onClick={() => valider(m)}>Valider</button> : <Statut valeur={m.statut} />}</div>
        </div>)}
      </section>}
      <Message>Un junior travaille en prospection seule tant que vous n'avez pas validé ses contrôles ; sans validation sous 15 jours, son compte est suspendu. La création des comptes de votre réseau se fait avec la Direction commerciale <span className="repere">2</span>.</Message>
      <Avis />
    </>
  );
}
