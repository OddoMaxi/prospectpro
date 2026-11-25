/**
 * Application agent : AG-03 prospects, AG-20 carte professionnelle, AG-19 mouvements de portefeuille, AG-21 espace prescripteur.
 */
import { Fragment, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { api, aujourdhui, date, montant } from '../noyau/api';
import { Chargement, DepotPiece, Message, MessageErreur, Statut, useAvis } from '../noyau/composants';
import { useAction, useDonnees } from '../noyau/donnees';
import { Entete, estAgentGeneral, useAgent } from './Agent';
import { ChoixPersonne } from './Souscription';

// ---------------------------------------------------------------- AG-03

interface Prospect { id: string; statut: string; exclusivite_jusqu_au: string; converti_le: string | null; tiers_id: string; code_tiers: string; nom: string; prenoms: string | null; telephone: string | null; intervenant: string; mien: boolean }
const STATUTS: Record<string, [string, string]> = { NOUVEAU: ['Nouveau', 'bleu'], CONTACTE: ['Contacté', 'bleu'], INTERESSE: ['Intéressé', 'orange'], CONVERTI: ['Client', 'vert'], PERDU: ['Perdu', 'gris'] };

export function PageProspects() {
  const { accueil } = useAgent();
  const aller = useNavigate();
  const [filtre, setFiltre] = useState<'' | 'fin' | string>('');
  const chemin = filtre === 'fin' ? `/agent/prospects?finExclusiviteAvant=${new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10)}` : `/agent/prospects${filtre ? `?statut=${filtre}` : ''}`;
  const l = useDonnees<Prospect[]>(chemin);
  const [ajout, setAjout] = useState(false);
  const action = useAction();
  const { avis, Avis } = useAvis();
  const enregistrer = (t: { id: string; nom: string } | null) => { if (t) void action.executer(() => api<{ exclusiviteJusquAu: string }>('POST', '/agent/prospects', { tiersId: t.id }))
    .then(r => { if (r) { avis(`${t.nom} enregistré : exclusivité jusqu'au ${date(r.exclusiviteJusquAu)}.`); setAjout(false); void l.recharger(); } }); };
  const statut = (p: Prospect, s: string) => void action.executer(() => api('POST', `/agent/prospects/${p.id}/statut`, { statut: s })).then(x => x !== undefined && void l.recharger());
  return (
    <>
      <Entete titre="Prospects" action={<button className="bouton petit" onClick={() => setAjout(a => !a)}>{ajout ? 'Fermer' : '+ Prospect'}</button>} />
      {ajout && <section className="ag-carte"><h2>Nouveau prospect</h2><p className="doux">Recherchez la personne ou créez sa fiche : vous en gardez l'exclusivité 90 jours <span className="repere">2</span>.</p>
        <ChoixPersonne valeur={null} choisir={enregistrer} /></section>}
      <div className="ag-rangee"><span className="repere">1</span>
        <select value={filtre} onChange={e => setFiltre(e.target.value)}><option value="">Tous</option>{Object.entries(STATUTS).map(([c, [lib]]) => <option key={c} value={c}>{lib}</option>)}<option value="fin">Exclusivité finissant sous 15 jours</option></select></div>
      <MessageErreur erreur={action.erreur} />
      {l.chargement ? <Chargement /> : !l.donnees?.length ? <Message>Aucun prospect.</Message> : l.donnees.map(p => <section key={p.id} className="ag-carte">
        <div className="ag-ligne statique"><div><b>{p.prenoms} {p.nom}</b><small>{p.telephone ?? p.code_tiers}{!p.mien ? ` · ${p.intervenant}` : ''}</small>
          <small>{p.statut === 'CONVERTI' ? `Client depuis le ${date(p.converti_le)}` : `Exclusivité jusqu'au ${date(p.exclusivite_jusqu_au)}${p.exclusivite_jusqu_au < aujourdhui() ? ' (échue)' : ''}`}</small></div>
          <Statut couleur={STATUTS[p.statut]?.[1]}>{STATUTS[p.statut]?.[0] ?? p.statut}</Statut></div>
        {p.mien && !['CONVERTI', 'PERDU'].includes(p.statut) && <div className="ag-rangee">
          <select value={p.statut} onChange={e => statut(p, e.target.value)} aria-label="Statut">{['NOUVEAU', 'CONTACTE', 'INTERESSE', 'PERDU'].map(s => <option key={s} value={s}>{STATUTS[s]![0]}</option>)}</select>
          {!accueil.intervenant.prospectionSeule && <button className="bouton petit" onClick={() => aller(`/agent/souscrire?client=${p.tiers_id}&nom=${encodeURIComponent(`${p.prenoms ?? ''} ${p.nom}`.trim())}`)}>Souscrire</button>}
        </div>}
      </section>)}
      <Message>La conversion en client garde la même fiche <span className="repere">3</span>.</Message>
      <Avis />
    </>
  );
}

// ---------------------------------------------------------------- AG-20

export function PageCarteAgent() {
  const { accueil } = useAgent();
  const c = useDonnees<{ numero_serie: string; modele: string; statut: string; remise_le: string | null; verification: string } | null>('/agent/carte');
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => { if (c.donnees?.verification) void QRCode.toDataURL(c.donnees.verification, { margin: 1, width: 220 }).then(setQr); }, [c.donnees?.verification]);
  const i = accueil.intervenant;
  const valide = c.donnees?.statut === 'REMISE';
  return (
    <>
      <Entete titre="Carte professionnelle" retour="/agent/profil" />
      {c.chargement ? <Chargement /> : !c.donnees ? <Message>Aucune carte : elle est demandée à votre activation.</Message> : <>
        <section className={`ag-cartepro${valide ? '' : ' inactive'}`}>
          <small>{c.donnees.modele === 'AGENT_GENERAL' ? 'Carte professionnelle – Agent général' : 'Carte d\'apporteur d\'affaires'}</small>
          <b>{i.prenoms} {i.nom}</b>
          <span>{i.role === 'AGENT_GENERAL' ? 'Agent général' : `Agit sous la responsabilité de ${i.role === 'PRESCRIPTEUR' ? 'la Compagnie' : i.agent}`}</span>
          {qr && valide && <img src={qr} alt="QR code de vérification" />}
          <small>N° {c.donnees.numero_serie}</small>
        </section>
        {valide ? <Message type="succes">Présentez la carte à vos prospects : le QR code ouvre la page publique de vérification <span className="repere">1</span>.</Message>
          : <Message type="attention">Carte {c.donnees.statut === 'BLOQUEE' ? 'bloquée' : 'pas encore remise'} : {c.donnees.statut === 'BLOQUEE' ? 'elle redevient valide à la levée de la suspension.' : 'la Direction commerciale la valide, la produit puis vous la remet contre un code reçu par SMS.'}</Message>}
        <Message>La carte est valable tant que vous êtes en activité <span className="repere">2</span> ; à votre sortie, elle est bloquée et la vérification affiche « retirée » <span className="repere">3</span>.</Message>
      </>}
    </>
  );
}

