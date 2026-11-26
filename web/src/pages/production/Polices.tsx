/** Polices : recherche, PR-01 fiche police (PROD-RG-005, 007 ; NUM-RG-006), PR-03 polices à renouveler (PROD-RG-020 à 027). */
import { Fragment, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, date, dateHeure, montant, ouvrirFichier } from '../../noyau/api';
import { Carte, Champ, ChoixTiers, Chargement, Indicateur, LienTiers, Message, MessageErreur, Modale, Onglets, Page, Statut, useAvis } from '../../noyau/composants';
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
type Onglet = 'synthese' | 'assures' | 'garanties' | 'quittances' | 'avenants' | 'beneficiaires' | 'documents' | 'historique';

export function PageFichePolice() {
  const { id } = useParams();
  const { peut } = useSession();
  const aller = useNavigate();
  const p = useDonnees<Police>(`/polices/${id}`);
  const [onglet, setOnglet] = useState<Onglet>('synthese');
  const [annulation, setAnnulation] = useState(false);
  const [renouveler, setRenouveler] = useState(false);
  const [modifier, setModifier] = useState(false);
  const av = useDonnees<VieContrat>(`/polices/${id}/avenants`);
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
      {['ACTIVE', 'ECHUE', 'SUSPENDUE'].includes(d.statut) && peut('AVENANT:CREER') && <button className="bouton secondaire" onClick={() => setModifier(true)}>Avenant…</button>}
      {d.statut === 'ACTIVE' && peut('ANNULATION_ERREUR:CREER') && <button className="bouton danger" onClick={() => setAnnulation(true)}>Annuler pour erreur</button>}
      {peut('RECLAMATIONS:CREER') && <button className="bouton secondaire" onClick={() => aller('/production/reclamations')}>Réclamation</button>}</>}>
      <div className="filtres"><StatutPolice s={d.statut} /><span className="doux">{d.produit} · {d.formule} · Bureau {d.bureau} · Souscripteur : <LienTiers id={d.souscripteur_id}>{d.souscripteur}</LienTiers> <span className="repere">1</span></span>
        {d.ne_pas_renouveler && <Statut couleur="orange">Non-renouvellement demandé</Statut>}</div>
      <Onglets<Onglet> actif={onglet} choisir={setOnglet} onglets={[{ code: 'synthese', libelle: 'Synthèse' }, { code: 'assures', libelle: `Assurés (${enVie.length})` }, { code: 'garanties', libelle: 'Garanties' },
        { code: 'quittances', libelle: 'Quittances' }, { code: 'avenants', libelle: `Avenants (${av.donnees?.avenants.length ?? 0})` }, { code: 'beneficiaires', libelle: 'Bénéficiaires' }, { code: 'documents', libelle: 'Documents' }, { code: 'historique', libelle: 'Historique' }]} />
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
      {onglet === 'avenants' && <Avenants v={av.donnees} peutRegler={peut('AVENANT:CREER')} apres={m => { avis(m); void p.recharger(); void av.recharger(); }} />}
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
      {modifier && <ModificationContrat police={d} vie={av.donnees} fermer={() => setModifier(false)}
        apres={m => { setModifier(false); avis(m); void p.recharger(); void av.recharger(); }} />}
      <Avis />
    </Page>
  );
}

// ---------------------------------------------------------------- avenants (PROD-RG-041, 044 à 046, 060 à 062, 074)

interface VieContrat {
  avenants: { id: string; numero: string; type: string; date_effet: string; description: string; difference_prime: number; quittance: string | null; confirme: boolean; a_regler: boolean }[];
  renonciation: { delai: number; limite: string } | null;
}
const TYPES_AVENANT: Record<string, string> = {
  AJOUT_AYANT_DROIT: 'Ajout d\'un ayant droit', RETRAIT_AYANT_DROIT: 'Retrait d\'un ayant droit', BENEFICIAIRES: 'Bénéficiaires', COORDONNEES: 'Coordonnées', CORRECTION: 'Correction',
  CHANGEMENT_SOUSCRIPTEUR: 'Changement de souscripteur', ANNULATION: 'Renonciation', RESILIATION: 'Résiliation',
};

