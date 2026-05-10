import { produtos as produtosBase, categorias } from "./products.js";
import { galerias, IMAGEM_PADRAO } from "./galerias.js";
import { sincronizarProdutos, atualizarCards } from "./api.js";
import { atualizarProdutosMercadoLivre } from "./meli-api.js";
import {
  atualizarContadores,
  criarInterfaceFavoritos,
  favoritarProduto,
  pontuarPopularidade,
  produtoFavoritado,
  registrarMetrica,
  registrarVisualizado
} from "./favoritos.js";
import { buscarPopulares, buscarPromocoes, buscarVisualizados } from "./promocoes.js";

let produtos = produtosBase.map(completarGaleriaProduto);
let ultimoRenderCategoria = null;
let produtosSincronizados = false;

// NAVBAR
const qs = (selector, scope = document) => scope.querySelector(selector);
const qsa = (selector, scope = document) => [...scope.querySelectorAll(selector)];

const page = document.body.dataset.page;
const menuToggle = qs(".menu-toggle");
const navMenu = qs(".nav-menu");
const dropdownToggle = qs(".dropdown-toggle");
const dropdown = qs(".dropdown");
const navSearch = qs("#navSearch");
const modal = qs("#productModal");
let produtoAberto = null;
let imagemAtual = 0;
let touchStartX = 0;
let lightbox = null;
let zoomAtual = 1;

function normalizar(texto) {
  return texto
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function dinheiroParaNumero(valor) {
  return Number(valor.replace("R$", "").replace(".", "").replace(",", ".").trim());
}

function slugCategoria(categoria) {
  return normalizar(categoria).replace(/\s+/g, "-");
}

function estrelasHtml(nota) {
  const cheias = Math.floor(nota);
  const estrelas = "★★★★★".slice(0, cheias).padEnd(5, "☆");
  return `<span class="stars" aria-label="${nota} de 5 estrelas">${estrelas}</span><strong>${nota}</strong>`;
}

function debounce(callback, delay = 220) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), delay);
  };
}

function completarGaleriaProduto(produto) {
  const dadosGaleria = galerias[produto.id] || {};
  const galeria = Array.isArray(dadosGaleria.galeria) && dadosGaleria.galeria.length
    ? dadosGaleria.galeria
    : [IMAGEM_PADRAO];
  const imagemPrincipal = dadosGaleria.imagemPrincipal || galeria[0] || IMAGEM_PADRAO;

  return {
    ...produto,
    imagemPrincipal,
    galeria
  };
}

function aplicarFallbackImagem(imagem) {
  imagem.addEventListener("error", () => {
    imagem.src = IMAGEM_PADRAO;
  }, { once: true });
}

function iniciarNavbar() {
  const painelDropdown = qs(".dropdown-panel");
  if (painelDropdown && !qs("[data-all-products]", painelDropdown)) {
    painelDropdown.insertAdjacentHTML(
      "afterbegin",
      `<a class="dropdown-all" data-all-products href="categoria.html">Ver Todos os Produtos</a>`
    );
  }

  if (!qs(".quick-filters") && navMenu) {
    navMenu.insertAdjacentHTML(
      "beforeend",
      `<div class="quick-filters" aria-label="Filtros rapidos">
        <a href="categoria.html?ordem=desconto">🔥 Ofertas</a>
        <a href="categoria.html?ordem=populares">⭐ Populares</a>
        <a href="categoria.html?ordem=menor">Menor preco</a>
      </div>`
    );
  }

  qsa("[data-category-link]").forEach((link) => {
    const categoria = link.dataset.categoryLink;
    link.href = `categoria.html?cat=${encodeURIComponent(categoria)}`;
  });

  if (menuToggle && navMenu) {
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.addEventListener("click", () => {
      navMenu.classList.toggle("is-open");
      menuToggle.classList.toggle("is-active");
      menuToggle.setAttribute("aria-expanded", navMenu.classList.contains("is-open").toString());
    });
  }

  if (dropdownToggle && dropdown) {
    dropdownToggle.setAttribute("aria-expanded", "false");
    dropdownToggle.addEventListener("click", (event) => {
      event.preventDefault();
      dropdown.classList.toggle("is-open");
      dropdownToggle.setAttribute("aria-expanded", dropdown.classList.contains("is-open").toString());
    });
  }

  document.addEventListener("click", (event) => {
    if (dropdown && !dropdown.contains(event.target)) {
      dropdown.classList.remove("is-open");
      dropdownToggle?.setAttribute("aria-expanded", "false");
    }

    if (navMenu?.classList.contains("is-open") && !navMenu.contains(event.target) && !menuToggle?.contains(event.target)) {
      navMenu.classList.remove("is-open");
      menuToggle?.classList.remove("is-active");
      menuToggle?.setAttribute("aria-expanded", "false");
    }
  });

  if (navSearch) {
    const pesquisar = debounce(() => {
      if (page === "categoria") {
        const searchInput = qs("#categorySearch");
        if (searchInput) {
          searchInput.value = navSearch.value;
          searchInput.dispatchEvent(new Event("input"));
        }
      }
    }, 180);

    navSearch.addEventListener("input", pesquisar);
    navSearch.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && navSearch.value.trim()) {
        window.location.href = `categoria.html?busca=${encodeURIComponent(navSearch.value.trim())}`;
      }
    });
  }
}

