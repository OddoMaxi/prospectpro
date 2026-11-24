/** CX-02 Connexion : mot de passe, second facteur (TOTP pour les comptes à privilèges, SMS pour les autres), enrôlement TOTP. */
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { api, ErreurApi } from '../noyau/api';
import { Champ, Message, MessageErreur } from '../noyau/composants';
import { useSession } from '../noyau/session';

type Etape = 'IDENTIFIANTS' | 'CODE' | 'ENROLEMENT' | 'CODES_SECOURS';
interface Reponse { jeton: string; etape: 'SECOND_FACTEUR' | 'ENROLEMENT_TOTP' | 'OUVERTE'; methode?: string; codesSecours?: string[] }

export function Connexion() {
  const { moi, ouvrir } = useSession();
  const aller = useNavigate();
  const [etape, setEtape] = useState<Etape>('IDENTIFIANTS');
  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [code, setCode] = useState('');
  const [methode, setMethode] = useState<string>('SMS');
  const [jeton, setJeton] = useState('');
  const [enrolement, setEnrolement] = useState<{ secret: string; qr: string } | null>(null);
  const [codesSecours, setCodesSecours] = useState<string[]>([]);
  const [erreur, setErreur] = useState<ErreurApi | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => { setCode(''); setErreur(null); }, [etape]);
  if (moi && etape !== 'CODES_SECOURS') return <Navigate to="/" replace />;

  const executer = async (f: () => Promise<void>) => {
    setEnCours(true); setErreur(null);
    try { await f(); } catch (e) { setErreur(e as ErreurApi); } finally { setEnCours(false); }
  };
  const suite = async (r: Reponse) => {
    if (r.etape === 'OUVERTE') {
      if (r.codesSecours?.length) { setCodesSecours(r.codesSecours); setJeton(r.jeton); setEtape('CODES_SECOURS'); return; }
      await ouvrir(r.jeton); aller('/', { replace: true }); return;
    }
    setJeton(r.jeton);
    if (r.etape === 'SECOND_FACTEUR') { setMethode(r.methode ?? 'SMS'); setEtape('CODE'); return; }
    const e = await api<{ secret: string; uri: string }>('POST', '/auth/totp/enrolement', undefined, r.jeton);
    setEnrolement({ secret: e.secret, qr: await QRCode.toDataURL(e.uri, { margin: 1, width: 320 }) });
    setEtape('ENROLEMENT');
  };

  const soumettre = (e: FormEvent) => {
    e.preventDefault();
    void executer(async () => {
      if (etape === 'IDENTIFIANTS') await suite(await api<Reponse>('POST', '/auth/connexion', { identifiant, motDePasse }));
      else if (etape === 'CODE') await suite(await api<Reponse>('POST', '/auth/second-facteur', { code: code.trim() }, jeton));
      else if (etape === 'ENROLEMENT') await suite(await api<Reponse>('POST', '/auth/totp/confirmation', { code: code.trim() }, jeton));
      else { await ouvrir(jeton); aller('/', { replace: true }); }
    });
  };

  return (
    <div className="connexion">
      <div className="presentation">
        <h1>Prospect Pro</h1>
        <p>Gestion de la micro-assurance santé et accident</p>
        <ul><li>Back-office de la Compagnie</li><li>Portail des prestataires agréés</li><li>Espace assuré et espace déclarant</li><li>Application agent</li></ul>
      </div>
      <div className="boite">
        <form className="carte" onSubmit={soumettre}>
          {etape === 'IDENTIFIANTS' && <>
            <h2>Connexion</h2><p className="doux" style={{ marginTop: -8 }}>Saisissez vos identifiants</p>
            <div className="formulaire" style={{ '--colonnes': 1 } as React.CSSProperties}>
              <Champ libelle="Identifiant"><input autoFocus autoComplete="username" value={identifiant} onChange={e => setIdentifiant(e.target.value)} required /></Champ>
              <Champ libelle="Mot de passe"><input type="password" autoComplete="current-password" value={motDePasse} onChange={e => setMotDePasse(e.target.value)} required /></Champ>
            </div>
          </>}
          {etape === 'CODE' && <>
            <h2>Second facteur</h2>
            <p className="doux">{methode === 'TOTP'
              ? 'Saisissez le code à 6 chiffres affiché par votre application d\'authentification, ou l\'un de vos codes de secours.'
              : 'Un code à 6 chiffres vient de vous être envoyé par SMS. Il expire dans 5 minutes.'}</p>
            <Champ libelle={methode === 'TOTP' ? 'Code de l\'application d\'authentification' : 'Code reçu par SMS'}>
              <input autoFocus inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} required maxLength={12} />
            </Champ>
            {import.meta.env.DEV && methode !== 'TOTP' && <p className="doux" style={{ fontSize: 12 }}>Développement : les SMS sont simulés et s'affichent dans la console du serveur.</p>}
          </>}
          {etape === 'ENROLEMENT' && enrolement && <>
            <h2>Application d'authentification</h2>
            <Message type="attention">Votre compte dispose de droits à privilèges : l'application d'authentification est obligatoire.</Message>
            <div className="qr">
              <img src={enrolement.qr} alt="QR code à scanner" />
              <div className="doux" style={{ fontSize: 13 }}>Scannez ce code avec Google Authenticator, Microsoft Authenticator ou une application équivalente.<br /><br />
                Saisie manuelle : <span className="code">{enrolement.secret.replace(/(.{4})/g, '$1 ')}</span></div>
            </div>
            <div style={{ marginTop: 14 }}><Champ libelle="Code affiché par l'application"><input autoFocus inputMode="numeric" value={code} onChange={e => setCode(e.target.value)} required maxLength={6} /></Champ></div>
          </>}
          {etape === 'CODES_SECOURS' && <>
            <h2>Codes de secours</h2>
            <Message type="attention">Notez ces codes et conservez-les hors ligne. Chacun ne sert qu'une fois, si vous perdez votre téléphone. Ils ne seront plus affichés.</Message>
            <div className="codes-secours">{codesSecours.map(c => <span key={c}>{c}</span>)}</div>
          </>}
          <div style={{ marginTop: 16 }}><MessageErreur erreur={erreur} /></div>
          <div className="boutons" style={{ justifyContent: 'space-between' }}>
            <button className="bouton" disabled={enCours}>{etape === 'CODES_SECOURS' ? 'J\'ai noté mes codes' : etape === 'IDENTIFIANTS' ? 'Se connecter' : 'Valider'}</button>
            {etape !== 'IDENTIFIANTS' && etape !== 'CODES_SECOURS' && <button type="button" className="lien" onClick={() => setEtape('IDENTIFIANTS')}>Recommencer</button>}
          </div>
          {etape === 'IDENTIFIANTS' && <div style={{ marginTop: 18 }}><Message type="attention">Après plusieurs échecs (paramètre), votre compte est bloqué. Contactez votre administrateur.</Message></div>}
        </form>
      </div>
    </div>
  );
}
