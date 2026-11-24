/** AD-05 Journal d'audit (§ 4.6, chapitre 15) : recherche, export tracé, vérification de la chaîne. */
import { useState } from 'react';
import { api, dateHeure, ouvrirFichier } from '../../noyau/api';
import { Carte, Chargement, Message, MessageErreur, Modale, Page, Statut } from '../../noyau/composants';
import { useAction, useDonnees } from '../../noyau/donnees';
import { useSession } from '../../noyau/session';

interface Ligne { rang: number; horodatage: string; utilisateur: string | null; adresse_ip: string | null; appareil: string | null; action: string; objet_type: string; objet_id: string | null; valeur_avant: unknown; valeur_apres: unknown }
const ACTIONS = ['CONNEXION', 'ECHEC_CONNEXION', 'DECONNEXION', 'CONSULTATION', 'CREATION', 'MODIFICATION', 'VALIDATION', 'REJET', 'SUPPRESSION', 'EXPORT', 'PARAMETRAGE'];

export function PageAudit() {
  const { peut } = useSession();
  const [f, setF] = useState({ action: '', objetType: '', du: '', au: '' });
  const requete = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const { donnees, erreur, chargement } = useDonnees<Ligne[]>(`/admin/audit?${requete}`);
  const [verification, setVerification] = useState<{ lignes: number; premiereAlteration: number | null } | null>(null);
  const [detail, setDetail] = useState<Ligne | null>(null);
  const action = useAction();

  return (
    <Page fil={['Administration', 'Journal d\'audit']} titre="Journal d'audit" actions={<>
      <button className="bouton secondaire" disabled={action.enCours} onClick={() => void action.executer(() => api<{ lignes: number; premiereAlteration: number | null }>('GET', '/admin/audit/verification')).then(v => v && setVerification(v))}>Vérifier l'intégrité</button>
      {peut('AUDIT:EXPORTER') && <button className="bouton" onClick={() => void ouvrirFichier('GET', `/admin/audit/export?${requete}`, undefined, 'journal-audit.csv')}>Exporter (CSV)</button>}
    </>}>
      {verification && (verification.premiereAlteration === null
        ? <Message type="succes" titre="Chaîne intègre"><span className="repere">3</span> {verification.lignes} lignes vérifiées : aucune altération.</Message>
        : <Message type="erreur" titre="Altération détectée">la ligne n° {verification.premiereAlteration} ne correspond plus à son empreinte. Alertez immédiatement la Conformité.</Message>)}
      <MessageErreur erreur={action.erreur} />
      <div className="filtres"><span className="repere">1</span>
        <select value={f.action} onChange={e => setF({ ...f, action: e.target.value })}><option value="">Toutes les actions</option>{ACTIONS.map(a => <option key={a}>{a}</option>)}</select>
        <input placeholder="Objet (ex. tiers, utilisateur)" value={f.objetType} onChange={e => setF({ ...f, objetType: e.target.value })} />
        <label>Du <input type="date" value={f.du} onChange={e => setF({ ...f, du: e.target.value })} /></label>
        <label>au <input type="date" value={f.au} onChange={e => setF({ ...f, au: e.target.value })} /></label>
      </div>
      <Carte>
        <MessageErreur erreur={erreur} />
        {chargement ? <Chargement /> : <div className="defile"><table className="tableau"><thead><tr><th>N°</th><th>Date et heure</th><th>Utilisateur</th><th>Action</th><th>Objet</th><th>Adresse</th></tr></thead>
          <tbody>{donnees?.map(l => <tr key={l.rang} className="cliquable" onClick={() => setDetail(l)}><td className="code">{l.rang}</td><td>{dateHeure(l.horodatage)}</td><td>{l.utilisateur ?? <span className="doux">système</span>}</td>
            <td><Statut valeur={l.action.startsWith('ECHEC') || l.action === 'REJET' ? 'REJETE' : l.action === 'EXPORT' || l.action === 'CONSULTATION' ? 'INFO' : 'INACTIF'}>{l.action.replace('_', ' ').toLowerCase()}</Statut></td>
            <td>{l.objet_type}</td><td className="doux">{l.adresse_ip ?? ''}</td></tr>)}</tbody></table>
          {donnees?.length === 500 && <p className="doux">Les 500 lignes les plus récentes sont affichées : précisez les filtres.</p>}</div>}
      </Carte>
      {detail && <Modale titre={`Ligne n° ${detail.rang}`} large fermer={() => setDetail(null)}>
        <dl className="details"><dt>Date et heure</dt><dd>{dateHeure(detail.horodatage)}</dd><dt>Utilisateur</dt><dd>{detail.utilisateur ?? 'système'}</dd>
          <dt>Appareil</dt><dd className="doux">{detail.appareil ?? '—'} {detail.adresse_ip ?? ''}</dd><dt>Objet</dt><dd>{detail.objet_type} <span className="code doux">{detail.objet_id}</span></dd></dl>
        <h3>Valeurs avant <span className="repere">2</span></h3><pre className="code" style={{ whiteSpace: 'pre-wrap', background: '#f6f8fc', padding: 10, borderRadius: 8 }}>{JSON.stringify(detail.valeur_avant, null, 2) ?? '—'}</pre>
        <h3>Valeurs après</h3><pre className="code" style={{ whiteSpace: 'pre-wrap', background: '#f6f8fc', padding: 10, borderRadius: 8 }}>{JSON.stringify(detail.valeur_apres, null, 2) ?? '—'}</pre>
        <p className="doux" style={{ fontSize: 12 }}>Les secrets (mots de passe, codes, numéros de compte) sont masqués dans le journal.</p>
      </Modale>}
    </Page>
  );
}
