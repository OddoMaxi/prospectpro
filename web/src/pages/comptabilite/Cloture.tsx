/** FI-11 Clôture de période et provisions (FIN-RG-060 à 064, 072) ; FI-09 déclarations de taxes (FIN-RG-092, 093). */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, aujourdhui, date, montant, ouvrirFichier } from '../../noyau/api';
import { Carte, Champ, ChoixTiers, Chargement, Message, MessageErreur, Modale, Page, Statut, useAvis } from '../../noyau/composants';
import { useAction, useDonnees } from '../../noyau/donnees';
import { useSession } from '../../noyau/session';

const libelleMois = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const finDuMois = (m: string) => { const [a, n] = m.split('-').map(Number) as [number, number]; return new Date(Date.UTC(a, n, 0)).toLocaleDateString('fr-FR', { timeZone: 'UTC' }); };

// ---------------------------------------------------------------- FI-11

interface Periode { id: string; mois: string; statut: string; exercice: string; cloturee_par: string | null; ppna: number }

export function PageClotures() {
  const { peut } = useSession();
  const periodes = useDonnees<Periode[]>('/periodes');
  const ouvertes = (periodes.donnees ?? []).filter(p => p.statut === 'OUVERTE').sort((a, b) => a.mois.localeCompare(b.mois));
  const courante = ouvertes.find(p => p.mois < aujourdhui().slice(0, 7)) ?? ouvertes[0];
  const [choisi, setChoisi] = useState<string | null>(null);
  const mois = choisi ?? courante?.mois;
  const fin = mois ? (() => { const [a, n] = mois.split('-').map(Number) as [number, number]; return new Date(Date.UTC(a, n, 0)).toISOString().slice(0, 10); })() : null;
  const anomalies = useDonnees<string[]>(fin ? `/anomalies?date=${fin}` : null);
  const fiches = useDonnees<{ statut: string; rejetee: boolean; date_comptable: string }[]>('/fiches-imputation');
  const action = useAction();
  const { avis, Avis } = useAvis();
  const brouillards = (fiches.donnees ?? []).filter(f => f.statut === 'BROUILLARD' && !f.rejetee && mois && f.date_comptable.slice(0, 7) === mois).length;
  const periode = periodes.donnees?.find(p => p.mois === mois);
  const cloturer = () => void action.executer(() => api<{ ppna: number; polices: number; reprise: string | null }>('POST', `/periodes/${mois}/cloture`))
    .then(r => { if (r) { avis(`Période ${libelleMois(mois!)} clôturée : PPNA ${montant(r.ppna)} GNF sur ${r.polices} police(s)${r.reprise ? `, reprise ${r.reprise}` : ''}.`); setChoisi(null); void periodes.recharger(); } });
  const ok = <Statut couleur="vert">OK</Statut>;
  return (
    <Page fil={['Comptabilité', 'Clôtures']} titre={mois ? `Clôture au ${finDuMois(mois)}` : 'Clôtures'}
      actions={<select value={mois ?? ''} onChange={e => setChoisi(e.target.value)}>{(periodes.donnees ?? []).map(p => <option key={p.mois} value={p.mois}>{libelleMois(p.mois)}{p.statut === 'CLOTUREE' ? ' (clôturée)' : ''}</option>)}</select>}>
      {periodes.chargement ? <Chargement /> : !periode ? <Message type="attention">Aucune période : ouvrez l'exercice dans le plan de comptes.</Message> : <>
        {periode.statut === 'CLOTUREE' ? <Message type="succes">Période clôturée{periode.cloturee_par ? ` par ${periode.cloturee_par}` : ''} : plus aucune saisie n'y est admise.</Message> :
          <Carte titre="Contrôles" repere={1}>
            {anomalies.chargement ? <Chargement /> : <table className="tableau"><thead><tr><th>Contrôle préalable</th><th>Résultat</th></tr></thead><tbody>
              <tr><td>Anomalies quotidiennes levées</td><td>{anomalies.donnees?.length ? <Statut couleur="rouge">{anomalies.donnees.length} anomalie(s)</Statut> : ok}</td></tr>
              <tr><td>Fiches d'imputation au brouillard sur la période</td><td>{brouillards ? <Statut couleur="orange">{brouillards}</Statut> : <>{ok} aucune</>}</td></tr>
            </tbody></table>}
            {!!anomalies.donnees?.length && <Message type="erreur" titre="Clôture bloquée"><ul>{anomalies.donnees.map(a => <li key={a}>{a}</li>)}</ul></Message>}
          </Carte>}
        <Carte titre={<>Provisions techniques (EVT-13) <span className="repere">2</span></>}>
          <table className="tableau"><thead><tr><th>Provision</th><th>Composante</th><th className="nombre">Montant (GNF)</th></tr></thead>
            <tbody><tr><td>Primes non acquises</td><td>Police par police, jours réels, sur la prime nette</td><td className="nombre">{periode.statut === 'CLOTUREE' ? montant(periode.ppna) : 'calculée à la clôture'}</td></tr>
              <tr><td>Sinistres à payer</td><td className="doux">Avec les modules santé et sinistres (lot 3)</td><td className="nombre">—</td></tr></tbody></table>
        </Carte>
        <Message>Les provisions sont comptabilisées au dernier jour du mois avec leur état justificatif, puis reprises automatiquement au premier jour de la période suivante <span className="repere">3</span>.</Message>
        <MessageErreur erreur={action.erreur} />
        {periode.statut === 'OUVERTE' && peut('ECRITURE_MANUELLE:VALIDER') && <div className="boutons">
          <button className="bouton" disabled={!!anomalies.donnees?.length || action.enCours} onClick={cloturer}>Clôturer la période</button></div>}
      </>}
      <Carte titre="Périodes">
        <table className="tableau"><thead><tr><th>Période</th><th>Exercice</th><th className="nombre">PPNA</th><th>Clôturée par</th><th>Statut</th></tr></thead>
          <tbody>{(periodes.donnees ?? []).map(p => <tr key={p.id}><td>{libelleMois(p.mois)}</td><td>{p.exercice}</td><td className="nombre">{Number(p.ppna) ? montant(p.ppna) : '—'}</td><td>{p.cloturee_par ?? '—'}</td>
            <td>{p.statut === 'CLOTUREE' ? <Statut couleur="gris">Clôturée</Statut> : <Statut couleur="vert">Ouverte</Statut>}</td></tr>)}</tbody></table>
      </Carte>
      <Avis />
    </Page>
  );
}

