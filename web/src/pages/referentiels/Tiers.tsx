/** RF-02 Tiers : recherche, création et doublons (REF-RG-001, 002). */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, date, ErreurApi } from '../../noyau/api';
import { Carte, Champ, Chargement, Message, MessageErreur, Page, Statut } from '../../noyau/composants';
import { useAction } from '../../noyau/donnees';
import { useSession } from '../../noyau/session';

interface Trouve { id: string; code_tiers: string; nature: string; nom: string; prenoms: string | null; date_naissance: string | null; telephone: string | null; statut: string }
interface Candidat { id: string; code_tiers: string; nom: string; prenoms: string | null; score: number; motifs: string[] }

export function PageTiers() {
  const [params, setParams] = useSearchParams();
  const { peut } = useSession();
  const [saisie, setSaisie] = useState(params.get('recherche') ?? '');
  const [resultats, setResultats] = useState<Trouve[] | null>(null);
  const action = useAction();
  const recherche = params.get('recherche') ?? '';
  useEffect(() => {
    setSaisie(recherche);
    if (recherche.trim().length >= 2) void action.executer(() => api<Trouve[]>('GET', `/tiers?recherche=${encodeURIComponent(recherche)}`)).then(r => setResultats(r ?? []));
    else setResultats(null);
  }, [recherche]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Page fil={['Référentiels', 'Tiers']} titre="Tiers" actions={peut('TIERS:CREER') && <Link className="bouton" to="/referentiels/tiers/nouveau">+ Nouveau tiers</Link>}>
      <Carte>
        <form className="filtres" onSubmit={e => { e.preventDefault(); setParams({ recherche: saisie }); }}>
          <input style={{ minWidth: 360 }} autoFocus placeholder="Nom et prénoms, téléphone ou code tiers" value={saisie} onChange={e => setSaisie(e.target.value)} />
          <button className="bouton">Rechercher</button>
        </form>
        <MessageErreur erreur={action.erreur} />
        {action.enCours && <Chargement />}
        {resultats && !action.enCours && (resultats.length === 0 ? <div className="vide">Aucune fiche ne correspond. Une personne n'a qu'une fiche, quels que soient ses rôles : vérifiez l'orthographe avant d'en créer une.</div> :
          <table className="tableau"><thead><tr><th>Code</th><th>Nom</th><th>Nature</th><th>Né(e) le</th><th>Téléphone</th><th>Statut</th></tr></thead>
            <tbody>{resultats.map(t => <tr key={t.id}><td className="code"><Link to={`/referentiels/tiers/${t.id}`}>{t.code_tiers}</Link></td>
              <td><Link to={`/referentiels/tiers/${t.id}`}>{t.prenoms} {t.nom}</Link></td><td>{t.nature === 'PHYSIQUE' ? 'Personne physique' : 'Personne morale'}</td>
              <td>{date(t.date_naissance)}</td><td>{t.telephone ?? '—'}</td><td><Statut valeur={t.statut} /></td></tr>)}</tbody></table>)}
        {!resultats && <Message>Saisissez au moins deux caractères. La recherche porte sur le nom et les prénoms, le téléphone et le code tiers.</Message>}
      </Carte>
    </Page>
  );
}

const VIDE = { nature: 'PHYSIQUE', nom: '', prenoms: '', date_naissance: '', sexe: '', type_piece: '', numero_piece: '', telephone: '', courriel: '', adresse: '', rccm: '', nif: '' };

