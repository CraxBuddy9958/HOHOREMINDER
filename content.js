// ============================================================
// Content Script — watches Discord, extracts fruit/job data
// from the NEW message format, shows alert overlay + copies ID.
// Works even when tab is UNFOCUSED or Chrome is MINIMIZED.
// ============================================================

let settings = null;
let fruitList = null;
const seen = new Set();

// Default fruit list (overridden by storage)
const DEFAULT_FRUITS = [
  { key: "buddha",    label: "Buddha Fruit",    color: "#FFA500", emoji: "🙏", enabled: true },
  { key: "tiger",     label: "Tiger Fruit",     color: "#FFD700", emoji: "🐯", enabled: true },
  { key: "portal",    label: "Portal Fruit",    color: "#9B59B6", emoji: "🌀", enabled: true },
  { key: "lightning", label: "Lightning Fruit",  color: "#00BFFF", emoji: "⚡", enabled: true },
  { key: "t-rex",     label: "T-Rex Fruit",     color: "#E67E22", emoji: "🦖", enabled: true },
  { key: "dragon",    label: "Dragon Fruit",    color: "#E74C3C", emoji: "🐉", enabled: true },
];

// Load settings + fruit list on start
chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (response) => {
  if (response) {
    settings = response;
    console.log("HohoHub Alert System loaded with settings:", settings);
  }
});

// Load fruit list from storage
chrome.storage.local.get("fruitList", (data) => {
  if (data.fruitList && data.fruitList.length > 0) {
    fruitList = data.fruitList;
  } else {
    fruitList = JSON.parse(JSON.stringify(DEFAULT_FRUITS));
  }
  console.log("Fruit watch list:", fruitList.map(f => f.enabled ? `✅ ${f.label}` : `❌ ${f.label}`).join(", "));
  startObserver();
});

// Listen for updates from popup
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "SETTINGS_UPDATED") {
    settings = message.settings;
    console.log("Settings updated:", settings);
  }
  if (message.type === "UPDATE_FRUIT_LIST") {
    fruitList = message.fruitList;
    console.log("Fruit list updated:", fruitList.map(f => f.enabled ? `✅ ${f.label}` : `❌ ${f.label}`).join(", "));
  }
  if (message.type === "PLAY_ALERT_SOUND") {
    playAlertSound();
  }
});

// ============================================================
// Sound — plays an alert chime even when tab is unfocused
// ============================================================
function playAlertSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // First beep
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.frequency.value = 880;
    osc1.type = "sine";
    gain1.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    osc1.start(audioCtx.currentTime);
    osc1.stop(audioCtx.currentTime + 0.3);

    // Second beep (higher pitch)
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.frequency.value = 1174;
    osc2.type = "sine";
    gain2.gain.setValueAtTime(0.3, audioCtx.currentTime + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
    osc2.start(audioCtx.currentTime + 0.15);
    osc2.stop(audioCtx.currentTime + 0.5);
  } catch (e) {
    console.warn("Sound playback failed:", e);
  }
}

// ============================================================
// Clipboard — copies using execCommand (clipboardWrite permission
// makes this work even when tab is UNFOCUSED / minimized)
// ============================================================
function forceCopyToClipboard(text) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "-9999px";
    ta.style.width = "1px";
    ta.style.height = "1px";
    ta.style.opacity = "0";
    ta.setAttribute("readonly", "");
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    if (ok) {
      console.log("Copied via execCommand (clipboardWrite permission)");
      return true;
    }
  } catch (e) {
    console.warn("execCommand failed:", e);
  }

  // Also try background copy via offscreen
  chrome.runtime.sendMessage({ type: "COPY_FROM_BACKGROUND", text: text });

  // Fallback: clipboard API (works when focused)
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      console.log("Copied via clipboard API fallback");
    }).catch((e) => {
      console.warn("Clipboard API also failed:", e);
    });
  }

  return true;
}

