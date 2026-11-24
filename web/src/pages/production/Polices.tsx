/** Polices : recherche, PR-01 fiche police (PROD-RG-005, 007 ; NUM-RG-006), PR-03 polices à renouveler (PROD-RG-020 à 027). */
import { Fragment, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, date, dateHeure, montant, ouvrirFichier } from '../../noyau/api';
import { Carte, Champ, Chargement, Indicateur, LienTiers, Message, MessageErreur, Modale, Onglets, Page, Statut, useAvis } from '../../noyau/composants';
import { useAction, useDonnees } from '../../noyau/donnees';
import { useSession } from '../../noyau/session';

const STATUTS_POLICE: Record<string, [string, string]> = {
  ACTIVE: ['Active', 'vert'], ECHUE: ['Échue', 'orange'], EXPIREE: ['Expirée', 'rouge'], ANNULEE: ['Annulée', 'gris'], RESILIEE: ['Résiliée', 'gris'], SUSPENDUE: ['Suspendue', 'rouge'],
};
const StatutPolice = ({ s }: { s: string }) => <Statut couleur={STATUTS_POLICE[s]?.[1]}>{STATUTS_POLICE[s]?.[0] ?? s}</Statut>;
const QUALITES: Record<string, string> = { ASSURE_PRINCIPAL: 'Assuré principal', CONJOINT: 'Conjoint', ENFANT: 'Enfant', ASCENDANT: 'Ascendant', AUTRE: 'Autre' };
const libelle = (s: string) => s.toLowerCase().replace(/_/g, ' ');
const MODES: Record<string, string> = { DEPOT: 'Débit du compte de production', COMPTE_PRODUCTION: 'Débit du compte de production', VERSEMENTS: 'Versements programmés', ESPECES_SIEGE: 'Espèces au siège', BANQUE: 'Banque', MONNAIE_ELECTRONIQUE: 'Monnaie électronique' };
const ACTIONS: Record<string, string> = { CREATION: 'Émission', MODIFICATION: 'Modification', VALIDATION: 'Validation', REJET: 'Rejet', SUPPRESSION: 'Suppression', CONSULTATION: 'Consultation', EXPORT: 'Export' };
const Majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------- recherche

interface LignePolice { id: string; numero: string; statut: string; date_premiere_effet: string; bureau: string; produit: string; souscripteur: string; echeance: string }

export function PagePolices() {
  const [params, setParams] = useSearchParams();
  const recherche = params.get('recherche') ?? '', statut = params.get('statut') ?? '';
  const [saisie, setSaisie] = useState(recherche);
  const liste = useDonnees<LignePolice[]>(`/polices?${new URLSearchParams(Object.entries({ recherche, statut }).filter(([, v]) => v))}`);
  const filtrer = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p); };
  return (
    <Page fil={['Production', 'Polices']} titre="Polices">
      <form className="filtres" onSubmit={e => { e.preventDefault(); filtrer('recherche', saisie.trim()); }}>
        <input style={{ minWidth: 320 }} value={saisie} onChange={e => setSaisie(e.target.value)} placeholder="N° de police, nom ou code du souscripteur" />
        <select value={statut} onChange={e => filtrer('statut', e.target.value)}><option value="">Tous les statuts</option>{Object.entries(STATUTS_POLICE).map(([c, [l]]) => <option key={c} value={c}>{l}</option>)}</select>
        <button className="bouton secondaire">Rechercher</button>
      </form>
      <Carte titre={`Polices (${liste.donnees?.length ?? 0})`}>
        {liste.chargement ? <Chargement /> : !liste.donnees?.length ? <div className="vide">Aucune police.</div> :
          <table className="tableau"><thead><tr><th>Police</th><th>Souscripteur</th><th>Produit</th><th>Bureau de gestion</th><th>Première effet</th><th>Échéance</th><th>Statut</th></tr></thead>
            <tbody>{liste.donnees.map(p => <tr key={p.id}><td className="code"><Link to={`/production/polices/${p.id}`}>{p.numero}</Link></td><td>{p.souscripteur}</td><td>{p.produit}</td>
              <td>{p.bureau}</td><td>{date(p.date_premiere_effet)}</td><td>{date(p.echeance)}</td><td><StatutPolice s={p.statut} /></td></tr>)}</tbody></table>}
      </Carte>
    </Page>
  );
}

