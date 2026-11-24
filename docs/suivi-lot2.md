# Prospect Pro – Suivi de réalisation du lot 2 (production et finances)

Références : CDC V1.4 (chapitres 7, 8 et 11), DD 1.1, maquettes V1.4. Branche `refonte/lot1` (le lot 2 s'appuie directement sur le socle).

## Découpage

| Sous-lot | Contenu | État |
|---|---|---|
| 2.1 Moteur comptable | Exercices et périodes, journaux du § 11.7, comptes du § 11.10, branches, schémas du § 11.13 (EVT-01 à 07, 13, 21 à 24, 26, 27), génération dans la transaction de l'événement, numérotation des pièces sans trou par journal et par exercice, contrôles en base (équilibre, comptes imputables, auxiliaire des collectifs, inaltérabilité), lettrage automatique et manuel, contre-passation validée par la DAF, scellement par lots chaînés toutes les 5 minutes, balance générale et auxiliaire, grand livre | Réalisé |
| 2.2 Commercial | Intervenants (agent général, collaborateur, junior, prescripteur, Canal digital), agrément par la Direction commerciale avec visa de la Conformité, traité, contrôles des juniors, activation de l'émission (COM-RG-002), suspension et sortie (accès bloqués). Gestion datée des bureaux ; un compte de production par bureau, ouvert à la première affectation. Banques et opérateurs (compte et journal de trésorerie). Approvisionnements : minimum du premier versement, espèces confirmées par la caisse, banque par la Trésorerie, jamais par l'agent ; reçu PDF, EVT-01, SMS. Débit protégé contre les opérations simultanées, solde jamais négatif en base, alerte de seuil. Restitution : recevabilité après le délai d'annulation, gel, solde figé, validation Direction commerciale puis DAF, paiement EVT-06. Contrôle quotidien du collectif | Réalisé (CA-COM-01, 02, 04 pour le solde, 05, 07, 09, 16, 17, 24) ; cartes professionnelles, prescripteurs et codes, mouvements de portefeuille avec le sous-lot 2.5 |
| 2.3 Souscription et émission | Dossier reprenable (proposition sans numéro ni écriture, expiration à 30 jours) ; contrôles des étapes 1 à 5 (date d'effet, âges du produit, assuré principal unique, parent des enfants, pièces exigées, bénéficiaires et quotités de 100 %) ; tarification à la date d'effet ; récapitulatif PDF accepté par code SMS, annulé par toute modification ; dossiers des juniors soumis à l'agent général. Émission en transaction unique : solde vérifié sous verrou, numéro de police et de quittance, assurés et foyer, garanties (décès refusée sans consentement ou sous 12 ans), désignation des bénéficiaires, rôles et compte client, bulletin, conditions générales, quittance, attestation, EVT-02, commissions selon la clé (titulaire, apporteur), débit du compte de production, SMS, événement POLICE_EMISE (cartes au lot 3). Annulation pour erreur validée Direction commerciale puis DAF : EVT-04, compte recrédité, commissions reprises | Réalisé (CA-COM-03, 04, 06, 10, 11 ; CA-PROD-01, 02, 23) ; souscription en ligne et code prescripteur avec le sous-lot 2.5 |
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
| X24 | FIN-RG-012 (un auxiliaire par tiers et par collectif) contredit COM-RG-003 (un compte de production par bureau) | Unicité contrôlée par l'application, sauf pour le collectif des comptes de production |
| X25 | `compteur_numerotation.type_objet` TEXTE(20), alors que des types du DD comptent 22 caractères | Colonne portée à 40 caractères |
| — | Annexe B : le comptable a « S, P » sur les journaux sans « C » | Qui saisit, valide, paramètre ou exporte une fonction peut aussi la consulter |
| — | Journal de trésorerie des schémas génériques (EVT-05, 06, 22, 24) | Journal `TRE` générique, remplacé à l'opération par le journal de la banque ou de l'opérateur |