function Avenants({ v, peutRegler, apres }: { v: VieContrat | null; peutRegler: boolean; apres: (m: string) => void }) {
  const [regler, setRegler] = useState<VieContrat['avenants'][number] | null>(null);
  if (!v) return <Carte titre="Avenants"><Chargement /></Carte>;
  return (
    <Carte titre="Avenants">
      {!v.avenants.length ? <div className="vide">Aucun avenant.</div> :
        <table className="tableau"><thead><tr><th>N°</th><th>Type</th><th>Effet</th><th>Objet</th><th className="nombre">Incidence sur la prime</th><th>Quittance</th><th /></tr></thead>
          <tbody>{v.avenants.map(a => <tr key={a.id}><td className="code">{a.numero}</td><td>{TYPES_AVENANT[a.type] ?? libelle(a.type)}</td><td>{date(a.date_effet)}</td>
            <td>{a.type === 'CHANGEMENT_SOUSCRIPTEUR' || a.type === 'BENEFICIAIRES' ? (a.confirme ? 'Accepté par code' : <Statut couleur="orange">En attente du code</Statut>) : a.description}</td>
            <td className="nombre">{Number(a.difference_prime) === 0 ? '—' : <span style={{ color: Number(a.difference_prime) < 0 ? 'var(--vert)' : undefined }}>{Number(a.difference_prime) > 0 ? '+' : '−'}{montant(Math.abs(Number(a.difference_prime)))}</span>}</td>
            <td className="code">{a.quittance ?? '—'}{a.a_regler && <> <Statut couleur="orange">À régler</Statut></>}</td>
            <td>{a.a_regler && peutRegler && <button className="lien" onClick={() => setRegler(a)}>Régler</button>}</td></tr>)}</tbody></table>}
      {regler && <ReglementAvenant a={regler} fermer={() => setRegler(null)} apres={m => { setRegler(null); apres(m); }} />}
    </Carte>
  );
}

/** Mode de paiement d'une prime d'avenant : compte de production du bureau, ou paiement direct du client. */
function ChoixPaiement({ valeur, choisir }: { valeur: Record<string, string>; choisir: (v: Record<string, string>) => void }) {
  const banques = useDonnees<{ code: string; nom: string }[]>('/banques-operateurs');
  return (<>
    <Champ libelle="Paiement"><select value={valeur.type} onChange={e => choisir({ ...valeur, type: e.target.value })}>
      <option value="COMPTE_PRODUCTION">Débit du compte de production du bureau</option><option value="PAIEMENT_DIRECT">Paiement direct du client</option></select></Champ>
    {valeur.type === 'PAIEMENT_DIRECT' && <>
      <Champ libelle="Moyen"><select value={valeur.moyen ?? 'BANQUE'} onChange={e => choisir({ ...valeur, moyen: e.target.value })}><option value="BANQUE">Banque</option><option value="MONNAIE_ELECTRONIQUE">Monnaie électronique</option><option value="ESPECES_SIEGE">Espèces au siège</option></select></Champ>
      {(valeur.moyen ?? 'BANQUE') !== 'ESPECES_SIEGE' && <Champ libelle="Banque ou opérateur"><select value={valeur.banque ?? ''} onChange={e => choisir({ ...valeur, banque: e.target.value })}><option value="">Choisir…</option>{banques.donnees?.map(b => <option key={b.code} value={b.code}>{b.nom}</option>)}</select></Champ>}
    </>}
  </>);
}
const corpsPaiement = (v: Record<string, string>) => v.type === 'PAIEMENT_DIRECT' ? { type: v.type, moyen: v.moyen ?? 'BANQUE', banque: (v.moyen ?? 'BANQUE') === 'ESPECES_SIEGE' ? undefined : v.banque } : { type: v.type };

function ReglementAvenant({ a, fermer, apres }: { a: VieContrat['avenants'][number]; fermer: () => void; apres: (m: string) => void }) {
  const [paiement, setPaiement] = useState<Record<string, string>>({ type: 'COMPTE_PRODUCTION' });
  const action = useAction();
  return (
    <Modale titre={`Régler l'avenant ${a.numero}`} fermer={fermer}>
      <p>{a.description}</p>
      <dl className="details"><dt>Prime supplémentaire</dt><dd><b>{montant(a.difference_prime)} GNF</b></dd></dl>
      <div className="formulaire"><ChoixPaiement valeur={paiement} choisir={setPaiement} /></div>
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton" disabled={action.enCours || (paiement.type === 'PAIEMENT_DIRECT' && (paiement.moyen ?? 'BANQUE') !== 'ESPECES_SIEGE' && !paiement.banque)}
        onClick={() => void action.executer(() => api<{ quittance: string }>('POST', `/avenants/${a.id}/reglement`, corpsPaiement(paiement))).then(r => r && apres(`Avenant réglé : quittance ${r.quittance}.`))}>Encaisser</button></div>
    </Modale>
  );
}

type TypeModification = 'CORRECTION' | 'RETRAIT' | 'SOUSCRIPTEUR' | 'RESILIATION' | 'RENONCIATION';

