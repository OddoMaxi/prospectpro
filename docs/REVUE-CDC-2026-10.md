# CRM Assurance — Livraison du cahier des charges du 5 octobre 2026

Ce document accompagne la livraison des améliorations. Il contient :

1. la revue générale demandée au §8.7 ;
2. les règles de calcul retenues là où le cahier des charges laissait un choix, à valider avant la mise en recette ;
3. la procédure de réinitialisation (§9.1) ;
4. l'état de la recette (§9.2).

---

## 1. Revue générale (§8.7)

### 1.1 Fonctionnalités en double, supprimées

| Doublon constaté | Décision |
|---|---|
| Bouton « Nouveau prospect » présent dans le menu, sur le tableau de bord et dans la liste des prospects (deux boutons) | Conservé uniquement dans le menu (§7.2). |
| Deux fenêtres de conversion prospect → client quasi identiques (écran admin et écran agent) | Une seule fenêtre, partagée. Elle sert aussi à créer un nouveau contrat pour un client existant. |
| Deux formulaires d'agent copiés-collés (création d'un Sénior par l'admin, d'un Junior par le Sénior) | Un seul formulaire, qui adapte ses droits au rôle. |
| Deux listes de prospects (admin et agent) | Une seule liste ; l'admin voit tout, l'agent son périmètre. |
| Deux mises en page (admin et agent) | Une seule ; seul le menu diffère. |
| Relance client dans la liste des clients et suivi des fins de contrat à deux endroits | Regroupés dans l'échéancier (J-60 / J-45 / J-30) et sur la fiche contrat. |
| Brouillard de commissions (agent) et liste des commissions (admin) | Remplacés par les factures mensuelles, avec un seul écran pour les deux rôles. |

### 1.2 Incohérences de calcul entre les écrans, corrigées

| Incohérence | Correction |
|---|---|
| La « commission Sénior » valait le taux parent saisi sur l'agent dans les statistiques, mais la différence des taux produit lors de la conversion. Deux montants différents selon l'écran. | Une seule règle : les taux du produit (total et part Junior). Le taux parent saisi sur l'agent n'est plus utilisé. |
| Les objectifs ramenés à la période étaient calculés différemment sur le tableau de bord admin et sur celui de l'agent. | Une seule formule : nombre de contrats par mois × nombre de mois de la période ; montant = nombre × prime pure. |
| Les tableaux de bord additionnaient des commissions « prévisionnelles » (prospects) et réelles. | Les commissions affichées sont uniquement celles réellement acquises (primes intégralement payées). La prévision reste visible dans le simulateur du prospect. |
| La conversion effaçait le prospect : le taux de conversion baissait après coup. | Le prospect est conservé au statut « Converti ». |
| La suppression d'un agent, d'un produit ou d'un client effaçait des données : les totaux historiques changeaient. | Suppression logique partout ; les totaux historiques comptent toutes les opérations réalisées. Les classements et objectifs excluent les éléments inactifs, suspendus ou supprimés. |
| Montants affichés avec des formats différents (avec ou sans GNF, séparateurs variables). | Format unique `1 250 000 GNF` (espace insécable) : écrans, saisie, PDF, Excel. |

### 1.3 Anomalies corrigées pendant la revue

- Les dates (type DATE) pouvaient être décalées d'un jour selon le fuseau horaire du serveur.
- Un compte désactivé gardait l'accès jusqu'à l'expiration de sa session (8 h). La suspension est désormais immédiate.
- Supprimer un agent sans transfert effaçait ses prospects.
- Supprimer un produit le retirait des prospects et des statistiques.
- Le paiement d'une commission n'était pas plafonné.
- Un Sénior pouvait supprimer ses Juniors. C'est maintenant réservé à l'administrateur (§3).

**Bugs connus de votre côté :** le cahier des charges prévoit que vous fournissiez cette liste. Elle ne nous est pas encore parvenue ; envoyez-la pour qu'elle soit traitée.

### 1.4 Propositions complémentaires (à valider avant développement)

1. **Envoi automatique des relances par SMS** via un fournisseur (Orange, MTN…). Aujourd'hui, l'agent ouvre WhatsApp ou ses SMS avec le message pré-rempli, puis confirme l'envoi lui-même.
2. **Rétrocession au prorata** de la durée restante en cas de résiliation, au lieu d'une rétrocession totale de la période en cours.
3. **Sauvegarde automatique quotidienne** de la base (pg_dump) avec rotation.
4. **Exécution automatique de la recette** à chaque modification (le script existe déjà, cf. §4).
5. **Double authentification** pour le compte administrateur.
6. **Mise à jour de `render.yaml`**, qui décrit encore l'ancienne base Turso. Le déploiement réel passe par Docker Compose.

---

## 2. Règles de calcul retenues — à valider

