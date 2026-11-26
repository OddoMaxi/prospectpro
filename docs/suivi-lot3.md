# Prospect Pro – Suivi de réalisation du lot 3 (santé)

Références : CDC V1.4 (chapitre 9, § 5.6), DD 1.1 (chapitre 8), maquettes V1.4. Branche `refonte/lot1`. Critères d'acceptation : CA-SAN-01 à 32.

## Découpage

| Sous-lot | Contenu | État |
|---|---|---|
| 3.1 Prestataires et professionnels | Nomenclatures des actes et des médicaments (saisie, import ligne par ligne). Types de prestataires paramétrés (professions admises, donc profils, et options par défaut). Prestataire : fiche tiers personne morale, options (garde, 24 h/24, urgences, téléconsultation, hospitalisation), tarifs conventionnés datés par acte, médicament ou forfait ; agrément (convention, coordonnées vérifiées, tarifs) validé par le médecin-conseil puis la DAF, qui active le compte de l'administrateur désigné ; suspension (réversible) ou fin de convention : tous les comptes désactivés, sessions fermées. Portail de l'administrateur : création des comptes nominatifs des professionnels (profil fixé par la profession et le type de structure, pièces jointes), activation et désactivation immédiates, journal de la structure. Agrément individuel du professionnel par le médecin-conseil ; compte inactif avant ; un même professionnel exerce dans plusieurs structures avec un compte par structure ; retrait de l'agrément : comptes désactivés partout ; habilitation à la téléconsultation | Réalisé (CA-SAN-08, 10 pour la structure, 11, 13) |
| 3.2 Cartes d'assuré | Carte numérique à l'émission, carte physique sur demande, production et remise, perte et vol (EVT-26), QR code signé | À faire |
| 3.3 Moteur de droits et compteurs | Carences, plafonds, nombre d'actes, exclusions, réservation et consommation en temps réel | À faire |
| 3.4 Prises en charge | Vérification de la carte, ouverture par code, actes, urgence, hospitalisation, accords préalables, consultation de contrôle | À faire |
| 3.5 Ordonnances, pharmacie, examens | Ordonnances et bons numériques, dispensation partielle, génériques, laboratoire et imagerie | À faire |
| 3.6 Factures des prestataires | Facture de prestation, contrôles, facture mensuelle, contestation, EVT-08 et EVT-09, provision pour sinistres à payer | À faire |
| 3.7 Carnet de santé | Carnet chiffré, vues par profil, accès limités et journalisés, catégories sensibles | À faire |
| 3.8 Téléconsultation | Agenda, rendez-vous, appel WhatsApp ou téléphone, confirmation | À faire |
| 3.9 Annuaire et mode dégradé | Annuaire public, SMS, USSD, code de secours | À faire |

## Écarts et décisions

- 3.1 : table `type_prestataire` ajoutée (citée au § 9.14 comme « profil_type_prestataire », absente du DD 1.1). Profils externes ajoutés : administrateur du prestataire, médecin prescripteur, biologiste, radiologue, pharmacien, professionnel exécutant. Circuits : agrément d'un prestataire par le médecin-conseil puis la DAF, agrément d'un professionnel par le médecin-conseil (à confirmer par la Direction).
- 3.1 : faute de procédure de réinitialisation du mot de passe, le mot de passe initial de l'administrateur est fixé par le gestionnaire santé à la proposition d'agrément (compte inactif jusqu'à la validation) ; celui d'un professionnel par l'administrateur de sa structure. Le changement de mot de passe à la première connexion reste à prévoir avec les portails.
