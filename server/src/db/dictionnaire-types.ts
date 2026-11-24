/** Modèle du dictionnaire des données (DD 1.1), produit par tools/dd-parse.ts. */
export interface Champ {
  nom: string;
  /** Type logique du DD : TEXTE(n), MONTANT, ÉNUM x, RÉF → table… */
  type: string;
  obligatoire: boolean;
  description: string;
  regle?: string;
}

export interface Table {
  nom: string;
  libelle: string;
  /** Section du DD (ex. 4.5) */
  section: string;
  role: string;
  reglesServies: string;
  /** Code du domaine (SOC, REF, COM, PRD, SAN, SIN, FIN, CNF, PRV) */
  domaine: string;
  /** Fonction « Prévu » : table créée vide, sans écran ni traitement */
  prevu: boolean;
  /** Table « journal » : ajout seul */
  journal: boolean;
  luePar: string[];
  champs: Champ[];
  unicites: string[][];
  index: string[][];
}

export interface Dictionnaire {
  version: string;
  date: string;
  tables: Table[];
  enumerations: Record<string, string[]>;
}