// ---------------------------------------------------------------- PR-01 fiche police

interface Police {
  id: string; numero: string; statut: string; produit: string; formule: string; bureau: string; souscripteur: string; souscripteur_id: string; code_souscripteur: string;
  date_premiere_effet: string; canal: string; mode_emission: string; ne_pas_renouveler: boolean;
  assures: { id: string; qualite: string; rang_carte: number; date_entree: string; date_sortie: string | null; tiers_id: string; code_tiers: string; nom: string; date_naissance: string; garanties: { garantie: string; type: string; accordee: boolean; motif: string | null }[] | null }[];
  periodes: { rang: number; date_debut: string; date_fin: string; prime_nette: number; prime_totale: number; remise_en_vigueur: boolean }[];
  quittances: { id: string; numero: string; type: string; periode_debut: string; periode_fin: string; prime_nette: number; accessoires: number; taxes: number; prime_totale: number; mode_paiement: string; statut: string }[];
  intervenants: { qualite: string; cle_repartition: number; role: string; nom: string; commissions: number }[];
  documents: { id: string; type_document: string; horodatage_scellement: string; imprime: number }[];
  beneficiaires: { version: number; mode: string; clause_texte: string | null; date_effet: string; quotite: number | null; rang: number | null; acceptant: boolean | null; nom: string | null }[];
  preuveAcceptation: { niveau: string; horodatage: string; empreinte_document: string } | null;
  historique: { horodatage: string; action: string; valeur_apres: Record<string, unknown> | null; auteur: string }[];
}
type Onglet = 'synthese' | 'assures' | 'garanties' | 'quittances' | 'beneficiaires' | 'documents' | 'historique';

