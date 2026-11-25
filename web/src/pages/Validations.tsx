/** Corbeille des validations (ORG-RG-041 à 044) : demandes que je peux trancher, et suivi de mes propres demandes. */
import { useState } from 'react';
import { api, dateHeure } from '../noyau/api';
import { Carte, Champ, Chargement, Message, MessageErreur, Modale, Onglets, OPERATIONS, Page, Statut, useAvis } from '../noyau/composants';
import { useAction, useDonnees } from '../noyau/donnees';

interface Demande {
  id: string; type_operation: string; objet_type: string; niveaux_requis: number; statut: string; cree_le: string;
  donnees: Record<string, unknown> | null; initiateur: { identifiant: string; nom: string; prenoms: string | null } | null;
  niveaux_valides?: number; motif_rejet?: string | null; decide_le?: string | null;
}

/** Résumé lisible de l'opération proposée. */
export function resume(d: Pick<Demande, 'type_operation' | 'donnees'>): string {
  const x = d.donnees ?? {};
  switch (d.type_operation) {
    case 'PARAMETRAGE': case 'PARAMETRAGE_REGLE_LEGALE': return `${x.code} → ${x.valeur} au ${x.dateEffet} (${x.motif})`;
    case 'FICHE_SOCIETE': return `${Object.entries(x.valeurs as Record<string, string>).map(([k, v]) => `${k.replace(/_/g, ' ')} : ${v || '(vide)'}`).join(' ; ')} — effet ${x.dateEffet}`;
    case 'COORDONNEE_PAIEMENT': return `${x.type === 'BANQUE' ? 'Compte' : 'Portefeuille'} ${x.etablissement} •••• ${x.finNumero}, intitulé « ${x.intitule} » pour ${x.nomTitulaire} (concordance ${x.concordance} %)`;
    case 'CATALOGUE': return `${String(x.type).replace(/_/g, ' ').toLowerCase()} — effet ${x.dateEffet} (${x.motif})`;
    case 'ORGANISATION': {
      const op = (x.op ?? {}) as { operation?: string; type?: string; dateEffet?: string };
      const sim = (x.simulation ?? {}) as { utilisateurs?: unknown[] | number };
      return `${(op.operation ?? '').toLowerCase()} (${(op.type ?? '').toLowerCase()}) au ${op.dateEffet ?? ''}${sim.utilisateurs !== undefined ? ` — ${Array.isArray(sim.utilisateurs) ? sim.utilisateurs.length : sim.utilisateurs} utilisateur(s) concerné(s)` : ''}`;
    }
    case 'ATTRIBUTION_PROFIL_PRIVILEGIE': {
      const p = x.perimetre as { bureaux?: string[] } | null;
      return `Profil « ${x.profilLibelle ?? x.profil} » pour ${x.identifiant ?? ''}${p?.bureaux?.length ? ` (bureaux ${p.bureaux.join(', ')})` : ''}`;
    }
    case 'AVENANT_CORRECTION': {
      const g = (n: unknown) => Number(n ?? 0).toLocaleString('fr-FR');
      const c = (x.corrections as { donnee: string; avant: string; apres: string }[] | undefined) ?? [];
      const nature = x.nature === 'PRIME_SUPPLEMENTAIRE' ? `prime supplémentaire de ${g(x.montant)} GNF` : x.nature === 'RISTOURNE' ? `ristourne de ${g(x.montant)} GNF` : 'sans incidence sur la prime';
      return `Police ${x.numero} – ${x.assure} : ${c.map(y => `${y.donnee.toLowerCase()} ${y.avant} → ${y.apres}`).join(', ')} ; prime annuelle ${g(x.primeAvant)} → ${g(x.primeApres)} GNF, ${nature} (${x.motif})`;
    }
    case 'RETRAIT_AYANT_DROIT': return `Police ${x.numero} – retrait de ${x.assure} (décès le ${String(x.dateDeces ?? '').split('-').reverse().join('/')}) ; ristourne ${Number(x.ristourne ?? 0).toLocaleString('fr-FR')} GNF`;
    case 'RESILIATION': return `Police ${x.numero} – résiliation pour ${x.motif} : ${x.justification} ; ristourne ${Number(x.ristourneEstimee ?? 0).toLocaleString('fr-FR')} GNF`;
    default: return JSON.stringify(x);
  }
}

