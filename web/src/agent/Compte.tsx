/**
 * AG-11 compte de production (COM-RG-020, 024, 054, 120), AG-12 approvisionner (COM-RG-010 à 014),
 * AG-18 relevé (COM-RG-013, 020), AG-13 demande de restitution (COM-RG-050 à 053).
 */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, dateHeure, montant } from '../noyau/api';
import { Chargement, Message, MessageErreur, Onglets, Statut, useAvis } from '../noyau/composants';
import { useAction, useDonnees } from '../noyau/donnees';
import { Entete, estAgentGeneral, useAgent } from './Agent';

interface Compte {
  id: string; bureau: string; statut: string; motif_gel: string | null; solde: number; seuil_alerte: number | null; montant_minimum: number; restitutionRecevableA: string | null;
  mouvements: { date_heure: string; nature: string; sens: string; montant: number; solde_apres: number; reference: string; numero_piece: string }[];
  approvisionnements: { id: string; numero_recu: string; moyen: string; montant: number; reference_externe: string | null; statut: string; motif_rejet: string | null; cree_le: string }[];
  restitutions: { id: string; date_heure_demande: string; motif: string; solde_fige: number; montant_restitue: number | null; statut: string }[];
}
type Vue = 'tableau' | 'approvisionner' | 'releve' | 'restitution';
const MOYENS: Record<string, string> = { MONNAIE_ELECTRONIQUE: 'Monnaie électronique', BANQUE: 'Virement ou versement bancaire' };
const LIBELLE_MOYEN: Record<string, string> = { ...MOYENS, ESPECES_SIEGE: 'Espèces (caisse du siège)' };
const NATURES: Record<string, string> = { APPROVISIONNEMENT: 'Approvisionnement', EMISSION: 'Émission', RENOUVELLEMENT: 'Renouvellement', ANNULATION: 'Annulation', RESTITUTION: 'Restitution', AFFECTATION_COMMISSION: 'Commissions affectées', AVENANT: 'Avenant', VERSEMENT_PROGRAMME: 'Versement programmé' };

export function PageCompteAgent() {
  const { accueil } = useAgent();
  const { bureau: code } = useParams();
  const aller = useNavigate();
  const bureau = accueil.bureaux.find(b => b.code === code) ?? accueil.bureaux[0];
  const [vue, setVue] = useState<Vue>('tableau');
  const c = useDonnees<Compte>(bureau?.compte_id ? `/comptes-production/${bureau.compte_id}` : null);
  const { avis, Avis } = useAvis();
  if (!bureau?.compte_id) return <><Entete titre="Compte de production" /><Message>Aucun compte de production : il s'ouvre à votre affectation à un bureau.</Message></>;
  if (!c.donnees) return <><Entete titre="Compte de production" /><MessageErreur erreur={c.erreur} /><Chargement /></>;
  const d = c.donnees;
  const ag = estAgentGeneral(accueil);
  const sousSeuil = d.seuil_alerte !== null && Number(d.solde) < Number(d.seuil_alerte);
  const fait = (m: string) => { avis(m); setVue('tableau'); void c.recharger(); };
  return (
    <>
      <Entete titre="Compte de production" sousTitre={`Bureau ${bureau.code} – ${bureau.nom}`}
        action={accueil.bureaux.length > 1 && <select value={bureau.code} onChange={e => aller(`/agent/compte/${e.target.value}`)}>{accueil.bureaux.map(b => <option key={b.code} value={b.code}>{b.code}</option>)}</select>} />
      <section className="ag-solde">
        <small>Solde disponible <span className="repere">1</span></small>
        <b className={sousSeuil ? 'orange' : ''}>{montant(d.solde)} <span>GNF</span></b>
        <div>{d.statut === 'GELE' ? <Statut couleur="orange">Gelé{d.motif_gel ? ` · ${d.motif_gel.toLowerCase().replace(/_/g, ' ')}` : ''}</Statut> : <Statut valeur={d.statut} />}
          <span className="doux"> · seuil d'alerte {d.seuil_alerte === null ? 'non défini' : `${montant(d.seuil_alerte)} GNF`}</span></div>
      </section>
      <Onglets<Vue> actif={vue} choisir={setVue} onglets={[{ code: 'tableau', libelle: 'Synthèse' }, { code: 'approvisionner', libelle: 'Approvisionner' }, { code: 'releve', libelle: 'Relevé' },
        ...(ag ? [{ code: 'restitution' as Vue, libelle: 'Restitution' }] : [])]} />
      {vue === 'tableau' && <Synthese d={d} apres={fait} />}
      {vue === 'approvisionner' && <Approvisionner d={d} apres={fait} />}
      {vue === 'releve' && <Releve d={d} />}
      {vue === 'restitution' && <Restitution d={d} tiersId={accueil.intervenant.tiersId} apres={fait} />}
      <Avis />
    </>
  );
}