function ModificationContrat({ police, vie, fermer, apres }: { police: Police; vie: VieContrat | null; fermer: () => void; apres: (m: string) => void }) {
  const renonciation = vie?.renonciation && police.statut === 'ACTIVE' && new Date().toISOString().slice(0, 10) <= vie.renonciation.limite;
  const choix: { code: TypeModification; libelle: string; aide: string; visible: boolean }[] = [
    { code: 'CORRECTION', libelle: 'Correction d\'une donnée', aide: 'Date de naissance ou qualité erronée : prime recalculée, différence au prorata (validation)', visible: police.statut === 'ACTIVE' },
    { code: 'RETRAIT', libelle: 'Retrait d\'un ayant droit', aide: 'À l\'échéance sans ristourne, ou au décès (validation)', visible: police.statut === 'ACTIVE' },
    { code: 'SOUSCRIPTEUR', libelle: 'Changement de souscripteur', aide: 'Décès du souscripteur ou accord des parties ; acceptation par code du nouveau souscripteur', visible: ['ACTIVE', 'ECHUE'].includes(police.statut) },
    { code: 'RESILIATION', libelle: 'Résiliation par la Compagnie', aide: 'Fraude avérée ou usurpation d\'identité ; décision validée (gestion puis DAF)', visible: ['ACTIVE', 'SUSPENDUE'].includes(police.statut) },
    { code: 'RENONCIATION', libelle: 'Renonciation du client', aide: vie?.renonciation ? `Souscription en ligne : jusqu'au ${date(vie.renonciation.limite)} (${vie.renonciation.delai} jours)` : '', visible: !!renonciation },
  ];
  const [type, setType] = useState<TypeModification | null>(null);
  return (
    <Modale titre={`Avenant – police ${police.numero}`} large fermer={fermer}>
      {!type ? <div className="avenant-choix">{choix.filter(c => c.visible).map(c => <button key={c.code} onClick={() => setType(c.code)}><b>{c.libelle}</b><small>{c.aide}</small></button>)}</div> : <>
        <button className="lien" onClick={() => setType(null)}>‹ Autre avenant</button>
        {type === 'CORRECTION' && <FormCorrection police={police} apres={apres} />}
        {type === 'RETRAIT' && <FormRetrait police={police} apres={apres} />}
        {type === 'SOUSCRIPTEUR' && <FormSouscripteur police={police} apres={apres} />}
        {type === 'RESILIATION' && <FormResiliation police={police} apres={apres} />}
        {type === 'RENONCIATION' && <FormRenonciation police={police} apres={apres} />}
      </>}
    </Modale>
  );
}

const ayantsDroit = (p: Police) => p.assures.filter(a => !a.date_sortie || a.date_sortie.slice(0, 10) > new Date().toISOString().slice(0, 10));

function FormCorrection({ police, apres }: { police: Police; apres: (m: string) => void }) {
  const [assure, setAssure] = useState(ayantsDroit(police)[0]?.id ?? '');
  const a = police.assures.find(x => x.id === assure);
  const [naissance, setNaissance] = useState('');
  const [qualite, setQualite] = useState('');
  const [effet, setEffet] = useState('');
  const [motif, setMotif] = useState('');
  const action = useAction();
  const [resultat, setResultat] = useState<{ primeAvant: number; primeApres: number; sens: number; nette: number; totale: number; joursRestants: number } | null>(null);
  if (resultat) return (<>
    <Message type="succes">Correction soumise à validation. Prime annuelle {montant(resultat.primeAvant)} → {montant(resultat.primeApres)} GNF.
      {resultat.sens > 0 ? ` Prime supplémentaire de ${montant(resultat.totale)} GNF (${resultat.joursRestants} jours), à régler après la validation.` : resultat.sens < 0 ? ` Ristourne de ${montant(resultat.totale)} GNF (${resultat.joursRestants} jours) après la validation.` : ' Sans incidence sur la prime.'}</Message>
    <div className="boutons"><button className="bouton" onClick={() => apres('Avenant de correction soumis à validation.')}>Fermer</button></div></>);
  return (<>
    <Message>Le numéro de police et les délais de carence déjà courus sont conservés. La prime est recalculée au tarif de la période ; la différence court de la date d'effet à l'échéance.</Message>
    <div className="formulaire">
      <Champ libelle="Assuré"><select value={assure} onChange={e => { setAssure(e.target.value); setQualite(''); setNaissance(''); }}>{ayantsDroit(police).map(x => <option key={x.id} value={x.id}>{x.nom} ({QUALITES[x.qualite] ?? x.qualite})</option>)}</select></Champ>
      <Champ libelle="Date de naissance corrigée" aide={a ? `Actuelle : ${date(a.date_naissance)}` : undefined}><input type="date" value={naissance} onChange={e => setNaissance(e.target.value)} /></Champ>
      {a && a.qualite !== 'ASSURE_PRINCIPAL' && <Champ libelle="Qualité corrigée"><select value={qualite} onChange={e => setQualite(e.target.value)}><option value="">Inchangée</option><option value="CONJOINT">Conjoint</option><option value="ENFANT">Enfant</option></select></Champ>}
      <Champ libelle="Date d'effet" aide="Par défaut : aujourd'hui"><input type="date" value={effet} onChange={e => setEffet(e.target.value)} /></Champ>
      <Champ libelle="Motif et pièce produite" large><textarea value={motif} onChange={e => setMotif(e.target.value)} placeholder="Ex. acte de naissance produit par le souscripteur" /></Champ>
    </div>
    <MessageErreur erreur={action.erreur} />
    <div className="boutons"><button className="bouton" disabled={action.enCours || !motif.trim() || (!naissance && !qualite)}
      onClick={() => void action.executer(() => api<typeof resultat>('POST', `/polices/${police.id}/avenants/correction`, { policeAssureId: assure, dateNaissance: naissance || undefined, qualite: qualite || undefined, dateEffet: effet || undefined, motif })).then(r => r && setResultat(r))}>Calculer et soumettre</button></div>
  </>);
}

