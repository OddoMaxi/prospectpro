/** AD-02 Utilisateurs (ORG-RG-020 à 023, 042, 044, 045). */
import { useMemo, useState } from 'react';
import { api, date, dateHeure } from '../../noyau/api';
import { Carte, Champ, Chargement, Message, MessageErreur, Modale, Page, Statut, useAvis } from '../../noyau/composants';
import { useAction, useDonnees } from '../../noyau/donnees';
import { useSession } from '../../noyau/session';
import { aplatir, type Noeud } from './Organigramme';

interface Attribution { id: string; code: string; perimetre: Record<string, string[]> | null; date_fin: string | null; valide: boolean }
interface Utilisateur {
  id: string; identifiant: string; type_compte: string; statut: string; derniere_connexion: string | null; double_facteur: boolean;
  nom: string; prenoms: string | null; fonction: string | null; profils: Attribution[] | null;
}
interface Profil { id: string; code: string; libelle: string; privilegie: boolean; externe: boolean }

const INACTIVITE_JOURS = 90;
const joursDepuis = (d: string | null) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000) : null);
const perimetreTexte = (p: Record<string, string[]> | null) => (p && Object.keys(p).length ? Object.entries(p).map(([k, v]) => `${k} ${v.join(', ')}`).join(' ; ') : 'Toute la Compagnie');

export function PageUtilisateurs() {
  const { peut, moi } = useSession();
  const [statut, setStatut] = useState('ACTIF');
  const [recherche, setRecherche] = useState('');
  const [inactifs, setInactifs] = useState(false);
  const liste = useDonnees<Utilisateur[]>(`/admin/utilisateurs?${statut ? `statut=${statut}&` : ''}${recherche.length >= 2 ? `recherche=${encodeURIComponent(recherche)}` : ''}`);
  const profils = useDonnees<{ profils: Profil[] }>('/admin/profils');
  const [choisi, setChoisi] = useState<Utilisateur | null>(null);
  const [creation, setCreation] = useState(false);
  const { avis, Avis } = useAvis();
  const affiches = (liste.donnees ?? []).filter(u => !inactifs || (joursDepuis(u.derniere_connexion) ?? 9999) > INACTIVITE_JOURS);
  const libelleProfil = (code: string) => profils.donnees?.profils.find(p => p.code === code)?.libelle ?? code;
  const apres = (m: string) => { avis(m); void liste.recharger().then(() => setChoisi(null)); };

  return (
    <Page fil={['Administration', 'Utilisateurs']} titre="Utilisateurs">
      <div className="filtres">
        <span className="repere">1</span>
        <select value={statut} onChange={e => setStatut(e.target.value)} aria-label="Statut">
          <option value="">Statut : tous</option><option value="ACTIF">Statut : actif</option><option value="A_VALIDER">Statut : à valider</option>
          <option value="SUSPENDU">Statut : suspendu</option><option value="DESACTIVE">Statut : désactivé</option>
        </select>
        <input placeholder="Nom ou identifiant" value={recherche} onChange={e => setRecherche(e.target.value)} />
        <label><input type="checkbox" checked={inactifs} onChange={e => setInactifs(e.target.checked)} /> Dernière connexion &gt; {INACTIVITE_JOURS} jours</label>
      </div>
      <Carte titre="Liste des utilisateurs" repere={2} actions={peut('UTILISATEURS:CREER') && <button className="bouton" onClick={() => setCreation(true)}>+ Créer un utilisateur</button>}>
        <MessageErreur erreur={liste.erreur} />
        {liste.chargement ? <Chargement /> : <div className="defile"><table className="tableau">
          <thead><tr><th>Utilisateur</th><th>Fonction</th><th>Profils</th><th>Double auth.</th><th>Dernière connexion</th><th>Statut</th></tr></thead>
          <tbody>{affiches.map(u => {
            const inactif = (joursDepuis(u.derniere_connexion) ?? 0) > INACTIVITE_JOURS;
            return (
              <tr key={u.id} className={`cliquable${choisi?.id === u.id ? ' choisie' : ''}`} onClick={() => setChoisi(u)}>
                <td><b>{u.prenoms} {u.nom}</b><div className="doux code">{u.identifiant}</div></td><td>{u.fonction ?? '—'}</td>
                <td>{(u.profils ?? []).map(p => <div key={p.id}>{libelleProfil(p.code)}{p.perimetre && Object.keys(p.perimetre).length ? <span className="doux"> ({perimetreTexte(p.perimetre)})</span> : null}{!p.valide && <> <Statut valeur="A_VALIDER" /></>}</div>)}</td>
                <td><Statut valeur={u.double_facteur ? 'ACTIVE' : 'INACTIF'}>{u.double_facteur ? 'Active' : 'À enrôler'}</Statut></td>
                <td>{dateHeure(u.derniere_connexion)}</td>
                <td>{inactif && u.statut === 'ACTIF' ? <Statut couleur="orange">À examiner</Statut> : <Statut valeur={u.statut} />}</td>
              </tr>);
          })}</tbody></table>
          {affiches.length === 0 && <div className="vide">Aucun utilisateur ne correspond aux filtres.</div>}
        </div>}
      </Carte>
      {choisi && <FicheUtilisateur u={choisi} profils={profils.donnees?.profils ?? []} soiMeme={choisi.id === moi?.id} apres={apres} />}
      {creation && <Creation fermer={() => setCreation(false)} apres={m => { setCreation(false); apres(m); }} />}
      <Avis />
    </Page>
  );
}

