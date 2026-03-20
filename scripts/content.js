
function renderReadingTime(article) {
console.log("You are on a byu scheduling website")

if (!article) {
    return;
  }
 console.log(article)

  const text = article.textContent;
  const wordMatchRegExp = /[^\s]+/g; // Regular expression
  const words = text.matchAll(wordMatchRegExp);
  // matchAll returns an iterator, convert to array to get word count
  const wordCount = [...words].length;
  const readingTime = Math.round(wordCount / 200);
  const badge = document.createElement("p");
  // Use the same styling as the publish information in an article's header
  badge.classList.add("color-secondary-text", "type--caption");
  badge.textContent = `⏱️ ${readingTime} min read`;

  // Support for API reference docs
  const heading = article.querySelector("h1");
  const divider = article.querySelector("div");
  // Support for article docs with date
//   const date = article.querySelector("time")?.parentNode;
  


  (heading ?? divider).insertAdjacentElement("afterend", badge);
}

renderReadingTime(document.querySelector("article"));



// const observer = new MutationObserver((mutations) => {
//   for (const mutation of mutations) {
//     // If a new article was added.
//     for (const node of mutation.addedNodes) {
//       if (node instanceof Element && node.tagName === 'ARTICLE') {
//         // Render the reading time for this particular article.
//         renderReadingTime(node);
//       }
//     }
//   }
// });

// // https://developer.chrome.com/ is a SPA (Single Page Application) so can
// // update the address bar and render new content without reloading. Our content
// // script won't be reinjected when this happens, so we need to watch for
// // changes to the content.
// observer.observe(document.querySelector('devsite-content'), {
//   childList: true
// });