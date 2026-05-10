const FAVORITOS_KEY = "smshop:favoritos:v1";
const METRICAS_KEY = "smshop:metricas:v1";
const RECENTES_KEY = "smshop:recentes:v1";

const lerJson = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
};

const salvarJson = (key, value) => localStorage.setItem(key, JSON.stringify(value));

export function obterFavoritos() {
  return lerJson(FAVORITOS_KEY, []);
}

export function produtoFavoritado(id) {
  return obterFavoritos().includes(Number(id));
}

export function favoritarProduto(id) {
  const produtoId = Number(id);
  const favoritos = obterFavoritos();
  const atualizado = favoritos.includes(produtoId)
    ? favoritos.filter((item) => item !== produtoId)
    : [...favoritos, produtoId];

  salvarJson(FAVORITOS_KEY, atualizado);
  atualizarContadores();
  return atualizado.includes(produtoId);
}

export function registrarMetrica(id, tipo) {
  const produtoId = Number(id);
  const metricas = lerJson(METRICAS_KEY, {});
  metricas[produtoId] = metricas[produtoId] || { visualizacoes: 0, cliques: 0 };
  metricas[produtoId][tipo] = Number(metricas[produtoId][tipo] || 0) + 1;
  salvarJson(METRICAS_KEY, metricas);
  atualizarContadores();
}

export function obterMetricas() {
  return lerJson(METRICAS_KEY, {});
}

export function pontuarPopularidade(produto) {
  const metricas = obterMetricas()[produto.id] || {};
  const fav = produtoFavoritado(produto.id) ? 5 : 0;
  return fav + Number(metricas.cliques || 0) * 2 + Number(metricas.visualizacoes || 0);
}

export function registrarVisualizado(id) {
  const produtoId = Number(id);
  const recentes = lerJson(RECENTES_KEY, []).filter((item) => item !== produtoId);
  salvarJson(RECENTES_KEY, [produtoId, ...recentes].slice(0, 10));
  registrarMetrica(produtoId, "visualizacoes");
}

export function obterVisualizados() {
  return lerJson(RECENTES_KEY, []);
}

export function atualizarContadores() {
  const favoritos = obterFavoritos();
  const visualizados = obterVisualizados();
  document.querySelectorAll("[data-favorites-count]").forEach((el) => {
    el.textContent = favoritos.length;
  });
  document.querySelectorAll("[data-viewed-count]").forEach((el) => {
    el.textContent = visualizados.length;
  });
}

export function criarInterfaceFavoritos(produtos, abrirProduto) {
  if (!document.querySelector(".nav-actions")) {
    document.querySelector(".nav-menu")?.insertAdjacentHTML(
      "beforeend",
      `<div class="nav-actions">
        <button class="nav-pill" type="button" data-open-favorites aria-label="Abrir favoritos">❤️ <span data-favorites-count>0</span></button>
        <span class="nav-pill" aria-label="Produtos visualizados">👀 <span data-viewed-count>0</span></span>
      </div>`
    );
  }

  if (!document.querySelector("#favoritesDrawer")) {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<section class="favorites-drawer" id="favoritesDrawer" aria-hidden="true">
        <div class="favorites-backdrop" data-close-favorites></div>
        <aside class="favorites-panel" aria-label="Produtos favoritos">
          <div class="favorites-head">
            <div><p class="product-category">Favoritos</p><h2>Seus produtos salvos</h2></div>
            <button class="modal-close" type="button" data-close-favorites aria-label="Fechar">x</button>
          </div>
          <div class="favorites-list" id="favoritesList"></div>
        </aside>
      </section>`
    );
  }

  const drawer = document.querySelector("#favoritesDrawer");
  const render = () => {
    const favoritos = obterFavoritos();
    const lista = document.querySelector("#favoritesList");
    const itens = produtos.filter((produto) => favoritos.includes(produto.id));
    lista.innerHTML = itens.length
      ? itens.map((produto) => `
          <button class="favorite-item" type="button" data-id="${produto.id}">
            <img src="${produto.imagemPrincipal}" alt="">
            <span><strong>${produto.nome}</strong><small>${produto.preco}</small></span>
          </button>
        `).join("")
      : `<div class="empty-state">Nenhum favorito salvo ainda.</div>`;

    lista.querySelectorAll("[data-id]").forEach((item) => {
      item.addEventListener("click", () => {
        drawer.classList.remove("is-open");
        drawer.setAttribute("aria-hidden", "true");
        abrirProduto(Number(item.dataset.id));
      });
    });
  };

  document.querySelectorAll("[data-open-favorites]").forEach((button) => {
    if (button.dataset.boundFavorites === "true") return;
    button.dataset.boundFavorites = "true";
    button.addEventListener("click", () => {
      render();
      drawer.classList.add("is-open");
      drawer.setAttribute("aria-hidden", "false");
    });
  });

  document.querySelectorAll("[data-close-favorites]").forEach((button) => {
    if (button.dataset.boundCloseFavorites === "true") return;
    button.dataset.boundCloseFavorites = "true";
    button.addEventListener("click", () => {
      drawer.classList.remove("is-open");
      drawer.setAttribute("aria-hidden", "true");
    });
  });

  atualizarContadores();
}
