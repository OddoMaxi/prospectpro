/** Cartes d'assuré (SAN-RG-011 à 019) : file de production (SA-04), cartes d'une police (fiche police), carte numérique (AS-02). */
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api, date, dateHeure, montant, ouvrirFichier } from '../../noyau/api';
import { Carte, Champ, Chargement, Indicateur, Message, MessageErreur, Modale, Page, Statut, useAvis } from '../../noyau/composants';
import { useAction, useDonnees } from '../../noyau/donnees';
import { useSession } from '../../noyau/session';

const MOTIFS: Record<string, string> = { DEMANDE_ASSURE: 'Demande de l\'assuré', OFFICE: 'Pas de smartphone (d\'office)', REMPLACEMENT_PERTE: 'Remplacement (perte)', REMPLACEMENT_VOL: 'Remplacement (vol)' };
const LIEUX: Record<string, string> = { BUREAU: 'Bureau', SIEGE: 'Siège', LIVRAISON: 'Livraison' };
const PRODUCTION: Record<string, [string, string]> = { NUMERIQUE_SEULE: ['Numérique', 'gris'], PHYSIQUE_DEMANDEE: ['Physique demandée', 'orange'], IMPRIMEE: ['Imprimée', 'bleu'], REMISE: ['Remise', 'vert'] };
const ETATS: Record<string, [string, string]> = { VALIDE: ['Valide', 'vert'], BLOQUEE: ['Bloquée', 'rouge'], REVOQUEE: ['Révoquée', 'gris'] };

// ---------------------------------------------------------------- file de production (SA-04)

interface Ligne { id: string; numero: string; numero_serie: string; production: string; motif_production: string | null; lieu_retrait: string | null; bureau: string | null; adresse_livraison: string | null; demandee_le: string; imprimee_le: string | null; assure: string; police: string }

export function PageCartes() {
  const { peut } = useSession();
  const f = useDonnees<{ file: Ligne[]; indicateurs: { demandees: number; imprimees: number; remises_mois: number; partPhysique: number } }>('/sante/cartes/production');
  const [selection, setSelection] = useState<string[]>([]);
  const [remise, setRemise] = useState<Ligne | null>(null);
  const action = useAction();
  const { avis, Avis } = useAvis();
  const demandees = (f.donnees?.file ?? []).filter(x => x.production === 'PHYSIQUE_DEMANDEE');
  const imprimer = async () => {
    for (const id of selection) await api('POST', `/sante/cartes/${id}/impression`);
    setSelection([]); avis(`${selection.length} carte(s) imprimée(s) : les assurés sont prévenus.`); void f.recharger();
  };
  const ouvrir = async (id: string) => { const d = await api<{ id: string }[]>('GET', `/documents?objetType=carte_assure&objetId=${id}`); const doc = d.find(() => true); if (doc) await ouvrirFichier('GET', `/documents/${doc.id}/fichier`); };
  return (
    <Page fil={['Santé', 'Cartes d\'assurés']} titre="Cartes physiques demandées">
      {!f.donnees ? <Chargement /> : <>
        <div className="grille quatre">
          <Indicateur libelle="Demandées" valeur={f.donnees.indicateurs.demandees} />
          <Indicateur libelle="Imprimées à remettre" valeur={f.donnees.indicateurs.imprimees} />
          <Indicateur libelle="Remises ce mois" valeur={f.donnees.indicateurs.remises_mois} />
          <Indicateur libelle="Part de cartes physiques" valeur={`${f.donnees.indicateurs.partPhysique} %`} couleur="vert" detail="Objectif zéro papier" />
        </div>
        <MessageErreur erreur={action.erreur} />
        <Carte titre="File de production" actions={peut('CARTES_ASSURE:MODIFIER') && <button className="bouton" disabled={!selection.length || action.enCours} onClick={() => void action.executer(imprimer)}>Imprimer la sélection ({selection.length})</button>}>
          {!f.donnees.file.length ? <div className="vide">Aucune carte physique en cours.</div> :
            <table className="tableau"><thead><tr><th /><th>Carte</th><th>Assuré</th><th>Motif</th><th>Lieu de retrait</th><th>Demandée</th><th>Statut</th><th /></tr></thead>
              <tbody>{f.donnees.file.map(x => <tr key={x.id}>
                <td>{x.production === 'PHYSIQUE_DEMANDEE' && <input type="checkbox" checked={selection.includes(x.id)} onChange={e => setSelection(e.target.checked ? [...selection, x.id] : selection.filter(y => y !== x.id))} />}</td>
                <td className="code">…{x.numero.slice(-9)}<br /><small className="doux">{x.numero_serie}</small></td><td>{x.assure}</td><td>{MOTIFS[x.motif_production ?? ''] ?? '—'}</td>
                <td>{x.lieu_retrait === 'BUREAU' ? x.bureau : LIEUX[x.lieu_retrait ?? ''] ?? '—'}{x.adresse_livraison && <><br /><small className="doux">{x.adresse_livraison}</small></>}</td><td>{dateHeure(x.demandee_le)}</td>
                <td><Statut couleur={PRODUCTION[x.production]?.[1]}>{PRODUCTION[x.production]?.[0]}</Statut></td>
                <td style={{ whiteSpace: 'nowrap' }}>{x.production === 'IMPRIMEE' && <><button className="lien" onClick={() => void ouvrir(x.id)}>Fiche</button>{peut('CARTES_ASSURE:MODIFIER') && <>{' · '}<button className="lien" onClick={() => setRemise(x)}>Remettre</button></>}</>}</td>
              </tr>)}</tbody></table>}
        </Carte>
        <Message>La remise est confirmée par le code de l'assuré (ou de son représentant pour un mineur), sans signature papier. Le support est valable 3 ans ; les droits suivent la période payée. {demandees.length ? `${demandees.length} carte(s) à imprimer.` : ''}</Message>
      </>}
      {remise && <RemiseCarte id={remise.id} libelle={`${remise.assure} – ${remise.numero}`} fermer={() => setRemise(null)} apres={() => { setRemise(null); avis('Carte remise.'); void f.recharger(); }} />}
      <Avis />
    </Page>
  );
}

