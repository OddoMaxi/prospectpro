/**
 * Finances : CM-03 approvisionnements à confirmer (COM-RG-012, 013), FI-06 trésorerie et journée comptable (FIN-RG-040 à 042),
 * FI-08 paiements : ordres et exécution (FIN-RG-050 à 053).
 */
import { useState } from 'react';
import { api, aujourdhui, date, dateHeure, montant } from '../../noyau/api';
import { Carte, Champ, Chargement, Indicateur, Message, MessageErreur, Modale, Page, Statut, useAvis } from '../../noyau/composants';
import { useAction, useDonnees } from '../../noyau/donnees';
import { useSession } from '../../noyau/session';

const libelle = (s: string) => s.toLowerCase().replace(/_/g, ' ');
const MOYENS: Record<string, string> = { ESPECES_SIEGE: 'Espèces (caisse du siège)', BANQUE: 'Banque', MONNAIE_ELECTRONIQUE: 'Monnaie électronique' };

// ---------------------------------------------------------------- CM-03

interface Appro { id: string; numero_recu: string; moyen: string; montant: number; reference_externe: string | null; statut: string; motif_rejet: string | null; cree_le: string; confirme_le: string | null; bureau: string; bureau_nom: string; agent: string }

export function PageApprovisionnements() {
  const { peut } = useSession();
  const [statut, setStatut] = useState('DECLARE');
  const liste = useDonnees<Appro[]>(`/approvisionnements?statut=${statut}`);
  const [rejet, setRejet] = useState<Appro | null>(null);
  const [motif, setMotif] = useState('');
  const action = useAction();
  const { avis, Avis } = useAvis();
  const confirmer = (a: Appro) => void action.executer(() => api('POST', `/approvisionnements/${a.id}/confirmation`))
    .then(x => { if (x !== undefined) { avis(`${a.numero_recu} confirmé : compte crédité de ${montant(a.montant)} GNF (EVT-01).`); void liste.recharger(); } });
  const rejeter = () => void action.executer(() => api('POST', `/approvisionnements/${rejet!.id}/rejet`, { motif }))
    .then(x => { if (x !== undefined) { avis(`${rejet!.numero_recu} rejeté ; l'agent est notifié.`); setRejet(null); setMotif(''); void liste.recharger(); } });
  const l = liste.donnees ?? [];
  return (
    <Page fil={['Finances', 'Trésorerie', 'Approvisionnements à confirmer']} titre="Approvisionnements à confirmer"
      actions={<select value={statut} onChange={e => setStatut(e.target.value)}><option value="DECLARE">Déclarés</option><option value="CONFIRME">Confirmés</option><option value="REJETE">Rejetés</option></select>}>
      <MessageErreur erreur={action.erreur} />
      <Carte titre={`Approvisionnements ${statut === 'DECLARE' ? 'déclarés' : statut === 'CONFIRME' ? 'confirmés' : 'rejetés'} (${l.length})`} repere={1}>
        {liste.chargement ? <Chargement /> : !l.length ? <div className="vide">Aucun approvisionnement.</div> :
          <table className="tableau"><thead><tr><th>Reçu</th><th>Bureau</th><th>Agent</th><th>Moyen</th><th className="nombre">Montant (GNF)</th><th>Référence</th><th>Déclaré le</th><th>{statut === 'DECLARE' ? 'Décision' : 'Statut'}</th></tr></thead>
            <tbody>{l.map(a => <tr key={a.id}><td className="code">{a.numero_recu}</td><td>{a.bureau} – {a.bureau_nom}</td><td>{a.agent}</td><td>{MOYENS[a.moyen] ?? a.moyen}</td>
              <td className="nombre">{montant(a.montant)}</td><td>{a.reference_externe ?? '—'}</td><td>{dateHeure(a.cree_le)}</td>
              <td>{statut === 'DECLARE' && peut('COMPTE_PRODUCTION:CREER') ? <><button className="lien" disabled={action.enCours} onClick={() => confirmer(a)}>Confirmer</button> · <button className="lien" onClick={() => setRejet(a)}>Rejeter</button></>
                : <><Statut valeur={a.statut} />{a.motif_rejet && <span className="doux"> {a.motif_rejet}</span>}</>}</td></tr>)}</tbody></table>}
      </Carte>
      <Message>Seul un approvisionnement confirmé au vu du relevé augmente le solde et génère l'écriture EVT-01 <span className="repere">2</span>. Un rejet exige un motif <span className="repere">3</span>. L'agent ne confirme jamais lui-même.</Message>
      {rejet && <Modale titre={`Rejeter ${rejet.numero_recu}`} fermer={() => setRejet(null)}>
        <Champ libelle="Motif du rejet" large><textarea value={motif} onChange={e => setMotif(e.target.value)} placeholder="Ex. montant du relevé différent" /></Champ>
        <div className="boutons"><button className="bouton danger" disabled={!motif.trim() || action.enCours} onClick={rejeter}>Rejeter</button></div>
      </Modale>}
      <Avis />
    </Page>
  );
}

