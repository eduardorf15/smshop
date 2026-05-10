export async function atualizarProdutosMercadoLivre(produtos) {

  for (const produto of produtos) {

    if (!produto.meliId) continue;

    try {

      const response = await fetch(
        `https://api.mercadolibre.com/sites/MLB/search?q=${produto.meliId}`
      );

      const data = await response.json();

      const item =
        data.results?.find((p) => p.id === produto.meliId) ||
        data.results?.[0];

      if (!item) continue;

      // PREÇO
      produto.precoNumero = Number(item.price || produto.precoNumero);

      produto.preco = produto.precoNumero.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
      });

      // PROMOÇÕES
      produto.emPromocao =
        item.original_price &&
        item.original_price > item.price;

      if (produto.emPromocao) {

        produto.desconto = Math.round(
          ((item.original_price - item.price) / item.original_price) * 100
        );

        produto.precoAntigo =
          Number(item.original_price).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL"
          });

      }

      // FRETE GRATIS
      produto.freteGratis =
        item.shipping?.free_shipping || false;

      // ESTOQUE
      produto.ultimasUnidades =
        item.available_quantity <= 5;

      produto.disponivel =
        item.available_quantity > 0;

      // POPULARIDADE
      produto.popular =
        item.sold_quantity >= 50;

      console.log(
        `[SMshop] ${produto.nome} atualizado →`,
        produto.preco
      );

    } catch (error) {

      console.error(
        `[SMshop] erro ao atualizar ${produto.nome}`,
        error
      );

    }
  }

  return produtos;
}