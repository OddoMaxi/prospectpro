/** PR-08 Réclamations (§ 8.10) : file unique, échéance en jours ouvrables, affectation, réponse, escalade, indicateurs. */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, date, dateHeure } from '../../noyau/api';
import { Carte, Champ, Chargement, LienTiers, Message, MessageErreur, Modale, Page, Statut, useAvis } from '../../noyau/composants';
import { useAction, useDonnees } from '../../noyau/donnees';
import { useSession } from '../../noyau/session';

interface Ligne { id: string; numero: string; canal: string; objet: string; statut: string; echeance: string; cree_le: string; code_tiers: string; nom: string; prenoms: string | null; gestionnaire: string | null; en_retard: boolean }
interface Detail extends Ligne { tiers_id: string; description: string; reponse: string | null; repondu_le: string | null; gestionnaire_id: string | null; objet_type: string | null }
const OBJETS: Record<string, string> = { PRODUCTION: 'Production', SANTE: 'Santé', SINISTRE: 'Sinistre', COMMISSION: 'Commission', PORTAIL: 'Portail', DONNEES_PERSONNELLES: 'Données personnelles' };
const CANAUX = ['SMS', 'WHATSAPP', 'COURRIEL', 'APPLICATION', 'USSD', 'COURRIER'];

export function PageReclamations() {
  const { peut } = useSession();
  const [params, setParams] = useSearchParams();
  const filtres = { statut: params.get('statut') ?? '', objet: params.get('objet') ?? '', mes: params.get('mes') ?? '', enRetard: params.get('enRetard') ?? '' };
  const liste = useDonnees<Ligne[]>(`/reclamations?${new URLSearchParams(Object.entries(filtres).filter(([, v]) => v)).toString()}`);
  const ind = useDonnees<{ total: number; repondues: number; dans_les_delais: number; en_retard: number; escaladees: number; delai_moyen_jours: number | null }>('/reclamations/indicateurs');
  const [choisie, setChoisie] = useState<string | null>(null);
  const [nouvelle, setNouvelle] = useState(false);
  const { avis, Avis } = useAvis();
  const filtrer = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p); };
  const rafraichir = (m: string) => { avis(m); void liste.recharger(); void ind.recharger(); };

  return (
    <Page fil={['Production', 'Réclamations']} titre="Réclamations" actions={peut('RECLAMATIONS:CREER') && <button className="bouton" onClick={() => setNouvelle(true)}>+ Enregistrer une réclamation</button>}>
      {ind.donnees && <div className="grille quatre" style={{ marginBottom: 18 }}>
        <div className="indicateur"><small>Reçues depuis le 1er janvier</small><b>{ind.donnees.total}</b><span>{ind.donnees.repondues} répondues</span></div>
        <div className="indicateur"><small>Répondues dans les délais</small><b>{ind.donnees.repondues ? Math.round(100 * ind.donnees.dans_les_delais / ind.donnees.repondues) : 0} %</b><span>délai moyen {ind.donnees.delai_moyen_jours ?? '—'} j</span></div>
        <div className="indicateur"><small>En retard</small><b style={{ color: ind.donnees.en_retard ? 'var(--rouge)' : undefined }}>{ind.donnees.en_retard}</b><span>échéance dépassée</span></div>
        <div className="indicateur"><small>Escaladées</small><b>{ind.donnees.escaladees}</b><span>sans réponse à l'échéance</span></div>
      </div>}
      <div className="filtres">
        <select value={filtres.statut} onChange={e => filtrer('statut', e.target.value)}><option value="">Tous les statuts</option>{['OUVERTE', 'AFFECTEE', 'EN_COURS', 'ESCALADEE', 'REPONDUE', 'CLOSE'].map(s => <option key={s} value={s}>{s.replace('_', ' ').toLowerCase()}</option>)}</select>
        <select value={filtres.objet} onChange={e => filtrer('objet', e.target.value)}><option value="">Tous les objets</option>{Object.entries(OBJETS).map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select>
        <label><input type="checkbox" checked={filtres.mes === '1'} onChange={e => filtrer('mes', e.target.checked ? '1' : '')} /> Qui me sont affectées</label>
        <label><input type="checkbox" checked={filtres.enRetard === '1'} onChange={e => filtrer('enRetard', e.target.checked ? '1' : '')} /> En retard</label>
      </div>
      <Carte titre="File des réclamations" repere={1}>
        {liste.chargement ? <Chargement /> : liste.donnees?.length === 0 ? <div className="vide">Aucune réclamation.</div> :
          <table className="tableau"><thead><tr><th>Numéro</th><th>Réclamant</th><th>Objet</th><th>Canal</th><th>Reçue le</th><th>Échéance</th><th>Gestionnaire</th><th>Statut</th></tr></thead>
            <tbody>{liste.donnees?.map(r => <tr key={r.id} className="cliquable" onClick={() => setChoisie(r.id)}>
              <td className="code">{r.numero}</td><td>{r.prenoms} {r.nom}</td><td>{OBJETS[r.objet]}</td><td>{r.canal.toLowerCase()}</td><td>{date(r.cree_le)}</td>
              <td>{r.en_retard ? <Statut couleur="rouge">{date(r.echeance)}</Statut> : date(r.echeance)}</td><td>{r.gestionnaire ?? '—'}</td><td><Statut valeur={r.statut} /></td></tr>)}</tbody></table>}
      </Carte>
      <Message><span className="repere">2</span> Module unique : production, santé, sinistres (dont le réexamen d'un rejet), commissions et portails y aboutissent. Réponse due sous 15 jours ouvrables (paramètre) ; au-delà, escalade automatique.</Message>
      {choisie && <Fiche id={choisie} fermer={() => setChoisie(null)} apres={m => { setChoisie(null); rafraichir(m); }} />}
      {nouvelle && <Nouvelle fermer={() => setNouvelle(false)} apres={m => { setNouvelle(false); rafraichir(m); }} />}
      <Avis />
    </Page>
  );
}

function Fiche({ id, fermer, apres }: { id: string; fermer: () => void; apres: (m: string) => void }) {
  const { moi, peut } = useSession();
  const { donnees: r } = useDonnees<Detail>(`/reclamations/${id}`);
  const gestionnaires = useDonnees<{ id: string; identifiant: string; nom: string; prenoms: string | null }[]>(peut('RECLAMATIONS:MODIFIER') ? '/reclamations/gestionnaires' : null);
  const [gestionnaireId, setGestionnaireId] = useState('');
  const [reponse, setReponse] = useState('');
  const action = useAction();
  if (!r) return <Modale titre="Réclamation" fermer={fermer}><Chargement /></Modale>;
  const moiAffecte = r.gestionnaire_id === moi?.id;
  const faire = (chemin: string, corps: unknown, m: string) => void action.executer(() => api('POST', `/reclamations/${id}/${chemin}`, corps)).then(x => x !== undefined && apres(m));
  return (
    <Modale titre={`Réclamation ${r.numero}`} large fermer={fermer}>
      <dl className="details"><dt>Réclamant</dt><dd><LienTiers id={r.tiers_id}>{r.prenoms} {r.nom}</LienTiers> <span className="doux code">{r.code_tiers}</span></dd>
        <dt>Objet</dt><dd>{OBJETS[r.objet]} {r.objet_type && <span className="doux">({r.objet_type})</span>}</dd><dt>Canal</dt><dd>{r.canal.toLowerCase()}</dd>
        <dt>Reçue le</dt><dd>{dateHeure(r.cree_le)}</dd><dt>Échéance</dt><dd>{date(r.echeance)} {r.en_retard && <Statut couleur="rouge">En retard</Statut>}</dd>
        <dt>Statut</dt><dd><Statut valeur={r.statut} /></dd><dt>Gestionnaire</dt><dd>{r.gestionnaire ?? '—'}</dd></dl>
      <h3>Description</h3><p style={{ whiteSpace: 'pre-wrap' }}>{r.description}</p>
      {r.reponse && <><h3>Réponse du {dateHeure(r.repondu_le)}</h3><Message type="succes">{r.reponse}</Message></>}
      {peut('RECLAMATIONS:MODIFIER') && !['REPONDUE', 'CLOSE'].includes(r.statut) && <>
        <h3>Affectation</h3>
        <div className="filtres"><select value={gestionnaireId} onChange={e => setGestionnaireId(e.target.value)}><option value="">Choisir un gestionnaire habilité…</option>
          {gestionnaires.donnees?.map(g => <option key={g.id} value={g.id}>{g.prenoms} {g.nom} ({g.identifiant})</option>)}</select>
          <button className="bouton secondaire" disabled={!gestionnaireId || action.enCours} onClick={() => faire('affectation', { gestionnaireId }, 'Réclamation affectée.')}>Affecter</button></div>
      </>}
      {moiAffecte && r.statut === 'AFFECTEE' && <div className="boutons"><button className="bouton secondaire" onClick={() => faire('prise-en-charge', {}, 'Réclamation prise en charge.')}>Prendre en charge</button></div>}
      {moiAffecte && ['AFFECTEE', 'EN_COURS', 'ESCALADEE'].includes(r.statut) && <>
        <h3>Réponse</h3><Champ libelle="Réponse au réclamant (il en est informé par SMS)"><textarea rows={4} value={reponse} onChange={e => setReponse(e.target.value)} /></Champ>
        <div className="boutons"><button className="bouton valider" disabled={!reponse.trim() || action.enCours} onClick={() => faire('reponse', { reponse }, 'Réponse enregistrée et notifiée.')}>Répondre</button></div>
      </>}
      {r.statut === 'REPONDUE' && peut('RECLAMATIONS:MODIFIER') && <div className="boutons"><button className="bouton secondaire" onClick={() => faire('cloture', {}, 'Réclamation close.')}>Clore</button></div>}
      <MessageErreur erreur={action.erreur} />
    </Modale>
  );
}

function Nouvelle({ fermer, apres }: { fermer: () => void; apres: (m: string) => void }) {
  const [q, setQ] = useState('');
  const [trouves, setTrouves] = useState<{ id: string; code_tiers: string; nom: string; prenoms: string | null }[]>([]);
  const [tiers, setTiers] = useState<{ id: string; nom: string; prenoms: string | null } | null>(null);
  const [d, setD] = useState({ canal: 'SMS', objet: 'PRODUCTION', description: '' });
  const action = useAction();
  return (
    <Modale titre="Enregistrer une réclamation" large fermer={fermer}>
      {!tiers ? <>
        <div className="filtres"><input placeholder="Réclamant : nom, téléphone ou code tiers" value={q} onChange={e => setQ(e.target.value)} />
          <button className="bouton secondaire" onClick={() => void api<typeof trouves>('GET', `/tiers?recherche=${encodeURIComponent(q)}`).then(setTrouves)}>Rechercher</button></div>
        <table className="tableau"><tbody>{trouves.map(t => <tr key={t.id} className="cliquable" onClick={() => setTiers(t)}><td className="code">{t.code_tiers}</td><td>{t.prenoms} {t.nom}</td></tr>)}</tbody></table>
      </> : <Message type="succes">Réclamant : <b>{tiers.prenoms} {tiers.nom}</b> <button className="lien" onClick={() => setTiers(null)}>changer</button></Message>}
      <div className="formulaire" style={{ '--colonnes': 2 } as React.CSSProperties}>
        <Champ libelle="Canal de réception"><select value={d.canal} onChange={e => setD({ ...d, canal: e.target.value })}>{CANAUX.map(c => <option key={c}>{c}</option>)}</select></Champ>
        <Champ libelle="Objet"><select value={d.objet} onChange={e => setD({ ...d, objet: e.target.value })}>{Object.entries(OBJETS).map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select></Champ>
        <Champ libelle="Description" large><textarea rows={5} value={d.description} onChange={e => setD({ ...d, description: e.target.value })} /></Champ>
      </div>
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton" disabled={!tiers || !d.description.trim() || action.enCours} onClick={() => void action.executer(() => api<{ numero: string; echeance: string }>('POST', '/reclamations', { ...d, tiersId: tiers!.id })).then(r => r && apres(`Réclamation ${r.numero} enregistrée ; réponse due le ${date(r.echeance)}. Accusé de réception envoyé.`))}>Enregistrer</button>
        <button className="bouton secondaire" onClick={fermer}>Annuler</button></div>
    </Modale>
  );
}
