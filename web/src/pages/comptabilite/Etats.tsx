/**
 * FI-12 Journaux, grand livre et balance (FIN-RG-030 à 032, 120) ; FI-05 interrogation des pièces et contre-passation ;
 * FI-02 schémas comptables (FIN-RG-020, 021).
 */
import { useState } from 'react';
import { api, aujourdhui, date, dateHeure, montant } from '../../noyau/api';
import { Carte, Champ, Chargement, Message, MessageErreur, Modale, Onglets, Page, Statut, useAvis } from '../../noyau/composants';
import { useAction, useDonnees } from '../../noyau/donnees';
import { useSession } from '../../noyau/session';

const debutAnnee = () => `${aujourdhui().slice(0, 4)}-01-01`;
const TYPES_JOURNAL: Record<string, string> = {
  EMISSIONS: 'Émissions de primes', ENCAISSEMENTS: 'Encaissements', PRESTATIONS_SINISTRES: 'Prestations et sinistres', ACHATS: 'Achats', TRESORERIE_BANQUE: 'Trésorerie (banque)',
  TRESORERIE_CAISSE: 'Trésorerie (caisse)', INVENTAIRE: 'Inventaire', OPERATIONS_DIVERSES: 'Opérations diverses', A_NOUVEAUX: 'À-nouveaux',
};
const csv = (nom: string, entetes: string[], lignes: (string | number | null)[][]) => {
  const texte = [entetes, ...lignes].map(l => l.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + texte], { type: 'text/csv;charset=utf-8' })); a.download = nom; a.click();
};

// ---------------------------------------------------------------- FI-12

interface Journal { code: string; libelle: string; type: string; mode: string; ferme: boolean; compte_tresorerie: string | null; pieces: number; systeme: boolean }
type Edition = 'balance' | 'grand-livre';

