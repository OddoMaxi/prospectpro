/** Consommation et soldes (SAN-RG-020 à 022, 027) : compteurs de la période de garantie, par personne. */
import { date, montant } from '../../noyau/api';
import { Carte, Chargement } from '../../noyau/composants';
import { useDonnees } from '../../noyau/donnees';

export interface Solde { niveau: 'GARANTIE' | 'PERSONNE' | 'FAMILLE'; garantie: string | null; plafond: number | null; consomme: number; reserve: number; disponible: number | null; actesMax: number | null; actes: number }
export interface SoldesPersonne { id: string; nom: string; police?: string; qualite?: string; periode: { date_debut: string; date_fin: string } | null; soldes: Solde[] }

const Jauge = ({ s }: { s: Solde }) => {
  const utilise = s.consomme + s.reserve;
  const part = s.plafond ? Math.min(100, Math.round(100 * utilise / s.plafond)) : 0;
  return (
    <div className="jauge-ligne">
      <div className="jauge-titre"><b>{s.niveau === 'PERSONNE' ? 'Plafond annuel' : s.niveau === 'FAMILLE' ? 'Plafond famille' : s.garantie}</b>
        <span>{s.plafond === null ? `${montant(utilise)} GNF consommés, sans plafond` : `${montant(s.disponible)} GNF disponibles sur ${montant(s.plafond)}`}</span></div>
      {s.plafond !== null && <div className="jauge"><div className={part >= 90 ? 'rouge' : part >= 70 ? 'orange' : ''} style={{ width: `${part}%` }} /></div>}
      <small className="doux">{s.reserve ? `dont ${montant(s.reserve)} réservés · ` : ''}{s.actesMax !== null ? `${s.actes} acte(s) sur ${s.actesMax}` : `${s.actes} acte(s)`}</small>
    </div>
  );
};

export function SoldesVue({ p }: { p: SoldesPersonne }) {
  return (
    <div className="soldes-personne">
      <h3>{p.nom}{p.police ? <small className="doux"> · police {p.police}</small> : null}</h3>
      {!p.periode ? <div className="vide">Aucune période de garantie en cours.</div> : <>
        <small className="doux">Période du {date(p.periode.date_debut)} au {date(p.periode.date_fin)}</small>
        {p.soldes.map((s, i) => <Jauge key={i} s={s} />)}
      </>}
    </div>
  );
}

export function ConsommationPolice({ policeId }: { policeId: string }) {
  const l = useDonnees<SoldesPersonne[]>(`/polices/${policeId}/soldes`);
  return (
    <Carte titre="Consommation et soldes">
      {!l.donnees ? <Chargement /> : !l.donnees.length ? <div className="vide">Aucune personne couverte.</div> : <div className="grille deux">{l.donnees.map(p => <SoldesVue key={p.id} p={p} />)}</div>}
      <p className="doux">Les compteurs portent sur l'année d'assurance : réservés à l'ouverture d'une prise en charge, consommés à sa validation. Les montants médicaux détaillés ne sont visibles que du médecin-conseil.</p>
    </Carte>
  );
}