// ---------------------------------------------------------------- FI-06

interface Soldes { comptes: { code: string; nom: string; numero: string; nature: string; solde: number }[]; attente: { montant: number; pieces: number }; anomalies: string[]; collectif: { metier: number; comptable: number; ecart: number } }

export function PageJourneeComptable() {
  const t = useDonnees<Soldes>('/tresorerie');
  const somme = (n: string) => (t.donnees?.comptes ?? []).filter(c => c.nature === n).reduce((s, c) => s + c.solde, 0);
  const quittances = (t.donnees?.anomalies ?? []).filter(x => x.startsWith('Quittance'));
  const ecart = t.donnees?.collectif.ecart ?? 0;
  return (
    <Page fil={['Finances', 'Trésorerie']} titre={`Journée du ${date(aujourdhui())}`}>
      {t.erreur && <MessageErreur erreur={t.erreur} />}
      <div className="grille quatre" style={{ marginBottom: 18 }}>
        <Indicateur libelle="Banques" valeur={montant(somme('BANQUE'))} />
        <Indicateur libelle="Monnaie électronique" valeur={montant(somme('MONNAIE_ELECTRONIQUE'))} />
        <Indicateur libelle="Caisse siège" valeur={montant(somme('CAISSE'))} />
        <Indicateur libelle="Encaissements en attente" valeur={montant(t.donnees?.attente.montant ?? 0)} couleur="orange" detail={`${t.donnees?.attente.pieces ?? 0} encaissement(s) à affecter`} />
      </div>
      <div className="grille cote">
        <Carte titre="Anomalies" repere={1}>
          {!t.donnees ? <Chargement /> : <table className="tableau"><thead><tr><th>Contrôle quotidien</th><th>Résultat</th></tr></thead><tbody>
            <tr><td>Somme des comptes de production = collectif ({montant(t.donnees.collectif.comptable)})</td><td>{ecart ? <Statut couleur="rouge">Écart {montant(ecart)}</Statut> : <><Statut couleur="vert">OK</Statut> écart 0</>}</td></tr>
            <tr><td>Quittances ordinaires non soldées</td><td>{quittances.length ? <Statut couleur="rouge">{quittances.length}</Statut> : <><Statut couleur="vert">OK</Statut> aucune</>}</td></tr>
          </tbody></table>}
          {quittances.length > 0 && <ul>{quittances.map(q => <li key={q}>{q}</li>)}</ul>}
        </Carte>
        <Carte titre="Comptes de trésorerie">
          <table className="tableau"><thead><tr><th>Journal</th><th>Compte</th><th className="nombre">Solde</th></tr></thead>
            <tbody>{t.donnees?.comptes.map(c => <tr key={c.code}><td>{c.code} – {c.nom}</td><td className="code">{c.numero}</td><td className="nombre">{montant(c.solde)}</td></tr>)}</tbody></table>
        </Carte>
      </div>
      <Message>La journée bascule automatiquement à minuit. Une anomalie est listée et doit être levée avant la clôture de la période, seule bloquante <span className="repere">2</span>.</Message>
    </Page>
  );
}

// ---------------------------------------------------------------- FI-08

