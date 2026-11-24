/** CM-01 Registre des intervenants et agrément (COM-RG-060 à 066) ; CM-10 onglet Émission (COM-RG-002). */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, date } from '../../noyau/api';
import { Carte, Champ, Chargement, ChoixTiers, DepotPiece, LienTiers, Message, MessageErreur, Modale, Page, Statut, useAvis } from '../../noyau/composants';
import { useAction, useDonnees } from '../../noyau/donnees';
import { useSession } from '../../noyau/session';

export interface Intervenant {
  id: string; role: string; statut: string; agrement_accorde_le: string | null; emission_activee: boolean; date_entree: string; date_sortie: string | null; numero_inscription: string | null;
  traite: boolean; controles_conformite_le: string | null; tiers_id: string; code_tiers: string; nom: string; prenoms: string | null; rattachement_id: string | null; rattachement: string | null; bureaux: string[];
}
export const ROLES: Record<string, string> = { AGENT_GENERAL: 'Agent général', COLLABORATEUR: 'Collaborateur', JUNIOR: 'Junior', PRESCRIPTEUR: 'Prescripteur', CANAL_DIGITAL: 'Canal digital' };
const STATUTS = ['EN_AGREMENT', 'ACTIF', 'SUSPENDU', 'SORTI'];
const nomDe = (i: Intervenant) => `${i.prenoms ?? ''} ${i.nom}`.trim();

function agrement(i: Intervenant) {
  if (i.role === 'JUNIOR') return i.controles_conformite_le ? `Contrôles validés le ${date(i.controles_conformite_le)}` : 'Contrôles en cours';
  if (i.agrement_accorde_le) return `${date(i.agrement_accorde_le)} · visa Conformité`;
  return i.traite ? 'Traité déposé, agrément à demander' : 'Traité ou contrat à déposer';
}

