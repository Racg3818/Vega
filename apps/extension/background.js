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

// (Opcional) Loga quando o service worker for reiniciado
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get("userToken", (result) => {
    console.log("🔁 Extensão reiniciada. Token atual no storage:", result.userToken);
  });
});