function FormRetrait({ police, apres }: { police: Police; apres: (m: string) => void }) {
  const liste = ayantsDroit(police).filter(a => a.qualite !== 'ASSURE_PRINCIPAL');
  const [assure, setAssure] = useState(liste[0]?.id ?? '');
  const [motif, setMotif] = useState<'DEMANDE' | 'DECES'>('DEMANDE');
  const [deces, setDeces] = useState('');
  const action = useAction();
  if (!liste.length) return <Message>Aucun ayant droit à retirer : seul l'assuré principal est couvert.</Message>;
  return (<>
    <div className="formulaire">
      <Champ libelle="Ayant droit"><select value={assure} onChange={e => setAssure(e.target.value)}>{liste.map(x => <option key={x.id} value={x.id}>{x.nom} ({QUALITES[x.qualite] ?? x.qualite})</option>)}</select></Champ>
      <Champ libelle="Motif"><select value={motif} onChange={e => setMotif(e.target.value as typeof motif)}><option value="DEMANDE">Demande du souscripteur</option><option value="DECES">Décès</option></select></Champ>
      {motif === 'DECES' && <Champ libelle="Date du décès"><input type="date" value={deces} onChange={e => setDeces(e.target.value)} /></Champ>}
    </div>
    <Message type="attention">{motif === 'DEMANDE' ? 'Sortie à l\'échéance, sans ristourne : l\'ayant droit reste couvert jusque-là et n\'est pas repris au renouvellement.'
      : 'Sortie à la date du décès ; ristourne au prorata si le produit le prévoit, après validation par la gestion production.'}</Message>
    <MessageErreur erreur={action.erreur} />
    <div className="boutons"><button className="bouton" disabled={action.enCours || (motif === 'DECES' && !deces)}
      onClick={() => void action.executer(() => api<{ dateSortie: string; ristourne: number; demandeValidation?: string }>('POST', `/polices/${police.id}/avenants/retrait`, { policeAssureId: assure, motif, dateDeces: deces || undefined }))
        .then(r => r && apres(r.demandeValidation ? `Retrait soumis à validation (ristourne prévue : ${montant(r.ristourne)} GNF).` : `Retrait enregistré : sortie le ${date(r.dateSortie)}.`))}>Enregistrer le retrait</button></div>
  </>);
}

