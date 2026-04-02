document.addEventListener('DOMContentLoaded', () => {
    // 1. Update the status dots when the side panel opens
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, {action: "getStatus"}, (response) => {
            if (response) {
                updateStatus('byuConnection', response.byuConnection);
                updateStatus('hasSavedSchedule', response.hasSavedSchedule);
            }
        });
    });

    // 2. Button Listeners
    document.getElementById("download-button").addEventListener("click", () => {
        console.log("Popup: Download requested");
        // Logic to download from your AI server
         chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, {action: "downloadSchedule"});
        });
    });

    document.getElementById("apply-button").addEventListener("click", () => {
        console.log("Popup: Apply requested");
        // Tell the content script to start filling in the BYU forms
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, {action: "applySchedule"});
        });
    });
});

function updateStatus(id, active) {
    const el = document.getElementById(id);
    if (el) {
        el.className = active ? "dot green" : "dot red";
    }
}