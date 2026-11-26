/**
 * Portail des prestataires (§ 9.4.1, 9.14). Sous-lot 3.1 : l'administrateur du prestataire gère les professionnels de
 * sa structure (création du compte nominatif, activation, désactivation) et consulte le journal de la structure.
 * Les écrans des professionnels (vérification, prise en charge, carnet, factures) s'y ajoutent aux sous-lots suivants.
 */
import { useState } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { api, dateHeure } from '../noyau/api';
import { Carte, Champ, Chargement, Message, MessageErreur, Modale, useAvis } from '../noyau/composants';
import { useAction, useDonnees } from '../noyau/donnees';
import { useSession } from '../noyau/session';
import { CompteStatut, JournalStructure, PROFESSIONS } from '../pages/sante/Prestataires';

interface Structure {
  id: string; code: string; nom: string; type: string; typeLibelle: string; professions: string[];
  professionnels: { exercice_id: string; nom: string; profession: string; specialite: string | null; numero_ordre: string; agree_le: string | null; statut_professionnel: string; identifiant: string; statut_compte: string; actif: boolean; derniere_connexion: string | null }[];
}

export function PortailPrestataire() {
  const { moi, peut, fermer } = useSession();
  const aller = useNavigate();
  if (!moi) return <Navigate to="/connexion" replace />;
  const admin = peut('MA_STRUCTURE:CONSULTER');
  return (
    <div className="pp-app">
      <header className="pp-entete">
        <div><b>Portail des prestataires</b><small>Prospect Pro</small></div>
        <nav>{admin && <><NavLink to="/prestataire" end>Professionnels</NavLink><NavLink to="/prestataire/journal">Journal</NavLink></>}</nav>
        <div className="pp-moi"><span>{moi.prenoms} {moi.nom}</span><button className="lien" onClick={() => void fermer().then(() => aller('/connexion'))}>Se déconnecter</button></div>
      </header>
      <main className="pp-contenu">
        {admin ? <Routes>
          <Route index element={<MesProfessionnels />} />
          <Route path="journal" element={<JournalStructure url="/portail/journal" />} />
          <Route path="*" element={<Navigate to="/prestataire" replace />} />
        </Routes> : <Message>Votre compte de professionnel de santé est actif. La vérification des droits et la prise en charge des assurés ouvrent avec le module des prises en charge.</Message>}
      </main>
    </div>
  );
}

function MesProfessionnels() {
  const s = useDonnees<Structure>('/portail/structure');
  const [nouveau, setNouveau] = useState(false);
  const [bascule, setBascule] = useState<Structure['professionnels'][number] | null>(null);
  const { avis, Avis } = useAvis();
  if (s.erreur) return <MessageErreur erreur={s.erreur} />;
  if (!s.donnees) return <Chargement />;
  const x = s.donnees;
  return (<>
    <div className="pp-titre"><h1>{x.nom}</h1><span className="doux">{x.typeLibelle} · {x.code}</span>
      <button className="bouton" onClick={() => setNouveau(true)}>+ {x.type === 'PHARMACIE' ? 'Pharmacien' : 'Professionnel'}</button></div>
    <Carte titre={x.type === 'PHARMACIE' ? 'Mes pharmaciens' : 'Mes professionnels'}>
      {!x.professionnels.length ? <div className="vide">Aucun professionnel : créez un compte nominatif pour chacun (aucun compte partagé).</div> :
        <table className="tableau"><thead><tr><th>Nom</th><th>Profession</th><th>N° d'ordre</th><th>Identifiant</th><th>Compte</th><th>Dernière connexion</th><th /></tr></thead>
          <tbody>{x.professionnels.map(p => <tr key={p.exercice_id}><td>{p.nom}</td><td>{PROFESSIONS[p.profession] ?? p.profession}{p.specialite ? ` · ${p.specialite}` : ''}</td><td className="code">{p.numero_ordre}</td>
            <td className="code">{p.identifiant}</td><td><CompteStatut s={p.statut_compte} />{!p.agree_le && <><br /><small className="doux">agrément en cours à la Compagnie</small></>}</td><td>{dateHeure(p.derniere_connexion)}</td>
            <td>{p.agree_le && p.statut_professionnel === 'ACTIF' && <button className="lien" onClick={() => setBascule(p)}>{p.statut_compte === 'ACTIF' ? 'Désactiver' : 'Activer'}</button>}</td></tr>)}</tbody></table>}
    </Carte>
    <Message>Les profils et leurs droits sont fixés par la Compagnie selon la profession et le type de structure ; vous ne pouvez pas les modifier. Un compte n'est actif qu'après l'agrément du professionnel par la Compagnie. La désactivation est immédiate et ferme ses sessions.</Message>
    {nouveau && <NouveauProfessionnel professions={x.professions} fermer={() => setNouveau(false)} apres={m => { setNouveau(false); avis(m); void s.recharger(); }} />}
    {bascule && <Bascule p={bascule} fermer={() => setBascule(null)} apres={m => { setBascule(null); avis(m); void s.recharger(); }} />}
    <Avis />
  </>);
}