export function PageValidations() {
  const [onglet, setOnglet] = useState<'A_TRAITER' | 'MIENNES'>('A_TRAITER');
  const corbeille = useDonnees<Demande[]>('/admin/validations');
  const miennes = useDonnees<Demande[]>(onglet === 'MIENNES' ? '/admin/validations/miennes' : null);
  const [choisie, setChoisie] = useState<Demande | null>(null);
  const [rejet, setRejet] = useState(false);
  const [motif, setMotif] = useState('');
  const { erreur, enCours, executer } = useAction();
  const { avis, Avis } = useAvis();

  const decider = async (decision: 'VALIDE' | 'REJETE') => {
    const r = await executer(() => api('POST', `/admin/validations/${choisie!.id}/decision`, { decision, motif: motif || undefined }));
    if (r !== undefined) { setChoisie(null); setRejet(false); setMotif(''); avis(decision === 'VALIDE' ? 'Opération validée et appliquée.' : 'Opération rejetée.'); void corbeille.recharger(); }
  };

  return (
    <Page fil={['Accueil', 'Validations']} titre="Validations">
      <Onglets onglets={[{ code: 'A_TRAITER', libelle: `À valider (${corbeille.donnees?.length ?? 0})` }, { code: 'MIENNES', libelle: 'Mes demandes' }]} actif={onglet} choisir={setOnglet} />
      {onglet === 'A_TRAITER' && <Carte>
        <Message>Vous ne voyez que les demandes que vos profils (ou un intérim en cours) vous permettent de trancher. L'auteur d'une demande ne la valide jamais.</Message>
        <MessageErreur erreur={corbeille.erreur} />
        {corbeille.chargement ? <Chargement /> : corbeille.donnees?.length === 0 ? <div className="vide">Aucune opération en attente de votre validation.</div> :
          <table className="tableau"><thead><tr><th>Opération</th><th>Détail</th><th>Demandée par</th><th>Le</th><th>Niveaux</th></tr></thead>
            <tbody>{corbeille.donnees?.map(d => (
              <tr key={d.id} className="cliquable" onClick={() => setChoisie(d)}>
                <td><b>{OPERATIONS[d.type_operation] ?? d.type_operation}</b></td><td>{resume(d)}</td>
                <td>{d.initiateur ? `${d.initiateur.prenoms ?? ''} ${d.initiateur.nom}` : '—'}</td><td>{dateHeure(d.cree_le)}</td><td>{d.niveaux_requis}</td>
              </tr>))}</tbody></table>}
      </Carte>}
      {onglet === 'MIENNES' && <Carte>
        {miennes.chargement ? <Chargement /> : <table className="tableau"><thead><tr><th>Opération</th><th>Détail</th><th>Soumise le</th><th>Statut</th><th>Niveaux</th><th>Motif du rejet</th></tr></thead>
          <tbody>{miennes.donnees?.map(d => (
            <tr key={d.id}><td>{OPERATIONS[d.type_operation] ?? d.type_operation}</td><td>{resume(d)}</td><td>{dateHeure(d.cree_le)}</td>
              <td><Statut valeur={d.statut} /></td><td>{d.niveaux_valides}/{d.niveaux_requis}</td><td>{d.motif_rejet ?? ''}</td></tr>))}</tbody></table>}
      </Carte>}
      {choisie && <Modale titre={OPERATIONS[choisie.type_operation] ?? choisie.type_operation} fermer={() => { setChoisie(null); setRejet(false); }}>
        <dl className="details">
          <dt>Demandée par</dt><dd>{choisie.initiateur ? `${choisie.initiateur.prenoms ?? ''} ${choisie.initiateur.nom} (${choisie.initiateur.identifiant})` : '—'}</dd>
          <dt>Le</dt><dd>{dateHeure(choisie.cree_le)}</dd>
          <dt>Opération</dt><dd>{resume(choisie)}</dd>
        </dl>
        {rejet && <div style={{ marginTop: 14 }}><Champ libelle="Motif du rejet (obligatoire)"><textarea rows={3} value={motif} onChange={e => setMotif(e.target.value)} /></Champ></div>}
        <div style={{ marginTop: 14 }}><MessageErreur erreur={erreur} /></div>
        <div className="boutons">
          {!rejet && <button className="bouton valider" disabled={enCours} onClick={() => void decider('VALIDE')}>Valider</button>}
          {!rejet && <button className="bouton danger" onClick={() => setRejet(true)}>Rejeter</button>}
          {rejet && <button className="bouton danger" disabled={enCours || !motif.trim()} onClick={() => void decider('REJETE')}>Confirmer le rejet</button>}
          <button className="bouton secondaire" onClick={() => setChoisie(null)}>Fermer</button>
        </div>
      </Modale>}
      <Avis />
    </Page>
  );
}