// ---------------------------------------------------------------- AG-19

interface Mouvement { id: string; numero: string; type: string; statut: string; date_effet: string; motif: string; polices: number; cas: string | null; cedant: string; cessionnaire: string }
interface Membre { id: string; role: string; statut: string; nom: string; prenoms: string | null }
const CAS: Record<string, string> = { DEPART: 'Départ sans cession', SUSPENSION: 'Suspension', INACTIVITE: 'Inactivité prolongée', ACCORD_ECRIT: 'Accord écrit du junior' };

export function PageMouvementsAgent() {
  const { accueil } = useAgent();
  const l = useDonnees<Mouvement[]>('/agent/mouvements');
  const ag = estAgentGeneral(accueil);
  const reseau = useDonnees<Membre[]>(ag ? '/agent/reseau' : null);
  const agents = useDonnees<{ id: string; nom: string }[]>(ag ? '/agent/agents-generaux' : null);
  const [type, setType] = useState<'CESSION' | 'TRANSFERT'>('TRANSFERT');
  const [cedant, setCedant] = useState('');
  const [cessionnaire, setCessionnaire] = useState('');
  const [cas, setCas] = useState('');
  const [accord, setAccord] = useState<string | null>(null);
  const [motif, setMotif] = useState('');
  const [prix, setPrix] = useState('');
  const [dateEffet, setDate] = useState(aujourdhui());
  const action = useAction();
  const { avis, Avis } = useAvis();
  const juniors = (reseau.donnees ?? []).filter(m => m.role === 'JUNIOR');
  const cedantId = type === 'CESSION' ? accueil.intervenant.id : cedant;
  const proposer = () => void action.executer(() => api<{ numero: string; polices: number }>('POST', '/agent/mouvements', {
    type, cedantId, cessionnaireId: cessionnaire, dateEffet, motif, prix: prix ? Number(prix) : undefined, casTransfert: type === 'TRANSFERT' ? cas : undefined, accordDocumentId: accord ?? undefined,
  })).then(r => { if (r) { avis(`Mouvement ${r.numero} (${r.polices} police(s)) soumis à la Direction commerciale.`); setMotif(''); void l.recharger(); } });
  return (
    <>
      <Entete titre="Mouvements de portefeuille" retour="/agent/profil" />
      {ag ? <section className="ag-carte">
        <h2>Nouveau mouvement</h2>
        <label className="ag-champ">Type<select value={type} onChange={e => { setType(e.target.value as typeof type); setCessionnaire(''); }}>
          <option value="TRANSFERT">Transférer les clients d'un junior</option><option value="CESSION">Céder mon portefeuille à un agent général</option></select></label>
        {type === 'TRANSFERT' ? <>
          <label className="ag-champ">Junior<select value={cedant} onChange={e => setCedant(e.target.value)}><option value="">Choisir…</option>{juniors.map(j => <option key={j.id} value={j.id}>{j.prenoms} {j.nom} ({j.statut.toLowerCase()})</option>)}</select></label>
          <label className="ag-champ">Vers<select value={cessionnaire} onChange={e => setCessionnaire(e.target.value)}><option value="">Choisir…</option><option value={accueil.intervenant.id}>Moi-même</option>
            {juniors.filter(j => j.id !== cedant && j.statut === 'ACTIF').map(j => <option key={j.id} value={j.id}>{j.prenoms} {j.nom}</option>)}</select></label>
          <label className="ag-champ">Cas <span className="repere">2</span><select value={cas} onChange={e => setCas(e.target.value)}><option value="">Choisir…</option>{Object.entries(CAS).map(([c, lib]) => <option key={c} value={c}>{lib}</option>)}</select></label>
          {cas === 'ACCORD_ECRIT' && <DepotPiece objetType="intervenant" objetId={cedant || accueil.intervenant.id} typeDocument="ACCORD_TRANSFERT" libelle="Joindre l'accord écrit" depose={x => setAccord(x.id)} />}
        </> : <>
          <label className="ag-champ">Agent général cessionnaire<select value={cessionnaire} onChange={e => setCessionnaire(e.target.value)}><option value="">Choisir…</option>{(agents.donnees ?? []).map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}</select></label>
          <label className="ag-champ">Prix convenu (GNF, facultatif)<input type="number" min={0} value={prix} onChange={e => setPrix(e.target.value)} /></label>
        </>}
        <label className="ag-champ">Date d'effet<input type="date" value={dateEffet} onChange={e => setDate(e.target.value)} /></label>
        <label className="ag-champ">Motif<textarea value={motif} onChange={e => setMotif(e.target.value)} /></label>
        <MessageErreur erreur={action.erreur} />
        <button className="bouton large" disabled={!cedantId || !cessionnaire || !motif.trim() || (type === 'TRANSFERT' && !cas) || action.enCours} onClick={proposer}>Soumettre à la Direction commerciale</button>
        <p className="doux">Tout le portefeuille est concerné ; les commissions acquises restent au cédant <span className="repere">3</span>.</p>
      </section> : <Message>La cession de votre qualité d'apporteur à un autre junior de votre réseau se fait par votre agent général <span className="repere">1</span>.</Message>}
      <section className="ag-carte"><h2>Mouvements</h2>
        {l.chargement ? <Chargement /> : !l.donnees?.length ? <p className="doux">Aucun mouvement.</p> : l.donnees.map(m => <div key={m.id} className="ag-ligne statique">
          <div><b>{m.cedant} → {m.cessionnaire}</b><small>{m.numero} · {m.polices} police(s) · effet {date(m.date_effet)}{m.cas ? ` · ${CAS[m.cas]}` : ''}</small></div><Statut valeur={m.statut} /></div>)}
      </section>
      <Avis />
    </>
  );
}

// ---------------------------------------------------------------- AG-21

export function PageEspacePrescripteur() {
  const { accueil } = useAgent();
  const s = useDonnees<{ codes: { code: string; statut: string; valide_le: string }[]; mois: { mois: string; polices: number; renouvellements: number; commissions: number }[]; concentration: boolean }>('/agent/prescripteur');
  const i = accueil.intervenant;
  const total = (s.donnees?.mois ?? []).reduce((t, m) => ({ polices: t.polices + m.polices, renouvellements: t.renouvellements + m.renouvellements, commissions: t.commissions + m.commissions }), { polices: 0, renouvellements: 0, commissions: 0 });
  return (
    <>
      <Entete titre={`Bonjour ${i.prenoms ?? i.nom}`} sousTitre="Espace prescripteur" />
      {!s.donnees ? <Chargement /> : <>
        <section className="ag-solde"><small>Mon code</small><b>{s.donnees.codes.find(c => c.statut === 'ACTIF')?.code ?? '—'}</b>
          <div className="doux">À communiquer à vos contacts : ils le saisissent en souscrivant ; il ne leur donne aucune réduction.</div></section>
        <div className="ag-grille">
          <div className="ag-tuile"><small>Polices obtenues</small><b>{total.polices}</b></div>
          <div className="ag-tuile"><small>Renouvellements</small><b>{total.renouvellements}</b></div>
        </div>
        <section className="ag-carte"><h2>Par mois <span className="repere">1</span></h2>
          {!s.donnees.mois.length ? <p className="doux">Aucune souscription avec votre code pour l'instant.</p> : <dl className="ag-details">
            {s.donnees.mois.map(m => <Fragment key={m.mois}><dt>{new Date(`${m.mois}-01T00:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</dt>
              <dd>{m.polices} police(s) · {m.renouvellements} renouv. · {montant(m.commissions)} GNF</dd></Fragment>)}</dl>}
        </section>
        <Message>Statistiques anonymes : jamais l'identité des clients <span className="repere">1</span>. Facture mensuelle de commissions préparée par le système, émise par code, payée par la Compagnie sous 30 jours <span className="repere">2</span> : <Link to="/agent/factures">mes factures</Link>.</Message>
        <Message type="attention">Vous ne pouvez ni encaisser ni émettre : les clients souscrivent avec votre code et paient la Compagnie <span className="repere">3</span>.</Message>
      </>}
    </>
  );
}
