// ============================================================
// Popup Script — control panel for HohoHub Alert System
// With Fruit Watch List management (add/remove/toggle)
// ============================================================

// Default fruit list — used on first install
const DEFAULT_FRUITS = [
  { key: "buddha",    label: "Buddha Fruit",    color: "#FFA500", emoji: "🙏", enabled: true },
  { key: "tiger",     label: "Tiger Fruit",     color: "#FFD700", emoji: "🐯", enabled: true },
  { key: "portal",    label: "Portal Fruit",    color: "#9B59B6", emoji: "🌀", enabled: true },
  { key: "lightning", label: "Lightning Fruit",  color: "#00BFFF", emoji: "⚡", enabled: true },
  { key: "t-rex",     label: "T-Rex Fruit",     color: "#E67E22", emoji: "🦖", enabled: true },
  { key: "dragon",    label: "Dragon Fruit",    color: "#E74C3C", emoji: "🐉", enabled: true },
];

document.addEventListener("DOMContentLoaded", () => {
  const enabledToggle = document.getElementById("enabledToggle");
  const toggleDesc = document.getElementById("toggleDesc");
  const statusDot = document.getElementById("statusDot");
  const desktopNotif = document.getElementById("desktopNotif");
  const soundEnabled = document.getElementById("soundEnabled");
  const alertDuration = document.getElementById("alertDuration");
  const worldFilter = document.getElementById("worldFilter");
  const copyModeRadios = document.querySelectorAll('input[name="copyMode"]');
  const maxHistoryInput = document.getElementById("maxHistory");
  const totalCopiedEl = document.getElementById("totalCopied");
  const todayCopiedEl = document.getElementById("todayCopied");
  const historyList = document.getElementById("historyList");
  const clearHistoryBtn = document.getElementById("clearHistory");

  // Fruit watch list elements
  const fruitListEl = document.getElementById("fruitList");
  const addFruitBtn = document.getElementById("addFruitBtn");
  const fruitAddForm = document.getElementById("fruitAddForm");
  const newFruitName = document.getElementById("newFruitName");
  const newFruitColor = document.getElementById("newFruitColor");
  const confirmAddFruit = document.getElementById("confirmAddFruit");
  const cancelAddFruit = document.getElementById("cancelAddFruit");

  // Current fruit list (loaded from storage)
  let currentFruits = [];

  function getEmojiForFruit(name) {
    const n = (name || "").toLowerCase();
    const emojiMap = {
      "buddha": "🙏", "tiger": "🐯", "portal": "🌀", "lightning": "⚡",
      "t-rex": "🦖", "trex": "🦖", "dragon": "🐉", "quake": "💥",
      "flame": "🔥", "ice": "❄️", "dark": "🌑", "light": "✨",
      "sand": "🏜️", "magma": "🌋", "string": "🧵", "rubber": "🔵",
      "bomb": "💣", "smoke": "💨", "spike": "📌", "chop": "🪓",
      "spring": "🌀", "kilo": "⚖️", "spin": "🌀", "barrier": "🛡️",
    };
    for (const [key, emoji] of Object.entries(emojiMap)) {
      if (n.includes(key)) return emoji;
    }
    return "🍎";
  }

  // ============================================================
  // FRUIT WATCH LIST UI
  // ============================================================
  function renderFruitList() {
    fruitListEl.innerHTML = currentFruits.map((fruit, index) => `
      <div class="fruit-item ${fruit.enabled ? '' : 'fruit-disabled'}" data-index="${index}">
        <div class="fruit-item-left">
          <span class="fruit-item-emoji">${fruit.emoji}</span>
          <span class="fruit-item-label" style="color: ${fruit.enabled ? fruit.color : '#555'}">${escapeHTML(fruit.label)}</span>
        </div>
        <div class="fruit-item-right">
          <button class="fruit-toggle-btn ${fruit.enabled ? 'active' : ''}" data-index="${index}" title="${fruit.enabled ? 'Disable' : 'Enable'}">
            ${fruit.enabled ? 'ON' : 'OFF'}
          </button>
          <button class="fruit-delete-btn" data-index="${index}" title="Remove">✕</button>
        </div>
      </div>
    `).join("");

    // Toggle fruit on/off
    fruitListEl.querySelectorAll(".fruit-toggle-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index);
        currentFruits[idx].enabled = !currentFruits[idx].enabled;
        saveFruits();
        renderFruitList();
      });
    });

    // Delete fruit
    fruitListEl.querySelectorAll(".fruit-delete-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index);
        currentFruits.splice(idx, 1);
        saveFruits();
        renderFruitList();
      });
    });
  }

  // Load fruit list from storage
  function loadFruits() {
    chrome.storage.local.get("fruitList", (data) => {
      if (data.fruitList && data.fruitList.length > 0) {
        currentFruits = data.fruitList;
      } else {
        currentFruits = JSON.parse(JSON.stringify(DEFAULT_FRUITS));
        chrome.storage.local.set({ fruitList: currentFruits });
      }
      renderFruitList();
    });
  }
  loadFruits();

  // Save fruit list to storage & notify content script
  function saveFruits() {
    chrome.storage.local.set({ fruitList: currentFruits }, () => {
      // Notify all tabs about the fruit list update
      chrome.runtime.sendMessage({
        type: "UPDATE_FRUIT_LIST",
        fruitList: currentFruits,
      }).catch(() => {});
    });
  }

  // Add fruit form
  addFruitBtn.addEventListener("click", () => {
    fruitAddForm.style.display = "flex";
    newFruitName.focus();
  });

  cancelAddFruit.addEventListener("click", () => {
    fruitAddForm.style.display = "none";
    newFruitName.value = "";
  });

  confirmAddFruit.addEventListener("click", () => {
    const name = newFruitName.value.trim();
    if (!name) return;

    const key = name.toLowerCase();
    const color = newFruitColor.value;
    const emoji = getEmojiForFruit(name);

    // Check if already exists
    if (currentFruits.some(f => f.key === key || f.label.toLowerCase() === name.toLowerCase())) {
      newFruitName.style.borderColor = "#f04747";
      setTimeout(() => { newFruitName.style.borderColor = ""; }, 1500);
      return;
    }

    currentFruits.push({
      key: key,
      label: name.includes(" ") ? name : name + " Fruit",
      color: color,
      emoji: emoji,
      enabled: true,
    });

    saveFruits();
    renderFruitList();
    newFruitName.value = "";
    fruitAddForm.style.display = "none";
  });

  // Enter key to add
  newFruitName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") confirmAddFruit.click();
    if (e.key === "Escape") cancelAddFruit.click();
  });

  // ============================================================
  // SETTINGS
  // ============================================================
  // Load settings
  chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (settings) => {
    if (!settings) return;
    enabledToggle.checked = settings.enabled;
    updateToggleUI(settings.enabled);
    desktopNotif.checked = settings.desktopNotif !== false;
    soundEnabled.checked = settings.soundEnabled !== false;
    alertDuration.value = settings.alertDuration || "8000";
    worldFilter.value = settings.worldFilter || "Sea 3";
    copyModeRadios.forEach((r) => r.checked = r.value === settings.copyMode);
    maxHistoryInput.value = settings.maxHistory || 50;
  });

  // Load stats
  chrome.storage.local.get("stats", (data) => {
    const s = data.stats || {};
    totalCopiedEl.textContent = s.totalCopied || 0;
    todayCopiedEl.textContent = s.todayCopied || 0;
  });

  // Load history
  function loadHistory() {
    chrome.runtime.sendMessage({ type: "GET_HISTORY" }, (history) => {
      if (!history || history.length === 0) {
        historyList.innerHTML = '<div class="history-empty">No alerts yet</div>';
        return;
      }
      historyList.innerHTML = history.map((item) => {
        const emoji = getEmojiForFruit(item.name || "");
        const time = item.timestamp ? formatTime(item.timestamp) : "";
        const shortId = (item.jobId || "").substring(0, 35) + "...";
        const world = item.world || "";
        const players = item.players || "";
        return `
          <div class="history-item" data-job-id="${escapeAttr(item.jobId)}" data-name="${escapeAttr(item.name)}">
            <div class="history-item-icon">${emoji}</div>
            <div class="history-item-body">
              <div class="history-item-name">${escapeHTML(item.name || "Unknown")}</div>
              <div class="history-item-meta">
                <span class="history-item-world">${escapeHTML(world)}</span>
                ${players ? `<span class="history-item-players">${escapeHTML(players)}</span>` : ""}
              </div>
              <div class="history-item-id">${escapeHTML(shortId)}</div>
            </div>
            <div class="history-item-time">${time}</div>
            <div class="history-item-copy">📋 copy</div>
          </div>`;
      }).join("");

      historyList.querySelectorAll(".history-item").forEach((el) => {
        el.addEventListener("click", () => {
          const jobId = el.dataset.jobId;
          navigator.clipboard.writeText(jobId).then(() => {
            el.style.borderColor = "#57F287";
            const cl = el.querySelector(".history-item-copy");
            cl.textContent = "✔ copied";
            cl.style.color = "#57F287";
            cl.style.opacity = "1";
            setTimeout(() => {
              el.style.borderColor = "transparent";
              cl.textContent = "📋 copy";
              cl.style.color = "#5865F2";
              cl.style.opacity = "0";
            }, 1500);
          });
        });
      });
    });
  }
  loadHistory();

  // Toggle
  enabledToggle.addEventListener("change", () => {
    updateToggleUI(enabledToggle.checked);
    saveSettings();
  });

  function updateToggleUI(enabled) {
    statusDot.classList.toggle("active", enabled);
    toggleDesc.textContent = enabled ? "Watching for fruits..." : "Alert system disabled";
    toggleDesc.style.color = enabled ? "#72767d" : "#f04747";
  }

  desktopNotif.addEventListener("change", saveSettings);
  soundEnabled.addEventListener("change", saveSettings);
  alertDuration.addEventListener("change", saveSettings);
  worldFilter.addEventListener("change", saveSettings);
  copyModeRadios.forEach((r) => r.addEventListener("change", saveSettings));
  maxHistoryInput.addEventListener("change", () => {
    let v = parseInt(maxHistoryInput.value);
    if (isNaN(v) || v < 10) v = 10;
    if (v > 200) v = 200;
    maxHistoryInput.value = v;
    saveSettings();
  });

  clearHistoryBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "CLEAR_HISTORY" }, () => {
      loadHistory();
      totalCopiedEl.textContent = "0";
      todayCopiedEl.textContent = "0";
    });
  });

  function saveSettings() {
    const copyMode = document.querySelector('input[name="copyMode"]:checked')?.value || "pc";
    chrome.runtime.sendMessage({
      type: "UPDATE_SETTINGS",
      settings: {
        enabled: enabledToggle.checked,
        worldFilter: worldFilter.value,
        copyMode,
        autoCopy: true,
        maxHistory: parseInt(maxHistoryInput.value) || 50,
        soundEnabled: soundEnabled.checked,
        desktopNotif: desktopNotif.checked,
        alertDuration: parseInt(alertDuration.value) || 8000,
      }
    });
  }

  function formatTime(iso) {
    try {
      const d = new Date(iso);
      const now = new Date();
      if (d.toDateString() === now.toDateString())
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return d.toLocaleDateString([], { month: "short", day: "numeric" });
    } catch { return ""; }
  }

  function escapeHTML(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
  function escapeAttr(s) { return (s||"").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/'/g,"&#39;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
});