export function PageFichePolice() {
  const { id } = useParams();
  const { peut } = useSession();
  const aller = useNavigate();
  const p = useDonnees<Police>(`/polices/${id}`);
  const [onglet, setOnglet] = useState<Onglet>('synthese');
  const [annulation, setAnnulation] = useState(false);
  const [renouveler, setRenouveler] = useState(false);
  const { avis, Avis } = useAvis();
  if (p.erreur) return <Page titre="Police"><MessageErreur erreur={p.erreur} /></Page>;
  if (!p.donnees) return <Page titre="Police"><Chargement /></Page>;
  const d = p.donnees;
  const periode = d.periodes[d.periodes.length - 1];
  const quittance = d.quittances.find(q => q.periode_debut.slice(0, 10) === periode?.date_debut.slice(0, 10)) ?? d.quittances[0];
  const enVie = d.assures.filter(a => !a.date_sortie);
  return (
    <Page fil={['Production', <Link key="p" to="/production/polices">Polices</Link>, d.numero]} titre={`Police ${d.numero}`} actions={<>
      {['ACTIVE', 'ECHUE'].includes(d.statut) && peut('SOUSCRIPTION:CREER') && <button className="bouton" onClick={() => setRenouveler(true)}>Renouveler</button>}
      {d.statut === 'ACTIVE' && peut('ANNULATION_ERREUR:CREER') && <button className="bouton danger" onClick={() => setAnnulation(true)}>Annuler pour erreur</button>}
      {peut('RECLAMATIONS:CREER') && <button className="bouton secondaire" onClick={() => aller('/production/reclamations')}>Réclamation</button>}</>}>
      <div className="filtres"><StatutPolice s={d.statut} /><span className="doux">{d.produit} · {d.formule} · Bureau {d.bureau} · Souscripteur : <LienTiers id={d.souscripteur_id}>{d.souscripteur}</LienTiers> <span className="repere">1</span></span>
        {d.ne_pas_renouveler && <Statut couleur="orange">Non-renouvellement demandé</Statut>}</div>
      <Onglets<Onglet> actif={onglet} choisir={setOnglet} onglets={[{ code: 'synthese', libelle: 'Synthèse' }, { code: 'assures', libelle: `Assurés (${enVie.length})` }, { code: 'garanties', libelle: 'Garanties' },
        { code: 'quittances', libelle: 'Quittances' }, { code: 'beneficiaires', libelle: 'Bénéficiaires' }, { code: 'documents', libelle: 'Documents' }, { code: 'historique', libelle: 'Historique' }]} />
      {onglet === 'synthese' && <><div className="grille trois">
        <Carte titre="Période en cours" repere={2}>{periode && <dl className="details">
          <dt>Du</dt><dd>{date(periode.date_debut)}</dd><dt>Au</dt><dd>{date(periode.date_fin)}</dd><dt>Prime totale</dt><dd>{montant(periode.prime_totale)} GNF</dd>
          {quittance && <><dt>Quittance</dt><dd className="code">{quittance.numero} <Statut valeur={quittance.statut} /></dd><dt>Mode</dt><dd>{MODES[quittance.mode_paiement] ?? libelle(quittance.mode_paiement)}</dd></>}
          {periode.remise_en_vigueur && <><dt>Remise en vigueur</dt><dd>oui, sans rétroactivité</dd></>}</dl>}</Carte>
        <Carte titre="Intervenants" repere={3}><dl className="details">{d.intervenants.map(i => <Fragment key={i.nom}><dt>{Majuscule(libelle(i.qualite))}</dt>
          <dd>{i.nom} ({Math.round(Number(i.cle_repartition) * 100)} %) <span className="doux">· {montant(i.commissions)} GNF</span></dd></Fragment>)}</dl></Carte>
        <Carte titre="Indicateurs"><dl className="details"><dt>Assurés</dt><dd>{enVie.length}</dd><dt>Périodes</dt><dd>{d.periodes.length}</dd>
          <dt>Première effet</dt><dd>{date(d.date_premiere_effet)}</dd><dt>Acceptation</dt><dd>{d.preuveAcceptation ? `${libelle(d.preuveAcceptation.niveau)} · ${dateHeure(d.preuveAcceptation.horodatage)}` : '—'}</dd></dl></Carte>
      </div>
        <Historique h={d.historique.slice(0, 8)} /></>}
      {onglet === 'assures' && <Carte titre="Personnes assurées"><table className="tableau"><thead><tr><th>Rang</th><th>Nom</th><th>Qualité</th><th>Naissance</th><th>Entrée</th><th>Sortie</th></tr></thead>
        <tbody>{d.assures.map(a => <tr key={a.id}><td>{a.rang_carte}</td><td><LienTiers id={a.tiers_id}>{a.nom}</LienTiers> <span className="doux code">{a.code_tiers}</span></td><td>{QUALITES[a.qualite] ?? a.qualite}</td>
          <td>{date(a.date_naissance)}</td><td>{date(a.date_entree)}</td><td>{date(a.date_sortie)}</td></tr>)}</tbody></table></Carte>}
      {onglet === 'garanties' && <Carte titre="Garanties souscrites"><table className="tableau"><thead><tr><th>Assuré</th><th>Garantie</th><th>Accordée</th></tr></thead>
        <tbody>{d.assures.flatMap(a => (a.garanties ?? []).map(g => <tr key={`${a.id}${g.garantie}`}><td>{a.nom}</td><td>{g.garantie}</td>
          <td>{g.accordee ? <Statut couleur="vert">Oui</Statut> : <><Statut couleur="rouge">Refusée</Statut> <span className="doux">{g.motif}</span></>}</td></tr>))}</tbody></table></Carte>}
      {onglet === 'quittances' && <Carte titre="Quittances"><table className="tableau"><thead><tr><th>N°</th><th>Type</th><th>Période</th><th className="nombre">Prime nette</th><th className="nombre">Accessoires</th><th className="nombre">Taxes</th><th className="nombre">Total</th><th>Mode</th><th>Statut</th></tr></thead>
        <tbody>{d.quittances.map(q => <tr key={q.id}><td className="code">{q.numero}</td><td>{libelle(q.type)}</td><td>{date(q.periode_debut)} – {date(q.periode_fin)}</td><td className="nombre">{montant(q.prime_nette)}</td>
          <td className="nombre">{montant(q.accessoires)}</td><td className="nombre">{montant(q.taxes)}</td><td className="nombre">{montant(q.prime_totale)}</td><td>{MODES[q.mode_paiement] ?? libelle(q.mode_paiement)}</td><td><Statut valeur={q.statut} /></td></tr>)}</tbody></table></Carte>}
      {onglet === 'beneficiaires' && <Carte titre="Bénéficiaires du capital décès (versions)">{!d.beneficiaires.length ? <div className="vide">Aucune désignation.</div> :
        <table className="tableau"><thead><tr><th>Version</th><th>Effet</th><th>Mode</th><th>Bénéficiaire</th><th>Rang</th><th className="nombre">Quotité</th><th>Acceptant</th></tr></thead>
          <tbody>{d.beneficiaires.map((b, i) => <tr key={i}><td>{b.version}</td><td>{date(b.date_effet)}</td><td>{libelle(b.mode)}</td><td>{b.nom ?? b.clause_texte ?? '—'}</td><td>{b.rang ?? '—'}</td>
            <td className="nombre">{b.quotite !== null ? `${b.quotite} %` : '—'}</td><td>{b.acceptant ? <Statut couleur="violet">Acceptant</Statut> : '—'}</td></tr>)}</tbody></table>}</Carte>}
      {onglet === 'documents' && <Carte titre="Documents"><table className="tableau"><thead><tr><th>Document</th><th>Produit le</th><th>Copies imprimées</th><th /></tr></thead>
        <tbody>{d.documents.map(x => <tr key={x.id}><td>{libelle(x.type_document)}</td><td>{dateHeure(x.horodatage_scellement)}</td><td>{x.imprime}</td>
          <td><button className="lien" onClick={() => void ouvrirFichier('GET', `/documents/${x.id}/fichier`)}>Ouvrir</button></td></tr>)}</tbody></table></Carte>}
      {onglet === 'historique' && <Historique h={d.historique} />}
      {annulation && <AnnulationErreur id={d.id} fermer={() => setAnnulation(false)} apres={() => { setAnnulation(false); avis('Annulation soumise à la Direction commerciale puis à la DAF.'); }} />}
      {renouveler && <Renouvellement id={d.id} numero={d.numero} fermer={() => setRenouveler(false)} apres={m => { setRenouveler(false); avis(m); void p.recharger(); }} />}
      <Avis />
    </Page>
  );
}

