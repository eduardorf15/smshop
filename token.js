const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

async function gerarToken() {

  const response = await fetch(
    "https://api.mercadolibre.com/oauth/token",
    {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: "1974556024860650",
        client_secret: "2ta3mdvldnMIuf8XTR7vMRHxge3DkqsQ",
        code: "TG-69fff9c4bb6d72000101f2ba-3102858439",
        redirect_uri: "https://smshopp.netlify.app"
      })
    }
  );

  const data = await response.json();

  console.log(data);
}

gerarToken();