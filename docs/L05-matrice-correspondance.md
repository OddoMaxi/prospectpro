# Prospect Pro – L05 – Matrice de correspondance

| Rubrique | Valeur |
|---|---|
| Version | 1.0 du 24/11/2026, alignée sur le CDC V1.4 et le DD 1.1 |
| Objet | Rattacher chaque règle du cahier des charges à l'existant de Prospect Pro (commit `2e72bd9`), à son statut, aux tables du dictionnaire, au lot et aux critères d'acceptation (DEV-RG-005) |
| Statuts | **C** existant à conserver ; **A** existant à améliorer ; **N** nouveau ; **D** doublon, mutualisé vers le composant maître (voir L06) ; **P** Prévu (modèle de données seulement) |
| Mise à jour | À chaque lot : la granularité descend à la règle individuelle pour le lot en cours, et la colonne « Écrans » est complétée à la réception de la maquette V1.1 |

Les règles sont regroupées lorsqu'elles portent sur le même objet et le même composant. Dans un groupe, chaque règle a le statut du groupe, sauf mention contraire.

## 1. Architecture et démarche (chapitres 2 et 3)

| Règles | Objet | Existant | Statut | Tables DD | Lot | CA |
|---|---|---|---|---|---|---|
| DEV-RG-001 à 006 | Démarche, migrations, activation, aucune valeur en dur, livrables, tests | Pas de migrations, pas de tests | A | — | 1.0 | — |
| ARC-RG-001, 002 | Grille de qualification, aucun développement spécifique | — | N | — | Transverse | — |
| ARC-RG-003 | Conformité paramétrée, règles verrouillées | — | N | `regle_legale`, `parametre` | 1.3 | — |
| ARC-RG-010 | Moteur de droits unique | — | N | `compteur_garantie`, `motif_blocage` | 3 | CA-SAN-01 à 03 |
| ARC-RG-011 à 013 | Motifs de blocage | — | N | `motif_blocage_ref`, `motif_blocage` | 3 | CA-SIN-09 |
| ARC-RG-020 | Comité de paramétrage | — | N | `demande_validation`, `parametre_historique` | 1.3 | — |
| DIG-RG-001 à 007 | Documents numériques, preuve, signature, archivage | PDF générés dans le navigateur (`pdfDocuments.js`) | A | `modele_document`, `document`, `dossier_preuve` | 1.5 et 2 | CA-PROD-23 |
| § 3.1, 3.4 | Événements métier, table d'événements, idempotence | `jobs.js` (`setInterval`) | A | `evenement_metier` | 1.0 et 1.5 | — |
| § 3.5 | Notifications multicanal, modèles, historique | `notifications` interne, `RelanceModal` | A / D | `modele_notification`, `notification` | 1.5 | — |
| § 3.6 | Neuf moteurs communs | `utils/*` | A | — | 1.5 puis lots suivants | — |

## 2. Organisation et habilitations (chapitre 4)

| Règles | Objet | Existant | Statut | Tables DD | Lot | CA |
|---|---|---|---|---|---|---|
| ORG-RG-001 à 008 | Départements, services, fonctions, fusion, scission, simulation, historique | — | N | `departement`, `service`, `fonction`, `historique_organisation` | 1.1 | CA-ORG-01, 02 |
| ORG-RG-020, 021 | Comptes nominatifs, création des comptes externes | `users`, `agents.js` | A | `utilisateur` | 1.2 | — |
| ORG-RG-022 | Double authentification, politique de mot de passe, durée de session | bcrypt, JWT de 8 h | A | `utilisateur`, `parametre` | 1.2 | — |
| ORG-RG-023 | Suspension automatique, jamais de suppression | Statut relu à chaque requête (à conserver) | A | `utilisateur` | 1.2 | — |
| ORG-RG-040 | Droits, profils, périmètres contrôlés côté serveur | `requireAdmin` / `requireAgent` / `requireSenior` | A / D | `profil`, `droit`, `profil_droit`, `utilisateur_profil` | 1.2 | CA-ORG-03 |
| ORG-RG-041 | Référentiel des délégations | — | N | `delegation_validation` | 1.2 | — |
| ORG-RG-042 | Séparation des tâches, incompatibilités | — | N | `incompatibilite_profil`, `validation_etape` | 1.2 | CA-ORG-04 |
| ORG-RG-043 | Intérim des validations | `interim_agent_id` (intérim commercial, logique différente) | N | `interim` | 1.2 | CA-ORG-06 |
| ORG-RG-044 | Pas de validation par l'Administrateur, second administrateur, pas d'auto-attribution | — | N | `utilisateur_profil` | 1.2 | CA-ORG-05 |
| ORG-RG-045 | Revue semestrielle des habilitations | — | N | — (état) | 1.2 | — |
| ORG-RG-046 | Délégations de la Direction commerciale | — | N | `delegation_validation` | 1.2 | — |
| § 4.6 | Journal d'audit inaltérable, consultations sensibles | `audit_log` (modifications seules) | A | `journal_audit` | 1.3 | — |