function FicheUtilisateur({ u, profils, soiMeme, apres }: { u: Utilisateur; profils: Profil[]; soiMeme: boolean; apres: (m: string) => void }) {
  const { peut } = useSession();
  const connexions = useDonnees<{ horodatage: string; action: string; adresse_ip: string | null; appareil: string | null }[]>(`/admin/utilisateurs/${u.id}/connexions`);
  const [attribution, setAttribution] = useState(false);
  const [changement, setChangement] = useState<null | 'SUSPENDU' | 'DESACTIVE' | 'ACTIF'>(null);
  const [motif, setMotif] = useState('');
  const action = useAction();
  const jours = joursDepuis(u.derniere_connexion);
  const libelle = (code: string) => profils.find(p => p.code === code)?.libelle ?? code;

  return (
    <div className="grille deux">
      <Carte titre={`Fiche : ${u.prenoms ?? ''} ${u.nom}`} repere={3}>
        <dl className="details">
          <dt>Identifiant</dt><dd className="code">{u.identifiant}</dd><dt>Type de compte</dt><dd>{u.type_compte}</dd>
          <dt>Fonction</dt><dd>{u.fonction ?? '—'}</dd><dt>Statut</dt><dd><Statut valeur={u.statut} /></dd>
          <dt>Dernière connexion</dt><dd>{dateHeure(u.derniere_connexion)}</dd>
        </dl>
        {jours !== null && jours > INACTIVITE_JOURS && <div style={{ marginTop: 12 }}><Message type="attention">Aucune connexion depuis {jours} jours : à confirmer lors de la revue semestrielle des habilitations.</Message></div>}
        <h3>Dernières connexions</h3>
        {connexions.donnees?.length ? <table className="tableau"><tbody>{connexions.donnees.slice(0, 6).map((c, i) => <tr key={i}><td>{dateHeure(c.horodatage)}</td><td><Statut valeur={c.action === 'CONNEXION' ? 'ACTIF' : c.action === 'ECHEC_CONNEXION' ? 'REJETE' : 'INACTIF'}>{c.action.replace('_', ' ').toLowerCase()}</Statut></td><td className="doux">{c.adresse_ip ?? ''}</td></tr>)}</tbody></table> : <div className="vide">Aucune connexion.</div>}
        {peut('UTILISATEURS:MODIFIER') && !soiMeme && <div className="boutons">
          {u.statut === 'ACTIF' && <button className="bouton danger" onClick={() => setChangement('SUSPENDU')}>Suspendre</button>}
          {u.statut !== 'ACTIF' && u.statut !== 'DESACTIVE' && <button className="bouton valider" onClick={() => setChangement('ACTIF')}>Réactiver</button>}
          {u.statut !== 'DESACTIVE' && <button className="bouton secondaire" onClick={() => setChangement('DESACTIVE')}>Désactiver</button>}
        </div>}
        <p className="doux" style={{ fontSize: 12 }}>Un compte n'est jamais supprimé : il est suspendu ou désactivé, et ses sessions sont révoquées.</p>
      </Carte>
      <Carte titre="Profils attribués" repere={4}>
        {(u.profils ?? []).length === 0 ? <div className="vide">Aucun profil.</div> :
          <table className="tableau"><thead><tr><th>Profil</th><th>Périmètre</th><th>Au</th><th /></tr></thead>
            <tbody>{(u.profils ?? []).map(p => <tr key={p.id}><td>{libelle(p.code)}{!p.valide && <> <Statut valeur="A_VALIDER" /></>}</td><td>{perimetreTexte(p.perimetre)}</td><td>{date(p.date_fin)}</td>
              <td>{peut('UTILISATEURS:PARAMETRER') && !soiMeme && <button className="lien" onClick={() => {
                const m = prompt('Motif du retrait du profil');
                if (m?.trim()) void action.executer(() => api('DELETE', `/admin/attributions/${p.id}`, { motif: m })).then(r => r !== undefined && apres('Profil retiré.'));
              }}>Retirer</button>}</td></tr>)}</tbody></table>}
        <MessageErreur erreur={action.erreur} />
        {peut('UTILISATEURS:PARAMETRER') && (soiMeme
          ? <Message type="attention">Aucun utilisateur ne peut s'attribuer un profil ni modifier ses propres droits.</Message>
          : <div className="boutons"><button className="bouton" onClick={() => setAttribution(true)}>+ Attribuer un profil</button></div>)}
      </Carte>
      {attribution && <Attribution u={u} profils={profils} fermer={() => setAttribution(false)} apres={m => { setAttribution(false); apres(m); }} />}
      {changement && <Modale titre={{ SUSPENDU: 'Suspendre le compte', DESACTIVE: 'Désactiver le compte', ACTIF: 'Réactiver le compte' }[changement]} fermer={() => setChangement(null)}>
        <Champ libelle="Motif (tracé au journal)"><textarea rows={3} value={motif} onChange={e => setMotif(e.target.value)} /></Champ>
        <MessageErreur erreur={action.erreur} />
        <div className="boutons"><button className={changement === 'ACTIF' ? 'bouton valider' : 'bouton danger'} disabled={!motif.trim() || action.enCours}
          onClick={() => void action.executer(() => api('POST', `/admin/utilisateurs/${u.id}/statut`, { statut: changement, motif })).then(r => r !== undefined && apres('Statut du compte modifié.'))}>Confirmer</button>
          <button className="bouton secondaire" onClick={() => setChangement(null)}>Annuler</button></div>
      </Modale>}
    </div>
  );
}

