// Offscreen document for clipboard access
// Service workers can't access the clipboard API directly,
// so we use an offscreen document to perform the copy.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "OFFSCREEN_COPY") {
    const text = message.text;
    // Use the Clipboard API in the offscreen document context
    navigator.clipboard
      .writeText(text)
      .then(() => {
        console.log("Offscreen: Copied to clipboard successfully");
        sendResponse({ success: true });
      })
      .catch((e) => {
        console.warn("Offscreen: Clipboard API failed, trying execCommand:", e);
        // Fallback: execCommand approach
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
            console.log("Offscreen: Copied via execCommand fallback");
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false });
          }
        } catch (e2) {
          console.warn("Offscreen: execCommand also failed:", e2);
          sendResponse({ success: false });
        }
      });
    return true; // Keep message channel open for async response
  }
});