## 3. Référentiels (chapitre 5)

| Règles | Objet | Existant | Statut | Tables DD | Lot | CA |
|---|---|---|---|---|---|---|
| REF-RG-010 à 013 | Fiche de la Compagnie historisée, mentions légales | — | N | `societe`, `societe_historique` | 1.4 | CA-REF-05, 06 |
| REF-RG-001 | Nature du tiers non modifiable | `prospects.type`, `clients.type` | A / D | `tiers` | 1.4 | — |
| REF-RG-002 | Recherche de doublons, blocage | `POST /prospects/doublons` | A | `tiers` | 1.4 | CA-REF-01 |
| REF-RG-003 | Le prospect devient client sur la même fiche | `prospects` → `clients` (deux fiches) | D | `tiers`, `prospect` | 1.4 | — |
| REF-RG-004 | Compte auxiliaire automatique | — | N | `tiers_role`, `compte_auxiliaire` | 1.4 (rôle), 2 (compte) | CA-REF-02 |
| REF-RG-005 | Coordonnées de paiement, double validation, carence | — | N | `coordonnee_paiement` | 1.4 | — |
| REF-RG-006 | Pièces dans la gestion électronique des documents | — | N | `document` | 1.4 | — |
| REF-RG-007 à 009 | Foyers, quatre conjoints, catégories d'enfants | `nb_beneficiaires` (simple compteur) | N | `lien_foyer` | 1.4 | CA-REF-07, 09 |
| REF-RG-014 | Intervenants : agent général personne physique ou morale | `users.type_agent`, `raison_sociale` | A | `tiers`, `intervenant` | 1.4 et 2 | — |
| REF-RG-020, 021 | Bureaux : code 01 à 99, capacité | — | N | `bureau`, `bureau_gestionnaire` | 1.4 | — |
| REF-RG-030 | Prime totale calculée | `utils/tarif.js` (prime pure, coût de police, accessoires, taxe) | A | `tarif`, `formule` | 1.4 | — |
| REF-RG-031 | Quotités totalisant 100 % | — | N | `beneficiaire` | 2 | CA-REF-04 |
| REF-RG-032, 033 | Désactivation, formule de remplacement, type de contrat | `products.statut` | A | `produit`, `formule` | 1.4 | CA-REF-03 |
| REF-RG-034, 035 | Garantie décès (âge, consentement), téléconsultation | — | N | `garantie` | 1.4 | CA-REF-08 |
| § 5.5, 5.6 | Catalogue versionné, nomenclatures, jours fériés | `branches`, `products`, `referentiels`, `lieux` | A | `produit`, `formule`, `garantie`, `tarif`, `exclusion`, `nomenclature_acte`, `medicament`, `diagnostic`, `jour_ferie` | 1.4 | — |

## 4. Numérotation (chapitre 6)

| Règles | Objet | Existant | Statut | Tables DD | Lot | CA |
|---|---|---|---|---|---|---|
| NUM-RG-001 à 010 | Police à 15 chiffres, MOD 97-10, séquence par bureau, produit et année | `numeroAgent.js`, `numero_contrat` libre | A / D | `compteur_numerotation`, `police` | 1.5 | CA-NUM-01 à 09 |
| § 6.3 | Quittances, avenants, cartes, PEC, AP, SIN, FM, VP, MP, CP, FI, IMM, DEP, FC (écart X4) | Numéros de facture `factures.numero` | A | `compteur_numerotation` | 1.5 | — |

## 5. Commercial (chapitre 7)

