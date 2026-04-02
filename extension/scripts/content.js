
function renderReadingTime(article) {
console.log("You are on a byu scheduling website")

if (!article) {
    // console.log(document.body.innerText);
    return;
  }else if (article.innerText != null){
    article.forEach(element => {
        console.log(element.innerText)
    });
    console.log(article.innerHTML)
  }

  const text = article.textContent;


//   // Support for API reference docs
//   const heading = article.querySelector("h1");
//   const divider = article.querySelector("div");
//   // Support for article docs with date
// //   const date = article.querySelector("time")?.parentNode;
//   
// 
//  (heading ?? divider).insertAdjacentElement("afterend", badge);
}

// renderReadingTime(document.querySelector("article"));
renderReadingTime(document.getElementsByClassName("chooseASectionRoot"));

//Get the text on the page when it successfully loads
document.addEventListener('DOMContentLoaded', () => {
  const appElement = document.getElementById("app");
  
  if (appElement) {
    renderReadingTime(appElement);
  }
});