function Synthese({ d, apres }: { d: Compte; apres: (m: string) => void }) {
  const [seuil, setSeuil] = useState(d.seuil_alerte === null ? '' : String(d.seuil_alerte));
  const action = useAction();
  const attente = d.approvisionnements.filter(a => a.statut === 'DECLARE');
  return (
    <>
      {attente.length > 0 && <Message type="attention">{attente.length} approvisionnement(s) en attente de confirmation : {attente.map(a => `${a.numero_recu} (${montant(a.montant)})`).join(', ')}.</Message>}
      <section className="ag-carte">
        <h2>Derniers mouvements <span className="repere">2</span></h2>
        <Mouvements m={d.mouvements.slice(0, 6)} />
      </section>
      <section className="ag-carte">
        <h2>Seuil d'alerte</h2>
        <p className="doux">Vous êtes alerté quand le solde passe sous ce montant.</p>
        <div className="ag-rangee"><input type="number" min={0} inputMode="numeric" value={seuil} onChange={e => setSeuil(e.target.value)} placeholder="Aucun" />
          <button className="bouton secondaire" disabled={action.enCours} onClick={() => void action.executer(() => api('PUT', `/comptes-production/${d.id}/seuil-alerte`, { seuil: seuil === '' ? null : Number(seuil) })).then(x => x !== undefined && apres('Seuil enregistré.'))}>Enregistrer</button></div>
        <MessageErreur erreur={action.erreur} />
      </section>
      <Message>Vos commissions vous sont payées à part ; elles ne sont affectées à ce compte que sur votre demande écrite <span className="repere">3</span>.</Message>
    </>
  );
}

const Mouvements = ({ m }: { m: Compte['mouvements'] }) => !m.length ? <p className="doux">Aucun mouvement.</p> : (
  <div>{m.map((x, i) => <div key={i} className="ag-ligne statique">
    <div><b>{NATURES[x.nature] ?? x.nature.toLowerCase().replace(/_/g, ' ')}</b><small>{dateHeure(x.date_heure)} · {x.reference}</small></div>
    <div className="droite"><span className={x.sens === 'C' ? 'vert' : ''}>{x.sens === 'C' ? '+' : '−'}{montant(x.montant)}</span><small>solde {montant(x.solde_apres)}</small></div>
  </div>)}</div>
);

