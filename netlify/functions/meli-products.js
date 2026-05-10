export async function handler(event) {
  try {
    const ids = event.queryStringParameters?.ids;

    if (!ids) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "IDs não enviados" })
      };
    }

    const token = process.env.MELI_ACCESS_TOKEN;

console.log("TOKEN:", token);

    if (!token) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "TOKEN NÃO ENCONTRADO"
        })
      };
    }

    const response = await fetch(
      `https://api.mercadolibre.com/items?ids=${ids}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    const data = await response.json();

    console.log("DATA:", JSON.stringify(data, null, 2));

    console.log("RESPOSTA ML:", data);

    if (!Array.isArray(data)) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Resposta inválida da API",
          details: data
        })
      };
    }

    const items = data.map((item) => {
      if (item.code !== 200 || !item.body) {
        return {
          id: item.id || "erro",
          status: "error",
          price: 0,
          original_price: 0,
          available_quantity: 0
        };
      }

      return {
        id: item.body.id,
        status: item.body.status,
        price: item.body.price,
        original_price: item.body.original_price || 0,
        available_quantity: item.body.available_quantity || 0,
        permalink: item.body.permalink,
        thumbnail: item.body.thumbnail,
        currency_id: item.body.currency_id,
        title: item.body.title
      };
    });

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