export function PageEditions() {
  const { peut } = useSession();
  const journaux = useDonnees<Journal[]>('/comptabilite/journaux');
  const periodes = useDonnees<{ mois: string; statut: string }[]>('/periodes');
  const [edition, setEdition] = useState<Edition>('balance');
  const [du, setDu] = useState(debutAnnee());
  const [au, setAu] = useState(aujourdhui());
  const [compte, setCompte] = useState('');
  const [nouveau, setNouveau] = useState(false);
  const action = useAction();
  const { avis, Avis } = useAvis();
  const balance = useDonnees<{ numero: string; libelle: string; debit: number; credit: number; solde: number }[]>(edition === 'balance' ? `/comptabilite/balance?du=${du}&au=${au}` : null);
  const gl = useDonnees<{ date_comptable: string; numero_piece: string; journal: string; libelle: string; debit: number; credit: number; lettrage: string | null }[]>(
    edition === 'grand-livre' && compte ? `/comptabilite/grand-livre?compte=${encodeURIComponent(compte)}&du=${du}&au=${au}` : null);
  const provisoire = (periodes.donnees ?? []).some(p => p.mois >= du.slice(0, 7) && p.mois <= au.slice(0, 7) && p.statut !== 'CLOTUREE');
  const fermer = (j: Journal) => void action.executer(() => api('POST', `/journaux/${j.code}/fermeture`)).then(x => { if (x !== undefined) { avis(`Journal ${j.code} fermé pour l'avenir.`); void journaux.recharger(); } });
  const supprimer = (j: Journal) => void action.executer(() => api('DELETE', `/journaux/${j.code}`)).then(x => { if (x !== undefined) { avis(`Journal ${j.code} supprimé.`); void journaux.recharger(); } });
  const totalD = (balance.donnees ?? []).reduce((s, l) => s + Number(l.debit), 0), totalC = (balance.donnees ?? []).reduce((s, l) => s + Number(l.credit), 0);

  return (
    <Page fil={['Comptabilité', 'Journaux et éditions']} titre="Journaux et éditions">
      <Carte titre="Journaux" repere={1} actions={peut('JOURNAUX_TIERS:PARAMETRER') && <button className="bouton" onClick={() => setNouveau(true)}>+ Créer un journal</button>}>
        <MessageErreur erreur={action.erreur} />
        {journaux.chargement ? <Chargement /> :
          <table className="tableau"><thead><tr><th>Code</th><th>Journal</th><th>Type</th><th>Mode</th><th className="nombre">Pièces</th><th>État</th><th /></tr></thead>
            <tbody>{journaux.donnees?.map(j => <tr key={j.code}><td className="code">{j.code}</td><td>{j.libelle}{j.compte_tresorerie && <span className="doux"> · {j.compte_tresorerie}</span>}</td>
              <td>{TYPES_JOURNAL[j.type] ?? j.type}</td><td>{j.mode === 'MANUEL' ? 'Manuel, double validation' : 'Automatique'}</td><td className="nombre">{montant(j.pieces)}</td>
              <td>{j.ferme ? <Statut couleur="gris">Fermé</Statut> : <Statut couleur="vert">Ouvert</Statut>}</td>
              <td>{j.systeme ? <span className="doux">système</span> : peut('JOURNAUX_TIERS:PARAMETRER') && !j.ferme && (j.pieces ? <button className="lien" onClick={() => fermer(j)}>Fermer</button> : <button className="lien" onClick={() => supprimer(j)}>Supprimer</button>)}</td></tr>)}</tbody></table>}
      </Carte>
      <Carte titre="Éditions" repere={2}>
        <Onglets<Edition> actif={edition} choisir={setEdition} onglets={[{ code: 'balance', libelle: 'Balance générale' }, { code: 'grand-livre', libelle: 'Grand livre' }]} />
        <div className="filtres">
          <label>Du <input type="date" value={du} onChange={e => setDu(e.target.value)} /></label><label>au <input type="date" value={au} onChange={e => setAu(e.target.value)} /></label>
          {edition === 'grand-livre' && <input value={compte} onChange={e => setCompte(e.target.value)} placeholder="N° de compte" />}
          {provisoire && <Statut couleur="orange">Provisoire</Statut>}
          {edition === 'balance' && balance.donnees && <button className="bouton secondaire petit" onClick={() => csv(`balance-${du}-${au}.csv`, ['Compte', 'Libellé', 'Débit', 'Crédit', 'Solde'], balance.donnees!.map(l => [l.numero, l.libelle, l.debit, l.credit, l.solde]))}>Excel (CSV)</button>}
          {edition === 'grand-livre' && gl.donnees && <button className="bouton secondaire petit" onClick={() => csv(`grand-livre-${compte}.csv`, ['Date', 'Pièce', 'Journal', 'Libellé', 'Débit', 'Crédit', 'Lettrage'], gl.donnees!.map(l => [l.date_comptable.slice(0, 10), l.numero_piece, l.journal, l.libelle, l.debit, l.credit, l.lettrage]))}>Excel (CSV)</button>}
        </div>
        {edition === 'balance' && (balance.chargement ? <Chargement /> : <MessageErreur erreur={balance.erreur} />)}
        {edition === 'balance' && balance.donnees && <table className="tableau"><thead><tr><th>Compte</th><th>Libellé</th><th className="nombre">Débit</th><th className="nombre">Crédit</th><th className="nombre">Solde débiteur</th><th className="nombre">Solde créditeur</th></tr></thead>
          <tbody>{balance.donnees.map(l => <tr key={l.numero}><td className="code">{l.numero}</td><td>{l.libelle}</td><td className="nombre">{montant(l.debit)}</td><td className="nombre">{montant(l.credit)}</td>
            <td className="nombre">{Number(l.solde) > 0 ? montant(l.solde) : ''}</td><td className="nombre">{Number(l.solde) < 0 ? montant(-l.solde) : ''}</td></tr>)}</tbody>
          <tfoot><tr><td colSpan={2}>Totaux {totalD !== totalC && <Statut couleur="rouge">Déséquilibre</Statut>}</td><td className="nombre">{montant(totalD)}</td><td className="nombre">{montant(totalC)}</td><td colSpan={2} /></tr></tfoot></table>}
        {edition === 'grand-livre' && (!compte ? <div className="vide">Saisissez un numéro de compte.</div> : gl.chargement ? <Chargement /> : gl.erreur ? <MessageErreur erreur={gl.erreur} /> :
          <table className="tableau"><thead><tr><th>Date</th><th>Pièce</th><th>Journal</th><th>Libellé</th><th className="nombre">Débit</th><th className="nombre">Crédit</th><th>Lettrage</th></tr></thead>
            <tbody>{gl.donnees?.map((l, i) => <tr key={i}><td>{date(l.date_comptable)}</td><td className="code">{l.numero_piece}</td><td>{l.journal}</td><td>{l.libelle}</td>
              <td className="nombre">{Number(l.debit) ? montant(l.debit) : ''}</td><td className="nombre">{Number(l.credit) ? montant(l.credit) : ''}</td><td className="code">{l.lettrage ?? ''}</td></tr>)}</tbody></table>)}
      </Carte>
      <Message>Un journal automatique ne reçoit que des écritures générées ; un journal manuel, que des saisies validées. Toute édition porte « provisoire » tant que la période n'est pas clôturée <span className="repere">3</span>.</Message>
      {nouveau && <NouveauJournal fermer={() => setNouveau(false)} apres={m => { setNouveau(false); avis(m); void journaux.recharger(); }} />}
      <Avis />
    </Page>
  );
}

