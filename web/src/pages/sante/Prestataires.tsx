/** Santé (lot 3, sous-lot 3.1) : prestataires agréés, professionnels de santé, nomenclatures (SAN-RG-001 à 010, 060 ; § 5.6). */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, date, dateHeure, montant, ouvrirFichier } from '../../noyau/api';
import { Carte, Champ, ChoixTiers, Chargement, DepotPiece, Indicateur, Message, MessageErreur, Modale, Onglets, Page, Statut, useAvis } from '../../noyau/composants';
import { useAction, useDonnees } from '../../noyau/donnees';
import { useSession } from '../../noyau/session';

export const STATUTS_PRESTATAIRE: Record<string, [string, string]> = { EN_AGREMENT: ['En agrément', 'orange'], AGREE: ['Agréé', 'vert'], SUSPENDU: ['Suspendu', 'rouge'], FIN_CONVENTION: ['Fin de convention', 'gris'] };
export const PROFESSIONS: Record<string, string> = {
  MEDECIN: 'Médecin', CHIRURGIEN_DENTISTE: 'Chirurgien-dentiste', SAGE_FEMME: 'Sage-femme', BIOLOGISTE: 'Biologiste', RADIOLOGUE: 'Radiologue', PHARMACIEN: 'Pharmacien',
  OPTICIEN: 'Opticien', KINESITHERAPEUTE: 'Kinésithérapeute', AUTRE: 'Autre professionnel',
};
const OPTIONS: Record<string, string> = { GARDE: 'Service de garde', H24: 'Ouvert 24 h sur 24', URGENCES: 'Urgences', TELECONSULTATION: 'Téléconsultation', HOSPITALISATION: 'Hospitalisation' };
const StatutP = ({ s }: { s: string }) => <Statut couleur={STATUTS_PRESTATAIRE[s]?.[1]}>{STATUTS_PRESTATAIRE[s]?.[0] ?? s}</Statut>;
interface Type { code: string; libelle: string; professions: string[]; options: string[] }

// ---------------------------------------------------------------- liste

interface LignePrestataire { id: string; code: string; type: string; type_libelle: string; statut: string; nom: string; telephone: string | null; adresse: string | null; professionnels: number; options: string[] | null }