| Règles | Objet | Existant | Statut | Tables DD | Lot | CA |
|---|---|---|---|---|---|---|
| COM-RG-001 à 003 | Bureau, gestionnaire, activation, un compte de production par bureau | — | N | `bureau`, `compte_production_agent` | 2 | CA-COM-01, 09 |
| COM-RG-010 à 014 | Approvisionnement, minimum, statuts, plafonds | — | N | `approvisionnement_compte`, `mouvement_compte_production` | 2 | CA-COM-02, 24 |
| COM-RG-020 à 026 | Solde, contrôle, transaction unique, accès concurrents, alertes, collectifs | — | N | `compte_production_agent` | 2 | CA-COM-03 à 05 |
| COM-RG-027 | PAIEMENT_DIRECT en option | — | N | `police.mode_emission` | 2 | CA-PROD-03 |
| COM-RG-030 à 032 | Annulation pour erreur sous 48 h, double validation | Annulation d'encaissement réservée à l'admin | A | `avenant`, `demande_validation` | 2 | CA-COM-06 |
| COM-RG-040 | Barèmes par rôle, clé de répartition | Taux Sénior / Junior sur `products` | A | `bareme_commission`, `police_intervenant` | 2 | CA-COM-11 |
| COM-RG-041 | Commission sur le montant encaissé, à chaque renouvellement | `utils/commissions.js` (acquise au paiement intégral) | A | `commission` | 2 | CA-COM-23 |
| COM-RG-042 | **Facture mensuelle par commercial**, autofacturation, émission par code | `factures.js`, `FactureList` / `FactureDetail` | **A** | `facture_commission` | 2 | CA-COM-20 |
| COM-RG-043 | Paiements séparés, juniors et prescripteurs payés directement | Une facture par agent | A | `paiement_facture_commission`, `ordre_paiement` | 2 | CA-COM-11, 20 |
| COM-RG-044 | Délai de 30 jours, **fractions**, retenue au prorata, statuts, art. 368 | `facture_paiements` (paiements partiels plafonnés) | **A** | `paiement_facture_commission` | 2 | CA-COM-21 |
| COM-RG-045 | Validation par exception | — | N | `facture_commission.valide_d_office` | 2 | — |
| COM-RG-046 | Prime de renouvellement anticipé (30 jours) | Prime de performance (1 mois) | A | `bareme_commission`, `commission` | 2 | CA-COM-12 |
| COM-RG-047 | Plafond de l'art. 368 (règle verrouillée) | — | N | `regle_legale` | 2 | — |
| COM-RG-048, 049 | Prescripteur assuré, consultation des commissions | Tableau de bord agent | A | `commission` | 2 | — |
| COM-RG-050 à 056 | Restitution, gel, inactivité, départ, suspension | Job d'inactivité avec transfert automatique (E1) | A / D | `demande_restitution` | 2 | CA-COM-07, 08, 17 |
| COM-RG-060 à 066 | Agrément, collaborateurs, juniors, prescripteurs, sortie, registre | `users`, `SousAgentList`, `AgentForm` | A | `intervenant` | 2 | CA-COM-16 |
| COM-RG-070, 071 | Titulaire, apporteur, prescripteur, exclusivité de 90 jours | `prospects.agent_id`, `clients.agent_id` | A | `police_intervenant`, `prospect` | 2 | CA-COM-14, 18 |
| COM-RG-072 à 076 | Mouvement de portefeuille unique | `affectations`, `TransferModal`, `utils/affectations.js` | A / D | `mouvement_portefeuille` | 2 | CA-COM-08, 15 |
| COM-RG-080 à 084 | Codes prescripteurs, ressemblance, homoglyphes | Normalisation de `utils/text.js` | A | `code_prescripteur` | 2 | CA-COM-13, 19 |
| COM-RG-090 à 092 | Cellule Canal digital | — | N | `intervenant`, `bureau` | 2 | CA-COM-18 |
| COM-RG-100 à 104 | Cartes professionnelles | — | N | `carte_professionnelle` | 2 | — |
| COM-RG-110 | Tableaux de bord du portefeuille | `stats.js`, `AgentDashboard.jsx` | A | — | 2 | — |
| COM-RG-120 | Affectation de la facture au compte de production | — | N | `mandat_affectation_commission` | 2 | CA-COM-22 |
| COM-RG-121 | Avoir sur la facture suivante, facture émise non modifiable | Report d'une commission tardive sur la facture suivante | A | `facture_commission.avoir` | 2 | — |

## 6. Production (chapitre 8)