// ============================================================
// NEW MESSAGE FORMAT EXTRACTION
// Parses the updated format with Fruit Finder / Reminder /
// Players / World sections as shown in the screenshots
// ============================================================
function extract(text) {
  if (!settings?.enabled) return null;

  // World filter check — supports both "Sea 3" and "World 3" formats
  const worldFilter = settings?.worldFilter || "Sea 3";
  if (worldFilter && !text.toLowerCase().includes(worldFilter.toLowerCase())) return null;

  // ---- Extract Fruit Name ----
  // New format: "Unknown Fruit (Spawned)" or "Spawner Fruit" or "Fruit Name: ..."
  let name = null;

  // Pattern 1: "Unknown Fruit (Spawned)" / "Some Fruit (Spawned)"
  const fruitSpawnedMatch = text.match(/([\w\s]+Fruit)\s*\(Spawned\)/i);
  if (fruitSpawnedMatch) {
    name = fruitSpawnedMatch[1].trim();
  }

  // Pattern 2: "Spawner Fruit" or "Reminder (Spawner Fruit)"
  if (!name) {
    const reminderMatch = text.match(/Reminder\s*\(([^)]+)\)/i);
    if (reminderMatch) {
      name = reminderMatch[1].trim();
    }
  }

  // Pattern 3: "Fruit Finder" section value
  if (!name) {
    const fruitFinderMatch = text.match(/Fruit\s*Finder\s*\n?\s*([^\n]+)/i);
    if (fruitFinderMatch) {
      name = fruitFinderMatch[1].trim();
    }
  }

  // Pattern 4: "Name" field (original format fallback)
  if (!name) {
    const nameMatch = text.match(/Name\s*([^\n]+)/i);
    if (nameMatch) {
      name = nameMatch[1].trim();
    }
  }

  if (!name) return null;

  // ---- Filter: Only alert for supported fruits ----
  if (!isSupportedFruit(name)) return null;

  // ---- Extract Players ----
  let players = null;
  const playersMatch = text.match(/Players\s*(\d+\/\d+)/i);
  if (playersMatch) {
    players = playersMatch[1];
  }

  // ---- Extract World / Sea ----
  let world = null;
  const seaMatch = text.match(/Sea\s*(\d+)\s*([A-Za-z]*)/i);
  const worldMatch = text.match(/World\s*(\d+)/i);
  if (seaMatch) {
    world = `Sea ${seaMatch[1]}${seaMatch[2] ? " " + seaMatch[2] : ""}`;
  } else if (worldMatch) {
    world = `World ${worldMatch[1]}`;
  }
  if (!world) world = worldFilter;

  // ---- Extract Job ID / Teleport Code ----
  let jobId = null;
  const copyMode = settings?.copyMode || "pc";

  if (copyMode === "pc") {
    // PC code: "Job Id PC Copy" or "Put this code" section
    const jobMatch = text.match(/Job\s*Id\s*PC\s*Copy\s*([\s\S]*?)(?:Job\s*Id\s*Mobile\s*Copy|Code\s*for\s*mobile|$)/i);
    if (jobMatch) {
      jobId = jobMatch[1].replace(/[^A-Za-z0-9|_]/g, "").trim();
    }

    // Alternative: extract the H2O2SERVER code line
    if (!jobId || jobId.length < 20) {
      const serverCodeMatch = text.match(/(H2O2SERVER\|[A-Za-z0-9]+)/i);
      if (serverCodeMatch) {
        jobId = serverCodeMatch[1].trim();
      }
    }

    // Alternative: extract the code after "Put this code"
    if (!jobId || jobId.length < 20) {
      const putCodeMatch = text.match(/Put\s*this\s*code[^:]*:\s*([\s\S]*?)(?:Code\s*for\s*mobile|Or\s*run|$)/i);
      if (putCodeMatch) {
        jobId = putCodeMatch[1].replace(/[^A-Za-z0-9|_]/g, "").trim();
      }
    }
  } else {
    // Mobile code
    const jobMatch = text.match(/Job\s*Id\s*Mobile\s*Copy\s*([\s\S]*?)(?:Time|Or\s*run|$)/i);
    if (jobMatch) {
      jobId = jobMatch[1].replace(/[^A-Za-z0-9|_]/g, "").trim();
    }

    // Alternative: "Code for mobile" section
    if (!jobId || jobId.length < 20) {
      const mobileCodeMatch = text.match(/Code\s*for\s*mobile\s*([\s\S]*?)(?:Or\s*run|Script|$)/i);
      if (mobileCodeMatch) {
        jobId = mobileCodeMatch[1].replace(/[^A-Za-z0-9|_]/g, "").trim();
      }
    }
  }

  // Also try to extract the _G.HOHO_SERVER_ID value
  let serverId = null;
  const serverIdMatch = text.match(/_G\.HOHO_SERVER_ID\s*=\s*\{(\d+)/);
  if (serverIdMatch) {
    serverId = serverIdMatch[1];
  }

  // If we have a server ID but no job ID, use server ID
  if ((!jobId || jobId.length < 10) && serverId) {
    jobId = serverId;
  }

  if (!jobId || jobId.length < 5) return null;

  // ---- Extract script line ----
  let script = null;
  const scriptMatch = text.match(/(loadstring\([^)]+\)\([^)]*\))/i);
  if (scriptMatch) {
    script = scriptMatch[1];
  }

  return { name, jobId, world, players, script };
}