// ---------------------------------------------------------------- FI-09

interface Declaration { id: string; numero: string; code: string; libelle: string; periode: string; assiette: number; montant_collecte: number; solde: number; statut: string; reference_depot: string | null; date_depot: string | null; numero_piece: string | null; ordre: string | null; echeance: string; enRetard: boolean }
const STATUTS_DECL: Record<string, [string, string]> = { PREPAREE: ['En validation', 'orange'], VALIDEE: ['Validée', 'vert'], DEPOSEE: ['Déposée', 'bleu'], PAYEE: ['Payée', 'vert'], REJETEE: ['Rejetée', 'rouge'] };

export function PageDeclarations() {
  const { peut } = useSession();
  const liste = useDonnees<Declaration[]>('/declarations-taxes');
  const [nouvelle, setNouvelle] = useState(false);
  const [depot, setDepot] = useState<Declaration | null>(null);
  const [paiement, setPaiement] = useState<Declaration | null>(null);
  const { avis, Avis } = useAvis();
  const ouvrirDoc = async (id: string) => { const docs = await api<{ id: string }[]>('GET', `/documents?objetType=declaration_taxe&objetId=${id}`); if (docs[0]) await ouvrirFichier('GET', `/documents/${docs[0].id}/fichier`); };
  return (
    <Page fil={['Comptabilité', 'Déclarations']} titre="Déclarations de taxes" actions={peut('DECLARATION_TAXE:CREER') && <button className="bouton" onClick={() => setNouvelle(true)}>+ Préparer une déclaration</button>}>
      <Carte titre="Déclarations" repere={1}>
        {liste.chargement ? <Chargement /> : !liste.donnees?.length ? <div className="vide">Aucune déclaration.</div> :
          <table className="tableau"><thead><tr><th>N°</th><th>Taxe</th><th>Période</th><th className="nombre">Assiette</th><th className="nombre">Collectée</th><th className="nombre">Solde à reverser</th><th>Liquidation</th><th>Échéance</th><th>Dépôt</th><th>Paiement</th><th>Statut</th><th /></tr></thead>
            <tbody>{liste.donnees.map(d => <tr key={d.id}><td className="code">{d.numero}</td><td>{d.libelle}</td><td>{libelleMois(d.periode)}</td><td className="nombre">{montant(d.assiette)}</td>
              <td className="nombre">{montant(d.montant_collecte)}</td><td className="nombre">{montant(d.solde)}</td><td className="code">{d.numero_piece ?? '—'}</td>
              <td style={d.enRetard ? { color: 'var(--rouge)' } : undefined}>{date(d.echeance)}{d.enRetard ? ' · en retard' : ''}</td>
              <td>{d.reference_depot ? <><span className="code">{d.reference_depot}</span> <small className="doux">{date(d.date_depot)}</small></> : ['VALIDEE', 'PAYEE'].includes(d.statut) && peut('DECLARATION_TAXE:CREER') ? <button className="lien" onClick={() => setDepot(d)}>Enregistrer le dépôt</button> : '—'}</td>
              <td>{d.ordre ? <span className="code">{d.ordre.split(' ')[0]}</span> : ['VALIDEE', 'DEPOSEE'].includes(d.statut) && Number(d.solde) > 0 && peut('DECLARATION_TAXE:CREER') ? <button className="lien" onClick={() => setPaiement(d)}>Ordonner</button> : '—'}</td>
              <td><Statut couleur={STATUTS_DECL[d.statut]?.[1]}>{STATUTS_DECL[d.statut]?.[0] ?? d.statut}</Statut></td><td><button className="lien" onClick={() => void ouvrirDoc(d.id)}>PDF</button></td></tr>)}</tbody></table>}
      </Carte>
      <Message>Le montant déclaré est égal au solde du compte de taxe de la période <span className="repere">2</span> ; un écart bloque la préparation. Une seule déclaration par taxe et par période : une correction se porte sur la période suivante. Validation par le chef comptable puis la DAF dans <Link to="/validations">Validations</Link>, puis liquidation automatique.</Message>
      {depot && <DepotDeclaration d={depot} fermer={() => setDepot(null)} apres={m => { setDepot(null); avis(m); void liste.recharger(); }} />}
      {paiement && <PaiementDeclaration d={paiement} fermer={() => setPaiement(null)} apres={m => { setPaiement(null); avis(m); void liste.recharger(); }} />}
      {nouvelle && <NouvelleDeclaration fermer={() => setNouvelle(false)} apres={m => { setNouvelle(false); avis(m); void liste.recharger(); }} />}
      <Avis />
    </Page>
  );
}

