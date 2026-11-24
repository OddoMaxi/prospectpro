/**
 * Changements de paramètres soumis au comité de paramétrage (ARC-RG-020) ;
 * visa de la Conformité en second niveau pour un paramètre portant une règle légale (ARC-RG-003).
 */
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { exiger } from '../../noyau/erreurs.js';
import { appliquerChangement, controlerChangement } from '../../moteurs/parametres.js';
import { enregistrerOperation, soumettre } from '../../moteurs/validation.js';

export async function proposerChangement(q: Executant, acteur: Acteur, code: string, valeur: string, dateEffet: string, motif: string) {
  exiger(/^\d{4}-\d{2}-\d{2}$/.test(dateEffet), 'DATE_INVALIDE', 'Date d\'effet invalide');
  exiger(motif?.trim(), 'MOTIF_REQUIS', 'Motif obligatoire');
  const p = await controlerChangement(q, code, valeur);
  return soumettre(q, acteur, {
    typeOperation: p.regle_legale_id ? 'PARAMETRAGE_REGLE_LEGALE' : 'PARAMETRAGE',
    objetType: 'parametre', objetId: p.id, donnees: { code, valeur, dateEffet, motif },
  });
}

for (const type of ['PARAMETRAGE', 'PARAMETRAGE_REGLE_LEGALE']) {
  enregistrerOperation(type, {
    administrative: false,
    async appliquer(q, demande, acteur) {
      const d = demande.donnees as { code: string; valeur: string; dateEffet: string };
      await appliquerChangement(q, acteur, d.code, d.valeur, d.dateEffet, demande.id);
      if (type === 'PARAMETRAGE_REGLE_LEGALE') {
        await q.query('UPDATE regle_legale SET visa_conformite_id = $2 WHERE id = (SELECT regle_legale_id FROM parametre WHERE code = $1)', [d.code, acteur.utilisateurId]);
      }
    },
  });
}
