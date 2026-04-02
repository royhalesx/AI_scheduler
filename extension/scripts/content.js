let hasSavedSchedule = false;
let byuConnection = false;

function init() {
  // Trigger popup if on CommTech site
  if (window.location.href.includes("commtech")) {
    checkForSchedule();
    byuConnection = true;
  } else {
    byuConnection = false;
  }



}

function checkForSchedule() {
  // Logic to determine if a schedule is available for import
  // For now, we'll assume there is one found in local storage or session

  if (hasSavedSchedule) {
    showImportPopup();
  }
}

function showImportPopup() {
  if (document.getElementById("byu-scheduler-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "byu-scheduler-overlay";
  overlay.style.cssText = `
    position: fixed;
    top: 0; left: 0;
    width: 100%; height: 100%;
    background: rgba(0, 46, 93, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    backdrop-filter: blur(4px);
  `;

  const box = document.createElement("div");
  box.style.cssText = `
    background: white;
    padding: 30px;
    border-radius: 12px;
    text-align: center;
    font-family: 'Segoe UI', sans-serif;
    max-width: 350px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
  `;

  box.innerHTML = `
    <h2 style="margin: 0 0 10px 0; color: #002E5D;">Import Schedule?</h2>
    <p style="color: #555; font-size: 14px; line-height: 1.5;">We found an AI-generated schedule ready to go. Would you like to apply it to your current cart?</p>
    <div style="display: flex; gap: 10px; margin-top: 20px;">
      <button id="import-btn" style="flex: 2; padding: 10px; background: #002E5D; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">Yes, Import</button>
      <button id="close-btn" style="flex: 1; padding: 10px; background: #eee; color: #333; border: none; border-radius: 6px; cursor: pointer;">Later</button>
    </div>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // Event Listeners
  document.getElementById("import-btn").addEventListener("click", () => {
    handleScheduleImport();
    overlay.remove();
  });

  document.getElementById("close-btn").addEventListener("click", () => {
    overlay.remove();
  });


}


// Data state
let classes = [];
let term = "Fall";
const test = true; // Toggle this for mock data

// Change when deployed (e.g., "your-app-name.herokuapp.com")
const websiteURL = "localhost";

async function handleScheduleDownload() {
  try {
    // 1. Get the current active tab to check the URL
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.url.includes(websiteURL)) {
      console.warn("User is not on the AI Scheduler website.");
      hasSavedSchedule = false;
      updateStatusUI(); // Helper to update your red/green dots
      return;
    }

    // 2. Attempt to fetch the schedule from your local API
    // Note: Use the full path including protocol (http://)
    try {
      const response = await fetch(`http://${websiteURL}:3000/api/get/schedule`);
      
      if (!response.ok) throw new Error("Server error");

      const data = await response.json();
      classes = data;
      hasSavedSchedule = true;
      console.log("✅ Schedule downloaded successfully:", classes);

    } catch (fetchError) {
      console.error("Fetch failed:", fetchError);

      // 3. Mock data fallback if 'test' is true
      if (test) {
        console.log("🛠️ Fetch failed, but test mode is ON. Generating mock BYU classes...");
        classes = [
          { 
            catalog_number: "EC EN 360", 
            title: "Electromagnetic Fields and Waves", 
            instructor: "Jensen", 
            days: "TTh", 
            time: "11:00 AM - 12:15 PM" 
          },
          { 
            catalog_number: "CS 235", 
            title: "Data Structures", 
            instructor: "Clement", 
            days: "MWF", 
            time: "1:00 PM - 1:50 PM" 
          }
        ];
        hasSavedSchedule = true;
      } else {
        hasSavedSchedule = false;
      }
    }

  } catch (err) {
    console.error("Critical error in handleScheduleDownload:", err);
    hasSavedSchedule = false;
  }
}

function handleScheduleImport() {
  console.log("Importing schedule data to CommTech forms...");
  // This is where you'd inject code to fill the page's inputs
}


// Run on load
if (document.readyState === "complete" || document.readyState === "interactive") {
  init();
} else {
  window.addEventListener("DOMContentLoaded", init);
}


// Listen for messages from the popup requesting the current status
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getStatus") {
    sendResponse({ byuConnection, hasSavedSchedule });
  }
  if (request.action === "applySchedule") {
    handleScheduleImport(); // Actually run the automation
  }
  if (request.action === "downloadSchedule") {
    handleScheduleDownload(); // Actually run the automation
  }
});


