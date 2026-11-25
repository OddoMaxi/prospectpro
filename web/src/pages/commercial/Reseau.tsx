/** CM-06 prescripteurs et codes, CM-08 cartes professionnelles, CM-05 mouvements de portefeuille ; vérification publique d'une carte. */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, aujourdhui, date, dateHeure, montant, ouvrirFichier } from '../../noyau/api';
import { Carte, Champ, Chargement, Message, MessageErreur, Modale, Page, Statut, useAvis } from '../../noyau/composants';
import { useAction, useDonnees } from '../../noyau/donnees';
import { useSession } from '../../noyau/session';
import type { Intervenant } from './Intervenants';
import { ROLES } from './Intervenants';

// ---------------------------------------------------------------- CM-06

interface Code { id: string; code: string; statut: string; valide_le: string | null; intervenant_id: string; prescripteur: string; polices: number }

export function PagePrescripteurs() {
  const { peut } = useSession();
  const codes = useDonnees<Code[]>('/codes-prescripteurs');
  const prescripteurs = useDonnees<Intervenant[]>('/intervenants?role=PRESCRIPTEUR');
  const [nouveau, setNouveau] = useState(false);
  const [statut, setStatut] = useState<{ code: Code; statut: 'SUSPENDU' | 'RETIRE' | 'ACTIF' } | null>(null);
  const { avis, Avis } = useAvis();
  return (
    <Page fil={['Commercial', 'Prescripteurs et codes']} titre="Prescripteurs et codes" actions={peut('AGREMENT:CREER') && <button className="bouton" onClick={() => setNouveau(true)}>+ Attribuer un code</button>}>
      <Carte titre="Codes prescripteurs" repere={1}>
        {codes.chargement ? <Chargement /> : !codes.donnees?.length ? <div className="vide">Aucun code.</div> :
          <table className="tableau"><thead><tr><th>Code</th><th>Prescripteur</th><th>Validé le</th><th className="nombre">Polices</th><th>Statut</th><th /></tr></thead>
            <tbody>{codes.donnees.map(c => <tr key={c.id}><td className="code">{c.code}</td><td>{c.prescripteur}</td><td>{date(c.valide_le)}</td><td className="nombre">{c.polices}</td>
              <td><Statut valeur={c.statut} /></td>
              <td>{peut('AGREMENT:CREER') && c.statut !== 'RETIRE' && <>{c.statut === 'ACTIF' ? <button className="lien" onClick={() => setStatut({ code: c, statut: 'SUSPENDU' })}>Suspendre</button>
                : <button className="lien" onClick={() => setStatut({ code: c, statut: 'ACTIF' })}>Réactiver</button>} · <button className="lien" onClick={() => setStatut({ code: c, statut: 'RETIRE' })}>Retirer</button></>}</td></tr>)}</tbody></table>}
      </Carte>
      <Message>Le code est choisi avec le prescripteur (4 à 20 caractères), normalisé, puis contrôlé : ni identique ni à un seul caractère d'un code existant ou retiré, ni l'inversion de deux voisins, ni un mot interdit ; O/0, I/L/1, S/5 et B/8 sont assimilés <span className="repere">2</span>. Un code n'est jamais réutilisé et ne donne aucune réduction.</Message>
      <Message type="attention">Le prescripteur n'émet ni n'encaisse : il ne voit que des statistiques anonymes de ses polices <span className="repere">3</span>.</Message>
      {nouveau && <NouveauCode prescripteurs={(prescripteurs.donnees ?? []).filter(p => p.statut === 'ACTIF')} fermer={() => setNouveau(false)} apres={m => { setNouveau(false); avis(m); void codes.recharger(); }} />}
      {statut && <ChangerStatutCode {...statut} fermer={() => setStatut(null)} apres={m => { setStatut(null); avis(m); void codes.recharger(); }} />}
      <Avis />
    </Page>
  );
}

