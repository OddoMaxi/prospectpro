# Prospect Pro – L06 – Registre des doublons

| Rubrique | Valeur |
|---|---|
| Version | 1.0 du 24/11/2026, alignée sur le CDC V1.4 et le DD 1.1 |
| Objet | Recenser chaque fonction, table ou règle gérée plus d'une fois, désigner le composant maître et le sort du composant secondaire (Requête technique ; CDC § 1.5 et ARC-RG-001) |
| Sources | Code de Prospect Pro (commit `2e72bd9`) ; CDC V1.4 (annexe G, doublons D1 à D20) ; DD 1.1 (§ 15) |

**Sort** : **Fusion** (les deux sont réunis dans le maître) ; **Retrait** (le secondaire disparaît, la fonction est assurée par le maître) ; **Remplacement** (un nouveau composant maître reprend la fonction).

Tout **retrait** d'une fonction existante est soumis à la validation écrite de la Direction (DEV-RG-001). Ces lignes sont marquées ⚠.

## 1. Doublons dans le code existant ou entre l'existant et la cible

| # | Doublon constaté | Composant maître | Sort du secondaire | Lot |
|---|---|---|---|---|
| L06-01 | Fiches `prospects` et `clients` : la même personne existe deux fois, avec les mêmes champs d'identité recopiés à la conversion | `tiers` + `prospect` (REF-RG-003) | Fusion : `clients` disparaît, le rôle SOUSCRIPTEUR est porté par `tiers_role` | 1.4 |
| L06-02 | `users` mélange le compte de connexion et la fiche commerciale de l'agent | `utilisateur` (connexion) + `intervenant` (rôle commercial) + `tiers` (identité) | Remplacement | 1.2 et 2 |
| L06-03 | Rôles codés en dur (`requireAdmin`, `requireAgent`, `requireSenior`) en parallèle des droits demandés | Moteur de droits : `profil`, `droit`, `utilisateur_profil` | ⚠ Retrait des middlewares par rôle. Chaque ancien rôle reçoit un profil équivalent (§ 4.2) : ADMIN, AGENT_GENERAL, JUNIOR. | 1.2 |
| L06-04 | Taux de commission saisis à trois endroits : `users.taux_commission`, `products.taux_commission*`, `users.taux_commission_parent` (inutilisé depuis octobre 2026) | `bareme_commission` + `police_intervenant.cle_repartition` (E3) | Remplacement | 2 |
| L06-05 | Objectifs commerciaux : `users.objectif_mensuel` / `objectif_annuel` et `agent_product_objectives` | `agent_product_objectives` conservée comme extension du domaine Commercial (absente du DD : ajout proposé) | ⚠ Retrait des champs objectifs de `users` | 2 |
| L06-06 | Transfert de portefeuille : `affectations`, `TransferModal`, transfert automatique pour inactivité dans `jobs.js` | `mouvement_portefeuille` (COM-RG-072, une fonction unique) | ⚠ Retrait du transfert automatique (E1) ; `affectations` remplacée | 2 |
| L06-07 | Intérim : `users.interim_agent_id` (intérim commercial) et intérim des validations (ORG-RG-043) | `interim` pour les validations ; aucun intérim commercial (remplacé par le mouvement de portefeuille) | ⚠ Retrait de l'intérim commercial | 1.2 et 2 |
| L06-08 | Journal : `audit_log` et les colonnes `deleted_by`, `resilie_par`, `annule_par`, etc. disséminées | `journal_audit` + colonnes techniques communes (DD § 2.4) | Remplacement | 1.3 |
| L06-09 | Paramètres : table `parametres` et constantes dans le code (`DEFAULT_PARAMETRES`, délais en dur) | `parametre` + `parametre_historique` | Fusion ; plus aucune valeur métier en dur (DEV-RG-004) | 1.3 |
| L06-10 | Professions et secteurs : `referentiels` (actif) et `routes/professions.js`, `routes/secteurs.js` (non montées) | `referentiels`, conservée comme extension du référentiel des tiers (absente du DD : ajout proposé) | Retrait du code mort | 1.0 |
| L06-11 | Lieux (région, commune, quartier) : table `lieux` et fichier `frontend/src/data/guinea.js` | `lieux`, conservée comme extension du référentiel (absente du DD : ajout proposé, sert à `tiers.adresse` et à l'annuaire) | Retrait de la copie côté client | 1.4 |
| L06-12 | Numérotation : `numeroAgent.js`, numéros de contrat et de facture générés chacun à sa façon | `compteur_numerotation` (moteur de numérotation, § 3.6) | Remplacement | 1.5 |
| L06-13 | Calcul de la prime : `utils/tarif.js` (serveur) et `frontend/src/utils/tarif.js` (client) | Moteur de tarification du serveur ; le client affiche le résultat | Retrait du calcul côté client | 2 |
| L06-14 | Documents : PDF générés dans le navigateur (`pdfDocuments.js`) | Moteur de documents côté serveur, modèles versionnés (DIG-RG-001) | Remplacement | 1.5 |
| L06-15 | Relances : `RelanceModal` (WhatsApp / SMS ouverts sur le téléphone), alertes d'échéance de `jobs.js`, message de relance en paramètre | Moteur de notifications (§ 3.6, PROD-RG-021) | Remplacement | 1.5 et 2 |
| L06-16 | Notifications internes (`notifications`) et notifications aux clients (à venir) | `notification` + `modele_notification`, canal APPLICATION | Fusion | 1.5 |
| L06-17 | Contrat : `contrats` + `contrat_produits` + `contrat_periodes` + `periode_lignes` + vue `v_contrats` (statut recalculé) et champs de contrat restés dans `clients` (`numero_contrat`, `date_effet`, `prime_totale`…) | `police`, `police_periode`, `garantie_souscrite`, `quittance` ; statut stocké et historisé (PROD-RG-007) | Remplacement ; les champs de contrat de `clients` disparaissent | 2 |
| L06-18 | Encaissements partiels (`encaissements`) et versements programmés | `versement_programme` (acompte, EVT-21) ; la première prime passe par la `quittance` soldée | Remplacement (E5) | 2 |
| L06-19 | Factures de commissions : plusieurs factures par mois (une en brouillon) ou une par mois selon le DD | `facture_commission`, unicité (intervenant, mois) | ⚠ Retrait de la facture multiple par mois (écart X1) | 2 |
| L06-20 | Paiement des commissions : `facture_paiements` et la future chaîne de paiement | `paiement_facture_commission` → `ordre_paiement` (FIN-RG-050) | Fusion : `facture_paiements` devient les fractions | 2 |
| L06-21 | Statistiques et exports : `stats.js`, `GlobalStatsDashboard`, `export.js`, calculs repris dans chaque écran | Tableaux de bord par département (§ 14.2) alimentés par une source unique | Fusion | 2 et 5 |
| L06-22 | Contrôles d'accès en double, côté interface et côté serveur (menus filtrés dans `AdminLayout` / `AgentLayout`) | Contrôle côté serveur seul ; l'interface ne fait qu'afficher les droits reçus du serveur | Fusion | 1.2 et 1.6 |
| L06-23 | Mises en page `AdminLayout` et `AgentLayout` à côté de `Layout` | `Layout`, menu calculé par département et par droits | Retrait des deux mises en page spécifiques | 1.6 |

## 2. Doublons supprimés dans le cahier lui-même (annexe G, rappel)

Ces doublons ont été tranchés par la Direction en V1.3. Le développement s'y conforme : une règle, un seul composant.

| Réf. | Doublon | Composant maître |
|---|---|---|
| D1 | Séparation des tâches | FIN-RG-115 renvoyant à ORG-RG-042 (moteur de validation) |
| D2 | Coordonnées de paiement | REF-RG-005 (référentiel des tiers) |
| D3 | Fiche tiers comptable | `tiers` ; `compte_auxiliaire` limité aux attributs comptables |
| D4 | Nature du compte | `nature_compte` (table unique) |
| D5, C2 | Format des comptes auxiliaires | FIN-RG-003 |
| D6 | Numérotation des pièces | FIN-RG-075 |
| D7 | Clôture des journaux | Clôture de période (FIN-RG-072) |
| D8 | Saisie des achats | Fiche d'imputation (FIN-RG-116) |
| D9 | Facture d'expertise | Facture d'achat EVT-15 |
| D10 | Règle de pharmacie (SAN-RG-033) | SAN-RG-031 (voir l'écart X5 du rapport) |
| D11 | Statut de police recopié en motif de blocage | Moteur de droits, qui lit le statut |
| D12 | Calcul des droits dans le module Sinistres | Moteur de droits (SIN-RG-020) |
| D13 | Réclamations | Module unique (§ 8.10) |
| D14 | Preuve d'acceptation | `dossier_preuve` |
| D15 | Numérotation santé | § 6.3 |
| D16 | Relances | Moteur de notifications |
| D17 | Statut gelé | `compte_production_agent.motif_gel` |
| D18 | Résiliation à l'échéance | « Ne pas renouveler » (PROD-RG-060) |
| D19 | Exigence de fonctionnement hors ligne | Chapitre 15 |
| D20 | « Agent senior » | « Agent général » |

## 3. Tables existantes sans équivalent dans le DD 1.1

| Table existante | Proposition |
|---|---|
| `lieux` | Conserver comme référentiel géographique (L06-11) ; ajout au DD proposé |
| `referentiels` (professions, secteurs) | Conserver (L06-10) ; ajout au DD proposé |
| `agent_product_objectives`, `objectifs_historique` | Conserver les objectifs commerciaux (L06-05) ; ajout au DD proposé |
| `prospect_products` | Conserver comme « produits d'intérêt » du prospect ; ajout au DD proposé |
| `contrat_produits`, `periode_lignes` | Remplacées par `garantie_souscrite` et `quittance` (L06-17) |
| `notifications` | Remplacée par `notification` (L06-16) |
| `encaissements` | Remplacée par `quittance`, `versement_programme` et `encaissement_attente` (L06-18) |

Les quatre ajouts proposés au DD (`lieu`, `referentiel_metier`, `objectif_commercial`, `prospect_produit`) sont des fonctions existantes de Prospect Pro qui ne figurent dans aucun document de référence. À défaut d'accord de la Direction, ce sont des retraits soumis à DEV-RG-001.
