# Prospect Pro – Rapport d'analyse de l'existant et plan de réorganisation – version 1.1

| Rubrique | Valeur |
|---|---|
| Objet | Étapes 0 et 1 (§ 2.1 et 2.2 du cahier des charges), version 1.1 demandée par la Direction le 24/11/2026 (réponse au rapport L0, section 7) |
| Date | 24/11/2026 |
| Remplace | Version 1.0 du 23/11/2026 |
| Références | Cahier des charges fonctionnel V1.4 du 24/11/2026 (CDC) ; Dictionnaire des données 1.1 du 24/11/2026 (DD) ; Réponse de la Direction au rapport L0 du 24/11/2026 ; Maquette des écrans V1.1 et Guides d'utilisation 1.1 (non encore reçus, voir 0.3) |
| Code analysé | Dépôt `prospectpro`, branche `master`, commit `2e72bd9` |
| Livrables joints | L05 – Matrice de correspondance (`L05-matrice-correspondance.pdf`) ; L06 – Registre des doublons (`L06-registre-doublons.pdf`) |
| Statut | Soumis à la validation de la Direction ; le lot 1 démarre à cette validation |

---

## 0. Réponse aux demandes de la Direction

### 0.1 Suivi des sept demandes (section 7 de la réponse)

| # | Demande | Où elle est traitée |
|---|---|---|
| 1 | Mettre à jour le rapport sur le CDC V1.4, le DD 1.1 et la maquette V1.1 | Parties A et B du présent document. Pour la maquette V1.1 : voir 0.3 |
| 2 | Matrice de correspondance (L05) et registre des doublons (L06) | Documents joints |
| 3 | Chiffrage par lot en jours-personnes, intégrations et simulateurs compris | Partie C |
| 4 | Calendrier par lot, avec dates de recette et de mise en production | Partie D |
| 5 | Registre des risques | Partie E |
| 6 | Architecture d'hébergement de niveau B, coût et procédure de test de restauration | Partie F |
| 7 | Chiffrement applicatif et gestion des clés en remplacement de pgcrypto | Partie G |

### 0.2 Décisions de la Direction intégrées

| Domaine | Décision du 24/11/2026 | Effet dans le présent rapport |
|---|---|---|
| Arbitrage E2 | Rejeté : la facture mensuelle de commissions est conservée | `factures.js` et `facture_paiements` classés « Existant à améliorer » (A.5, L05) |
| Compte de production | Remplace le « dépôt » : compte de garantie, montant minimum paramétré | Terminologie corrigée partout ; lot 2 corrigé (B.4) |
| BCRG | Aucune démarche autre que l'agrément | Dépendance retirée ; PAIEMENT_DIRECT est une option, pas un repli |
| Double authentification | TOTP principal pour les comptes à privilèges ; SMS pour les agents et les prestataires | B.1, sous-lot 1.2 |
| pgcrypto | Refusé | Remplacé par le chiffrement applicatif par enveloppe (partie G) |
| Hébergement | Niveau B obligatoire ; recette sur serveur distinct | Partie F |
| Journalisation | Consultations sensibles tracées dès le lot 1 | Sous-lot 1.3 |
| Intégrations | Aucune réutilisable ; adaptateurs et simulateurs à chiffrer | Partie C, ligne « Intégrations » de chaque lot |

### 0.3 Documents non encore reçus

La **maquette des écrans V1.1** (99 écrans AD-01 à MD-01) et les **guides d'utilisation 1.1** n'ont pas été transmis au prestataire. Les parties fonctionnelles du présent rapport reposent sur le CDC V1.4, qui prévaut. La correspondance écran par écran (colonne « Écrans » de L05) sera complétée à leur réception, sans effet attendu sur le chiffrage au-delà de ± 5 % sur la part « interface ».

### 0.4 Écarts relevés dans le CDC V1.4 et le DD 1.1

Le CDC (§ 1.1) demande de signaler toute divergence à la maîtrise d'ouvrage. Les écarts ci-dessous ont été relevés à la lecture croisée des deux documents et du code. Aucun n'est bloquant pour le lot 1, mais chacun doit être tranché avant le lot indiqué.

