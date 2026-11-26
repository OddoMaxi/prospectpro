/**
 * Espace assuré – souscription en ligne (maquette AS-07 ; PROD-RG-070 à 074, COM-RG-083).
 * Parcours public : identification par code SMS, étapes 1 à 7, paiement intégral par monnaie électronique ;
 * le dossier payé est vérifié et émis par la cellule Canal digital. Session propre au client, distincte du back-office.
 */
import { Fragment, useCallback, useEffect, useState } from 'react';
import { api, date, ErreurApi, montant } from '../noyau/api';
import { CarteNumeriqueVue, type CarteNumerique } from '../pages/sante/Cartes';
import { SoldesVue, type SoldesPersonne } from '../pages/sante/Consommation';

const CLE = 'prospectpro.enligne';
const lire = () => { try { return JSON.parse(sessionStorage.getItem(CLE) ?? 'null') as { jeton: string; nom: string } | null; } catch { return null; } };

interface Formule { id: string; code: string; libelle: string; produit: string; type_couverture: string; age_min: number; age_max: number; composition: { conjointsMax: number; enfantsMax: number; personnesMax: number }; accessoires: number }
interface Offre { formules: Formule[]; operateurs: { code: string; nom: string }[]; canal: boolean }
interface Assure { tiersId: string; qualite: 'ASSURE_PRINCIPAL' | 'CONJOINT' | 'ENFANT'; parentTiersId?: string; categorieEnfant?: string }
interface Donnees { dateEffet: string; assures: Assure[]; beneficiaires?: { mode: 'NOMINATIVE' | 'CLAUSE_TYPE'; liste: { tiersId: string; quotite: number; rang: number }[] }; consentementsDeces: unknown[]; pieces: { tiersId: string; type: string; documentId: string }[] }
interface Dossier {
  id: string; numero: string; statut: string; etape: number; donnees: Donnees; primeNette: number | null; accessoires: number | null; taxes: number | null; primeTotale: number | null;
  accepte: boolean; motifRejet: string | null; expireLe: string; personnes: { id: string; nom: string; prenoms: string | null; date_naissance: string }[];
  formule: string; produit: string; composition: Formule['composition']; documents_exiges: string[]; codePrescripteur: string | null; anomalies: string[];
}
interface Espace { dossiers: { id: string; numero_dossier: string; statut: string; prime_totale: number | null; motif_rejet: string | null; formule: string; police: string | null }[]; polices: { id: string; numero: string; statut: string; produit: string; echeance: string }[] }

const ETAPES = ['Vous', 'Formule', 'Personnes', 'Bénéficiaires', 'Pièces', 'Prime', 'Récapitulatif', 'Paiement'];
const QUALITES: Record<string, string> = { ASSURE_PRINCIPAL: 'vous', CONJOINT: 'conjoint', ENFANT: 'enfant' };
const PIECES: Record<string, string> = { PIECE_IDENTITE: 'Pièce d\'identité', PHOTO: 'Photo', ACTE_NAISSANCE: 'Acte de naissance' };
const message = (e: unknown) => (e instanceof ErreurApi ? e.message : 'Une erreur est survenue, réessayez.');

