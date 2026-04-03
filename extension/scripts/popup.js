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
        // handleLocalSync();
         chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, {action: "downloadSchedule"});
        });
    });

    // popup.js
//      async function handleLocalSync() {
//   const statusEl = document.getElementById('status');
//   statusEl.textContent = 'Grabbing local schedule...';

//   try {
//     const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
//     // Ensure we are on the AI site
//     if (!tab.url.includes("byu-scheduler")) {
//       statusEl.textContent = 'Switch to the AI Scheduler tab!';
//       return;
//     }

//     // 1. Scrape the localStorage directly
//     const [{ result }] = await chrome.scripting.executeScript({
//       target: { tabId: tab.id },
//       func: () => {
//         const rawSchedule = JSON.parse(localStorage.getItem('byu_active_schedule') ?? '[]');
//         return rawSchedule.map(item => ({
//           // Map their keys to EXACTLY what your content.js expects:
//           catalog_number: item.catalog_number || item.courseId, 
//           instructor: item.instructor,
//           days: item.days,
//           start: item.start,
//           end: item.end
//         }));
//       },
//     });
//     console.log(result)

//     if (!result || result.length === 0) {
//       statusEl.textContent = 'No classes found in browser storage.';
//       return;
//     }

//     // 2. Save directly to Extension Storage
//     await chrome.storage.local.set({ 
//       "savedClasses": result, 
//       "savedIndex": 0 
//     });

//     statusEl.textContent = `✅ ${result.length} Classes Loaded Locally!`;
//     console.log("Direct Sync Successful:", result);

//   } catch (err) {
//     console.error("Local sync failed:", err);
//     statusEl.textContent = 'Sync Error: ' + err.message;
//   }
// }


      //done

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