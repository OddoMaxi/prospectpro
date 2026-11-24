/** RF-01 Fiche de la Compagnie (REF-RG-010 à 013). */
import { useEffect, useState } from 'react';
import { api, aujourdhui, date, dateHeure } from '../../noyau/api';
import { Carte, Champ, Chargement, Message, MessageErreur, Modale, Page, useAvis } from '../../noyau/composants';
import { useAction, useDonnees } from '../../noyau/donnees';
import { useSession } from '../../noyau/session';

interface Fiche { fiche: Record<string, string>; manquants: string[]; champs: { code: string; libelle: string; obligatoire: boolean }[] }
interface Version { champ: string; ancienne_valeur: string | null; nouvelle_valeur: string; date_effet: string; cree_le: string; auteur: string; valideur: string }

const RUBRIQUES: { titre: string; champs: string[] }[] = [
  { titre: 'Identification', champs: ['raison_sociale', 'activite', 'forme_juridique', 'capital_social', 'numero_agrement', 'commentaire'] },
  { titre: 'Siège et télécommunication', champs: ['pays', 'region', 'commune', 'quartier', 'telephone', 'courriel', 'site_internet'] },
  { titre: 'Immatriculation', champs: ['rccm', 'nif', 'cle_tva', 'numero_cnss'] },
];
const FORMES = ['SA', 'SARL', 'SAS', 'Mutuelle', 'Société coopérative'];

export function PageCompagnie() {
  const { peut } = useSession();
  const modifiable = peut('SOCIETE:CREER');
  const { donnees, erreur, chargement, recharger } = useDonnees<Fiche>('/societe');
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const [dateEffet, setDateEffet] = useState(aujourdhui());
  const [motif, setMotif] = useState('');
  const [historique, setHistorique] = useState<Version[] | null>(null);
  const action = useAction();
  const { avis, Avis } = useAvis();

  useEffect(() => { if (donnees) setValeurs(donnees.fiche); }, [donnees]);
  if (chargement && !donnees) return <Chargement />;
  if (!donnees) return <MessageErreur erreur={erreur} />;

  const libelle = (c: string) => donnees.champs.find(x => x.code === c);
  const modifies = Object.fromEntries(Object.entries(valeurs).filter(([k, v]) => (donnees.fiche[k] ?? '') !== (v ?? '')));
  const premiereSaisie = Object.keys(donnees.fiche).length === 0;
  const soumettre = async () => {
    const r = await action.executer(() => api('POST', '/societe/modifications', { valeurs: modifies, dateEffet, motif }));
    if (r) { avis('Modification soumise à la validation de la DAF ou de la Direction générale.'); setMotif(''); void recharger(); }
  };

  return (
    <Page fil={['Administration', 'Référentiels', 'Compagnie']} titre="Fiche de la Compagnie">
      {donnees.manquants.length > 0 && <Message type="erreur" titre="Émission bloquée">
        <span className="repere">1</span> {donnees.manquants.join(', ')} non renseigné(s). Tant que les champs obligatoires manquent, aucune police ni écriture ne peut être produite.
      </Message>}
      {RUBRIQUES.map((r, i) => (
        <Carte key={r.titre} titre={r.titre} repere={i === 0 ? 2 : undefined}>
          <div className="formulaire" style={{ '--colonnes': 4 } as React.CSSProperties}>
            {r.champs.map(c => {
              const def = libelle(c);
              const manque = def?.obligatoire && !valeurs[c];
              return (
                <Champ key={c} libelle={`${def?.libelle ?? c}${c === 'capital_social' ? ' (GNF)' : ''}`} erreur={manque} aide={manque ? 'Obligatoire' : undefined} large={c === 'commentaire'}>
                  {c === 'forme_juridique'
                    ? <select disabled={!modifiable} value={valeurs[c] ?? ''} onChange={e => setValeurs({ ...valeurs, [c]: e.target.value })}><option value="">—</option>{FORMES.map(f => <option key={f}>{f}</option>)}</select>
                    : <input readOnly={!modifiable} inputMode={c === 'capital_social' ? 'numeric' : undefined} value={valeurs[c] ?? ''} onChange={e => setValeurs({ ...valeurs, [c]: e.target.value })} />}
                </Champ>
              );
            })}
          </div>
        </Carte>
      ))}
      <Carte titre="Exercice et monnaie">
        <div className="formulaire" style={{ '--colonnes': 4 } as React.CSSProperties}>
          <Champ libelle="Monnaie de tenue" aide="Figée dès la première écriture (FIN-RG-077)"><input readOnly value="Franc guinéen (GNF), 0 décimale" /></Champ>
          <Champ libelle="Exercice comptable" aide="Paramétré avec le module Comptabilité (lot 2)"><input readOnly value="01/01 – 31/12" /></Champ>
        </div>
      </Carte>
      {modifiable && <Carte titre="Soumettre une modification">
        <div className="formulaire">
          <Champ libelle={<>Date d'effet de la modification <span className="repere">2</span></>} aide="Les documents réimprimés portent les mentions en vigueur à leur date. Une modification ne peut pas être antidatée.">
            <input type="date" value={dateEffet} onChange={e => setDateEffet(e.target.value)} />
          </Champ>
          <Champ libelle="Motif" large><input value={motif} onChange={e => setMotif(e.target.value)} placeholder="Ex. augmentation de capital (PV de l'AG du …)" /></Champ>
        </div>
        {Object.keys(modifies).length > 0 && <Message>{Object.keys(modifies).length} champ(s) modifié(s) : {Object.keys(modifies).map(c => libelle(c)?.libelle ?? c).join(', ')}{premiereSaisie ? ' — première saisie : une date passée est admise.' : ''}</Message>}
        <MessageErreur erreur={action.erreur} />
        <div className="boutons">
          <button className="bouton" disabled={action.enCours || !Object.keys(modifies).length || !motif.trim()} onClick={() => void soumettre()}>Soumettre à validation (DAF ou DG)</button>
          <button className="bouton secondaire" onClick={() => void api<Version[]>('GET', '/societe/historique').then(setHistorique)}>Historique des versions</button>
          <span className="repere">3</span>
        </div>
      </Carte>}
      {!modifiable && <div className="boutons"><button className="bouton secondaire" onClick={() => void api<Version[]>('GET', '/societe/historique').then(setHistorique)}>Historique des versions</button></div>}
      {historique && <Modale titre="Historique des versions" large fermer={() => setHistorique(null)}>
        {historique.length === 0 ? <div className="vide">Aucune version enregistrée.</div> :
          <table className="tableau"><thead><tr><th>Champ</th><th>Ancienne valeur</th><th>Nouvelle valeur</th><th>Effet</th><th>Saisie</th><th>Auteur</th><th>Validée par</th></tr></thead>
            <tbody>{historique.map((h, i) => <tr key={i}><td>{libelle(h.champ)?.libelle ?? h.champ}</td><td>{h.ancienne_valeur ?? '—'}</td><td>{h.nouvelle_valeur || '(vide)'}</td>
              <td>{date(h.date_effet)}</td><td>{dateHeure(h.cree_le)}</td><td>{h.auteur}</td><td>{h.valideur}</td></tr>)}</tbody></table>}
      </Modale>}
      <Avis />
    </Page>
  );
}