function DepotDeclaration({ d, fermer, apres }: { d: Declaration; fermer: () => void; apres: (m: string) => void }) {
  const [jour, setJour] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const action = useAction();
  return (
    <Modale titre={`Dépôt de la déclaration ${d.numero}`} fermer={fermer}>
      <div className="formulaire"><Champ libelle="Date du dépôt"><input type="date" value={jour} onChange={e => setJour(e.target.value)} /></Champ>
        <Champ libelle="Référence de l'administration"><input value={reference} onChange={e => setReference(e.target.value)} /></Champ></div>
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton" disabled={!reference.trim() || action.enCours}
        onClick={() => void action.executer(() => api('POST', `/declarations-taxes/${d.id}/depot`, { date: jour, reference })).then(r => r !== undefined && apres('Dépôt enregistré.'))}>Enregistrer</button></div>
    </Modale>
  );
}

function PaiementDeclaration({ d, fermer, apres }: { d: Declaration; fermer: () => void; apres: (m: string) => void }) {
  const [beneficiaire, setBeneficiaire] = useState<{ id: string; nom: string } | null>(null);
  const coordonnees = useDonnees<{ id: string; etablissement: string; numeroMasque: string; statut: string }[]>(beneficiaire ? `/tiers/${beneficiaire.id}/coordonnees` : null);
  const [coordonnee, setCoordonnee] = useState('');
  const action = useAction();
  const payables = (coordonnees.donnees ?? []).filter(c => c.statut === 'VERIFIEE');
  return (
    <Modale titre={`Payer la déclaration ${d.numero}`} fermer={fermer}>
      <dl className="details"><dt>Montant</dt><dd><b>{montant(d.solde)} GNF</b></dd><dt>Échéance</dt><dd>{date(d.echeance)}</dd></dl>
      <Message>L'ordre part à la DAF puis à la Trésorerie. Pour qu'il soit généré automatiquement à la validation, paramétrez le code tiers de l'administration fiscale (FIN_BENEFICIAIRE_TAXES).</Message>
      <div className="formulaire">
        <Champ libelle="Administration fiscale" large><ChoixTiers valeur={beneficiaire} choisir={t => { setBeneficiaire(t); setCoordonnee(''); }} /></Champ>
        {beneficiaire && <Champ libelle="Coordonnées" large>{!payables.length ? <span className="doux">Aucune coordonnée vérifiée</span> :
          <select value={coordonnee} onChange={e => setCoordonnee(e.target.value)}><option value="">Choisir…</option>{payables.map(c => <option key={c.id} value={c.id}>{c.etablissement} {c.numeroMasque}</option>)}</select>}</Champ>}
      </div>
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton" disabled={!coordonnee || action.enCours}
        onClick={() => void action.executer(() => api<{ numero: string }>('POST', `/declarations-taxes/${d.id}/paiement`, { beneficiaireTiersId: beneficiaire!.id, coordonneeId: coordonnee })).then(r => r && apres(`Ordre de paiement ${r.numero} soumis à la DAF.`))}>Ordonner le paiement</button></div>
    </Modale>
  );
}