const Historique = ({ h }: { h: Police['historique'] }) => (
  <Carte titre={<>Historique <span className="repere">4</span></>}>
    {!h.length ? <div className="vide">Aucun événement.</div> :
      <table className="tableau"><thead><tr><th>Date</th><th>Événement</th><th>Auteur</th></tr></thead>
        <tbody>{h.map((x, i) => <tr key={i}><td>{dateHeure(x.horodatage)}</td><td>{ACTIONS[x.action] ?? libelle(x.action)}{x.valeur_apres && typeof x.valeur_apres === 'object' && 'statut' in x.valeur_apres ? ` · ${libelle(String(x.valeur_apres.statut))}` : ''}</td><td>{x.auteur}</td></tr>)}</tbody></table>}
  </Carte>
);

function AnnulationErreur({ id, fermer, apres }: { id: string; fermer: () => void; apres: () => void }) {
  const [motif, setMotif] = useState('');
  const action = useAction();
  return (
    <Modale titre="Annulation pour erreur" fermer={fermer}>
      <Message type="attention">L'annulation extourne la prime (EVT-04), recrédite le compte de production et reprend les commissions. Elle est validée par la Direction commerciale puis la DAF.</Message>
      <Champ libelle="Motif" large><textarea value={motif} onChange={e => setMotif(e.target.value)} /></Champ>
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton danger" disabled={!motif.trim() || action.enCours} onClick={() => void action.executer(() => api('POST', `/polices/${id}/annulation-erreur`, { motif })).then(x => x && apres())}>Soumettre l'annulation</button></div>
    </Modale>
  );
}

