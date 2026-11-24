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
| Tests automatisés (base PostgreSQL réelle) | `server/test/` : `npm test` |

## Avancement

| Sous-lot | Réalisé | Reste à faire |
|---|---|---|
| 1.0 Fondations | Secret JWT obligatoire (ancienne application comprise) ; code mort et `render.yaml` retirés ; migrations versionnées avec retour arrière testé ; schéma DD complet avec clés étrangères, montants entiers, énumérations contrôlées en base, colonnes techniques, verrou optimiste, suppression physique interdite, tables journal en ajout seul ; socle de tests | Ordonnanceur `pg-boss` ; serveur de recette ; intégration continue |
| 1.1 Organisation | Départements, services, fonctions ; renommage, désactivation contrôlée ; déplacement, fusion, scission simulés puis validés ; organigramme à toute date | Écrans |
| 1.2 Habilitations | Comptes nominatifs ; profils et droits de l'annexe B (correctifs V1.3) ; périmètres contrôlés côté serveur ; incompatibilités ; profils privilégiés validés par une seconde personne ; délégations ; intérims ; mot de passe Argon2id ; verrouillage ; second facteur SMS et TOTP avec codes de secours ; sessions révocables | Revue semestrielle des habilitations (ORG-RG-045) ; écrans |
| 1.3 Audit et paramètres | Journal chaîné et vérifiable ; consultations sensibles et exports tracés ; masquage des secrets ; paramètres historisés de l'annexe C ; règles légales verrouillées ; comité de paramétrage | Écrans |
| 1.4 Référentiels | Tiers : création, doublons, nature figée ; bureaux : codes 01 à 99 jamais réutilisés, alerte de capacité, filtrage par périmètre | Fiche Compagnie historisée ; foyers ; coordonnées de paiement chiffrées ; rôles et comptes auxiliaires ; catalogue versionné ; nomenclatures ; jours fériés |
| 1.5 Moteurs communs | Numérotation (formats des § 6.1 et 6.3, clé MOD 97-10, concurrence) ; validation ; notifications avec simulateur SMS ; chiffrement par enveloppe (local et Vault Transit) | Documents PDF/A ; événements (outbox) ; réclamations ; motifs de blocage |
| 1.6 Interface | — | Mise en page par département, écrans du socle selon la maquette |

## Critères d'acceptation vérifiés par les tests

CA-ORG-01, 02, 03 (par appel HTTP direct), 04, 05, 06 ; CA-NUM-01 à 09 (dont 100 émissions simultanées) ; CA-REF-01.

## Nouveaux écarts à soumettre à la maîtrise d'ouvrage

| N° | Constat | Disposition retenue |
|---|---|---|
| X9 | Le journal d'audit chaîné exige un ordre strict des lignes, absent du DD | Colonne technique `journal_audit.rang` |
| X10 | `demande_validation` ne permet pas de conserver l'opération proposée (fusion, changement de paramètre, fiche Compagnie) | Colonnes `donnees` et `decide_le` |
| X11 | `historique_organisation.valide_par` est obligatoire, alors que seuls le déplacement, la fusion et la scission exigent une seconde validation (ORG-RG-005) | Obligatoire pour ces trois opérations seulement, contrôlé en base |
| X12 | Le DD ne prévoit ni le secret TOTP, ni les codes à usage unique, ni les sessions, ni les clés de données chiffrées | Tables techniques `facteur_authentification`, `code_usage_unique`, `session_utilisateur`, `cle_donnees` |
| X13 | `notification` est une table journal, mais ses champs `statut` et `remis_le` évoluent après l'envoi | Ligne écrite une fois avec le résultat d'envoi ; l'accusé de remise exigera une exception |
| X14 | À l'installation, un seul administrateur existe : aucune attribution de profil privilégié ne peut être validée par une seconde personne (ORG-RG-044) | L'installation crée deux comptes : Administrateur général et Direction générale ; la Direction générale peut valider ces attributions |
| — | Formats non fixés par le CDC : code tiers, numéro de réclamation | Proposés : `T` + 9 chiffres ; `REC` + AAAA + 6 chiffres |

## Point d'exploitation

L'ancienne application refuse désormais de démarrer si `JWT_SECRET` est absent, fait moins de 32 caractères ou garde une valeur d'exemple. Avant le prochain déploiement sur le VPS, vérifier que le `.env` de production contient un secret conforme (`openssl rand -hex 32`). Le changer révoque les sessions ouvertes.