function Attribution({ u, profils, fermer, apres }: { u: Utilisateur; profils: Profil[]; fermer: () => void; apres: (m: string) => void }) {
  const [profilId, setProfilId] = useState('');
  const [bureaux, setBureaux] = useState('');
  const [dateFin, setDateFin] = useState('');
  const action = useAction();
  const p = profils.find(x => x.id === profilId);
  const envoyer = async () => {
    const codes = bureaux.split(/[\s,;]+/).filter(Boolean);
    const r = await action.executer(() => api<{ demandeValidation: string | null }>('POST', `/admin/utilisateurs/${u.id}/profils`, {
      profilId, perimetre: codes.length ? { bureaux: codes } : undefined, dateFin: dateFin || undefined,
    }));
    if (r) apres(r.demandeValidation ? 'Profil privilégié : l\'attribution attend la validation d\'un second administrateur.' : 'Profil attribué.');
  };
  return (
    <Modale titre={`Attribuer un profil à ${u.prenoms ?? ''} ${u.nom}`} fermer={fermer}>
      <div className="formulaire" style={{ '--colonnes': 2 } as React.CSSProperties}>
        <Champ libelle="Profil" large><select value={profilId} onChange={e => setProfilId(e.target.value)}><option value="">—</option>
          {profils.map(x => <option key={x.id} value={x.id}>{x.libelle}{x.privilegie ? ' (privilégié)' : ''}{x.externe ? ' (externe)' : ''}</option>)}</select></Champ>
        <Champ libelle="Périmètre : codes bureau" aide="Vide = toute la Compagnie. Ex. 01, 07"><input value={bureaux} onChange={e => setBureaux(e.target.value)} /></Champ>
        <Champ libelle="Fin (facultatif)"><input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} /></Champ>
      </div>
      {p?.privilegie && <Message type="attention">Profil privilégié : l'attribution sera validée par un second administrateur ou la Direction générale ; l'utilisateur devra utiliser une application d'authentification.</Message>}
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton" disabled={!profilId || action.enCours} onClick={() => void envoyer()}>Attribuer</button><button className="bouton secondaire" onClick={fermer}>Annuler</button></div>
    </Modale>
  );
}

