/* Lớp bổ sung cho index-new.html — chạy SAU app.js.
   Chỉ bọc switchTab để cập nhật breadcrumb trên header; không đổi logic gốc. */
(function () {
  if (typeof window.switchTab !== "function") return;

  var original = window.switchTab;

  function syncCrumb(which) {
    var key = which.charAt(0).toUpperCase() + which.slice(1);
    var panel = document.getElementById("tab" + key);
    var btn = document.getElementById("tab" + key + "Btn");
    var group = document.getElementById("v2CrumbGroup");
    var page = document.getElementById("v2CrumbPage");
    if (group && panel) group.textContent = panel.getAttribute("data-group") || "";
    if (page && btn) {
      var label = btn.querySelector(".menu-text");
      page.textContent = label ? label.textContent : "";
    }
    document.querySelectorAll(".sidebar .menu-item").forEach(function (el) {
      if (el === btn) el.setAttribute("aria-current", "page");
      else el.removeAttribute("aria-current");
    });
    var main = document.querySelector(".main-content");
    if (main) main.scrollTop = 0;
  }

  window.switchTab = function (which) {
    original(which);
    syncCrumb(which);
  };

  document.addEventListener("DOMContentLoaded", function () { syncCrumb("bulk"); });
})();