// CARD PRODUTO
function produtoBadgesHtml(produto) {
  const badges = [];
  if (produto.disponivel === false) badges.push(`<span class="dynamic-badge unavailable">Produto indisponivel</span>`);
  if (produto.desconto > 0) badges.push(`<span class="dynamic-badge offer">🔥 Oferta</span>`);
  if (produto.freteGratis) badges.push(`<span class="dynamic-badge shipping">🚚 Frete gratis</span>`);
  if (produto.ultimasUnidades) badges.push(`<span class="dynamic-badge stock">⚡ Ultimas unidades</span>`);
  if (pontuarPopularidade(produto) >= 3 || produto.popular) badges.push(`<span class="dynamic-badge popular">⭐ Popular</span>`);
  if (produtoFavoritado(produto.id)) badges.push(`<span class="dynamic-badge favorite">❤️ Favoritado</span>`);
  return badges.length ? `<div class="dynamic-badges">${badges.join("")}</div>` : "";
}

function precoHtml(produto) {
  return `
    <div class="price-stack">
      ${produto.precoAntigo ? `<span class="old-price">${produto.precoAntigo}</span>` : ""}
      <strong class="price">${produto.preco}</strong>
      ${produto.desconto ? `<span class="discount-line">${produto.desconto}% OFF</span>` : ""}
      ${produto.parcelamento ? `<span class="installments">${produto.parcelamento}</span>` : ""}
    </div>
  `;
}

