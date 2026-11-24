/** CM-02 Comptes de production (COM-RG-003, 020, 054 ; FIN-RG-041) : un compte par bureau, solde, seuil, relevé, contrôle du collectif. */
import { useState } from 'react';
import { api, dateHeure, montant } from '../../noyau/api';
import { Carte, Champ, Chargement, Indicateur, Message, MessageErreur, Modale, Page, Statut, useAvis } from '../../noyau/composants';
import { useAction, useDonnees } from '../../noyau/donnees';
import { useSession } from '../../noyau/session';

interface Compte { id: string; bureau: string; bureau_nom: string; statut: string; motif_gel: string | null; solde: number; seuil_alerte: number | null; compte_auxiliaire: string; agent: string; a_confirmer: number }
interface Detail extends Compte {
  montant_minimum: number; restitutionRecevableA: string | null;
  mouvements: { date_heure: string; nature: string; sens: string; montant: number; solde_apres: number; reference: string; numero_piece: string }[];
  approvisionnements: { id: string; numero_recu: string; moyen: string; montant: number; reference_externe: string | null; statut: string; confirme_le: string | null; motif_rejet: string | null; cree_le: string }[];
  restitutions: { id: string; date_heure_demande: string; motif: string; solde_fige: number; montant_restitue: number | null; statut: string }[];
}
const sousSeuil = (c: Compte) => c.seuil_alerte !== null && Number(c.solde) < Number(c.seuil_alerte);

export function PageComptesProduction() {
  const { peut } = useSession();
  const liste = useDonnees<Compte[]>('/comptes-production');
  const controle = useDonnees<{ metier: number; comptable: number; ecart: number }>(peut('JOURNAUX_TIERS:CONSULTER') ? '/comptes-production/controle' : null);
  const [choisi, setChoisi] = useState<string | null>(null);
  const { avis, Avis } = useAvis();
  const comptes = liste.donnees ?? [];
  const total = comptes.reduce((s, c) => s + Number(c.solde), 0);
  return (
    <Page fil={['Commercial', 'Comptes de production']} titre="Comptes de production">
      <div className="grille quatre" style={{ marginBottom: 18 }}>
        <Indicateur libelle="Comptes actifs" valeur={comptes.filter(c => c.statut === 'ACTIF').length} />
        <Indicateur libelle="Solde total (GNF)" valeur={montant(total)} />
        {controle.donnees ? <Indicateur libelle="Collectif (GNF)" valeur={montant(controle.donnees.comptable)} couleur={controle.donnees.ecart ? 'rouge' : 'vert'} detail={`Écart : ${montant(controle.donnees.ecart)}`} />
          : <Indicateur libelle="Approvisionnements à confirmer" valeur={comptes.reduce((s, c) => s + c.a_confirmer, 0)} />}
        <Indicateur libelle="Bureaux sous le seuil" valeur={comptes.filter(sousSeuil).length} couleur={comptes.some(sousSeuil) ? 'rouge' : undefined} detail="Alerte envoyée à l'agent" />
      </div>
      <Carte titre={`Comptes de production (${comptes.length})`} repere={1}>
        {liste.chargement ? <Chargement /> : !comptes.length ? <div className="vide">Aucun compte : il s'ouvre à la première affectation d'un agent général à un bureau.</div> :
          <table className="tableau"><thead><tr><th>Bureau</th><th>Agent général</th><th>Compte</th><th className="nombre">Solde (GNF)</th><th className="nombre">Seuil d'alerte</th><th>À confirmer</th><th>Statut</th></tr></thead>
            <tbody>{comptes.map(c => <tr key={c.id} className="cliquable" onClick={() => setChoisi(c.id)}>
              <td>{c.bureau} – {c.bureau_nom}</td><td>{c.agent}</td><td className="code">{c.compte_auxiliaire}</td>
              <td className="nombre" style={sousSeuil(c) ? { color: 'var(--rouge)' } : undefined}>{montant(c.solde)}</td><td className="nombre">{montant(c.seuil_alerte)}</td>
              <td>{c.a_confirmer || '—'}</td><td>{c.statut === 'GELE' ? <Statut couleur="orange">Gelé{c.motif_gel ? ` (${c.motif_gel.toLowerCase().replace(/_/g, ' ')})` : ''}</Statut> : <Statut valeur={c.statut} />}</td></tr>)}</tbody></table>}
      </Carte>
      <Message>Chaque bureau a son propre compte de production ; les comptes d'un même agent ne se compensent jamais <span className="repere">2</span>. Le contrôle « somme des comptes de production = collectif » est quotidien.</Message>
      {choisi && <FicheCompte id={choisi} fermer={() => setChoisi(null)} apres={m => { avis(m); void liste.recharger(); }} />}
      <Avis />
    </Page>
  );
}

