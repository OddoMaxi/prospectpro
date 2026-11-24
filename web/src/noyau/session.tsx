/** Session : utilisateur connecté et ses droits. Le menu et les boutons suivent les droits (ORG-RG-040) ; le serveur les contrôle de toute façon. */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, definirJeton, jetonCourant, quandSessionExpire } from './api';

export interface Moi {
  id: string; identifiant: string; type_compte: string; nom: string; prenoms: string | null; fonction: string | null; service: string | null;
  departement: string | null; profils: { code: string; perimetre: Record<string, string[]> | null }[]; droits: string[];
}
interface Session {
  moi: Moi | null; pret: boolean;
  peut: (droit: string) => boolean;
  ouvrir: (jeton: string) => Promise<void>;
  fermer: () => Promise<void>;
}

const Contexte = createContext<Session | null>(null);

export function FournisseurSession({ children }: { children: ReactNode }) {
  const [moi, setMoi] = useState<Moi | null>(null);
  const [pret, setPret] = useState(false);

  const charger = useCallback(async () => {
    if (!jetonCourant()) { setMoi(null); setPret(true); return; }
    try { setMoi(await api<Moi>('GET', '/auth/moi')); } catch { setMoi(null); } finally { setPret(true); }
  }, []);
  useEffect(() => { quandSessionExpire(() => setMoi(null)); void charger(); }, [charger]);

  const valeur: Session = {
    moi, pret,
    // « FONCTION:ACTION » : vrai si l'utilisateur détient l'action, à n'importe quel niveau de validation
    peut: (d: string) => !!moi?.droits.some(x => x === d || x.startsWith(`${d}:`)),
    ouvrir: async (jeton: string) => { definirJeton(jeton); await charger(); },
    fermer: async () => {
      await api('POST', '/auth/deconnexion').catch(() => undefined);
      definirJeton(null);
      setMoi(null);
    },
  };
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useSession(): Session {
  const s = useContext(Contexte);
  if (!s) throw new Error('Session hors contexte');
  return s;
}