export function PageIntervenants() {
  const { peut } = useSession();
  const [params, setParams] = useSearchParams();
  const role = params.get('role') ?? '', statut = params.get('statut') ?? '';
  const liste = useDonnees<Intervenant[]>(`/intervenants?${new URLSearchParams(Object.entries({ role, statut }).filter(([, v]) => v))}`);
  const [choisi, setChoisi] = useState<string | null>(null);
  const [nouveau, setNouveau] = useState<string | null>(null);
  const { avis, Avis } = useAvis();
  const filtrer = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p); };
  const fiche = liste.donnees?.find(i => i.id === choisi);

  return (
    <Page fil={['Commercial', 'Intervenants']} titre="Registre des intervenants">
      <div className="filtres">
        <span className="repere">1</span>
        <select value={role} onChange={e => filtrer('role', e.target.value)}><option value="">Rôle : tous</option>{Object.entries(ROLES).map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select>
        <select value={statut} onChange={e => filtrer('statut', e.target.value)}><option value="">Statut : tous</option>{STATUTS.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ').toLowerCase()}</option>)}</select>
      </div>
      <Carte titre={`Intervenants (${liste.donnees?.length ?? 0})`} repere={2} actions={peut('AGREMENT:CREER') && <>
        <button className="bouton" onClick={() => setNouveau('AGENT_GENERAL')}>+ Agréer un agent général</button>
        <button className="bouton" onClick={() => setNouveau('PRESCRIPTEUR')}>+ Prescripteur</button>
        <button className="bouton secondaire" onClick={() => setNouveau('')}>+ Autre intervenant</button></>}>
        {liste.chargement ? <Chargement /> : !liste.donnees?.length ? <div className="vide">Aucun intervenant.</div> :
          <table className="tableau"><thead><tr><th>Intervenant</th><th>Rôle</th><th>Rattachement</th><th>Bureaux</th><th>Agrément</th><th>Émission</th><th>Statut</th></tr></thead>
            <tbody>{liste.donnees.map(i => <tr key={i.id} className="cliquable" onClick={() => setChoisi(i.id)}>
              <td>{nomDe(i)} <span className="doux code">{i.code_tiers}</span></td><td>{ROLES[i.role]}</td><td>{i.rattachement ?? '—'}</td><td>{i.bureaux.join(', ') || '—'}</td>
              <td>{agrement(i)}</td><td>{i.emission_activee ? <Statut couleur="vert">Activée</Statut> : '—'}</td><td>{i.role === 'JUNIOR' && i.statut === 'ACTIF' && !i.controles_conformite_le ? <Statut couleur="gris">Prospection seule</Statut> : <Statut valeur={i.statut} />}</td></tr>)}</tbody></table>}
      </Carte>
      <Message type="attention">Un junior travaille en prospection seule tant que ses contrôles de conformité ne sont pas validés ; sans validation sous 15 jours, son compte est suspendu <span className="repere">3</span>.</Message>
      {fiche && <FicheIntervenant i={fiche} fermer={() => setChoisi(null)} apres={m => { avis(m); void liste.recharger(); }} />}
      {nouveau !== null && <NouvelIntervenant role={nouveau} agents={(liste.donnees ?? []).filter(i => i.role === 'AGENT_GENERAL' && i.statut === 'ACTIF')} fermer={() => setNouveau(null)}
        apres={m => { setNouveau(null); avis(m); void liste.recharger(); }} />}
      <Avis />
    </Page>
  );
}

function NouvelIntervenant({ role: initial, agents, fermer, apres }: { role: string; agents: Intervenant[]; fermer: () => void; apres: (m: string) => void }) {
  const [tiers, setTiers] = useState<{ id: string; nom: string } | null>(null);
  const [role, setRole] = useState(initial || 'COLLABORATEUR');
  const [rattachementId, setRattachement] = useState('');
  const [numeroInscription, setNumero] = useState('');
  const action = useAction();
  const rattache = ['COLLABORATEUR', 'JUNIOR'].includes(role);
  const enregistrer = () => void action.executer(() => api('POST', '/intervenants', { tiersId: tiers!.id, role, rattachementId: rattache ? rattachementId : undefined, numeroInscription: numeroInscription || undefined }))
    .then(x => x && apres(`${ROLES[role]} enregistré : déposez le traité ou le contrat, puis demandez l'agrément.`));
  return (
    <Modale titre={`Nouvel intervenant${initial ? ` – ${ROLES[initial]}` : ''}`} fermer={fermer}>
      <div className="formulaire">
        <Champ libelle="Tiers (personne ou cabinet déjà au référentiel)" large><ChoixTiers valeur={tiers} choisir={setTiers} /></Champ>
        {!initial && <Champ libelle="Rôle"><select value={role} onChange={e => setRole(e.target.value)}>{Object.entries(ROLES).map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select></Champ>}
        {rattache && <Champ libelle="Agent général de rattachement"><select value={rattachementId} onChange={e => setRattachement(e.target.value)}><option value="">Choisir…</option>{agents.map(a => <option key={a.id} value={a.id}>{nomDe(a)}</option>)}</select></Champ>}
        <Champ libelle="N° d'inscription (registre, ORIAS…)" aide="Facultatif"><input value={numeroInscription} onChange={e => setNumero(e.target.value)} /></Champ>
      </div>
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton" disabled={!tiers || (rattache && !rattachementId) || action.enCours} onClick={enregistrer}>Enregistrer</button><button className="bouton secondaire" onClick={fermer}>Annuler</button></div>
    </Modale>
  );
}

function FicheIntervenant({ i, fermer, apres }: { i: Intervenant; fermer: () => void; apres: (m: string) => void }) {
  const { peut } = useSession();
  const conditions = useDonnees<{ manques: string[] }>(i.role === 'AGENT_GENERAL' ? `/intervenants/${i.id}/conditions-emission` : null);
  const [motif, setMotif] = useState('');
  const action = useAction();
  const faire = (chemin: string, corps: unknown, m: string) => void action.executer(() => api('POST', `/intervenants/${i.id}/${chemin}`, corps)).then(x => x !== undefined && (apres(m), fermer()));
  const gerer = peut('AGREMENT:CREER');
  return (
    <Modale titre={nomDe(i)} large fermer={fermer}>
      <dl className="details">
        <dt>Tiers</dt><dd><LienTiers id={i.tiers_id}>{i.code_tiers}</LienTiers></dd><dt>Rôle</dt><dd>{ROLES[i.role]}</dd>
        <dt>Rattachement</dt><dd>{i.rattachement ?? '—'}</dd><dt>Entrée</dt><dd>{date(i.date_entree)}{i.date_sortie && ` · sortie le ${date(i.date_sortie)}`}</dd>
        <dt>Bureaux gérés</dt><dd>{i.bureaux.join(', ') || '—'}</dd><dt>Agrément</dt><dd>{agrement(i)}</dd><dt>Statut</dt><dd><Statut valeur={i.statut} /></dd>
      </dl>
      {gerer && i.statut !== 'SORTI' && <>
        {['AGENT_GENERAL', 'PRESCRIPTEUR'].includes(i.role) && !i.agrement_accorde_le && <>
          <h3>Agrément</h3>
          <div className="filtres">
            <DepotPiece objetType="intervenant" objetId={i.id} typeDocument="TRAITE_NOMINATION" libelle={i.traite ? 'Remplacer le traité ou le contrat' : 'Déposer le traité ou le contrat signé'}
              depose={d => faire('traite', { documentId: d.id }, 'Traité enregistré.')} />
            <button className="bouton" disabled={!i.traite || action.enCours} onClick={() => faire('agrement', {}, 'Agrément soumis à la Direction commerciale puis à la Conformité.')}>Demander l'agrément</button>
          </div>
        </>}
        {i.role === 'JUNIOR' && !i.controles_conformite_le && peut('COMPTES_RESEAU:VALIDER') &&
          <div className="boutons"><button className="bouton" onClick={() => faire('controles-conformite', {}, 'Contrôles du junior validés.')}>Valider les contrôles de conformité</button></div>}
        {i.role === 'AGENT_GENERAL' && <>
          <h3>Émission <span className="doux">(CM-10)</span></h3>
          {i.emission_activee ? <Message type="succes">L'émission est activée : l'agent émet par débit de ses comptes de production.</Message> : conditions.donnees && (conditions.donnees.manques.length
            ? <Message type="attention" titre="Conditions non remplies"><ul>{conditions.donnees.manques.map(m => <li key={m}>{m}</li>)}</ul></Message>
            : <div className="boutons"><button className="bouton" onClick={() => faire('emission', {}, 'Émission activée.')}>Activer l'émission</button></div>)}
        </>}
        <h3>Statut</h3>
        <Champ libelle="Motif" large><input value={motif} onChange={e => setMotif(e.target.value)} placeholder="Obligatoire" /></Champ>
        <div className="boutons">
          {i.statut === 'SUSPENDU' ? <button className="bouton secondaire" disabled={!motif} onClick={() => faire('statut', { statut: 'ACTIF', motif }, 'Intervenant réactivé.')}>Réactiver</button>
            : <button className="bouton secondaire" disabled={!motif} onClick={() => faire('statut', { statut: 'SUSPENDU', motif }, 'Intervenant suspendu : ses accès sont bloqués.')}>Suspendre</button>}
          <button className="bouton danger" disabled={!motif} onClick={() => faire('statut', { statut: 'SORTI', motif }, 'Sortie enregistrée.')}>Enregistrer la sortie</button>
        </div>
      </>}
      <MessageErreur erreur={action.erreur} />
    </Modale>
  );
}
