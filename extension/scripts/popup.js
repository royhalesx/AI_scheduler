function updateStatus(byuConnection, hasSavedSchedule){
  let byuPin;
  let schedulePin;
  try{
    byuPin = document.getElementById("byuConnection");
    schedulePin = document.getElementById("hasSavedSchedule");
  } catch (exception){
    console.error("Error finding DOM elements:", exception);
    return;
  }

  console.log("Popup successfully opened and running updateStatus!");
  
  if(byuConnection){
    byuPin.className = "dot green";
  } else {
    byuPin.className = "dot red";
  }

  if(hasSavedSchedule){
    schedulePin.className = "dot green";
  } else {
    schedulePin.className = "dot red";
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Query the active tab to request status from the content script
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { action: "getStatus" }, (response) => {
        if (response) {
          updateStatus(response.byuConnection, response.hasSavedSchedule);
        } else {
          // Fallback if the content script isn't injected (e.g. on restricted pages)
          updateStatus(false, false);
        }
      });
    }
  });
});

function downloadSchedule(){
    console.log("download clicked!")
}


function applySchedule(){
    console.log("apply Schedule")
}
//  DOM button 1 clicked and DOM button 2 clicked