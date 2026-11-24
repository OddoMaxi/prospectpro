/** Chargement de données de l'API, avec rechargement après une action. */
import { useCallback, useEffect, useState } from 'react';
import { api, ErreurApi } from './api';

export function useDonnees<T>(chemin: string | null) {
  const [donnees, setDonnees] = useState<T | null>(null);
  const [erreur, setErreur] = useState<ErreurApi | null>(null);
  const [chargement, setChargement] = useState(true);
  const recharger = useCallback(async () => {
    if (!chemin) { setChargement(false); return; }
    setChargement(true);
    try { setDonnees(await api<T>('GET', chemin)); setErreur(null); }
    catch (e) { setErreur(e instanceof ErreurApi ? e : new ErreurApi(0, 'RESEAU', 'Serveur injoignable')); }
    finally { setChargement(false); }
  }, [chemin]);
  useEffect(() => { void recharger(); }, [recharger]);
  return { donnees, erreur, chargement, recharger, setDonnees };
}

/** Exécute une action (enregistrement, décision…) et conserve l'erreur métier à afficher. */
export function useAction() {
  const [erreur, setErreur] = useState<ErreurApi | null>(null);
  const [enCours, setEnCours] = useState(false);
  const executer = useCallback(async <R,>(f: () => Promise<R>): Promise<R | undefined> => {
    setEnCours(true); setErreur(null);
    try { return await f(); }
    catch (e) { setErreur(e instanceof ErreurApi ? e : new ErreurApi(0, 'RESEAU', (e as Error).message)); return undefined; }
    finally { setEnCours(false); }
  }, []);
  return { erreur, enCours, executer, setErreur };
}