function FicheCompte({ id, fermer, apres }: { id: string; fermer: () => void; apres: (m: string) => void }) {
  const { peut } = useSession();
  const c = useDonnees<Detail>(`/comptes-production/${id}`);
  const [seuil, setSeuil] = useState<string | null>(null);
  const action = useAction();
  if (!c.donnees) return <Modale titre="Compte de production" fermer={fermer}><Chargement /></Modale>;
  const d = c.donnees;
  const enregistrerSeuil = () => void action.executer(() => api('PUT', `/comptes-production/${id}/seuil-alerte`, { seuil: seuil === '' ? null : Number(seuil) }))
    .then(x => { if (x !== undefined) { setSeuil(null); void c.recharger(); apres('Seuil d\'alerte enregistré.'); } });
  return (
    <Modale titre={`Compte de production – bureau ${d.bureau}`} large fermer={fermer}>
      <dl className="details"><dt>Solde</dt><dd><b>{montant(d.solde)} GNF</b></dd><dt>Statut</dt><dd><Statut valeur={d.statut} /> {d.motif_gel}</dd>
        <dt>Seuil d'alerte</dt><dd>{seuil === null ? <>{montant(d.seuil_alerte)} {peut('COMPTE_PRODUCTION:CREER') && <button className="lien" onClick={() => setSeuil(String(d.seuil_alerte ?? ''))}>modifier</button>}</>
          : <span className="filtres" style={{ margin: 0 }}><input type="number" min={0} value={seuil} onChange={e => setSeuil(e.target.value)} placeholder="Aucun" /><button className="bouton petit" onClick={enregistrerSeuil}>Enregistrer</button></span>}</dd>
        <dt>Premier versement minimum</dt><dd>{montant(d.montant_minimum)} GNF</dd></dl>
      <MessageErreur erreur={action.erreur} />
      <h3>Relevé</h3>
      {!d.mouvements.length ? <div className="vide">Aucun mouvement.</div> :
        <table className="tableau"><thead><tr><th>Date</th><th>Nature</th><th>Référence</th><th>Pièce</th><th className="nombre">Débit</th><th className="nombre">Crédit</th><th className="nombre">Solde</th></tr></thead>
          <tbody>{d.mouvements.map((m, i) => <tr key={i}><td>{dateHeure(m.date_heure)}</td><td>{m.nature.toLowerCase().replace(/_/g, ' ')}</td><td>{m.reference}</td><td className="code">{m.numero_piece}</td>
            <td className="nombre">{m.sens === 'D' ? montant(m.montant) : ''}</td><td className="nombre">{m.sens === 'C' ? montant(m.montant) : ''}</td><td className="nombre">{montant(m.solde_apres)}</td></tr>)}</tbody></table>}
      <h3>Approvisionnements</h3>
      {!d.approvisionnements.length ? <div className="vide">Aucun approvisionnement.</div> :
        <table className="tableau"><thead><tr><th>Reçu</th><th>Moyen</th><th className="nombre">Montant</th><th>Référence</th><th>Déclaré le</th><th>Statut</th></tr></thead>
          <tbody>{d.approvisionnements.map(a => <tr key={a.id}><td className="code">{a.numero_recu}</td><td>{a.moyen.toLowerCase().replace(/_/g, ' ')}</td><td className="nombre">{montant(a.montant)}</td>
            <td>{a.reference_externe ?? '—'}</td><td>{dateHeure(a.cree_le)}</td><td><Statut valeur={a.statut} />{a.motif_rejet && <span className="doux"> {a.motif_rejet}</span>}</td></tr>)}</tbody></table>}
      {d.restitutions.length > 0 && <><h3>Restitutions</h3>
        <table className="tableau"><thead><tr><th>Demandée le</th><th>Motif</th><th className="nombre">Solde figé</th><th className="nombre">Restitué</th><th>Statut</th></tr></thead>
          <tbody>{d.restitutions.map(r => <tr key={r.id}><td>{dateHeure(r.date_heure_demande)}</td><td>{r.motif.toLowerCase().replace(/_/g, ' ')}</td><td className="nombre">{montant(r.solde_fige)}</td>
            <td className="nombre">{montant(r.montant_restitue)}</td><td><Statut valeur={r.statut} /></td></tr>)}</tbody></table></>}
      <Champ libelle=" "><span className="doux">La restitution se demande depuis l'application agent{d.restitutionRecevableA ? ` (recevable à partir du ${dateHeure(d.restitutionRecevableA)})` : ''}.</span></Champ>
    </Modale>
  );
}
