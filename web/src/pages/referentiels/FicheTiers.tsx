/** RF-03 Fiche tiers et foyer (REF-RG-001 à 009, 014) ; coordonnées de paiement (REF-RG-005), pièces (REF-RG-006), blocages (§ 3.7). */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, date, dateHeure, ouvrirFichier } from '../../noyau/api';
import { Carte, Champ, Chargement, LienTiers, Message, MessageErreur, Modale, Onglets, Page, Statut, useAvis } from '../../noyau/composants';
import { useAction, useDonnees } from '../../noyau/donnees';
import { useSession } from '../../noyau/session';

interface Tiers {
  id: string; code_tiers: string; nature: string; nom: string; prenoms: string | null; date_naissance: string | null; sexe: string | null; type_piece: string | null;
  numero_piece: string | null; telephone: string | null; telephone_verifie: boolean; courriel: string | null; adresse: string | null; langue_notification: string;
  canal_prefere: string; rccm: string | null; nif: string | null; statut: string; version_ligne: number; pep: boolean | null;
}
interface Membre { id: string; lien: string; membre_id: string; code_tiers: string; nom: string; prenoms: string | null; date_naissance: string | null; categorie_enfant: string | null; parent_conjoint_id: string | null; justificatif_valide_jusqu_au: string | null }
interface Role { id: string; role: string; date_debut: string; date_fin: string | null; compte_auxiliaire: string | null; collectif: string | null }
type Onglet = 'IDENTITE' | 'FOYER' | 'ROLES' | 'COORDONNEES' | 'DOCUMENTS' | 'BLOCAGES' | 'HISTORIQUE';

const ROLES: Record<string, string> = {
  PROSPECT: 'Prospect', SOUSCRIPTEUR: 'Souscripteur', ASSURE: 'Assuré', AYANT_DROIT: 'Ayant droit', BENEFICIAIRE: 'Bénéficiaire', AGENT_GENERAL: 'Agent général',
  COLLABORATEUR: 'Collaborateur', JUNIOR: 'Junior', PRESCRIPTEUR: 'Prescripteur', PRESTATAIRE: 'Prestataire', PROFESSIONNEL_SANTE: 'Professionnel de santé',
  FOURNISSEUR: 'Fournisseur', EMPLOYE: 'Employé', DECLARANT: 'Déclarant', TIERS_RESPONSABLE: 'Tiers responsable',
};
const CATEGORIES: Record<string, string> = { A_CHARGE: 'À charge', ETUDIANT: 'Étudiant', HANDICAPE: 'Handicapé' };

