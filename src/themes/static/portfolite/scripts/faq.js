(function () {
  document.querySelectorAll(".faq-item").forEach(function (item) {
    var question = item.querySelector(".faq-question");
    if (!question) return;
    question.addEventListener("click", function () {
      var open = item.getAttribute("data-open") === "true";
      document.querySelectorAll(".faq-item").forEach(function (other) {
        other.setAttribute("data-open", "false");
      });
      item.setAttribute("data-open", open ? "false" : "true");
    });
  });
})();