function FormSouscripteur({ police, apres }: { police: Police; apres: (m: string) => void }) {
  const [nouveau, setNouveau] = useState<{ id: string; nom: string } | null>(null);
  const [motif, setMotif] = useState<'DECES_SOUSCRIPTEUR' | 'ACCORD_PARTIES'>('ACCORD_PARTIES');
  const [envoi, setEnvoi] = useState<{ avenantId: string; numero: string; documentId: string } | null>(null);
  const [code, setCode] = useState('');
  const action = useAction();
  if (envoi) return (<>
    <Message>Avenant {envoi.numero} présenté à {nouveau?.nom}. Un code lui a été envoyé par SMS : il le saisit après avoir lu l'avenant, qui reprend la désignation des bénéficiaires qu'il confirme.</Message>
    <div className="filtres"><button className="lien" onClick={() => void ouvrirFichier('GET', `/documents/${envoi.documentId}/fichier`)}>Ouvrir l'avenant</button>
      <input inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="Code à 6 chiffres" />
      <button className="bouton" disabled={code.length !== 6 || action.enCours} onClick={() => void action.executer(() => api('POST', `/avenants/${envoi.avenantId}/acceptation-souscripteur`, { code })).then(r => r && apres(`Changement de souscripteur accepté : ${nouveau?.nom} reprend la police.`))}>Confirmer</button></div>
    <MessageErreur erreur={action.erreur} /></>);
  return (<>
    <div className="formulaire">
      <Champ libelle="Ancien souscripteur"><input value={police.souscripteur} disabled /></Champ>
      <Champ libelle="Motif"><select value={motif} onChange={e => setMotif(e.target.value as typeof motif)}><option value="ACCORD_PARTIES">Accord des parties</option><option value="DECES_SOUSCRIPTEUR">Décès du souscripteur</option></select></Champ>
      <Champ libelle="Nouveau souscripteur" large aide="Personne majeure, téléphone vérifié"><ChoixTiers valeur={nouveau} choisir={setNouveau} /></Champ>
    </div>
    <MessageErreur erreur={action.erreur} />
    <div className="boutons"><button className="bouton" disabled={!nouveau || action.enCours}
      onClick={() => void action.executer(() => api<{ avenantId: string; numero: string; documentId: string }>('POST', `/polices/${police.id}/avenants/souscripteur`, { nouveauTiersId: nouveau!.id, motif })).then(r => r && setEnvoi(r))}>Préparer l'avenant et envoyer le code</button></div>
  </>);
}

function FormResiliation({ police, apres }: { police: Police; apres: (m: string) => void }) {
  const [motif, setMotif] = useState<'FRAUDE' | 'USURPATION_IDENTITE'>('FRAUDE');
  const [justification, setJustification] = useState('');
  const action = useAction();
  return (<>
    <Message type="attention">La Compagnie ne résilie en cours de période que pour fraude avérée ou usurpation d'identité : aucune déclaration du risque n'étant recueillie, la fausse déclaration ne peut être invoquée.
      À la demande du client, utiliser le non-renouvellement. La décision est validée par la gestion production puis la DAF ; les cartes sont bloquées et le souscripteur et l'agent prévenus.</Message>
    <div className="formulaire">
      <Champ libelle="Motif"><select value={motif} onChange={e => setMotif(e.target.value as typeof motif)}><option value="FRAUDE">Fraude avérée</option><option value="USURPATION_IDENTITE">Usurpation d'identité</option></select></Champ>
      <Champ libelle="Justification de la décision" large><textarea value={justification} onChange={e => setJustification(e.target.value)} /></Champ>
    </div>
    <MessageErreur erreur={action.erreur} />
    <div className="boutons"><button className="bouton danger" disabled={!justification.trim() || action.enCours}
      onClick={() => void action.executer(() => api<{ ristourneEstimee: number }>('POST', `/polices/${police.id}/resiliation`, { motif, justification }))
        .then(r => r && apres(`Résiliation soumise à validation${r.ristourneEstimee ? ` (ristourne estimée : ${montant(r.ristourneEstimee)} GNF)` : ', sans ristourne'}.`))}>Soumettre la résiliation</button></div>
  </>);
}

function FormRenonciation({ police, apres }: { police: Police; apres: (m: string) => void }) {
  const [demande, setDemande] = useState(new Date().toISOString().slice(0, 10));
  const action = useAction();
  return (<>
    <Message type="attention">Dans le délai et en l'absence de prestation, la police est annulée depuis l'origine et la prime remboursée intégralement : au compte de production si elle en a été débitée, sinon au client par la chaîne de paiement (coordonnées vérifiées requises).</Message>
    <div className="formulaire"><Champ libelle="Date de réception de la demande"><input type="date" value={demande} onChange={e => setDemande(e.target.value)} /></Champ></div>
    <MessageErreur erreur={action.erreur} />
    <div className="boutons"><button className="bouton danger" disabled={action.enCours}
      onClick={() => void action.executer(() => api<{ rembourse: number; ordrePaiement: string | null }>('POST', `/polices/${police.id}/renonciation`, { dateDemande: demande }))
        .then(r => r && apres(`Police annulée : ${montant(r.rembourse)} GNF remboursés${r.ordrePaiement ? ` (ordre de paiement ${r.ordrePaiement})` : ' au compte de production'}.`))}>Enregistrer la renonciation</button></div>
  </>);
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
