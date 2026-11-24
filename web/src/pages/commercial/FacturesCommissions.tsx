/** CM-07 Factures de commissions (COM-RG-040 à 045, 120, 121 ; FIN-RG-095) : factures du mois, paiement par fractions, affectation au compte de production. */
import { useState } from 'react';
import { api, date, montant } from '../../noyau/api';
import { Carte, Champ, Chargement, Indicateur, Message, MessageErreur, Page, Statut, useAvis } from '../../noyau/composants';
import { useAction, useDonnees } from '../../noyau/donnees';
import { useSession } from '../../noyau/session';
import { ROLES } from './Intervenants';

interface Paiement { rang: number; montant: number; retenue: number; net: number; destination: string; paye_le: string | null }
interface Facture {
  id: string; numero: string; mois: string; mode: string | null; statut: string; montant_brut: number; avoir: number; retenue: number; net: number; montant_paye: number;
  date_limite_paiement: string | null; valide_d_office: boolean; role: string; intervenant_id: string; tiers_id: string; intervenant: string; paiements: Paiement[] | null;
}
const STATUTS: Record<string, [string, string]> = {
  ETABLIE: ['Établie', 'gris'], EMISE: ['Émise', 'bleu'], CONTESTEE: ['Contestée', 'rouge'], VALIDEE: ['Validée', 'vert'], PARTIELLEMENT_PAYEE: ['Partiellement payée', 'orange'], PAYEE: ['Payée', 'vert'],
};
const DESTINATIONS: Record<string, string> = { VIREMENT: 'virement', MONNAIE_ELECTRONIQUE: 'monnaie électronique', COMPTE_PRODUCTION: 'affectation au compte de production' };
const moisPrecedent = () => { const d = new Date(); d.setUTCDate(0); return d.toISOString().slice(0, 7); };
const libelleMois = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const engage = (f: Facture) => (f.paiements ?? []).reduce((s, p) => s + Number(p.montant), 0);

