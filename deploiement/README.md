# Déploiement automatique

À chaque push, GitHub Actions (`.github/workflows/deploiement.yml`) se connecte au VPS par SSH, met le dépôt à jour (`git pull --ff-only`) et relance l'application avec `deploiement/deployer.sh`. Personne n'a à intervenir sur le serveur.

| Branche | Environnement | Dossier sur le VPS | Contrôles avant déploiement |
|---|---|---|---|
| `master` | Production : application actuelle (`docker-compose.yml`) | secret `VPS_DOSSIER_PRODUCTION` | aucun (l'application actuelle n'a pas de tests) |
| `refonte/lot1` | Recette : refonte (`docker-compose.recette.yml`), port 8080 | secret `VPS_DOSSIER_RECETTE` | types, 79 tests, construction de l'interface et de l'image Docker |

Si une étape échoue, rien n'est déployé et GitHub envoie un courriel. Les données (volumes Docker) et les fichiers `.env` du VPS ne sont jamais modifiés.

## Mise en place (une seule fois)

Sur le VPS :

1. Ajouter la clé publique de déploiement à `~/.ssh/authorized_keys` de l'utilisateur qui lance Docker.
2. Cloner une seconde copie du dépôt pour la recette : `git clone -b refonte/lot1 https://github.com/OddoMaxi/prospectpro.git /opt/prospectpro-recette`.
3. Dans ce dossier, créer `.env.recette` à partir de `deploiement/env.recette.exemple` (`chmod 600`).
4. Ouvrir le port 8080 du pare-feu, s'il y en a un.

Dans GitHub (Settings › Secrets and variables › Actions), renseigner `VPS_HOTE`, `VPS_UTILISATEUR`, `VPS_CLE_SSH` (clé privée de déploiement), `VPS_EMPREINTE_HOTE` (sortie de `ssh-keyscan <hôte>`), `VPS_DOSSIER_PRODUCTION` et `VPS_DOSSIER_RECETTE`.

La recette est servie en HTTP sur le port 8080, avec des données fictives seulement. Un sous-domaine en HTTPS (par exemple `recette.cgsassurances.com`) est à prévoir avant toute donnée réelle.
