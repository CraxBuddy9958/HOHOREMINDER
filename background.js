// ============================================================
// Background Service Worker — Handles desktop notifications,
// clipboard copy via offscreen, storage + stats.
// Works even when tab is unfocused or Chrome is minimized.
// ============================================================

const DEFAULT_SETTINGS = {
  enabled: true,
  worldFilter: "Sea 3",
  copyMode: "pc",
  autoCopy: true,
  maxHistory: 50,
  soundEnabled: true,
  desktopNotif: true,
  alertDuration: 8000,
};

// Create offscreen document for clipboard operations
// (Service workers can't use clipboard API directly)
async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [chrome.runtime.getURL("offscreen.html")],
  });
  if (existingContexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["CLIPBOARD"],
    justification: "Copy Job ID to clipboard when tab is unfocused or Chrome is minimized",
  });
}

// Copy text to clipboard via offscreen document
async function copyToClipboard(text) {
  try {
    await ensureOffscreenDocument();
    await chrome.runtime.sendMessage({
      type: "OFFSCREEN_COPY",
      text: text,
    });
    console.log("Clipboard copy requested via offscreen");
    return true;
  } catch (e) {
    console.warn("Offscreen clipboard copy failed:", e);
    return false;
  }
}

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get("settings", (data) => {
    if (!data.settings) {
      chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
    }
  });
  chrome.storage.local.get("history", (data) => {
    if (!data.history) {
      chrome.storage.local.set({ history: [] });
    }
  });
  chrome.storage.local.set({
    stats: { totalCopied: 0, todayCopied: 0, lastDate: "" },
  });
  console.log("HohoHub Alert System installed");
});

// Handle messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "GET_SETTINGS":
      chrome.storage.local.get("settings", (data) => {
        sendResponse(data.settings || DEFAULT_SETTINGS);
      });
      return true;

    case "UPDATE_SETTINGS":
      chrome.storage.local.set({ settings: message.settings }, () => {
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach((tab) => {
            chrome.tabs
              .sendMessage(tab.id, {
                type: "SETTINGS_UPDATED",
                settings: message.settings,
              })
              .catch(() => {});
          });
        });
        sendResponse({ success: true });
      });
      return true;

    case "LOG_JOB":
      addHistoryEntry(message.data, sender);
      updateStats();

      // Flash badge on the extension icon
      if (sender.tab?.id) {
        chrome.action.setBadgeText({ text: "NEW", tabId: sender.tab.id });
        chrome.action.setBadgeBackgroundColor({
          color: "#57F287",
          tabId: sender.tab.id,
        });
        setTimeout(() => {
          chrome.action.setBadgeText({ text: "", tabId: sender.tab.id });
        }, 3000);
      }
      sendResponse({ success: true });
      break;

    case "GET_HISTORY":
      chrome.storage.local.get("history", (data) => {
        sendResponse(data.history || []);
      });
      return true;

    case "CLEAR_HISTORY":
      chrome.storage.local.set({ history: [] });
      chrome.storage.local.set({
        stats: { totalCopied: 0, todayCopied: 0, lastDate: "" },
      });
      sendResponse({ success: true });
      return true;

    case "SHOW_NOTIFICATION":
      // Desktop notification that works even when tab is unfocused / Chrome minimized
      showDesktopNotification(message.data);
      sendResponse({ success: true });
      break;

    case "COPY_FROM_BACKGROUND":
      // Copy from background (for when tab is unfocused)
      copyToClipboard(message.text).then((result) => {
        sendResponse({ success: result });
      });
      return true;

    case "COPY_FROM_POPUP":
      addHistoryEntry(
        { name: message.name, jobId: message.jobId, world: "", copied: true },
        sender
      );
      sendResponse({ success: true });
      break;

    case "UPDATE_FRUIT_LIST":
      // Broadcast fruit list update to all content scripts
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          chrome.tabs
            .sendMessage(tab.id, {
              type: "UPDATE_FRUIT_LIST",
              fruitList: message.fruitList,
            })
            .catch(() => {});
        });
      });
      sendResponse({ success: true });
      break;

    default:
      sendResponse({ error: "Unknown message type" });
  }
});