function Piece({ libelle, typeDocument, depose }: { libelle: string; typeDocument: 'DIPLOME' | 'PIECE_IDENTITE'; depose: (id: string) => void }) {
  const [nom, setNom] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  return (<div>
    <label className="bouton secondaire petit">{nom ? `${nom} ✓` : libelle}<input type="file" hidden accept="application/pdf,image/jpeg,image/png" onChange={e => {
      const f = e.target.files?.[0]; e.target.value = '';
      if (f) void api<{ id: string }>('POST', `/portail/pieces?typeDocument=${typeDocument}`, f).then(r => { setNom(f.name); setErreur(null); depose(r.id); }).catch(x => setErreur((x as Error).message));
    }} /></label>{erreur && <div className="doux" style={{ color: 'var(--rouge)' }}>{erreur}</div>}</div>);
}

function NouveauProfessionnel({ professions, fermer, apres }: { professions: string[]; fermer: () => void; apres: (m: string) => void }) {
  const [v, setV] = useState({ nom: '', prenoms: '', telephone: '+224 ', courriel: '', typePiece: 'CNI', numeroPiece: '', profession: professions[0] ?? '', specialite: '', numeroOrdre: '', identifiant: '', motDePasse: '' });
  const [diplome, setDiplome] = useState<string | null>(null);
  const [piece, setPiece] = useState<string | null>(null);
  const action = useAction();
  const champ = (k: keyof typeof v, libelle: string, type = 'text') => <Champ libelle={libelle}><input type={type} value={v[k]} onChange={e => setV({ ...v, [k]: e.target.value })} /></Champ>;
  return (
    <Modale titre="Nouveau professionnel" large fermer={fermer}>
      <div className="formulaire">
        {champ('nom', 'Nom')}{champ('prenoms', 'Prénoms')}{champ('telephone', 'Téléphone (second facteur)')}{champ('courriel', 'Courriel')}
        <Champ libelle="Profession"><select value={v.profession} onChange={e => setV({ ...v, profession: e.target.value })}>{professions.map(p => <option key={p} value={p}>{PROFESSIONS[p] ?? p}</option>)}</select></Champ>
        {champ('specialite', 'Spécialité')}{champ('numeroOrdre', 'N° d\'inscription à l\'ordre')}
        <Champ libelle="Pièce d'identité"><select value={v.typePiece} onChange={e => setV({ ...v, typePiece: e.target.value })}><option value="CNI">Carte d'identité</option><option value="PASSEPORT">Passeport</option></select></Champ>
        {champ('numeroPiece', 'N° de la pièce')}
        <Champ libelle="Diplôme" aide="Obligatoire"><Piece libelle="Joindre le diplôme" typeDocument="DIPLOME" depose={setDiplome} /></Champ>
        <Champ libelle="Pièce d'identité" aide="Obligatoire"><Piece libelle="Joindre la pièce" typeDocument="PIECE_IDENTITE" depose={setPiece} /></Champ>
        {champ('identifiant', 'Identifiant de connexion')}{champ('motDePasse', 'Mot de passe initial', 'password')}
      </div>
      <Message>Le compte est créé au nom du professionnel ; il est activé dès que la Compagnie a vérifié son identité, son diplôme et son numéro d'ordre. Un professionnel déjà agréé dans une autre structure est actif immédiatement.</Message>
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton" disabled={!v.nom || !v.prenoms || !v.numeroOrdre || !v.numeroPiece || !diplome || !piece || v.identifiant.length < 3 || v.motDePasse.length < 8 || action.enCours}
        onClick={() => void action.executer(() => api<{ actif: boolean }>('POST', '/portail/professionnels', { ...v, courriel: v.courriel || undefined, specialite: v.specialite || undefined, diplomeDocumentId: diplome, pieceDocumentId: piece }))
          .then(r => r && apres(r.actif ? 'Compte créé et actif.' : 'Compte créé : il sera actif après l\'agrément du professionnel par la Compagnie.'))}>Créer le compte</button></div>
    </Modale>
  );
}

function Bascule({ p, fermer, apres }: { p: Structure['professionnels'][number]; fermer: () => void; apres: (m: string) => void }) {
  const actif = p.statut_compte !== 'ACTIF';
  const [motif, setMotif] = useState('');
  const action = useAction();
  return (
    <Modale titre={`${actif ? 'Activer' : 'Désactiver'} ${p.nom}`} fermer={fermer}>
      {!actif && <Message type="attention">La désactivation est immédiate : ses sessions ouvertes sont fermées.</Message>}
      <div className="formulaire"><Champ libelle="Motif" large><input value={motif} onChange={e => setMotif(e.target.value)} /></Champ></div>
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className={`bouton${actif ? '' : ' danger'}`} disabled={!motif.trim() || action.enCours}
        onClick={() => void action.executer(() => api('POST', `/portail/professionnels/${p.exercice_id}/activation`, { actif, motif })).then(r => r !== undefined && apres(actif ? 'Compte activé.' : 'Compte désactivé.'))}>Confirmer</button></div>
    </Modale>
  );
}