| Règles | Objet | Existant | Statut | Tables DD | Lot | CA |
|---|---|---|---|---|---|---|
| § 8.3, PROD-RG-001, 009 | Parcours en 8 étapes, proposition, validation par l'agent général | `ContratForm.jsx`, conversion | A | `dossier_souscription` | 2 | — |
| PROD-RG-002 à 008 | Paiement complet, période, carences, documents, preuve, statuts | `contrats`, `contrat_periodes`, `v_contrats` | A | `police`, `police_periode`, `quittance` | 2 | CA-PROD-02, 23 |
| PROD-RG-010 à 015 | Bénéficiaires du capital décès | — | N | `designation_version`, `beneficiaire`, `acceptation_beneficiaire`, `consentement_assure` | 2 | CA-PROD-01, 12 |
| PROD-RG-020 à 027 | Renouvellement, rappels, paiement direct, ÉCHUE, remise en vigueur, EXPIRÉE | Échéancier J-60/45/30, renouvellement de période | A | `police_periode`, `notification` | 2 | CA-PROD-03 à 06 |
| PROD-RG-028 | Procédure de l'art. 30 | — | N | `mise_en_demeure` | 4 | CA-PROD-14, 15 |
| PROD-RG-030 à 039, 080 à 082 | Contrats collectifs | — | N | `college`, `adhesion`, `mouvement_effectif`, `appel_prime`, `regularisation` | 4 | CA-PROD-08 à 11, 13, 16, 20, 21 |
| PROD-RG-040 à 046 | Avenants | — | N | `avenant` | 2 | CA-PROD-07, 22 |
| PROD-RG-050 à 054 | **Versements programmés** | Encaissements partiels (`encaissements`) | A (reprise de la logique) | `versement_programme` | 2 | CA-PROD-18, 19, CA-COM-23 |
| PROD-RG-060 à 062 | Ne pas renouveler, résiliation | Résiliation avec rétrocession | A | `police`, `avenant` | 2 | — |
| PROD-RG-070 à 074 | Souscription en ligne, renonciation | — | N | `dossier_souscription`, `encaissement_attente` | 2 | CA-PROD-17, 24 |
| § 8.10 | Module unique des réclamations | — | N | `reclamation` | 2 | — |

## 7. Santé (chapitre 9) – lot 3, entièrement nouveau

| Règles | Objet | Tables DD | CA |
|---|---|---|---|
| SAN-RG-001 à 010 | Prestataires, professionnels, comptes gérés par la structure | `prestataire`, `professionnel_sante`, `exercice_professionnel`, `convention_tarif` | CA-SAN-08 à 11, 13, 15 |
| SAN-RG-011 à 019 | Cartes d'assuré | `carte_assure` | CA-SAN-20 |
| SAN-RG-020 à 027 | Compteurs, validité, consultation de contrôle, exclusions, longue durée | `compteur_garantie`, `acte` | CA-SAN-02, 03, 16 à 19, 24, 32 |
| SAN-RG-030 à 037 | Pharmacie, laboratoire, imagerie | `ordonnance`, `ligne_ordonnance`, `bon_examen`, `dispensation` | CA-SAN-05, 14, 29 |
| SAN-RG-040 à 046 | Factures, facture mensuelle, paiement | `facture_prestation`, `facture_mensuelle`, `contestation_ligne` | CA-SAN-06, 07, 10, 19 |
| SAN-RG-050 à 056 | Carnet de santé, secret médical | `carnet_entree`, `journal_acces_carnet` | CA-SAN-04, 12, 29 |
| SAN-RG-060 à 063 | Options et annuaire | `prestataire_option` | CA-SAN-22, 23 |
| SAN-RG-070 à 077 | Téléconsultation | `creneau`, `rendez_vous`, `appel_teleconsultation` | CA-SAN-21, 25, 30 |
| SAN-RG-080, 081 | Mode dégradé | `prise_en_charge` | CA-SAN-26 |
| SAN-RG-090 à 095 | Urgence, hospitalisation, accident, cumul de contrats | `prise_en_charge`, `hospitalisation`, `accord_prealable` | CA-SAN-27, 28, 31 |

## 8. Sinistres (chapitre 10) – lot 4, entièrement nouveau

| Règles | Objet | Tables DD | CA |
|---|---|---|---|
| SIN-RG-001 à 006 | Déclarants, doublons, saisie simultanée, carte du défunt | `declarant`, `sinistre`, `motif_blocage` | CA-SIN-06 à 10 |
| SIN-RG-010 à 013 | Délais, pièces, relances | `piece_exigee`, `piece_recue` | CA-SIN-02 |
| SIN-RG-020 à 025 | Contrôles, provision, expertise, calcul, décision, rejet | `sinistre_garantie`, `expertise`, `mouvement_provision`, `decision_sinistre` | CA-SIN-01, 03 |
| SIN-RG-030 à 038 | Offre, dette, paiement, clôture, recours, prescription, tutelle | `offre_indemnite`, `beneficiaire_reglement`, `recours` | CA-SIN-04, 05, 11, 12 |

## 9. Finances et comptabilité (chapitre 11)

