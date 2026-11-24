# Prospect Pro – Suivi de réalisation du lot 1 (socle)

Mis à jour le 24/11/2026. Références : CDC V1.4, DD 1.1.

## Organisation du code

| Élément | Emplacement |
|---|---|
| Application actuelle (en production jusqu'à la bascule) | `backend/`, `frontend/` |
| Serveur cible, TypeScript | `server/` |
| Modèle du DD 1.1 (156 tables, 1 178 champs, 65 énumérations) extrait du .docx | `server/src/db/dictionnaire.json` (outil : `server/tools/dd-parse.ts`) |
| Migration 0001 : schéma complet du DD, générée | `server/migrations/1764000000000_schema-dd-1-1.sql` (outil : `server/tools/dd-sql.ts`) |
| Migration 0002 : compléments techniques (écarts X9 à X12) | `server/migrations/1764000000001_socle-technique.sql` |
| Migration 0003 : compléments des référentiels (écarts X15, X16) | `server/migrations/1764000000002_referentiels.sql` |
| Migration 0004 : moteurs communs (écarts X17, X18) | `server/migrations/1764000000003_moteurs-communs.sql` |
| Ordonnanceur (traitements planifiés, distribution des événements) | `server/src/ordonnanceur.ts` |
| Démonstration commentée par l'API (base dédiée) | `server/tools/demo.ts` : `npm run demo` |
| Tests automatisés (base PostgreSQL réelle) | `server/test/` : `npm test` |

## Avancement

| Sous-lot | Réalisé | Reste à faire |
|---|---|---|
| 1.0 Fondations | Secret JWT obligatoire (ancienne application comprise) ; code mort et `render.yaml` retirés ; migrations versionnées avec retour arrière testé ; schéma DD complet avec clés étrangères, montants entiers, énumérations contrôlées en base, colonnes techniques, verrou optimiste, suppression physique interdite, tables journal en ajout seul ; socle de tests ; ordonnanceur `pg-boss` (fuseau Africa/Conakry) avec trois traitements quotidiens | Serveur de recette ; intégration continue |
| 1.1 Organisation | Départements, services, fonctions ; renommage, désactivation contrôlée ; déplacement, fusion, scission simulés puis validés ; organigramme à toute date | Écrans |
| 1.2 Habilitations | Comptes nominatifs ; profils et droits de l'annexe B (correctifs V1.3) ; périmètres contrôlés côté serveur ; incompatibilités ; profils privilégiés validés par une seconde personne ; délégations ; intérims ; mot de passe Argon2id ; verrouillage ; second facteur SMS et TOTP avec codes de secours ; sessions révocables | Revue semestrielle des habilitations (ORG-RG-045) ; écrans |
| 1.3 Audit et paramètres | Journal chaîné et vérifiable ; consultations sensibles et exports tracés ; masquage des secrets ; paramètres historisés de l'annexe C ; règles légales verrouillées ; comité de paramétrage | Écrans |
| 1.4 Référentiels | Tiers : création, doublons, nature figée. Bureaux : codes 01 à 99 jamais réutilisés, alerte de capacité, filtrage par périmètre. Fiche Compagnie : historique daté, validation DAF ou DG, blocage tant qu'elle est incomplète, mentions légales à la date du document. Rôles des tiers et ouverture automatique des comptes auxiliaires (collectifs du § 11.10 paramétrés). Foyers : 4 conjoints au plus, conjoint d'un seul assuré principal, catégories et âges limites des enfants, représentant légal. Coordonnées de paiement : numéro chiffré, seconde validation, alerte SMS au titulaire, carence. Catalogue : produits, formules versionnées, garanties, grilles de tarifs datées, taxes, prime totale calculée, règles de la garantie décès (art. 193 à 195) et des quotités. Modèles de documents (versions). Jours fériés et jours ouvrables | Nomenclatures des actes, médicaments et CIM-10 (avec le lot Santé) ; exclusions de produit ; brancher les traitements quotidiens (fiche Compagnie du jour, âges limites) sur l'ordonnanceur |
| 1.5 Moteurs communs | Numérotation (formats des § 6.1 et 6.3, clé MOD 97-10, concurrence) ; validation ; notifications avec simulateur SMS ; chiffrement par enveloppe (local et Vault Transit). Événements métier : publication dans la transaction de l'opération, idempotence, distribution unique par abonné, reprises, abandon signalé. Documents : modèles versionnés au gabarit simple, PDF/A-3b (polices embarquées), mentions légales à la date du document, scellement par empreinte, stockage en ajout seul, contrôle d'intégrité à chaque lecture, réimpression comptée, pièces déposées contrôlées. Acceptation électronique par code SMS lié à l'empreinte, dossier de preuve, signature manuscrite numérisée en exception. Réclamations : module unique, numérotation, échéance en jours ouvrables, affectation, réponse, escalade automatique, indicateurs. Motifs de blocage : référentiel du § 3.7, dépôt par module autorisé, levée justifiée, motifs définitifs, vue par profil | Signature certifiée ANDE (prestataire à retenir) ; purge des fichiers orphelins ; revue semestrielle des habilitations (ORG-RG-045) |
| 1.6 Interface | — | Mise en page par département, écrans du socle selon la maquette |

## Critères d'acceptation vérifiés par les tests

CA-ORG-01, 02, 03 (par appel HTTP direct), 04, 05, 06 ; CA-NUM-01 à 09 (dont 100 émissions simultanées) ; CA-REF-01 à 09.

Pour CA-REF-05 et CA-REF-09, la règle est en place ; son branchement final se fait avec le module Souscription (lot 2) : l'émission appellera le contrôle de la fiche Compagnie, et le traitement des âges limites recevra la date d'échéance des polices.

## Nouveaux écarts à soumettre à la maîtrise d'ouvrage

| N° | Constat | Disposition retenue |
|---|---|---|
| X9 | Le journal d'audit chaîné exige un ordre strict des lignes, absent du DD | Colonne technique `journal_audit.rang` |
| X10 | `demande_validation` ne permet pas de conserver l'opération proposée (fusion, changement de paramètre, fiche Compagnie) | Colonnes `donnees` et `decide_le` |
| X11 | `historique_organisation.valide_par` est obligatoire, alors que seuls le déplacement, la fusion et la scission exigent une seconde validation (ORG-RG-005) | Obligatoire pour ces trois opérations seulement, contrôlé en base |
| X12 | Le DD ne prévoit ni le secret TOTP, ni les codes à usage unique, ni les sessions, ni les clés de données chiffrées | Tables techniques `facteur_authentification`, `code_usage_unique`, `session_utilisateur`, `cle_donnees` |
| X13 | `notification` est une table journal, mais ses champs `statut` et `remis_le` évoluent après l'envoi | Ligne écrite une fois avec le résultat d'envoi ; l'accusé de remise exigera une exception |
| X14 | À l'installation, un seul administrateur existe : aucune attribution de profil privilégié ne peut être validée par une seconde personne (ORG-RG-044) | L'installation crée deux comptes : Administrateur général et Direction générale ; la Direction générale peut valider ces attributions |
| X15 | Les champs obligatoires de `societe` sont NOT NULL dans le DD, alors que REF-RG-010 prévoit une fiche incomplète qui bloque émissions et écritures | Champs rendus facultatifs en base ; complétude contrôlée par l'application, avec la liste des manques ; une seule fiche possible |
| X16 | Le § 5.5 prévoit des taxes « paramétrables par produit », mais le DD ne relie pas `code_taxe` à `produit` | Table `produit_taxe` (produit, code taxe, date d'effet, date de fin) ; le taux retenu est celui du code en vigueur à la date tarifée |
| X17 | `evenement_metier` est une table journal (ajout seul), mais ses champs `statut`, `tentatives` et `erreur` évoluent pendant la distribution ; un événement a en outre plusieurs destinataires | L'événement publié ne change plus ; sa distribution est suivie par abonné dans la table technique `distribution_evenement` |
| X18 | Le référentiel des motifs de blocage ne permet pas de dire qu'un motif est définitif (décès constaté, § 3.7) | Colonne `motif_blocage_ref.definitif` : un tel motif ne se lève pas |
| — | Signature certifiée ANDE exigée par la Direction (23/11/2026) pour le bulletin, le consentement décès et les acceptations de bénéficiaire et d'offre d'indemnité | Tant qu'aucun prestataire agréé n'est branché, ces documents ne peuvent pas être acceptés par code SMS : refus explicite. Le choix du prestataire est à faire avant le lot 2 |
| — | Collectif de chaque rôle à incidence comptable : non fixé par le CDC | Paramètres `COLLECTIF_*`, valeurs par défaut du § 11.10 (412, 4112, 4113, 4681, 461, 4161) ; comptes créés à l'installation, à rattacher aux états BCRG par le chef comptable |
| — | Formats non fixés par le CDC : code tiers, numéro de réclamation | Proposés : `T` + 9 chiffres ; `REC` + AAAA + 6 chiffres |

## Point d'exploitation

L'ancienne application refuse désormais de démarrer si `JWT_SECRET` est absent, fait moins de 32 caractères ou garde une valeur d'exemple. Avant le prochain déploiement sur le VPS, vérifier que le `.env` de production contient un secret conforme (`openssl rand -hex 32`). Le changer révoque les sessions ouvertes.
