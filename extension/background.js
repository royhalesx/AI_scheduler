// // background.js
// chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
//   console.log("Hi")
//   if (request.action === "DOWNLOAD_SCHEDULE") {
//     // We do the fetch here where it's safe and fast
//    const yearterm = "20265"; 

//     const demoClasses = [
//   { courseId: "DUMMY_ID", sectionId: "DUMMY_SEC" }
//   ];

//   fetch(`https://byu-scheduler.fly.dev/api/schedule/export?term=${yearterm}`, {
//     method: 'POST',
//     headers: {
//         'Content-Type': 'application/json',
//         'Accept': 'application/json'
//     },
//     body: JSON.stringify(demoClasses)
//   })
//   .then(async (response) => {
//     // Get the raw text first to see what's actually inside
//     const rawText = await response.text();
//     console.log("Raw Response from Server:", rawText);

//     if (!response.ok) {
//       throw new Error(`Server Error (${response.status}): ${rawText}`);
//     }

//     // Now try to parse it manually
//     return JSON.parse(rawText);
//   })
//   .then(data => {
//     console.log("Success:", data);
//     chrome.storage.local.set({ "savedClasses": data, "savedIndex": 0 }, () => {
//       sendResponse({ success: true });
//     });
//   })
//   .catch(err => {
//     console.error("Background Fetch Error:", err);
//     sendResponse({ success: false, error: err.message });
//   });
//     return true; // Keeps the message channel open for the async fetch
//   }
// });