function Renouvellement({ id, numero, fermer, apres }: { id: string; numero: string; fermer: () => void; apres: (m: string) => void }) {
  const r = useDonnees<{ echeance: string; dateDebut: string; tarif: { primeNette: number; accessoires: number; primeTotale: number; taxes: { libelle: string; montant: number }[] }; versements: number; statut: string; nePasRenouveler: boolean }>(`/polices/${id}/renouvellement`);
  const banques = useDonnees<{ code: string; nom: string }[]>('/banques-operateurs');
  const [type, setType] = useState<'COMPTE_PRODUCTION' | 'PAIEMENT_DIRECT' | 'VERSEMENTS'>('COMPTE_PRODUCTION');
  const [moyen, setMoyen] = useState<'ESPECES_SIEGE' | 'BANQUE' | 'MONNAIE_ELECTRONIQUE'>('BANQUE');
  const [banque, setBanque] = useState('');
  const [reference, setReference] = useState('');
  const [motifNon, setMotifNon] = useState('');
  const action = useAction();
  if (!r.donnees) return <Modale titre={`Renouveler ${numero}`} fermer={fermer}>{r.erreur ? <MessageErreur erreur={r.erreur} /> : <Chargement />}</Modale>;
  const x = r.donnees;
  const corps = type === 'PAIEMENT_DIRECT' ? { type, moyen, banque: moyen === 'ESPECES_SIEGE' ? undefined : banque, reference: reference || undefined } : { type };
  return (
    <Modale titre={`Renouveler ${numero}`} large fermer={fermer}>
      <dl className="details"><dt>Échéance</dt><dd>{date(x.echeance)}</dd><dt>Nouvelle période à partir du</dt><dd>{date(x.dateDebut)}</dd>
        <dt>Prime nette</dt><dd>{montant(x.tarif.primeNette)}</dd><dt>Accessoires</dt><dd>{montant(x.tarif.accessoires)}</dd>
        {x.tarif.taxes.map(t => <Fragment key={t.libelle}><dt>{t.libelle}</dt><dd>{montant(t.montant)}</dd></Fragment>)}
        <dt>Prime totale</dt><dd><b>{montant(x.tarif.primeTotale)} GNF</b></dd><dt>Versements programmés</dt><dd>{montant(x.versements)} GNF</dd></dl>
      <div className="formulaire">
        <Champ libelle="Paiement"><select value={type} onChange={e => setType(e.target.value as typeof type)}>
          <option value="COMPTE_PRODUCTION">Débit du compte de production du bureau</option><option value="PAIEMENT_DIRECT">Paiement direct du client</option>
          <option value="VERSEMENTS" disabled={x.versements < x.tarif.primeTotale}>Affectation des versements programmés</option></select></Champ>
        {type === 'PAIEMENT_DIRECT' && <>
          <Champ libelle="Moyen"><select value={moyen} onChange={e => setMoyen(e.target.value as typeof moyen)}><option value="BANQUE">Banque</option><option value="MONNAIE_ELECTRONIQUE">Monnaie électronique</option><option value="ESPECES_SIEGE">Espèces au siège</option></select></Champ>
          {moyen !== 'ESPECES_SIEGE' && <Champ libelle="Banque ou opérateur"><select value={banque} onChange={e => setBanque(e.target.value)}><option value="">Choisir…</option>{banques.donnees?.map(b => <option key={b.code} value={b.code}>{b.nom}</option>)}</select></Champ>}
          <Champ libelle="Référence du paiement"><input value={reference} onChange={e => setReference(e.target.value)} /></Champ></>}
      </div>
      <MessageErreur erreur={action.erreur} />
      <div className="boutons">
        <button className="bouton" disabled={action.enCours || (type === 'PAIEMENT_DIRECT' && moyen !== 'ESPECES_SIEGE' && !banque)}
          onClick={() => void action.executer(() => api('POST', `/polices/${id}/renouvellement`, corps)).then(y => y && apres('Police renouvelée : nouvelle quittance émise.'))}>Renouveler</button>
      </div>
      {x.statut === 'ACTIVE' && !x.nePasRenouveler && <>
        <h3>Non-renouvellement</h3>
        <div className="filtres"><input style={{ minWidth: 320 }} value={motifNon} onChange={e => setMotifNon(e.target.value)} placeholder="Motif de la demande du client" />
          <button className="bouton secondaire" disabled={!motifNon.trim()} onClick={() => void action.executer(() => api('POST', `/polices/${id}/non-renouvellement`, { motif: motifNon })).then(y => y !== undefined && apres('Non-renouvellement enregistré : les rappels cessent.'))}>Enregistrer</button></div>
      </>}
    </Modale>
  );
}

