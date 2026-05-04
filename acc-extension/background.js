chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "sendToACC",
    title: "Send to ACC",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "autoMode",
    title: "Run Auto\u2011Mode",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "architect",
    title: "Send to Architect",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "writer",
    title: "Send to Writer",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "engineer",
    title: "Send to Engineer",
    contexts: ["selection"]
  });
});

async function sendToLocalACC(payload) {
  try {
    await fetch("http://localhost:3333/acc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.error("Local ACC not running:", err);
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const text = info.selectionText;

  if (!text) return;

  if (info.menuItemId === "sendToACC") {
    sendToLocalACC({ type: "generic", text });
  }

  if (info.menuItemId === "autoMode") {
    sendToLocalACC({ type: "auto", text });
  }

  if (info.menuItemId === "architect") {
    sendToLocalACC({ type: "role", role: "architect", text });
  }

  if (info.menuItemId === "writer") {
    sendToLocalACC({ type: "role", role: "writer", text });
  }

  if (info.menuItemId === "engineer") {
    sendToLocalACC({ type: "role", role: "engineer", text });
  }
});
