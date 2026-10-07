// Même calcul que le serveur (backend/src/utils/tarif.js) pour les aperçus à l'écran :
// prime commerciale = prime pure × bénéficiaires + coût de police + accessoires ; TTC = commerciale + taxes
export function tarif(p, nb = 1) {
  const n = Math.max(1, Number(nb) || 1)
  const prime_pure = Math.round(Number(p.prime_pure || 0) * n)
  const prime_commerciale = prime_pure + Math.round(Number(p.cout_police) || 0) + Math.round(Number(p.accessoires) || 0)
  const taux = Number(p.taux_taxe_effectif ?? p.taux_taxe ?? 0) || 0
  const taxes = Math.round(prime_commerciale * taux / 100)
  return { prime_pure, prime_commerciale, taxes, prime_ttc: prime_commerciale + taxes }
}