interface Ordre { id: string; numero: string; type: string; montant: number; statut: string; objet_type: string; execute_le: string | null; cree_le: string; beneficiaire: string; etablissement: string; numero_piece: string | null }
const STATUTS_ORDRE: Record<string, [string, string]> = { ORDONNANCE: ['En validation', 'orange'], VALIDE: ['Validé', 'vert'], EXECUTE: ['Exécuté', 'bleu'], REJETE: ['Rejeté', 'rouge'] };

export function PagePaiements() {
  const { peut } = useSession();
  const [statut, setStatut] = useState('');
  const liste = useDonnees<Ordre[]>(`/ordres-paiement${statut ? `?statut=${statut}` : ''}`);
  const banques = useDonnees<{ code: string; nom: string }[]>('/banques-operateurs');
  const [ordre, setOrdre] = useState<Ordre | null>(null);
  const [banque, setBanque] = useState('');
  const action = useAction();
  const { avis, Avis } = useAvis();
  const executer = () => void action.executer(() => api('POST', `/ordres-paiement/${ordre!.id}/execution`, { banque }))
    .then(x => { if (x !== undefined) { avis(`${ordre!.numero} exécuté : écriture passée, avis de paiement envoyé.`); setOrdre(null); void liste.recharger(); } });
  const l = liste.donnees ?? [];
  return (
    <Page fil={['Finances', 'Paiements']} titre="Ordres de paiement">
      <div className="filtres"><span className="repere">1</span>
        <select value={statut} onChange={e => setStatut(e.target.value)}><option value="">Tous les statuts</option>{Object.entries(STATUTS_ORDRE).map(([c, [l2]]) => <option key={c} value={c}>{l2}</option>)}</select></div>
      <Carte titre={<>Ordres <span className="repere">2</span></>}>
        {liste.chargement ? <Chargement /> : !l.length ? <div className="vide">Aucun ordre.</div> :
          <table className="tableau"><thead><tr><th>Ordre</th><th>Bénéficiaire</th><th>Type</th><th className="nombre">Montant</th><th>Coordonnées</th><th>Ordonnancé le</th><th>Pièce</th><th>Statut</th></tr></thead>
            <tbody>{l.map(o => <tr key={o.id}><td className="code">{o.numero}</td><td>{o.beneficiaire}</td><td>{libelle(o.type)}</td><td className="nombre">{montant(o.montant)}</td>
              <td>{o.etablissement} ✓</td><td>{date(o.cree_le)}</td><td className="code">{o.numero_piece ?? '—'}</td>
              <td><Statut couleur={STATUTS_ORDRE[o.statut]?.[1]}>{STATUTS_ORDRE[o.statut]?.[0] ?? o.statut}</Statut>
                {o.statut === 'VALIDE' && peut('PAIEMENT:CREER') && <> <button className="lien" onClick={() => setOrdre(o)}>Exécuter</button></>}</td></tr>)}</tbody></table>}
      </Carte>
      <Message>Chaîne unique : liquidation → ordonnancement → validation → exécution → écriture automatique → avis de paiement. Aucun paiement vers des coordonnées non vérifiées ou modifiées depuis moins de la carence ; l'exécutant n'est ni l'ordonnateur ni un valideur <span className="repere">3</span>.</Message>
      {ordre && <Modale titre={`Exécuter ${ordre.numero}`} fermer={() => setOrdre(null)}>
        <dl className="details"><dt>Bénéficiaire</dt><dd>{ordre.beneficiaire}</dd><dt>Montant</dt><dd><b>{montant(ordre.montant)} GNF</b></dd><dt>Vers</dt><dd>{ordre.etablissement}</dd></dl>
        <Champ libelle="Banque ou opérateur payeur"><select value={banque} onChange={e => setBanque(e.target.value)}><option value="">Choisir…</option>{banques.donnees?.map(b => <option key={b.code} value={b.code}>{b.nom}</option>)}</select></Champ>
        <MessageErreur erreur={action.erreur} />
        <div className="boutons"><button className="bouton" disabled={!banque || action.enCours} onClick={executer}>Confirmer l'exécution</button></div>
      </Modale>}
      <Avis />
    </Page>
  );
}