function NouveauJournal({ fermer, apres }: { fermer: () => void; apres: (m: string) => void }) {
  const [d, setD] = useState({ code: '', libelle: '', type: 'OPERATIONS_DIVERSES', mode: 'MANUEL', compteTresorerie: '' });
  const action = useAction();
  return (
    <Modale titre="Créer un journal" fermer={fermer}>
      <div className="formulaire">
        <Champ libelle="Code" aide="2 à 6 lettres ou chiffres"><input value={d.code} onChange={e => setD({ ...d, code: e.target.value.toUpperCase() })} /></Champ>
        <Champ libelle="Libellé"><input value={d.libelle} onChange={e => setD({ ...d, libelle: e.target.value })} /></Champ>
        <Champ libelle="Type"><select value={d.type} onChange={e => setD({ ...d, type: e.target.value })}>{Object.entries(TYPES_JOURNAL).map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select></Champ>
        <Champ libelle="Mode"><select value={d.mode} onChange={e => setD({ ...d, mode: e.target.value })}><option value="MANUEL">Manuel (fiches d'imputation)</option><option value="AUTOMATIQUE">Automatique (schémas)</option></select></Champ>
        {d.type.startsWith('TRESORERIE') && <Champ libelle="Compte de trésorerie"><input value={d.compteTresorerie} onChange={e => setD({ ...d, compteTresorerie: e.target.value })} /></Champ>}
      </div>
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton" disabled={!d.code || !d.libelle || action.enCours}
        onClick={() => void action.executer(() => api('POST', '/journaux', { ...d, compteTresorerie: d.compteTresorerie || undefined })).then(x => x && apres(`Journal ${d.code} créé.`))}>Créer</button></div>
    </Modale>
  );
}

// ---------------------------------------------------------------- FI-05

interface Piece { id: string; numero_piece: string; journal: string; date_comptable: string; date_origine: string | null; libelle: string; reference: string; origine: string; statut: string; montant: number; scellee: boolean }
interface DetailPiece extends Piece {
  scelle_le: string | null; extourne_de_id: string | null;
  lignes: { id: string; compte: string; compte_libelle: string; auxiliaire: string | null; libelle: string; debit: number; credit: number; echeance: string | null; lettrage: string | null }[];
}

export function PageInterrogation() {
  const journaux = useDonnees<Journal[]>('/comptabilite/journaux');
  const [f, setF] = useState({ journal: '', du: debutAnnee(), au: aujourdhui(), reference: '' });
  const [appliques, setAppliques] = useState(f);
  const pieces = useDonnees<Piece[]>(`/comptabilite/pieces?${new URLSearchParams(Object.entries(appliques).filter(([, v]) => v))}`);
  const [choisie, setChoisie] = useState<string | null>(null);
  const { avis, Avis } = useAvis();
  return (
    <Page fil={['Comptabilité', 'Interrogation']} titre="Interrogation des pièces">
      <form className="filtres" onSubmit={e => { e.preventDefault(); setAppliques(f); }}>
        <select value={f.journal} onChange={e => setF({ ...f, journal: e.target.value })}><option value="">Tous les journaux</option>{journaux.donnees?.map(j => <option key={j.code} value={j.code}>{j.code} – {j.libelle}</option>)}</select>
        <label>Du <input type="date" value={f.du} onChange={e => setF({ ...f, du: e.target.value })} /></label><label>au <input type="date" value={f.au} onChange={e => setF({ ...f, au: e.target.value })} /></label>
        <input value={f.reference} onChange={e => setF({ ...f, reference: e.target.value })} placeholder="Référence ou libellé" />
        <button className="bouton secondaire">Rechercher</button>
      </form>
      <Carte titre={`Pièces (${pieces.donnees?.length ?? 0})`}>
        {pieces.chargement ? <Chargement /> : !pieces.donnees?.length ? <div className="vide">Aucune pièce.</div> :
          <table className="tableau"><thead><tr><th>Pièce</th><th>Journal</th><th>Date</th><th>Libellé</th><th>Référence</th><th>Origine</th><th className="nombre">Montant</th><th>État</th></tr></thead>
            <tbody>{pieces.donnees.map(p => <tr key={p.id} className="cliquable" onClick={() => setChoisie(p.id)}><td className="code">{p.numero_piece}</td><td>{p.journal}</td>
              <td>{date(p.date_comptable)}{p.date_origine && <span className="doux"> (origine {date(p.date_origine)})</span>}</td><td>{p.libelle}</td><td>{p.reference}</td><td>{p.origine.toLowerCase()}</td>
              <td className="nombre">{montant(p.montant)}</td><td>{p.statut === 'BROUILLARD' ? <Statut couleur="orange">Brouillard</Statut> : p.scellee ? <Statut couleur="vert">Scellée</Statut> : <Statut couleur="bleu">Validée</Statut>}</td></tr>)}</tbody></table>}
      </Carte>
      {choisie && <FichePiece id={choisie} fermer={() => setChoisie(null)} apres={m => { setChoisie(null); avis(m); }} />}
      <Avis />
    </Page>
  );
}

function FichePiece({ id, fermer, apres }: { id: string; fermer: () => void; apres: (m: string) => void }) {
  const { peut } = useSession();
  const p = useDonnees<DetailPiece>(`/comptabilite/pieces/${id}`);
  const [motif, setMotif] = useState('');
  const action = useAction();
  if (!p.donnees) return <Modale titre="Pièce" fermer={fermer}><Chargement /></Modale>;
  const d = p.donnees;
  return (
    <Modale titre={`Pièce ${d.numero_piece}`} large fermer={fermer}>
      <dl className="details"><dt>Journal</dt><dd>{d.journal}</dd><dt>Date comptable</dt><dd>{date(d.date_comptable)}</dd><dt>Libellé</dt><dd>{d.libelle}</dd><dt>Référence</dt><dd>{d.reference}</dd>
        <dt>Scellement</dt><dd>{d.scelle_le ? dateHeure(d.scelle_le) : 'en attente du prochain lot'}</dd></dl>
      <table className="tableau"><thead><tr><th>Compte</th><th>Auxiliaire</th><th>Libellé</th><th className="nombre">Débit</th><th className="nombre">Crédit</th><th>Échéance</th><th>Lettrage</th></tr></thead>
        <tbody>{d.lignes.map(l => <tr key={l.id}><td className="code" title={l.compte_libelle}>{l.compte}</td><td className="code">{l.auxiliaire ?? ''}</td><td>{l.libelle}</td>
          <td className="nombre">{Number(l.debit) ? montant(l.debit) : ''}</td><td className="nombre">{Number(l.credit) ? montant(l.credit) : ''}</td><td>{date(l.echeance)}</td><td className="code">{l.lettrage ?? ''}</td></tr>)}</tbody></table>
      {d.statut === 'VALIDEE' && peut('JOURNAUX_TIERS:CREER') && <>
        <h3>Contre-passation</h3>
        <Message>Une écriture validée n'est jamais modifiée : elle se corrige par contre-passation, validée par la DAF.</Message>
        <div className="filtres"><input style={{ minWidth: 320 }} value={motif} onChange={e => setMotif(e.target.value)} placeholder="Motif" />
          <button className="bouton secondaire" disabled={!motif.trim() || action.enCours} onClick={() => void action.executer(() => api('POST', `/comptabilite/pieces/${id}/extourne`, { motif })).then(x => x && apres('Contre-passation soumise à la DAF.'))}>Proposer la contre-passation</button></div>
        <MessageErreur erreur={action.erreur} />
      </>}
    </Modale>
  );
}

// ---------------------------------------------------------------- FI-02

interface Schema { id: string; code_evt: string; type_evenement: string; journal: string; libelle_modele: string; date_effet: string; actif: boolean; lignes: { rang: number; compte: string | null; compte_libelle: string | null; regle: string | null; sens: string; formule: string }[] }

export function PageSchemas() {
  const s = useDonnees<{ schemas: Schema[]; regles: Record<string, string> }>('/comptabilite/schemas');
  return (
    <Page fil={['Comptabilité', 'Schémas comptables']} titre="Schémas comptables">
      <Message>Chaque événement métier génère ses écritures dans la même transaction, selon le schéma en vigueur à sa date. Un événement sans schéma actif est bloqué. Toute modification est proposée par le chef comptable et validée par la DAF ; elle prend effet à une date, sans effet rétroactif.</Message>
      {s.chargement ? <Chargement /> : s.donnees?.schemas.map(x => <Carte key={x.id} titre={<><span className="code">{x.code_evt}</span> · {x.type_evenement.toLowerCase().replace(/_/g, ' ')} · journal {x.journal}</>}
        actions={<span className="doux">en vigueur depuis le {date(x.date_effet)}</span>}>
        <p className="doux">{x.libelle_modele}</p>
        <table className="tableau"><thead><tr><th>Sens</th><th>Compte</th><th>Montant</th></tr></thead>
          <tbody>{x.lignes.map(l => <tr key={l.rang}><td>{l.sens === 'D' ? 'Débit' : 'Crédit'}</td>
            <td>{l.compte ? <><span className="code">{l.compte}</span> {l.compte_libelle}</> : <span title={s.donnees!.regles[l.regle!]}>{s.donnees!.regles[l.regle!] ?? l.regle}</span>}</td>
            <td className="code">{l.formule === '*' ? 'une ligne par élément' : l.formule}</td></tr>)}</tbody></table>
      </Carte>)}
    </Page>
  );
}
