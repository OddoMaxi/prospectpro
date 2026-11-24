/** RF-05 Paramètres et règles légales (ARC-RG-003, ARC-RG-020, annexe C). */
import { useState } from 'react';
import { api, aujourdhui, date, dateHeure } from '../../noyau/api';
import { Carte, Champ, Chargement, Message, MessageErreur, Modale, Page, Statut, useAvis } from '../../noyau/composants';
import { useAction, useDonnees } from '../../noyau/donnees';
import { useSession } from '../../noyau/session';

interface Parametre {
  code: string; libelle: string; module: string; type_valeur: string; valeur: string; valeur_defaut: string; date_effet: string;
  sens_protecteur: 'HAUSSE' | 'BAISSE' | null; regle: string | null; texte_reference: string | null; verrouillee: boolean | null;
}
const MODULES: Record<string, string> = { ADM: 'Administration', REF: 'Référentiels', COM: 'Commercial', PRD: 'Production', SAN: 'Santé', SIN: 'Sinistres', FIN: 'Finances', CNF: 'Conformité', ETA: 'États' };

export function PageParametres() {
  const { peut } = useSession();
  const { donnees, erreur, chargement, recharger } = useDonnees<Parametre[]>('/admin/parametres');
  const [module, setModule] = useState('');
  const [legales, setLegales] = useState(false);
  const [texte, setTexte] = useState('');
  const [choisi, setChoisi] = useState<Parametre | null>(null);
  const { avis, Avis } = useAvis();
  const lignes = (donnees ?? []).filter(p => (!module || p.module === module) && (!legales || p.regle) && (!texte || `${p.code} ${p.libelle}`.toLowerCase().includes(texte.toLowerCase())));

  return (
    <Page fil={['Administration', 'Paramètres et règles']} titre="Paramètres et règles légales">
      <div className="filtres">
        <span className="repere">1</span>
        <select value={module} onChange={e => setModule(e.target.value)}><option value="">Tous les modules</option>{Object.entries(MODULES).map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select>
        <label><input type="checkbox" checked={legales} onChange={e => setLegales(e.target.checked)} /> Seulement les règles issues d'un texte</label>
        <input placeholder="Rechercher" value={texte} onChange={e => setTexte(e.target.value)} />
      </div>
      <Carte>
        <MessageErreur erreur={erreur} />
        {chargement ? <Chargement /> : <table className="tableau"><thead><tr><th>Paramètre</th><th>Module</th><th className="nombre">Valeur</th><th className="nombre">Défaut</th><th>Depuis</th><th>Référence légale <span className="repere">2</span></th></tr></thead>
          <tbody>{lignes.map(p => <tr key={p.code} className="cliquable" onClick={() => setChoisi(p)}>
            <td>{p.libelle}<div className="doux code">{p.code}</div></td><td>{MODULES[p.module] ?? p.module}</td><td className="nombre"><b>{p.valeur}</b></td><td className="nombre doux">{p.valeur_defaut}</td>
            <td>{date(p.date_effet)}</td><td>{p.texte_reference ?? '—'} {p.verrouillee && <Statut couleur="rouge">Verrouillée</Statut>}</td></tr>)}</tbody></table>}
      </Carte>
      <Message><span className="repere">3</span> Les règles d'ordre public sont verrouillées : toujours bloquantes, leur valeur ne peut évoluer que dans un sens plus protecteur pour l'assuré. Tout changement est soumis au comité de paramétrage, avec le visa de la Conformité pour une règle légale.</Message>
      {choisi && <Fiche p={choisi} proposer={peut('PARAMETRES:CREER')} fermer={() => setChoisi(null)} apres={() => { setChoisi(null); avis('Changement soumis au comité de paramétrage.'); void recharger(); }} />}
      <Avis />
    </Page>
  );
}

function Fiche({ p, proposer, fermer, apres }: { p: Parametre; proposer: boolean; fermer: () => void; apres: () => void }) {
  const historique = useDonnees<{ ancienne_valeur: string | null; nouvelle_valeur: string; date_effet: string; cree_le: string; auteur: string | null }[]>(`/admin/parametres/${p.code}/historique`);
  const [d, setD] = useState({ valeur: p.valeur, dateEffet: aujourdhui(), motif: '' });
  const action = useAction();
  return (
    <Modale titre={p.libelle} large fermer={fermer}>
      <dl className="details"><dt>Code</dt><dd className="code">{p.code}</dd><dt>Valeur en vigueur</dt><dd><b>{p.valeur}</b> (défaut : {p.valeur_defaut})</dd>
        {p.texte_reference && <><dt>Référence</dt><dd>{p.texte_reference} {p.verrouillee && <Statut couleur="rouge">Verrouillée</Statut>}</dd></>}
        {p.sens_protecteur && <><dt>Sens protecteur</dt><dd>{p.sens_protecteur === 'HAUSSE' ? 'Hausse seulement (au-dessus de la valeur légale)' : 'Baisse seulement'}</dd></>}</dl>
      <h3>Historique</h3>
      {historique.chargement ? <Chargement /> : historique.donnees?.length ? <table className="tableau"><thead><tr><th>Effet</th><th>Ancienne</th><th>Nouvelle</th><th>Saisi le</th><th>Auteur</th></tr></thead>
        <tbody>{historique.donnees.map((h, i) => <tr key={i}><td>{date(h.date_effet)}</td><td>{h.ancienne_valeur ?? '—'}</td><td>{h.nouvelle_valeur}</td><td>{dateHeure(h.cree_le)}</td><td>{h.auteur ?? 'installation'}</td></tr>)}</tbody></table> : <div className="vide">Valeur d'installation, jamais modifiée.</div>}
      {proposer && <>
        <h3>Proposer un changement</h3>
        <div className="formulaire">
          <Champ libelle="Nouvelle valeur" aide={p.type_valeur === 'BOOLEEN' ? 'OUI ou NON' : p.type_valeur === 'TAUX' ? 'Ex. 0.05 pour 5 %' : p.type_valeur}><input value={d.valeur} onChange={e => setD({ ...d, valeur: e.target.value })} /></Champ>
          <Champ libelle="Date d'effet"><input type="date" value={d.dateEffet} onChange={e => setD({ ...d, dateEffet: e.target.value })} /></Champ>
          <Champ libelle="Motif"><input value={d.motif} onChange={e => setD({ ...d, motif: e.target.value })} /></Champ>
        </div>
        <MessageErreur erreur={action.erreur} />
        <div className="boutons"><button className="bouton" disabled={action.enCours || !d.motif.trim() || d.valeur === p.valeur}
          onClick={() => void action.executer(() => api('POST', `/admin/parametres/${p.code}/changements`, d)).then(r => r && apres())}>Soumettre au comité</button></div>
      </>}
    </Modale>
  );
}