export function PagePrestataires() {
  const { peut } = useSession();
  const [statut, setStatut] = useState('');
  const [recherche, setRecherche] = useState('');
  const l = useDonnees<LignePrestataire[]>(`/sante/prestataires?${new URLSearchParams(Object.entries({ statut, recherche }).filter(([, v]) => v))}`);
  const [nouveau, setNouveau] = useState(false);
  const tous = l.donnees ?? [];
  return (
    <Page fil={['Santé', 'Prestataires']} titre="Prestataires agréés" actions={peut('PRESTATAIRES:CREER') && <button className="bouton" onClick={() => setNouveau(true)}>+ Nouveau prestataire</button>}>
      <div className="grille quatre">
        <Indicateur libelle="Agréés" valeur={tous.filter(p => p.statut === 'AGREE').length} couleur="vert" />
        <Indicateur libelle="En agrément" valeur={tous.filter(p => p.statut === 'EN_AGREMENT').length} couleur="orange" />
        <Indicateur libelle="Suspendus" valeur={tous.filter(p => p.statut === 'SUSPENDU').length} couleur="rouge" />
        <Indicateur libelle="Professionnels actifs" valeur={tous.reduce((s, p) => s + p.professionnels, 0)} />
      </div>
      <div className="filtres">
        <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Nom ou code" />
        <select value={statut} onChange={e => setStatut(e.target.value)}><option value="">Tous les statuts</option>{Object.entries(STATUTS_PRESTATAIRE).map(([k, [v]]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      <Carte titre="Structures">
        {l.chargement ? <Chargement /> : !tous.length ? <div className="vide">Aucun prestataire.</div> :
          <table className="tableau"><thead><tr><th>Code</th><th>Structure</th><th>Type</th><th>Adresse</th><th>Options</th><th>Professionnels</th><th>Statut</th></tr></thead>
            <tbody>{tous.map(p => <tr key={p.id}><td className="code"><Link to={`/sante/prestataires/${p.id}`}>{p.code}</Link></td><td>{p.nom}</td><td>{p.type_libelle}</td><td>{p.adresse ?? '—'}</td>
              <td>{(p.options ?? []).map(o => OPTIONS[o] ?? o).join(', ') || '—'}</td><td>{p.professionnels}</td><td><StatutP s={p.statut} /></td></tr>)}</tbody></table>}
      </Carte>
      {nouveau && <NouveauPrestataire fermer={() => setNouveau(false)} />}
    </Page>
  );
}

function NouveauPrestataire({ fermer }: { fermer: () => void }) {
  const types = useDonnees<{ types: Type[] }>('/sante/types-prestataire');
  const [tiers, setTiers] = useState<{ id: string; nom: string } | null>(null);
  const [type, setType] = useState('');
  const action = useAction();
  const aller = useNavigate();
  return (
    <Modale titre="Nouveau prestataire" fermer={fermer}>
      <Message>La structure est une fiche tiers « personne morale » (créée au référentiel des tiers, avec contrôle des doublons). Elle n'intervient qu'après son agrément.</Message>
      <div className="formulaire">
        <Champ libelle="Structure" large><ChoixTiers valeur={tiers} choisir={setTiers} /></Champ>
        <Champ libelle="Type">{types.donnees ? <select value={type} onChange={e => setType(e.target.value)}><option value="">Choisir…</option>{types.donnees.types.map(t => <option key={t.code} value={t.code}>{t.libelle}</option>)}</select> : <Chargement />}</Champ>
      </div>
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton" disabled={!tiers || !type || action.enCours}
        onClick={() => void action.executer(() => api<{ id: string }>('POST', '/sante/prestataires', { tiersId: tiers!.id, type })).then(r => r && aller(`/sante/prestataires/${r.id}`))}>Créer</button></div>
    </Modale>
  );
}

// ---------------------------------------------------------------- fiche

interface Professionnel { exercice_id: string; professionnel_id: string; nom: string; profession: string; specialite: string | null; numero_ordre: string; agree_le: string | null; statut_professionnel: string; teleconsultation: boolean; identifiant: string; statut_compte: string; actif: boolean; profil: string | null; derniere_connexion: string | null }
interface Fiche {
  id: string; code: string; nom: string; type: string; type_libelle: string; statut: string; telephone: string | null; adresse: string | null; code_tiers: string; tiers_id: string;
  convention_document_id: string | null; administrateur: string | null; statut_administrateur: string | null; latitude: number | null; longitude: number | null; telephone_mode_degrade: string | null;
  options: { option: string; actif: boolean }[]; tarifs: { id: string; acte_code: string | null; medicament_code: string | null; forfait_code: string | null; libelle: string; tarif: number; date_effet: string }[];
  professionnels: Professionnel[]; coordonneesVerifiees: number; professions: string[];
}
type Onglet = 'synthese' | 'tarifs' | 'professionnels' | 'journal';

export const CompteStatut = ({ s }: { s: string }) => <Statut couleur={{ ACTIF: 'vert', A_VALIDER: 'orange', SUSPENDU: 'rouge', DESACTIVE: 'gris' }[s]}>{{ ACTIF: 'Actif', A_VALIDER: 'En attente d\'agrément', SUSPENDU: 'Suspendu', DESACTIVE: 'Désactivé' }[s] ?? s}</Statut>;

export function PageFichePrestataire() {
  const { id } = useParams();
  const { peut } = useSession();
  const f = useDonnees<Fiche>(`/sante/prestataires/${id}`);
  const [onglet, setOnglet] = useState<Onglet>('synthese');
  const [agrement, setAgrement] = useState(false);
  const [tarif, setTarif] = useState(false);
  const [statut, setStatut] = useState<'SUSPENDU' | 'FIN_CONVENTION' | null>(null);
  const action = useAction();
  const { avis, Avis } = useAvis();
  if (f.erreur) return <Page titre="Prestataire"><MessageErreur erreur={f.erreur} /></Page>;
  if (!f.donnees) return <Page titre="Prestataire"><Chargement /></Page>;
  const p = f.donnees;
  const conditions: [string, boolean][] = [['Convention signée déposée', !!p.convention_document_id], ['Coordonnées de paiement vérifiées', p.coordonneesVerifiees > 0], ['Tarifs conventionnés saisis', p.tarifs.length > 0]];
  return (
    <Page fil={['Santé', <Link key="l" to="/sante/prestataires">Prestataires</Link>, p.code]} titre={p.nom} actions={<>
      {['EN_AGREMENT', 'SUSPENDU'].includes(p.statut) && peut('PRESTATAIRES:CREER') && <button className="bouton" onClick={() => setAgrement(true)}>{p.statut === 'SUSPENDU' ? 'Rétablir l\'agrément' : 'Proposer l\'agrément'}</button>}
      {p.statut === 'AGREE' && peut('PRESTATAIRES:MODIFIER') && <button className="bouton secondaire" onClick={() => setStatut('SUSPENDU')}>Suspendre</button>}
      {['AGREE', 'SUSPENDU'].includes(p.statut) && peut('PRESTATAIRES:MODIFIER') && <button className="bouton danger" onClick={() => setStatut('FIN_CONVENTION')}>Fin de convention</button>}</>}>
      <div className="filtres"><StatutP s={p.statut} /><span className="doux">{p.code} · {p.type_libelle} · tiers <Link to={`/referentiels/tiers/${p.tiers_id}`}>{p.code_tiers}</Link></span></div>
      <Onglets<Onglet> actif={onglet} choisir={setOnglet} onglets={[{ code: 'synthese', libelle: 'Synthèse' }, { code: 'tarifs', libelle: `Tarifs (${p.tarifs.length})` }, { code: 'professionnels', libelle: `Professionnels (${p.professionnels.length})` }, { code: 'journal', libelle: 'Journal' }]} />
      <MessageErreur erreur={action.erreur} />
      {onglet === 'synthese' && <div className="grille trois">
        <Carte titre="Agrément (SAN-RG-001)"><ul className="jalons">{conditions.map(([l, ok]) => <li key={l}><Statut couleur={ok ? 'vert' : 'orange'}>{ok ? 'OK' : 'à faire'}</Statut> {l}</li>)}</ul>
          {peut('PRESTATAIRES:MODIFIER') && <div style={{ marginTop: 12 }}><DepotPiece objetType="prestataire" objetId={p.id} typeDocument="CONVENTION" libelle={p.convention_document_id ? 'Remplacer la convention' : 'Déposer la convention signée'}
            depose={d => void action.executer(() => api('PATCH', `/sante/prestataires/${p.id}`, { conventionDocumentId: d.id })).then(() => f.recharger())} /></div>}
          {p.convention_document_id && <div style={{ marginTop: 8 }}><button className="lien" onClick={() => void ouvrirFichier('GET', `/documents/${p.convention_document_id}/fichier`)}>Ouvrir la convention</button></div>}
          {!p.coordonneesVerifiees && <p className="doux">Coordonnées à saisir sur la <Link to={`/referentiels/tiers/${p.tiers_id}`}>fiche tiers</Link>.</p>}</Carte>
        <Carte titre="Options de la structure (SAN-RG-060)">{Object.entries(OPTIONS).map(([o, l]) => { const actif = p.options.find(x => x.option === o)?.actif ?? false;
          return <label key={o} className="el-choix"><input type="checkbox" checked={actif} disabled={!peut('PRESTATAIRES:MODIFIER') || action.enCours}
            onChange={e => void action.executer(() => api('POST', `/sante/prestataires/${p.id}/options`, { option: o, actif: e.target.checked })).then(() => f.recharger())} /> {l}</label>; })}</Carte>
        <Carte titre="Administrateur et contact"><dl className="details"><dt>Administrateur</dt><dd>{p.administrateur ? <>{p.administrateur} {p.statut_administrateur && <CompteStatut s={p.statut_administrateur} />}</> : '—'}</dd>
          <dt>Téléphone</dt><dd>{p.telephone ?? '—'}</dd><dt>Adresse</dt><dd>{p.adresse ?? '—'}</dd><dt>Mode dégradé</dt><dd>{p.telephone_mode_degrade ?? '—'}</dd>
          <dt>Professions admises</dt><dd>{p.professions.map(x => PROFESSIONS[x] ?? x).join(', ')}</dd></dl></Carte>
      </div>}
      {onglet === 'tarifs' && <Carte titre="Tarifs conventionnés (SAN-RG-003)" actions={peut('PRESTATAIRES:CREER') && <button className="bouton secondaire petit" onClick={() => setTarif(true)}>+ Tarif</button>}>
        {!p.tarifs.length ? <div className="vide">Aucun tarif.</div> :
          <table className="tableau"><thead><tr><th>Objet</th><th>Libellé</th><th className="nombre">Tarif (GNF)</th><th>Effet</th></tr></thead>
            <tbody>{p.tarifs.map(t => <tr key={t.id}><td className="code">{t.acte_code ?? t.medicament_code ?? t.forfait_code}</td><td>{t.libelle}</td><td className="nombre">{montant(t.tarif)}</td><td>{date(t.date_effet)}</td></tr>)}</tbody></table>}
        <p className="doux">Une facture ne peut dépasser le tarif conventionné en vigueur à la date de l'acte.</p></Carte>}
      {onglet === 'professionnels' && <Professionnels liste={p.professionnels} />}
      {onglet === 'journal' && <JournalStructure url={`/sante/prestataires/${p.id}/journal`} />}
      {agrement && <Agrement p={p} fermer={() => setAgrement(false)} apres={m => { setAgrement(false); avis(m); void f.recharger(); }} />}
      {tarif && <NouveauTarif id={p.id} fermer={() => setTarif(false)} apres={() => { setTarif(false); avis('Tarif enregistré.'); void f.recharger(); }} />}
      {statut && <ChangementStatut id={p.id} statut={statut} fermer={() => setStatut(null)} apres={m => { setStatut(null); avis(m); void f.recharger(); }} />}
      <Avis />
    </Page>
  );
}

function Professionnels({ liste }: { liste: Professionnel[] }) {
  return (
    <Carte titre="Professionnels de la structure (SAN-RG-004, 009)">
      {!liste.length ? <div className="vide">Aucun professionnel : l'administrateur de la structure les crée sur son portail.</div> :
        <table className="tableau"><thead><tr><th>Nom</th><th>Profession</th><th>N° d'ordre</th><th>Profil</th><th>Compte</th><th>Agrément</th><th>Dernière connexion</th></tr></thead>
          <tbody>{liste.map(x => <tr key={x.exercice_id}><td>{x.nom}</td><td>{PROFESSIONS[x.profession] ?? x.profession}{x.specialite ? ` · ${x.specialite}` : ''}</td><td className="code">{x.numero_ordre}</td>
            <td>{x.profil?.toLowerCase().replace(/_/g, ' ')}</td><td><span className="code">{x.identifiant}</span> <CompteStatut s={x.statut_compte} /></td>
            <td>{x.agree_le ? date(x.agree_le) : <Statut couleur="orange">À agréer</Statut>}</td><td>{dateHeure(x.derniere_connexion)}</td></tr>)}</tbody></table>}
    </Carte>
  );
}

export function JournalStructure({ url }: { url: string }) {
  const j = useDonnees<{ horodatage: string; action: string; objet_type: string; identifiant: string; auteur: string }[]>(url);
  return (
    <Carte titre="Journal des actions de la structure">
      {!j.donnees ? <Chargement /> : !j.donnees.length ? <div className="vide">Aucune action.</div> :
        <table className="tableau"><thead><tr><th>Date</th><th>Auteur</th><th>Action</th><th>Objet</th></tr></thead>
          <tbody>{j.donnees.map((x, i) => <tr key={i}><td>{dateHeure(x.horodatage)}</td><td>{x.auteur} <span className="doux code">{x.identifiant}</span></td><td>{x.action.toLowerCase()}</td><td>{x.objet_type.replace(/_/g, ' ')}</td></tr>)}</tbody></table>}
    </Carte>
  );
}

function Agrement({ p, fermer, apres }: { p: Fiche; fermer: () => void; apres: (m: string) => void }) {
  const [admin, setAdmin] = useState<{ id: string; nom: string } | null>(null);
  const [identifiant, setIdentifiant] = useState('');
  const [mdp, setMdp] = useState('');
  const action = useAction();
  const reprise = !!p.administrateur;
  return (
    <Modale titre={reprise ? 'Rétablir l\'agrément' : 'Proposer l\'agrément'} fermer={fermer}>
      <Message>L'agrément est validé par le médecin-conseil puis la DAF. {reprise ? 'Les comptes de la structure sont rétablis à la validation.' : 'Le compte de l\'administrateur désigné par la structure est créé inactif et activé par l\'agrément ; il reçoit son identifiant par SMS.'}</Message>
      {!reprise && <div className="formulaire">
        <Champ libelle="Administrateur (personne physique)" large aide="Responsable de la structure ou personne mandatée"><ChoixTiers valeur={admin} choisir={setAdmin} /></Champ>
        <Champ libelle="Identifiant"><input value={identifiant} onChange={e => setIdentifiant(e.target.value.toLowerCase())} placeholder="admin.clinique" /></Champ>
        <Champ libelle="Mot de passe initial"><input type="password" value={mdp} onChange={e => setMdp(e.target.value)} /></Champ>
      </div>}
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton" disabled={(!reprise && (!admin || identifiant.length < 3 || mdp.length < 8)) || action.enCours}
        onClick={() => void action.executer(() => api('POST', `/sante/prestataires/${p.id}/agrement`, reprise ? { tiersId: crypto.randomUUID(), identifiant: 'reprise', motDePasse: 'reprise-sans-objet' } : { tiersId: admin!.id, identifiant, motDePasse: mdp }))
          .then(r => r && apres('Agrément soumis au médecin-conseil puis à la DAF.'))}>Soumettre</button></div>
    </Modale>
  );
}

function NouveauTarif({ id, fermer, apres }: { id: string; fermer: () => void; apres: () => void }) {
  const [nature, setNature] = useState<'acteCode' | 'medicamentCode' | 'forfaitCode'>('acteCode');
  const [code, setCode] = useState('');
  const [tarif, setTarif] = useState('');
  const [effet, setEffet] = useState(new Date().toISOString().slice(0, 10));
  const actes = useDonnees<{ actes: { code: string; libelle: string }[] }>(nature === 'acteCode' ? '/sante/actes?actifs=true' : null);
  const meds = useDonnees<{ code: string; denomination: string }[]>(nature === 'medicamentCode' ? '/sante/medicaments?couverts=true' : null);
  const action = useAction();
  return (
    <Modale titre="Tarif conventionné" fermer={fermer}>
      <div className="formulaire">
        <Champ libelle="Objet"><select value={nature} onChange={e => { setNature(e.target.value as typeof nature); setCode(''); }}><option value="acteCode">Acte</option><option value="medicamentCode">Médicament</option><option value="forfaitCode">Forfait d'hospitalisation</option></select></Champ>
        <Champ libelle="Code">{nature === 'forfaitCode' ? <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="HOSP-JOUR" />
          : <select value={code} onChange={e => setCode(e.target.value)}><option value="">Choisir…</option>
            {nature === 'acteCode' ? actes.donnees?.actes.map(a => <option key={a.code} value={a.code}>{a.code} – {a.libelle}</option>) : meds.donnees?.map(m => <option key={m.code} value={m.code}>{m.code} – {m.denomination}</option>)}</select>}</Champ>
        <Champ libelle="Tarif (GNF)"><input inputMode="numeric" value={tarif} onChange={e => setTarif(e.target.value.replace(/\D/g, ''))} /></Champ>
        <Champ libelle="Date d'effet"><input type="date" value={effet} onChange={e => setEffet(e.target.value)} /></Champ>
      </div>
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton" disabled={!code || !Number(tarif) || action.enCours}
        onClick={() => void action.executer(() => api('POST', `/sante/prestataires/${id}/tarifs`, { [nature]: code, tarif: Number(tarif), dateEffet: effet })).then(r => r && apres())}>Enregistrer</button></div>
    </Modale>
  );
}

function ChangementStatut({ id, statut, fermer, apres }: { id: string; statut: 'SUSPENDU' | 'FIN_CONVENTION'; fermer: () => void; apres: (m: string) => void }) {
  const [motif, setMotif] = useState('');
  const action = useAction();
  return (
    <Modale titre={statut === 'SUSPENDU' ? 'Suspendre le prestataire' : 'Mettre fin à la convention'} fermer={fermer}>
      <Message type="attention">Tous les comptes de la structure sont {statut === 'SUSPENDU' ? 'suspendus' : 'désactivés'} immédiatement et leurs sessions fermées ; la structure disparaît de l'annuaire.</Message>
      <div className="formulaire"><Champ libelle="Motif" large><textarea value={motif} onChange={e => setMotif(e.target.value)} /></Champ></div>
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton danger" disabled={!motif.trim() || action.enCours}
        onClick={() => void action.executer(() => api<{ comptesDesactives: number }>('POST', `/sante/prestataires/${id}/statut`, { statut, motif })).then(r => r && apres(`${r.comptesDesactives} compte(s) ${statut === 'SUSPENDU' ? 'suspendu(s)' : 'désactivé(s)'}.`))}>Confirmer</button></div>
    </Modale>
  );
}

// ---------------------------------------------------------------- professionnels (vue Compagnie)

interface Pro { id: string; nom: string; profession: string; specialite: string | null; numero_ordre: string; agree_le: string | null; statut: string; teleconsultation: boolean; structures: string | null; demande: string | null }

export function PageProfessionnels() {
  const { peut } = useSession();
  const [filtre, setFiltre] = useState<'A_AGREER' | 'AGREES' | 'INACTIFS' | ''>('A_AGREER');
  const l = useDonnees<Pro[]>(`/sante/professionnels${filtre ? `?statut=${filtre}` : ''}`);
  const [retrait, setRetrait] = useState<Pro | null>(null);
  const action = useAction();
  const { avis, Avis } = useAvis();
  return (
    <Page fil={['Santé', 'Professionnels de santé']} titre="Professionnels de santé">
      <div className="filtres"><select value={filtre} onChange={e => setFiltre(e.target.value as typeof filtre)}><option value="A_AGREER">À agréer</option><option value="AGREES">Agréés</option><option value="INACTIFS">Agrément retiré</option><option value="">Tous</option></select></div>
      <MessageErreur erreur={action.erreur} />
      <Carte titre="Professionnels">
        {l.chargement ? <Chargement /> : !l.donnees?.length ? <div className="vide">Aucun professionnel.</div> :
          <table className="tableau"><thead><tr><th>Nom</th><th>Profession</th><th>N° d'ordre</th><th>Structures</th><th>Agrément</th><th>Téléconsultation</th><th /></tr></thead>
            <tbody>{l.donnees.map(x => <tr key={x.id}><td>{x.nom}</td><td>{PROFESSIONS[x.profession] ?? x.profession}{x.specialite ? ` · ${x.specialite}` : ''}</td><td className="code">{x.numero_ordre}</td><td>{x.structures}</td>
              <td>{x.agree_le ? <>{date(x.agree_le)} {x.statut === 'INACTIF' && <Statut couleur="rouge">retiré</Statut>}</> : x.demande ? <Link to="/validations">en validation</Link> : '—'}</td>
              <td>{x.agree_le && ['MEDECIN', 'SAGE_FEMME', 'CHIRURGIEN_DENTISTE'].includes(x.profession) && peut('PRESTATAIRES:MODIFIER')
                ? <label className="el-choix"><input type="checkbox" checked={x.teleconsultation} onChange={e => void action.executer(() => api('POST', `/sante/professionnels/${x.id}/teleconsultation`, { habilite: e.target.checked })).then(() => l.recharger())} /> habilité</label>
                : x.teleconsultation ? 'habilité' : '—'}</td>
              <td>{x.agree_le && peut('PRESTATAIRES:MODIFIER') && (x.statut === 'ACTIF' ? <button className="lien" onClick={() => setRetrait(x)}>Retirer l'agrément</button>
                : <button className="lien" onClick={() => void action.executer(() => api('POST', `/sante/professionnels/${x.id}/statut`, { actif: true, motif: 'Réactivation' })).then(() => { avis('Agrément rétabli ; l\'administrateur réactive les comptes.'); void l.recharger(); })}>Rétablir</button>)}</td></tr>)}</tbody></table>}
      </Carte>
      <Message>L'agrément individuel (identité, diplôme, numéro d'ordre) est décidé par le médecin-conseil dans <Link to="/validations">Validations</Link>. Seuls les professionnels agréés accèdent au carnet de santé ; le retrait de l'agrément désactive leurs comptes dans toutes les structures.</Message>
      {retrait && <Modale titre={`Retirer l'agrément de ${retrait.nom}`} fermer={() => setRetrait(null)}><Retrait p={retrait} apres={() => { setRetrait(null); avis('Agrément retiré : comptes désactivés partout.'); void l.recharger(); }} /></Modale>}
      <Avis />
    </Page>
  );
}

function Retrait({ p, apres }: { p: Pro; apres: () => void }) {
  const [motif, setMotif] = useState('');
  const action = useAction();
  return (<>
    <div className="formulaire"><Champ libelle="Motif" large><textarea value={motif} onChange={e => setMotif(e.target.value)} /></Champ></div>
    <MessageErreur erreur={action.erreur} />
    <div className="boutons"><button className="bouton danger" disabled={!motif.trim() || action.enCours}
      onClick={() => void action.executer(() => api('POST', `/sante/professionnels/${p.id}/statut`, { actif: false, motif })).then(r => r !== undefined && apres())}>Retirer</button></div>
  </>);
}

// ---------------------------------------------------------------- nomenclatures (§ 5.6)

export function PageNomenclaturesSante() {
  const { peut } = useSession();
  const [onglet, setOnglet] = useState<'actes' | 'medicaments'>('actes');
  const [recherche, setRecherche] = useState('');
  const actes = useDonnees<{ actes: { code: string; libelle: string; famille: string; specialite: string | null; actif: boolean }[]; familles: string[] }>(onglet === 'actes' ? `/sante/actes${recherche ? `?recherche=${encodeURIComponent(recherche)}` : ''}` : null);
  const meds = useDonnees<{ id: string; code: string; denomination: string; dci: string; generique: boolean; couvert: boolean; quantite_max_ordonnance: number | null }[]>(onglet === 'medicaments' ? `/sante/medicaments${recherche ? `?recherche=${encodeURIComponent(recherche)}` : ''}` : null);
  const [saisie, setSaisie] = useState(false);
  const [imp, setImp] = useState(false);
  const { avis, Avis } = useAvis();
  return (
    <Page fil={['Santé', 'Nomenclatures']} titre="Actes et médicaments" actions={peut('NOMENCLATURES:CREER') && <>
      <button className="bouton secondaire" onClick={() => setImp(true)}>Importer</button><button className="bouton" onClick={() => setSaisie(true)}>+ {onglet === 'actes' ? 'Acte' : 'Médicament'}</button></>}>
      <Onglets actif={onglet} choisir={setOnglet} onglets={[{ code: 'actes', libelle: 'Actes' }, { code: 'medicaments', libelle: 'Médicaments' }]} />
      <div className="filtres"><input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Code ou libellé" /></div>
      {onglet === 'actes' && <Carte titre="Nomenclature des actes">{!actes.donnees ? <Chargement /> : !actes.donnees.actes.length ? <div className="vide">Aucun acte.</div> :
        <table className="tableau"><thead><tr><th>Code</th><th>Libellé</th><th>Famille</th><th>Spécialité</th><th>Statut</th></tr></thead>
          <tbody>{actes.donnees.actes.map(a => <tr key={a.code}><td className="code">{a.code}</td><td>{a.libelle}</td><td>{a.famille.toLowerCase()}</td><td>{a.specialite ?? '—'}</td><td>{a.actif ? <Statut couleur="vert">Actif</Statut> : <Statut couleur="gris">Inactif</Statut>}</td></tr>)}</tbody></table>}</Carte>}
      {onglet === 'medicaments' && <Carte titre="Médicaments">{!meds.donnees ? <Chargement /> : !meds.donnees.length ? <div className="vide">Aucun médicament.</div> :
        <table className="tableau"><thead><tr><th>Code</th><th>Dénomination</th><th>DCI</th><th>Générique</th><th>Couvert</th><th className="nombre">Qté max / ordonnance</th></tr></thead>
          <tbody>{meds.donnees.map(m => <tr key={m.id}><td className="code">{m.code}</td><td>{m.denomination}</td><td>{m.dci}</td><td>{m.generique ? 'oui' : 'non'}</td><td>{m.couvert ? <Statut couleur="vert">Couvert</Statut> : <Statut couleur="gris">Non couvert</Statut>}</td><td className="nombre">{m.quantite_max_ordonnance ?? '—'}</td></tr>)}</tbody></table>}</Carte>}
      {saisie && <SaisieNomenclature nature={onglet} familles={actes.donnees?.familles ?? []} fermer={() => setSaisie(false)} apres={() => { setSaisie(false); avis('Enregistré.'); void (onglet === 'actes' ? actes.recharger() : meds.recharger()); }} />}
      {imp && <ImportNomenclature nature={onglet} fermer={() => setImp(false)} apres={m => { setImp(false); avis(m); void (onglet === 'actes' ? actes.recharger() : meds.recharger()); }} />}
      <Avis />
    </Page>
  );
}

function SaisieNomenclature({ nature, familles, fermer, apres }: { nature: 'actes' | 'medicaments'; familles: string[]; fermer: () => void; apres: () => void }) {
  const [v, setV] = useState({ code: '', libelle: '', famille: 'CONSULTATION', specialite: '', dci: '', generique: true, couvert: true, quantite: '' });
  const action = useAction();
  const actes = nature === 'actes';
  return (
    <Modale titre={actes ? 'Acte' : 'Médicament'} fermer={fermer}>
      <div className="formulaire">
        <Champ libelle="Code"><input value={v.code} onChange={e => setV({ ...v, code: e.target.value.toUpperCase() })} /></Champ>
        <Champ libelle={actes ? 'Libellé' : 'Dénomination'} large><input value={v.libelle} onChange={e => setV({ ...v, libelle: e.target.value })} /></Champ>
        {actes ? <><Champ libelle="Famille"><select value={v.famille} onChange={e => setV({ ...v, famille: e.target.value })}>{familles.map(f => <option key={f} value={f}>{f.toLowerCase()}</option>)}</select></Champ>
          <Champ libelle="Spécialité"><input value={v.specialite} onChange={e => setV({ ...v, specialite: e.target.value })} /></Champ></>
          : <><Champ libelle="DCI"><input value={v.dci} onChange={e => setV({ ...v, dci: e.target.value })} /></Champ>
            <Champ libelle="Quantité max par ordonnance"><input inputMode="numeric" value={v.quantite} onChange={e => setV({ ...v, quantite: e.target.value.replace(/\D/g, '') })} /></Champ>
            <label className="el-choix"><input type="checkbox" checked={v.generique} onChange={e => setV({ ...v, generique: e.target.checked })} /> Générique</label>
            <label className="el-choix"><input type="checkbox" checked={v.couvert} onChange={e => setV({ ...v, couvert: e.target.checked })} /> Couvert</label></>}
      </div>
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton" disabled={!v.code || !v.libelle || (!actes && !v.dci) || action.enCours}
        onClick={() => void action.executer(() => actes ? api('POST', '/sante/actes', { code: v.code, libelle: v.libelle, famille: v.famille, specialite: v.specialite || null })
          : api('POST', '/sante/medicaments', { code: v.code, denomination: v.libelle, dci: v.dci, generique: v.generique, couvert: v.couvert, quantiteMaxOrdonnance: v.quantite ? Number(v.quantite) : null })).then(r => r && apres())}>Enregistrer</button></div>
    </Modale>
  );
}

function ImportNomenclature({ nature, fermer, apres }: { nature: 'actes' | 'medicaments'; fermer: () => void; apres: (m: string) => void }) {
  const [contenu, setContenu] = useState('');
  const [erreurs, setErreurs] = useState<string[]>([]);
  const action = useAction();
  return (
    <Modale titre={`Importer des ${nature === 'actes' ? 'actes' : 'médicaments'}`} large fermer={fermer}>
      <Message>Une ligne par élément : <span className="code">{nature === 'actes' ? 'code ; libellé ; famille ; spécialité' : 'code ; dénomination ; DCI ; générique (oui/non) ; couvert (oui/non) ; quantité max'}</span>. Un code existant est mis à jour.</Message>
      <div className="formulaire"><Champ libelle="Fichier" large><input type="file" accept=".csv,.txt" onChange={e => { const f = e.target.files?.[0]; if (f) void f.text().then(setContenu); }} /></Champ>
        <Champ libelle="Contenu" large><textarea rows={8} value={contenu} onChange={e => setContenu(e.target.value)} /></Champ></div>
      {!!erreurs.length && <Message type="attention"><ul>{erreurs.map(e => <li key={e}>{e}</li>)}</ul></Message>}
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton" disabled={!contenu.trim() || action.enCours}
        onClick={() => void action.executer(() => api<{ importees: number; erreurs: string[] }>('POST', '/sante/nomenclatures/import', { nature: nature === 'actes' ? 'ACTES' : 'MEDICAMENTS', contenu }))
          .then(r => { if (!r) return; if (r.erreurs.length) setErreurs(r.erreurs); else apres(`${r.importees} ligne(s) importée(s).`); })}>Importer</button></div>
    </Modale>
  );
}

