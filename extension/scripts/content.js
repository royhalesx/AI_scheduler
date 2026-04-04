let byuConnection = false;
const startApply = 0;
const continueApply = 1;

const websiteURL = "byu-scheduler.vercel";

let classes ;
let term = "Fall"; //fetch this too I guess
let hasSavedSchedule = false;

async function init() {
  // Trigger popup if on CommTech site
  if (window.location.href.includes("commtech")) {
    // TODO: enable when deployed?
    // checkForSchedule();
    byuConnection = true;
  } else {
    byuConnection = false;
  }
  await checkForSchedule();
}

// CHECK FOR SCHEDULE WHEN VISITING A WEBSITE AND YOU HAVE A SCHEDULE

async function checkForSchedule() {
  const result = await chrome.storage.local.get(["savedClasses", "savedIndex", "term"]);
  
  // Update globals
  classes = result.savedClasses;
  term = result.term || "Fall"; // Use saved term or default to Fall
  const savedIndex = result.savedIndex;

  if (classes && classes.length > 0 && savedIndex < classes.length) {
    hasSavedSchedule = true;
  } else {
    hasSavedSchedule = false;
  }
}

//DOWNLOAD THE SCHEDULE



async function handleScheduleDownload() {
  console.log("🚀 Starting Sync...");

  // 1. SCRAPE THE TERM FIRST
  let selectedTerm = "Fall"; // Default fallback

  // Use dots to indicate these are classes, and 'p' to specify the tag
  const termSelector = "p.font-mono.text-sm.font-medium.text-foreground";
  const termElement = document.querySelector(termSelector);

  if (termElement) {
    const text = termElement.innerText; // e.g., "Fall 2026"
    
    if (text.includes("Fall")) selectedTerm = "Fall";
    else if (text.includes("Spring")) selectedTerm = "Spring";
    else if (text.includes("Winter")) selectedTerm = "Winter";
    else if (text.includes("Summer")) selectedTerm = "Summer";

    console.log(`📍 Term found in HTML: ${selectedTerm}`);
  } else {
    console.warn("Could not find the term <p> element with that specific class.");
  }

  // 2. SCRAPE THE CLASSES (using your column-based logic)
  const dayMap = ["M", "T", "W", "Th", "F"];
  const rawClasses = [];
  const columns = document.querySelectorAll('.relative.border-l.border-border');

  columns.forEach((column, index) => {
    if (index > 4) return;
    const day = dayMap[index];
    const boxSelector = ".pointer-events-auto.absolute.left-1.right-1.cursor-pointer.overflow-hidden.rounded-md.border.p-1.shadow-md.transition-colors.duration-200.border-black\\/20.text-white";
    const boxes = column.querySelectorAll(boxSelector);

    boxes.forEach((box) => {
      const paragraphs = box.querySelectorAll('p');
      if (paragraphs.length < 4) return;

      const rawCode = paragraphs[0].innerText.split('\n')[0].replace(/"/g, '');
      const catalog_number = rawCode.split('§')[0].trim();
      const instructor = paragraphs[3].innerText.replace(/"/g, '').replace(/\(.*\)/, '').trim();
      const timeText = paragraphs[2].innerText.replace(/"/g, '');
      const timeParts = timeText.split(/[–-]/).map(t => t.trim());

      const formatTime = (t) => {
        if (!t) return "";
        return t.toLowerCase().replace(/\s/g, '').replace(':00', '').replace('am', 'a').replace('pm', 'p').replace('m', '');
      };

      rawClasses.push({ 
        catalog_number, 
        instructor, 
        days: day, 
        start: formatTime(timeParts[0]), 
        end: formatTime(timeParts[1]) 
      });
    });
  });

  // 3. MERGE & SORT (standard logic)
  const merged = Object.values(rawClasses.reduce((acc, curr) => {
    const key = `${curr.catalog_number}-${curr.instructor}-${curr.start}`;
    if (!acc[key]) acc[key] = { ...curr };
    else if (!acc[key].days.includes(curr.days)) acc[key].days += curr.days;
    return acc;
  }, {}));

  const finalSchedule = merged.map(item => ({
    ...item,
    days: dayMap.filter(d => item.days.includes(d)).join('')
  }));

  // 4. SAVE EVERYTHING
  await chrome.storage.local.set({ 
    "savedClasses": finalSchedule, 
    "savedIndex": 0,
    "term": selectedTerm 
  });

  hasSavedSchedule = true;
  console.log(`✅ Sync Complete: ${finalSchedule.length} classes for ${selectedTerm}.`);
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

async function hitBack() {
  try {
    // Wait for the button container to actually exist
    await waitForSelector('.customButtonText'); 
    
    const buttons = document.querySelectorAll('.customButtonText');
    const backBtn = Array.from(buttons).find(el => el.innerText.includes("Back"));

    if (backBtn) {
      console.log("Back button found. Navigating back...");
      
      // Focus and Click
      backBtn.focus();
      backBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      backBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      backBtn.click();
      
      // Crucial: Wait for the navigation/transition to actually start
      await new Promise(resolve => setTimeout(resolve, 800)); 
    }
  } catch (err) {
    console.error("Back button navigation failed:", err);
  }
}

async function handleScheduleImport(indexMode) {
  if(!hasSavedSchedule) {
    await hitBack(); // MUST await here
    return;
  }
 
  //STEP 1: ensure the user is on the correct page if they are not on add a course redirect them
  const currentUrl = window.location.href;
  let sectionIndex = 0;
  // 1. Check if we are on a CommTech site
  if (!currentUrl.includes("commtech")) {
    console.log("You are not on the scheduling website.");
    return;
  }

  //If it is the correct website cache the indexMode
   if(indexMode == startApply){
    await chrome.storage.local.set({ "savedIndex": indexMode });
  }


  // 2. Check and Redirect if necessary
  if (!currentUrl.includes("/register/addACourse")) {
    console.log("CommTech detected, but not on the registration page. Redirecting...");
    window.location.href = currentUrl + "register/addACourse";
  }

  // 3. Retrieve the data from Local Storage
  console.log("On the right page. Retrieving schedule from storage...");

  //STEP 2: Get data from local storage

  const result = await chrome.storage.local.get(["savedClasses", "savedIndex", "term"]);
  term = result.term
  const classIndex = result.savedIndex
  classes=result.savedClasses


  // const classes = result.savedClasses;

  //if I can't find classes then there is no need to do anything.
  if (!classes || classes.length === 0 || classIndex >= classes.length) {
    console.log("🎉 All classes processed! Navigating back to home...");
    hasSavedSchedule = false;
    await hitBack(); // MUST await here
    return;
}

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
  //Save next index:
    await chrome.storage.local.set({ "savedIndex": classIndex+1 });


  //STEP 7: redirect back to schedulebuilder page and loop through the next class
  // STEP 7: Wait for Add button action to clear and click Back
  await new Promise(resolve => setTimeout(resolve, 1000)); 

  await hitBack(); // Wait for the transition to the search page

  // Wait for the search box to reappear before the next class starts
    handleScheduleImport(continueApply);
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
    handleScheduleImport(startApply); // Actually run the automation
  }
  if (request.action === "downloadSchedule") {
    handleScheduleDownload(); // Actually run the automation
  }
});


// Listen for changes in storage from OTHER tabs
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && (changes.savedClasses || changes.savedIndex)) {
    checkForSchedule(); 
  }
});