| Règles | Objet | Existant | Statut | Tables DD | Lot | CA |
|---|---|---|---|---|---|---|
| FIN-RG-070 à 078 | Société, exercices, périodes, longueurs, options, numérotation, monnaie, natures | Format `1 250 000 GNF` (`utils/format.js`) | A (format) / N | `exercice`, `periode`, `nature_compte` | 2 | CA-FIN-15, 20, 30, 31, 34 |
| FIN-RG-001 à 007 | Plan comptable | — | N | `compte` | 2 | CA-FIN-07 |
| FIN-RG-010 à 019 | Tiers comptables | — | N | `compte_auxiliaire`, `lettrage` | 2 | CA-FIN-10 à 12 |
| FIN-RG-080 à 083 | Analytique | — | N | `plan_analytique`, `section`, `ligne_analytique`, `grille_ventilation` | 2 | CA-FIN-16 |
| FIN-RG-030 à 035 | Journaux | — | N | `journal` | 2 | CA-FIN-08, 09 |
| FIN-RG-090 à 095, 034 | Taxes, déclarations, retenue à la source | Taux de taxe sur la branche ou le produit | A | `code_taxe`, `declaration_taxe` | 2 | CA-FIN-13, 14 |
| FIN-RG-100 à 104 | Modèles, banques | — | N / P | `modele_reglement`, `modele_ecriture`, `banque_operateur` | 2 | CA-FIN-17 |
| FIN-RG-020 à 026, § 11.12, 11.13 | Moteur d'écritures, EVT-01 à 27, scellement | — | N | `schema_comptable`, `ligne_schema`, `ecriture`, `ligne_ecriture`, `scellement_lot` | 2 (EVT-08 à 11 aux lots 3 et 4) | CA-FIN-01 à 05 |
| FIN-RG-110 à 116 | Saisies, fiche d'imputation, extourne | — | N | `fiche_imputation` | 2 | CA-FIN-18 |
| FIN-RG-040 à 043 | Trésorerie, journée comptable, rapprochement | — | N | `journee_comptable`, `releve_ligne` | 2 | CA-FIN-05, 19, 33 |
| FIN-RG-050 à 054 | Chaîne de paiement | Paiement des factures de commissions | A | `ordre_paiement`, `lot_paiement` | 2 | — |
| FIN-RG-060, 063 | Provision pour primes non acquises | — | N | `provision_calcul` | 2 | CA-FIN-06 (partie PPNA) |
| FIN-RG-061, 062 | Provision pour sinistres à payer | — | N | `provision_calcul` | 3 et 4 | CA-FIN-06, 32 |
| FIN-RG-064, 066 | Clôtures, à-nouveaux | — | N | `exercice`, `periode` | 2 (mensuelle), 5 (annuelle) | CA-FIN-21 |
| FIN-RG-140 à 149 | Immobilisations | — | N | `categorie_immobilisation`, `immobilisation`, `plan_amortissement`, `mouvement_immobilisation` | 5 | CA-FIN-22 à 29 |
| FIN-RG-120, 130 à 133 | Éditions, sécurité, échanges | Exports PDF et Excel côté navigateur (`export.js`) | A | — | 2 et 5 | — |

## 10. Conformité, Prévu, pilotage (chapitres 12 à 15)

| Règles | Objet | Tables DD | Lot | CA |
|---|---|---|---|---|
| CONF-RG-001 à 005 | Vigilance, criblage, alertes, soupçon | `dossier_vigilance`, `liste_sanctions`, `criblage`, `alerte_conformite`, `declaration_soupcon` | 5 (alertes COM-RG-014 dès le lot 2) | CA-CONF-01 à 03 |
| CONF-RG-006 à 008 | Consentements, droits des personnes, conservation, registre, violations | `consentement_donnees`, `demande_droit`, `registre_traitement`, `violation_donnees` | 2 (consentements), 5 | CA-CONF-04 |
| CONF-RG-009 | Décision sur les fonds reçus d'avance | — | Documentaire | — |
| REA-RG-001 à 004 | Réassurance et coassurance (Prévu) | `traite_reassurance`, `coassurance_part` | Modèle au lot 2 | — |
| ETA-RG-001 à 003 | États BCRG, détail, rapport anonyme | `correspondance_etat` | 5 (ETA-RG-003 au lot 4) | — |
| § 14.2 | Tableaux de bord par département | — | 5 (indicateurs de chaque lot livrés avec lui) | — |
| Chapitre 15 | Exigences techniques | — | Transverse ; niveau B dès le lot 1 | CA-NUM-04 (charge) |
