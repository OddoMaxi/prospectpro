/**
 * Souscription en 8 étapes (AG-04 à AG-10, AG-14) : client, produit, assurés, bénéficiaires, pièces, tarif, récapitulatif, émission.
 * Le dossier est enregistré à chaque étape (il expire après 30 jours) ; toute modification annule le tarif et l'acceptation.
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, aujourdhui, date, ErreurApi, montant, ouvrirFichier } from '../noyau/api';
import { Chargement, ChoixTiers, DepotPiece, Message, MessageErreur } from '../noyau/composants';
import { useAction, useDonnees } from '../noyau/donnees';
import { Entete, estAgentGeneral, useAgent } from './Agent';

type Qualite = 'ASSURE_PRINCIPAL' | 'CONJOINT' | 'ENFANT';
interface Assure { tiersId: string; qualite: Qualite; categorieEnfant?: 'A_CHARGE' | 'ETUDIANT' | 'HANDICAPE'; parentTiersId?: string }
interface Donnees {
  dateEffet: string; assures: Assure[]; beneficiaires?: { mode: 'NOMINATIVE' | 'CLAUSE_TYPE'; liste: { tiersId: string; quotite: number; rang: number }[] };
  consentementsDeces: { tiersId: string; preuveId: string }[]; pieces: { tiersId: string; type: string; documentId: string }[];
}
interface Dossier {
  id: string; numero_dossier: string; canal: string; souscripteur_id: string; produit_id: string; formule_id: string; bureau_id: string; etape_courante: number; donnees: Donnees;
  prime_nette: number | null; accessoires: number | null; taxes: number | null; prime_totale: number | null; acceptation_preuve_id: string | null; statut: string; expire_le: string;
  motif_rejet: string | null; police_id: string | null; anomalies: string[];
}
interface Produit { id: string; code: string; libelle: string; age_min: number; age_max: number; documents_exiges: string[] | null; formules: { id: string; code: string; libelle: string }[] }
interface Personne { id: string; nom: string; prenoms: string | null; date_naissance: string | null; telephone: string | null; telephone_verifie: boolean | null; code_tiers: string }
interface Tarif { primeNette: number; accessoires: number; primeTotale: number; taxes: { libelle: string; taux: number; montant: number }[]; lignes: { qualite: string; age: number; primeNette: number }[] }

const ETAPES = ['Client', 'Produit', 'Assurés', 'Bénéf.', 'Pièces', 'Tarif', 'Récap.', 'Émission'];
const QUALITES: Record<Qualite, string> = { ASSURE_PRINCIPAL: 'Assuré principal', CONJOINT: 'Conjoint', ENFANT: 'Enfant' };
const nomDe = (p?: Personne) => (p ? `${p.prenoms ?? ''} ${p.nom}`.trim() : '…');

function Etapes({ courante, atteinte, aller }: { courante: number; atteinte: number; aller: (n: number) => void }) {
  return (
    <ol className="ag-etapes" aria-label="Étapes de la souscription">
      {ETAPES.map((l, i) => { const n = i + 1; return (
        <li key={l} className={n === courante ? 'courante' : n < atteinte ? 'faite' : ''}>
          <button disabled={n > atteinte || n < 3 && atteinte >= 3} onClick={() => aller(n)}><span>{n < atteinte && n !== courante ? '✓' : n}</span>{l}</button>
        </li>); })}
    </ol>
  );
}

export function PageSouscription() {
  const { id } = useParams();
  return id ? <DossierEnCours key={id} id={id} /> : <NouveauDossier />;
}

// ---------------------------------------------------------------- étapes 1 et 2 (AG-04)

function NouveauDossier() {
  const { accueil } = useAgent();
  const aller = useNavigate();
  const catalogue = useDonnees<Produit[]>('/catalogue');
  const [params] = useSearchParams();
  const prospect = params.get('client') ? { id: params.get('client')!, nom: params.get('nom') ?? 'Client' } : null;
  const [etape, setEtape] = useState(prospect ? 2 : 1);
  const [client, setClient] = useState<{ id: string; nom: string } | null>(prospect);
  const [codePrescripteur, setCode] = useState('');
  const [produitId, setProduit] = useState('');
  const [formuleId, setFormule] = useState('');
  const [bureauId, setBureau] = useState(accueil.bureaux[0]?.id ?? '');
  const action = useAction();
  const produit = catalogue.donnees?.find(p => p.id === produitId);
  if (accueil.intervenant.prospectionSeule) return <><Entete titre="Nouvelle souscription" /><Message type="attention">Vous travaillez en prospection seule tant que vos contrôles de conformité ne sont pas validés.</Message></>;
  const ouvrir = () => void action.executer(() => api<{ id: string }>('POST', '/dossiers', { souscripteurId: client!.id, formuleId, bureauId, codePrescripteur: codePrescripteur.trim() || undefined }))
    .then(r => r && aller(`/agent/souscrire/${r.id}`, { replace: true }));
  return (
    <>
      <Entete titre="Nouvelle souscription" retour="/agent" />
      <Etapes courante={etape} atteinte={client ? 2 : 1} aller={setEtape} />
      {etape === 1 && <section className="ag-carte">
        <h2>Client</h2>
        <p className="doux">Recherchez le client au référentiel ; s'il n'existe pas, créez sa fiche.</p>
        <ChoixPersonne valeur={client} choisir={setClient} />
        <button className="bouton large" disabled={!client} onClick={() => setEtape(2)}>Continuer</button>
        <Link to="/agent/dossiers">Reprendre un dossier en cours</Link>
      </section>}
      {etape === 2 && <>
        <section className="ag-carte"><h2>Client</h2><div className="ag-ligne statique"><div><b>{client?.nom}</b></div><span className="statut vert">Identifié</span></div></section>
        <section className="ag-carte">
          <h2>Produit et formule <span className="repere">2</span></h2>
          {!catalogue.donnees ? <Chargement /> : <>
            <label className="ag-champ">Produit<select value={produitId} onChange={e => { setProduit(e.target.value); setFormule(''); }}><option value="">Choisir…</option>
              {catalogue.donnees.map(p => <option key={p.id} value={p.id}>{p.libelle} ({p.code})</option>)}</select></label>
            {produit && <label className="ag-champ">Formule<select value={formuleId} onChange={e => setFormule(e.target.value)}><option value="">Choisir…</option>
              {produit.formules.map(f => <option key={f.id} value={f.id}>{f.code} – {f.libelle}</option>)}</select></label>}
            {produit && <p className="doux">Assuré principal de {produit.age_min} à {produit.age_max} ans.</p>}
            <label className="ag-champ">Code prescripteur (facultatif)<input value={codePrescripteur} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Si le client en a un" autoCapitalize="characters" /></label>
            {accueil.bureaux.length > 1 && <label className="ag-champ">Bureau émetteur<select value={bureauId} onChange={e => setBureau(e.target.value)}>{accueil.bureaux.map(b => <option key={b.id} value={b.id}>{b.code} – {b.nom}</option>)}</select></label>}
          </>}
        </section>
        <Message>Dossier enregistré à chaque étape <span className="repere">3</span> ; il expire après 30 jours.</Message>
        <MessageErreur erreur={action.erreur} />
        <button className="bouton large" disabled={!formuleId || !bureauId || action.enCours} onClick={ouvrir}>Continuer</button>
      </>}
    </>
  );
}

/** Recherche d'une personne au référentiel, ou création de sa fiche (nom, prénoms, naissance, téléphone). */
export function ChoixPersonne({ valeur, choisir, sansTelephone }: { valeur: { id: string; nom: string } | null; choisir: (t: { id: string; nom: string } | null) => void; sansTelephone?: boolean }) {
  const [creation, setCreation] = useState(false);
  const [f, setF] = useState({ nom: '', prenoms: '', date_naissance: '', sexe: '', telephone: '' });
  const action = useAction();
  const [candidats, setCandidats] = useState<{ id: string; code_tiers: string; nom: string; prenoms: string | null }[]>([]);
  if (valeur || !creation) return <>
    <ChoixTiers valeur={valeur} choisir={choisir} />
    {!valeur && <button className="lien" onClick={() => setCreation(true)}>+ Créer la fiche d'une nouvelle personne</button>}
  </>;
  const creer = () => void action.executer(async () => {
    try {
      const r = await api<{ id: string }>('POST', '/tiers', { nature: 'PHYSIQUE', nom: f.nom.trim().toUpperCase(), prenoms: f.prenoms.trim() || undefined, date_naissance: f.date_naissance || undefined,
        sexe: f.sexe || undefined, telephone: f.telephone.replace(/\s/g, '') || undefined });
      return r;
    } catch (e) {
      if (e instanceof ErreurApi && (e.code === 'DOUBLON_PROBABLE' || e.code === 'TIERS_EXISTANT')) setCandidats((e.details as { candidats: typeof candidats }).candidats ?? []);
      throw e;
    }
  }).then(r => { if (r) { choisir({ id: r.id, nom: `${f.prenoms} ${f.nom.toUpperCase()}`.trim() }); setCreation(false); } });
  return (
    <div className="ag-sous-formulaire">
      <label className="ag-champ">Nom<input value={f.nom} onChange={e => setF({ ...f, nom: e.target.value })} autoCapitalize="characters" /></label>
      <label className="ag-champ">Prénoms<input value={f.prenoms} onChange={e => setF({ ...f, prenoms: e.target.value })} /></label>
      <label className="ag-champ">Date de naissance<input type="date" value={f.date_naissance} max={aujourdhui()} onChange={e => setF({ ...f, date_naissance: e.target.value })} /></label>
      <label className="ag-champ">Sexe<select value={f.sexe} onChange={e => setF({ ...f, sexe: e.target.value })}><option value="">—</option><option value="F">Féminin</option><option value="M">Masculin</option></select></label>
      {!sansTelephone && <label className="ag-champ">Téléphone<input type="tel" inputMode="tel" value={f.telephone} onChange={e => setF({ ...f, telephone: e.target.value })} placeholder="+224 6xx xx xx xx" /></label>}
      <MessageErreur erreur={action.erreur} />
      {candidats.length > 0 && <div className="ag-carte doux-fond"><b>Fiches proches :</b>{candidats.map(c => <button key={c.id} className="ag-ligne" onClick={() => { choisir({ id: c.id, nom: `${c.prenoms ?? ''} ${c.nom}`.trim() }); setCreation(false); }}>
        <div><b>{c.prenoms} {c.nom}</b><small>{c.code_tiers}</small></div><span className="lien">Choisir</span></button>)}</div>}
      <div className="ag-rangee"><button className="bouton" disabled={!f.nom.trim() || !f.date_naissance || action.enCours} onClick={creer}>Créer la fiche</button>
        <button className="bouton secondaire" onClick={() => setCreation(false)}>Annuler</button></div>
    </div>
  );
}

// ---------------------------------------------------------------- étapes 3 à 8

function DossierEnCours({ id }: { id: string }) {
  const { accueil, recharger } = useAgent();
  const d = useDonnees<Dossier>(`/dossiers/${id}`);
  const catalogue = useDonnees<Produit[]>('/catalogue');
  const formule = useDonnees<{ garanties: { type: string; libelle: string }[] }>(d.donnees ? `/catalogue/formules/${d.donnees.formule_id}` : null);
  const [personnes, setPersonnes] = useState<Record<string, Personne>>({});
  const [etape, setEtape] = useState<number | null>(null);
  const dossier = d.donnees;
  const ids = useMemo(() => dossier ? [...new Set([dossier.souscripteur_id, ...dossier.donnees.assures.map(a => a.tiersId), ...(dossier.donnees.beneficiaires?.liste ?? []).map(b => b.tiersId)])] : [], [dossier]);
  useEffect(() => {
    for (const t of ids.filter(x => !personnes[x])) void api<Personne>('GET', `/tiers/${t}`).then(p => setPersonnes(m => ({ ...m, [t]: p }))).catch(() => undefined);
  }, [ids, personnes]);
  if (d.erreur) return <><Entete titre="Souscription" retour="/agent/dossiers" /><MessageErreur erreur={d.erreur} /></>;
  if (!dossier || !catalogue.donnees) return <><Entete titre="Souscription" retour="/agent/dossiers" /><Chargement /></>;
  const produit = catalogue.donnees.find(p => p.id === dossier.produit_id);
  const formuleLib = produit?.formules.find(f => f.id === dossier.formule_id);
  const deces = (formule.donnees?.garanties ?? []).some(g => g.type === 'DECES');
  const atteinte = dossier.statut === 'EMIS' ? 9 : dossier.acceptation_preuve_id ? 8 : dossier.prime_totale !== null ? 7 : Math.max(3, Math.min(dossier.etape_courante + 1, 6));
  const courante = etape ?? Math.min(atteinte, 8);
  const ferme = !['BROUILLON', 'A_VALIDER'].includes(dossier.statut);
  const enregistrer = async (donnees: Donnees, n: number) => { await api('PUT', `/dossiers/${id}/donnees`, { donnees, etape: n }); await d.recharger(); };
  const suite = (n: number) => { setEtape(n); window.scrollTo(0, 0); };
  const props = { dossier, personnes, enregistrer, suite, produit, deces, recharger: async () => { await d.recharger(); await recharger(); } };
  return (
    <>
      <Entete titre={ETAPES[courante - 1] === 'Récap.' ? 'Récapitulatif' : `Souscription ${dossier.numero_dossier}`} retour="/agent/dossiers"
        sousTitre={`${nomDe(personnes[dossier.souscripteur_id])} · ${produit?.libelle ?? ''} ${formuleLib ? `– ${formuleLib.libelle}` : ''}`} />
      <Etapes courante={courante} atteinte={Math.min(atteinte, 8)} aller={suite} />
      {ferme && <Message type={dossier.statut === 'EMIS' ? 'succes' : 'attention'}>{dossier.statut === 'EMIS' ? 'Dossier émis.' : dossier.statut === 'REJETE' ? `Dossier rejeté : ${dossier.motif_rejet ?? ''}` : `Dossier ${dossier.statut.toLowerCase()}.`}</Message>}
      {dossier.statut === 'A_VALIDER' && !estAgentGeneral(accueil) && <Message>Dossier soumis à votre agent général : il le contrôle et l'émet.</Message>}
      {courante === 3 && <EtapeAssures {...props} />}
      {courante === 4 && <EtapeBeneficiaires {...props} />}
      {courante === 5 && <EtapePieces {...props} />}
      {courante === 6 && <EtapeTarif {...props} />}
      {courante === 7 && <EtapeRecap {...props} />}
      {courante === 8 && <EtapeEmission {...props} />}
    </>
  );
}

interface PropsEtape {
  dossier: Dossier; personnes: Record<string, Personne>; enregistrer: (d: Donnees, n: number) => Promise<void>; suite: (n: number) => void;
  produit?: Produit; deces: boolean; recharger: () => Promise<void>;
}

/** Anomalies bloquantes du dossier, rappelées à chaque étape. */
const Anomalies = ({ a, filtre }: { a: string[]; filtre?: (x: string) => boolean }) => {
  const l = filtre ? a.filter(filtre) : a;
  return l.length ? <Message type="attention" titre="À compléter"><ul>{l.map(x => <li key={x}>{x}</li>)}</ul></Message> : null;
};

// ---------------------------------------------------------------- étape 3 (AG-05)

function EtapeAssures({ dossier, personnes, enregistrer, suite, produit }: PropsEtape) {
  const [assures, setAssures] = useState<Assure[]>(dossier.donnees.assures);
  const [dateEffet, setDateEffet] = useState(dossier.donnees.dateEffet);
  const [ajout, setAjout] = useState<Qualite | null>(null);
  const [noms, setNoms] = useState<Record<string, string>>({});
  const action = useAction();
  const conjoints = assures.filter(a => a.qualite === 'CONJOINT');
  const nom = (t: string) => noms[t] ?? nomDe(personnes[t]);
  const ajouter = (t: { id: string; nom: string } | null) => {
    if (!t || !ajout) return;
    setNoms(n => ({ ...n, [t.id]: t.nom }));
    setAssures(a => [...a, { tiersId: t.id, qualite: ajout, ...(ajout === 'ENFANT' ? { categorieEnfant: 'A_CHARGE' as const } : {}) }]);
    setAjout(null);
  };
  const maj = (i: number, x: Partial<Assure>) => setAssures(a => a.map((y, j) => (j === i ? { ...y, ...x } : y)));
  const valider = () => void action.executer(() => enregistrer({ ...dossier.donnees, dateEffet, assures }, 3)).then(x => x !== undefined && suite(4));
  return (
    <>
      <section className="ag-carte">
        <h2>Date d'effet</h2>
        <input type="date" min={aujourdhui()} value={dateEffet} onChange={e => setDateEffet(e.target.value)} />
      </section>
      <section className="ag-carte">
        <h2>Personnes assurées <span className="repere">1</span></h2>
        {assures.map((a, i) => <div key={a.tiersId} className="ag-assure">
          <div className="ag-ligne statique"><div><b>{nom(a.tiersId)}</b><small>{QUALITES[a.qualite]}{personnes[a.tiersId]?.date_naissance ? ` · né(e) le ${date(personnes[a.tiersId]!.date_naissance)}` : ''}</small></div>
            {a.qualite !== 'ASSURE_PRINCIPAL' && <button className="lien" onClick={() => setAssures(x => x.filter((_, j) => j !== i))}>Retirer</button>}</div>
          {a.qualite === 'ENFANT' && <div className="ag-rangee">
            <select value={a.parentTiersId ?? ''} onChange={e => maj(i, { parentTiersId: e.target.value || undefined })} aria-label="Parent">
              <option value="">Enfant de l'assuré principal</option>{conjoints.map(c => <option key={c.tiersId} value={c.tiersId}>Enfant de {nom(c.tiersId)}</option>)}</select>
            <select value={a.categorieEnfant ?? 'A_CHARGE'} onChange={e => maj(i, { categorieEnfant: e.target.value as Assure['categorieEnfant'] })} aria-label="Catégorie">
              <option value="A_CHARGE">À charge</option><option value="ETUDIANT">Étudiant</option><option value="HANDICAPE">En situation de handicap</option></select>
          </div>}
        </div>)}
        {ajout ? <div className="ag-sous-formulaire"><b>Ajouter : {QUALITES[ajout].toLowerCase()}</b><ChoixPersonne valeur={null} choisir={ajouter} sansTelephone={ajout === 'ENFANT'} />
          <button className="lien" onClick={() => setAjout(null)}>Annuler</button></div>
          : <div className="ag-rangee"><button className="bouton secondaire" disabled={conjoints.length >= 4} onClick={() => setAjout('CONJOINT')}>+ Conjoint</button>
            <button className="bouton secondaire" onClick={() => setAjout('ENFANT')}>+ Enfant</button></div>}
        <p className="doux">Quatre conjoints au plus ; chaque enfant est rattaché à son parent <span className="repere">2</span> ; une personne n'est conjoint que d'un seul assuré principal <span className="repere">3</span>.{produit ? ` Assuré principal de ${produit.age_min} à ${produit.age_max} ans.` : ''}</p>
      </section>
      <Anomalies a={dossier.anomalies} filtre={x => !/Pièce|bénéficiaires|quotit/i.test(x)} />
      <MessageErreur erreur={action.erreur} />
      <button className="bouton large" disabled={action.enCours} onClick={valider}>Enregistrer et continuer</button>
    </>
  );
}

// ---------------------------------------------------------------- étape 4 (AG-06)

function EtapeBeneficiaires({ dossier, personnes, enregistrer, suite, deces }: PropsEtape) {
  const [mode, setMode] = useState<'NOMINATIVE' | 'CLAUSE_TYPE'>(dossier.donnees.beneficiaires?.mode ?? 'CLAUSE_TYPE');
  const [liste, setListe] = useState(dossier.donnees.beneficiaires?.liste ?? []);
  const [noms, setNoms] = useState<Record<string, string>>({});
  const [ajout, setAjout] = useState(false);
  const action = useAction();
  if (!deces) return <><section className="ag-carte"><h2>Bénéficiaires du capital décès</h2><p className="doux">La formule ne comporte pas de garantie décès : aucune désignation n'est nécessaire.</p></section>
    <button className="bouton large" onClick={() => suite(5)}>Continuer</button></>;
  const total = liste.reduce((s, b) => s + Number(b.quotite), 0);
  const valider = () => void action.executer(() => enregistrer({ ...dossier.donnees, beneficiaires: { mode, liste: mode === 'NOMINATIVE' ? liste : [] } }, 4)).then(x => x !== undefined && suite(5));
  return (
    <>
      <section className="ag-carte">
        <h2>Bénéficiaires du capital décès <span className="repere">1</span></h2>
        <p className="doux">Le souscripteur seul désigne les bénéficiaires, nominativement ou par une clause type.</p>
        <label className="ag-coche"><input type="radio" checked={mode === 'CLAUSE_TYPE'} onChange={() => setMode('CLAUSE_TYPE')} /> Clause type (conjoint, à défaut enfants, à défaut héritiers)</label>
        <label className="ag-coche"><input type="radio" checked={mode === 'NOMINATIVE'} onChange={() => setMode('NOMINATIVE')} /> Désignation nominative</label>
        {mode === 'NOMINATIVE' && <>
          {liste.map((b, i) => <div key={b.tiersId} className="ag-ligne statique">
            <div><b>{noms[b.tiersId] ?? nomDe(personnes[b.tiersId])}</b><small>rang {b.rang}</small></div>
            <div className="ag-rangee"><input className="court" type="number" min={1} max={100} value={b.quotite} onChange={e => setListe(l => l.map((x, j) => (j === i ? { ...x, quotite: Number(e.target.value) } : x)))} aria-label="Quotité" />%
              <button className="lien" onClick={() => setListe(l => l.filter((_, j) => j !== i))}>Retirer</button></div></div>)}
          {ajout ? <ChoixPersonne valeur={null} choisir={t => { if (t) { setNoms(n => ({ ...n, [t.id]: t.nom })); setListe(l => [...l, { tiersId: t.id, quotite: Math.max(0, 100 - total), rang: 1 }]); } setAjout(false); }} />
            : <button className="bouton secondaire" onClick={() => setAjout(true)}>+ Bénéficiaire</button>}
          <p className={total === 100 ? 'vert' : 'orange'}>Total des quotités : {total} % <span className="repere">2</span></p>
        </>}
      </section>
      <Message>Un mineur de moins de 12 ans ne peut être assuré en cas de décès ; de 12 à 17 ans, double accord <span className="repere">3</span>. Chaque assuré autre que le souscripteur consent par signature certifiée <span className="repere">4</span> : sans consentement, sa garantie décès n'est pas accordée (prestataire de signature agréé ANDE à brancher).</Message>
      <MessageErreur erreur={action.erreur} />
      <button className="bouton large" disabled={(mode === 'NOMINATIVE' && total !== 100) || action.enCours} onClick={valider}>Enregistrer et continuer</button>
    </>
  );
}

// ---------------------------------------------------------------- étape 5 (AG-07)

function EtapePieces({ dossier, personnes, enregistrer, suite, produit }: PropsEtape) {
  const exiges = produit?.documents_exiges ?? [];
  const [pieces, setPieces] = useState(dossier.donnees.pieces);
  const action = useAction();
  const deposee = (tiersId: string, type: string) => pieces.find(p => p.tiersId === tiersId && p.type === type);
  const ajouter = (tiersId: string, type: string, documentId: string) => {
    const l = [...pieces.filter(p => !(p.tiersId === tiersId && p.type === type)), { tiersId, type, documentId }];
    setPieces(l);
    void action.executer(() => enregistrer({ ...dossier.donnees, pieces: l }, 5));
  };
  const manque = exiges.some(t => dossier.donnees.assures.some(a => !deposee(a.tiersId, t)));
  return (
    <>
      <section className="ag-carte">
        <h2>Pièces <span className="repere">1</span></h2>
        {!exiges.length ? <p className="doux">Ce produit n'exige aucune pièce.</p> : dossier.donnees.assures.map(a => <Fragment key={a.tiersId}>
          <h3>{nomDe(personnes[a.tiersId])}</h3>
          {exiges.map(t => <div key={t} className="ag-ligne statique"><div><b>{t.toLowerCase().replace(/_/g, ' ')}</b>{deposee(a.tiersId, t) && <small className="vert">déposée ✓</small>}</div>
            <DepotPiece objetType="dossier_souscription" objetId={dossier.id} typeDocument={t} libelle={deposee(a.tiersId, t) ? 'Reprendre' : 'Photographier'} depose={x => ajouter(a.tiersId, t, x.id)} /></div>)}
        </Fragment>)}
        <p className="doux">Une photo illisible est refusée et doit être reprise <span className="repere">2</span>. Les pièces sont archivées électroniquement : aucun papier <span className="repere">3</span>.</p>
      </section>
      <MessageErreur erreur={action.erreur} />
      <button className="bouton large" disabled={manque || action.enCours} onClick={() => suite(6)}>Continuer</button>
    </>
  );
}

// ---------------------------------------------------------------- étape 6 (AG-08)

function EtapeTarif({ dossier, suite, recharger }: PropsEtape) {
  const [tarif, setTarif] = useState<Tarif | null>(null);
  const action = useAction();
  const tarifer = () => void action.executer(() => api<Tarif>('POST', `/dossiers/${dossier.id}/tarification`)).then(t => { if (t) { setTarif(t); void recharger(); } });
  useEffect(() => { if (!dossier.anomalies.length) tarifer(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <Anomalies a={dossier.anomalies} />
      <section className="ag-carte">
        <h2>Prime calculée <span className="repere">1</span></h2>
        {action.enCours ? <Chargement /> : tarif ? <dl className="ag-details">
          {tarif.lignes.map((l, i) => <Fragment key={i}><dt>Prime nette · {QUALITES[l.qualite as Qualite] ?? l.qualite} ({l.age} ans)</dt><dd>{montant(l.primeNette)}</dd></Fragment>)}
          <dt>Accessoires</dt><dd>{montant(tarif.accessoires)}</dd>
          {tarif.taxes.map(t => <Fragment key={t.libelle}><dt>{t.libelle} ({Math.round(Number(t.taux) * 1000) / 10} %)</dt><dd>{montant(t.montant)}</dd></Fragment>)}
          <dt><b>Prime totale</b></dt><dd><b>{montant(tarif.primeTotale)} GNF</b></dd>
        </dl> : <p className="doux">Calculée par le système, jamais saisie.</p>}
      </section>
      <MessageErreur erreur={action.erreur} />
      {tarif ? <button className="bouton large" onClick={() => suite(7)}>Présenter le récapitulatif</button>
        : <button className="bouton large" disabled={dossier.anomalies.length > 0 || action.enCours} onClick={tarifer}>Calculer la prime</button>}
    </>
  );
}

// ---------------------------------------------------------------- étape 7 (AG-08)

function EtapeRecap({ dossier, personnes, suite, recharger }: PropsEtape) {
  const [envoi, setEnvoi] = useState<{ documentId: string; envoyeA: string } | null>(null);
  const [code, setCode] = useState('');
  const [verification, setVerification] = useState<string | null>(null);
  const [codeTel, setCodeTel] = useState('');
  const action = useAction();
  const client = personnes[dossier.souscripteur_id];
  if (dossier.acceptation_preuve_id) return <><Message type="succes">Récapitulatif accepté par le client : le dossier de preuve est conservé avec le document <span className="repere">3</span>.</Message>
    <button className="bouton large" onClick={() => suite(8)}>Passer à l'émission</button></>;
  const presenter = () => void action.executer(() => api<{ documentId: string; envoyeA: string }>('POST', `/dossiers/${dossier.id}/recapitulatif`)).then(r => r && setEnvoi(r));
  const accepter = () => void action.executer(() => api('POST', `/dossiers/${dossier.id}/acceptation`, { documentId: envoi!.documentId, code })).then(async x => { if (x) { await recharger(); suite(8); } });
  const nonVerifie = action.erreur?.code === 'TELEPHONE_NON_VERIFIE';
  return (
    <>
      <section className="ag-carte">
        <h2>Prime totale</h2>
        <b className="ag-gros">{montant(dossier.prime_totale)} GNF</b>
        <p className="doux">Prime nette {montant(dossier.prime_nette)} · accessoires {montant(dossier.accessoires)} · taxes {montant(dossier.taxes)}</p>
      </section>
      <section className="ag-carte">
        <h2>Acceptation du client <span className="repere">2</span></h2>
        {!envoi ? <>
          <p>Le récapitulatif et le bulletin d'adhésion sont envoyés par SMS à {nomDe(client)}, qui reçoit un code.</p>
          <button className="bouton large" disabled={action.enCours} onClick={presenter}>Envoyer le récapitulatif au client</button>
        </> : <>
          <p>Envoyés au {envoi.envoyeA}. <button className="lien" onClick={() => void ouvrirFichier('GET', `/documents/${envoi.documentId}/fichier`)}>Voir le récapitulatif</button></p>
          <p>Le client saisit ou vous dicte le code reçu :</p>
          <input className="ag-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} aria-label="Code reçu par le client" />
          <button className="bouton large" disabled={code.length !== 6 || action.enCours} onClick={accepter}>Valider et passer à l'émission</button>
          <button className="lien" onClick={presenter}>Renvoyer un code</button>
        </>}
      </section>
      {nonVerifie && <section className="ag-carte">
        <h2>Vérifier le téléphone du client</h2>
        {!verification ? <><p>Le numéro {client?.telephone ?? ''} n'est pas encore vérifié. Un code de vérification lui sera envoyé.</p>
          <button className="bouton secondaire" onClick={() => void action.executer(() => api<{ envoyeA: string }>('POST', `/tiers/${dossier.souscripteur_id}/telephone/code`)).then(r => r && setVerification(r.envoyeA))}>Envoyer le code de vérification</button></>
          : <><p>Code envoyé au {verification}.</p>
            <input className="ag-code" inputMode="numeric" maxLength={6} value={codeTel} onChange={e => setCodeTel(e.target.value.replace(/\D/g, ''))} aria-label="Code de vérification" />
            <button className="bouton" disabled={codeTel.length !== 6} onClick={() => void action.executer(() => api('POST', `/tiers/${dossier.souscripteur_id}/telephone/verification`, { code: codeTel }))
              .then(r => { if (r) { setVerification(null); presenter(); } })}>Vérifier puis envoyer le récapitulatif</button></>}
      </section>}
      {!nonVerifie && <MessageErreur erreur={action.erreur} />}
      <Message>Ce code vaut acceptation : un dossier de preuve est conservé avec le document <span className="repere">3</span>. Aucun contrat papier.</Message>
    </>
  );
}

// ---------------------------------------------------------------- étape 8 (AG-09, AG-10, AG-14)

function EtapeEmission({ dossier, recharger }: PropsEtape) {
  const { accueil } = useAgent();
  const aller = useNavigate();
  const [resultat, setResultat] = useState<{ policeId: string; numero: string; quittance: string; primeTotale: number; solde: number } | null>(null);
  const [motif, setMotif] = useState('');
  const action = useAction();
  const ag = estAgentGeneral(accueil);
  const bureau = accueil.bureaux.find(b => b.id === dossier.bureau_id);
  if (resultat || dossier.statut === 'EMIS') return (
    <section className="ag-carte ag-succes">
      <h2>Police émise</h2>
      {resultat ? <><b className="ag-gros">{resultat.numero}</b>
        <dl className="ag-details"><dt>Quittance</dt><dd>{resultat.quittance}</dd><dt>Prime débitée</dt><dd>{montant(resultat.primeTotale)} GNF</dd><dt>Nouveau solde</dt><dd>{montant(resultat.solde)} GNF</dd></dl></> : <p>Ce dossier a été émis.</p>}
      <p className="doux">Une seule transaction : débit du compte de production, numéro de police, quittance, activation, écritures <span className="repere">1</span>. Les documents partent au client par lien sécurisé <span className="repere">2</span> ; cartes numériques immédiates <span className="repere">3</span>.</p>
      <button className="bouton large" onClick={() => aller('/agent')}>Retour à l'accueil</button>
    </section>
  );
  if (!ag) return dossier.statut === 'A_VALIDER' ? <Message>Dossier soumis : votre agent général le contrôle et l'émet.</Message> : <>
    <Message>Vous préparez le dossier ; votre agent général le contrôle et l'émet sur le compte de production du bureau.</Message>
    <MessageErreur erreur={action.erreur} />
    <button className="bouton large" disabled={action.enCours} onClick={() => void action.executer(() => api('POST', `/dossiers/${dossier.id}/soumission`)).then(async x => { if (x !== undefined) { await recharger(); aller('/agent/dossiers'); } })}>Soumettre à mon agent général</button>
  </>;
  const insuffisant = action.erreur?.code === 'SOLDE_INSUFFISANT' ? (action.erreur.details as { manque: number; solde: number }) : null;
  const emettre = () => void action.executer(() => api<typeof resultat>('POST', `/dossiers/${dossier.id}/emission`)).then(async r => { if (r) { setResultat(r); await recharger(); } });
  return (
    <>
      <section className="ag-carte">
        <h2>Émission</h2>
        <dl className="ag-details"><dt>Prime totale</dt><dd><b>{montant(dossier.prime_totale)} GNF</b></dd><dt>Compte de production</dt><dd>bureau {bureau?.code} · solde {montant(bureau?.solde ?? 0)} GNF</dd></dl>
        {dossier.canal === 'JUNIOR' && <p className="doux">Dossier préparé par un junior : contrôlez les assurés, les pièces et l'acceptation du client avant d'émettre.</p>}
      </section>
      {insuffisant ? <section className="ag-carte ag-refus">
        <h2>Émission refusée : solde insuffisant</h2>
        <p>Il manque <b>{montant(insuffisant.manque)} GNF</b> (solde {montant(insuffisant.solde)} GNF) <span className="repere">1</span>. Aucune écriture n'a été générée ; le dossier reste prêt.</p>
        <Link className="bouton large" to={`/agent/compte/${bureau?.code ?? ''}`}>Approvisionner le compte <span className="repere">2</span></Link>
        <p className="doux">Un solde insuffisant ne bloque que l'émission <span className="repere">3</span>.</p>
      </section> : <MessageErreur erreur={action.erreur} />}
      <button className="bouton large" disabled={action.enCours || !dossier.acceptation_preuve_id} onClick={emettre}>Émettre la police</button>
      {dossier.statut === 'A_VALIDER' && <section className="ag-carte">
        <h2>Rejeter le dossier</h2>
        <textarea value={motif} onChange={e => setMotif(e.target.value)} placeholder="Motif du rejet (communiqué au junior)" />
        <button className="bouton danger" disabled={!motif.trim() || action.enCours} onClick={() => void action.executer(() => api('POST', `/dossiers/${dossier.id}/rejet`, { motif })).then(async x => { if (x !== undefined) { await recharger(); aller('/agent/dossiers'); } })}>Rejeter</button>
      </section>}
    </>
  );
}
