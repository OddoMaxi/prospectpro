/** FI-03 Fiche d'imputation (FIN-RG-025, 033, 034, 110, 116) et FI-04 écritures à valider : brouillard, visas, numéro définitif à la validation. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, aujourdhui, date, montant } from '../../noyau/api';
import { Carte, Champ, Chargement, ChoixTiers, DepotPiece, Message, MessageErreur, Page, Statut, useAvis } from '../../noyau/composants';
import { useAction, useDonnees } from '../../noyau/donnees';
import { useSession } from '../../noyau/session';

interface Ligne { compte: string; libelle: string; debit: string; credit: string; echeance: string }
interface Fiche { id: string; numero_provisoire: string; journal: string; reference: string; libelle: string; date_comptable: string; statut: string; numero_piece: string; rejetee: boolean; montant: number; cree_le: string }
const vide = (): Ligne => ({ compte: '', libelle: '', debit: '', credit: '', echeance: '' });
const n = (s: string) => (s.trim() === '' ? 0 : Number(s.replace(/\s/g, '')));

export function PageFichesImputation() {
  const { peut } = useSession();
  const fiches = useDonnees<Fiche[]>('/fiches-imputation');
  const [nouvelle, setNouvelle] = useState(false);
  const { avis, Avis } = useAvis();
  if (nouvelle) return <NouvelleFiche fermer={() => setNouvelle(false)} apres={m => { setNouvelle(false); avis(m); void fiches.recharger(); }} />;
  return (
    <Page fil={['Comptabilité', 'Fiches d\'imputation']} titre="Fiches d'imputation" actions={peut('ECRITURE_MANUELLE:CREER') && <button className="bouton" onClick={() => setNouvelle(true)}>+ Nouvelle fiche</button>}>
      <Carte titre="Fiches établies">
        {fiches.chargement ? <Chargement /> : !fiches.donnees?.length ? <div className="vide">Aucune fiche d'imputation.</div> :
          <table className="tableau"><thead><tr><th>Fiche</th><th>Journal</th><th>Date</th><th>Référence</th><th>Libellé</th><th className="nombre">Montant</th><th>Pièce définitive</th><th>Statut</th></tr></thead>
            <tbody>{fiches.donnees.map(f => <tr key={f.id}><td className="code">{f.numero_provisoire}</td><td>{f.journal}</td><td>{date(f.date_comptable)}</td><td>{f.reference}</td><td>{f.libelle}</td>
              <td className="nombre">{montant(f.montant)}</td><td className="code">{f.statut === 'VALIDEE' ? f.numero_piece : '—'}</td>
              <td>{f.rejetee ? <Statut couleur="rouge">Rejetée</Statut> : f.statut === 'VALIDEE' ? <Statut couleur="vert">Validée</Statut> : <Statut couleur="orange">Brouillard</Statut>}</td></tr>)}</tbody></table>}
      </Carte>
      <Message>Les fiches au brouillard se valident dans <Link to="/validations">Validations</Link> : vérification par un comptable autre que l'auteur, puis approbation par la DAF.</Message>
      <Avis />
    </Page>
  );
}

function NouvelleFiche({ fermer, apres }: { fermer: () => void; apres: (m: string) => void }) {
  const { moi } = useSession();
  const journaux = useDonnees<{ code: string; libelle: string; mode: string; ferme: boolean }[]>('/comptabilite/journaux');
  const comptes = useDonnees<{ numero: string; libelle: string; imputable: boolean; en_sommeil: boolean }[]>('/comptabilite/comptes');
  const objetId = useMemo(() => crypto.randomUUID(), []);
  const [journal, setJournal] = useState('OD');
  const [dateSaisie, setDate] = useState(aujourdhui());
  const [reference, setReference] = useState('');
  const [libelle, setLibelle] = useState('');
  const [tiers, setTiers] = useState<{ id: string; nom: string } | null>(null);
  const [piece, setPiece] = useState<{ id: string; nom: string } | null>(null);
  const [lignes, setLignes] = useState<Ligne[]>([vide(), vide()]);
  const action = useAction();
  const manuels = (journaux.donnees ?? []).filter(j => j.mode === 'MANUEL' && !j.ferme);
  const imputables = (comptes.donnees ?? []).filter(c => c.imputable && !c.en_sommeil);
  const debit = lignes.reduce((s, l) => s + n(l.debit), 0), credit = lignes.reduce((s, l) => s + n(l.credit), 0);
  const maj = (i: number, k: keyof Ligne, v: string) => setLignes(ls => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const valides = lignes.filter(l => l.compte && (n(l.debit) || n(l.credit)));
  const pret = piece && reference.trim() && libelle.trim() && valides.length >= 2 && debit === credit && debit > 0;
  const soumettre = () => void action.executer(() => api<{ numero: string }>('POST', '/fiches-imputation', {
    journal, date: dateSaisie, reference, libelle, pieceDocumentId: piece!.id, tiersId: tiers?.id,
    lignes: valides.map(l => ({ compte: l.compte, libelle: l.libelle || libelle, debit: n(l.debit), credit: n(l.credit), echeance: l.echeance || undefined })),
  })).then(r => r && apres(`Fiche ${r.numero} enregistrée au brouillard et soumise à validation.`));
  return (
    <Page fil={['Comptabilité', 'Saisie', 'Fiche d\'imputation']} titre="Nouvelle fiche d'imputation">
      <datalist id="comptes">{imputables.map(c => <option key={c.numero} value={c.numero}>{c.libelle}</option>)}</datalist>
      <Carte>
        <div className="grille trois">
          <Champ libelle={<>Journal <span className="repere">1</span></>}><select value={journal} onChange={e => setJournal(e.target.value)}>{manuels.map(j => <option key={j.code} value={j.code}>{j.code} – {j.libelle} (manuel)</option>)}</select></Champ>
          <Champ libelle="Date comptable" aide="Exercice ouvert, période non clôturée"><input type="date" value={dateSaisie} onChange={e => setDate(e.target.value)} /></Champ>
          <Champ libelle="Tiers" aide="Facultatif"><ChoixTiers valeur={tiers} choisir={setTiers} /></Champ>
          <Champ libelle="Référence"><input value={reference} maxLength={60} onChange={e => setReference(e.target.value)} placeholder="Ex. FAC-2026-778" /></Champ>
          <Champ libelle="Libellé"><input value={libelle} maxLength={200} onChange={e => setLibelle(e.target.value)} /></Champ>
          <Champ libelle="Pièce jointe" aide="Obligatoire"><DepotPiece objetType="piece_comptable" objetId={objetId} typeDocument="PIECE_COMPTABLE" depose={setPiece} /></Champ>
        </div>
      </Carte>
      <Carte titre="Lignes" repere={2} actions={<button className="bouton secondaire petit" onClick={() => setLignes(l => [...l, vide()])}>+ Ligne</button>}>
        <table className="tableau"><thead><tr><th>Compte</th><th>Libellé</th><th className="nombre">Débit</th><th className="nombre">Crédit</th><th>Échéance</th><th /></tr></thead>
          <tbody>{lignes.map((l, i) => <tr key={i}>
            <td><input list="comptes" value={l.compte} onChange={e => maj(i, 'compte', e.target.value)} style={{ width: 130 }} />
              <div className="doux" style={{ fontSize: 12 }}>{imputables.find(c => c.numero === l.compte)?.libelle}</div></td>
            <td><input value={l.libelle} onChange={e => maj(i, 'libelle', e.target.value)} placeholder={libelle} /></td>
            <td><input className="nombre" inputMode="numeric" value={l.debit} disabled={!!n(l.credit)} onChange={e => maj(i, 'debit', e.target.value)} style={{ width: 130 }} /></td>
            <td><input className="nombre" inputMode="numeric" value={l.credit} disabled={!!n(l.debit)} onChange={e => maj(i, 'credit', e.target.value)} style={{ width: 130 }} /></td>
            <td><input type="date" value={l.echeance} onChange={e => maj(i, 'echeance', e.target.value)} /></td>
            <td>{lignes.length > 2 && <button className="lien" onClick={() => setLignes(ls => ls.filter((_, j) => j !== i))}>Retirer</button>}</td></tr>)}</tbody>
          <tfoot><tr><td colSpan={2}>Totaux {debit !== credit && <Statut couleur="rouge">Écart {montant(Math.abs(debit - credit))}</Statut>}</td><td className="nombre">{montant(debit)}</td><td className="nombre">{montant(credit)}</td><td colSpan={2} /></tr></tfoot>
        </table>
      </Carte>
      <div className="grille deux">
        <Carte titre={<>Visas électroniques <span className="repere">3</span></>}><dl className="details"><dt>Établi par</dt><dd>{moi?.prenoms} {moi?.nom}</dd><dt>Vérifié par</dt><dd>—</dd><dt>Approuvé par</dt><dd>—</dd></dl></Carte>
        <Message>L'écriture reste au brouillard, sans effet sur les soldes, jusqu'à la validation ; elle reçoit alors son numéro de pièce définitif. L'auteur ne peut pas valider <span className="repere">4</span>.</Message>
      </div>
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton" disabled={!pret || action.enCours} onClick={soumettre}>Enregistrer au brouillard et soumettre</button><button className="bouton secondaire" onClick={fermer}>Annuler</button></div>
    </Page>
  );
}