function NouvelleDeclaration({ fermer, apres }: { fermer: () => void; apres: (m: string) => void }) {
  const taxes = useDonnees<{ code: string; libelle: string; type: string }[]>('/comptabilite/codes-taxes');
  const precedent = (() => { const d = new Date(); d.setUTCDate(0); return d.toISOString().slice(0, 7); })();
  const [codeTaxe, setCode] = useState('');
  const [mois, setMois] = useState(precedent);
  const action = useAction();
  return (
    <Modale titre="Préparer une déclaration" fermer={fermer}>
      <div className="formulaire">
        <Champ libelle="Taxe">{taxes.donnees ? <select value={codeTaxe} onChange={e => setCode(e.target.value)}><option value="">Choisir…</option>
          {taxes.donnees.filter(t => t.type !== 'RETENUE_SOURCE').map(t => <option key={t.code} value={t.code}>{t.code} – {t.libelle}</option>)}</select>
          : <input value={codeTaxe} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Code taxe" />}</Champ>
        <Champ libelle="Période"><input type="month" value={mois} onChange={e => setMois(e.target.value)} /></Champ>
      </div>
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton" disabled={!codeTaxe || !mois || action.enCours}
        onClick={() => void action.executer(() => api<{ numero: string; montant: number }>('POST', '/declarations-taxes', { codeTaxe, mois })).then(r => r && apres(`Déclaration ${r.numero} préparée (${montant(r.montant)} GNF) et soumise à validation.`))}>Préparer</button></div>
    </Modale>
  );
}