function NouveauCode({ prescripteurs, fermer, apres }: { prescripteurs: Intervenant[]; fermer: () => void; apres: (m: string) => void }) {
  const [intervenantId, setIntervenant] = useState('');
  const [code, setCode] = useState('');
  const [dispo, setDispo] = useState<{ disponible: boolean; code?: string; motif?: string } | null>(null);
  const action = useAction();
  useEffect(() => {
    if (code.trim().length < 2) { setDispo(null); return; }
    const t = setTimeout(() => void api<typeof dispo>('GET', `/codes-prescripteurs/disponibilite?code=${encodeURIComponent(code)}`).then(setDispo).catch(() => setDispo(null)), 300);
    return () => clearTimeout(t);
  }, [code]);
  return (
    <Modale titre="Attribuer un code prescripteur" fermer={fermer}>
      <div className="formulaire">
        <Champ libelle="Prescripteur agréé" large><select value={intervenantId} onChange={e => setIntervenant(e.target.value)}><option value="">Choisir…</option>
          {prescripteurs.map(p => <option key={p.id} value={p.id}>{p.prenoms} {p.nom}</option>)}</select></Champ>
        <Champ libelle="Code choisi avec le prescripteur" large aide={dispo ? (dispo.disponible ? `Disponible : ${dispo.code}` : dispo.motif) : 'Nom d\'artiste en général'} erreur={dispo?.disponible === false}>
          <input value={code} onChange={e => setCode(e.target.value)} maxLength={40} /></Champ>
      </div>
      {!prescripteurs.length && <Message>Aucun prescripteur agréé : créez-le dans le registre des intervenants et faites valider son contrat.</Message>}
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton" disabled={!intervenantId || !dispo?.disponible || action.enCours}
        onClick={() => void action.executer(() => api<{ code: string }>('POST', `/intervenants/${intervenantId}/codes`, { code })).then(r => r && apres(`Code ${r.code} attribué.`))}>Attribuer</button></div>
    </Modale>
  );
}

