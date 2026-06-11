const API_URL_FILTER = "https://devops.aliyun.com/projex/api/*";

function saveAuth(data) {
  try {
    chrome.storage.session.set(data).catch((e) => {
      console.warn("[seg] storage.session.set failed, fallback to local", e);
      chrome.storage.local.set(data);
    });
  } catch (e) {
    chrome.storage.local.set(data);
  }
}

try {
  chrome.webRequest.onSendHeaders.addListener(
    (details) => {
      if (!details.requestHeaders) return;
      const data = {};
      for (const h of details.requestHeaders) {
        const name = h.name.toLowerCase();
        if (name === "x-csrf-token") data.csrfToken = h.value;
        else if (name === "last-workspace") data.workspaceId = h.value;
      }
      if (data.csrfToken) {
        data.capturedAt = Date.now();
        saveAuth(data);
        console.log("[seg] csrf token captured", data.csrfToken.slice(0, 8) + "...");
      }
    },
    { urls: [API_URL_FILTER] },
    ["requestHeaders", "extraHeaders"]
  );
  console.log("[seg] webRequest listener registered");
} catch (e) {
  console.error("[seg] failed to register webRequest listener:", e);
}

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/index.html") });
});
