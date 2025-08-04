// 🔐 Versão final do background.js com persistência segura de token

// Recebe mensagens dos content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Quando o Vega envia token e user_id
  if (message.type === "SET_USER_TOKEN") {
    const userToken = {
      access_token: message.access_token,
      user_id: message.user_id,
    };

    chrome.storage.local.set({ userToken }, () => {
      console.log("✅ Token salvo com sucesso no chrome.storage.local:", userToken);
      sendResponse({ status: "ok" });
    });

    return true; // necessário para manter o sendResponse aberto
  }

  // Quando o content da XP solicita as credenciais
  if (message.type === "GET_USER_TOKEN") {
    chrome.storage.local.get("userToken", (result) => {
      const token = result.userToken || { access_token: null, user_id: null };
      console.log("📤 Token retornado ao content script:", token);
      sendResponse(token);
    });

    return true;
  }
});

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === "FECHAR_FATURA_VARIAVEL") {
    try {
      const response = await fetch("http://localhost:3000/api/fecharFaturaVariavel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: message.user_id }),
      });

      const data = await response.json();
      console.log("✅ Fatura criada:", data);
      sendResponse({ sucesso: true, data });
    } catch (erro) {
      console.error("❌ Erro ao criar fatura:", erro);
      sendResponse({ sucesso: false });
    }
    return true; // necessário para resposta assíncrona
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "BUSCAR_CDI") {
    fetch("http://localhost:3000/api/taxas")
      .then((res) => res.json())
      .then((data) => sendResponse({ cdi: data.cdi }))
      .catch(() => sendResponse({ cdi: 11 }));
    return true; // importante para manter o canal assíncrono aberto
  }
});



// (Opcional) Loga quando o service worker for reiniciado
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get("userToken", (result) => {
    console.log("🔁 Extensão reiniciada. Token atual no storage:", result.userToken);
  });
});