function ChangerStatutCode({ code, statut, fermer, apres }: { code: Code; statut: 'SUSPENDU' | 'RETIRE' | 'ACTIF'; fermer: () => void; apres: (m: string) => void }) {
  const [motif, setMotif] = useState('');
  const action = useAction();
  const libelle = { SUSPENDU: 'Suspendre', RETIRE: 'Retirer définitivement', ACTIF: 'Réactiver' }[statut];
  return (
    <Modale titre={`${libelle} le code ${code.code}`} fermer={fermer}>
      {statut === 'RETIRE' && <Message type="attention">Un code retiré ne revient jamais en service et n'est jamais réattribué.</Message>}
      <Champ libelle="Motif" large><input value={motif} onChange={e => setMotif(e.target.value)} /></Champ>
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className={`bouton${statut === 'RETIRE' ? ' danger' : ''}`} disabled={!motif.trim() || action.enCours}
        onClick={() => void action.executer(() => api('POST', `/codes-prescripteurs/${code.id}/statut`, { statut, motif })).then(x => x !== undefined && apres(`Code ${code.code} : ${libelle.toLowerCase()}.`))}>{libelle}</button></div>
    </Modale>
  );
}

// ---------------------------------------------------------------- CM-08

interface CartePro { id: string; numero_serie: string; modele: string; statut: string; remise_le: string | null; cree_le: string; intervenant_id: string; role: string; porteur: string }
const STATUTS_CARTE: Record<string, [string, string]> = {
  DEMANDEE: ['Demandée', 'orange'], VALIDEE: ['Validée', 'bleu'], PRODUITE: ['Produite', 'bleu'], REMISE: ['Remise', 'vert'], BLOQUEE: ['Bloquée', 'rouge'], RETIREE: ['Retirée', 'gris'],
};
export const StatutCarte = ({ s }: { s: string }) => <Statut couleur={STATUTS_CARTE[s]?.[1]}>{STATUTS_CARTE[s]?.[0] ?? s}</Statut>;

export function PageCartesPro() {
  const { peut } = useSession();
  const [statut, setStatut] = useState('');
  const l = useDonnees<CartePro[]>(`/cartes-pro${statut ? `?statut=${statut}` : ''}`);
  const [remise, setRemise] = useState<CartePro | null>(null);
  const action = useAction();
  const { avis, Avis } = useAvis();
  const faire = (c: CartePro, chemin: string, m: string) => void action.executer(() => api('POST', `/cartes-pro/${c.id}/${chemin}`)).then(x => { if (x !== undefined) { avis(m); void l.recharger(); } });
  const pdf = async (c: CartePro) => { const d = await api<{ id: string }[]>('GET', `/documents?objetType=carte_professionnelle&objetId=${c.id}`); if (d[0]) await ouvrirFichier('GET', `/documents/${d[0].id}/fichier`); };
  return (
    <Page fil={['Commercial', 'Cartes professionnelles']} titre="Cartes professionnelles" actions={<select value={statut} onChange={e => setStatut(e.target.value)}><option value="">Tous les statuts</option>
      {Object.entries(STATUTS_CARTE).map(([c, [lib]]) => <option key={c} value={c}>{lib}</option>)}</select>}>
      <MessageErreur erreur={action.erreur} />
      <Carte titre="Cartes" repere={1}>
        {l.chargement ? <Chargement /> : !l.donnees?.length ? <div className="vide">Aucune carte.</div> :
          <table className="tableau"><thead><tr><th>N° de série</th><th>Porteur</th><th>Qualité</th><th>Modèle</th><th>Demandée le</th><th>Remise le</th><th>Statut</th><th /></tr></thead>
            <tbody>{l.donnees.map(c => <tr key={c.id}><td className="code">{c.numero_serie}</td><td>{c.porteur}</td><td>{ROLES[c.role] ?? c.role}</td>
              <td>{c.modele === 'AGENT_GENERAL' ? 'Agent général' : 'Apporteur d\'affaires'}</td><td>{date(c.cree_le)}</td><td>{dateHeure(c.remise_le)}</td><td><StatutCarte s={c.statut} /></td>
              <td>{c.statut === 'DEMANDEE' && peut('CARTE_PRO:VALIDER') && <button className="lien" onClick={() => faire(c, 'validation', `Carte ${c.numero_serie} validée.`)}>Valider</button>}
                {c.statut === 'VALIDEE' && peut('CARTE_PRO:CREER') && <button className="lien" onClick={() => faire(c, 'production', `Carte ${c.numero_serie} produite.`)}>Produire</button>}
                {c.statut === 'PRODUITE' && peut('CARTE_PRO:CREER') && <button className="lien" onClick={() => setRemise(c)}>Remettre</button>}
                {['PRODUITE', 'REMISE', 'BLOQUEE'].includes(c.statut) && <>{c.statut === 'PRODUITE' && peut('CARTE_PRO:CREER') ? ' · ' : ''}<button className="lien" onClick={() => void pdf(c)}>PDF</button></>}</td></tr>)}</tbody></table>}
      </Carte>
      <Message>Demande créée à l'activation de l'intervenant ; contrôle des pièces et validation par la Direction commerciale ; production avec un QR code révocable ; remise confirmée par le code reçu par le porteur <span className="repere">2</span>. La carte est bloquée à la suspension et retirée à la sortie <span className="repere">3</span>.</Message>
      {remise && <RemiseCarte c={remise} fermer={() => setRemise(null)} apres={() => { setRemise(null); avis(`Carte ${remise.numero_serie} remise.`); void l.recharger(); }} />}
      <Avis />
    </Page>
  );
}

function RemiseCarte({ c, fermer, apres }: { c: CartePro; fermer: () => void; apres: () => void }) {
  const [envoi, setEnvoi] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const action = useAction();
  return (
    <Modale titre={`Remise de la carte ${c.numero_serie}`} fermer={fermer}>
      <p>Porteur : <b>{c.porteur}</b>. Un code est envoyé sur son téléphone ; il le communique pour confirmer la réception.</p>
      {!envoi ? <button className="bouton" disabled={action.enCours} onClick={() => void action.executer(() => api<{ envoyeA: string }>('POST', `/cartes-pro/${c.id}/remise/code`)).then(r => r && setEnvoi(r.envoyeA))}>Envoyer le code au porteur</button>
        : <><p>Code envoyé au {envoi}.</p><Champ libelle="Code communiqué par le porteur"><input inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} /></Champ>
          <div className="boutons"><button className="bouton" disabled={code.length !== 6 || action.enCours} onClick={() => void action.executer(() => api('POST', `/cartes-pro/${c.id}/remise`, { code })).then(x => x && apres())}>Confirmer la remise</button></div></>}
      <MessageErreur erreur={action.erreur} />
    </Modale>
  );
}

// ---------------------------------------------------------------- CM-05

