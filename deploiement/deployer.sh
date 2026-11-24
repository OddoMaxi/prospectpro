#!/usr/bin/env bash
# Déploiement sur le VPS, lancé par GitHub Actions après la mise à jour du dépôt (git pull) :
#   bash deploiement/deployer.sh production   → application actuelle (docker-compose.yml)
#   bash deploiement/deployer.sh recette      → refonte (docker-compose.recette.yml, .env.recette)
# Les données (volumes Docker) et les fichiers .env ne sont jamais touchés.
set -euo pipefail
cd "$(dirname "$0")/.."

case "${1:-}" in
  production)
    docker compose up -d --build --remove-orphans
    ;;
  recette)
    test -f .env.recette || { echo "Fichier .env.recette absent : voir deploiement/env.recette.exemple" >&2; exit 1; }
    compose=(docker compose -f docker-compose.recette.yml --env-file .env.recette)
    "${compose[@]}" up -d --build --remove-orphans
    # Première installation (sans effet si la base est déjà installée) ; les migrations s'appliquent au démarrage
    for i in $(seq 1 30); do
      [ "$(docker inspect -f '{{.State.Health.Status}}' "$("${compose[@]}" ps -q app)")" = healthy ] && break
      sleep 2
    done
    "${compose[@]}" exec -T app node dist/amorcage/cli.js
    ;;
  *)
    echo "Usage : $0 production|recette" >&2; exit 2
    ;;
esac

docker image prune -f >/dev/null
echo "Déploiement $1 terminé : $(git log -1 --format='%h %s')"