function RemiseCarte({ id, libelle, fermer, apres }: { id: string; libelle: string; fermer: () => void; apres: () => void }) {
  const [envoye, setEnvoye] = useState(false);
  const [code, setCode] = useState('');
  const action = useAction();
  return (
    <Modale titre="Remise de la carte" fermer={fermer}>
      <p>{libelle}</p>
      {!envoye ? <button className="bouton" disabled={action.enCours} onClick={() => void action.executer(() => api('POST', `/sante/cartes/${id}/remise`)).then(r => r !== undefined && setEnvoye(true))}>Envoyer le code à l'assuré</button>
        : <div className="filtres"><input inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="Code reçu par l'assuré" />
          <button className="bouton" disabled={code.length !== 6 || action.enCours} onClick={() => void action.executer(() => api('POST', `/sante/cartes/${id}/remise/confirmation`, { code })).then(r => r && apres())}>Confirmer la remise</button></div>}
      <MessageErreur erreur={action.erreur} />
    </Modale>
  );
}

// ---------------------------------------------------------------- cartes d'une police (fiche police)

interface CartePolice { id: string; numero: string; numero_serie: string; production: string; assure: string; rang: string; etat: string; motif: string | null; validite_support: string | null; groupe_sanguin: string | null; revoquee_le: string | null; motif_revocation: string | null; demandee_le: string | null; remise_le: string | null }

