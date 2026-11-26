/** Cellule Canal digital (§ 7.5.10 ; PR-02) : corbeille des souscriptions en ligne, émission ou rejet avec remboursement. */
import { useState } from 'react';
import { api, date, dateHeure, montant } from '../../noyau/api';
import { Carte, Champ, Chargement, Indicateur, Message, MessageErreur, Modale, Page, Statut, useAvis } from '../../noyau/composants';
import { useAction, useDonnees } from '../../noyau/donnees';
import { useSession } from '../../noyau/session';

interface Ligne {
  id: string; numero_dossier: string; statut: string; etape_courante: number; prime_totale: number | null; cree_le: string; expire_le: string; motif_rejet: string | null;
  souscripteur: string; telephone: string | null; produit: string; formule: string; personnes: number; code_prescripteur: string | null; reference_externe: string | null;
  operateur: string | null; paye_le: string | null; police: string | null;
}
const STATUTS: Record<string, [string, string]> = {
  PAYE_A_EMETTRE: ['Payé, à émettre', 'orange'], BROUILLON: ['Saisie en cours', 'gris'], EMIS: ['Émis', 'vert'], REJETE: ['Rejeté, remboursé', 'rouge'], EXPIRE: ['Expiré', 'gris'],
};

export function PageCanalDigital() {
  const { peut } = useSession();
  const d = useDonnees<{ canal: { bureauId: string; code: string } | null; dossiers: Ligne[] }>('/canal-digital');
  const [filtre, setFiltre] = useState('PAYE_A_EMETTRE');
  const [rejet, setRejet] = useState<Ligne | null>(null);
  const action = useAction();
  const { avis, Avis } = useAvis();
  const lignes = (d.donnees?.dossiers ?? []).filter(x => !filtre || x.statut === filtre);
  const tous = d.donnees?.dossiers ?? [];
  return (
    <Page fil={['Commercial', 'Canal digital']} titre="Cellule Canal digital" actions={<a className="bouton secondaire" href="/souscrire" target="_blank" rel="noreferrer">Ouvrir le parcours client</a>}>
      {d.chargement ? <Chargement /> : !d.donnees?.canal ? <Installation peut={peut('SOUSCRIPTION_EN_LIGNE:VALIDER')} apres={() => { avis('Bureau Canal digital créé : la souscription en ligne est ouverte.'); void d.recharger(); }} /> : <>
        <div className="grille quatre">
          <Indicateur libelle="Payés, à émettre" valeur={tous.filter(x => x.statut === 'PAYE_A_EMETTRE').length} couleur="orange" detail={`${montant(tous.filter(x => x.statut === 'PAYE_A_EMETTRE').reduce((s, x) => s + Number(x.prime_totale), 0))} GNF en attente`} />
          <Indicateur libelle="Saisies en cours" valeur={tous.filter(x => x.statut === 'BROUILLON').length} detail="clients en ligne" />
          <Indicateur libelle="Émis" valeur={tous.filter(x => x.statut === 'EMIS').length} couleur="vert" />
          <Indicateur libelle="Bureau" valeur={d.donnees.canal.code} detail="code des polices en ligne" />
        </div>
        <div className="filtres"><select value={filtre} onChange={e => setFiltre(e.target.value)}><option value="">Tous les dossiers</option>{Object.entries(STATUTS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <MessageErreur erreur={action.erreur} />
        <Carte titre="Dossiers en ligne">
          {!lignes.length ? <div className="vide">Aucun dossier.</div> :
            <table className="tableau"><thead><tr><th>Dossier</th><th>Client</th><th>Formule</th><th>Pers.</th><th>Code</th><th className="nombre">Prime</th><th>Paiement</th><th>Statut</th><th /></tr></thead>
              <tbody>{lignes.map(x => <tr key={x.id}>
                <td className="code">{x.numero_dossier}</td><td>{x.souscripteur}<br /><small className="doux">{x.telephone}</small></td>
                <td>{x.produit}<br /><small className="doux">{x.formule}</small></td><td>{x.personnes}</td><td className="code">{x.code_prescripteur ?? '—'}</td><td className="nombre">{montant(x.prime_totale)}</td>
                <td>{x.paye_le ? <>{x.operateur} · <span className="code">{x.reference_externe}</span><br /><small className="doux">{dateHeure(x.paye_le)}</small></> : <small className="doux">étape {x.etape_courante} · expire le {date(x.expire_le)}</small>}</td>
                <td><Statut couleur={STATUTS[x.statut]?.[1]}>{STATUTS[x.statut]?.[0] ?? x.statut}</Statut>{x.police && <><br /><span className="code">{x.police}</span></>}{x.motif_rejet && <><br /><small className="doux">{x.motif_rejet}</small></>}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{x.statut === 'PAYE_A_EMETTRE' && peut('SOUSCRIPTION_EN_LIGNE:CREER') && <>
                  <button className="lien" disabled={action.enCours} onClick={() => void action.executer(() => api<{ numero: string }>('POST', `/canal-digital/dossiers/${x.id}/emission`))
                    .then(r => { if (r) { avis(`Police ${r.numero} émise ; le client est prévenu par SMS.`); void d.recharger(); } })}>Émettre</button>{' · '}
                  <button className="lien" onClick={() => setRejet(x)}>Rejeter</button></>}</td>
              </tr>)}</tbody></table>}
        </Carte>
        <Message>Contrôlez le dossier (pièces, identité, doublons) avant d'émettre : la prime payée est affectée à la police (EVT-03). Le rejet est motivé et rembourse automatiquement le client sur son portefeuille (EVT-24). Le titulaire d'un client déjà suivi par un agent reste cet agent (COM-RG-071).</Message>
      </>}
      {rejet && <Rejet l={rejet} fermer={() => setRejet(null)} apres={m => { setRejet(null); avis(m); void d.recharger(); }} />}
      <Avis />
    </Page>
  );
}

function Rejet({ l, fermer, apres }: { l: Ligne; fermer: () => void; apres: (m: string) => void }) {
  const [motif, setMotif] = useState('');
  const action = useAction();
  return (
    <Modale titre={`Rejeter le dossier ${l.numero_dossier}`} fermer={fermer}>
      <Message type="attention">Le client est remboursé automatiquement de {montant(l.prime_totale)} GNF sur son portefeuille {l.operateur} et prévenu par SMS du motif. Aucune police n'est émise.</Message>
      <div className="formulaire"><Champ libelle="Motif" large><textarea value={motif} onChange={e => setMotif(e.target.value)} placeholder="Ex. pièce d'identité illisible" /></Champ></div>
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton danger" disabled={!motif.trim() || action.enCours}
        onClick={() => void action.executer(() => api<{ rembourse: number }>('POST', `/canal-digital/dossiers/${l.id}/rejet`, { motif })).then(r => r && apres(`Dossier rejeté ; ${montant(r.rembourse)} GNF remboursés.`))}>Rejeter et rembourser</button></div>
    </Modale>
  );
}

function Installation({ peut, apres }: { peut: boolean; apres: () => void }) {
  const [v, setV] = useState({ code: '', nom: 'Canal digital', adresse: '' });
  const action = useAction();
  return (
    <Carte titre="Ouvrir la souscription en ligne">
      <Message>Le bureau Canal digital porte le code des polices souscrites en ligne ; il est géré par la cellule, sans compte de production (le client paie avant l'émission).</Message>
      {!peut ? <Message type="attention">La Direction commerciale crée ce bureau.</Message> : <>
        <div className="formulaire">
          <Champ libelle="Code bureau" aide="2 chiffres, jamais réutilisé ; vide = premier libre"><input value={v.code} onChange={e => setV({ ...v, code: e.target.value.replace(/\D/g, '').slice(0, 2) })} /></Champ>
          <Champ libelle="Nom"><input value={v.nom} onChange={e => setV({ ...v, nom: e.target.value })} /></Champ>
          <Champ libelle="Adresse"><input value={v.adresse} onChange={e => setV({ ...v, adresse: e.target.value })} /></Champ>
        </div>
        <MessageErreur erreur={action.erreur} />
        <div className="boutons"><button className="bouton" disabled={!v.nom.trim() || !v.adresse.trim() || action.enCours}
          onClick={() => void action.executer(() => api('POST', '/canal-digital', { ...v, code: v.code || undefined })).then(r => r && apres())}>Créer le bureau et la cellule</button></div>
      </>}
    </Carte>
  );
}
