/** Auteur d'une action : utilisateur authentifié (ou traitement système), avec son adresse et son appareil. */
export class Acteur {
  constructor(
    public readonly utilisateurId: string | null,
    public readonly adresseIp: string | null = null,
    public readonly appareil: string | null = null,
  ) {}

  static systeme(): Acteur {
    return new Acteur(null);
  }

  /** Champs de traçabilité pour le journal d'audit. */
  trace() {
    return { utilisateurId: this.utilisateurId, adresseIp: this.adresseIp, appareil: this.appareil };
  }
}
