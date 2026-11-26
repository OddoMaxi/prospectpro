/** Rapprochement bancaire (FIN-RG-042, 043 ; CA-FIN-19) : import du relevé, rapprochement automatique et manuel, frais, état. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, date, montant, ouvrirFichier } from '../../noyau/api';
import { Carte, Champ, Chargement, DepotPiece, Message, MessageErreur, Modale, Onglets, Page, Statut, useAvis } from '../../noyau/composants';
import { useAction, useDonnees } from '../../noyau/donnees';
import { useSession } from '../../noyau/session';

interface LigneReleve { id: string; date_operation: string; libelle: string; montant: number; reference: string | null; statut: string; piece: string | null; statut_ecriture: string | null }
interface Ecriture { id: string; date: string; montant: number; reference: string; libelle: string; piece: string }
interface Releve { banque: { code: string; nom: string; compte: string }; lignes: LigneReleve[]; ecrituresLibres: Ecriture[] }
interface Etat {
  date: string; soldeComptable: number; ecritures: { date: string; piece: string; libelle: string; montant: number }[]; totalEcritures: number;
  operations: { date: string; libelle: string; reference: string | null; montant: number }[]; totalOperations: number; soldeReconstitue: number; cumulReleve: number; soldeReleve: number | null; ecart: number | null;
}
const STATUTS: Record<string, [string, string]> = { A_RAPPROCHER: ['À rapprocher', 'orange'], RAPPROCHEE: ['Rapprochée', 'vert'], GENEREE: ['Comptabilisée, à valider', 'bleu'] };
const signe = (n: number) => <span style={{ color: Number(n) < 0 ? 'var(--rouge)' : 'var(--vert)' }}>{Number(n) > 0 ? '+' : ''}{montant(n)}</span>;
type Onglet = 'releve' | 'etat';

export function PageRapprochement() {
  const { peut } = useSession();
  const banques = useDonnees<{ code: string; nom: string }[]>('/banques-operateurs');
  const [code, setCode] = useState(() => new URLSearchParams(window.location.search).get('banque') ?? '');
  const banque = code || banques.donnees?.[0]?.code || '';
  const [onglet, setOnglet] = useState<Onglet>('releve');
  const [filtre, setFiltre] = useState('A_RAPPROCHER');
  const r = useDonnees<Releve>(banque ? `/rapprochement/${banque}${filtre ? `?statut=${filtre}` : ''}` : null);
  const [choisie, setChoisie] = useState<LigneReleve | null>(null);
  const [importer, setImporter] = useState(false);
  const [frais, setFrais] = useState<LigneReleve | null>(null);
  const action = useAction();
  const { avis, Avis } = useAvis();
  const recharger = () => { setChoisie(null); void r.recharger(); };
  const candidates = choisie ? (r.donnees?.ecrituresLibres ?? []).filter(e => e.montant === Number(choisie.montant)) : [];
  const ecritures = choisie ? candidates : r.donnees?.ecrituresLibres ?? [];
  return (
    <Page fil={['Finances', 'Rapprochement bancaire']} titre="Rapprochement bancaire" actions={<>
      {banques.donnees && <select value={banque} onChange={e => { setCode(e.target.value); setChoisie(null); }}>{banques.donnees.map(b => <option key={b.code} value={b.code}>{b.nom}</option>)}</select>}
      {banque && peut('PAIEMENT:CREER') && <>
        <button className="bouton secondaire" disabled={action.enCours} onClick={() => void action.executer(() => api<{ rapprochees: number; restantes: number }>('POST', `/rapprochement/${banque}/automatique`))
          .then(x => { if (x) { avis(`${x.rapprochees} opération(s) rapprochée(s) ; ${x.restantes} à traiter.`); recharger(); } })}>Rapprocher automatiquement</button>
        <button className="bouton" onClick={() => setImporter(true)}>Importer un relevé</button></>}</>}>
      <Onglets<Onglet> actif={onglet} choisir={setOnglet} onglets={[{ code: 'releve', libelle: 'Relevé et écritures' }, { code: 'etat', libelle: 'État de rapprochement' }]} />
      <MessageErreur erreur={action.erreur} />
      {onglet === 'releve' && (!r.donnees ? <Chargement /> : <>
        <div className="grille">
          <Carte titre={<>Relevé {r.donnees.banque.nom} <small className="doux">compte {r.donnees.banque.compte.replace(/0+$/, '')}</small></>}>
            <div className="filtres"><select value={filtre} onChange={e => { setFiltre(e.target.value); setChoisie(null); }}><option value="">Toutes les opérations</option>{Object.entries(STATUTS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></div>
            {!r.donnees.lignes.length ? <div className="vide">{filtre === 'A_RAPPROCHER' ? 'Aucune opération à rapprocher.' : 'Aucune opération importée.'}</div> :
              <table className="tableau"><thead><tr><th>Date</th><th>Libellé</th><th>Réf.</th><th className="nombre">Montant</th><th>Statut</th><th /></tr></thead>
                <tbody>{r.donnees.lignes.map(l => <tr key={l.id} className={choisie?.id === l.id ? 'selection' : undefined}>
                  <td>{date(l.date_operation)}</td><td>{l.libelle}</td><td className="code">{l.reference ?? '—'}</td><td className="nombre">{signe(l.montant)}</td>
                  <td><Statut couleur={STATUTS[l.statut]?.[1]}>{STATUTS[l.statut]?.[0]}</Statut>{l.piece && <small className="doux code"> {l.piece}</small>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{l.statut === 'A_RAPPROCHER' && peut('PAIEMENT:CREER') && <>
                    <button className="lien" onClick={() => setChoisie(choisie?.id === l.id ? null : l)}>{choisie?.id === l.id ? 'Annuler' : 'Rapprocher'}</button>{' · '}
                    <button className="lien" onClick={() => setFrais(l)}>Comptabiliser</button></>}
                    {l.statut === 'RAPPROCHEE' && peut('PAIEMENT:CREER') && <button className="lien" onClick={() => void action.executer(() => api('DELETE', `/releve-lignes/${l.id}/rapprochement`)).then(x => x !== undefined && recharger())}>Défaire</button>}</td>
                </tr>)}</tbody></table>}
          </Carte>
          <Carte titre={choisie ? `Écritures de ${montant(choisie.montant)} GNF` : 'Écritures non rapprochées'}>
            {choisie && <Message>Choisissez l'écriture correspondant à « {choisie.libelle} » du {date(choisie.date_operation)}.</Message>}
            {!ecritures.length ? <div className="vide">{choisie ? 'Aucune écriture de ce montant : comptabilisez l\'opération si elle manque.' : 'Toutes les écritures sont rapprochées.'}</div> :
              <table className="tableau"><thead><tr><th>Date</th><th>Pièce</th><th>Libellé</th><th className="nombre">Montant</th><th /></tr></thead>
                <tbody>{ecritures.map(e => <tr key={e.id}><td>{date(e.date)}</td><td className="code">{e.piece}</td><td>{e.libelle}</td><td className="nombre">{signe(e.montant)}</td>
                  <td>{choisie && <button className="lien" onClick={() => void action.executer(() => api('POST', `/releve-lignes/${choisie.id}/rapprochement`, { ligneEcritureId: e.id }))
                    .then(x => { if (x !== undefined) { avis('Opération rapprochée.'); recharger(); } })}>Lier</button>}</td></tr>)}</tbody></table>}
          </Carte>
        </div>
        <Message>Le rapprochement automatique retient la même somme avec la même référence, puis un candidat unique dans l'écart de dates paramétré ; les cas ambigus restent ici. Une opération de la banque absente des comptes (frais, agios) est comptabilisée par modèle et validée par la comptabilité (<Link to="/validations">Validations</Link>).</Message>
      </>)}
      {onglet === 'etat' && banque && <EtatRapprochement banque={banque} />}
      {importer && <ImportReleve banque={banque} fermer={() => setImporter(false)} apres={m => { setImporter(false); avis(m); recharger(); }} />}
      {frais && <OperationBanque l={frais} fermer={() => setFrais(null)} apres={m => { setFrais(null); avis(m); recharger(); }} />}
      <Avis />
    </Page>
  );
}

function ImportReleve({ banque, fermer, apres }: { banque: string; fermer: () => void; apres: (m: string) => void }) {
  const [contenu, setContenu] = useState('');
  const action = useAction();
  return (
    <Modale titre="Importer un relevé" large fermer={fermer}>
      <Message>Une opération par ligne : <span className="code">date ; libellé ; montant ; référence</span> (date JJ/MM/AAAA, montant en francs, négatif pour une sortie). Les opérations déjà importées sont ignorées.</Message>
      <div className="formulaire">
        <Champ libelle="Fichier du relevé (CSV ou texte)" large><input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={e => { const f = e.target.files?.[0]; if (f) void f.text().then(setContenu); }} /></Champ>
        <Champ libelle="Contenu" large><textarea rows={10} value={contenu} onChange={e => setContenu(e.target.value)} placeholder={'05/11/2026;Virement reçu;1250000;VIR-118\n06/11/2026;Frais de tenue de compte;-15000;'} /></Champ>
      </div>
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton" disabled={!contenu.trim() || action.enCours}
        onClick={() => void action.executer(() => api<{ importees: number; ignorees: number; rapprochees: number; restantes: number }>('POST', `/rapprochement/${banque}/releve`, { contenu }))
          .then(r => r && apres(`${r.importees} opération(s) importée(s)${r.ignorees ? `, ${r.ignorees} déjà connue(s)` : ''} ; ${r.rapprochees} rapprochée(s) automatiquement, ${r.restantes} à traiter.`))}>Importer et rapprocher</button></div>
    </Modale>
  );
}

function OperationBanque({ l, fermer, apres }: { l: LigneReleve; fermer: () => void; apres: (m: string) => void }) {
  const modeles = useDonnees<{ achat: { code: string; libelle: string; compte: string }[] }>('/achats/modeles');
  const [modele, setModele] = useState('FRAIS_BANCAIRES');
  const [compte, setCompte] = useState('');
  const [piece, setPiece] = useState<{ id: string } | null>(null);
  const [objetId] = useState(() => crypto.randomUUID());
  const action = useAction();
  return (
    <Modale titre="Comptabiliser une opération de la banque" fermer={fermer}>
      <dl className="details"><dt>Opération</dt><dd>{l.libelle}</dd><dt>Date</dt><dd>{date(l.date_operation)}</dd><dt>Montant</dt><dd>{signe(l.montant)} GNF</dd></dl>
      <div className="formulaire">
        <Champ libelle="Modèle">{modeles.donnees ? <select value={modele} onChange={e => setModele(e.target.value)}><option value="">Compte libre</option>
          {modeles.donnees.achat.filter(m => m.compte.startsWith('6') || m.compte.startsWith('7')).map(m => <option key={m.code} value={m.code}>{m.libelle}</option>)}</select> : <Chargement />}</Champ>
        {!modele && <Champ libelle="Compte de contrepartie"><input value={compte} onChange={e => setCompte(e.target.value)} placeholder="ex. 6351" /></Champ>}
        <Champ libelle="Relevé ou avis de la banque" aide="Obligatoire"><DepotPiece objetType="piece_comptable" objetId={objetId} typeDocument="RELEVE_BANCAIRE" depose={setPiece} /></Champ>
      </div>
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton" disabled={!piece || (!modele && !compte) || action.enCours}
        onClick={() => void action.executer(() => api<{ numero: string }>('POST', `/releve-lignes/${l.id}/comptabilisation`, { modele: modele || undefined, compte: compte || undefined, pieceDocumentId: piece!.id }))
          .then(r => r && apres(`Fiche ${r.numero} générée : rapprochée dès sa validation par la comptabilité.`))}>Générer l'écriture</button></div>
    </Modale>
  );
}

function EtatRapprochement({ banque }: { banque: string }) {
  const [jour, setJour] = useState(new Date().toISOString().slice(0, 10));
  const [solde, setSolde] = useState('');
  const e = useDonnees<Etat>(`/rapprochement/${banque}/etat?date=${jour}${solde ? `&soldeReleve=${solde}` : ''}`);
  const action = useAction();
  return (<>
    <div className="filtres">
      <Champ libelle="Au"><input type="date" value={jour} onChange={x => setJour(x.target.value)} /></Champ>
      <Champ libelle="Solde du relevé à cette date (GNF)"><input inputMode="numeric" value={solde} onChange={x => setSolde(x.target.value.replace(/[^\d-]/g, ''))} placeholder="facultatif" /></Champ>
      <button className="bouton secondaire" disabled={action.enCours} onClick={() => void action.executer(() => api<{ documentId: string }>('POST', `/rapprochement/${banque}/etat`, { date: jour, soldeReleve: solde ? Number(solde) : undefined }))
        .then(r => r && ouvrirFichier('GET', `/documents/${r.documentId}/fichier`))}>Éditer en PDF</button>
    </div>
    <MessageErreur erreur={action.erreur ?? e.erreur} />
    {!e.donnees ? <Chargement /> : <>
      <div className="grille quatre">
        <div className="indicateur"><small>Solde comptable</small><b>{montant(e.donnees.soldeComptable)}</b><span>GNF au {date(e.donnees.date)}</span></div>
        <div className="indicateur"><small>Solde du relevé reconstitué</small><b>{montant(e.donnees.soldeReconstitue)}</b><span>cumul importé : {montant(e.donnees.cumulReleve)}</span></div>
        <div className="indicateur"><small>À rapprocher</small><b style={{ color: e.donnees.ecritures.length + e.donnees.operations.length ? 'var(--orange)' : 'var(--vert)' }}>{e.donnees.ecritures.length + e.donnees.operations.length}</b><span>écritures et opérations</span></div>
        <div className="indicateur"><small>Écart avec le relevé</small><b style={{ color: e.donnees.ecart ? 'var(--rouge)' : 'var(--vert)' }}>{e.donnees.ecart === null ? '—' : montant(e.donnees.ecart)}</b><span>{e.donnees.ecart === null ? 'saisir le solde du relevé' : e.donnees.ecart ? 'à analyser' : 'rapprochement équilibré'}</span></div>
      </div>
      <div className="grille deux">
        <Carte titre={`Écritures absentes du relevé (${montant(e.donnees.totalEcritures)})`}>{!e.donnees.ecritures.length ? <div className="vide">Aucune.</div> :
          <table className="tableau"><thead><tr><th>Date</th><th>Pièce</th><th>Libellé</th><th className="nombre">Montant</th></tr></thead>
            <tbody>{e.donnees.ecritures.map((x, i) => <tr key={i}><td>{date(x.date)}</td><td className="code">{x.piece}</td><td>{x.libelle}</td><td className="nombre">{signe(x.montant)}</td></tr>)}</tbody></table>}</Carte>
        <Carte titre={`Opérations du relevé non comptabilisées (${montant(e.donnees.totalOperations)})`}>{!e.donnees.operations.length ? <div className="vide">Aucune.</div> :
          <table className="tableau"><thead><tr><th>Date</th><th>Libellé</th><th>Réf.</th><th className="nombre">Montant</th></tr></thead>
            <tbody>{e.donnees.operations.map((x, i) => <tr key={i}><td>{date(x.date)}</td><td>{x.libelle}</td><td className="code">{x.reference ?? '—'}</td><td className="nombre">{signe(x.montant)}</td></tr>)}</tbody></table>}</Carte>
      </div>
    </>}
  </>);
}
