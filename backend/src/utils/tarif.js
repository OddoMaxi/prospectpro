// Tarification d'un produit :
//   Prime commerciale = Prime pure × bénéficiaires + Coût de police + Accessoires
//   Prime TTC         = Prime commerciale + Taxes (taux du produit, sinon de la branche)
// Le coût de police et les accessoires sont comptés une fois par ligne de contrat.
const round = n => Math.round(Number(n) || 0);

function tauxTaxe(product, branche) {
  if (product.taux_taxe !== null && product.taux_taxe !== undefined && product.taux_taxe !== '') {
    return Number(product.taux_taxe) || 0;
  }
  return Number(branche && branche.taux_taxe) || 0;
}

function tarifLigne(product, branche, nb = 1) {
  const n = Math.max(1, Number(nb) || 1);
  const prime_pure = round(Number(product.prime_pure) * n);
  const cout_police = round(product.cout_police);
  const accessoires = round(product.accessoires);
  const prime_commerciale = prime_pure + cout_police + accessoires;
  const taux_taxe = tauxTaxe(product, branche);
  const taxes = round(prime_commerciale * taux_taxe / 100);
  return {
    nb_beneficiaires: n, prime_pure, cout_police, accessoires,
    prime_commerciale, taux_taxe, taxes, prime_ttc: prime_commerciale + taxes,
  };
}

module.exports = { tarifLigne, tauxTaxe, round };
