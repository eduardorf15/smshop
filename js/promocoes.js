import { pontuarPopularidade, obterVisualizados } from "./favoritos.js";

export function buscarPromocoes(produtos, limite = 8) {
  return produtos
    .filter((produto) => Number(produto.desconto || 0) > 0 && produto.disponivel !== false)
    .sort((a, b) => Number(b.desconto || 0) - Number(a.desconto || 0))
    .slice(0, limite);
}

export function buscarPopulares(produtos, limite = 8) {
  return produtos
    .map((produto) => ({ produto, pontos: pontuarPopularidade(produto) }))
    .filter((item) => item.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos)
    .slice(0, limite)
    .map((item) => ({ ...item.produto, popular: true }));
}

export function buscarVisualizados(produtos, limite = 10) {
  const porId = new Map(produtos.map((produto) => [produto.id, produto]));
  return obterVisualizados()
    .map((id) => porId.get(id))
    .filter(Boolean)
    .slice(0, limite);
}