export function PageNouveauTiers() {
  const aller = useNavigate();
  const { peut } = useSession();
  const [t, setT] = useState(VIDE);
  const [candidats, setCandidats] = useState<Candidat[]>([]);
  const [blocage, setBlocage] = useState<ErreurApi | null>(null);
  const [motif, setMotif] = useState('');
  const action = useAction();
  const physique = t.nature === 'PHYSIQUE';
  const corps = () => Object.fromEntries(Object.entries(t).filter(([k, v]) => v !== '' && (physique ? !['rccm'].includes(k) : !['prenoms', 'date_naissance', 'sexe'].includes(k))));

  const verifier = async () => {
    const c = await api<Candidat[]>('POST', '/tiers/doublons', corps()).catch(() => []);
    setCandidats(c);
  };
  const creer = async (decision?: string) => {
    setBlocage(null);
    try {
      const r = await api<{ id: string }>('POST', '/tiers', { ...corps(), ...(decision ? { decisionDoublon: { motif: decision } } : {}) });
      aller(`/referentiels/tiers/${r.id}`);
    } catch (e) {
      const err = e as ErreurApi;
      const d = err.details as { candidats?: Candidat[] } | undefined;
      if (d?.candidats) { setCandidats(d.candidats); setBlocage(err); } else action.setErreur(err);
    }
  };
  const champ = (k: keyof typeof VIDE) => ({ value: t[k], onChange: (e: { target: { value: string } }) => setT({ ...t, [k]: e.target.value }), onBlur: () => { if (t.nom) void verifier(); } });

  return (
    <Page fil={['Référentiels', 'Tiers', 'Nouveau']} titre="Nouveau tiers">
      <Carte titre="Identité" repere={1}>
        <div className="formulaire">
          <Champ libelle="Nature" aide="Non modifiable après création"><select value={t.nature} onChange={e => setT({ ...t, nature: e.target.value })}>
            <option value="PHYSIQUE">Personne physique</option><option value="MORALE">Personne morale</option></select></Champ>
          <Champ libelle={physique ? 'Nom' : 'Raison sociale'}><input {...champ('nom')} /></Champ>
          {physique && <Champ libelle="Prénoms"><input {...champ('prenoms')} /></Champ>}
          {physique && <Champ libelle="Date de naissance"><input type="date" {...champ('date_naissance')} /></Champ>}
          {physique && <Champ libelle="Sexe"><select {...champ('sexe')}><option value="">—</option><option value="F">Féminin</option><option value="M">Masculin</option></select></Champ>}
          {!physique && <Champ libelle="RCCM"><input {...champ('rccm')} /></Champ>}
          <Champ libelle="NIF"><input {...champ('nif')} /></Champ>
          <Champ libelle="Type de pièce"><select {...champ('type_piece')}><option value="">—</option><option>CNI</option><option>PASSEPORT</option><option>CARTE_ELECTEUR</option><option>EXTRAIT_NAISSANCE</option></select></Champ>
          <Champ libelle="Numéro de pièce"><input {...champ('numero_piece')} /></Champ>
          <Champ libelle="Téléphone" aide="Ex. +224622000001"><input {...champ('telephone')} /></Champ>
          <Champ libelle="E-mail"><input type="email" {...champ('courriel')} /></Champ>
          <Champ libelle="Adresse" large><input {...champ('adresse')} /></Champ>
        </div>
      </Carte>
      {blocage && <Message type="erreur" titre="Création bloquée"><span className="repere">2</span> {blocage.message}</Message>}
      {candidats.length > 0 && <Carte titre="Fiches proches" repere={3}>
        <table className="tableau"><thead><tr><th>Fiche existante</th><th>Ressemblance</th><th>Motifs</th><th /></tr></thead>
          <tbody>{candidats.map(c => <tr key={c.id}><td><Link to={`/referentiels/tiers/${c.id}`}>{c.prenoms} {c.nom}</Link> <span className="doux code">({c.code_tiers})</span></td>
            <td><Statut couleur={c.score >= 90 ? 'rouge' : c.score >= 70 ? 'orange' : 'gris'}>{c.score} %</Statut></td><td className="doux">{c.motifs.join(', ')}</td>
            <td><Link to={`/referentiels/tiers/${c.id}`}>Ouvrir la fiche</Link></td></tr>)}</tbody></table>
        {!blocage && <Message type="attention">Une personne n'a qu'une fiche, quels que soient ses rôles. Vérifiez qu'il ne s'agit pas de la même personne avant de créer.</Message>}
      </Carte>}
      <MessageErreur erreur={action.erreur} />
      <div className="boutons">
        {candidats.length > 0 && <button className="bouton" onClick={() => aller(`/referentiels/tiers/${candidats[0]!.id}`)}>Utiliser la fiche existante</button>}
        {!blocage && <button className={candidats.length ? 'bouton secondaire' : 'bouton'} disabled={!t.nom} onClick={() => void creer()}>Créer la fiche</button>}
        {blocage?.code === 'DOUBLON_PROBABLE' && (peut('TIERS:VALIDER')
          ? <><input style={{ minWidth: 320, padding: '9px 12px', borderRadius: 8, border: '1px solid #cfd6e3' }} placeholder="Motif de la décision (ex. homonyme vérifié sur pièce)" value={motif} onChange={e => setMotif(e.target.value)} />
            <button className="bouton secondaire" disabled={motif.trim().length < 5} onClick={() => void creer(motif)}>Créer malgré la ressemblance</button></>
          : <Message type="info">Seul un gestionnaire habilité peut décider de créer malgré la ressemblance : transmettez-lui le dossier.</Message>)}
      </div>
    </Page>
  );
}