interface Mouvement { id: string; numero: string; type: string; statut: string; date_effet: string; motif: string; prix: number | null; polices: number; qualite: string; cas: string | null; cedant: string; cessionnaire: string }
export const TYPES_MOUVEMENT: Record<string, string> = { CESSION: 'Cession', TRANSFERT: 'Transfert des clients d\'un junior', REAFFECTATION: 'Réaffectation d\'office' };
export const CAS: Record<string, string> = { DEPART: 'Départ sans cession', SUSPENSION: 'Suspension', INACTIVITE: 'Inactivité prolongée', ACCORD_ECRIT: 'Accord écrit du junior' };

export function PageMouvementsPortefeuille() {
  const { peut } = useSession();
  const l = useDonnees<Mouvement[]>('/mouvements-portefeuille');
  const [nouveau, setNouveau] = useState(false);
  const { avis, Avis } = useAvis();
  return (
    <Page fil={['Commercial', 'Mouvements de portefeuille']} titre="Mouvements de portefeuille" actions={peut('AGREMENT:CREER') && <button className="bouton" onClick={() => setNouveau(true)}>+ Réaffecter un portefeuille</button>}>
      <Carte titre="Mouvements" repere={1}>
        {l.chargement ? <Chargement /> : !l.donnees?.length ? <div className="vide">Aucun mouvement.</div> :
          <table className="tableau"><thead><tr><th>N°</th><th>Type</th><th>Cédant</th><th>Cessionnaire</th><th className="nombre">Polices</th><th>Effet</th><th className="nombre">Prix</th><th>Motif</th><th>Statut</th></tr></thead>
            <tbody>{l.donnees.map(m => <tr key={m.id}><td className="code">{m.numero}</td><td>{TYPES_MOUVEMENT[m.type]}{m.cas ? <span className="doux"> · {CAS[m.cas]}</span> : ''}</td><td>{m.cedant}</td><td>{m.cessionnaire}</td>
              <td className="nombre">{m.polices}</td><td>{date(m.date_effet)}</td><td className="nombre">{montant(m.prix)}</td><td>{m.motif}</td><td><Statut valeur={m.statut} /></td></tr>)}</tbody></table>}
      </Carte>
      <Message>Cession entre agents généraux ; un junior ne cède qu'à l'intérieur de son réseau ; transfert des clients d'un junior seulement en cas de départ, suspension, inactivité ou accord écrit ; réaffectation d'office par la Direction commerciale <span className="repere">2</span>. Les mouvements se valident dans « Validations » ; les commissions acquises restent au cédant ; les numéros de police ne changent jamais ; chaque client est informé par SMS <span className="repere">3</span>.</Message>
      {nouveau && <NouveauMouvement fermer={() => setNouveau(false)} apres={m => { setNouveau(false); avis(m); void l.recharger(); }} />}
      <Avis />
    </Page>
  );
}

