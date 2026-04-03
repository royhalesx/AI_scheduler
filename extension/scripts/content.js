let byuConnection = false;


// TODO: Change when deployed (e.g., "your-app-name.herokuapp.com") and update manifest
const websiteURL = "byu-scheduler.vercel";


// TODO: Data state change to null when deployed
// TODO: store this data in chrome.storage.local
let classes = [
          { 
            catalog_number: "CS 111", 
            instructor: "Giles", 
            days: "MW", 
            start: "8a",
            end: "9:15a"
          },
          { 
            catalog_number: "CS 235", 
            instructor: "Crandall", 
            days: "MWF", 
            start: "2p",
            end: "3:15p"
          }
        ];
let term = "Fall"; //fetch this too I guess

function init() {
  // Trigger popup if on CommTech site
  if (window.location.href.includes("commtech")) {
    // TODO: enable when deployed?
    // checkForSchedule();
    byuConnection = true;
  } else {
    byuConnection = false;
  }



}

// CHECK FOR SCHEDULE WHEN VISITING A WEBSITE AND YOU HAVE A SCHEDULE

function checkForSchedule() {
  // Logic to determine if a schedule is available for import
  // For now, we'll assume there is one found in local storage or session

  if (classes) {
    showImportPopup();
  }
}

// ASK TO IMPORT THE SCHEDULE

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
    handleScheduleImport(0);
    overlay.remove();
  });

  document.getElementById("close-btn").addEventListener("click", () => {
    overlay.remove();
  });


}


//DOWNLOAD THE SCHEDULE


async function handleScheduleDownload() {
  console.log("Attempting to fetch schedule");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.url.includes(websiteURL)) {
      console.warn("User is not on the AI Scheduler website.");
      return;
    }

    try {
      const response = await fetch(`http://${websiteURL}:8000/api/schedule/export`);
      
      if (!response.ok) throw new Error("Server error");

      const data = await response.json();
      
      // Save to local variable
      classes = data;

      // Save to Google Local Storage for the content script to use later
      await chrome.storage.local.set({ "savedClasses": data });
      
      console.log("✅ Schedule downloaded and saved to storage:", data);

    } catch (fetchError) {
      console.error("Fetch failed:", fetchError);
    }

  } catch (err) {
    console.error("Critical error in handleScheduleDownload:");
  }
}

//  IMPORT THE SCHEDULE


//wait for search results (doesn't work with page redirects)
const waitForSelector = (selector, timeout = 5000) => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const timer = setInterval(() => {
      const element = document.querySelector(selector);
      if (element) {
        clearInterval(timer);
        resolve(element);
      } else if (Date.now() - startTime > timeout) {
        clearInterval(timer);
        reject(new Error(`Selector ${selector} not found within ${timeout}ms`));
      }
    }, 100);
  });
};