export function SouscriptionEnLigne() {
  const [session, setSession] = useState(lire);
  const [offre, setOffre] = useState<Offre | null>(null);
  const [espace, setEspace] = useState<Espace | null>(null);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [etape, setEtape] = useState(1);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const appel = useCallback(async <T,>(m: 'GET' | 'POST' | 'PUT', chemin: string, corps?: unknown) => api<T>(m, `/public/en-ligne${chemin}`, corps, session?.jeton), [session]);
  const agir = async (f: () => Promise<unknown>) => {
    setErreur(null); setEnCours(true);
    try { await f(); } catch (e) {
      if (e instanceof ErreurApi && e.statut === 401 && session) { sessionStorage.removeItem(CLE); setSession(null); }
      setErreur(message(e));
    } finally { setEnCours(false); }
  };
  const recharger = useCallback(async (id?: string) => {
    if (!session) return;
    const e = await appel<Espace>('GET', '/moi');
    setEspace(e);
    // Dossier en cours, sinon le dernier dossier pour en afficher l'issue (émis, rejeté)
    const courant = id ?? e.dossiers.find(d => ['BROUILLON', 'PAYE_A_EMETTRE'].includes(d.statut))?.id ?? e.dossiers[0]?.id;
    if (courant) {
      const d = await appel<Dossier>('GET', `/dossiers/${courant}`);
      setDossier(d);
      if (d.statut === 'BROUILLON') setEtape(x => Math.max(x, d.accepte ? 8 : d.primeTotale !== null ? 6 : Math.min(d.etape + 1, 5)));
    }
  }, [appel, session]);
  useEffect(() => { void api<Offre>('GET', '/public/en-ligne/offre').then(setOffre).catch(() => setOffre({ formules: [], operateurs: [], canal: false })); }, []);
  useEffect(() => { void recharger().catch(e => setErreur(message(e))); }, [recharger]);
  const enregistrer = async (donnees: Donnees, e: number) => { await appel('PUT', `/dossiers/${dossier!.id}/donnees`, { donnees, etape: e }); await recharger(dossier!.id); };

  const termine = dossier && dossier.statut !== 'BROUILLON';
  return (
    <div className="el-app">
      <header className="el-entete"><div><b>Mon espace assuré</b><small>Souscription en ligne</small></div>
        {session && <div className="el-moi"><span>{session.nom}</span><button className="lien" onClick={() => { sessionStorage.removeItem(CLE); setSession(null); setDossier(null); setEspace(null); setEtape(1); }}>Se déconnecter</button></div>}</header>
      <main className="el-contenu">
        <h1>{dossier ? `Souscrire en ligne – ${dossier.produit}` : 'Souscrire en ligne'}</h1>
        {offre && !offre.canal && <div className="message attention">La souscription en ligne n'est pas encore ouverte. Rapprochez-vous d'un bureau de la Compagnie.</div>}
        {!termine && <ol className="el-etapes">{ETAPES.map((l, i) => { const n = i + 1, fait = session ? n < (dossier ? etape : 2) : false, actif = session ? n === (dossier ? etape : 2) : n === 1;
          return <li key={l} className={actif ? 'actif' : fait ? 'fait' : ''}><span>{fait ? '✓' : n}</span>{l}</li>; })}</ol>}
        {erreur && <div className="message erreur">{erreur}</div>}
        {!session ? <Identification apres={s => { sessionStorage.setItem(CLE, JSON.stringify(s)); setSession(s); }} agir={agir} enCours={enCours} />
          : termine ? <Suivi d={dossier!} espace={espace} nouveau={() => { setDossier(null); setEtape(1); }} />
          : !dossier ? <ChoixFormule offre={offre} agir={agir} enCours={enCours} ouvrir={async (formuleId, code) => {
            const r = await appel<{ id: string }>('POST', '/dossiers', { formuleId, codePrescripteur: code || undefined }); setEtape(3); await recharger(r.id); }} espace={espace} />
          : <>
            {etape === 3 && <Personnes d={dossier} agir={agir} enCours={enCours} declarer={p => appel<{ tiersId: string }>('POST', `/dossiers/${dossier.id}/personnes`, p)}
              enregistrer={x => enregistrer(x, 3)} suivant={() => setEtape(4)} />}
            {etape === 4 && <Beneficiaires d={dossier} agir={agir} enCours={enCours} enregistrer={async x => { await enregistrer(x, 4); setEtape(5); }} retour={() => setEtape(3)} />}
            {etape === 5 && <Pieces d={dossier} agir={agir} enCours={enCours} jeton={session.jeton} enregistrer={x => enregistrer(x, 5)} suivant={() => setEtape(6)} retour={() => setEtape(4)} />}
            {etape === 6 && <Prime d={dossier} agir={agir} enCours={enCours} tarifer={async () => { await appel('POST', `/dossiers/${dossier.id}/tarif`); await recharger(dossier.id); }} suivant={() => setEtape(7)} retour={() => setEtape(5)} />}
            {etape === 7 && <Recapitulatif d={dossier} agir={agir} enCours={enCours} jeton={session.jeton} appel={appel} apres={async () => { await recharger(dossier.id); setEtape(8); }} />}
            {etape === 8 && <Paiement d={dossier} offre={offre} agir={agir} enCours={enCours} appel={appel} apres={() => recharger(dossier.id)} />}
          </>}
      </main>
    </div>
  );
}