// ============================================================
// Desktop Notification — works when tab is unfocused / minimized
// ============================================================
function showDesktopNotification(data) {
  const { name, world, players, jobId, color } = data;

  const emoji = getFruitEmoji(name);
  const title = `${emoji} ${name} Detected!`;
  const body = `World: ${world} | Players: ${players || "?"}\nJob ID copied to clipboard!\nClick to view details`;

  chrome.notifications.create(`hohohub-${Date.now()}`, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: title,
    message: body,
    priority: 2,
    requireInteraction: true,
  });

  // Play sound if enabled
  chrome.storage.local.get("settings", (data2) => {
    const settings = data2.settings || DEFAULT_SETTINGS;
    if (settings.soundEnabled) {
      // Notify content script to play sound
      chrome.tabs.query({ url: ["https://discord.com/*", "https://ptb.discord.com/*", "https://canary.discord.com/*"] }, (tabs) => {
        tabs.forEach((tab) => {
          chrome.tabs.sendMessage(tab.id, { type: "PLAY_ALERT_SOUND" }).catch(() => {});
        });
      });
    }
  });

  // Auto-clear notification after alert duration
  chrome.storage.local.get("settings", (s) => {
    const duration = s.settings?.alertDuration || 8000;
    setTimeout(() => {
      chrome.notifications.getAll((notifs) => {
        for (const id in notifs) {
          if (id.startsWith("hohohub-")) {
            chrome.notifications.clear(id);
          }
        }
      });
    }, duration);
  });
}

// Handle notification click — focus the Discord tab
chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId.startsWith("hohohub-")) {
    chrome.tabs.query(
      { url: ["https://discord.com/*", "https://ptb.discord.com/*", "https://canary.discord.com/*"] },
      (tabs) => {
        if (tabs.length > 0) {
          chrome.tabs.update(tabs[0].id, { active: true });
          chrome.windows.update(tabs[0].windowId, { focused: true });
        }
      }
    );
    chrome.notifications.clear(notificationId);
  }
});

function getFruitEmoji(name) {
  const n = (name || "").toLowerCase();
  // Check dynamic fruit list from storage first (sync access not possible, use simple mapping)
  if (n.includes("buddha")) return "🙏";
  if (n.includes("tiger")) return "🐯";
  if (n.includes("portal")) return "🌀";
  if (n.includes("lightning")) return "⚡";
  if (n.includes("t-rex") || n.includes("trex")) return "🦖";
  if (n.includes("dragon")) return "🐉";
  if (n.includes("quake")) return "💥";
  if (n.includes("flame")) return "🔥";
  if (n.includes("ice")) return "❄️";
  if (n.includes("dark")) return "🌑";
  if (n.includes("sand")) return "🏜️";
  if (n.includes("magma")) return "🌋";
  if (n.includes("string")) return "🧵";
  if (n.includes("rubber")) return "🔵";
  if (n.includes("bomb")) return "💣";
  if (n.includes("smoke")) return "💨";
  if (n.includes("spike")) return "📌";
  return "🍎";
}

function addHistoryEntry(data, sender) {
  const record = {
    name: data.name,
    jobId: data.jobId,
    world: data.world || "",
    players: data.players || "",
    copied: data.copied !== false,
    id: Date.now(),
    timestamp: new Date().toISOString(),
  };

  chrome.storage.local.get(["history", "settings"], (storage) => {
    const history = storage.history || [];
    const maxHistory = storage.settings?.maxHistory || 50;
    history.unshift(record);
    if (history.length > maxHistory) history.length = maxHistory;
    chrome.storage.local.set({ history });
  });
}

function updateStats() {
  chrome.storage.local.get("stats", (data) => {
    const stats = data.stats || { totalCopied: 0, todayCopied: 0, lastDate: "" };
    const today = new Date().toDateString();
    stats.totalCopied++;
    stats.todayCopied = stats.lastDate === today ? stats.todayCopied + 1 : 1;
    stats.lastDate = today;
    chrome.storage.local.set({ stats });
  });
}
