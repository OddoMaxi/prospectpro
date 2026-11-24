# Prospect Pro – Rapport d'analyse de l'existant et plan de réorganisation

| Rubrique | Valeur |
|---|---|
| Objet | Étape 0 (§ 2.1) et étape 1 (§ 2.2) du cahier des charges fonctionnel V1.3 |
| Date | 23/11/2026 |
| Documents de référence | Cahier des charges V1.3 (CDC) ; Dictionnaire des données V1.0 (DD) ; Maquettes des écrans V1.2 |
| Code analysé | Dépôt `prospectpro`, branche `master`, commit `2e72bd9` |
| Statut | À valider par la Direction avant le démarrage du lot 1 |

> **Décision de la Direction du 23/11/2026, confirmée pour ce plan :** aucune donnée réelle n'est conservée. Toutes les données existantes peuvent être supprimées. Le plan ne prévoit donc **aucune reprise de données**, seulement la reprise de la structure et du code utiles.

---

## Partie A – Rapport d'analyse de l'existant (étape 0)

### A.1 Modules, écrans, services et traitements

**Pile technique**

| Couche | Technologie | Remarque |
|---|---|---|
| Serveur | Node.js, Express 4, `pg` (PostgreSQL 16) | Environ 3 500 lignes, 14 fichiers de routes |
| Client | React 18, Vite 5, Tailwind 3, React Router 6, Recharts, jsPDF, write-excel-file | Environ 4 500 lignes de pages et composants |
| Authentification | JWT (8 h), bcrypt | Pas de double authentification |
| Déploiement | Docker Compose (postgres, app, nginx avec Let's Encrypt) sur VPS | `render.yaml` est un vestige à supprimer |
| Traitements planifiés | `jobs.js` : `setInterval` toutes les heures | Inactivité des agents, alertes d'échéance |

**Routes du serveur (API)**

| Fichier | Rôle | Points d'accès principaux |
|---|---|---|
| `auth.js` | Connexion, changement de mot de passe, profil | `POST /login`, `POST /change-password`, `GET /me` |
| `agents.js` | Agents Sénior / Junior, objectifs, transferts, suppression logique | CRUD agents et `/sous-agents` |
| `prospects.js` | Prospection, détection de doublons, conversion en client | CRUD, `POST /doublons`, conversion |
| `clients.js` | Liste et fiche client, suppression logique | `GET /`, `GET /:id`, `DELETE /:id` |
| `contrats.js` | Contrats, périodes, renouvellement, encaissements, résiliation, échéancier | `POST /`, `/echeances`, `/periodes/...`, `/encaissements/...` |
| `factures.js` | Factures mensuelles de commissions, validation, paiements partiels | CRUD, `/paiements/...` |
| `products.js` | Produits (prime pure, coût de police, accessoires, taxe, taux de commission Sénior/Junior) | CRUD, `/active` |
| `branches.js` | Branches (avec taux de taxe) | CRUD |
| `referentiels.js` | Professions et secteurs avec correction approchée | Lecture, proposition |
| `lieux.js` | Régions, communes, quartiers de Guinée | Lecture |
| `stats.js` | Tableaux de bord admin et agent | `GET /dashboard` |
| `admin.js` | Journal d'audit, paramètres, notifications, affectations | `/audit`, `/parametres`, `/notifications`, `/affectations` |
| `professions.js`, `secteurs.js` | **Code mort** : non montés dans `server.js` | À supprimer |

**Écrans du client**

| Espace | Écrans |
|---|---|
| Commun | Connexion, Changement de mot de passe |
| Admin (`/admin`) | Tableau de bord, Agents (liste, création, modification), Branches, Produits (liste, formulaire), Prospects, Clients, Contrats, Échéances, Factures de commissions, Référentiels, Paramètres, Affectations, Journal d'audit |
| Agent (`/agent`) | Tableau de bord, Prospects (liste, formulaire), Clients, Contrats, Échéances, Commissions (factures), Juniors (liste, création) |

**Traitements et utilitaires** : calcul des commissions (`utils/commissions.js`), contrats et périodes (`utils/contrats.js`), tarification (`utils/tarif.js`), affectations et intérim (`utils/affectations.js`), numéro d'agent (`utils/numeroAgent.js`), audit (`utils/audit.js`), notifications internes (`utils/notify.js`), dates sans décalage de fuseau (`utils/dates.js`).

### A.2 Modèle de données actuel

22 tables, créées au démarrage par `initializeSchema()` (`CREATE TABLE IF NOT EXISTS` puis `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`), plus une migration unique `migrations/v2.js` et une vue `v_contrats`.

| Domaine | Tables |
|---|---|
| Utilisateurs et agents | `users` (admin et agents dans la même table ; Sénior = sans parent, Junior = `parent_agent_id`), `agent_product_objectives`, `objectifs_historique` |
| Prospection | `prospects`, `prospect_products` |
| Clients et contrats | `clients`, `contrats`, `contrat_produits`, `contrat_periodes`, `periode_lignes`, `encaissements` |
| Commissions | `commission_lignes`, `factures`, `facture_paiements` |
| Catalogue | `branches`, `products` |
| Transverse | `affectations`, `audit_log`, `parametres`, `notifications`, `referentiels`, `lieux` |

**Constats sur la structure**

- **Aucune clé étrangère** (`REFERENCES` absent) : l'intégrité référentielle repose uniquement sur le code.
- Identifiants en `TEXT` (UUID générés par l'application), pas en `uuid` natif.
- **Montants en `REAL` / `DOUBLE PRECISION`** : contraire à FIN-RG-077 et au DD § 2.2 (entiers GNF, `bigint`).
- Dates de contrat parfois en `TEXT` (`clients.date_effet`, `date_fin`) : vestiges de la V1.
- Pas de colonnes techniques communes (`version_ligne`, `modifie_par`) ni de verrou optimiste.
- Suppression logique déjà présente (`deleted_at`, `deleted_by`) : principe conforme au DD § 2.4.
- **Pas de migrations versionnées et réversibles** : contraire à DEV-RG-002.

### A.3 Authentification, rôles et droits

| Élément | Existant | Exigence du CDC | Écart |
|---|---|---|---|
| Rôles | 2 rôles en dur : `admin`, `agent` (Sénior/Junior déduit de `parent_agent_id`) | Profils paramétrables, droits fonction × action, périmètre et période (ORG-RG-040) | Total |
| Contrôle | Côté serveur par middleware (`requireAdmin`, `requireAgent`, `requireSenior`) | Côté serveur, par droit et par périmètre (CA-ORG-03) | Granularité insuffisante |
| Mot de passe | bcrypt, changement obligatoire à la première connexion | Politique paramétrable, double authentification (ORG-RG-022) | Pas de double authentification |
| Échecs de connexion | Non comptés | Suspension après N échecs (ORG-RG-023) | Absent |
| Suspension | Statut relu à chaque requête (effet immédiat) | Idem | **Conforme, à conserver** |
| Séparation des tâches | Absente | ORG-RG-042, 044 | Absent |
| Secret JWT | Valeur par défaut codée en dur si la variable d'environnement manque | Aucune valeur sensible en dur | **Faille à corriger dès le lot 1** |
| Journal d'audit | `audit_log` : auteur, action, objet, avant / après | Inaltérable (empreinte chaînée), adresse IP et appareil, consultations sensibles (§ 4.6) | Partiel |

### A.4 Intégrations existantes

| Intégration | Existant |
|---|---|
| SMS | Aucune : la relance ouvre l'application SMS du téléphone avec un message pré-rempli (`sms:`) |
| WhatsApp | Aucune API : lien `wa.me` pré-rempli |
| Monnaie électronique | Aucune : les encaissements sont saisis à la main |
| Courriel | Aucun envoi |
| Stockage de fichiers | Aucun : pas de gestion électronique des documents, pas de photos |
| Exports | PDF (jsPDF) et Excel générés dans le navigateur |

Toutes les intégrations du CDC sont donc **nouvelles** : passerelle SMS et codes à usage unique, API WhatsApp Business, opérateurs de monnaie électronique, prestataire de signature agréé ANDE, import des relevés bancaires et stockage des documents.

### A.5 Classement des besoins du CDC

Statuts : **C** = existant à conserver, **A** = existant à améliorer, **N** = nouveau à développer, **D** = doublon (mutualisé vers le composant maître).

| Chap. | Besoin | Statut | Existant concerné | Impact |
|---|---|---|---|---|
| 3 | Organisation du menu par département | A | Deux mises en page (admin / agent), déjà fusionnées en une seule | Moyen |
| 3.4 | Événements métier et table d'événements (outbox) | N | — | Fort (structurant) |
| 3.5 | Moteur de notifications (SMS, WhatsApp, courriel, application) | A | `notifications` internes, `RelanceModal` | Fort |
| 3.6 | Neuf moteurs communs | N | Partiellement : `utils/` | Fort |
| 3.7 | Moteur de droits et motifs de blocage | N | — | Fort (lot 3) |
| 3.9 | Dématérialisation, dossier de preuve, signature | N | — | Fort |
| 4.3 | Organisation paramétrable (départements, services, fonctions, fusion, scission) | N | — | Moyen |
| 4.4 | Utilisateurs nominatifs, double authentification, verrouillage | A | `users`, `auth.js` | Moyen |
| 4.5 | Profils, droits, périmètres, délégations, intérim, séparation des tâches | N | Rôles en dur | Fort |
| 4.6 | Journal d'audit inaltérable | A | `audit_log`, écran `AuditLog` | Faible |
| 5.2 | Fiche de la Compagnie historisée | N | — | Faible |
| 5.3 | Référentiel unique des tiers, foyers | A | `prospects` et `clients` en double : **D** à fusionner dans `tiers` | Fort |
| 5.3 | Détection de doublons | A | `POST /prospects/doublons` | Faible |
| 5.4 | Bureaux directs | N | — | Faible |
| 5.5 | Catalogue produit → formule → garantie, versionné | A | `branches`, `products` (prime pure, coût de police, accessoires, taxe) | Fort |
| 5.6 | Nomenclatures (actes, médicaments, CIM-10), jours fériés | N | `lieux`, `referentiels` (professions, secteurs) à conserver | Moyen |
| 6 | Numérotation (police 15 chiffres MOD 97-10, quittances, cartes…) | A | `numeroAgent.js`, numéros de contrat et de facture | Moyen |
| 7.5.1–4 | Dépôts des agents, émission sur dépôt, annulation pour erreur | N | — | Fort |
| 7.5.5 | Rémunération : barèmes par rôle, clé de répartition, relevés bimensuels | A | `commission_lignes`, `factures` (factures mensuelles), taux Sénior / Junior sur le produit | Fort |
| 7.5.7 | Agents généraux (personne physique ou morale), juniors, prescripteurs | A | `users` (type physique / morale, parent) | Moyen |
| 7.5.8 | Portefeuille, mouvements de portefeuille | A | `affectations` et transfert automatique en cas d'inactivité | Moyen (voir A.6) |
| 7.5.9 | Prescripteurs et codes (homoglyphes, distance d'un caractère) | N | Normalisation existante dans `utils/text.js` réutilisable | Faible |
| 7.5.10 | Cellule Canal digital | N | — | Moyen |
| 7.5.11 | Cartes professionnelles | N | — | Faible |
| 7.5.12 | Tableaux de bord du portefeuille | A | `stats.js`, `AgentDashboard` | Moyen |
| 8.3–8.4 | Parcours de souscription en 8 étapes, émission en transaction unique | A | Conversion prospect → client → contrat | Fort |
| 8.5 | Bénéficiaires du capital décès, consentements | N | `nb_beneficiaires` (simple compteur) | Moyen |
| 8.6 | Contrats collectifs, collèges, appels de prime, régularisations | N | — | Fort (lot 4) |
| 8.7 | Renouvellement automatisé, statuts ÉCHUE / SUSPENDUE / EXPIRÉE | A | `contrat_periodes`, échéancier J-60/45/30, statut calculé dans `v_contrats` | Moyen |
| 8.8–8.9 | Avenants, résiliation, « ne pas renouveler » | A | Résiliation avec rétrocession | Moyen |
| 8.10 | Module unique des réclamations | N | — | Faible |
| 8.11–8.12 | Souscription en ligne, versements programmés | N | — | Moyen |
| 9 | Santé : prestataires, cartes, prises en charge, carnet, factures, téléconsultation | N | — | Très fort (lot 3) |
| 10 | Sinistres accident et décès | N | — | Fort (lot 4) |
| 11 | Comptabilité BCRG complète | N | `encaissements` (saisie manuelle) à remplacer | Très fort (lot 2) |
| 12 | Conformité, vigilance, criblage, protection des données | N | — | Moyen |
| 13 | Réassurance, coassurance (« Prévu ») | N | — | Modèle de données seulement |
| 14 | États BCRG, tableaux de bord par département | A | `stats.js` | Fort (lot 5) |
| 15 | Exigences techniques (performance, double authentification, chiffrement, sauvegardes, tests) | A | Docker Compose, HTTPS | Fort |

**Bilan :** environ 85 % du périmètre est nouveau. L'existant à conserver ou améliorer est concentré dans la prospection, le catalogue, les contrats et périodes, le calcul des commissions, l'audit, les référentiels géographiques et le déploiement.

### A.6 Points de vigilance

**Dettes techniques**

1. **Schéma recréé au démarrage, sans migrations versionnées** : bloquant pour DEV-RG-002. Il faut mettre en place un outil de migrations avant toute autre chose.
2. **Montants en virgule flottante** : risque d'arrondi incompatible avec FIN-RG-077. Tout passe en `bigint`.
3. **Aucune clé étrangère ni contrainte de base** : les contrôles exigés par le CDC « en base » (solde ≥ 0, consommé + réservé ≤ plafond, unicité des compteurs) sont impossibles sans refonte du schéma.
4. **Aucun test automatisé** (seul un script de recette d'API existe) : bloquant pour DEV-RG-005 et 006.
5. **Pas de transactions avec verrous sur les compteurs** : la numérotation sans trou ni doublon (CA-NUM-04, 100 émissions simultanées) n'est pas garantie.
6. **Secret JWT par défaut codé en dur** : faille de sécurité.
7. **Code mort** (`professions.js`, `secteurs.js`) et configuration obsolète (`render.yaml`).
8. **Traitements planifiés par `setInterval`** dans le processus web : pas de reprise après redémarrage ni d'idempotence. Le CDC demande des traitements idempotents (outbox).

**Écarts fonctionnels entre l'existant et le CDC, à arbitrer**

| # | Existant | CDC V1.3 | Proposition |
|---|---|---|---|
| E1 | Transfert automatique du portefeuille d'un agent inactif vers un intérimaire, restitué à son retour | Mouvement de portefeuille validé par la Direction commerciale ; transfert d'office d'un junior seulement dans 4 cas (COM-RG-073) | Remplacer par le mouvement de portefeuille. L'inactivité ne déclenche plus qu'une alerte et une proposition |
| E2 | Commission acquise quand la prime est intégralement payée, factures mensuelles par agent | Commission acquise à l'encaissement (identique), relevé bimensuel par bénéficiaire, paiements séparés (COM-RG-042, 043) | Conserver le moteur de calcul, remplacer les factures par des relevés et la chaîne de paiement |
| E3 | Taux Sénior / Junior saisis sur le produit | Barème par produit et par rôle, plus une clé de répartition par police (COM-RG-040) | Migrer vers `bareme_commission` et `police_intervenant` |
| E4 | Prime de performance si renouvellement anticipé d'au moins 1 mois | Prime de renouvellement anticipé si payée au moins 30 jours avant (COM-RG-046) | Même règle, à renommer et à paramétrer en jours |
| E5 | Encaissements saisis à la main, paiements partiels | Pas de crédit de prime : contrat émis seulement après paiement complet (principe 1.4) | Supprimer les paiements partiels sur les contrats individuels |
| E6 | Rétrocession totale à la résiliation | Annulation pour erreur sous 48 h, sinon résiliation sans ristourne sauf paramétrage (PROD-RG-061) | Appliquer le CDC |
| E7 | Prospect et client = deux fiches distinctes | Une seule fiche tiers (REF-RG-003) | Fusionner dans `tiers` |

**Écarts entre les maquettes V1.2 et le CDC V1.3 :** les maquettes sont antérieures d'un jour aux arbitrages de la V1.3. **La règle du CDC V1.3 prévaut** ; les maquettes servent de référence visuelle.

| Maquette | Écart | Règle appliquée |
|---|---|---|
| 21 (Polices à renouveler) | Statut « SUSPENDUE – jour 15/30 » pour une échéance impayée | ÉCHUE en délai de remise en vigueur ; SUSPENDUE réservé à l'art. 30 (B5) |
| 30 (Contrôle des factures) | Motif « Intervalle minimal non respecté » | Ligne supprimée ; règle de la consultation de contrôle (B6, SAN-RG-024) |
| 42 (Paramètres comptables) | « Exercices ouverts 2 / 5 » | 2 au maximum (FIN-RG-071) |
| 47 (Clôtures) | Dotations aux amortissements en journal OD | Journal AUT (C3) |
| 67 et 68 | Numéros « BEX… » et « ORD… » | Préfixes BA / BX et BO (§ 6.3) |
| 12, 52 à 57 | Terme « agent senior » | « Agent général » (D20) |
| 34 et 48 | Validation DG au-delà de 200 000 000 | Seuils pris dans le référentiel des délégations, jamais en dur |

**Dépendances extérieures bloquantes**

| Réponse attendue | Bloque | Repli prévu |
|---|---|---|
| Qualification des dépôts par la BCRG (CONF-RG-009) | Conception du lot 2 | Mode PAIEMENT_DIRECT (COM-RG-027), développé de toute façon au lot 2 |
| Avis du juriste interne sur la signature électronique, le recommandé électronique, le délai de renonciation et la prescription | Lot 2 (dossier de preuve) | Niveau de signature paramétrable par type de document (DIG-RG-002) |
| Choix des fournisseurs : SMS, WhatsApp Business, opérateurs de monnaie électronique, prestataire ANDE | Lots 2 et 3 | Interfaces avec un simulateur en recette |
| Plan comptable BCRG (fichier), taux de taxes, taux légal de l'art. 368 | Bascule | Paramètres saisis à la bascule |
| Hébergeur des données de santé validé par la Conformité (CONF-RG-008) | Mise en production du lot 3 | — |

---

## Partie B – Plan de réorganisation (étape 1)

### B.1 Principes techniques retenus

| Sujet | Choix | Justification |
|---|---|---|
| Pile | Conserver Node / Express / PostgreSQL et React / Vite | Couvre la cible ; pas de refonte technologique (« évolution, pas refonte ») |
| Langage serveur | Introduire TypeScript progressivement, module par module | Sûreté de typage sur 154 tables et un moteur comptable |
| Migrations | `node-pg-migrate` : fichiers numérotés, `up` et `down`, rejoués en recette (DEV-RG-002) | Versionné, testé, réversible |
| Schéma | Nouveau schéma conforme au DD : `uuid` natif, clés étrangères, `bigint` pour les montants, colonnes techniques communes, contraintes en base | Contrôles d'intégrité I-01 à I-17 |
| Organisation du code | Un dossier par domaine : `backend/src/modules/{socle, referentiels, commercial, production, sante, sinistres, finances, conformite}`, chacun avec routes, service et accès aux données | « Une donnée, un propriétaire » (DD § 2.5) |
| Moteurs communs | `backend/src/moteurs/{tiers, contrat, droits, regles, documents, comptable, validation, notifications, numerotation, paiements}` | CDC § 3.6 |
| Événements | Table `evenement_metier` écrite dans la transaction ; distributeur idempotent pour les effets asynchrones | CDC § 3.1 |
| Traitements planifiés | Ordonnanceur avec verrou en base (`pg-boss`), à la place de `setInterval` | Reprise après redémarrage, idempotence |
| Tests | `node:test` et `supertest` sur une base PostgreSQL dédiée ; un test par critère d'acceptation (CA-xxx-nn) | DEV-RG-005, 006 |
| Double authentification | Code à usage unique par SMS (TOTP en secours) | ORG-RG-022 |
| Données sensibles | Chiffrement des colonnes avec `pgcrypto`, clé hors application | SAN-RG-052, § 15 |
| Documents | Génération PDF côté serveur depuis des modèles versionnés ; stockage objet compatible S3 (MinIO sur le VPS) | DIG-RG-001, 007 |
| Interfaces externes | Adaptateurs (SMS, WhatsApp, opérateurs, ANDE, banques) avec un simulateur en recette | Recette sans dépendre des fournisseurs |
| Client | Une seule application React, cinq espaces avec leur mise en page : back-office, application agent (installable, utilisable hors ligne), portail prestataire, espace assuré, espace déclarant | Mutualisation (Requête technique) ; maquettes |

### B.2 Stratégie de données

Conformément à la décision de la Direction, **aucune reprise de données** :

1. Le nouveau schéma est créé par la migration `0001` sur une **base vide**.
2. L'ancien `initializeSchema()` et `migrations/v2.js` sont retirés.
3. Le script `scripts/reset-db.js` est remplacé par un script de chargement du **jeu de données fictif de recette** (§ 2.5).
4. **À la bascule :** la base de production est sauvegardée une dernière fois, puis vidée et recréée. Ensuite on importe les référentiels réels (bureaux, agents, prestataires, produits, plan comptable, soldes d'ouverture, paramètres).

### B.3 Correspondance des menus actuels avec l'architecture cible

| Menu actuel | Département cible | Évolution |
|---|---|---|
| Tableau de bord admin | Direction générale | Tableaux de bord par département (§ 14.2) |
| Agents | Commercial › Réseau d'agents | Agents généraux, juniors, prescripteurs ; agrément, cartes professionnelles |
| Juniors (espace agent) | Application agent › Mon réseau | Création et validation par l'agent général |
| Branches, Produits | Production › Catalogue | Produit → formule → garantie, versionné, validé par le comité de paramétrage |
| Prospects | Commercial et application agent | Exclusivité de 90 jours, code prescripteur |
| Clients | Référentiel des tiers (commun) | Fiche tiers unique, foyers |
| Contrats, Échéances | Production › Polices, Polices à renouveler | Souscription en 8 étapes, renouvellement, avenants |
| Factures de commissions | Commercial › Relevés de commissions | Relevés bimensuels et chaîne de paiement |
| Référentiels, Paramètres | Administration et SI | Paramètres historisés, règles légales, nomenclatures |
| Affectations | Commercial › Mouvements de portefeuille | Validés par la Direction commerciale |
| Journal d'audit | Administration et SI | Inaltérable, revue des habilitations |

### B.4 Ordre de mise en œuvre

L'ordre suit le § 2.3 du CDC. Chaque lot est livré avec ses migrations, ses tests automatisés, la documentation de ses paramètres et un compte rendu (DEV-RG-005), puis recetté sur l'environnement de test avant de passer au suivant.

**Lot 1 – Socle** (chapitres 3 à 6)

| Sous-lot | Contenu | Critères d'acceptation |
|---|---|---|
| 1.0 Fondations | Outil de migrations, nouveau schéma de base, colonnes techniques, tests, environnement de recette, correction du secret JWT, suppression du code mort | — |
| 1.1 Organisation | Départements, services, fonctions, historique, fusion et scission avec simulation | CA-ORG-01, 02 |
| 1.2 Habilitations | Utilisateurs, double authentification, verrouillage, profils, droits, périmètres, incompatibilités, délégations, intérim | CA-ORG-03 à 06 |
| 1.3 Audit et paramètres | Journal d'audit chaîné, paramètres historisés, règles légales verrouillées, comité de paramétrage | — |
| 1.4 Référentiels | Fiche de la Compagnie, tiers et foyers, doublons, coordonnées de paiement, bureaux, catalogue versionné, nomenclatures, jours fériés | CA-REF-01 à 09 |
| 1.5 Moteurs communs | Numérotation (MOD 97-10, compteurs verrouillés), documents, notifications, validation, événements | CA-NUM-01 à 09 |
| 1.6 Client | Mise en page par département, menus selon les droits, écrans des maquettes 1 à 11 et 19 | — |

**Lot 2 – Production et finances** (chapitres 7, 8, 11) : dépôts des agents, souscription individuelle et en ligne, émission, renouvellement, versements programmés, bénéficiaires, rémunération et relevés, moteur comptable avec plan de comptes, journaux et schémas EVT, trésorerie, taxes sur primes, provision pour primes non acquises, clôture mensuelle, signature ANDE, mode PAIEMENT_DIRECT. Critères CA-COM, CA-PROD (sauf collectifs), CA-FIN-01 à 21 et 30 à 34.

**Lot 3 – Santé** (chapitre 9) : moteur de droits complet et motifs de blocage, cartes, prestataires et professionnels, annuaire, portails prestataire et pharmacie, prises en charge, urgence, hospitalisation, carnet de santé chiffré, factures et facture mensuelle, téléconsultation, mode dégradé, provision pour sinistres à payer. Critères CA-SAN-01 à 32. Les produits santé ne sont ouverts à la vente qu'après la recette de ce lot.

**Lot 4 – Collectifs et sinistres** (§ 8.6, chapitre 10) : contrats collectifs, profil entreprise et groupement, appels de prime, mouvements d'effectif, régularisations, mise en demeure de l'art. 30 ; sinistres, déclarants, pièces, expertises, provisions, décisions, offres, règlements, recours. Critères CA-PROD-08 à 16, 20, 21 et CA-SIN-01 à 12.

**Lot 5 – Pilotage et clôture** (chapitres 11, 12, 14) : immobilisations et amortissements, clôture annuelle, états BCRG, tableaux de bord par département, conformité avancée (vigilance, criblage, alertes, droits des personnes). Critères CA-FIN-22 à 29 et CA-CONF-01 à 04.

**Prévu** (chapitre 13 et fonctions marquées « Prévu ») : tables créées vides avec leurs points d'extension, sans écran ni traitement.

**Bascule** : après la recette des lots 1 et 2, juste avant la première mise en production (voir B.2).

### B.5 Plan de retour arrière

- Chaque migration a sa fonction `down`, testée en recette : on peut revenir à la version précédente du schéma.
- Sauvegarde complète de la base avant chaque mise en production, avec restauration testée (exigence § 15).
- Images Docker étiquetées par version : on revient à l'image précédente en une commande.
- Les nouvelles fonctions sont activables par paramètre (DEV-RG-003) : on peut en désactiver une sans redéployer.
- La version actuelle reste sur sa branche Git jusqu'à la bascule.

### B.6 Livrables par lot

À chaque lot : code ; migrations ; tests automatisés rejoués à chaque livraison ; documentation des paramètres ; compte rendu (fichiers modifiés, règles implémentées, résultats des tests) ; mise à jour de la matrice de correspondance (L05) et du registre des doublons (L06).

### B.7 Décisions demandées à la Direction

1. Valider ce rapport et ce plan, en particulier les arbitrages E1 à E7 (A.6) et la règle « le CDC V1.3 prévaut sur les maquettes V1.2 ».
2. Valider les choix techniques de B.1 : TypeScript progressif, stockage MinIO sur le VPS et ordonnanceur `pg-boss`.
3. Lancer pendant le lot 1 les demandes extérieures : courrier à la BCRG, avis du juriste, choix des fournisseurs SMS, WhatsApp, monnaie électronique et ANDE.
4. Fournir avant la recette du lot 2 : le fichier du plan comptable BCRG, les taux de taxes et le taux légal de l'art. 368.
5. Confirmer l'environnement de recette, séparé de la production (§ 2.5) : second conteneur sur le même VPS ou serveur distinct.