export function CartesPolice({ policeId, bureauId }: { policeId: string; bureauId?: string }) {
  const { peut } = useSession();
  const l = useDonnees<CartePolice[]>(`/polices/${policeId}/cartes`);
  const [physique, setPhysique] = useState<CartePolice | null>(null);
  const [perte, setPerte] = useState<CartePolice | null>(null);
  const [groupe, setGroupe] = useState<CartePolice | null>(null);
  const { avis, Avis } = useAvis();
  if (!l.donnees) return <Carte titre="Cartes"><Chargement /></Carte>;
  return (
    <Carte titre="Cartes d'assuré">
      {!l.donnees.length ? <div className="vide">Aucune carte : la police ne comporte pas de garantie santé.</div> :
        <table className="tableau"><thead><tr><th>Carte</th><th>Assuré</th><th>Série</th><th>Support</th><th>Droits</th><th>Groupe sanguin</th><th /></tr></thead>
          <tbody>{l.donnees.map(c => <tr key={c.id}><td className="code">{c.numero}</td><td>{c.assure}</td><td className="code">{c.numero_serie}</td>
            <td><Statut couleur={PRODUCTION[c.production]?.[1]}>{PRODUCTION[c.production]?.[0]}</Statut>{c.validite_support && <><br /><small className="doux">jusqu'au {date(c.validite_support)}</small></>}</td>
            <td><Statut couleur={ETATS[c.etat]?.[1]}>{ETATS[c.etat]?.[0]}</Statut>{c.motif && <><br /><small className="doux">{c.motif}{c.revoquee_le ? ` le ${date(c.revoquee_le)}` : ''}</small></>}</td>
            <td>{c.groupe_sanguin ?? '—'}</td>
            <td style={{ whiteSpace: 'nowrap' }}>{c.etat !== 'REVOQUEE' && peut('CARTES_ASSURE:CREER') && <>
              {c.production === 'NUMERIQUE_SEULE' && <><button className="lien" onClick={() => setPhysique(c)}>Carte physique</button>{' · '}</>}
              <button className="lien" onClick={() => setPerte(c)}>Perte ou vol</button>{peut('CARTES_ASSURE:MODIFIER') && <>{' · '}<button className="lien" onClick={() => setGroupe(c)}>Groupe sanguin</button></>}</>}</td></tr>)}</tbody></table>}
      <p className="doux">Les droits ne sont jamais recopiés : ils suivent la police (période payée, suspension, résiliation) et les motifs de blocage, et reprennent au renouvellement sans nouvelle carte.</p>
      {physique && <DemandePhysique c={physique} bureauId={bureauId} fermer={() => setPhysique(null)} apres={m => { setPhysique(null); avis(m); void l.recharger(); }} />}
      {perte && <Perte c={perte} fermer={() => setPerte(null)} apres={m => { setPerte(null); avis(m); void l.recharger(); }} />}
      {groupe && <GroupeSanguin c={groupe} fermer={() => setGroupe(null)} apres={() => { setGroupe(null); avis('Groupe sanguin enregistré.'); void l.recharger(); }} />}
      <Avis />
    </Carte>
  );
}

function DemandePhysique({ c, bureauId, fermer, apres }: { c: CartePolice; bureauId?: string; fermer: () => void; apres: (m: string) => void }) {
  const bureaux = useDonnees<{ id: string; code: string; nom: string }[]>('/bureaux');
  const banques = useDonnees<{ code: string; nom: string }[]>('/banques-operateurs');
  const [lieu, setLieu] = useState<'BUREAU' | 'SIEGE' | 'LIVRAISON'>('BUREAU');
  const [bureau, setBureau] = useState(bureauId ?? '');
  const [adresse, setAdresse] = useState('');
  const [office, setOffice] = useState(false);
  const [paiement, setPaiement] = useState<'' | 'COMPTE_PRODUCTION' | 'PAIEMENT_DIRECT'>('');
  const [banque, setBanque] = useState('');
  const action = useAction();
  const fraisRequis = action.erreur && (action.erreur as { code?: string }).code === 'PAIEMENT_REQUIS';
  return (
    <Modale titre={`Carte physique – ${c.assure}`} fermer={fermer}>
      <div className="formulaire">
        <Champ libelle="Lieu de retrait"><select value={lieu} onChange={e => setLieu(e.target.value as typeof lieu)}><option value="BUREAU">Bureau</option><option value="SIEGE">Siège</option><option value="LIVRAISON">Livraison</option></select></Champ>
        {lieu === 'BUREAU' && <Champ libelle="Bureau"><select value={bureau} onChange={e => setBureau(e.target.value)}><option value="">Choisir…</option>{bureaux.donnees?.map(b => <option key={b.id} value={b.id}>{b.code} – {b.nom}</option>)}</select></Champ>}
        {lieu === 'LIVRAISON' && <Champ libelle="Adresse" large><input value={adresse} onChange={e => setAdresse(e.target.value)} /></Champ>}
        <label className="el-choix"><input type="checkbox" checked={office} onChange={e => setOffice(e.target.checked)} /> D'office (assuré sans smartphone)</label>
        {(fraisRequis || paiement) && <><Champ libelle="Paiement des frais"><select value={paiement} onChange={e => setPaiement(e.target.value as typeof paiement)}><option value="">Choisir…</option><option value="COMPTE_PRODUCTION">Compte de production du bureau</option><option value="PAIEMENT_DIRECT">Paiement direct (monnaie électronique)</option></select></Champ>
          {paiement === 'PAIEMENT_DIRECT' && <Champ libelle="Opérateur"><select value={banque} onChange={e => setBanque(e.target.value)}><option value="">Choisir…</option>{banques.donnees?.map(b => <option key={b.code} value={b.code}>{b.nom}</option>)}</select></Champ>}</>}
      </div>
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton" disabled={(lieu === 'BUREAU' && !bureau) || (lieu === 'LIVRAISON' && !adresse.trim()) || (paiement === 'PAIEMENT_DIRECT' && !banque) || action.enCours}
        onClick={() => void action.executer(() => api<{ frais: number }>('POST', `/sante/cartes/${c.id}/physique`, { lieu, bureauId: lieu === 'BUREAU' ? bureau : undefined, adresse: lieu === 'LIVRAISON' ? adresse : undefined, office,
          paiement: paiement === 'COMPTE_PRODUCTION' ? { type: paiement } : paiement === 'PAIEMENT_DIRECT' ? { type: paiement, moyen: 'MONNAIE_ELECTRONIQUE', banque } : undefined }))
          .then(r => r && apres(`Carte physique demandée${r.frais ? ` ; frais de ${montant(r.frais)} GNF encaissés` : ''}.`))}>Demander</button></div>
    </Modale>
  );
}

function Perte({ c, fermer, apres }: { c: CartePolice; fermer: () => void; apres: (m: string) => void }) {
  const [motif, setMotif] = useState<'PERTE' | 'VOL'>('PERTE');
  const action = useAction();
  return (
    <Modale titre={`Perte ou vol – ${c.assure}`} fermer={fermer}>
      <Message type="attention">La carte {c.numero_serie} est révoquée immédiatement et une nouvelle carte numérique est émise. {['IMPRIMEE', 'REMISE'].includes(c.production) ? 'Un nouveau support physique sera facturé (frais de remplacement).' : ''}</Message>
      <div className="formulaire"><Champ libelle="Motif"><select value={motif} onChange={e => setMotif(e.target.value as typeof motif)}><option value="PERTE">Perte</option><option value="VOL">Vol</option></select></Champ></div>
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton danger" disabled={action.enCours} onClick={() => void action.executer(() => api<{ serie: string }>('POST', `/sante/cartes/${c.id}/perte`, { motif })).then(r => r && apres(`Carte révoquée ; nouvelle carte ${r.serie}.`))}>Révoquer et remplacer</button></div>
    </Modale>
  );
}

function GroupeSanguin({ c, fermer, apres }: { c: CartePolice; fermer: () => void; apres: () => void }) {
  const [groupe, setGroupe] = useState(c.groupe_sanguin ?? '');
  const [accord, setAccord] = useState(!!c.groupe_sanguin);
  const action = useAction();
  return (
    <Modale titre={`Groupe sanguin – ${c.assure}`} fermer={fermer}>
      <Message>Facultatif : il n'apparaît sur la carte que si l'assuré le connaît, le déclare et consent à son impression. Sans accord, aucune mention n'est imprimée.</Message>
      <div className="formulaire">
        <Champ libelle="Groupe"><select value={groupe} onChange={e => setGroupe(e.target.value)}><option value="">Non déclaré</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(g => <option key={g} value={g}>{g}</option>)}</select></Champ>
        <label className="el-choix"><input type="checkbox" checked={accord} onChange={e => setAccord(e.target.checked)} /> L'assuré consent à son impression</label>
      </div>
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton" disabled={action.enCours} onClick={() => void action.executer(() => api('POST', `/sante/cartes/${c.id}/groupe-sanguin`, { groupe: groupe || null, consentementImpression: accord })).then(r => r !== undefined && apres())}>Enregistrer</button></div>
    </Modale>
  );
}