export function PageFicheTiers() {
  const { id } = useParams();
  const { peut } = useSession();
  const tiers = useDonnees<Tiers & { roles: Role[] }>(`/tiers/${id}`);
  const roles = useDonnees<Role[]>(`/tiers/${id}/roles`);
  const [onglet, setOnglet] = useState<Onglet>('IDENTITE');
  const { avis, Avis } = useAvis();
  if (tiers.chargement && !tiers.donnees) return <Chargement />;
  if (!tiers.donnees) return <MessageErreur erreur={tiers.erreur} />;
  const t = tiers.donnees;
  const onglets: { code: Onglet; libelle: string }[] = [
    { code: 'IDENTITE', libelle: 'Identité' }, ...(t.nature === 'PHYSIQUE' ? [{ code: 'FOYER' as Onglet, libelle: 'Foyer' }] : []), { code: 'ROLES', libelle: 'Rôles' },
    { code: 'COORDONNEES', libelle: 'Coordonnées de paiement' }, { code: 'DOCUMENTS', libelle: 'Documents' },
    ...(peut('MOTIF_BLOCAGE:CREER') ? [{ code: 'BLOCAGES' as Onglet, libelle: 'Blocages' }] : []), ...(peut('AUDIT:CONSULTER') ? [{ code: 'HISTORIQUE' as Onglet, libelle: 'Historique' }] : []),
  ];
  const actif = roles.donnees?.filter(r => !r.date_fin) ?? [];

  return (
    <Page fil={[<Link key="t" to="/referentiels/tiers">Référentiels › Tiers</Link>, t.code_tiers]} titre={`${t.prenoms ?? ''} ${t.nom}`}>
      <Onglets onglets={onglets} actif={onglet} choisir={setOnglet} />
      <div className="grille cote">
        <div>
          {onglet === 'IDENTITE' && <Identite t={t} recharger={() => { avis('Fiche mise à jour.'); void tiers.recharger(); }} />}
          {onglet === 'FOYER' && <Foyer tiersId={t.id} avis={avis} />}
          {onglet === 'ROLES' && <Roles tiersId={t.id} roles={roles.donnees ?? []} recharger={() => void roles.recharger()} avis={avis} />}
          {onglet === 'COORDONNEES' && <Coordonnees t={t} avis={avis} />}
          {onglet === 'DOCUMENTS' && <Documents tiersId={t.id} avis={avis} />}
          {onglet === 'BLOCAGES' && <Blocages tiersId={t.id} avis={avis} />}
          {onglet === 'HISTORIQUE' && <Historique tiersId={t.id} />}
        </div>
        <Carte titre="Contrôles" repere={4}>
          <dl className="details" style={{ gridTemplateColumns: '130px 1fr' }}>
            <dt>Code</dt><dd className="code">{t.code_tiers}</dd>
            <dt>Nature</dt><dd>{t.nature === 'PHYSIQUE' ? 'Personne physique' : 'Personne morale'}</dd>
            <dt>Rôles</dt><dd>{actif.length ? actif.map(r => ROLES[r.role] ?? r.role).join(', ') : '—'}</dd>
            <dt>Comptes auxiliaires</dt><dd className="code">{actif.filter(r => r.compte_auxiliaire).map(r => r.compte_auxiliaire).join(', ') || '—'}</dd>
            <dt>Téléphone</dt><dd>{t.telephone ?? '—'} {t.telephone && <Statut couleur={t.telephone_verifie ? 'vert' : 'orange'}>{t.telephone_verifie ? 'Vérifié' : 'Non vérifié'}</Statut>}</dd>
            <dt>Canal préféré</dt><dd>{t.canal_prefere}</dd><dt>Langue</dt><dd>{t.langue_notification === 'fr' ? 'Français' : t.langue_notification}</dd>
            <dt>Statut</dt><dd><Statut valeur={t.statut} /></dd>
          </dl>
          {t.pep && <div style={{ marginTop: 12 }}><Message type="attention">Personne politiquement exposée : vigilance renforcée.</Message></div>}
        </Carte>
      </div>
      <Avis />
    </Page>
  );
}

function Identite({ t, recharger }: { t: Tiers; recharger: () => void }) {
  const { peut } = useSession();
  const [d, setD] = useState({ telephone: t.telephone ?? '', courriel: t.courriel ?? '', adresse: t.adresse ?? '', canal_prefere: t.canal_prefere, nif: t.nif ?? '' });
  const action = useAction();
  const modifiable = peut('TIERS:MODIFIER');
  return (
    <Carte titre="Identité" repere={1}>
      <dl className="details">
        <dt>{t.nature === 'PHYSIQUE' ? 'Nom et prénoms' : 'Raison sociale'}</dt><dd><b>{t.prenoms} {t.nom}</b> <span className="doux">(nature non modifiable)</span></dd>
        {t.date_naissance && <><dt>Date de naissance</dt><dd>{date(t.date_naissance)}</dd></>}
        {t.numero_piece && <><dt>Pièce</dt><dd>{t.type_piece} {t.numero_piece}</dd></>}
        {t.rccm && <><dt>RCCM</dt><dd>{t.rccm}</dd></>}
      </dl>
      <h3>Coordonnées</h3>
      <div className="formulaire" style={{ '--colonnes': 2 } as React.CSSProperties}>
        <Champ libelle="Téléphone"><input readOnly={!modifiable} value={d.telephone} onChange={e => setD({ ...d, telephone: e.target.value })} /></Champ>
        <Champ libelle="E-mail"><input readOnly={!modifiable} value={d.courriel} onChange={e => setD({ ...d, courriel: e.target.value })} /></Champ>
        <Champ libelle="Canal préféré"><select disabled={!modifiable} value={d.canal_prefere} onChange={e => setD({ ...d, canal_prefere: e.target.value })}>{['SMS', 'WHATSAPP', 'COURRIEL', 'APPLICATION', 'USSD', 'COURRIER'].map(c => <option key={c}>{c}</option>)}</select></Champ>
        <Champ libelle="NIF"><input readOnly={!modifiable} value={d.nif} onChange={e => setD({ ...d, nif: e.target.value })} /></Champ>
        <Champ libelle="Adresse" large><input readOnly={!modifiable} value={d.adresse} onChange={e => setD({ ...d, adresse: e.target.value })} /></Champ>
      </div>
      <MessageErreur erreur={action.erreur} />
      {modifiable && <div className="boutons"><button className="bouton" disabled={action.enCours}
        onClick={() => void action.executer(() => api('PATCH', `/tiers/${t.id}`, { version: t.version_ligne, ...Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v === '' ? undefined : v])) })).then(r => r && recharger())}>Enregistrer</button></div>}
    </Carte>
  );
}