// ---------------------------------------------------------------- PR-03 polices à renouveler

interface ARenouveler { id: string; numero: string; statut: string; ne_pas_renouveler: boolean; bureau: string; souscripteur: string; echeance: string; versements: number; derniere_prime: number; rappels: number }

export function PageRenouvellements() {
  const [jours, setJours] = useState(30);
  const [statut, setStatut] = useState('');
  const liste = useDonnees<ARenouveler[]>(`/polices-a-renouveler?jours=${jours}`);
  const expirees = useDonnees<LignePolice[]>('/polices?statut=EXPIREE');
  const l = (liste.donnees ?? []).filter(p => !statut || p.statut === statut);
  const tous = liste.donnees ?? [];
  const mois = new Date().toISOString().slice(0, 7);
  const auj = new Date().toISOString().slice(0, 10);
  const jPlus = (e: string) => Math.round((Date.parse(auj) - Date.parse(e.slice(0, 10))) / 86_400_000);
  return (
    <Page fil={['Production', 'Renouvellements']} titre="Polices à renouveler">
      <div className="grille quatre" style={{ marginBottom: 18 }}>
        <Indicateur libelle={`Échéances à ${jours} jours`} valeur={tous.filter(p => p.statut === 'ACTIVE').length} />
        <Indicateur libelle="Payées d'avance" valeur={tous.filter(p => Number(p.versements) > 0).length} couleur="vert" detail="versements programmés reçus" />
        <Indicateur libelle="Échues (remise en vigueur)" valeur={tous.filter(p => p.statut === 'ECHUE').length} couleur="orange" detail="J+1 à J+30" />
        <Indicateur libelle="Expirées ce mois" valeur={(expirees.donnees ?? []).filter(p => p.echeance?.slice(0, 7) === mois).length} couleur="rouge" />
      </div>
      <div className="filtres"><span className="repere">1</span>
        <select value={jours} onChange={e => setJours(Number(e.target.value))}>{[15, 30, 45, 60, 90].map(j => <option key={j} value={j}>Échéance : {j} jours</option>)}</select>
        <select value={statut} onChange={e => setStatut(e.target.value)}><option value="">Statut : tous</option><option value="ACTIVE">Active</option><option value="ECHUE">Échue</option></select></div>
      <Carte titre="Résultats" repere={2}>
        {liste.chargement ? <Chargement /> : !l.length ? <div className="vide">Aucune police à renouveler.</div> :
          <table className="tableau"><thead><tr><th>Police</th><th>Souscripteur</th><th>Bureau</th><th>Échéance</th><th className="nombre">Dernière prime</th><th className="nombre">Versements</th><th>Rappels</th><th>Statut</th></tr></thead>
            <tbody>{l.map(p => <tr key={p.id}><td className="code"><Link to={`/production/polices/${p.id}`}>{p.numero}</Link></td><td>{p.souscripteur}</td><td>{p.bureau}</td><td>{date(p.echeance)}</td>
              <td className="nombre">{montant(p.derniere_prime)}</td><td className="nombre">{Number(p.versements) ? `${montant(p.versements)} (${Math.round(100 * Number(p.versements) / Number(p.derniere_prime))} %)` : '0'}</td>
              <td>{p.rappels ? `${p.rappels} envoyé(s)` : '—'}</td>
              <td><StatutPolice s={p.statut} />{p.statut === 'ECHUE' && ` J+${jPlus(p.echeance)}`}{p.ne_pas_renouveler && <Statut couleur="gris">Non-renouvellement</Statut>}</td></tr>)}</tbody></table>}
      </Carte>
      <Message>Une police échue peut être renouvelée jusqu'au 30e jour : même numéro, nouvelle période à la date du paiement, sans nouvelle carence. Au-delà, elle expire <span className="repere">3</span>. Rappels automatiques à J-30, J-15, J-7 et J-1.</Message>
    </Page>
  );
}
