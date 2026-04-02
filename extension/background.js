chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (!tab.url) return;

  const url = new URL(tab.url);
  // Check if the user is on the specific BYU scheduling site
  if (url.origin.includes("commtech")) {
    await chrome.sidePanel.setOptions({
      tabId,
      path: 'index.html',
      enabled: true
    });
    
    // This automatically opens the side panel
    chrome.sidePanel.open({ tabId });
  } else {
    // Disables the side panel for non-scheduling sites if desired
    await chrome.sidePanel.setOptions({
      tabId,
      enabled: false
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "open_side_panel") {
    // 'sender.tab.id' tells Chrome which tab wants the panel opened
    chrome.sidePanel.open({ tabId: sender.tab.id });
  }
});