function Approvisionner({ d, apres }: { d: Compte; apres: (m: string) => void }) {
  const banques = useDonnees<{ code: string; nom: string; compte: string }[]>('/banques-operateurs');
  const [moyen, setMoyen] = useState<'MONNAIE_ELECTRONIQUE' | 'BANQUE'>('MONNAIE_ELECTRONIQUE');
  const [banque, setBanque] = useState('');
  const [somme, setSomme] = useState('');
  const [reference, setReference] = useState('');
  const action = useAction();
  const premier = !d.approvisionnements.some(a => a.statut === 'CONFIRME');
  const liste = (banques.donnees ?? []).filter(b => (moyen === 'MONNAIE_ELECTRONIQUE' ? b.compte.startsWith('563') : !b.compte.startsWith('563')));
  const declarer = () => void action.executer(() => api<{ numero: string; statut?: string }>('POST', `/comptes-production/${d.id}/approvisionnements`, {
    moyen, montant: Number(somme), banque, referenceExterne: reference || undefined,
  })).then(r => r && apres(`Approvisionnement ${r.numero ?? ''} déclaré : le compte est crédité à sa confirmation (reçu numéroté).`));
  return (
    <section className="ag-carte">
      <h2>Approvisionner le compte <span className="repere">1</span></h2>
      {premier && <Message>Premier versement : {montant(d.montant_minimum)} GNF au minimum.</Message>}
      <label className="ag-champ">Moyen<select value={moyen} onChange={e => { setMoyen(e.target.value as typeof moyen); setBanque(''); }}>{Object.entries(MOYENS).map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select></label>
      <label className="ag-champ">{moyen === 'BANQUE' ? 'Banque' : 'Opérateur'}<select value={banque} onChange={e => setBanque(e.target.value)}><option value="">Choisir…</option>{liste.map(b => <option key={b.code} value={b.code}>{b.nom}</option>)}</select></label>
      <label className="ag-champ">Montant (GNF)<input type="number" min={1} inputMode="numeric" value={somme} onChange={e => setSomme(e.target.value)} /></label>
      <label className="ag-champ">Référence de l'opération<input value={reference} onChange={e => setReference(e.target.value)} placeholder={moyen === 'BANQUE' ? 'N° de virement ou de bordereau' : 'N° de transaction'} /></label>
      <Message>{moyen === 'MONNAIE_ELECTRONIQUE' ? <>Confirmé dès la notification de l'opérateur <span className="repere">2</span></> : <>Confirmé par la Trésorerie au vu du relevé <span className="repere">3</span></>} ; le compte est crédité à la confirmation, avec un reçu numéroté. Espèces : versez-les à la caisse du siège, qui enregistre l'approvisionnement.</Message>
      <MessageErreur erreur={action.erreur} />
      <button className="bouton large" disabled={!Number(somme) || !banque || action.enCours} onClick={declarer}>Déclarer l'approvisionnement</button>
    </section>
  );
}

function Releve({ d }: { d: Compte }) {
  return (
    <>
      <section className="ag-carte"><h2>Relevé <span className="repere">1</span></h2><Mouvements m={d.mouvements} /></section>
      <Message>Une émission refusée pour solde insuffisant ne crée aucun mouvement <span className="repere">2</span>.</Message>
      <section className="ag-carte"><h2>Approvisionnements</h2>
        {!d.approvisionnements.length ? <p className="doux">Aucun.</p> : d.approvisionnements.map(a => <div key={a.id} className="ag-ligne statique">
          <div><b>{a.numero_recu}</b><small>{LIBELLE_MOYEN[a.moyen] ?? a.moyen} · {dateHeure(a.cree_le)}{a.motif_rejet ? ` · ${a.motif_rejet}` : ''}</small></div>
          <div className="droite">{montant(a.montant)}<Statut valeur={a.statut} /></div></div>)}
      </section>
    </>
  );
}

function Restitution({ d, tiersId, apres }: { d: Compte; tiersId: string; apres: (m: string) => void }) {
  const coord = useDonnees<{ id: string; etablissement: string; numeroMasque: string; statut: string }[]>(`/tiers/${tiersId}/coordonnees`);
  const [motif, setMotif] = useState<'FIN_ACTIVITE' | 'DEMANDE_MOTIVEE'>('FIN_ACTIVITE');
  const [justification, setJustification] = useState('');
  const [coordonnee, setCoordonnee] = useState('');
  const [confirme, setConfirme] = useState(false);
  const action = useAction();
  const enCours = d.restitutions.find(r => !['PAYEE', 'PAYE', 'REJETE', 'REJETEE', 'EXECUTEE'].includes(r.statut));
  if (enCours) return <Message type="attention">Demande du {dateHeure(enCours.date_heure_demande)} en cours ({enCours.statut.toLowerCase().replace(/_/g, ' ')}) : solde figé {montant(enCours.solde_fige)} GNF.</Message>;
  const verifiees = (coord.donnees ?? []).filter(c => c.statut === 'VERIFIEE');
  return (
    <section className="ag-carte">
      <h2>Demande de restitution</h2>
      <Message>La restitution n'intervient qu'en fin d'activité ou sur demande motivée <span className="repere">1</span>. Montant : le solde à la date de la demande, moins les sommes dues <span className="repere">2</span>.</Message>
      {d.restitutionRecevableA && <p className="doux">Recevable à partir du {dateHeure(d.restitutionRecevableA)} (délai d'annulation des dernières émissions).</p>}
      <label className="ag-champ">Motif<select value={motif} onChange={e => setMotif(e.target.value as typeof motif)}><option value="FIN_ACTIVITE">Fin d'activité</option><option value="DEMANDE_MOTIVEE">Demande motivée</option></select></label>
      {motif === 'DEMANDE_MOTIVEE' && <label className="ag-champ">Justification<textarea value={justification} onChange={e => setJustification(e.target.value)} /></label>}
      <label className="ag-champ">Compte de paiement vérifié<select value={coordonnee} onChange={e => setCoordonnee(e.target.value)}><option value="">Choisir…</option>{verifiees.map(c => <option key={c.id} value={c.id}>{c.etablissement} {c.numeroMasque}</option>)}</select></label>
      {!verifiees.length && <p className="doux">Aucun compte vérifié : faites enregistrer vos coordonnées par la Compagnie.</p>}
      <label className="ag-coche"><input type="checkbox" checked={confirme} onChange={e => setConfirme(e.target.checked)} /> Je comprends que la demande gèle le compte : plus aucune émission sur ce bureau <span className="repere">3</span>.</label>
      <MessageErreur erreur={action.erreur} />
      <button className="bouton danger large" disabled={!coordonnee || !confirme || (motif === 'DEMANDE_MOTIVEE' && !justification.trim()) || action.enCours}
        onClick={() => void action.executer(() => api('POST', `/comptes-production/${d.id}/restitution`, { motif, justification: justification || undefined, coordonneePaiementId: coordonnee }))
          .then(x => x && apres('Demande enregistrée : compte gelé, validation par la Direction commerciale puis la DAF.'))}>Demander la restitution</button>
      <p className="doux">Double validation, puis paiement sur votre compte vérifié <span className="repere">4</span>. <Link to="/agent">Retour</Link></p>
    </section>
  );
}