| # | Point | Règle appliquée |
|---|---|---|
| 1 | Coût de police et accessoires | Comptés une fois par produit souscrit sur le contrat, quel que soit le nombre de bénéficiaires. La prime pure, elle, est multipliée par le nombre de bénéficiaires. |
| 2 | Taxes | Taux × prime commerciale. Taux du produit s'il est renseigné, sinon celui de la branche. |
| 3 | Déclenchement des commissions | À la souscription comme au renouvellement : quand la prime TTC de la période est intégralement payée. Date retenue = date du paiement qui solde la prime. Base = prime pure. |
| 4 | Agent crédité | L'agent qui suit le client à la date du paiement intégral (donc l'intérimaire pendant un transfert temporaire). |
| 5 | Prime de performance | Payée seulement sur un renouvellement soldé au plus tard à « échéance − délai du produit » (1 mois par défaut). L'indicateur « renouvellement anticipé » du tableau de bord utilise 1 mois. |
| 6 | Répartition Sénior / Junior | Taux séparés sur le produit (souscription, renouvellement, performance) : le Junior touche sa part, le Sénior la différence. Un Sénior qui vend seul touche le taux total. |
| 7 | Objectifs | Nombre de contrats par mois et par produit ; objectif en montant = nombre × prime pure. Seuls les produits actifs comptent. |
| 8 | Résiliation | Rétrocession de toutes les commissions de la période en cours, en lignes négatives sur la facture du mois suivant (option décochable). |
| 9 | Facture négative | Si les rétrocessions dépassent les commissions du mois, la validation solde la facture à 0 et reporte le déficit sur le mois suivant. |
| 10 | Facture d'un mois déjà validé | Une commission acquise sur un mois déjà validé est reportée sur la prochaine facture en brouillon. |
| 11 | Intérimaire en cas d'inactivité | Dans l'ordre : l'intérimaire désigné sur la fiche de l'agent, puis le Sénior (pour un Junior), puis l'intérimaire par défaut des paramètres. Sans aucun intérimaire, l'agent passe « inactif » et l'administrateur est alerté pour transférer manuellement. |
| 12 | Retour d'activité | À sa première connexion ou action, l'agent redevient actif et récupère ce qui lui avait été confié temporairement. Les clients signés par l'intérimaire pendant l'absence restent à l'intérimaire. |
| 13 | Filtre « Exercice » sur les listes | Prospects : créés dans l'année. Clients : acquis dans l'année ou ayant un contrat en vigueur dans l'année. Contrats : en vigueur dans l'année. Factures : mois de l'année. |
| 14 | Annulation d'un encaissement | Réservée à l'administrateur. Si la prime n'est plus soldée, les commissions de la période sont rétrocédées le mois suivant. |
| 15 | Correction automatique Profession / Secteur | Seuil de similarité 0,85 (paramétrable). Pas de correction quand deux valeurs sont presque aussi proches l'une que l'autre : l'agent choisit dans la liste. |

---

## 3. Réinitialisation de la base (§9.1)

À faire une fois les modifications déployées. Le script :

- sauvegarde toutes les tables dans `backups/sauvegarde-<date>.json` ;
- supprime toutes les données métier et le paramétrage (agents, prospects, clients, contrats, commissions, factures, paiements, branches, produits) ;
- recrée la structure à jour ;
- conserve le compte administrateur avec son mot de passe actuel ;
- recharge les lieux et les listes initiales de professions et de secteurs.

Avec Docker Compose, sur le serveur :

```bash
# 1. Sauvegarde complète supplémentaire, hors du conteneur
docker compose exec db pg_dump -U koby_user koby > sauvegarde-avant-reset.sql

# 2. Réinitialisation
docker compose exec app node scripts/reset-db.js --confirm

# 3. Récupérer la sauvegarde JSON produite dans le conteneur
docker compose cp app:/app/backups ./backups
```

Recréez ensuite le paramétrage depuis l'interface : branches, produits, puis paramètres.

---

## 4. Recette (§9.2)

Un script de recette automatisé déroule les scénarios du §9.2 contre l'API, sur une base **vide**. Il refuse de tourner si la base contient déjà des agents :

```bash
DATABASE_URL=... API_URL=http://localhost:3001/api node backend/scripts/recette-api.js
```

Résultat sur une base de test neuve : **67 vérifications réussies, 0 en échec**.

| Scénario du §9.2 | Couvert |
|---|---|
| Branche, produit avec prime de performance, prime commerciale et TTC | ✓ |
| Admin → Sénior avec objectifs → Junior avec objectifs | ✓ (+ historique des objectifs) |
| Profession mal orthographiée corrigée | ✓ (« medcin » → « Médecin », « comerce » → « COMMERCE ») |
| Conversion, souscription, commission répartie Sénior / Junior | ✓ |
| Renouvellement à plus d'un mois de l'échéance : commission + prime de performance | ✓ |
| Renouvellement à moins d'un mois : commission sans prime de performance | ✓ |
| Facture mensuelle, deux tranches, dépassement refusé | ✓ (+ reçu) |
| Résiliation et rétrocession le mois suivant | ✓ (+ facture négative reportée) |
| Inactivité : transfert temporaire puis restitution | ✓ |
| Suppression d'un agent bloquée tant que le portefeuille n'est pas transféré | ✓ |
| Suspension d'un agent et d'un produit, ajustement immédiat des tableaux de bord | ✓ |
| Séparateur de milliers (écrans, PDF, exports) | ✓ contrôlé à l'écran, dans la facture PDF et dans l'export Excel |
| Filtre par année et comparaison N-1 | ✓ |
| Droits d'accès de chaque rôle | ✓ |

Les 40 écrans ont aussi été ouverts automatiquement avec chaque rôle (admin, Sénior, Junior), sans aucune erreur. Les parcours clés ont été rejoués à l'écran : saisie d'un prospect avec correction et alerte de doublon, conversion, validation et paiement d'une facture, exports PDF et Excel.
