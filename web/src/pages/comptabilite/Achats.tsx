/** Factures d'achat (FIN-RG-033, 034, 101, 145, 146) : saisie sur le journal ACH avec calcul, validation, paiement. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, date, montant } from '../../noyau/api';
import { Carte, Champ, Chargement, ChoixTiers, DepotPiece, Message, MessageErreur, Modale, Page, Statut, useAvis } from '../../noyau/composants';
import { useAction, useDonnees } from '../../noyau/donnees';
import { useSession } from '../../noyau/session';

interface Facture {
  id: string; numero_provisoire: string; reference: string; tiers_id: string; fournisseur: string; date_comptable: string; statut: string; numero_piece: string;
  rejetee: boolean; montant: number; echeance: string | null; payee: boolean; ordre: string | null; biens: number;
}
interface Modeles { achat: { code: string; libelle: string; compte: string; categorie: string | null }[]; reglement: { code: string; mode: string; condition: string }[] }
interface Ligne { modele: string; libelle: string; montantHT: string; quantite: string; codeTaxe: string; accessoire: boolean; groupe: string; passage: boolean; motif: string; remplaces: string[] }
interface Calcul {
  ht: number; taxe: number; ttc: number; recuperable: number; echeance: string;
  lignes: { libelle: string; compte: string; ht: number; quantite: number; taxe: number; recuperable: number; frais: number; cout: number; categorie: string | null; unitaireHT: number; traitement: string; proposePassageCharge: boolean }[];
}
const CONDITIONS = (c: string) => c === 'COMPTANT' ? 'comptant' : c.endsWith('FM') ? `${c.slice(1, -2)} jours fin de mois` : c.startsWith('LE') ? `le ${c.slice(2)} du mois suivant` : `${c.slice(1)} jours`;
const TRAITEMENTS: Record<string, [string, string]> = { CHARGE: ['Charge', 'gris'], IMMOBILISATION: ['Immobilisation', 'violet'], PASSAGE_CHARGE: ['Passage en charge', 'orange'] };

function statutFacture(f: Facture): [string, string] {
  if (f.rejetee) return ['Rejetée', 'rouge'];
  if (f.statut === 'BROUILLARD') return ['En validation', 'orange'];
  if (f.payee) return ['Payée', 'vert'];
  if (f.ordre) return [`Ordre ${f.ordre.split(' ')[0]}`, 'bleu'];
  return ['À payer', 'violet'];
}

export function PageFacturesAchat() {
  const { peut } = useSession();
  const liste = useDonnees<Facture[]>('/achats/factures');
  const [nouvelle, setNouvelle] = useState(false);
  const [payer, setPayer] = useState<Facture | null>(null);
  const { avis, Avis } = useAvis();
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const apayer = (liste.donnees ?? []).filter(f => !f.rejetee && f.statut === 'VALIDEE' && !f.payee);
  return (
    <Page fil={['Comptabilité', 'Factures d\'achat']} titre="Factures d'achat" actions={peut('FACTURE_ACHAT:CREER') && <button className="bouton" onClick={() => setNouvelle(true)}>+ Saisir une facture</button>}>
      <div className="grille quatre">
        <div className="indicateur"><small>À payer</small><b>{montant(apayer.reduce((s, f) => s + Number(f.montant), 0))} GNF</b><span>{apayer.length} facture(s)</span></div>
        <div className="indicateur"><small>Échues</small><b style={{ color: 'var(--rouge)' }}>{apayer.filter(f => f.echeance && f.echeance.slice(0, 10) < aujourdhui).length}</b><span>échéance dépassée</span></div>
        <div className="indicateur"><small>En validation</small><b>{(liste.donnees ?? []).filter(f => !f.rejetee && f.statut === 'BROUILLARD').length}</b><span>comptable puis DAF</span></div>
      </div>
      <Carte titre="Factures">
        {liste.chargement ? <Chargement /> : !liste.donnees?.length ? <div className="vide">Aucune facture d'achat.</div> :
          <table className="tableau"><thead><tr><th>Fiche</th><th>Fournisseur</th><th>Facture</th><th>Date</th><th>Échéance</th><th className="nombre">Montant TTC</th><th>Pièce</th><th>Biens</th><th>Statut</th><th /></tr></thead>
            <tbody>{liste.donnees.map(f => { const [l, c] = statutFacture(f); return <tr key={f.id}>
              <td className="code">{f.numero_provisoire}</td><td>{f.fournisseur}</td><td className="code">{f.reference}</td><td>{date(f.date_comptable)}</td>
              <td style={!f.payee && f.echeance && f.echeance.slice(0, 10) < aujourdhui ? { color: 'var(--rouge)' } : undefined}>{date(f.echeance)}</td>
              <td className="nombre">{montant(f.montant)}</td><td className="code">{f.statut === 'VALIDEE' ? f.numero_piece : '—'}</td>
              <td>{f.biens ? <Link to="/comptabilite/immobilisations">{f.biens}</Link> : '—'}</td><td><Statut couleur={c}>{l}</Statut></td>
              <td>{!f.rejetee && f.statut === 'VALIDEE' && !f.payee && !f.ordre && peut('FACTURE_ACHAT:CREER') && <button className="lien" onClick={() => setPayer(f)}>Ordonner le paiement</button>}</td>
            </tr>; })}</tbody></table>}
      </Carte>
      <Message>La facture reste au brouillard, sans effet sur les comptes, jusqu'à sa validation par un second comptable puis la DAF (<Link to="/validations">Validations</Link>). Une ligne imputée en immobilisation crée les fiches du registre à la validation.
        Le paiement suit la chaîne de paiement : validation par la DAF, exécution par la Trésorerie, lettrage avec la facture.</Message>
      {nouvelle && <NouvelleFacture fermer={() => setNouvelle(false)} apres={m => { setNouvelle(false); avis(m); void liste.recharger(); }} />}
      {payer && <PaiementFacture f={payer} fermer={() => setPayer(null)} apres={m => { setPayer(null); avis(m); void liste.recharger(); }} />}
      <Avis />
    </Page>
  );
}

const ligneVide = (): Ligne => ({ modele: 'FOURNITURES', libelle: '', montantHT: '', quantite: '1', codeTaxe: '', accessoire: false, groupe: '', passage: false, motif: '', remplaces: [] });

function NouvelleFacture({ fermer, apres }: { fermer: () => void; apres: (m: string) => void }) {
  const modeles = useDonnees<Modeles>('/achats/modeles');
  const taxes = useDonnees<{ code: string; libelle: string; type: string }[]>('/comptabilite/codes-taxes');
  const mobilier = useDonnees<{ id: string; numero_inventaire: string; designation: string; categorie_code: string }[]>('/immobilisations?statut=EN_SERVICE');
  const [objetId] = useState(() => crypto.randomUUID());
  const [fournisseur, setFournisseur] = useState<{ id: string; nom: string } | null>(null);
  const [numero, setNumero] = useState('');
  const [dateFacture, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reglement, setReglement] = useState('30J');
  const [piece, setPiece] = useState<{ id: string } | null>(null);
  const [lignes, setLignes] = useState<Ligne[]>([ligneVide()]);
  const [calcul, setCalcul] = useState<Calcul | null>(null);
  const action = useAction();
  const modif = (i: number, p: Partial<Ligne>) => { setLignes(lignes.map((l, j) => (j === i ? { ...l, ...p } : l))); setCalcul(null); };
  const categorie = (code: string) => modeles.donnees?.achat.find(m => m.code === code)?.categorie ?? null;
  const corps = () => ({
    fournisseurTiersId: fournisseur!.id, numeroFacture: numero, dateFacture, pieceDocumentId: piece?.id ?? crypto.randomUUID(), modeleReglement: reglement,
    lignes: lignes.map(l => ({ modele: l.modele, libelle: l.libelle, montantHT: Number(l.montantHT), quantite: Number(l.quantite) || 1, codeTaxe: l.codeTaxe || undefined,
      accessoire: l.accessoire || undefined, groupe: l.groupe || undefined, passageEnCharge: l.passage ? { motif: l.motif, biensRemplaces: l.remplaces.length ? l.remplaces : undefined } : undefined })),
  });
  const complet = fournisseur && numero.trim() && lignes.every(l => l.libelle.trim() && Number(l.montantHT) > 0 && (!l.passage || l.motif.trim()));
  return (
    <Modale titre="Saisir une facture d'achat" large fermer={fermer}>
      <div className="formulaire">
        <Champ libelle="Fournisseur" large><ChoixTiers valeur={fournisseur} choisir={t => { setFournisseur(t); setCalcul(null); }} /></Champ>
        <Champ libelle="N° de la facture du fournisseur"><input value={numero} onChange={e => { setNumero(e.target.value); setCalcul(null); }} /></Champ>
        <Champ libelle="Date de la facture"><input type="date" value={dateFacture} onChange={e => { setDate(e.target.value); setCalcul(null); }} /></Champ>
        <Champ libelle="Règlement">{modeles.donnees && <select value={reglement} onChange={e => { setReglement(e.target.value); setCalcul(null); }}>
          {modeles.donnees.reglement.map(m => <option key={m.code} value={m.code}>{CONDITIONS(m.condition)}</option>)}</select>}</Champ>
        <Champ libelle="Facture scannée" aide="Obligatoire"><DepotPiece objetType="piece_comptable" objetId={objetId} typeDocument="FACTURE_FOURNISSEUR" depose={setPiece} /></Champ>
      </div>
      <h3>Lignes</h3>
      {lignes.map((l, i) => { const cat = categorie(l.modele); return (
        <div key={i} className="ligne-achat">
          <div className="formulaire">
            <Champ libelle="Nature">{modeles.donnees && <select value={l.modele} onChange={e => modif(i, { modele: e.target.value, passage: false })}>{modeles.donnees.achat.map(m => <option key={m.code} value={m.code}>{m.libelle}</option>)}</select>}</Champ>
            <Champ libelle="Désignation"><input value={l.libelle} onChange={e => modif(i, { libelle: e.target.value })} /></Champ>
            <Champ libelle="Montant HT (GNF)"><input inputMode="numeric" value={l.montantHT} onChange={e => modif(i, { montantHT: e.target.value.replace(/\D/g, '') })} /></Champ>
            {cat && <Champ libelle="Quantité"><input inputMode="numeric" value={l.quantite} onChange={e => modif(i, { quantite: e.target.value.replace(/\D/g, '') })} /></Champ>}
            <Champ libelle="Taxe">{taxes.donnees && <select value={l.codeTaxe} onChange={e => modif(i, { codeTaxe: e.target.value })}><option value="">Aucune</option>
              {taxes.donnees.filter(t => t.type === 'DEDUCTIBLE' || t.type === 'COLLECTEE').map(t => <option key={t.code} value={t.code}>{t.code} – {t.libelle}</option>)}</select>}</Champ>
            {!cat && <Champ libelle="Frais accessoires" aide="Transport, installation : répartis sur les biens"><input type="checkbox" checked={l.accessoire} onChange={e => modif(i, { accessoire: e.target.checked })} /></Champ>}
            {cat && <Champ libelle="Bien composé" aide="Même code pour les éléments d'un seul bien"><input value={l.groupe} onChange={e => modif(i, { groupe: e.target.value.toUpperCase() })} placeholder="ex. POSTE1" /></Champ>}
            {cat && <Champ libelle="Passage en charge" aide="Bien de faible valeur (CGI art. 101-VIII)"><input type="checkbox" checked={l.passage} onChange={e => modif(i, { passage: e.target.checked })} /></Champ>}
          </div>
          {l.passage && <div className="formulaire">
            <Champ libelle="Motif" large><input value={l.motif} onChange={e => modif(i, { motif: e.target.value })} placeholder={cat === 'MOBILIER' ? 'Renouvellement du mobilier…' : 'Bien de faible valeur'} /></Champ>
            {cat === 'MOBILIER' && <Champ libelle="Biens remplacés" large aide="Mobilier en service sorti du registre à la validation">
              <select multiple size={5} value={l.remplaces} onChange={e => modif(i, { remplaces: [...e.target.selectedOptions].map(o => o.value) })}>
                {(mobilier.donnees ?? []).filter(b => b.categorie_code === 'MOBILIER').map(b => <option key={b.id} value={b.id}>{b.numero_inventaire} – {b.designation}</option>)}</select></Champ>}
          </div>}
          {lignes.length > 1 && <button className="lien" onClick={() => { setLignes(lignes.filter((_, j) => j !== i)); setCalcul(null); }}>Retirer la ligne</button>}
        </div>); })}
      <button className="bouton secondaire petit" onClick={() => { setLignes([...lignes, ligneVide()]); setCalcul(null); }}>+ Ligne</button>
      {calcul && <>
        <h3>Écriture proposée</h3>
        <table className="tableau"><thead><tr><th>Ligne</th><th>Compte</th><th>Traitement</th><th className="nombre">HT</th><th className="nombre">Taxe</th><th className="nombre">Dont récupérable</th><th className="nombre">Frais répartis</th><th className="nombre">Imputé</th><th className="nombre">Unitaire HT</th></tr></thead>
          <tbody>{calcul.lignes.map((l, i) => <tr key={i}><td>{l.libelle}{l.quantite > 1 ? ` × ${l.quantite}` : ''}</td><td className="code">{l.traitement === 'PASSAGE_CHARGE' ? '6312' : l.compte.replace(/0+$/, '')}</td>
            <td><Statut couleur={TRAITEMENTS[l.traitement]?.[1]}>{TRAITEMENTS[l.traitement]?.[0]}</Statut>{l.traitement === 'IMMOBILISATION' && l.proposePassageCharge && <small className="doux"> · passage en charge possible</small>}</td>
            <td className="nombre">{montant(l.ht)}</td><td className="nombre">{montant(l.taxe)}</td><td className="nombre">{montant(l.recuperable)}</td><td className="nombre">{l.frais ? montant(l.frais) : '—'}</td>
            <td className="nombre">{montant(l.cout)}</td><td className="nombre">{l.categorie ? montant(l.unitaireHT) : '—'}</td></tr>)}</tbody></table>
        <dl className="details"><dt>Total HT</dt><dd>{montant(calcul.ht)} GNF</dd><dt>Taxes</dt><dd>{montant(calcul.taxe)} GNF{calcul.recuperable ? ` (dont ${montant(calcul.recuperable)} récupérable)` : ''}</dd>
          <dt>Dû au fournisseur</dt><dd><b>{montant(calcul.ttc)} GNF</b></dd><dt>Échéance</dt><dd>{date(calcul.echeance)}</dd></dl>
      </>}
      <MessageErreur erreur={action.erreur} />
      <div className="boutons">
        <button className="bouton secondaire" disabled={!complet || action.enCours} onClick={() => void action.executer(() => api<Calcul>('POST', '/achats/factures/calcul', corps())).then(r => r && setCalcul(r))}>Calculer</button>
        <button className="bouton" disabled={!complet || !calcul || !piece || action.enCours}
          onClick={() => void action.executer(() => api<{ numero: string; ttc: number }>('POST', '/achats/factures', corps())).then(r => r && apres(`Facture enregistrée au brouillard (${r.numero}, ${montant(r.ttc)} GNF) et soumise à validation.`))}>Enregistrer</button>
      </div>
    </Modale>
  );
}

function PaiementFacture({ f, fermer, apres }: { f: Facture; fermer: () => void; apres: (m: string) => void }) {
  const coordonnees = useDonnees<{ id: string; type: string; etablissement: string; numeroMasque: string; statut: string }[]>(`/tiers/${f.tiers_id}/coordonnees`);
  const [coordonnee, setCoordonnee] = useState('');
  const action = useAction();
  const payables = (coordonnees.donnees ?? []).filter(c => c.statut === 'VERIFIEE');
  return (
    <Modale titre={`Payer la facture ${f.reference}`} fermer={fermer}>
      <dl className="details"><dt>Fournisseur</dt><dd>{f.fournisseur}</dd><dt>Montant</dt><dd><b>{montant(f.montant)} GNF</b></dd><dt>Échéance</dt><dd>{date(f.echeance)}</dd></dl>
      {coordonnees.chargement ? <Chargement /> : !payables.length ? <Message type="attention">Aucune coordonnée de paiement vérifiée pour ce fournisseur : enregistrez-les sur sa fiche tiers (REF-RG-005).</Message> :
        <div className="formulaire"><Champ libelle="Coordonnées" large><select value={coordonnee} onChange={e => setCoordonnee(e.target.value)}><option value="">Choisir…</option>
          {payables.map(c => <option key={c.id} value={c.id}>{c.etablissement} {c.numeroMasque}</option>)}</select></Champ></div>}
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton" disabled={!coordonnee || action.enCours}
        onClick={() => void action.executer(() => api<{ numero: string }>('POST', `/achats/factures/${f.id}/paiement`, { coordonneeId: coordonnee })).then(r => r && apres(`Ordre de paiement ${r.numero} soumis à la DAF.`))}>Ordonner le paiement</button></div>
    </Modale>
  );
}