function ChoixPersonne({ choisir }: { choisir: (t: { id: string; nom: string; prenoms: string | null }) => void }) {
  const [q, setQ] = useState('');
  const [r, setR] = useState<{ id: string; code_tiers: string; nom: string; prenoms: string | null; date_naissance: string | null }[]>([]);
  return <>
    <div className="filtres"><input placeholder="Rechercher la personne (nom, téléphone, code)" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && void api<typeof r>('GET', `/tiers?recherche=${encodeURIComponent(q)}`).then(setR)} />
      <button className="bouton secondaire" onClick={() => void api<typeof r>('GET', `/tiers?recherche=${encodeURIComponent(q)}`).then(setR)}>Rechercher</button>
      <Link to="/referentiels/tiers/nouveau" target="_blank">Créer sa fiche</Link></div>
    {r.length > 0 && <table className="tableau"><tbody>{r.map(x => <tr key={x.id} className="cliquable" onClick={() => choisir(x)}><td className="code">{x.code_tiers}</td><td>{x.prenoms} {x.nom}</td><td>{date(x.date_naissance)}</td></tr>)}</tbody></table>}
  </>;
}

function Foyer({ tiersId, avis }: { tiersId: string; avis: (m: string) => void }) {
  const { peut } = useSession();
  const membres = useDonnees<Membre[]>(`/tiers/${tiersId}/foyer`);
  const [ajout, setAjout] = useState<null | 'CONJOINT' | 'ENFANT'>(null);
  const [personne, setPersonne] = useState<{ id: string; nom: string; prenoms: string | null } | null>(null);
  const [d, setD] = useState({ parentConjointId: '', categorieEnfant: 'A_CHARGE' });
  const action = useAction();
  const conjoints = membres.donnees?.filter(m => m.lien === 'CONJOINT') ?? [];
  const aujourd = new Date();
  // Enfants atteignant 21 ans dans les 90 jours, sans autre catégorie : affichés en contrôle
  const proches = (membres.donnees ?? []).filter(m => m.lien === 'ENFANT' && m.categorie_enfant === 'A_CHARGE' && m.date_naissance).map(m => {
    const n = new Date(m.date_naissance!); const limite = new Date(Date.UTC(n.getUTCFullYear() + 21, n.getUTCMonth(), n.getUTCDate()));
    return { m, limite, jours: Math.ceil((limite.getTime() - aujourd.getTime()) / 86_400_000) };
  }).filter(x => x.jours <= 90);
  const fermer = () => { setAjout(null); setPersonne(null); action.setErreur(null); };

  return (
    <Carte titre="Foyer" repere={1} actions={peut('TIERS:MODIFIER') && <>
      <button className="bouton" onClick={() => setAjout('CONJOINT')}>+ Conjoint</button><button className="bouton" onClick={() => setAjout('ENFANT')}>+ Enfant</button></>}>
      {proches.map(x => <Message key={x.m.id} type="attention"><b>{x.m.prenoms}</b> atteint 21 ans le {x.limite.toLocaleDateString('fr-FR')} : sortie de la couverture à l'échéance suivante, sauf justificatif <span className="repere">2</span></Message>)}
      {membres.chargement ? <Chargement /> : membres.donnees?.length === 0 ? <div className="vide">Aucun membre déclaré.</div> :
        <table className="tableau"><thead><tr><th>Membre</th><th>Lien</th><th>Parent</th><th>Catégorie</th><th>Né(e) le</th></tr></thead>
          <tbody>{membres.donnees?.map(m => <tr key={m.id}><td><LienTiers id={m.membre_id}>{m.prenoms} {m.nom}</LienTiers></td>
            <td>{m.lien === 'CONJOINT' ? `Conjoint ${conjoints.indexOf(m) + 1}` : 'Enfant'}</td>
            <td>{membres.donnees?.find(c => c.membre_id === m.parent_conjoint_id)?.prenoms ?? '—'}</td>
            <td>{m.categorie_enfant ? `${CATEGORIES[m.categorie_enfant]}${m.justificatif_valide_jusqu_au ? ` (justificatif au ${date(m.justificatif_valide_jusqu_au)})` : ''}` : '—'}</td>
            <td>{date(m.date_naissance)}</td></tr>)}</tbody></table>}
      <Message><span className="repere">3</span> Quatre conjoints au plus ; une personne n'est conjoint que d'un seul assuré principal. Chaque enfant est rattaché à son parent : ce lien désigne le représentant légal.</Message>
      {ajout && <Modale titre={ajout === 'CONJOINT' ? 'Déclarer un conjoint' : 'Déclarer un enfant'} fermer={fermer}>
        {!personne ? <ChoixPersonne choisir={setPersonne} /> : <>
          <Message type="succes">Personne : <b>{personne.prenoms} {personne.nom}</b> <button className="lien" onClick={() => setPersonne(null)}>changer</button></Message>
          {ajout === 'ENFANT' && <div className="formulaire" style={{ '--colonnes': 2 } as React.CSSProperties}>
            <Champ libelle="Parent (conjoint)"><select value={d.parentConjointId} onChange={e => setD({ ...d, parentConjointId: e.target.value })}><option value="">Assuré principal seul</option>
              {conjoints.map(c => <option key={c.membre_id} value={c.membre_id}>{c.prenoms} {c.nom}</option>)}</select></Champ>
            <Champ libelle="Catégorie" aide="Étudiant et handicapé : justificatif à déposer dans Documents"><select value={d.categorieEnfant} onChange={e => setD({ ...d, categorieEnfant: e.target.value })}>
              {Object.entries(CATEGORIES).map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select></Champ>
          </div>}
        </>}
        <MessageErreur erreur={action.erreur} />
        <div className="boutons"><button className="bouton" disabled={!personne || action.enCours} onClick={() => void action.executer(() => api('POST', `/tiers/${tiersId}/foyer`, {
          membreId: personne!.id, lien: ajout, ...(ajout === 'ENFANT' ? { categorieEnfant: d.categorieEnfant, parentConjointId: d.parentConjointId || undefined } : {}),
        })).then(r => { if (r) { fermer(); avis('Membre déclaré.'); void membres.recharger(); } })}>Déclarer</button><button className="bouton secondaire" onClick={fermer}>Annuler</button></div>
      </Modale>}
    </Carte>
  );
}

function Roles({ tiersId, roles, recharger, avis }: { tiersId: string; roles: Role[]; recharger: () => void; avis: (m: string) => void }) {
  const { peut } = useSession();
  const [role, setRole] = useState('');
  const action = useAction();
  return (
    <Carte titre="Rôles">
      <table className="tableau"><thead><tr><th>Rôle</th><th>Depuis</th><th>Jusqu'au</th><th>Compte auxiliaire</th><th /></tr></thead>
        <tbody>{roles.map(r => <tr key={r.id}><td>{ROLES[r.role] ?? r.role}</td><td>{date(r.date_debut)}</td><td>{date(r.date_fin)}</td><td className="code">{r.compte_auxiliaire ? `${r.compte_auxiliaire} (collectif ${r.collectif?.replace(/0+$/, '')})` : '—'}</td>
          <td>{!r.date_fin && peut('TIERS:MODIFIER') && <button className="lien" onClick={() => { const m = prompt('Motif de la fin du rôle'); if (m?.trim()) void action.executer(() => api('POST', `/roles/${r.id}/fin`, { dateFin: new Date().toISOString().slice(0, 10), motif: m })).then(x => { if (x !== undefined) { avis('Rôle terminé.'); recharger(); } }); }}>Terminer</button>}</td></tr>)}</tbody></table>
      {peut('TIERS:MODIFIER') && <div className="boutons">
        <select value={role} onChange={e => setRole(e.target.value)} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #cfd6e3' }}><option value="">Attribuer un rôle…</option>{Object.entries(ROLES).map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select>
        <button className="bouton" disabled={!role || action.enCours} onClick={() => void action.executer(() => api<{ compteAuxiliaire: { code: string } | null }>('POST', `/tiers/${tiersId}/roles`, { role })).then(r => {
          if (r) { avis(r.compteAuxiliaire ? `Rôle attribué ; compte auxiliaire ${r.compteAuxiliaire.code} ouvert automatiquement.` : 'Rôle attribué.'); setRole(''); recharger(); }
        })}>Attribuer</button></div>}
      <MessageErreur erreur={action.erreur} />
      <Message>Un rôle à incidence comptable (souscripteur, agent, apporteur, prestataire, fournisseur) ouvre automatiquement le compte auxiliaire sous son collectif. Le compte d'un bénéficiaire n'est ouvert qu'à l'acceptation d'une indemnité.</Message>
    </Carte>
  );
}

function Coordonnees({ t, avis }: { t: Tiers; avis: (m: string) => void }) {
  const { peut } = useSession();
  const liste = useDonnees<{ id: string; type: string; etablissement: string; intitule: string; principale: boolean; statut: string; carence_jusqu_au: string | null; numeroMasque: string }[]>(`/tiers/${t.id}/coordonnees`);
  const [ajout, setAjout] = useState(false);
  const [d, setD] = useState({ type: 'MONNAIE_ELECTRONIQUE', etablissement: '', numero: '', intitule: `${t.prenoms ?? ''} ${t.nom}`.trim() });
  const [vu, setVu] = useState<Record<string, string>>({});
  const action = useAction();
  return (
    <Carte titre="Coordonnées de paiement" actions={peut('TIERS:MODIFIER') && <button className="bouton" onClick={() => setAjout(true)}>+ Ajouter</button>}>
      {liste.donnees?.length === 0 ? <div className="vide">Aucune coordonnée.</div> :
        <table className="tableau"><thead><tr><th>Type</th><th>Établissement</th><th>Numéro</th><th>Intitulé</th><th>Statut</th><th>Paiement possible</th></tr></thead>
          <tbody>{liste.donnees?.map(c => <tr key={c.id}><td>{c.type === 'BANQUE' ? 'Banque' : 'Monnaie électronique'}{c.principale && <> <Statut couleur="bleu">Principale</Statut></>}</td><td>{c.etablissement}</td>
            <td className="code">{vu[c.id] ?? c.numeroMasque} {!vu[c.id] && peut('JOURNAUX_TIERS:CREER') && <button className="lien" onClick={() => void api<{ numero: string }>('GET', `/coordonnees/${c.id}/numero`).then(r => setVu({ ...vu, [c.id]: r.numero }))}>afficher</button>}</td>
            <td>{c.intitule}</td><td><Statut valeur={c.statut} /></td>
            <td>{c.statut !== 'VERIFIEE' ? '—' : c.carence_jusqu_au && new Date(c.carence_jusqu_au) > new Date() ? <Statut couleur="orange">Après le {dateHeure(c.carence_jusqu_au)}</Statut> : <Statut couleur="vert">Oui</Statut>}</td></tr>)}</tbody></table>}
      <Message>Toute nouvelle coordonnée est validée par un second utilisateur habilité (comptabilité), signalée au titulaire par SMS, et n'est payable qu'après le délai de carence. Le numéro est chiffré ; son affichage est tracé.</Message>
      {ajout && <Modale titre="Nouvelle coordonnée de paiement" fermer={() => setAjout(false)}>
        <div className="formulaire" style={{ '--colonnes': 2 } as React.CSSProperties}>
          <Champ libelle="Type"><select value={d.type} onChange={e => setD({ ...d, type: e.target.value })}><option value="MONNAIE_ELECTRONIQUE">Monnaie électronique</option><option value="BANQUE">Compte bancaire</option></select></Champ>
          <Champ libelle={d.type === 'BANQUE' ? 'Banque' : 'Opérateur'}><input value={d.etablissement} onChange={e => setD({ ...d, etablissement: e.target.value })} placeholder={d.type === 'BANQUE' ? 'Ecobank, BICIGUI…' : 'Orange Money, MTN MoMo…'} /></Champ>
          <Champ libelle={d.type === 'BANQUE' ? 'Numéro de compte (RIB)' : 'Numéro de portefeuille'}><input value={d.numero} onChange={e => setD({ ...d, numero: e.target.value })} autoComplete="off" /></Champ>
          <Champ libelle="Intitulé du compte" aide="Doit être au nom du titulaire"><input value={d.intitule} onChange={e => setD({ ...d, intitule: e.target.value })} /></Champ>
        </div>
        <MessageErreur erreur={action.erreur} />
        <div className="boutons"><button className="bouton" disabled={!d.etablissement || !d.numero || action.enCours} onClick={() => void action.executer(() => api('POST', `/tiers/${t.id}/coordonnees`, { ...d, principale: true })).then(r => {
          if (r) { setAjout(false); avis('Coordonnée enregistrée : elle attend la validation d\'un second utilisateur.'); void liste.recharger(); }
        })}>Soumettre à validation</button><button className="bouton secondaire" onClick={() => setAjout(false)}>Annuler</button></div>
      </Modale>}
    </Carte>
  );
}

function Documents({ tiersId, avis }: { tiersId: string; avis: (m: string) => void }) {
  const { peut } = useSession();
  const liste = useDonnees<{ id: string; type_document: string; origine: string; horodatage_scellement: string; imprime: number; date_expiration: string | null; lisibilite_controlee: boolean | null; accepte: boolean; modele: string | null; modele_version: number | null }[]>(`/documents?objetType=tiers&objetId=${tiersId}`);
  const [type, setType] = useState('PIECE_IDENTITE');
  const [expiration, setExpiration] = useState('');
  const action = useAction();
  const deposer = async (f: File) => {
    const r = await action.executer(() => api('POST', `/pieces?objetType=tiers&objetId=${tiersId}&typeDocument=${type}${expiration ? `&dateExpiration=${expiration}` : ''}`, f));
    if (r) { avis('Pièce déposée et scellée.'); void liste.recharger(); }
  };
  return (
    <Carte titre="Documents et pièces">
      {liste.donnees?.length === 0 ? <div className="vide">Aucun document.</div> :
        <table className="tableau"><thead><tr><th>Type</th><th>Origine</th><th>Scellé le</th><th>Expiration</th><th>État</th><th /></tr></thead>
          <tbody>{liste.donnees?.map(d => <tr key={d.id}><td>{d.type_document.replace(/_/g, ' ').toLowerCase()}{d.modele && <span className="doux"> ({d.modele} v{d.modele_version})</span>}</td>
            <td>{d.origine === 'PRODUIT' ? 'Produit' : 'Déposé'}</td><td>{dateHeure(d.horodatage_scellement)}</td><td>{date(d.date_expiration)}</td>
            <td>{d.accepte ? <Statut couleur="vert">Accepté</Statut> : d.origine === 'DEPOSE' ? <Statut couleur={d.lisibilite_controlee ? 'vert' : 'orange'}>{d.lisibilite_controlee ? 'Lisible' : 'À contrôler'}</Statut> : null}
              {d.imprime > 0 && <span className="doux"> {d.imprime} copie(s)</span>}</td>
            <td><button className="lien" onClick={() => void ouvrirFichier('GET', `/documents/${d.id}/fichier`)}>Ouvrir</button>
              {d.origine === 'DEPOSE' && !d.lisibilite_controlee && peut('TIERS:MODIFIER') && <> · <button className="lien" onClick={() => void action.executer(() => api('POST', `/documents/${d.id}/lisibilite`, { lisible: true })).then(() => void liste.recharger())}>Lisible</button></>}</td></tr>)}</tbody></table>}
      {peut('TIERS:MODIFIER') && <div className="boutons">
        <select value={type} onChange={e => setType(e.target.value)} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #cfd6e3' }}>
          <option value="PIECE_IDENTITE">Pièce d'identité</option><option value="PHOTO">Photo</option><option value="JUSTIFICATIF_SCOLARITE">Justificatif de scolarité</option>
          <option value="JUSTIFICATIF_HANDICAP">Justificatif de handicap</option><option value="AUTRE">Autre</option></select>
        <label className="doux">Expiration <input type="date" value={expiration} onChange={e => setExpiration(e.target.value)} /></label>
        <label className="bouton secondaire">Déposer un fichier (PDF, JPEG, PNG – 10 Mo)<input type="file" hidden accept="application/pdf,image/jpeg,image/png" onChange={e => { const f = e.target.files?.[0]; if (f) void deposer(f); e.target.value = ''; }} /></label>
      </div>}
      <MessageErreur erreur={action.erreur} />
      <p className="doux" style={{ fontSize: 12 }}>L'original est le fichier scellé (empreinte et horodatage) ; une impression n'est qu'une copie, comptée.</p>
    </Carte>
  );
}

function Blocages({ tiersId, avis }: { tiersId: string; avis: (m: string) => void }) {
  const vue = useDonnees<{ bloque: boolean; historique: { id: string; code: string; libelle_assure: string; date_debut: string; date_fin: string | null; justification: string; depose_par: string | null; leve_par: string | null }[] }>(`/tiers/${tiersId}/blocages`);
  const motifs = useDonnees<{ code: string; libelle_assure: string; module_deposant: string; definitif: boolean; actif: boolean }[]>('/motifs-blocage');
  const [d, setD] = useState({ code: '', justification: '' });
  const action = useAction();
  useEffect(() => { action.setErreur(null); }, [d.code]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Carte titre="Motifs de blocage">
      {vue.donnees && (vue.donnees.bloque ? <Message type="erreur" titre="Bloqué">au moins un motif est actif : les cartes de la personne sont refusées.</Message> : <Message type="succes">Aucun motif actif.</Message>)}
      {vue.donnees?.historique.length ? <table className="tableau"><thead><tr><th>Motif</th><th>Déposé</th><th>Levé</th><th>Justification</th><th /></tr></thead>
        <tbody>{vue.donnees.historique.map(h => <tr key={h.id}><td>{h.code.replace(/_/g, ' ').toLowerCase()}</td><td>{dateHeure(h.date_debut)}<div className="doux">{h.depose_par ?? 'traitement planifié'}</div></td>
          <td>{h.date_fin ? <>{dateHeure(h.date_fin)}<div className="doux">{h.leve_par}</div></> : <Statut couleur="rouge">Actif</Statut>}</td><td>{h.justification}</td>
          <td>{!h.date_fin && !motifs.donnees?.find(m => m.code === h.code)?.definitif && <button className="lien" onClick={() => {
            const j = prompt('Justification de la levée'); if (j?.trim()) void action.executer(() => api('POST', `/blocages/${h.id}/levee`, { justification: j })).then(r => { if (r !== undefined) { avis('Motif levé.'); void vue.recharger(); } });
          }}>Lever</button>}</td></tr>)}</tbody></table> : null}
      <h3>Déposer un motif</h3>
      <div className="formulaire" style={{ '--colonnes': 2 } as React.CSSProperties}>
        <Champ libelle="Motif"><select value={d.code} onChange={e => setD({ ...d, code: e.target.value })}><option value="">—</option>{motifs.donnees?.filter(m => m.actif).map(m => <option key={m.code} value={m.code}>{m.code.replace(/_/g, ' ').toLowerCase()}</option>)}</select></Champ>
        <Champ libelle="Justification"><input value={d.justification} onChange={e => setD({ ...d, justification: e.target.value })} /></Champ>
      </div>
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton danger" disabled={!d.code || !d.justification.trim() || action.enCours} onClick={() => void action.executer(() => api('POST', `/tiers/${tiersId}/blocages`, d)).then(r => {
        if (r) { avis('Motif déposé.'); setD({ code: '', justification: '' }); void vue.recharger(); }
      })}>Déposer le motif</button></div>
    </Carte>
  );
}

function Historique({ tiersId }: { tiersId: string }) {
  const { donnees, chargement } = useDonnees<{ rang: number; horodatage: string; utilisateur: string | null; action: string }[]>(`/admin/audit?objetType=tiers&objetId=${tiersId}`);
  return <Carte titre="Historique de la fiche">{chargement ? <Chargement /> : <table className="tableau"><tbody>{donnees?.map(l => <tr key={l.rang}><td>{dateHeure(l.horodatage)}</td><td>{l.utilisateur ?? 'système'}</td><td>{l.action.toLowerCase()}</td></tr>)}</tbody></table>}</Carte>;
}