| # | Écart | Documents | Proposition | Avant |
|---|---|---|---|---|
| X1 | Le DD impose **une seule facture de commissions par intervenant et par mois** (unicité `intervenant_id, mois`). Or la dernière évolution de Prospect Pro (commit `2e72bd9`) autorise plusieurs factures par mois, une seule restant en brouillon. | DD § 6.10 ; code | Appliquer le DD : une facture par mois. Une commission acquise après l'émission est portée sur la facture du mois suivant (règle déjà en vigueur dans Prospect Pro) et une reprise passe par un avoir (COM-RG-121). **Retrait d'une fonction existante : validation écrite requise (DEV-RG-001).** | Lot 2 |
| X2 | Le schéma comptable est limité à « EVT-01 à EVT-26 », alors que le CDC V1.4 crée EVT-27 (affectation au compte de production). | DD § 10.8 ; CDC § 11.13 | Étendre à EVT-27 | Lot 2 |
| X3 | Restes de l'ancien terme « dépôt » : valeur `DEPOT` de `police.mode_emission`, valeur `REMBOURSEMENT_DEPOT` de `ordre_paiement.type`, événements `DEPOT_CONFIRME` et `DEPOT_REMBOURSE`, journal `DEP`, reçu `DEP…`. | DD § 7.2, 10.24 ; CDC § 3.4, 6.3, 11.7 | Renommer en `COMPTE_PRODUCTION`, `RESTITUTION_COMPTE_PRODUCTION`, `APPRO_CONFIRME`, `COMPTE_PRODUCTION_RESTITUE`. Le code journal `DEP` et le préfixe de reçu peuvent rester : ce sont des paramètres. | Lot 1 (énumérations) |
| X4 | Le numéro de facture de commissions `FC + AAAA + MM + 6 chiffres` figure au DD mais pas dans la liste des numérotations du § 6.3. | DD § 6.10 ; CDC § 6.3 | L'ajouter au § 6.3 | Lot 1 (numérotation) |
| X5 | SAN-RG-033 est déclaré supprimé (annexe G, D10), mais il est encore cité par le DD (ligne d'ordonnance, contrôle I-08). Inversement, SAN-RG-082 est cité en annexe G (D19) sans être défini au chapitre 9. | DD § 8.13, 14 ; CDC annexe G | Rattacher I-08 à SAN-RG-031 ; confirmer que D19 renvoie au chapitre 15 | Lot 3 |
| X6 | Les statuts des prospects diffèrent : l'existant utilise `prospect, en_cours, perdu, converti`, le DD `NOUVEAU, CONTACTE, INTERESSE, CONVERTI, PERDU`. | DD § 13 ; code | Adopter les cinq statuts du DD. L'interface actuelle de prospection sera adaptée. | Lot 1 |
| X7 | Le DD renvoie les énumérations au « chapitre 8 » au lieu du chapitre 13. | DD § 2.2 | Coquille de rédaction | — |
| X8 | `utilisateur.tiers_id` est obligatoire. Or le premier compte administrateur est créé à l'installation, avant toute fiche tiers. | DD § 4.5 | Le script d'installation crée la fiche tiers de l'Administrateur général dans la même transaction | Lot 1 |

**Exemples chiffrés du CDC vérifiés par calcul :**
- clés MOD 97-10 des quatre numéros de police (§ 6.1 et CA-NUM-09), ainsi que le rejet de CA-NUM-06 ;
- provision pour primes non acquises du cas 5 : 4 330 959 ;
- dotation du cas 7 : 892 274 ;
- prorata de CA-PROD-09 : 2 910 000 ;
- prorata de CA-PROD-10 : 920 000.

Tous sont exacts. Ils deviennent des jeux d'essai des tests automatisés.

---

## Partie A – Analyse de l'existant (mise à jour)

L'analyse détaillée de l'existant (A.1 à A.4 de la version 1.0) a été acceptée sans réserve. Elle reste valable et n'est pas reproduite ici. Seuls changent le classement des besoins (A.5) et les points de vigilance (A.6).

Rappel des constats principaux :
- 22 tables ;
- aucune clé étrangère ;
- montants en virgule flottante ;
- schéma recréé au démarrage, sans migrations versionnées ;
- deux rôles codés en dur ;
- secret JWT par défaut codé en dur ;
- aucune intégration externe ;
- aucun test automatisé.

### A.3 bis – Journalisation (complément demandé)

Le journal actuel (`audit_log`) ne trace que les modifications. Dès le sous-lot 1.3, le journal d'audit (`journal_audit`, DD § 4.13) tracera aussi :
- les connexions et les échecs de connexion ;
- les consultations sensibles : fiche de coordonnées de paiement, pièces d'identité, carnet de santé et toute donnée médicale (cette dernière via `journal_acces_carnet` au lot 3) ;
- les exports.

Chaque ligne porte l'adresse IP, l'appareil et une empreinte chaînée.

### A.5 – Classement des besoins du CDC V1.4

Statuts : **C** = existant à conserver ; **A** = existant à améliorer ; **N** = nouveau ; **D** = doublon, mutualisé vers le composant maître (détail dans L06). Le classement règle par règle figure dans L05.

| Chap. | Besoin | Statut | Composant existant | Impact |
|---|---|---|---|---|
| 3.1–3.4 | Organisation par département, événements métier (table d'événements écrite dans la même transaction) | A / N | Mise en page unique (`Layout.jsx`) | Fort |
| 3.5 | Notifications multicanal | A | `notifications` (interne), `RelanceModal` (D) | Fort |
| 3.6 | Neuf moteurs communs | N | Embryons dans `utils/` | Fort |
| 3.7 | Moteur de droits et motifs de blocage | N | — | Fort (lot 3) |
| 3.8 | Comité de paramétrage | N | — | Faible |
| 3.9 | Dématérialisation, dossier de preuve, signature ANDE | N | — | Fort |
| 4.3 | Organisation paramétrable, fusion et scission | N | — | Moyen |
| 4.4 | Utilisateurs nominatifs, double authentification, verrouillage | A | `users`, `auth.js` | Moyen |
| 4.5 | Profils, droits, périmètres, délégations, intérim, séparation des tâches | N | Rôles codés en dur (D) | Fort |
| 4.6 | Journal d'audit inaltérable, consultations sensibles | A | `audit_log`, `AuditLog.jsx` | Moyen |
| 5.2 | Fiche de la Compagnie historisée | N | — | Faible |
| 5.3 | Tiers unique, foyers, doublons, coordonnées de paiement | A | `prospects` + `clients` (D) ; `POST /prospects/doublons` | Fort |
| 5.4 | Bureaux | N | — | Faible |
| 5.5 | Catalogue produit → formule → garantie, versionné, taxes | A | `branches`, `products` | Fort |
| 5.6 | Nomenclatures, jours fériés, paramètres historisés | A | `parametres`, `referentiels`, `lieux` | Moyen |
| 6 | Numérotation (police à 15 chiffres, MOD 97-10, autres numéros) | A | `numeroAgent.js`, numéros de contrat et de facture | Moyen |
| 7.5.1–7.5.4 | **Comptes de production** : approvisionnement, émission, annulation pour erreur | **N** | — | Fort |
| 7.5.5 | **Rémunération : facture mensuelle par commercial**, paiements fractionnés, retenue à la source, affectation au compte de production, avoir | **A** | `factures.js`, `facture_paiements`, `commission_lignes`, `utils/commissions.js` | Moyen |
| 7.5.6 | Restitution, gel, inactivité | A | Job d'inactivité de `jobs.js` (sa logique de transfert devient une simple alerte, E1) | Moyen |
| 7.5.7 | Agents généraux, collaborateurs, juniors, prescripteurs, agrément | A | `users` (Sénior / Junior), `AgentForm.jsx` | Moyen |
| 7.5.8 | Portefeuille, titulaire / apporteur / prescripteur, mouvements | A | `affectations`, `TransferModal.jsx` | Moyen |
| 7.5.9 | Prescripteurs et codes (ressemblance, homoglyphes) | N | Normalisation de `utils/text.js` réutilisée | Faible |
| 7.5.10 | Cellule Canal digital | N | — | Moyen |
| 7.5.11 | Cartes professionnelles | N | — | Faible |
| 7.5.12 | Tableaux de bord du portefeuille | A | `stats.js`, `AgentDashboard.jsx` | Moyen |
| 8.3–8.4 | Souscription en 8 étapes, émission en une seule transaction | A | Conversion prospect → contrat (`ContratForm.jsx`) | Fort |
| 8.5 | Bénéficiaires du capital décès, consentements | N | `nb_beneficiaires` (simple compteur) | Moyen |
| 8.6 | Contrats collectifs | N | — | Fort (lot 4) |
| 8.7 | Renouvellement automatisé, statuts ÉCHUE / SUSPENDUE / EXPIRÉE | A | `contrat_periodes`, échéancier, vue `v_contrats` | Moyen |
| 8.8–8.9 | Avenants, « ne pas renouveler », résiliation | A | Résiliation avec rétrocession | Moyen |
| 8.10 | Module unique des réclamations | N | — | Faible |
| 8.11 | Souscription en ligne | N | — | Moyen |
| 8.12 | **Versements programmés** pour le renouvellement | **N** | Logique des encaissements partiels réutilisée (`encaissements`) | Moyen |
| 9 | Santé | N | — | Très fort (lot 3) |
| 10 | Sinistres | N | — | Fort (lot 4) |
| 11 | Comptabilité BCRG | N | — | Très fort (lots 2 et 5) |
| 12 | Conformité, protection des données | N | — | Moyen |
| 13 | Réassurance et coassurance | N (Prévu) | — | Modèle seulement |
| 14 | États BCRG et tableaux de bord | A | `stats.js`, exports `export.js` | Fort (lot 5) |
| 15 | Exigences techniques, niveau B, chiffrement | A | Docker Compose, HTTPS | Fort |

**Sur les 156 tables du DD 1.1 :**
- une quinzaine enrichissent ou remplacent une table existante (`utilisateur`, `tiers`, `prospect`, `intervenant`, `produit`, `police`, `police_periode`, `bareme_commission`, `commission`, `facture_commission`, `paiement_facture_commission`, `mouvement_portefeuille`, `journal_audit`, `parametre`, `notification`) ;
- 2 relèvent du « Prévu » ;
- les autres, soit environ 140, sont nouvelles.

Les huit tables existantes qui n'ont pas d'équivalent dans le DD (`lieux`, `referentiels`, `agent_product_objectives`, `objectifs_historique`, `prospect_products`, `contrat_produits`, `periode_lignes`, `notifications`) sont traitées dans L06.

### A.6 – Points de vigilance (mise à jour)

**Dettes techniques**, traitées dans le sous-lot 1.0 dans l'ordre imposé par la Direction :

1. Secret JWT par défaut (dette 6). Le serveur refusera de démarrer sans la variable, et un nouveau secret sera généré en production, ce qui révoque toutes les sessions déjà émises.
2. Migrations versionnées (dette 1), puis nouveau schéma avec clés étrangères, montants entiers et contraintes en base (dettes 2 et 3).
3. Socle de tests automatisés (dette 4) et compteurs verrouillés (dette 5), avec le test de charge CA-NUM-04 dans la recette du lot 1.
4. Ordonnanceur `pg-boss` (dette 8), suppression du code mort (`professions.js`, `secteurs.js`) et de `render.yaml` (dette 7).

**Arbitrages E1 à E7 :**

| # | Décision | Mise en œuvre |
|---|---|---|
| E1 | Validé | Le transfert automatique pour inactivité de `jobs.js` est remplacé par une alerte. Le transfert d'office d'un junior n'est possible que dans les quatre cas de COM-RG-073, par un mouvement de portefeuille validé. |
| E2 | **Rejeté** | Facture mensuelle conservée et enrichie : statuts COM-RG-044, émission par code à usage unique, fractions, retenue, affectation, avoir. Voir l'écart X1. |
| E3 | Validé | Les taux Sénior / Junior du produit deviennent `bareme_commission` par rôle et `police_intervenant` avec une clé de répartition totalisant 100 %. |
| E4 | Validé | Prime de renouvellement anticipé, délai de 30 jours paramétrable. |
| E5 | Validé avec précision | Pas de paiement partiel de la première prime. Les paiements partiels existants sont repris comme **versements programmés** (acomptes, EVT-21) sur le renouvellement. |
| E6 | Validé | Annulation pour erreur sous 48 h (COM-RG-030), sinon PROD-RG-061 ; plus de rétrocession totale automatique. |
| E7 | Validé | Une seule fiche `tiers`. Le prospect devient client sur la même fiche. |

**Dépendances extérieures :**

| Dépendance | Situation | Responsable | Échéance | Effet si en retard |
|---|---|---|---|---|
| Avis juridique (signature électronique, recommandé électronique, délai de renonciation, prescription) | En cours | Juriste interne | Avant la conception du dossier de preuve (lot 2, semaine 2) | Niveau de signature paramétrable : développement possible ; mise en production bloquée |
| Point de départ du délai de l'art. 368 | En cours | Juriste interne | Avant la recette du lot 2 | Paramètre ; l'alerte reste inactive tant qu'il n'est pas fixé |
| Mandat d'autofacturation | En cours | Juriste interne, Direction commerciale | Avant la mise en production du lot 2 | Mode « facture déposée » seul en attendant |
| Fournisseurs SMS, WhatsApp, monnaie électronique, ANDE | Consultation lancée | Direction générale, DSI | Avant la recette du lot 2 | Recette sur simulateurs ; la mise en production attend les contrats |
| Plan comptable BCRG, taux de taxes, taux de l'art. 368 | À fournir | Chef comptable | Avant la recette du lot 2 | Recette sur un plan fictif ; bascule bloquée |
| Hébergeur des données de santé (niveau B) | À choisir | Conformité, DSI | Avant la mise en production du lot 3 | Produits santé non ouverts à la vente |
| Maquette V1.1 et guides 1.1 | À transmettre | Direction | Avant le sous-lot 1.6 (interface) | Écrans construits sur le CDC seul |

---

## Partie B – Plan de réorganisation (mise à jour)

### B.1 Principes techniques

| Sujet | Choix retenu |
|---|---|
| Pile | Node / Express / PostgreSQL 16 ; React / Vite. Évolution, pas refonte. |
| Langage | TypeScript obligatoire pour les moteurs communs et le moteur comptable dès leur création ; introduit progressivement ailleurs. |
| Migrations | `node-pg-migrate` ; chaque migration a son `down`, rejoué en recette. |
| Schéma | Conforme au DD 1.1 : 156 tables, contraintes en base, contrôles I-01 à I-19 testés. |
| Événements | Table `evenement_metier` écrite dans la transaction métier ; distribution par `pg-boss` ; un test d'idempotence par traitement. |
| Authentification | TOTP (RFC 6238) en méthode principale pour les comptes à privilèges (administration, finances, validation de paiements), avec codes de secours. Code SMS pour les agents et les prestataires. Verrouillage après N échecs. |
| Données sensibles | Chiffrement applicatif par enveloppe (partie G) ; filtrage des lignes par PostgreSQL (row-level security) pour les données médicales. |
| Documents | PDF/A produits côté serveur à partir de modèles versionnés. Stockage MinIO **chiffré** (SSE-KMS) et **répliqué sur le second site** (partie F). |
| Intégrations | Un adaptateur par fournisseur, derrière une interface commune, avec **un simulateur par fournisseur** pour la recette. |
| Client | Une application React, cinq espaces. L'application agent est installable (PWA) et la saisie y fonctionne sans connexion (chapitre 15). |
| Environnements | Développement, recette (serveur distinct, jeu fictif uniquement), production. |

### B.2 Stratégie de données (validée)

Aucune reprise de données. La migration `0001` crée le schéma cible sur une base vide. À la bascule : dernière sauvegarde de l'ancienne base, mise hors service de celle-ci, puis import des référentiels réels (bureaux, agents, prestataires, produits, plan comptable, soldes d'ouverture, paramètres).

### B.3 Correspondance des menus actuels avec l'architecture cible

| Menu actuel | Cible |
|---|---|
| Tableau de bord admin | Direction générale : tableaux de bord consolidés |
| Agents, Juniors | Commercial › Réseau d'agents ; application agent › Mon réseau |
| Branches, Produits | Production › Catalogue (comité de paramétrage) |
| Prospects | Commercial ; application agent › Prospection |
| Clients | Référentiel des tiers (commun) |
| Contrats, Échéances | Production › Polices ; Polices à renouveler |
| **Factures de commissions** | **Commercial › Factures de commissions : factures mensuelles, paiements fractionnés, affectation au compte de production** |
| Référentiels, Paramètres | Administration et SI |
| Affectations | Commercial › Mouvements de portefeuille |
| Journal d'audit | Administration et SI |

### B.4 Ordre et contenu des lots

**Lot 1 – Socle** (chapitres 3 à 6)

| Sous-lot | Contenu | Critères |
|---|---|---|
| 1.0 Fondations | Secret JWT ; migrations ; schéma socle ; tests ; ordonnanceur ; serveur de recette ; nettoyage | — |
| 1.1 Organisation | Départements, services, fonctions, historique, fusion et scission simulées | CA-ORG-01, 02 |
| 1.2 Habilitations | Utilisateurs, TOTP / SMS, verrouillage, profils, droits, périmètres, incompatibilités, délégations, intérim | CA-ORG-03 à 06 |
| 1.3 Audit et paramètres | Journal chaîné (consultations sensibles comprises), paramètres historisés, règles légales verrouillées, comité | — |
| 1.4 Référentiels | Fiche Compagnie, tiers et foyers, doublons, coordonnées de paiement, bureaux, catalogue versionné, nomenclatures, jours fériés | CA-REF-01 à 09 |
| 1.5 Moteurs communs | Numérotation, documents, notifications, validation, événements, chiffrement par enveloppe | CA-NUM-01 à 09 |
| 1.6 Interface | Mise en page par département, menus selon les droits, écrans du socle | — |

**Lot 2 – Production et finances** (chapitres 7, 8 et 11), contenu corrigé par la Direction :
- **comptes de production des agents** (approvisionnement, émission, gel, restitution) ;
- souscription individuelle et en ligne, émission, renouvellement ;
- **versements programmés** ;
- bénéficiaires ;
- **factures mensuelles de commissions, paiements fractionnés et affectation au compte de production** ;
- moteur comptable, plan de comptes, journaux, trésorerie, taxes sur primes et déclarations ;
- provision pour primes non acquises, clôture mensuelle ;
- signature ANDE ;
- mode **PAIEMENT_DIRECT** en option.

Critères d'acceptation : CA-COM-01 à **24** ; CA-PROD-01 à 07, 17 à 19, 22 à 24 ; CA-FIN-01 à 21 et 30 à 34.

**Lot 3 – Santé** (chapitre 9). Critères CA-SAN-01 à 32.

**Lot 4 – Collectifs et sinistres** (§ 8.6, chapitre 10). Critères CA-PROD-08 à 16, 20 et 21 ; CA-SIN-01 à 12.

**Lot 5 – Pilotage et clôture** (chapitres 11, 12 et 14). Critères CA-FIN-22 à 29 ; CA-CONF-01 à 04.

**Prévu** : réassurance, coassurance, soins hors réseau, budgets analytiques, abonnements.

**Bascule** : après la recette des lots 1 et 2.

### B.5 Plan de retour arrière (complété)

- Une fonction `down` testée pour chaque migration.
- Images Docker étiquetées par version.
- Fonctions activables par paramètre.
- **Test de restauration chronométré avant chaque mise en production**, dont le résultat figure au compte rendu du lot (procédure en F.4).

---

## Partie C – Chiffrage en jours-personnes

Le chiffrage est exprimé en **jours-personnes (j-p)**. Il comprend la conception, le développement, les migrations, les tests automatisés, la documentation des paramètres et la participation à la recette. Il ne comprend ni la recette menée par la Compagnie, ni les délais des fournisseurs.

**Marge d'incertitude :**
- ± 15 % pour les lots 1 et 2 ;
- ± 25 % pour les lots 3 à 5, plus éloignés et dépendants des fournisseurs.

### C.1 Lot 1 – Socle

| Poste | j-p |
|---|---|
| 1.0 Fondations : secret, migrations, schéma socle, tests, ordonnanceur, environnement de recette | 22 |
| 1.1 Organisation, historique, fusion et scission simulées | 12 |
| 1.2 Habilitations, TOTP, SMS, périmètres, délégations, intérim, séparation des tâches | 25 |
| 1.3 Journal d'audit chaîné, paramètres historisés, règles légales, comité | 14 |
| 1.4 Référentiels : Compagnie, tiers, foyers, doublons, coordonnées, bureaux, catalogue versionné, nomenclatures | 35 |
| 1.5 Moteurs : numérotation (test de 100 émissions simultanées), documents PDF/A, notifications, validation, événements, chiffrement | 38 |
| 1.6 Interface du socle | 28 |
| Intégration : adaptateur SMS et OTP, simulateur | 6 |
| Recette, corrections, compte rendu | 12 |
| **Total lot 1** | **192** |

### C.2 Lot 2 – Production et finances

| Poste | j-p |
|---|---|
| Intervenants, agrément, bureaux, comptes de production (approvisionnement, gel, restitution) | 30 |
| Émission en transaction unique, annulation pour erreur, PAIEMENT_DIRECT | 22 |
| Rémunération : barèmes, clés, commissions, factures mensuelles, fractions, retenue, affectation, avoir | 28 |
| Portefeuille, prescripteurs et codes, cartes professionnelles, Canal digital | 25 |
| Souscription en 8 étapes (saisie sans connexion), bénéficiaires, consentements | 35 |
| Documents de police, renouvellement, rappels, ÉCHUE / EXPIRÉE | 22 |
| Versements programmés, avenants, résiliation, réclamations | 25 |
| Souscription en ligne (espace assuré) | 20 |
| Moteur comptable : plan, tiers comptables, journaux, schémas EVT-01 à 07 et 19 à 27, scellement | 45 |
| Analytique, taxes et déclarations, trésorerie, rapprochement, chaîne de paiement | 40 |
| PPNA, clôture mensuelle, éditions de base | 22 |
| Intégrations et simulateurs : monnaie électronique, signature ANDE, WhatsApp (envois), import des relevés | 32 |
| Recette, corrections, compte rendu | 28 |
| **Total lot 2** | **374** |

### C.3 Lots 3 à 5 et postes transverses

| Lot / poste | Principaux contenus | j-p |
|---|---|---|
| **Lot 3 – Santé** | Prestataires et professionnels (25), cartes (20), moteur de droits et compteurs (35), prises en charge, urgence, hospitalisation, accords (40), ordonnances, pharmacie, bons (30), factures et facture mensuelle (25), carnet chiffré (25), téléconsultation WhatsApp (30), annuaire, USSD / SMS et mode dégradé (25), provision pour sinistres à payer (10), recette (25) | **290** |
| **Lot 4 – Collectifs et sinistres** | Collectifs, appels de prime, effectifs, régularisations, art. 30 et 221 (65) ; sinistres, déclarants, pièces, provisions, décisions, offres, règlements, recours (65) ; recette (15) | **145** |
| **Lot 5 – Pilotage et clôture** | Immobilisations et amortissements (35), clôture annuelle et à-nouveaux (18), états BCRG (28), tableaux de bord (28), conformité avancée (32), recette (15) | **156** |
| **Hébergement de niveau B** | Mise en place des deux sites, réplication, sauvegardes, supervision, procédures, premier exercice de restauration | **20** |
| **Bascule** | Scripts d'import des référentiels réels, répétition sur la recette, exécution | **10** |
| **Pilotage** | Direction de projet, comités, comptes rendus (environ 8 % du total) | **95** |

### C.4 Synthèse

| Lot | j-p |
|---|---|
| Lot 1 | 192 |
| Lot 2 | 374 |
| Lot 3 | 290 |
| Lot 4 | 145 |
| Lot 5 | 156 |
| Hébergement de niveau B | 20 |
| Bascule | 10 |
| Pilotage | 95 |
| **Total** | **1 282** |

**Dont intégrations et simulateurs : environ 80 j-p.** Ils sont répartis ainsi :
- SMS et OTP au lot 1 ;
- monnaie électronique, ANDE, WhatsApp et relevés bancaires au lot 2 ;
- WhatsApp Business (appel vidéo), USSD et SMS entrant au lot 3.

---

## Partie D – Calendrier

**Hypothèse d'équipe**, à confirmer par la Direction : **4 équivalents temps plein**.
- 2 développeurs back-office ;
- 1 développeur front-office ;
- 0,5 testeur ;
- 0,5 DevOps.

L'équipe est assistée d'un outil d'IA de développement, ce qui produit environ 80 j-p par mois. Avec une équipe différente, les durées varient en proportion.

| Étape | Début | Fin du développement | Recette | Mise en production |
|---|---|---|---|---|
| Validation du rapport 1.1 | — | — | — | 01/12/2026 au plus tard |
| Lot 1 – Socle | 02/12/2026 | 05/03/2027 | 08/03 → 19/03/2027 | Pas de mise en production seul (bascule après le lot 2) |
| Lot 2 – Production et finances | 22/03/2027 | 13/08/2027 | 16/08 → 10/09/2027 | Avec la bascule |
| Bascule et première mise en production (lots 1 et 2) | 13/09/2027 | — | Test de restauration chronométré | 20/09/2027 |
| Lot 3 – Santé | 16/08/2027 (en parallèle de la recette du lot 2) | 07/01/2028 | 10/01 → 04/02/2028 | 14/02/2028 (ouverture des produits santé) |
| Lot 4 – Collectifs et sinistres | 10/01/2028 | 07/04/2028 | 10/04 → 28/04/2028 | 08/05/2028 |
| Lot 5 – Pilotage et clôture | 10/04/2028 | 07/07/2028 | 10/07 → 28/07/2028 | 07/08/2028 |

**Commentaires :**
- La période des fêtes (décembre 2026) et deux semaines de congés en août 2027 sont prises en compte.
- Le chemin critique passe par le lot 2, à cause du moteur comptable et des intégrations. Si les fournisseurs n'ont pas signé avant le 16/08/2027, la mise en production du 20/09/2027 glisse d'autant. Les simulateurs permettent malgré tout de tenir la recette.
- La mise en production du lot 3 suppose que l'hébergeur des données de santé soit validé (CONF-RG-008).

---

## Partie E – Registre des risques

Échelles : P = probabilité, I = impact. 1 = faible, 2 = moyen, 3 = fort.

| # | Risque | P | I | Parade | Responsable |
|---|---|---|---|---|---|
| R01 | Retard de signature des fournisseurs (SMS, monnaie électronique, ANDE, WhatsApp Business) | 3 | 3 | Simulateurs dès le lot 1 ; interfaces communes ; consultation lancée dès maintenant ; choix avant le 16/08/2027 | Direction générale, DSI |
| R02 | Avis juridique tardif (signature, recommandé, renonciation, art. 368, mandat d'autofacturation) | 2 | 3 | Niveaux de signature et délais paramétrés ; mode « facture déposée » en repli | Juriste interne |
| R03 | Plan comptable BCRG ou schémas comptables fournis tardivement | 2 | 3 | Recette sur un plan fictif conforme au § 11.10 ; numéros de comptes jamais codés en dur | Chef comptable |
| R04 | Ampleur du moteur comptable sous-estimée | 2 | 3 | Cas 1 à 7 du CDC automatisés dès le début du lot 2 ; revue intermédiaire par le chef comptable | Prestataire |
| R05 | Dépassement des performances (2 s pour les droits santé, 5 s pour l'émission, 100 émissions simultanées) | 2 | 2 | Tests de charge à chaque lot sur trois fois la volumétrie ; compteurs par bureau ; scellement des écritures en différé | Prestataire |
| R06 | Erreur de numérotation (trou ou doublon) | 1 | 3 | Verrou par compteur et contrainte d'unicité ; test CA-NUM-04 rejoué à chaque livraison | Prestataire |
| R07 | Fuite de données médicales ou de coordonnées de paiement | 1 | 3 | Chiffrement par enveloppe, filtrage des lignes, journal des consultations, revue de sécurité avant le lot 3 | Prestataire, Conformité |
| R08 | Hébergement de niveau B non opérationnel à la date de mise en production | 2 | 3 | Mise en place dès le lot 1 sur la recette ; restauration testée à chaque lot | DSI, prestataire |
| R09 | Hébergeur des données de santé non validé par la Conformité | 2 | 3 | Choix arrêté avant le 01/10/2027 ; option d'un hébergement en Guinée étudiée | Conformité, DSI |
| R10 | Indisponibilité de l'équipe ou dépendance à une seule personne | 2 | 2 | Code revu par une seconde personne, documentation par lot, tests automatisés | Prestataire |
| R11 | Évolutions du CDC en cours de lot | 3 | 2 | Grille ARC-RG-001 ; gel du périmètre à l'ouverture de chaque lot ; demandes de changement chiffrées | Direction, prestataire |
| R12 | Maquette V1.1 incompatible avec des règles du CDC | 2 | 1 | Le CDC prévaut ; écarts signalés au fil du sous-lot 1.6 | Prestataire |
| R13 | Mauvaise connectivité des agents sur le terrain | 3 | 2 | PWA hors ligne, contrôles rejoués à la synchronisation (chapitre 15), parcours USSD | Prestataire |
| R14 | Retrait de fonctions existantes non validé (écart X1, rôles codés en dur, transfert automatique) | 2 | 2 | Liste soumise dans le présent rapport ; validation écrite exigée (DEV-RG-001) | Direction |
| R15 | Erreurs ou incohérences dans les documents de référence | 2 | 2 | Lecture croisée systématique (voir 0.4) ; questions envoyées dans la semaine | Prestataire |
| R16 | Perte de la clé maîtresse de chiffrement | 1 | 3 | Clé partagée selon Shamir (3 parts sur 5) entre des détenteurs désignés ; procédure de recouvrement testée annuellement | DSI, DAF |

---

## Partie F – Architecture d'hébergement de niveau B

### F.1 Exigences rappelées

- **Perte de données maximale (RPO)** : 15 minutes, documents compris.
- **Délai de reprise (RTO)** : 2 heures pour les portails et l'émission ; 24 heures pour le back-office.
- Sauvegardes hors ligne ou non modifiables.
- Exercice annuel chronométré, plus un test de restauration avant chaque mise en production.
- Passage au niveau C dès 50 000 personnes couvertes ou 500 prises en charge par jour.

### F.2 Architecture proposée

| Élément | Site principal | Second site (autre fournisseur ou autre centre de données) |
|---|---|---|
| Application (API, portails, ordonnanceur) | 2 serveurs applicatifs derrière un répartiteur (nginx) | 1 serveur de secours **prêt** : image Docker déployée, démarrage en quelques minutes |
| PostgreSQL 16 | Serveur principal | **Réplique en streaming asynchrone**, prête à prendre le relais (décalage de quelques secondes) |
| Archivage des journaux de la base (WAL) | `pgBackRest` : archivage continu (au plus toutes les 60 s) vers le stockage objet du second site | Dépôt de sauvegardes en **mode non modifiable** (object lock), chiffré |
| Sauvegardes complètes | Hebdomadaires, plus différentielles quotidiennes | Conservées 35 jours ; une copie mensuelle hors ligne conservée 12 mois |
| Documents (MinIO) | MinIO avec chiffrement côté serveur (clé dans le gestionnaire de clés) | **Réplication de site MinIO** vers le second site, versionnement activé |
| Gestion des clés | Vault (moteur de chiffrement Transit) | Vault en réplique de reprise ; parts de la clé maîtresse hors ligne |
| Supervision | Prometheus, Alertmanager, journaux centralisés | Sondes externes (disponibilité, retard de réplication) |
| Recette | **Serveur distinct**, jeu de données fictif uniquement | — |

**Bascule en cas de sinistre** :
1. Promouvoir la réplique.
2. Démarrer les services applicatifs du second site.
3. Rediriger le DNS (TTL de 60 s).
4. Rapprocher avec les opérateurs et les banques selon la procédure écrite (chapitre 15).

**Temps visé** : moins d'1 heure pour les portails. Le RTO de 2 heures est donc tenu avec une marge, et l'on se rapproche du niveau C.

**Respect du RPO** : grâce à la réplication en continu, la perte attendue se compte en secondes. L'archivage des WAL garantit les 15 minutes même si la réplique est perdue.

**Passage au niveau C préparé dès maintenant** :
- réplique synchrone ;
- bascule automatique (Patroni) ;
- application active sur les deux sites.

Le passage au niveau C ne sera alors qu'une évolution de configuration.

### F.3 Dimensionnement et coût

Le dimensionnement initial vise la volumétrie de la première année. Il est vérifié pour trois fois cette volumétrie (chapitre 15).

| Poste | Site principal | Second site | Recette |
|---|---|---|---|
| Serveurs applicatifs | 2 × (4 vCPU, 8 Go) | 1 × (4 vCPU, 8 Go) | 1 × (4 vCPU, 8 Go), base comprise |
| Base de données | 1 × (8 vCPU, 32 Go, SSD NVMe 500 Go) | 1 × identique | — |
| Stockage objet (documents et sauvegardes) | 1 To | 2 To (réplique et sauvegardes non modifiables) | 100 Go |
| Gestion des clés, supervision | 1 petit serveur | Réplique de reprise | — |

**Coût** : ordre de grandeur de **900 à 1 600 € par mois** hors taxes pour les trois environnements, sur la base des tarifs publics d'hébergeurs européens (OVHcloud, Scaleway, Hetzner). S'y ajoutent les 20 j-p de mise en place (partie C).

**Ce chiffre est indicatif.** Il est à confirmer par trois devis, dont au moins un hébergeur établi en Guinée ou dans la sous-région. En effet, le choix de l'hébergeur des données de santé et tout transfert hors de Guinée doivent être validés par la Conformité (CONF-RG-008), ce qui peut conduire à un hébergeur local au coût différent.

### F.4 Procédure de test de restauration chronométré

Ce test est exécuté avant chaque mise en production et lors de l'exercice annuel. Le résultat figure au compte rendu du lot.

1. **Préparation.** Noter l'heure H0 et le dernier numéro de pièce comptable et de police en production. Choisir un instant de restauration T, à H0 moins 10 minutes.
2. **Restauration de la base.** Sur un serveur vierge du second site, exécuter `pgBackRest restore` jusqu'à l'instant T. Noter H1, l'heure de fin.
3. **Restauration des documents.** Basculer MinIO sur la réplique du second site et vérifier les empreintes d'un échantillon de 50 documents.
4. **Démarrage applicatif.** Lancer les services, rediriger un DNS de test et noter H2.
5. **Vérifications fonctionnelles automatisées :**
   - connexion ;
   - consultation d'une police ;
   - vérification des droits santé ;
   - émission fictive sur un bureau de test ;
   - équilibre de la balance ;
   - contrôles I-01 à I-04 ;
   - chaîne des empreintes du journal d'audit et des lots de scellement intacte.
6. **Mesures :**
   - durée de reprise mesurée (H2 − H0), à comparer à l'objectif de 2 heures ;
   - perte de données mesurée (dernière transaction restaurée comparée à T), à comparer à l'objectif de 15 minutes.
7. **Compte rendu.** Durées, écarts, anomalies et actions correctives. Le compte rendu est signé par la DSI et joint au procès-verbal de recette du lot.

---

## Partie G – Chiffrement applicatif et gestion des clés

### G.1 Principe : chiffrement par enveloppe

- Chaque donnée sensible est chiffrée **dans l'application**, avant d'être envoyée à la base, en **AES-256-GCM**.
- La clé utilisée est une **clé de données** (DEK), propre à une catégorie de données : coordonnées de paiement, données médicales, déclarations de soupçon, conclusions d'expertise.
- Chaque DEK est elle-même chiffrée par une **clé de chiffrement de clés** (KEK) conservée dans **HashiCorp Vault** (moteur Transit), sur un serveur distinct de la base et hors du dépôt de code.
- La base ne reçoit et ne stocke que des données chiffrées et des clés chiffrées. **Aucune clé ne transite dans une requête SQL** : c'est la raison du refus de pgcrypto, qui est ainsi levée.

### G.2 Mise en œuvre

| Point | Disposition |
|---|---|
| Champs concernés (DD, type CHIFFRÉ) | `coordonnee_paiement.numero`, `acte.diagnostic_code`, `carnet_entree.contenu`, `expertise.conclusions`, `declaration_soupcon.contenu`, et tout champ ajouté plus tard à ce type |
| Format stocké | Version de la clé, vecteur d'initialisation et texte chiffré. Les **données associées authentifiées** (nom de table, colonne, identifiant de ligne) empêchent de déplacer un texte chiffré d'une ligne à une autre. |
| Recherche | Pour un champ qu'il faut retrouver (numéro de compte), on stocke une empreinte HMAC-SHA-256 calculée avec une clé distincte. On recherche sur l'empreinte, jamais sur la valeur en clair. |
| Séparation des accès | Une KEK par domaine (« finances », « santé », « conformité »). Seul le service applicatif santé est autorisé par Vault à déchiffrer la DEK « santé ». S'y ajoute le filtrage des lignes dans PostgreSQL (un gestionnaire ne lit aucune ligne médicale, SAN-RG-052). |
| Journaux | Interdiction, contrôlée par test, de journaliser une valeur déchiffrée ; masquage automatique dans les traces d'erreur |
| Rotation | KEK renouvelée chaque année : les DEK sont rechiffrées, sans toucher aux données. DEK renouvelée en cas d'incident : rechiffrement progressif par un traitement planifié. |
| Sauvegardes | Elles ne contiennent que des données chiffrées. Les sauvegardes de Vault sont chiffrées et conservées séparément. |
| Recouvrement | Clé de déverrouillage de Vault partagée selon Shamir (3 parts sur 5) entre des détenteurs désignés par la Direction (DSI, DAF, Conformité…). Procédure testée lors de l'exercice annuel. |
| Mots de passe | Empreinte Argon2id (et non chiffrement), conformément au type EMPREINTE du DD |
| Secret JWT et clés de signature (QR des cartes, jetons) | Stockés dans Vault, renouvelés périodiquement ; validation pendant la transition par identifiant de clé |

### G.3 Calendrier

- Moteur de chiffrement et Vault en recette : **sous-lot 1.5**.
- Coordonnées de paiement chiffrées dès le lot 1 (référentiel des tiers).
- Données médicales au lot 3, après une revue de sécurité dédiée.

---

## Partie H – Décisions demandées à la Direction

1. Valider la présente version 1.1 du rapport, ainsi que L05 et L06.
2. Trancher l'**écart X1** (une seule facture de commissions par mois, conformément au DD) et donner la validation écrite du retrait des fonctions existantes listées dans L06 (DEV-RG-001).
3. Confirmer les propositions X2 à X8 (0.4).
4. Confirmer l'hypothèse d'équipe de la partie D, ou indiquer l'équipe réelle pour recalculer le calendrier.
5. Lancer les trois devis d'hébergement (F.3) et désigner les détenteurs des parts de la clé de recouvrement (G.2).
6. Transmettre la maquette V1.1 et les guides d'utilisation 1.1.
