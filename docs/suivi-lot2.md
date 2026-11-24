# Prospect Pro – Suivi de réalisation du lot 2 (production et finances)

Références : CDC V1.4 (chapitres 7, 8 et 11), DD 1.1, maquettes V1.4. Branche `refonte/lot1` (le lot 2 s'appuie directement sur le socle).

## Découpage

| Sous-lot | Contenu | État |
|---|---|---|
| 2.1 Moteur comptable | Exercices et périodes, journaux du § 11.7, comptes du § 11.10, branches, schémas du § 11.13 (EVT-01 à 07, 13, 21 à 24, 26, 27), génération dans la transaction de l'événement, numérotation des pièces sans trou par journal et par exercice, contrôles en base (équilibre, comptes imputables, auxiliaire des collectifs, inaltérabilité), lettrage automatique et manuel, contre-passation validée par la DAF, scellement par lots chaînés toutes les 5 minutes, balance générale et auxiliaire, grand livre | Réalisé |
| 2.2 Commercial | Intervenants et agrément, bureaux et gestionnaires, comptes de production (approvisionnement, gel, restitution) | À faire |
| 2.3 Souscription et émission | Parcours en 8 étapes, bénéficiaires et consentements, émission en transaction unique, documents, annulation pour erreur | À faire |
| 2.4 Vie du contrat | Renouvellement, rappels, ÉCHUE / EXPIRÉE, versements programmés, avenants, résiliation | À faire |
| 2.5 Rémunération | Barèmes, commissions, factures mensuelles, fractions, retenue, affectation au compte de production | À faire |
| 2.6 Finances | Trésorerie, banques et opérateurs, chaîne de paiement, écritures manuelles (fiche d'imputation), taxes et déclarations, PPNA, clôture mensuelle | À faire |
| 2.7 Interface | Écrans des sous-lots 2.1 à 2.6 selon la maquette | À faire |

## Nouveaux écarts

| N° | Constat | Disposition retenue |
|---|---|---|
| X19 | `schema_comptable` unique par (événement, date d'effet), alors qu'EVT-02 écrit dans trois journaux (EMI, ENC, COM) | Unicité (événement, journal, date d'effet) |
| X20 | `ecriture` unique par (journal, date comptable) : une seule pièce par journal et par jour | Contrainte retirée |
| X21 | Le scellement chaîné exige un ordre strict des pièces, absent du DD | Colonne technique `ecriture.rang` |
| X22 | Comptes de chaque branche BCRG (primes, annulations, sinistres) : aucune table au DD | Table `branche_comptable` ; aucun numéro de compte dans le code métier |
| X23 | `lettrage.type` TEXTE(10) pour la valeur « AUTOMATIQUE » (11 caractères) | Colonne portée à 12 caractères |
| — | Annexe B : le comptable a « S, P » sur les journaux sans « C » | Qui saisit, valide, paramètre ou exporte une fonction peut aussi la consulter |
| — | Journal de trésorerie des schémas génériques (EVT-05, 06, 22, 24) | Journal `TRE` générique, remplacé à l'opération par le journal de la banque ou de l'opérateur |