async function handleScheduleImport(classIndex) {
  //STEP 1: ensure the user is on the correct page if they are not on add a course redirect them

  const currentUrl = window.location.href;
  let sectionIndex = 0;
  // 1. Check if we are on a CommTech site
  if (!currentUrl.includes("commtech")) {
    console.log("You are not on the scheduling website.");
    return;
  }

  // 2. Check and Redirect if necessary
  if (!currentUrl.includes("/register/addACourse")) {
    console.log("CommTech detected, but not on the registration page. Redirecting...");
    window.location.href = currentUrl + "register/addACourse";
  }

  // 3. Retrieve the data from Local Storage
  console.log("On the right page. Retrieving schedule from storage...");

  //STEP 2: Get data from local storage

  // const result = await chrome.storage.local.get("savedClasses");
  // const classes = result.savedClasses;

  //if I can't find classes then there is no need to do anything.
  if (!classes || classes.length === 0 || classIndex >= classes.length) return;


  //STEP 3: Change term to term fetched from the schedule builder

  // --- Step: Select Term and Year ---
  const currentYear = new Date().getFullYear(); // Currently 2026
  const termKeywords = ["Winter", "Spring", "Summer", "Fall"];

  await new Promise(resolve => setTimeout(resolve, 500));
  sectionIndex = 0;

  try {
    // 1. Find the specific dropdown trigger that contains a term name
    let test = await waitForSelector('#searchTextInput');
    const dropdowns = document.querySelectorAll('.dropDownSelectedOption');
    const termTrigger = Array.from(dropdowns).find(el => 
      termKeywords.some(keyword => el.innerText.includes(keyword))
    );

    if (termTrigger) {
      console.log("Found term dropdown. Clicking...");
      termTrigger.focus();
      termTrigger.click();
      
      // 2. Wait for the list of options to appear in the DOM
      await waitForSelector('.dropDownSelectOption');
      const options = document.querySelectorAll('.dropDownSelectOption');

      // 3. Find the option that matches your 'term' variable and is current/future year
      const targetOption = Array.from(options).find(opt => {
        const text = opt.innerText; // e.g., "Fall 2026"
        const yearMatch = text.match(/\d{4}/);
        const optYear = yearMatch ? parseInt(yearMatch[0]) : 0;
        
        return text.includes(term) && optYear >= currentYear;
      });

      if (targetOption) {
        console.log(`Matching option found: ${targetOption.innerText}. Selecting...`);
        
        // 4. Perform the full click sequence
        targetOption.focus();
        targetOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        targetOption.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        targetOption.click();
      } else {
        console.warn(`Could not find a dropdown option for ${term} ${currentYear} or later.`);
      }
    } else {
      console.error("Could not find the term selection dropdown trigger.");
    }
  } catch (err) {
    console.error("Term/Year selection failed:", err);
  }
  //wait for the term change to take effect
  await new Promise(resolve => setTimeout(resolve, 300)); //TODO: Replace 

  try {
    // --- Step 1: Fill and Search (Existing Logic) ---
    //TODO: this doesn't work replace with a static wait timer?
    const searchInput = await waitForSelector('#searchTextInput'); 
    //TODO add a for loop to cycle through each class
    const firstClass = classes[classIndex].catalog_number;
    
    searchInput.focus();
    searchInput.click();
    searchInput.value = firstClass;
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    
    const keyOptions = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true };
    searchInput.dispatchEvent(new KeyboardEvent('keydown', keyOptions));
    searchInput.dispatchEvent(new KeyboardEvent('keyup', keyOptions));
    console.log(`Search dispatched for: ${firstClass}`);

    // --- Step 2: Wait for Results and Click ---
    console.log("Waiting for search results to appear...");
    
    // We target both classes: .classSearchResultRoot AND .courseSearchResult
    const resultsSelector = '.classSearchResultRoot.courseSearchResult';
    
    try {
  // 1. Wait for the whole page to finish its reload cycle
    if (document.readyState !== 'complete') {
      await new Promise(resolve => window.addEventListener('load', resolve));
    }

    // A tiny buffer to allow the BYU site's internal scripts to finish rendering the rows
    await new Promise(resolve => setTimeout(resolve, 500));

      const resultItem = await waitForSelector(resultsSelector, 7000); // 7s timeout for slow BYU servers
      
      if (resultItem) {
        console.log("Found search result. Clicking to enter course details...");
        
        // Full click simulation sequence
        resultItem.focus();
        resultItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        resultItem.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        resultItem.click();
        
        console.log("✅ Navigation into class successful!");
      }
    } catch (e) {
      // If the selector isn't found, it likely means no results were returned
      console.log("No results found for this class catalog number.");
      return;
    }

  } catch (error) {
    console.error("Automation failed:", error.message);
  }


  //STEP 5: Find professor and add to cart or schedule the correct time
  //TODO: reload the classes variable from chrome storage
  // --- Step: Find and Select Specific Section ---
  try {
    // 1. Wait for sections to render on the page
    await waitForSelector('.sectionDetailsRoot');
    const sections = document.querySelectorAll('.sectionDetailsRoot');
    
    // Using the first class from your data as the current target
    const currentClass = classes[classIndex]; 
    const targetTimeString = `${currentClass.days} ${currentClass.start} - ${currentClass.end}`;
    
    let sectionFound = false;

    for (const section of sections) {
      
      const columns = section.querySelectorAll('.sectionDetailsCol');
      
      // Ensure we have enough columns to check (at least 3)
      if (columns.length >= 3) {
        const instructorText = columns[0].innerText;
        const scheduleText = columns[2].innerText; // The third child
        console.log("Instructor: " + instructorText)
        console.log("Schedule: " + scheduleText)

        // 2. Verify Instructor and Time Match
        if (instructorText.includes(currentClass.instructor) && scheduleText.includes(currentClass.days) && scheduleText.includes(currentClass.start)&& scheduleText.includes(currentClass.end)) {
          console.log(`Match found: ${currentClass.instructor} | ${targetTimeString}`);
          
          // 3. Find the "Select" button within this specific section root
          const selectBtn = section.querySelector('.selectSectionBtn');
          
          if (selectBtn && selectBtn.innerText.trim() === "Select") {
            console.log("Selecting section...");
            
            // Established click technique
            selectBtn.focus();
            selectBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            selectBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            selectBtn.click();

            
            sectionFound = true;
            break; 
          }
        }
      }
      // if section not found then increase index
      sectionIndex++;
    }

    if (!sectionFound) {
      console.log(`No section found for ${currentClass.instructor} at ${targetTimeString}`);
      sectionIndex = 0;
      return;
    }

  } catch (err) {
    console.error("Section selection process failed:", err);
  }

  //STEP 6: add to cart wait half a second so it pulls up because it's already loaded for some reason
  // Wait a moment for the "Select" action's UI/modal to stabilize
  await new Promise(resolve => setTimeout(resolve, 300));

try {
    // 1. Fix: Join classes with dots. Search relative to the 'section' row.
    const selection = ('.customButtonRoot.customButtonDefault.customButtonWhiteOnBlue.sectionActionDialogButton')
    const addBtn = await waitForSelector(selection, 7000);
    if (addBtn) {
        console.log("Add button found inside section. Clicking...");
        
        // 2. Perform the established click technique
        addBtn.focus();
        addBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        addBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        addBtn.click();
        
        console.log("✅ Course successfully added to cart!");
    } else {
        console.warn("Could not find the Add button in this specific section row.");
    }
} catch (err) {
    console.error("Failed to add course to cart:", err);
}

  //STEP 7: redirect back to schedulebuilder page and loop through the next class
  await new Promise(resolve => setTimeout(resolve, 1000)); //TODO: Replace 
    window.location.href = currentUrl + "register/addACourse";

  handleScheduleImport(classIndex++);
}




// Run on load
if (document.readyState === "complete" || document.readyState === "interactive") {
  init();
} else {
  window.addEventListener("DOMContentLoaded", init);
}


// Listen for messages from the popup requesting the current status
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  let hasSavedSchedule = (classes ? true : false)
  if (request.action === "getStatus") {
    sendResponse({ byuConnection, hasSavedSchedule });
  }
  if (request.action === "applySchedule") {
    handleScheduleImport(0); // Actually run the automation
  }
  if (request.action === "downloadSchedule") {
    handleScheduleDownload(); // Actually run the automation
  }
});