// ---------------------------------------------------------------- carte numérique (AS-02)

export interface CarteNumerique { id: string; numero: string; serie: string; jeton: string; assure: string; rang: string; police: string; souscripteur: string; production: string; validiteSupport: string | null; groupeSanguin: string | null; valide: boolean; etat: string; motif: string | null }

export function CarteNumeriqueVue({ c, societe }: { c: CarteNumerique; societe?: string }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => { void QRCode.toDataURL(c.jeton, { margin: 1, width: 220 }).then(setQr); }, [c.jeton]);
  return (
    <div className="carte-assure">
      <div className={`carte-assure-recto${c.valide ? '' : ' bloquee'}`}>
        <b>{societe ?? 'Prospect Pro'}</b>
        <div className="carte-assure-corps"><div className="carte-assure-photo" aria-hidden="true">👤</div>
          <div><strong>{c.assure}</strong><span>Carte {c.numero}</span><span>Police {c.police}</span><span>Souscripteur : {c.souscripteur}</span>{c.groupeSanguin && <span>Groupe sanguin : {c.groupeSanguin}</span>}</div></div>
        <small>N° série {c.serie}{c.validiteSupport ? ` · support valable jusqu'au ${date(c.validiteSupport)}` : ''}</small>
      </div>
      {!c.valide && <div className="message attention">{c.motif}</div>}
      <div className="carte-assure-qr">{qr ? <img src={qr} alt="QR code de vérification" width={220} height={220} /> : <Chargement />}
        <small>Présentez ce QR code au prestataire. Il ne contient aucune donnée personnelle.</small></div>
    </div>
  );
}