function produtoCardHtml(produto) {
  const indisponivel = produto.disponivel === false;
  console.debug("[SMshop][render-card]", {
    id: produto.id,
    nome: produto.nome,
    precoFinalRenderizado: produto.preco,
    precoNumeroFinalRenderizado: produto.precoNumero,
    apiStatus: produto.apiStatus,
    produtosSincronizados
  });

  return `
    <article class="product-card ${indisponivel ? "is-unavailable" : ""}" data-product-id="${produto.id}">
      <button class="favorite-button ${produtoFavoritado(produto.id) ? "is-active" : ""}" type="button" data-favorite-id="${produto.id}" aria-label="Favoritar ${produto.nome}">❤️</button>
      <button class="product-click" type="button" aria-label="Ver detalhes de ${produto.nome}">
        <span class="product-badge">${produto.categoria}</span>
        <span class="product-image-shell">
          <img src="${produto.imagemPrincipal}" alt="${produto.nome}" loading="lazy">
        </span>
      </button>
      <div class="product-body">
        <div class="rating">${estrelasHtml(produto.estrelas)}</div>
        <p class="product-category">${produto.categoria}</p>
        <h3>${produto.nome}</h3>
        <p class="product-short">${produto.descricaoCurta}</p>
        ${produtoBadgesHtml(produto)}
        <div class="product-bottom">
          ${precoHtml(produto)}
          <div class="product-actions">
            <button class="btn btn-soft btn-small details-button" type="button" data-id="${produto.id}">Ver Detalhes</button>
            ${indisponivel
              ? `<span class="btn btn-disabled btn-small">Indisponivel</span>`
              : `<a class="btn btn-primary btn-small buy-button" href="${produto.linkAfiliado}" target="_blank" rel="noopener" data-buy-id="${produto.id}">Ver Oferta</a>`}
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderSkeletons(containerSelector, quantidade = 6) {
  const container = qs(containerSelector);
  if (!container) return;
  container.innerHTML = Array.from({ length: quantidade }, () => `
    <article class="product-card skeleton-card">
      <div class="skeleton-image"></div>
      <div class="product-body">
        <span class="skeleton-line small"></span>
        <span class="skeleton-line"></span>
        <span class="skeleton-line short"></span>
        <span class="skeleton-line price-line"></span>
      </div>
    </article>
  `).join("");
}

function renderProdutos(lista, containerSelector, limite) {
  const container = qs(containerSelector);
  if (!container) return;
  if (!produtosSincronizados) {
    console.debug("[SMshop][render-card] Render bloqueado ate sincronizarProdutos() terminar.", {
      containerSelector
    });
    renderSkeletons(containerSelector, limite || 6);
    return;
  }

  const itens = limite ? lista.slice(0, limite) : lista;
  container.innerHTML = itens.length
    ? itens.map(produtoCardHtml).join("")
    : `<div class="empty-state">Nenhum produto encontrado para sua busca.</div>`;

  qsa(".product-card", container).forEach((card) => {
    card.addEventListener("click", (event) => {
      const clicouComprar = event.target.closest("a");
      const clicouFavorito = event.target.closest("[data-favorite-id]");
      if (clicouComprar) return;
      if (clicouFavorito) return;
      abrirModalProduto(Number(card.dataset.productId));
    });
  });

  qsa("[data-buy-id]", container).forEach((link) => {
    link.addEventListener("click", () => registrarMetrica(Number(link.dataset.buyId), "cliques"));
  });

  qsa("[data-favorite-id]", container).forEach((button) => {
    button.addEventListener("click", () => {
      const ativo = favoritarProduto(Number(button.dataset.favoriteId));
      button.classList.toggle("is-active", ativo);
      atualizarCards(() => renderProdutos(itens, containerSelector));
      renderSecoesDinamicas();
    });
  });

  qsa("img", container).forEach(aplicarFallbackImagem);
  revelarElementos(qsa(".product-card", container));
}

// MODAL PRODUTO
function abrirModalProduto(id) {
  produtoAberto = produtos.find((produto) => produto.id === id);
  imagemAtual = 0;
  if (!produtoAberto || !modal) return;
  console.debug("[SMshop][render-modal]", {
    id: produtoAberto.id,
    nome: produtoAberto.nome,
    precoFinalModal: produtoAberto.preco,
    precoNumeroFinalModal: produtoAberto.precoNumero,
    apiStatus: produtoAberto.apiStatus,
    produtosSincronizados
  });
  registrarVisualizado(id);

  qs("#modalName").textContent = produtoAberto.nome;
  qs("#modalCategory").textContent = produtoAberto.categoria;
  qs("#modalPrice").innerHTML = precoHtml(produtoAberto);
  qs("#modalRating").innerHTML = estrelasHtml(produtoAberto.estrelas);
  qs("#modalDescription").textContent = produtoAberto.descricaoLonga;
  const modalBuy = qs("#modalBuy");
  modalBuy.href = produtoAberto.linkAfiliado;
  modalBuy.style.display = produtoAberto.disponivel === false ? "none" : "inline-flex";
  modalBuy.onclick = () => registrarMetrica(produtoAberto.id, "cliques");
  qs(".modal-info .dynamic-badges")?.remove();
  qs("#modalRating").insertAdjacentHTML("afterend", produtoBadgesHtml(produtoAberto));
  atualizarGaleria();
  atualizarContadores();
  renderSecoesDinamicas();

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function fecharModalProduto() {
  if (!modal) return;
  fecharLightbox();
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  produtoAberto = null;
}

// GALERIA PRODUTO
function atualizarGaleria() {
  if (!produtoAberto) return;
  const imagem = qs("#galleryMainImage");
  const thumbs = qs("#galleryThumbs");
  const total = produtoAberto.galeria.length;

  aplicarFallbackImagem(imagem);
  imagem.classList.add("is-changing");
  imagem.src = produtoAberto.galeria[imagemAtual];
  imagem.alt = `${produtoAberto.nome} - imagem ${imagemAtual + 1}`;
  imagem.onload = () => imagem.classList.remove("is-changing");

  thumbs.innerHTML = produtoAberto.galeria
    .map(
      (src, index) => `
        <button class="thumb ${index === imagemAtual ? "is-active" : ""}" type="button" data-index="${index}" aria-label="Ver imagem ${index + 1} de ${produtoAberto.nome}">
          <img src="${src}" alt="" loading="lazy">
        </button>
      `
    )
    .join("");

  qs("#galleryCounter").textContent = `${imagemAtual + 1}/${total}`;
  qsa("img", thumbs).forEach(aplicarFallbackImagem);
  qsa(".thumb", thumbs).forEach((thumb) => {
    thumb.addEventListener("click", () => {
      imagemAtual = Number(thumb.dataset.index);
      atualizarGaleria();
    });
  });
}

function mudarImagemGaleria(direcao) {
  if (!produtoAberto) return;
  const total = produtoAberto.galeria.length;
  imagemAtual = (imagemAtual + direcao + total) % total;
  atualizarGaleria();
}

function iniciarModal() {
  if (!modal) return;
  criarLightbox();

  qsa("[data-close-modal]").forEach((botao) => {
    botao.addEventListener("click", fecharModalProduto);
  });

  qsa("[data-gallery-prev]").forEach((botao) => {
    botao.addEventListener("click", () => mudarImagemGaleria(-1));
  });

  qsa("[data-gallery-next]").forEach((botao) => {
    botao.addEventListener("click", () => mudarImagemGaleria(1));
  });

  const galleryStage = qs(".gallery-stage");
  if (galleryStage) {
    galleryStage.addEventListener("click", (event) => {
      if (event.target.matches("#galleryMainImage")) abrirLightbox();
    });

    galleryStage.addEventListener("touchstart", (event) => {
      touchStartX = event.changedTouches[0].screenX;
    });

    galleryStage.addEventListener("touchend", (event) => {
      const diff = event.changedTouches[0].screenX - touchStartX;
      if (Math.abs(diff) > 45) mudarImagemGaleria(diff > 0 ? -1 : 1);
    });
  }

  document.addEventListener("keydown", (event) => {
    if (!modal.classList.contains("is-open")) return;
    if (event.key === "Escape" && lightbox?.classList.contains("is-open")) {
      fecharLightbox();
      return;
    }
    if (event.key === "Escape") fecharModalProduto();
    if (event.key === "ArrowLeft") lightbox?.classList.contains("is-open") ? mudarImagemLightbox(-1) : mudarImagemGaleria(-1);
    if (event.key === "ArrowRight") lightbox?.classList.contains("is-open") ? mudarImagemLightbox(1) : mudarImagemGaleria(1);
  });
}

function criarLightbox() {
  if (qs("#imageLightbox")) {
    lightbox = qs("#imageLightbox");
    return;
  }

  document.body.insertAdjacentHTML(
    "beforeend",
    `<section class="image-lightbox" id="imageLightbox" aria-hidden="true">
      <button class="lightbox-close" type="button" data-lightbox-close aria-label="Fechar zoom">x</button>
      <button class="lightbox-nav prev" type="button" data-lightbox-prev aria-label="Imagem anterior">&lsaquo;</button>
      <div class="lightbox-canvas">
        <img id="lightboxImage" src="" alt="">
      </div>
      <button class="lightbox-nav next" type="button" data-lightbox-next aria-label="Proxima imagem">&rsaquo;</button>
      <div class="lightbox-tools">
        <button type="button" data-zoom-out aria-label="Diminuir zoom">-</button>
        <span id="lightboxZoom">100%</span>
        <button type="button" data-zoom-in aria-label="Aumentar zoom">+</button>
      </div>
    </section>`
  );

  lightbox = qs("#imageLightbox");
  qs("[data-lightbox-close]", lightbox).addEventListener("click", fecharLightbox);
  qs("[data-lightbox-prev]", lightbox).addEventListener("click", () => mudarImagemLightbox(-1));
  qs("[data-lightbox-next]", lightbox).addEventListener("click", () => mudarImagemLightbox(1));
  qs("[data-zoom-in]", lightbox).addEventListener("click", () => ajustarZoom(0.25));
  qs("[data-zoom-out]", lightbox).addEventListener("click", () => ajustarZoom(-0.25));
  qs(".lightbox-canvas", lightbox).addEventListener("click", (event) => {
    if (event.target === qs("#lightboxImage")) ajustarZoom(zoomAtual > 1 ? 1 - zoomAtual : 1);
  });
  lightbox.addEventListener("wheel", (event) => {
    event.preventDefault();
    ajustarZoom(event.deltaY < 0 ? 0.18 : -0.18);
  }, { passive: false });
}

function abrirLightbox() {
  if (!produtoAberto || !lightbox) return;
  zoomAtual = 1;
  atualizarLightbox();
  lightbox.classList.add("is-open");
  lightbox.setAttribute("aria-hidden", "false");
}

function fecharLightbox() {
  if (!lightbox) return;
  lightbox.classList.remove("is-open");
  lightbox.setAttribute("aria-hidden", "true");
}

function atualizarLightbox() {
  const imagem = qs("#lightboxImage");
  if (!imagem || !produtoAberto) return;
  imagem.src = produtoAberto.galeria[imagemAtual];
  imagem.alt = `${produtoAberto.nome} ampliado`;
  aplicarFallbackImagem(imagem);
  aplicarZoom();
}

function mudarImagemLightbox(direcao) {
  mudarImagemGaleria(direcao);
  zoomAtual = 1;
  atualizarLightbox();
}

function ajustarZoom(delta) {
  zoomAtual = Math.min(3, Math.max(1, zoomAtual + delta));
  aplicarZoom();
}

function aplicarZoom() {
  const imagem = qs("#lightboxImage");
  const indicador = qs("#lightboxZoom");
  if (!imagem || !indicador) return;
  imagem.style.transform = `scale(${zoomAtual})`;
  imagem.classList.toggle("is-zoomed", zoomAtual > 1);
  indicador.textContent = `${Math.round(zoomAtual * 100)}%`;
}

// PRODUTOS
function iniciarHome() {
  renderSkeletons("#featuredProducts", 6);
  criarSecoesHome();
  if (!produtosSincronizados) return;
  renderProdutos(produtos, "#featuredProducts", 6);
  renderSecoesDinamicas();
  renderCategorias("#homeCategories");
}

function criarSecoesHome() {
  const featured = qs("#featuredProducts");
  const section = featured?.closest(".section");
  if (!section || qs("#dailyOffers")) return;

  section.insertAdjacentHTML(
    "beforebegin",
    `<section class="section section-offers" id="dailyOffersSection" hidden>
      <div class="container">
        <div class="section-head compact-head">
          <div><h2>OFERTAS DO DIA</h2><p>Promocoes detectadas automaticamente pelo Mercado Livre.</p></div>
          <a class="btn btn-soft" href="categoria.html?ordem=desconto">Ver ofertas</a>
        </div>
        <div class="product-grid" id="dailyOffers"></div>
      </div>
    </section>`
  );

  section.insertAdjacentHTML(
    "afterend",
    `<section class="section" id="popularSection" hidden>
      <div class="container">
        <div class="section-head compact-head"><div><h2>MAIS POPULARES</h2><p>Baseado em favoritos, cliques e visualizacoes.</p></div></div>
        <div class="product-grid" id="popularProducts"></div>
      </div>
    </section>
    <section class="section section-soft" id="viewedSection" hidden>
      <div class="container">
        <div class="section-head compact-head"><div><h2>VOCE VISUALIZOU</h2><p>Continue olhando os ultimos produtos acessados.</p></div></div>
        <div class="product-grid" id="viewedProducts"></div>
      </div>
    </section>`
  );
}

function renderSecoesDinamicas() {
  if (!produtosSincronizados) return;
  const ofertas = buscarPromocoes(produtos, 6);
  const populares = buscarPopulares(produtos, 6);
  const vistos = buscarVisualizados(produtos, 6);

  const ofertasSection = qs("#dailyOffersSection");
  const popularSection = qs("#popularSection");
  const viewedSection = qs("#viewedSection");

  if (ofertasSection) {
    ofertasSection.hidden = !ofertas.length;
    if (ofertas.length) renderProdutos(ofertas, "#dailyOffers");
  }
  if (popularSection) {
    popularSection.hidden = !populares.length;
    if (populares.length) renderProdutos(populares, "#popularProducts");
  }
  if (viewedSection) {
    viewedSection.hidden = !vistos.length;
    if (vistos.length) renderProdutos(vistos, "#viewedProducts");
  }
}

function renderCategorias(containerSelector) {
  const container = qs(containerSelector);
  if (!container) return;

  const descricoes = {
    Tecnologia: "Gadgets, acessorios e itens inteligentes.",
    Casa: "Organizacao, conforto e rotina mais facil.",
    Cozinha: "Praticidade para preparar e servir melhor.",
    Beleza: "Cuidados pessoais com escolhas certeiras.",
    Fitness: "Itens para treino, mobilidade e bem-estar.",
    Automotivo: "Acessorios uteis para dirigir melhor.",
    Escritorio: "Mais foco, ergonomia e produtividade.",
    Utilidades: "Achados inteligentes para o dia a dia."
  };

  container.innerHTML = categorias
    .map(
      (categoria) => `
        <a class="category-card" href="categoria.html?cat=${encodeURIComponent(categoria)}">
          <span>${categoria.slice(0, 2)}</span>
          <h3>${categoria}</h3>
          <p>${descricoes[categoria]}</p>
        </a>
      `
    )
    .join("");
}

function revelarElementos(elementos) {
  if (!("IntersectionObserver" in window)) {
    elementos.forEach((elemento) => elemento.classList.add("is-visible"));
    return;
  }

  const observador = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12 });

  elementos.forEach((elemento, index) => {
    elemento.classList.add("reveal-item");
    elemento.style.transitionDelay = `${Math.min(index * 45, 360)}ms`;
    observador.observe(elemento);
  });
}

// FILTROS
function iniciarCategoria() {
  renderCategorias("#allCategories");
  const params = new URLSearchParams(window.location.search);
  const categoriaAtual = params.get("cat") || "";
  const buscaInicial = params.get("busca") || "";
  const searchInput = qs("#categorySearch");
  const sortSelect = qs("#sortProducts");
  const title = qs("#categoryTitle");
  const subtitle = qs("#categorySubtitle");

  if (searchInput) searchInput.value = buscaInicial;
  if (title) title.textContent = categoriaAtual ? categoriaAtual : "Todos os produtos";
  if (subtitle) {
    subtitle.textContent = categoriaAtual
      ? `Ofertas selecionadas em ${categoriaAtual}.`
      : "Explore todas as recomendacoes da SMshop.";
  }

  const ordemInicial = params.get("ordem");
  if (ordemInicial && sortSelect) sortSelect.value = ordemInicial;

  function aplicarFiltros() {
    if (!produtosSincronizados) {
      renderSkeletons("#categoryProducts", 9);
      atualizarContadorProdutos(produtos.length);
      return;
    }

    const termo = normalizar(searchInput?.value || "");
    const ordem = sortSelect?.value || "avaliados";
    let lista = [...produtos];

    if (categoriaAtual) {
      lista = lista.filter((produto) => normalizar(produto.categoria) === normalizar(categoriaAtual));
    }

    if (termo) {
      lista = lista.filter((produto) => {
        const alvo = `${produto.nome} ${produto.categoria} ${produto.descricaoCurta} ${produto.descricaoLonga}`;
        return normalizar(alvo).includes(termo);
      });
    }

    const ordenadores = {
      menor: (a, b) => (a.precoNumero || dinheiroParaNumero(a.preco)) - (b.precoNumero || dinheiroParaNumero(b.preco)),
      maior: (a, b) => (b.precoNumero || dinheiroParaNumero(b.preco)) - (a.precoNumero || dinheiroParaNumero(a.preco)),
      desconto: (a, b) => Number(b.desconto || 0) - Number(a.desconto || 0),
      populares: (a, b) => pontuarPopularidade(b) - pontuarPopularidade(a),
      lancamentos: (a, b) => b.id - a.id,
      alfabetica: (a, b) => a.nome.localeCompare(b.nome),
      avaliados: (a, b) => b.estrelas - a.estrelas
    };

    lista.sort(ordenadores[ordem] || ordenadores.avaliados);
    renderProdutos(lista, "#categoryProducts");
    atualizarContadorProdutos(lista.length);
  }

  ultimoRenderCategoria = aplicarFiltros;
  searchInput?.addEventListener("input", debounce(aplicarFiltros));
  sortSelect?.addEventListener("change", aplicarFiltros);
  aplicarFiltros();
}

function atualizarContadorProdutos(total) {
  const filterBar = qs(".filter-bar");
  if (!filterBar) return;

  let contador = qs("#productCount");
  if (!contador) {
    filterBar.insertAdjacentHTML("afterend", `<p class="product-count" id="productCount"></p>`);
    contador = qs("#productCount");
  }

  contador.textContent = total === 1 ? "1 produto encontrado" : `${total} produtos encontrados`;
}

// FORMULARIO WHATSAPP
function iniciarContato() {
  const form = qs("#contactForm");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const nome = qs("#name").value.trim();
    const whatsapp = qs("#whatsapp").value.trim();
    const assunto = qs("#subject").value.trim();
    const mensagem = qs("#message").value.trim();

    // TROCAR NUMERO AQUI
    // Use o formato internacional sem sinais. Exemplo: 5511999999999
    const numeroWhatsApp = "5511969940100";

    const texto = `Ola, meu nome e ${nome}.\nMeu WhatsApp: ${whatsapp}\nQuero falar sobre: ${assunto}\nMensagem: ${mensagem}`;
    window.open(`https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
  });
}

