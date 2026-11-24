/** Nomenclatures (jours fériés, § 5.6), modèles de documents (annexe F), bureaux (CM-09), plan de comptes du socle (FI-01). */
import { useState } from 'react';
import { api, aujourdhui, date, ouvrirFichier } from '../../noyau/api';
import { Carte, Champ, Chargement, Message, MessageErreur, Modale, Page, Statut, useAvis } from '../../noyau/composants';
import { useAction, useDonnees } from '../../noyau/donnees';
import { useSession } from '../../noyau/session';

export function PageNomenclatures() {
  const { peut } = useSession();
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const jours = useDonnees<{ id: string; date: string; libelle: string }[]>(`/jours-feries?annee=${annee}`);
  const [d, setD] = useState({ date: '', libelle: '' });
  const action = useAction();
  const { avis, Avis } = useAvis();
  return (
    <Page fil={['Référentiels', 'Nomenclatures']} titre="Nomenclatures">
      <Carte titre="Jours fériés" actions={<select value={annee} onChange={e => setAnnee(Number(e.target.value))}>{[-1, 0, 1, 2].map(i => <option key={i}>{new Date().getFullYear() + i}</option>)}</select>}>
        <Message>Les délais en jours ouvrables (réclamations, sinistres) excluent samedis, dimanches et jours fériés. Les fêtes mobiles (Tabaski, Ramadan, Lundi de Pâques…) sont saisies chaque année.</Message>
        {jours.chargement ? <Chargement /> : jours.donnees?.length === 0 ? <div className="vide">Aucun jour férié saisi pour {annee}.</div> :
          <table className="tableau"><tbody>{jours.donnees?.map(j => <tr key={j.id}><td>{date(j.date)}</td><td>{new Date(`${j.date.slice(0, 10)}T00:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', timeZone: 'UTC' })}</td><td>{j.libelle}</td>
            <td>{peut('NOMENCLATURES:MODIFIER') && <button className="lien" onClick={() => { const m = prompt('Motif du retrait'); if (m?.trim()) void action.executer(() => api('DELETE', `/jours-feries/${j.id}`, { motif: m })).then(() => void jours.recharger()); }}>Retirer</button>}</td></tr>)}</tbody></table>}
        {peut('NOMENCLATURES:CREER') && <div className="boutons">
          <input type="date" value={d.date} onChange={e => setD({ ...d, date: e.target.value })} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cfd6e3' }} />
          <input placeholder="Libellé" value={d.libelle} onChange={e => setD({ ...d, libelle: e.target.value })} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cfd6e3', minWidth: 260 }} />
          <button className="bouton" disabled={!d.date || !d.libelle || action.enCours} onClick={() => void action.executer(() => api('POST', '/jours-feries', d)).then(r => { if (r) { avis('Jour férié ajouté.'); setD({ date: '', libelle: '' }); void jours.recharger(); } })}>Ajouter</button>
        </div>}
        <MessageErreur erreur={action.erreur} />
      </Carte>
      <Carte titre="Actes médicaux, médicaments, CIM-10"><Message>Ces nomenclatures sont livrées avec le module Santé (lot 3).</Message></Carte>
      <Avis />
    </Page>
  );
}

const EXEMPLE = '# Attestation d\'assurance\nNous, {{societe_raison_sociale}}, attestons que {{assure}} est titulaire de la police {{police}}.\n## Garanties\n| Garantie | Plafond (GNF) |\n{{#garanties}}| {{libelle}} | {{plafond}} |\n{{/garanties}}\n---\nFait à Conakry, le {{date_document}}.';

export function PageModeles() {
  const { peut } = useSession();
  const liste = useDonnees<{ id: string; code: string; version: number; libelle: string; niveau_signature: string; date_effet: string; valide_comite: boolean }[]>('/modeles');
  const [edition, setEdition] = useState(false);
  const [d, setD] = useState({ code: '', libelle: '', contenu: EXEMPLE, niveauSignature: 'CODE_USAGE_UNIQUE', dateEffet: aujourdhui() });
  const [donneesEssai, setDonneesEssai] = useState('{\n  "assure": "Mamadou CAMARA",\n  "police": "1011000001234",\n  "garanties": [{ "libelle": "Frais de soins", "plafond": 5000000 }]\n}');
  const action = useAction();
  const { avis, Avis } = useAvis();
  const apercu = (code: string) => void action.executer(async () => ouvrirFichier('POST', `/modeles/${code}/apercu`, { variables: JSON.parse(donneesEssai) }));
  return (
    <Page fil={['Référentiels', 'Modèles de documents']} titre="Modèles de documents" actions={peut('MODELES:CREER') && <button className="bouton" onClick={() => setEdition(true)}>+ Nouvelle version</button>}>
      <Carte>
        {liste.chargement ? <Chargement /> : <table className="tableau"><thead><tr><th>Code</th><th>Version</th><th>Libellé</th><th>Signature exigée</th><th>Effet</th><th /></tr></thead>
          <tbody>{liste.donnees?.map(m => <tr key={m.id}><td className="code">{m.code}</td><td>v{m.version}</td><td>{m.libelle}</td><td>{m.niveau_signature.replace(/_/g, ' ').toLowerCase()}</td><td>{date(m.date_effet)}</td>
            <td><button className="lien" onClick={() => apercu(m.code)}>Aperçu PDF</button></td></tr>)}</tbody></table>}
        <MessageErreur erreur={action.erreur} />
      </Carte>
      <Carte titre="Données d'essai pour l'aperçu"><textarea className="code" rows={6} style={{ width: '100%', borderRadius: 8, border: '1px solid #cfd6e3', padding: 10 }} value={donneesEssai} onChange={e => setDonneesEssai(e.target.value)} />
        <p className="doux" style={{ fontSize: 12 }}>Les mentions légales de la Compagnie (societe_raison_sociale, societe_rccm…) et la date du document sont ajoutées automatiquement.</p></Carte>
      {edition && <Modale titre="Nouvelle version d'un modèle" large fermer={() => setEdition(false)}>
        <div className="formulaire" style={{ '--colonnes': 4 } as React.CSSProperties}>
          <Champ libelle="Code"><input value={d.code} onChange={e => setD({ ...d, code: e.target.value.toUpperCase() })} placeholder="ATTESTATION" /></Champ>
          <Champ libelle="Libellé"><input value={d.libelle} onChange={e => setD({ ...d, libelle: e.target.value })} /></Champ>
          <Champ libelle="Signature exigée"><select value={d.niveauSignature} onChange={e => setD({ ...d, niveauSignature: e.target.value })}>
            <option value="CODE_USAGE_UNIQUE">Code à usage unique (SMS)</option><option value="CERTIFIEE_ANDE">Signature certifiée ANDE</option><option value="MANUSCRITE_NUMERISEE">Manuscrite numérisée</option></select></Champ>
          <Champ libelle="Date d'effet"><input type="date" value={d.dateEffet} onChange={e => setD({ ...d, dateEffet: e.target.value })} /></Champ>
          <Champ libelle="Gabarit" large aide="# titre, ## section, - puce, | tableau |, --- séparateur, {{variable}}, {{#liste}}…{{/liste}}"><textarea className="code" rows={14} value={d.contenu} onChange={e => setD({ ...d, contenu: e.target.value })} /></Champ>
        </div>
        <MessageErreur erreur={action.erreur} />
        <div className="boutons"><button className="bouton" disabled={!d.code || !d.libelle || action.enCours} onClick={() => void action.executer(() => api<{ version: number }>('POST', '/modeles', d)).then(r => { if (r) { setEdition(false); avis(`Version ${r.version} enregistrée.`); void liste.recharger(); } })}>Enregistrer</button>
          <button className="bouton secondaire" onClick={() => setEdition(false)}>Annuler</button></div>
      </Modale>}
      <Avis />
    </Page>
  );
}

export function PageBureaux() {
  const { peut } = useSession();
  const liste = useDonnees<{ id: string; code: string; nom: string; type: string; adresse: string; statut: string; gestionnaire_id: string | null }[]>('/bureaux');
  const [ajout, setAjout] = useState(false);
  const [d, setD] = useState({ nom: '', type: 'BUREAU_DIRECT', adresse: '' });
  const action = useAction();
  const { avis, Avis } = useAvis();
  return (
    <Page fil={['Commercial', 'Bureaux']} titre="Bureaux" actions={peut('BUREAUX:PARAMETRER') && <button className="bouton" onClick={() => setAjout(true)}>+ Nouveau bureau</button>}>
      <Carte>
        <Message><span className="repere">1</span> Codes de 01 à 99, uniques, jamais réutilisés ; alerte à 90 codes utilisés. Le code du bureau figure dans le numéro de police. Vous ne voyez que les bureaux de votre périmètre.</Message>
        {liste.chargement ? <Chargement /> : <table className="tableau"><thead><tr><th>Code</th><th>Nom</th><th>Type</th><th>Adresse</th><th>Statut</th></tr></thead>
          <tbody>{liste.donnees?.map(b => <tr key={b.id}><td className="code"><b>{b.code}</b></td><td>{b.nom}</td><td>{b.type === 'CANAL_DIGITAL' ? 'Canal digital' : 'Bureau direct'}</td><td>{b.adresse}</td><td><Statut valeur={b.statut} /></td></tr>)}</tbody></table>}
      </Carte>
      {ajout && <Modale titre="Nouveau bureau" fermer={() => setAjout(false)}>
        <div className="formulaire" style={{ '--colonnes': 2 } as React.CSSProperties}>
          <Champ libelle="Nom"><input value={d.nom} onChange={e => setD({ ...d, nom: e.target.value })} /></Champ>
          <Champ libelle="Type"><select value={d.type} onChange={e => setD({ ...d, type: e.target.value })}><option value="BUREAU_DIRECT">Bureau direct</option><option value="CANAL_DIGITAL">Canal digital</option></select></Champ>
          <Champ libelle="Adresse" large><input value={d.adresse} onChange={e => setD({ ...d, adresse: e.target.value })} /></Champ>
        </div>
        <MessageErreur erreur={action.erreur} />
        <div className="boutons"><button className="bouton" disabled={!d.nom || !d.adresse || action.enCours} onClick={() => void action.executer(() => api<{ code: string; alerteCapacite: string | null }>('POST', '/bureaux', d)).then(r => {
          if (r) { setAjout(false); avis(`Bureau créé avec le code ${r.code}.${r.alerteCapacite ? ` Attention : ${r.alerteCapacite}.` : ''}`); void liste.recharger(); }
        })}>Créer</button><button className="bouton secondaire" onClick={() => setAjout(false)}>Annuler</button></div>
      </Modale>}
      <Avis />
    </Page>
  );
}

export function PagePlanComptes() {
  const liste = useDonnees<{ id: string; numero: string; libelle: string; classe: string; type: string; imputable: boolean; collectif: boolean; sens_habituel: string; en_sommeil: boolean; nature: string; auxiliaires: number }[]>('/comptabilite/comptes');
  return (
    <Page fil={['Comptabilité', 'Plan de comptes']} titre="Plan de comptes">
      <Message>Comptes proposés au § 11.10, nécessaires aux rôles des tiers. Le plan BCRG complet est importé avec le module Comptabilité (lot 2) ; le chef comptable rattache chaque compte aux lignes des états BCRG.</Message>
      <Carte>{liste.chargement ? <Chargement /> : <table className="tableau"><thead><tr><th>Numéro</th><th>Libellé</th><th>Nature</th><th>Type</th><th>Sens</th><th className="nombre">Auxiliaires</th></tr></thead>
        <tbody>{liste.donnees?.map(c => <tr key={c.id}><td className="code">{c.imputable ? c.numero : <b>{c.numero}</b>}</td><td style={{ paddingLeft: c.imputable ? 24 : 12 }}>{c.libelle}</td><td>{c.nature.toLowerCase().replace(/_/g, ' ')}</td>
          <td>{c.collectif ? <Statut couleur="bleu">Collectif</Statut> : c.imputable ? 'Détail' : 'Total'}</td><td>{c.sens_habituel}</td><td className="nombre">{c.collectif ? c.auxiliaires : ''}</td></tr>)}</tbody></table>}</Carte>
    </Page>
  );
}
