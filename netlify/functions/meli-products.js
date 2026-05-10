export async function handler(event) {
  try {
    const ids = event.queryStringParameters?.ids;

    if (!ids) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "IDs não enviados"
        })
      };
    }

    const listaIds = ids.split(",");

    const items = await Promise.all(
      listaIds.map(async (id) => {

        const response = await fetch(
          `https://api.mercadolibre.com/sites/MLB/search?q=${id}`
        );

        const data = await response.json();

        const item =
          data.results?.find((p) => p.id === id) ||
          data.results?.[0];

        if (!item) {
          return {
            id,
            status: "error",
            price: 0
          };
        }

        return {
          id: item.id,
          status: "active",
          title: item.title,
          price: item.price || 0,
          original_price: item.original_price || 0,
          available_quantity: item.available_quantity || 0,
          permalink: item.permalink || "",
          thumbnail: item.thumbnail || ""
        };
      })
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        source: "mercadolivre",
        items
      })
    };

  } catch (error) {

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message
      })
    };

  }
}