function iniciarGrupoVip() {
  qsa("[data-vip-link]").forEach((link) => {
    // TROCAR LINK GRUPO AQUI
    link.href = "https://chat.whatsapp.com/SEU-LINK-DO-GRUPO";
  });
}

function iniciarVoltarTopo() {
  document.body.insertAdjacentHTML(
    "beforeend",
    `<button class="back-to-top" type="button" aria-label="Voltar ao topo">↑</button>`
  );

  const botao = qs(".back-to-top");
  botao.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  window.addEventListener("scroll", () => {
    botao.classList.toggle("is-visible", window.scrollY > 520);
  }, { passive: true });
}

document.addEventListener("DOMContentLoaded", async () => {
  iniciarNavbar();
  iniciarModal();
  iniciarGrupoVip();
  iniciarVoltarTopo();

  if (page === "home") {
    criarSecoesHome();
    renderSkeletons("#featuredProducts", 6);
  }

  if (page === "categoria") {
    renderSkeletons("#categoryProducts", 9);
  }

  if (page === "contato") {
    iniciarContato();
  }

  try {
    await atualizarProdutosMercadoLivre(produtos);

    const sincronizados = await sincronizarProdutos(produtos);

    produtos = sincronizados;

    produtosSincronizados = true;

    console.debug("[SMshop][sync] sincronizacao concluida.", {
      total: produtos.length,
      sincronizados: produtos.filter((produto) => produto.apiStatus === "sincronizado").length,
      fallback: produtos.filter((produto) => produto.apiStatus !== "sincronizado").length
    });

    criarInterfaceFavoritos(produtos, abrirModalProduto);

    if (page === "home") {
      iniciarHome();
    }

    if (page === "categoria") {
      iniciarCategoria();
    }

    if (page === "categorias") {
      renderCategorias("#allCategories");
    }

  } catch (error) {

    console.warn("[SMshop][sync] Falha inesperada.", error);

    produtos = produtos.map((produto) => ({
      ...produto,
      apiStatus: "fallback",
      disponivel: true
    }));

    produtosSincronizados = true;

    criarInterfaceFavoritos(produtos, abrirModalProduto);

    if (page === "home") {
      iniciarHome();
    }

    if (page === "categoria") {
      iniciarCategoria();
    }

    if (page === "categorias") {
      renderCategorias("#allCategories");
    }
  }
});
