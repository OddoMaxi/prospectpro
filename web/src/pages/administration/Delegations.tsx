/** AD-04 Délégations et intérims (ORG-RG-041, 043, 046). */
import { useMemo, useState } from 'react';
import { api, aujourdhui, date, dateHeure, montant } from '../../noyau/api';
import { Carte, Champ, Chargement, Message, MessageErreur, Modale, OPERATIONS, Page, useAvis } from '../../noyau/composants';
import { useAction, useDonnees } from '../../noyau/donnees';
import { useSession } from '../../noyau/session';

interface Delegation { type_operation: string; niveau: number; profil: string; seuil_min: number | null; seuil_max: number | null; date_effet: string }
interface Interim { id: string; delegant: string; delegataire: string; date_debut: string; date_fin: string; motif: string }

export function PageDelegations() {
  const { peut } = useSession();
  const delegations = useDonnees<Delegation[]>('/admin/delegations');
  const interims = useDonnees<Interim[]>('/admin/interims');
  const profils = useDonnees<{ profils: { id: string; code: string; libelle: string }[] }>(peut('UTILISATEURS:CONSULTER') ? '/admin/profils' : null);
  const [interim, setInterim] = useState(false);
  const [circuit, setCircuit] = useState<string | null>(null);
  const { avis, Avis } = useAvis();
  const libelle = (c: string) => profils.donnees?.profils.find(p => p.code === c)?.libelle ?? c;
  // Circuit en vigueur : la date d'effet la plus récente atteinte, par type d'opération
  const enVigueur = useMemo(() => {
    const m = new Map<string, Delegation[]>();
    for (const d of delegations.donnees ?? []) {
      if (d.date_effet > aujourdhui()) continue;
      const l = m.get(d.type_operation);
      if (!l || l[0]!.date_effet < d.date_effet) m.set(d.type_operation, [d]);
      else if (l[0]!.date_effet === d.date_effet) l.push(d);
    }
    return [...m.entries()].sort();
  }, [delegations.donnees]);

  return (
    <Page fil={['Administration', 'Délégations']} titre="Délégations et intérims">
      <Carte titre="Circuits de validation" repere={1}>
        {delegations.chargement ? <Chargement /> : <table className="tableau"><thead><tr><th>Opération</th><th>Niveau</th><th>Profils habilités</th><th>Seuils (GNF)</th><th>Depuis le</th><th /></tr></thead>
          <tbody>{enVigueur.flatMap(([type, l]) => [...new Set(l.map(x => x.niveau))].sort().map((n, i) => {
            const lignes = l.filter(x => x.niveau === n);
            return <tr key={`${type}${n}`}><td>{i === 0 && <b>{OPERATIONS[type] ?? type}</b>}</td><td>Niveau {n}</td><td>{lignes.map(x => libelle(x.profil)).join(', ')}</td>
              <td>{lignes[0]!.seuil_min !== null || lignes[0]!.seuil_max !== null ? `${montant(lignes[0]!.seuil_min ?? 0)} – ${lignes[0]!.seuil_max !== null ? montant(lignes[0]!.seuil_max) : '∞'}` : 'Tous montants'}</td>
              <td>{date(lignes[0]!.date_effet)}</td><td>{i === 0 && peut('DELEGATIONS:PARAMETRER') && <button className="lien" onClick={() => setCircuit(type)}>Modifier</button>}</td></tr>;
          }))}</tbody></table>}
        <p className="doux" style={{ fontSize: 12 }}>L'initiateur ne valide jamais sa propre opération ; un même valideur ne valide pas deux niveaux ; l'Administrateur général ne valide aucune opération métier ou financière.</p>
      </Carte>
      <Carte titre="Intérims en cours et à venir" repere={2} actions={peut('DELEGATIONS:CREER') && <button className="bouton" onClick={() => setInterim(true)}>+ Déclarer un intérim</button>}>
        {interims.donnees?.length === 0 ? <div className="vide">Aucun intérim.</div> :
          <table className="tableau"><thead><tr><th>Délégant</th><th>Délégataire</th><th>Du</th><th>Au</th><th>Motif</th></tr></thead>
            <tbody>{interims.donnees?.map(i => <tr key={i.id}><td>{i.delegant}</td><td>{i.delegataire}</td><td>{dateHeure(i.date_debut)}</td><td>{dateHeure(i.date_fin)}</td><td>{i.motif}</td></tr>)}</tbody></table>}
        <Message>L'intérim délègue vos droits de validation, pour une période, à un utilisateur de niveau au moins égal. Il s'arrête seul à sa date de fin.</Message>
      </Carte>
      {interim && <NouvelInterim fermer={() => setInterim(false)} apres={() => { setInterim(false); avis('Intérim enregistré.'); void interims.recharger(); }} />}
      {circuit && profils.donnees && <Circuit type={circuit} actuel={enVigueur.find(([t]) => t === circuit)?.[1] ?? []} profils={profils.donnees.profils} fermer={() => setCircuit(null)}
        apres={() => { setCircuit(null); avis('Nouveau circuit enregistré.'); void delegations.recharger(); }} />}
      <Avis />
    </Page>
  );
}