// ============================================================
// Fruit type lookup — uses the dynamic fruit list from storage
// Only ENABLED fruits in the watch list trigger alerts
// ============================================================
function getType(name) {
  const n = name.toLowerCase();
  const fruits = fruitList || DEFAULT_FRUITS;
  for (const fruit of fruits) {
    if (fruit.enabled && n.includes(fruit.key)) {
      return { color: fruit.color, emoji: fruit.emoji, label: fruit.label };
    }
  }
  // Not in watch list or disabled — return null to skip
  return null;
}

function isSupportedFruit(name) {
  const n = name.toLowerCase();
  const fruits = fruitList || DEFAULT_FRUITS;
  return fruits.some(f => f.enabled && n.includes(f.key));
}

// ============================================================
// ALERT OVERLAY — matches the screenshot design
// Shows Fruit Finder / Players / World sections
// ============================================================
function showAlert(data) {
  const { name, jobId, world, players, script } = data;
  const type = getType(name);

  // Remove existing alert
  const existing = document.getElementById("hohohub-alert");
  if (existing) existing.remove();

  // Short ID for display
  const shortJobId = jobId.length > 50 ? jobId.substring(0, 50) + "..." : jobId;
  const mobileJobId = jobId; // For mobile display

  const alertDiv = document.createElement("div");
  alertDiv.id = "hohohub-alert";
  alertDiv.innerHTML = `
    <div class="hoho-overlay">
      <div class="hoho-card">
        <!-- Close Button -->
        <button class="hoho-close" id="hohoClose">&times;</button>

        <!-- Header -->
        <div class="hoho-header">
          <div class="hoho-header-icon">${type.emoji}</div>
          <div class="hoho-header-title">HohoHub</div>
        </div>

        <!-- Three Column Info -->
        <div class="hoho-info-row">
          <div class="hoho-info-col">
            <div class="hoho-info-label">Fruit Finder</div>
            <div class="hoho-info-value" style="color: ${type.color}">${escapeHTML(name)}</div>
          </div>
          <div class="hoho-info-col">
            <div class="hoho-info-label">Players</div>
            <div class="hoho-info-value">${escapeHTML(players || "?/?")}</div>
          </div>
          <div class="hoho-info-col">
            <div class="hoho-info-label">World</div>
            <div class="hoho-info-value">${escapeHTML(world)}</div>
          </div>
        </div>

        <!-- Teleport Code -->
        <div class="hoho-section">
          <div class="hoho-section-title">Put this code in Hoho UI to teleport to place:</div>
          <div class="hoho-code-block">
            <code id="hohoPcCode">${escapeHTML(shortJobId)}</code>
            <button class="hoho-copy-btn" data-copy="pc" title="Copy PC Code">📋</button>
          </div>
        </div>

        <!-- Mobile Code -->
        <div class="hoho-section">
          <div class="hoho-section-title">Code for mobile:</div>
          <div class="hoho-code-block">
            <code id="hohoMobileCode">${escapeHTML(mobileJobId)}</code>
            <button class="hoho-copy-btn" data-copy="mobile" title="Copy Mobile Code">📋</button>
          </div>
        </div>

        <!-- Script -->
        ${script ? `
        <div class="hoho-section">
          <div class="hoho-section-title">Or run this script!</div>
          <div class="hoho-code-block hoho-script">
            <code>${escapeHTML(script)}</code>
            <button class="hoho-copy-btn" data-copy="script" title="Copy Script">📋</button>
          </div>
        </div>
        ` : ""}

        <!-- Status Bar -->
        <div class="hoho-status">
          <span class="hoho-status-dot"></span>
          <span class="hoho-status-text">Job ID auto-copied to clipboard!</span>
          <button class="hoho-recopy-btn" id="hohoRecopy">Copy ID Again</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(alertDiv);
  requestAnimationFrame(() => {
    alertDiv.classList.add("hoho-visible");
  });

  // Close button
  document.getElementById("hohoClose").addEventListener("click", () => {
    dismissAlert(alertDiv);
  });

  // Re-copy button
  document.getElementById("hohoRecopy").addEventListener("click", () => {
    forceCopyToClipboard(jobId);
    const btn = document.getElementById("hohoRecopy");
    btn.textContent = "Copied!";
    btn.style.color = "#57F287";
    setTimeout(() => {
      btn.textContent = "Copy ID Again";
      btn.style.color = "";
    }, 1500);
  });

  // Copy buttons on code blocks
  alertDiv.querySelectorAll(".hoho-copy-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const copyType = btn.dataset.copy;
      let textToCopy = jobId;
      if (copyType === "script" && script) {
        textToCopy = script;
      }
      forceCopyToClipboard(textToCopy);
      btn.textContent = "✅";
      setTimeout(() => { btn.textContent = "📋"; }, 1500);
    });
  });

  // Auto-dismiss
  const duration = settings?.alertDuration || 8000;
  setTimeout(() => {
    dismissAlert(alertDiv);
  }, duration);

  // Play sound
  if (settings?.soundEnabled) {
    playAlertSound();
  }
}

function dismissAlert(alertDiv) {
  if (!alertDiv || !alertDiv.parentNode) return;
  alertDiv.classList.remove("hoho-visible");
  setTimeout(() => {
    if (alertDiv.parentNode) alertDiv.remove();
  }, 400);
}

// ============================================================
// Toast notification — small notification for quick feedback
// ============================================================
function showToast(name, world, color, emoji) {
  const existing = document.getElementById("hohohub-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "hohohub-toast";
  toast.innerHTML = `
    <div class="hoho-toast-icon">${emoji}</div>
    <div class="hoho-toast-body">
      <div class="hoho-toast-title">ID Copied to Clipboard</div>
      <div class="hoho-toast-info">${world} | ${name}</div>
    </div>
    <div class="hoho-toast-check">✔</div>
  `;

  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("hoho-toast-show"));

  setTimeout(() => {
    toast.classList.remove("hoho-toast-show");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============================================================
// MutationObserver — watches for new Discord messages
// ============================================================
function startObserver() {
  // Mark existing messages as seen
  const embeds = document.querySelectorAll('[class*="embed"]');
  embeds.forEach((embed) => {
    const text = embed.innerText;
    if (!text) return;
    const data = extract(text);
    if (data && data.jobId) {
      seen.add(data.jobId);
    }
  });

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;

        const text = node.innerText;
        if (!text) return;

        const data = extract(text);
        if (!data) return;

        const { name, jobId, world, players } = data;
        if (seen.has(jobId)) return;

        const type = getType(name);
        if (!type) {
          // Not a supported fruit (Buddha, Tiger, Portal, Lightning, T-Rex, Dragon only)
          console.log(`Skipped unsupported fruit: ${name}`);
          return;
        }

        seen.add(jobId);

        // ===== COPY DIRECTLY — works even when unfocused =====
        const copied = forceCopyToClipboard(jobId);

        if (copied) {
          // Show the big alert overlay matching screenshot design
          showAlert(data);
          // Also show small toast
          showToast(name, world, type.color, type.emoji);
          console.log(`Copied: ${jobId.substring(0, 60)}... | ${name} | ${world}`);
        } else {
          console.warn(`Copy failed for: ${name}`);
        }

        // Send to background for: desktop notification + history + stats
        chrome.runtime.sendMessage({
          type: "LOG_JOB",
          data: { name, jobId, world, players, copied },
        }).catch(() => {});

        // Trigger desktop notification (works when tab unfocused / minimized)
        chrome.runtime.sendMessage({
          type: "SHOW_NOTIFICATION",
          data: { name, world, players, jobId, color: type.color },
        }).catch(() => {});
      });
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
  console.log("HohoHub Alert observer started");
}

// Also start after a delay in case settings load was slow
setTimeout(() => {
  if (!settings) {
    settings = {
      enabled: true,
      worldFilter: "Sea 3",
      copyMode: "pc",
      maxHistory: 50,
      soundEnabled: true,
      desktopNotif: true,
      alertDuration: 8000,
    };
  }
  if (!fruitList) {
    fruitList = JSON.parse(JSON.stringify(DEFAULT_FRUITS));
  }
  startObserver();
}, 3000);

// Utility
function escapeHTML(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}
