/** AD-03 Profils et droits : matrice fonctions × profils (annexe B), incompatibilités (ORG-RG-040, 042, 044). */
import { useMemo, useState } from 'react';
import { Carte, Chargement, Message, MessageErreur, Page, Statut } from '../../noyau/composants';
import { useDonnees } from '../../noyau/donnees';

interface Profil { id: string; code: string; libelle: string; externe: boolean; privilegie: boolean; droits: { fonction: string; action: string; niveau: number | null }[] }
const LETTRE: Record<string, string> = { CONSULTER: 'C', CREER: 'S', MODIFIER: 'S', PARAMETRER: 'P', EXPORTER: 'X' };

export function PageProfils() {
  const { donnees, erreur, chargement } = useDonnees<{ profils: Profil[]; incompatibilites: { a: string; b: string; motif: string }[] }>('/admin/profils');
  const [filtre, setFiltre] = useState('');
  const fonctions = useMemo(() => [...new Set((donnees?.profils ?? []).flatMap(p => p.droits.map(d => d.fonction)))].sort(), [donnees]);
  if (chargement) return <Chargement />;
  if (!donnees) return <MessageErreur erreur={erreur} />;
  const cellule = (p: Profil, f: string) => [...new Set(p.droits.filter(d => d.fonction === f).map(d => d.action === 'VALIDER' ? `V${d.niveau ?? ''}` : LETTRE[d.action]))].sort().join(' ');
  const libelle = (c: string) => donnees.profils.find(p => p.code === c)?.libelle ?? c;

  return (
    <Page fil={['Administration', 'Profils et droits']} titre="Profils et droits">
      <Message><span className="repere">1</span> Matrice fonctions × actions de l'annexe B : C consulter, S saisir, V1/V2 valider (niveau), P paramétrer, X exporter. Les droits sont contrôlés par le serveur à chaque appel ; le périmètre (bureaux, départements…) est fixé à l'attribution <span className="repere">2</span>.</Message>
      <Carte titre="Matrice des droits">
        <div className="filtres"><input placeholder="Filtrer les fonctions" value={filtre} onChange={e => setFiltre(e.target.value.toUpperCase())} /></div>
        <div className="defile" style={{ maxHeight: '65vh' }}><table className="tableau matrice">
          <thead><tr><th className="ligne">Fonction</th>{donnees.profils.map(p => <th key={p.id} title={p.libelle}>{p.libelle}</th>)}</tr></thead>
          <tbody>{fonctions.filter(f => f.includes(filtre)).map(f => <tr key={f}><td className="ligne code">{f}</td>{donnees.profils.map(p => <td key={p.id}>{cellule(p, f)}</td>)}</tr>)}</tbody>
        </table></div>
      </Carte>
      <div className="grille deux">
        <Carte titre="Profils" repere={3}>
          <table className="tableau"><tbody>{donnees.profils.map(p => <tr key={p.id}><td>{p.libelle}</td><td className="code doux">{p.code}</td>
            <td>{p.privilegie && <Statut couleur="orange">Privilégié</Statut>} {p.externe && <Statut couleur="bleu">Externe</Statut>}</td></tr>)}</tbody></table>
          <p className="doux" style={{ fontSize: 12 }}>Un profil privilégié (validation ou paramétrage) n'est actif qu'après la validation de son attribution par un second administrateur ; il impose l'application d'authentification.</p>
        </Carte>
        <Carte titre="Profils incompatibles (ORG-RG-042)">
          <table className="tableau"><thead><tr><th>Profil</th><th>Incompatible avec</th><th>Motif</th></tr></thead>
            <tbody>{donnees.incompatibilites.map((i, k) => <tr key={k}><td>{libelle(i.a)}</td><td>{libelle(i.b)}</td><td className="doux">{i.motif}</td></tr>)}</tbody></table>
        </Carte>
      </div>
    </Page>
  );
}