function NouvelInterim({ fermer, apres }: { fermer: () => void; apres: () => void }) {
  const { peut } = useSession();
  const utilisateurs = useDonnees<{ id: string; identifiant: string; nom: string; prenoms: string | null }[]>(peut('UTILISATEURS:CONSULTER') ? '/admin/utilisateurs?statut=ACTIF' : null);
  const [d, setD] = useState({ delegataireId: '', debut: `${aujourdhui()}T08:00`, fin: '', motif: '' });
  const action = useAction();
  return (
    <Modale titre="Déclarer un intérim" fermer={fermer}>
      <div className="formulaire" style={{ '--colonnes': 2 } as React.CSSProperties}>
        <Champ libelle="Délégataire" large><select value={d.delegataireId} onChange={e => setD({ ...d, delegataireId: e.target.value })}><option value="">—</option>
          {utilisateurs.donnees?.map(u => <option key={u.id} value={u.id}>{u.prenoms} {u.nom} ({u.identifiant})</option>)}</select></Champ>
        <Champ libelle="Début"><input type="datetime-local" value={d.debut} onChange={e => setD({ ...d, debut: e.target.value })} /></Champ>
        <Champ libelle="Fin"><input type="datetime-local" value={d.fin} onChange={e => setD({ ...d, fin: e.target.value })} /></Champ>
        <Champ libelle="Motif" large><input value={d.motif} onChange={e => setD({ ...d, motif: e.target.value })} placeholder="Congé annuel, mission…" /></Champ>
      </div>
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton" disabled={!d.delegataireId || !d.fin || !d.motif || action.enCours}
        onClick={() => void action.executer(() => api('POST', '/admin/interims', { ...d, debut: new Date(d.debut).toISOString(), fin: new Date(d.fin).toISOString() })).then(r => r && apres())}>Enregistrer</button>
        <button className="bouton secondaire" onClick={fermer}>Annuler</button></div>
    </Modale>
  );
}

function Circuit({ type, actuel, profils, fermer, apres }: { type: string; actuel: Delegation[]; profils: { id: string; code: string; libelle: string }[]; fermer: () => void; apres: () => void }) {
  const [niveaux, setNiveaux] = useState(actuel.length ? actuel.map(a => ({ niveau: a.niveau, profilId: profils.find(p => p.code === a.profil)?.id ?? '', seuilMin: a.seuil_min ?? undefined, seuilMax: a.seuil_max ?? undefined }))
    : [{ niveau: 1, profilId: '', seuilMin: undefined as number | undefined, seuilMax: undefined as number | undefined }]);
  const [dateEffet, setDateEffet] = useState(aujourdhui());
  const action = useAction();
  const maj = (i: number, champ: string, v: string) => setNiveaux(niveaux.map((n, j) => j === i ? { ...n, [champ]: champ === 'profilId' ? v : v === '' ? undefined : Number(v) } : n));
  return (
    <Modale titre={`Circuit : ${OPERATIONS[type] ?? type}`} large fermer={fermer}>
      <table className="tableau"><thead><tr><th>Niveau</th><th>Profil habilité</th><th>Seuil min (GNF)</th><th>Seuil max (GNF)</th><th /></tr></thead>
        <tbody>{niveaux.map((n, i) => <tr key={i}>
          <td><input type="number" min={1} value={n.niveau} onChange={e => maj(i, 'niveau', e.target.value)} style={{ width: 60 }} /></td>
          <td><select value={n.profilId} onChange={e => maj(i, 'profilId', e.target.value)}><option value="">—</option>{profils.map(p => <option key={p.id} value={p.id}>{p.libelle}</option>)}</select></td>
          <td><input type="number" value={n.seuilMin ?? ''} onChange={e => maj(i, 'seuilMin', e.target.value)} /></td>
          <td><input type="number" value={n.seuilMax ?? ''} onChange={e => maj(i, 'seuilMax', e.target.value)} /></td>
          <td><button className="lien" onClick={() => setNiveaux(niveaux.filter((_, j) => j !== i))}>Retirer</button></td></tr>)}</tbody></table>
      <div className="boutons"><button className="bouton secondaire petit" onClick={() => setNiveaux([...niveaux, { niveau: niveaux.length + 1, profilId: '', seuilMin: undefined, seuilMax: undefined }])}>+ Ligne</button></div>
      <div style={{ maxWidth: 260, marginTop: 12 }}><Champ libelle="Date d'effet"><input type="date" value={dateEffet} onChange={e => setDateEffet(e.target.value)} /></Champ></div>
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton" disabled={action.enCours || niveaux.some(n => !n.profilId)}
        onClick={() => void action.executer(() => api('PUT', `/admin/delegations/${type}`, { dateEffet, niveaux })).then(r => r !== undefined && apres())}>Enregistrer le circuit</button>
        <button className="bouton secondaire" onClick={fermer}>Annuler</button></div>
    </Modale>
  );
}