interface TiersTrouve { id: string; code_tiers: string; nom: string; prenoms: string | null; telephone: string | null; date_naissance: string | null }

function Creation({ fermer, apres }: { fermer: () => void; apres: (m: string) => void }) {
  const orga = useDonnees<Noeud[]>('/admin/organigramme');
  const fonctions = useMemo(() => aplatir(orga.donnees ?? []).filter(n => n.type === 'FONCTION' && n.statut === 'ACTIF'), [orga.donnees]);
  const [recherche, setRecherche] = useState('');
  const [trouves, setTrouves] = useState<TiersTrouve[]>([]);
  const [tiers, setTiers] = useState<TiersTrouve | null>(null);
  const [d, setD] = useState({ identifiant: '', typeCompte: 'INTERNE', fonctionId: '', motDePasse: '', telephone: '' });
  const action = useAction();
  const chercher = async () => { if (recherche.trim().length >= 2) setTrouves(await api<TiersTrouve[]>('GET', `/tiers?recherche=${encodeURIComponent(recherche.trim())}`)); };
  return (
    <Modale titre="Créer un utilisateur" large fermer={fermer}>
      <Message>Chaque compte est nominatif et lié à la fiche tiers de la personne : créez d'abord sa fiche dans Référentiels › Tiers si elle n'existe pas.</Message>
      {!tiers ? <>
        <div className="filtres"><input placeholder="Nom, téléphone ou code tiers" value={recherche} onChange={e => setRecherche(e.target.value)} onKeyDown={e => e.key === 'Enter' && void chercher()} />
          <button className="bouton secondaire" onClick={() => void chercher()}>Rechercher</button></div>
        {trouves.length > 0 && <table className="tableau"><tbody>{trouves.map(t => <tr key={t.id} className="cliquable" onClick={() => { setTiers(t); setD({ ...d, telephone: t.telephone ?? '' }); }}>
          <td className="code">{t.code_tiers}</td><td>{t.prenoms} {t.nom}</td><td>{date(t.date_naissance)}</td><td>{t.telephone}</td></tr>)}</tbody></table>}
      </> : <>
        <Message type="succes">Fiche liée : <b>{tiers.prenoms} {tiers.nom}</b> ({tiers.code_tiers}) <button className="lien" onClick={() => setTiers(null)}>changer</button></Message>
        <div className="formulaire">
          <Champ libelle="Identifiant"><input value={d.identifiant} onChange={e => setD({ ...d, identifiant: e.target.value.toLowerCase() })} placeholder="prenom.nom" /></Champ>
          <Champ libelle="Type de compte"><select value={d.typeCompte} onChange={e => setD({ ...d, typeCompte: e.target.value })}>
            {['INTERNE', 'AGENT_GENERAL', 'COLLABORATEUR', 'JUNIOR', 'PRESCRIPTEUR', 'ADMIN_PRESTATAIRE', 'PROFESSIONNEL_SANTE'].map(t => <option key={t}>{t}</option>)}</select></Champ>
          <Champ libelle="Fonction" aide="Obligatoire pour un compte interne (ORG-RG-020)"><select value={d.fonctionId} onChange={e => setD({ ...d, fonctionId: e.target.value })}><option value="">—</option>
            {fonctions.map(f => <option key={f.id} value={f.id}>{f.libelle}</option>)}</select></Champ>
          <Champ libelle="Téléphone (second facteur)"><input value={d.telephone} onChange={e => setD({ ...d, telephone: e.target.value })} /></Champ>
          <Champ libelle="Mot de passe initial" aide="Selon la politique paramétrée (longueur minimale…)"><input type="password" autoComplete="new-password" value={d.motDePasse} onChange={e => setD({ ...d, motDePasse: e.target.value })} /></Champ>
        </div>
      </>}
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton" disabled={!tiers || !d.identifiant || !d.motDePasse || action.enCours}
        onClick={() => void action.executer(() => api('POST', '/admin/utilisateurs', { ...d, tiersId: tiers!.id, fonctionId: d.fonctionId || undefined, telephone: d.telephone || undefined })).then(r => r && apres('Utilisateur créé. Attribuez-lui maintenant ses profils.'))}>Créer</button>
        <button className="bouton secondaire" onClick={fermer}>Annuler</button></div>
    </Modale>
  );
}