function Identification({ apres, agir, enCours }: { apres: (s: { jeton: string; nom: string }) => void; agir: (f: () => Promise<unknown>) => Promise<void>; enCours: boolean }) {
  const [v, setV] = useState({ nom: '', prenoms: '', dateNaissance: '', telephone: '+224 ', sexe: '' });
  const [tiersId, setTiersId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  if (tiersId) return (
    <section className="el-carte"><h2>Vérification de votre téléphone</h2>
      <p>Saisissez le code à 6 chiffres reçu par SMS au {v.telephone}.</p>
      <div className="el-ligne"><input inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="Code" />
        <button className="bouton" disabled={code.length !== 6 || enCours} onClick={() => void agir(async () => apres(await api<{ jeton: string; nom: string }>('POST', '/public/en-ligne/verification', { tiersId, code })))}>Valider</button></div>
      <button className="lien" onClick={() => { setTiersId(null); setCode(''); }}>Modifier mes informations</button>
    </section>);
  return (
    <section className="el-carte"><h2>Vous</h2>
      <p>Déjà client ? Indiquez le même numéro de téléphone : vous retrouverez votre fiche.</p>
      <div className="formulaire">
        <label className="champ"><span>Nom</span><input value={v.nom} onChange={e => setV({ ...v, nom: e.target.value })} /></label>
        <label className="champ"><span>Prénoms</span><input value={v.prenoms} onChange={e => setV({ ...v, prenoms: e.target.value })} /></label>
        <label className="champ"><span>Date de naissance</span><input type="date" value={v.dateNaissance} onChange={e => setV({ ...v, dateNaissance: e.target.value })} /></label>
        <label className="champ"><span>Sexe</span><select value={v.sexe} onChange={e => setV({ ...v, sexe: e.target.value })}><option value="">—</option><option value="F">Femme</option><option value="M">Homme</option></select></label>
        <label className="champ"><span>Téléphone (mobile)</span><input inputMode="tel" value={v.telephone} onChange={e => setV({ ...v, telephone: e.target.value })} /></label>
      </div>
      <button className="bouton" disabled={!v.nom.trim() || !v.prenoms.trim() || !v.dateNaissance || v.telephone.replace(/\D/g, '').length < 8 || enCours}
        onClick={() => void agir(async () => setTiersId((await api<{ tiersId: string }>('POST', '/public/en-ligne/identification', { ...v, sexe: v.sexe || undefined })).tiersId))}>Recevoir un code par SMS</button>
    </section>);
}

function ChoixFormule({ offre, espace, ouvrir, agir, enCours }: { offre: Offre | null; espace: Espace | null; ouvrir: (f: string, c: string) => Promise<void>; agir: (f: () => Promise<unknown>) => Promise<void>; enCours: boolean }) {
  const [choix, setChoix] = useState('');
  const [code, setCode] = useState('');
  if (!offre) return <div className="vide">Chargement…</div>;
  return (<>
    {!!espace?.polices.length && <MesCartes />}
    {!!espace?.polices.length && <MaConsommation />}
    {!!espace?.polices.length && <section className="el-carte"><h2>Mes contrats</h2>{espace.polices.map(p => <div key={p.id} className="el-ligne"><b className="code">{p.numero}</b><span>{p.produit}</span><span className="doux">échéance {date(p.echeance)}</span></div>)}</section>}
    <section className="el-carte"><h2>Formule</h2>
      <div className="el-formules">{offre.formules.map(f => <button key={f.id} className={`el-formule${choix === f.id ? ' choisie' : ''}`} onClick={() => setChoix(f.id)}>
        <b>{f.produit}</b><span>{f.libelle}</span><small>{f.composition.personnesMax > 1 ? `Jusqu'à ${f.composition.personnesMax} personnes` : 'Une personne'} · {f.age_min} à {f.age_max} ans</small></button>)}</div>
      <label className="champ"><span>Code prescripteur (facultatif)</span><input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Ex. KARAMOKO" /></label>
      <p className="doux">Le code rattache votre contrat à la personne qui vous l'a recommandé ; il ne modifie pas la prime.</p>
      <button className="bouton" disabled={!choix || enCours} onClick={() => void agir(() => ouvrir(choix, code))}>Continuer</button>
    </section>
  </>);
}

function Personnes({ d, declarer, enregistrer, suivant, agir, enCours }: { d: Dossier; declarer: (p: unknown) => Promise<{ tiersId: string }>; enregistrer: (x: Donnees) => Promise<void>; suivant: () => void; agir: (f: () => Promise<unknown>) => Promise<void>; enCours: boolean }) {
  const [p, setP] = useState({ qualite: 'CONJOINT' as 'CONJOINT' | 'ENFANT', nom: '', prenoms: '', dateNaissance: '' });
  const nom = (id: string) => { const x = d.personnes.find(y => y.id === id); return x ? `${x.prenoms ?? ''} ${x.nom}`.trim() : ''; };
  const nb = (q: string) => d.donnees.assures.filter(a => a.qualite === q).length;
  const possible = d.donnees.assures.length < d.composition.personnesMax && (p.qualite === 'CONJOINT' ? nb('CONJOINT') < d.composition.conjointsMax : nb('ENFANT') < d.composition.enfantsMax);
  return (
    <section className="el-carte"><h2>Personnes assurées</h2>
      <ul className="el-liste">{d.donnees.assures.map(a => <li key={a.tiersId}><b>{nom(a.tiersId)}</b> <span className="doux">{QUALITES[a.qualite]}</span>
        {a.qualite !== 'ASSURE_PRINCIPAL' && <button className="lien" disabled={enCours} onClick={() => void agir(() => enregistrer({ ...d.donnees, assures: d.donnees.assures.filter(x => x.tiersId !== a.tiersId), pieces: d.donnees.pieces.filter(x => x.tiersId !== a.tiersId) }))}>Retirer</button>}</li>)}</ul>
      {d.composition.personnesMax > 1 && <>
        <h3>Ajouter une personne</h3>
        <div className="formulaire">
          <label className="champ"><span>Lien</span><select value={p.qualite} onChange={e => setP({ ...p, qualite: e.target.value as typeof p.qualite })}><option value="CONJOINT">Conjoint</option><option value="ENFANT">Enfant</option></select></label>
          <label className="champ"><span>Nom</span><input value={p.nom} onChange={e => setP({ ...p, nom: e.target.value })} /></label>
          <label className="champ"><span>Prénoms</span><input value={p.prenoms} onChange={e => setP({ ...p, prenoms: e.target.value })} /></label>
          <label className="champ"><span>Date de naissance</span><input type="date" value={p.dateNaissance} onChange={e => setP({ ...p, dateNaissance: e.target.value })} /></label>
        </div>
        <button className="bouton secondaire" disabled={!possible || !p.nom.trim() || !p.prenoms.trim() || !p.dateNaissance || enCours}
          onClick={() => void agir(async () => {
            const { tiersId } = await declarer({ nom: p.nom, prenoms: p.prenoms, dateNaissance: p.dateNaissance });
            await enregistrer({ ...d.donnees, assures: [...d.donnees.assures, { tiersId, qualite: p.qualite, ...(p.qualite === 'ENFANT' ? { categorieEnfant: 'A_CHARGE' } : {}) }] });
            setP({ ...p, nom: '', prenoms: '', dateNaissance: '' });
          })}>Ajouter</button>
        {!possible && <p className="doux">Composition maximale de la formule atteinte pour ce lien.</p>}
      </>}
      <div className="el-actions"><button className="bouton" onClick={suivant}>Continuer</button></div>
    </section>);
}

function Beneficiaires({ d, enregistrer, retour, agir, enCours }: { d: Dossier; enregistrer: (x: Donnees) => Promise<void>; retour: () => void; agir: (f: () => Promise<unknown>) => Promise<void>; enCours: boolean }) {
  const [mode, setMode] = useState<'CLAUSE_TYPE' | 'NOMINATIVE'>(d.donnees.beneficiaires?.mode ?? 'CLAUSE_TYPE');
  const autres = d.donnees.assures.filter(a => a.qualite !== 'ASSURE_PRINCIPAL');
  const [quotites, setQuotites] = useState<Record<string, string>>(Object.fromEntries((d.donnees.beneficiaires?.liste ?? []).map(b => [b.tiersId, String(b.quotite)])));
  const nom = (id: string) => { const x = d.personnes.find(y => y.id === id); return x ? `${x.prenoms ?? ''} ${x.nom}`.trim() : ''; };
  const liste = Object.entries(quotites).filter(([, v]) => Number(v) > 0).map(([tiersId, v]) => ({ tiersId, quotite: Number(v), rang: 1 }));
  return (
    <section className="el-carte"><h2>Bénéficiaires du capital décès</h2>
      <label className="el-choix"><input type="radio" checked={mode === 'CLAUSE_TYPE'} onChange={() => setMode('CLAUSE_TYPE')} /> Clause type : mes conjoints, à défaut mes enfants, à défaut mes héritiers</label>
      <label className="el-choix"><input type="radio" checked={mode === 'NOMINATIVE'} disabled={!autres.length} onChange={() => setMode('NOMINATIVE')} /> Je désigne des personnes déclarées au contrat{!autres.length && ' (aucune personne déclarée)'}</label>
      {mode === 'NOMINATIVE' && <div className="formulaire">{autres.map(a => <label key={a.tiersId} className="champ"><span>{nom(a.tiersId)} (%)</span>
        <input inputMode="decimal" value={quotites[a.tiersId] ?? ''} onChange={e => setQuotites({ ...quotites, [a.tiersId]: e.target.value.replace(',', '.') })} /></label>)}</div>}
      <div className="el-actions"><button className="lien" onClick={retour}>‹ Retour</button>
        <button className="bouton" disabled={enCours || (mode === 'NOMINATIVE' && Math.round(liste.reduce((s, b) => s + b.quotite, 0) * 100) !== 10000)}
          onClick={() => void agir(() => enregistrer({ ...d.donnees, beneficiaires: { mode, liste: mode === 'NOMINATIVE' ? liste : [] } }))}>Continuer</button></div>
    </section>);
}

function Pieces({ d, jeton, enregistrer, suivant, retour, agir, enCours }: { d: Dossier; jeton: string; enregistrer: (x: Donnees) => Promise<void>; suivant: () => void; retour: () => void; agir: (f: () => Promise<unknown>) => Promise<void>; enCours: boolean }) {
  const exigees = d.documents_exiges ?? [];
  const nom = (id: string) => { const x = d.personnes.find(y => y.id === id); return x ? `${x.prenoms ?? ''} ${x.nom}`.trim() : ''; };
  const deposer = (tiersId: string, type: string, f: File) => agir(async () => {
    const doc = await api<{ id: string }>('POST', `/public/en-ligne/dossiers/${d.id}/pieces?typeDocument=${encodeURIComponent(type)}`, f, jeton);
    await enregistrer({ ...d.donnees, pieces: [...d.donnees.pieces.filter(p => !(p.tiersId === tiersId && p.type === type)), { tiersId, type, documentId: doc.id }] });
  });
  const total = exigees.length * d.donnees.assures.length, fournies = d.donnees.pieces.filter(p => exigees.includes(p.type)).length;
  return (
    <section className="el-carte"><h2>Pièces ({fournies} / {total})</h2>
      {!exigees.length ? <p>Aucune pièce n'est demandée pour cette formule.</p> :
        <table className="tableau"><tbody>{d.donnees.assures.map(a => <Fragment key={a.tiersId}>{exigees.map(t => { const ok = d.donnees.pieces.some(p => p.tiersId === a.tiersId && p.type === t);
          return <tr key={t}><td>{nom(a.tiersId)}</td><td>{PIECES[t] ?? t.toLowerCase().replace(/_/g, ' ')}</td><td>{ok ? <span className="el-ok">✓ reçue</span> : null}</td>
            <td><label className="bouton secondaire petit">{ok ? 'Remplacer' : 'Photo ou PDF'}<input type="file" hidden accept="application/pdf,image/jpeg,image/png" disabled={enCours}
              onChange={e => { const f = e.target.files?.[0]; if (f) void deposer(a.tiersId, t, f); e.target.value = ''; }} /></label></td></tr>; })}</Fragment>)}</tbody></table>}
      <div className="el-actions"><button className="lien" onClick={retour}>‹ Retour</button><button className="bouton" disabled={fournies < total} onClick={suivant}>Continuer</button></div>
    </section>);
}

function Prime({ d, tarifer, suivant, retour, agir, enCours }: { d: Dossier; tarifer: () => Promise<void>; suivant: () => void; retour: () => void; agir: (f: () => Promise<unknown>) => Promise<void>; enCours: boolean }) {
  useEffect(() => { if (d.primeTotale === null && !d.anomalies.length) void agir(tarifer); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="el-carte"><h2>Votre prime</h2>
      {d.anomalies.length ? <div className="message attention"><b>À compléter :</b><ul>{d.anomalies.map(a => <li key={a}>{a}</li>)}</ul></div>
        : d.primeTotale === null ? <div className="vide">Calcul…</div>
        : <dl className="details"><dt>Prime nette</dt><dd>{montant(d.primeNette)} GNF</dd><dt>Accessoires</dt><dd>{montant(d.accessoires)} GNF</dd><dt>Taxes</dt><dd>{montant(d.taxes)} GNF</dd>
          <dt>Prime totale</dt><dd><b>{montant(d.primeTotale)} GNF</b>, payée en une fois</dd></dl>}
      <div className="el-actions"><button className="lien" onClick={retour}>‹ Retour</button><button className="bouton" disabled={d.primeTotale === null || enCours} onClick={suivant}>Continuer</button></div>
    </section>);
}

type Appel = <T>(m: 'GET' | 'POST' | 'PUT', chemin: string, corps?: unknown) => Promise<T>;

function Recapitulatif({ d, jeton, appel, apres, agir, enCours }: { d: Dossier; jeton: string; appel: Appel; apres: () => Promise<void>; agir: (f: () => Promise<unknown>) => Promise<void>; enCours: boolean }) {
  const [doc, setDoc] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const ouvrir = async (id: string) => {
    const r = await fetch(`/api/public/en-ligne/dossiers/${d.id}/documents/${id}`, { headers: { Authorization: `Bearer ${jeton}` } });
    if (r.ok) window.open(URL.createObjectURL(await r.blob()), '_blank');
  };
  return (
    <section className="el-carte"><h2>Récapitulatif</h2>
      <dl className="details"><dt>Formule</dt><dd>{d.produit} – {d.formule}</dd><dt>Personnes</dt><dd>{d.donnees.assures.length} ({d.donnees.assures.map(a => QUALITES[a.qualite]).join(', ')})</dd>
        <dt>Bénéficiaires</dt><dd>{d.donnees.beneficiaires?.mode === 'NOMINATIVE' ? 'Désignation nominative' : 'Clause type'}</dd><dt>Pièces</dt><dd>{d.donnees.pieces.length} ✓</dd>
        <dt>Prime totale</dt><dd><b>{montant(d.primeTotale)} GNF</b>, payée en une fois</dd>{d.codePrescripteur && <><dt>Code prescripteur</dt><dd>{d.codePrescripteur} ✓</dd></>}</dl>
      {!doc ? <button className="bouton" disabled={enCours} onClick={() => void agir(async () => setDoc((await appel<{ documentId: string }>('POST', `/dossiers/${d.id}/recapitulatif`)).documentId))}>Lire le récapitulatif et recevoir le code</button>
        : <><p>Lisez le <button className="lien" onClick={() => void ouvrir(doc)}>récapitulatif (PDF)</button>, puis saisissez le code reçu par SMS pour l'accepter.</p>
          <div className="el-ligne"><input inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="Code" />
            <button className="bouton" disabled={code.length !== 6 || enCours} onClick={() => void agir(async () => { await appel('POST', `/dossiers/${d.id}/acceptation`, { documentId: doc, code }); await apres(); })}>J'accepte</button></div></>}
    </section>);
}

function Paiement({ d, offre, appel, apres, agir, enCours }: { d: Dossier; offre: Offre | null; appel: Appel; apres: () => Promise<void>; agir: (f: () => Promise<unknown>) => Promise<void>; enCours: boolean }) {
  const [operateur, setOperateur] = useState(offre?.operateurs[0]?.code ?? '');
  const [telephone, setTelephone] = useState('+224 ');
  const [attente, setAttente] = useState<string | null>(null);
  const simulation = import.meta.env.DEV;
  return (<div className="el-deux">
    <section className="el-carte"><h2>Récapitulatif</h2>
      <dl className="details"><dt>Formule</dt><dd>{d.produit} – {d.formule}</dd><dt>Personnes</dt><dd>{d.donnees.assures.length}</dd><dt>Prime totale</dt><dd><b>{montant(d.primeTotale)} GNF</b>, payée en une fois</dd></dl>
      <div className="message info">Votre dossier est vérifié par la cellule Canal digital ; votre carte numérique est disponible dès l'émission. En cas de rejet, vous êtes remboursé automatiquement.</div>
    </section>
    <section className="el-carte"><h2>Paiement</h2>
      {d.codePrescripteur && <p>Code prescripteur : <b>{d.codePrescripteur} ✓</b></p>}
      <div className="formulaire">
        <label className="champ"><span>Opérateur</span><select value={operateur} onChange={e => setOperateur(e.target.value)}>{offre?.operateurs.map(o => <option key={o.code} value={o.code}>{o.nom}</option>)}</select></label>
        <label className="champ"><span>Téléphone du portefeuille</span><input inputMode="tel" value={telephone} onChange={e => setTelephone(e.target.value)} /></label>
      </div>
      {attente ? <div className="message info">Validez le paiement de {montant(d.primeTotale)} GNF sur votre téléphone (référence {attente}). <button className="lien" onClick={() => void agir(apres)}>J'ai validé</button></div>
        : <button className="bouton el-payer" disabled={!operateur || telephone.replace(/\D/g, '').length < 8 || enCours}
          onClick={() => void agir(async () => {
            if (simulation) { await appel('POST', `/dossiers/${d.id}/paiement/simulation`, { operateur, telephone }); await apres(); }
            else setAttente((await appel<{ reference: string }>('POST', `/dossiers/${d.id}/paiement`, { operateur, telephone })).reference);
          })}>Payer {montant(d.primeTotale)} GNF</button>}
      {simulation && <p className="doux">Environnement d'essai : le paiement est simulé.</p>}
    </section>
  </div>);
}

function Suivi({ d, espace, nouveau }: { d: Dossier; espace: Espace | null; nouveau: () => void }) {
  const police = espace?.dossiers.find(x => x.id === d.id)?.police;
  return (
    <section className="el-carte">
      {d.statut === 'PAYE_A_EMETTRE' && <><h2>Paiement reçu</h2><p>Votre dossier {d.numero} ({montant(d.primeTotale)} GNF) est en cours de vérification par la cellule Canal digital. Vous recevrez un SMS dès l'émission de votre contrat.</p></>}
      {d.statut === 'EMIS' && <><h2>Votre contrat est émis</h2><p>Police n° <b className="code">{police}</b>. Votre carte numérique est disponible. Vous disposez d'un délai de renonciation après la souscription en ligne.</p></>}
      {d.statut === 'REJETE' && <><h2>Dossier non accepté</h2><p>{d.motifRejet}. Le paiement vous a été remboursé automatiquement.</p></>}
      {d.statut === 'EXPIRE' && <><h2>Dossier expiré</h2><p>La proposition a expiré le {date(d.expireLe)}.</p></>}
      {d.statut !== 'PAYE_A_EMETTRE' && <button className="bouton" onClick={nouveau}>Nouvelle souscription</button>}
    </section>);
}

/** AS-02 : cartes numériques (une par personne couverte), perte ou vol, carte physique sur demande. */
function MesCartes() {
  const session = lire();
  const [cartes, setCartes] = useState<CarteNumerique[] | null>(null);
  const [choisie, setChoisie] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const charger = useCallback(() => api<CarteNumerique[]>('GET', '/public/en-ligne/cartes', undefined, session?.jeton).then(setCartes).catch(() => setCartes([])), [session?.jeton]);
  useEffect(() => { void charger(); }, [charger]);
  if (!cartes?.length) return null;
  const c = cartes[Math.min(choisie, cartes.length - 1)]!;
  const agir = async (chemin: string, corps: unknown, ok: string) => {
    try { await api('POST', `/public/en-ligne/cartes/${c.id}/${chemin}`, corps, session?.jeton); setMessage(ok); await charger(); } catch (e) { setMessage((e as Error).message); }
  };
  return (
    <section className="el-carte"><h2>Mes cartes</h2>
      <CarteNumeriqueVue c={c} />
      <div className="el-ligne">{cartes.map((x, i) => <button key={x.id} className={`bouton ${i === choisie ? '' : 'secondaire'} petit`} onClick={() => setChoisie(i)}>{x.assure.split(' ')[0]} ({x.rang})</button>)}</div>
      {message && <div className="message info">{message}</div>}
      <div className="el-ligne">
        <button className="bouton secondaire" onClick={() => { if (window.confirm('Révoquer cette carte et en émettre une nouvelle ?')) void agir('perte', { motif: 'PERTE' }, 'Carte révoquée : votre nouvelle carte numérique est affichée.'); }}>Déclarer une perte ou un vol</button>
        {c.production === 'NUMERIQUE_SEULE' && <button className="bouton secondaire" onClick={() => void agir('physique', { lieu: 'SIEGE' }, 'Carte physique demandée : vous serez prévenu par SMS dès son impression (retrait au siège).')}>Demander une carte physique</button>}
      </div>
    </section>);
}

/** SAN-RG-022 : l'assuré consulte à tout moment sa consommation et ses soldes. */
function MaConsommation() {
  const session = lire();
  const [l, setL] = useState<SoldesPersonne[] | null>(null);
  useEffect(() => { void api<SoldesPersonne[]>('GET', '/public/en-ligne/consommation', undefined, session?.jeton).then(setL).catch(() => setL([])); }, [session?.jeton]);
  if (!l?.length) return null;
  return <section className="el-carte"><h2>Ma consommation</h2>{l.map(p => <SoldesVue key={p.id} p={p} />)}</section>;
}