export function PageFacturesCommissions() {
  const { peut } = useSession();
  const toutes = useDonnees<Facture[]>('/factures-commissions');
  const [choix, setMois] = useState<string | null>(null);
  const mois = choix ?? toutes.donnees?.[0]?.mois ?? moisPrecedent();
  const liste = { ...toutes, donnees: toutes.donnees?.filter(f => f.mois === mois) ?? null };
  const [choisie, setChoisie] = useState<string | null>(null);
  const { avis, Avis } = useAvis();
  const action = useAction();
  const factures = liste.donnees ?? [];
  const facture = factures.find(f => f.id === choisie);
  const dans5 = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  const etablir = () => void action.executer(() => api<unknown[]>('POST', '/factures-commissions/etablissement', { mois }))
    .then(r => { if (r) { avis(`${r.length} facture(s) établie(s) pour ${libelleMois(mois)}.`); void liste.recharger(); } });

  return (
    <Page fil={['Commercial', 'Factures de commissions']} titre={`Factures de ${libelleMois(mois)}`}
      actions={<><input type="month" value={mois} onChange={e => e.target.value && setMois(e.target.value)} />
        {peut('FACTURE_COMMISSION:CREER') && <button className="bouton secondaire" disabled={action.enCours} onClick={etablir}>Établir les factures du mois</button>}</>}>
      <div className="grille quatre" style={{ marginBottom: 18 }}>
        <Indicateur libelle="Factures" valeur={factures.length} />
        <Indicateur libelle="Brut (GNF)" valeur={montant(factures.reduce((s, f) => s + Number(f.montant_brut), 0))} />
        <Indicateur libelle="Payé ou affecté" valeur={montant(factures.reduce((s, f) => s + Number(f.montant_paye), 0))} />
        <Indicateur libelle="Échéance sous 5 jours" valeur={factures.filter(f => f.statut !== 'PAYEE' && f.date_limite_paiement && f.date_limite_paiement.slice(0, 10) <= dans5).length} couleur="orange" detail="Délai de 30 jours" />
      </div>
      <MessageErreur erreur={action.erreur} />
      <Carte titre="Factures du mois" repere={1}>
        {liste.chargement ? <Chargement /> : !factures.length ? <div className="vide">Aucune facture pour ce mois. Elles sont établies automatiquement le 1er du mois suivant.</div> :
          <table className="tableau"><thead><tr><th>N° facture</th><th>Bénéficiaire</th><th>Rôle</th><th>Mode</th><th className="nombre">Brut</th><th className="nombre">Avoir</th><th className="nombre">Retenue</th><th className="nombre">Net</th><th className="nombre">Payé</th><th>Échéance</th><th>Statut</th></tr></thead>
            <tbody>{factures.map(f => <tr key={f.id} className={`cliquable${f.id === choisie ? ' choisie' : ''}`} onClick={() => setChoisie(f.id)}>
              <td className="code">{f.numero}</td><td>{f.intervenant}</td><td>{ROLES[f.role] ?? f.role}</td><td>{f.mode === 'FACTURE_DEPOSEE' ? 'Facture déposée' : f.mode ? 'Autofacturation' : '—'}</td>
              <td className="nombre">{montant(f.montant_brut)}</td><td className="nombre">{Number(f.avoir) ? montant(f.avoir) : '—'}</td><td className="nombre">{montant(f.retenue)}</td><td className="nombre">{montant(f.net)}</td>
              <td className="nombre">{montant(f.montant_paye)}</td><td>{date(f.date_limite_paiement)}</td>
              <td><Statut couleur={STATUTS[f.statut]?.[1]}>{STATUTS[f.statut]?.[0] ?? f.statut}</Statut>{f.valide_d_office && <span className="doux"> d'office</span>}</td></tr>)}</tbody></table>}
      </Carte>
      {facture && <div className="grille deux">
        {peut('FACTURE_COMMISSION:CREER') && ['VALIDEE', 'PARTIELLEMENT_PAYEE'].includes(facture.statut)
          ? <Fraction f={facture} apres={m => { avis(m); void liste.recharger(); }} />
          : <Carte titre={`Facture ${facture.numero}`}><Message>{facture.statut === 'ETABLIE' ? 'En attente de l\'émission par le commercial (code à usage unique ou facture déposée).'
            : facture.statut === 'EMISE' ? 'Émise par le commercial : à valider par la Direction commerciale dans « Validations ».'
              : facture.statut === 'CONTESTEE' ? 'Contestée : le commercial peut l\'émettre à nouveau après correction.' : 'Facture soldée.'}</Message></Carte>}
        <Carte titre="Fractions payées">
          {!facture.paiements?.length ? <div className="vide">Aucun paiement.</div> :
            <ul className="jalons">{facture.paiements.map(p => <li key={p.rang} className={p.paye_le ? '' : 'attente'}><div><small className="doux">{p.paye_le ? date(p.paye_le) : 'en attente de validation et d\'exécution'}</small><br />
              Fraction {p.rang} · {montant(p.montant)} brut · retenue {montant(p.retenue)} · net {montant(p.net)} · {DESTINATIONS[p.destination] ?? p.destination}</div></li>)}</ul>}
        </Carte>
      </div>}
      <Message>Facture mensuelle par commercial : établie en fin de mois, émise par le commercial (code à usage unique ou facture déposée), validée par la Direction commerciale. Paiement sous 30 jours après réception, en une ou plusieurs fractions ; l'agent général peut faire affecter le net à son compte de production <span className="repere">3</span>.</Message>
      <Message type="attention">Une commission reprise après facturation est déduite de la facture suivante par un avoir ; une facture émise n'est jamais modifiée. La retenue à la source est répartie au prorata des fractions <span className="repere">4</span>.</Message>
      <Avis />
    </Page>
  );
}

function Fraction({ f, apres }: { f: Facture; apres: (m: string) => void }) {
  const reste = Number(f.montant_brut) - Number(f.avoir) - engage(f);
  const [montantSaisi, setMontant] = useState(String(reste));
  const [destination, setDestination] = useState<'VIREMENT' | 'MONNAIE_ELECTRONIQUE' | 'COMPTE_PRODUCTION'>('VIREMENT');
  const [coordonneeId, setCoordonnee] = useState('');
  const [motif, setMotif] = useState('');
  const coordonnees = useDonnees<{ id: string; type: string; etablissement: string; numeroMasque: string; statut: string; carence_jusqu_au: string | null }[]>(`/tiers/${f.tiers_id}/coordonnees`);
  const action = useAction();
  const n = Number(montantSaisi);
  const fraction = n < reste;
  const payables = (coordonnees.donnees ?? []).filter(c => c.statut === 'VERIFIEE' && (destination === 'MONNAIE_ELECTRONIQUE' ? c.type === 'MONNAIE_ELECTRONIQUE' : c.type !== 'MONNAIE_ELECTRONIQUE'));
  const payer = () => void action.executer(() => api('POST', `/factures-commissions/${f.id}/paiements`, {
    montant: n, destination, coordonneeId: destination === 'COMPTE_PRODUCTION' ? undefined : coordonneeId, motifFraction: fraction ? motif : undefined,
  })).then(x => x && apres(destination === 'COMPTE_PRODUCTION' ? 'Affectation soumise à la DAF.' : 'Ordre de paiement créé et soumis à validation.'));
  return (
    <Carte titre={<>Paiement d'une fraction <span className="repere">2</span></>}>
      <div className="formulaire">
        <Champ libelle="Facture"><input disabled value={`${f.numero} · reste ${montant(reste)}`} /></Champ>
        <Champ libelle="Montant brut de la fraction (GNF)"><input type="number" min={1} max={reste} value={montantSaisi} onChange={e => setMontant(e.target.value)} /></Champ>
        <Champ libelle="Destination"><select value={destination} onChange={e => setDestination(e.target.value as typeof destination)}>
          <option value="VIREMENT">Virement bancaire</option><option value="MONNAIE_ELECTRONIQUE">Monnaie électronique</option>
          {f.role === 'AGENT_GENERAL' && <option value="COMPTE_PRODUCTION">Compte de production (mandat)</option>}</select></Champ>
        {destination !== 'COMPTE_PRODUCTION' && <Champ libelle="Coordonnées vérifiées" aide={!payables.length ? 'Aucune coordonnée vérifiée hors carence : à enregistrer sur la fiche du tiers.' : undefined}>
          <select value={coordonneeId} onChange={e => setCoordonnee(e.target.value)}><option value="">Choisir…</option>
            {payables.map(c => <option key={c.id} value={c.id}>{c.etablissement} {c.numeroMasque}</option>)}</select></Champ>}
        {fraction && <Champ libelle="Motif du fractionnement" large><textarea value={motif} onChange={e => setMotif(e.target.value)} /></Champ>}
      </div>
      {destination === 'COMPTE_PRODUCTION' && <Message>L'affectation exige un mandat actif de l'agent (ponctuel ou permanent) ; elle est validée par la DAF.</Message>}
      <MessageErreur erreur={action.erreur} />
      <div className="boutons"><button className="bouton" disabled={!n || n > reste || (fraction && !motif.trim()) || (destination !== 'COMPTE_PRODUCTION' && !coordonneeId) || action.enCours} onClick={payer}>
        {destination === 'COMPTE_PRODUCTION' ? 'Demander l\'affectation' : 'Ordonner le paiement'}</button></div>
    </Carte>
  );
}
