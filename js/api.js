const CACHE_KEY = "smshop:meli:produtos:public-v1";
const CACHE_TTL = 15 * 60 * 1000;
const DEBUG_PRECOS = true;

export function formatarPreco(valor, moeda = "BRL") {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return "";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: moeda || "BRL"
  }).format(numero);
}

function assinaturaProdutos(produtos = []) {
  return produtos
    .map((produto) => `${produto.id}:${produto.meliId || "sem-meli"}:${produto.precoNumero || 0}`)
    .sort()
    .join("|");
}

export function limparCacheProdutos() {
  if (typeof localStorage === "undefined") return;
  Object.keys(localStorage)
    .filter((key) => key.startsWith("smshop:meli:produtos:"))
    .forEach((key) => localStorage.removeItem(key));
}

function limparCachesAntigos() {
  if (typeof localStorage === "undefined") return;
  Object.keys(localStorage)
    .filter((key) => key.startsWith("smshop:meli:produtos:") && key !== CACHE_KEY)
    .forEach((key) => {
      localStorage.removeItem(key);
      console.debug("[SMshop][cache] Cache antigo removido.", { key });
    });
}

export function cacheProdutos(valor, produtos = []) {
  if (typeof localStorage === "undefined") return null;
  limparCachesAntigos();
  const assinatura = assinaturaProdutos(produtos);

  if (valor) {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ criadoEm: Date.now(), assinatura, produtos: valor }));
    return valor;
  }

  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (!cache?.produtos) return null;
    if (cache.assinatura !== assinatura) {
      limparCacheProdutos();
      console.debug("[SMshop][cache] Cache limpo: produtos.js foi atualizado ou meliIds/precos base mudaram.");
      return null;
    }
    if (Date.now() - cache.criadoEm > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY);
      console.debug("[SMshop][cache] Cache expirado removido.");
      return null;
    }
    console.debug("[SMshop][cache] Usando cache valido da API Mercado Livre.", {
      total: cache.produtos.length,
      criadoEm: new Date(cache.criadoEm).toISOString()
    });
    return cache.produtos;
  } catch {
    limparCacheProdutos();
    return null;
  }
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function mapearPorId(items) {
  return items.reduce((mapa, item) => {
    if (item?.id) mapa.set(item.id.toUpperCase(), item);
    return mapa;
  }, new Map());
}

export async function buscarProdutosML(produtos) {
  const ids = [...new Set(produtos.map((produto) => produto.meliId).filter(Boolean))];
  if (!ids.length) return [];

  const cache = cacheProdutos(null, produtos);
  if (cache) return cache;

  console.debug("[SMshop][api] Buscando produtos publicos via Netlify Function.", {
    totalIds: ids.length,
    endpoint: "/.netlify/functions/meli-products"
  });

  const respostas = await Promise.all(
    chunk(ids, 40).map(async (grupo) => {
      const resposta = await fetch(`/.netlify/functions/meli-products?ids=${encodeURIComponent(grupo.join(","))}`);
      if (!resposta.ok) throw new Error("Falha ao buscar produtos no Mercado Livre");
      const dados = await resposta.json();
      console.debug("[SMshop][api] Resposta publica recebida.", {
        source: dados.source,
        totalItems: dados.items?.length || 0,
        ids: grupo
      });
      return dados.items || [];
    })
  );

  const produtosML = respostas.flat();
  console.debug("[SMshop][api] Produtos publicos recebidos para sincronizacao.", {
    total: produtosML.length,
    precos: produtosML.map((produto) => ({
      id: produto.id,
      price: produto.price,
      original_price: produto.original_price,
      status: produto.status
    }))
  });
  cacheProdutos(produtosML, produtos);
  return produtosML;
}

export async function sincronizarProdutos(produtos) {
  try {
    const produtosML = await buscarProdutosML(produtos);
    const porMeliId = mapearPorId(produtosML);

    return produtos.map((produto) => {
      const meli = porMeliId.get(String(produto.meliId || "").toUpperCase());
      if (!meli) {
        if (DEBUG_PRECOS) {
          console.debug("[SMshop][preco]", {
            id: produto.id,
            nome: produto.nome,
            meliId: produto.meliId,
            precoProdutosJs: produto.precoNumero,
            precoApi: null,
            precoFinal: produto.precoNumero,
            origem: "fallback-sem-api"
          });
        }
        return { ...produto, apiStatus: "fallback", disponivel: true };
      }

      const precoAtual = Number(meli.price || 0);
      const precoAntigo = Number(meli.original_price || 0);
      const desconto = Number(meli.discount || 0);
      const disponivel =
        Number(meli.available_quantity || 0) > 0;
      const ultimasUnidades = disponivel && Number(meli.available_quantity || 0) > 0 && Number(meli.available_quantity || 0) <= 5;
      const precoFinalNumero = Number.isFinite(precoAtual) && precoAtual > 0 ? precoAtual : produto.precoNumero;
      const precoFinalTexto = precoFinalNumero ? formatarPreco(precoFinalNumero, meli.currency_id) : produto.preco;
      const produtoSincronizado = {
        ...produto,
        preco: precoFinalTexto,
        precoNumero: precoFinalNumero,
        precoAntigo: precoAntigo > precoFinalNumero ? formatarPreco(precoAntigo, meli.currency_id) : "",
        precoAntigoNumero: precoAntigo > precoFinalNumero ? precoAntigo : 0,
        desconto,
        parcelamento: meli.installments?.quantity && meli.installments?.amount
          ? `${meli.installments.quantity}x de ${formatarPreco(meli.installments.amount, meli.installments.currency_id)}`
          : "",
        freteGratis: Boolean(meli.shipping?.free_shipping),
        disponivel,
        statusMeli: meli.status,
        estoqueMeli: Number(meli.available_quantity || 0),
        ultimasUnidades,
        meliThumbnail: meli.thumbnail,
        meliPermalink: meli.permalink,
        apiStatus: "sincronizado",
        atualizadoEm: meli.updated_at
      };

      if (DEBUG_PRECOS) {
        console.debug("[SMshop][preco]", {
          id: produto.id,
          nome: produto.nome,
          meliId: produto.meliId,
          precoProdutosJs: produto.precoNumero,
          precoApi: meli.price,
          precoFinal: produtoSincronizado.precoNumero,
          precoFinalFormatado: produtoSincronizado.preco,
          status: meli.status,
          origem: "api-mercado-livre"
        });
      }

      return produtoSincronizado;
    });
  } catch (error) {
    console.warn("[SMshop] API Mercado Livre indisponivel. Usando fallback local.", error);
    return produtos.map((produto) => ({ ...produto, apiStatus: "fallback", disponivel: true }));
  }
}

export function atualizarCards(callback) {
  if (typeof callback === "function") callback();
}