function NouveauMouvement({ fermer, apres }: { fermer: () => void; apres: (m: string) => void }) {
  const intervenants = useDonnees<Intervenant[]>('/intervenants');
  const [d, setD] = useState({ type: 'REAFFECTATION', cedantId: '', cessionnaireId: '', dateEffet: aujourdhui(), motif: '', prix: '' });
  const [choix, setChoix] = useState<Set<string> | null>(null);
  const pf = useDonnees<{ id: string; numero: string; qualite: string; souscripteur: string; produit: string; echeance: string }[]>(d.cedantId ? `/intervenants/${d.cedantId}/portefeuille` : null);
  const action = useAction();
  const tous = intervenants.donnees ?? [];
  const cessionnaires = tous.filter(i => i.statut === 'ACTIF' && i.id !== d.cedantId && (d.type === 'REAFFECTATION' ? ['AGENT_GENERAL', 'CANAL_DIGITAL'].includes(i.role) : i.role === 'AGENT_GENERAL'));
  const envoyer = () => void action.executer(() => api<{ numero: string; polices: number }>('POST', '/mouvements-portefeuille', {
    type: d.type, cedantId: d.cedantId, cessionnaireId: d.cessionnaireId, dateEffet: d.dateEffet, motif: d.motif, prix: d.prix ? Number(d.prix) : undefined, polices: choix ? [...choix] : undefined,
  })).then(r => r && apres(`Mouvement ${r.numero} (${r.polices} police(s)) soumis à validation.`));
  return (
    <Modale titre="Réaffectation ou cession de portefeuille" large fermer={fermer}>
      <div className="formulaire">
        <Champ libelle="Type"><select value={d.type} onChange={e => setD({ ...d, type: e.target.value, cessionnaireId: '' })}><option value="REAFFECTATION">Réaffectation d'office</option><option value="CESSION">Cession entre agents généraux</option></select></Champ>
        <Champ libelle="Cédant"><select value={d.cedantId} onChange={e => { setD({ ...d, cedantId: e.target.value }); setChoix(null); }}><option value="">Choisir…</option>
          {tous.filter(i => i.role === 'AGENT_GENERAL').map(i => <option key={i.id} value={i.id}>{i.prenoms} {i.nom} ({i.statut.toLowerCase()})</option>)}</select></Champ>
        <Champ libelle="Nouveau titulaire"><select value={d.cessionnaireId} onChange={e => setD({ ...d, cessionnaireId: e.target.value })}><option value="">Choisir…</option>
          {cessionnaires.map(i => <option key={i.id} value={i.id}>{i.prenoms} {i.nom} · {ROLES[i.role]}</option>)}</select></Champ>
        <Champ libelle="Date d'effet"><input type="date" value={d.dateEffet} onChange={e => setD({ ...d, dateEffet: e.target.value })} /></Champ>
        <Champ libelle="Prix (réglé entre les parties)" aide="Facultatif, simplement enregistré"><input type="number" min={0} value={d.prix} onChange={e => setD({ ...d, prix: e.target.value })} /></Champ>
        <Champ libelle="Motif" large><input value={d.motif} maxLength={300} onChange={e => setD({ ...d, motif: e.target.value })} /></Champ>
      </div>
      {d.cedantId && <>
        <h3>Périmètre</h3>
        <label className="ag-coche"><input type="checkbox" checked={!choix} onChange={e => setChoix(e.target.checked ? null : new Set())} /> Tout le portefeuille ({pf.donnees?.filter(p => p.qualite === 'TITULAIRE').length ?? '…'} police(s))</label>
        {choix && <table className="tableau"><tbody>{pf.donnees?.filter(p => p.qualite === 'TITULAIRE').map(p => <tr key={p.id}><td><input type="checkbox" checked={choix.has(p.id)}
          onChange={e => setChoix(s => { const n = new Set(s); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })} /></td><td className="code">{p.numero}</td><td>{p.souscripteur}</td><td>{p.produit}</td><td>{date(p.echeance)}</td></tr>)}</tbody></table>}
      </>}
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton" disabled={!d.cedantId || !d.cessionnaireId || !d.motif.trim() || (choix !== null && !choix.size) || action.enCours} onClick={envoyer}>Soumettre à validation</button></div>
    </Modale>
  );
}

// ---------------------------------------------------------------- vérification publique (COM-RG-104)

export function PageVerificationCarte() {
  const { jeton } = useParams();
  const [v, setV] = useState<{ trouvee: boolean; porteur?: string; qualite?: string; rattachement?: string | null; valide?: boolean; etat?: string; numero?: string; numeroInscription?: string | null } | null>(null);
  useEffect(() => { void fetch(`/api/public/cartes/${encodeURIComponent(jeton ?? '')}`).then(r => r.json()).then(setV).catch(() => setV({ trouvee: false })); }, [jeton]);
  return (
    <div className="ag-app"><main className="ag-contenu" style={{ paddingTop: 24 }}>
      <h1>Vérification d'une carte professionnelle</h1>
      {!v ? <Chargement /> : !v.trouvee ? <Message type="erreur">Carte inconnue : elle n'a pas été délivrée par la Compagnie.</Message> :
        <section className={`ag-carte ${v.valide ? 'ag-succes' : 'ag-refus'}`}>
          <b className="ag-gros">{v.valide ? 'Carte valide' : v.etat === 'RETIREE' ? 'Carte retirée' : 'Carte suspendue'}</b>
          <dl className="ag-details"><dt>Porteur</dt><dd>{v.porteur}</dd><dt>Qualité</dt><dd>{v.qualite}</dd>
            {v.rattachement && <><dt>Agit sous la responsabilité de</dt><dd>{v.rattachement}</dd></>}
            {v.numeroInscription && <><dt>N° d'inscription</dt><dd>{v.numeroInscription}</dd></>}
            <dt>N° de série</dt><dd>{v.numero}</dd></dl>
          {!v.valide && <p>Cette personne n'est pas, ou plus, habilitée à présenter les produits de la Compagnie.</p>}
        </section>}
    </main></div>
  );
}
