/** Erreur métier : code stable (exploité par l'interface et les tests), message lisible, statut HTTP. */
export class ErreurMetier extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statut = 422,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ErreurMetier';
  }
}

export const nonTrouve = (objet: string) => new ErreurMetier('NON_TROUVE', `${objet} introuvable`, 404);
export const interdit = (message = 'Action non autorisée') => new ErreurMetier('INTERDIT', message, 403);
export const conflit = (message = 'La donnée a été modifiée entre-temps : rechargez-la') => new ErreurMetier('CONFLIT_VERSION', message, 409);

export function exiger(condition: unknown, code: string, message: string, statut = 422): asserts condition {
  if (!condition) throw new ErreurMetier(code, message, statut);
}
