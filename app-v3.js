/* APP V3 — "Trung tâm quy trình". Chạy SAU app.js.
   - Điều hướng bằng hash: #/ = trang chủ, #/bulk ... = mở công cụ (nút Back của trình duyệt dùng được).
   - Thanh 3 bước theo dõi trạng thái: có kết quả -> bước 2; bấm Copy/Tải/Lưu -> bước 3 hoàn tất.
   - Không đổi logic xử lý dữ liệu của app.js; chỉ gọi switchTab() để hiện đúng tab. */
(function () {
  "use strict";

  // ready: phần tử nào hiện ra (có kích thước) thì coi là đã có kết quả để kiểm tra.
  var TOOLS = {
    bulk:        { ready: "#bulkTbody tr" },
    transaction: { ready: "#txSearchResult table, #txSearchResult .card, #txListResult table, #bankTableWrap" },
    invoice:     { ready: "#invoiceTbody tr, #invoiceTable tbody tr, #invoiceByDateResultsContainer table" },
    gdt:         { ready: "#gdtResultsContainer table, #gdtResultsContainer .card" },
    air:         { ready: "#airResultArea" },
    ehoadon:     { ready: "#ehoadonInvoiceCard, #ehoadonCustomsCard", input: "#ehoadonLoginCard" },
    employee:    { ready: "#employeeResultCard" },
    vax1:        { ready: "#vax1ResultCard" }
  };
  var EXPORT_RE = /copy|tải|lưu hóa đơn|lưu phiếu|tạo\s*&|tạo và lưu/i;
  var RECENT_KEY = "v3_recent";

  var $ = function (id) { return document.getElementById(id); };
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var state = {};           // key -> { ready: bool, exported: bool }
  var activeKey = null;
  var baseTitle = document.title;

  function panelOf(key) { return $("tab" + key.charAt(0).toUpperCase() + key.slice(1)); }
  function cardOf(key) { return document.querySelector('.v3-task[data-key="' + key + '"]'); }
  function visible(el) { return !!el && el.getClientRects().length > 0; }
  function firstVisible(root, selector) {
    if (!root || !selector) return null;
    var list = root.querySelectorAll(selector);
    for (var i = 0; i < list.length; i++) if (visible(list[i])) return list[i];
    return null;
  }

  /* ---------------- Lưu "dùng gần đây" (chỉ là tiện ích, lỗi thì bỏ qua) ---------------- */
  function readRecent() {
    try { var v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function pushRecent(key) {
    var list = readRecent().filter(function (r) { return r && r.key !== key; });
    list.unshift({ key: key, t: Date.now() });
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8))); } catch (e) {}
  }
  function ago(t) {
    var s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return "vừa xong";
    if (s < 3600) return Math.floor(s / 60) + " phút trước";
    if (s < 86400) return Math.floor(s / 3600) + " giờ trước";
    var d = Math.floor(s / 86400);
    return d === 1 ? "hôm qua" : d + " ngày trước";
  }

  function renderHome() {
    var now = new Date();
    var days = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
    var pad = function (n) { return String(n).padStart(2, "0"); };
    $("v3Today").textContent = days[now.getDay()] + ", " + pad(now.getDate()) + "/" + pad(now.getMonth() + 1) + "/" + now.getFullYear();

    var recent = readRecent().filter(function (r) { return r && TOOLS[r.key]; });
    var byKey = {};
    recent.forEach(function (r) { if (!byKey[r.key]) byKey[r.key] = r.t; });

    document.querySelectorAll(".v3-task-meta[data-last]").forEach(function (el) {
      var t = byKey[el.getAttribute("data-last")];
      el.textContent = t ? "Mở lần cuối " + ago(t) : "Chưa dùng trên máy này";
      el.classList.toggle("is-recent", !!t && Date.now() - t < 86400000);
    });

    var wrap = $("v3RecentList");
    wrap.textContent = "";
    recent.slice(0, 3).forEach(function (r) {
      var card = cardOf(r.key);
      if (!card) return;
      var a = document.createElement("a");
      a.className = "v3-chip";
      a.href = "#/" + r.key;
      a.setAttribute("data-key", r.key);
      var icon = card.querySelector(".v3-task-icon svg");
      if (icon) a.appendChild(icon.cloneNode(true));
      a.appendChild(document.createTextNode(card.querySelector(".v3-task-title").textContent + " "));
      var small = document.createElement("small");
      small.textContent = ago(r.t);
      a.appendChild(small);
      wrap.appendChild(a);
    });
    $("v3Recent").hidden = !wrap.children.length;
  }

  /* ---------------- Thanh bước ---------------- */
  function stepOf(key) {
    var s = state[key] || {};
    return s.exported ? 4 : (s.ready ? 2 : 1);  // 4 = đã xong cả 3 bước
  }

  function targetFor(key, n) {
    var panel = panelOf(key), cfg = TOOLS[key];
    if (n === 1) return (cfg.input && $(cfg.input.slice(1))) || panel.querySelector(".card") || panel;
    var ready = firstVisible(panel, cfg.ready);
    var area = ready ? (ready.closest(".card") || ready) : null;
    if (n === 2) return area;
    var btns = panel.querySelectorAll("button");
    for (var i = 0; i < btns.length; i++) {
      if (visible(btns[i]) && EXPORT_RE.test(btns[i].textContent)) return btns[i];
    }
    return area;
  }

  function goToStep(n) {
    if (!activeKey) return;
    var el = targetFor(activeKey, n);
    if (!el) {
      $("v3ActionHint").textContent = n === 2
        ? "Chưa có kết quả. Nhập dữ liệu và bấm nút chạy ở bước 1."
        : "Chưa có gì để xuất. Hoàn tất bước 2 trước.";
      return;
    }
    el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: n === 3 ? "center" : "start" });
    var box = el.matches("button") ? el : (el.closest(".card") || el);
    box.classList.remove("v3-flash");
    void box.offsetWidth;
    box.classList.add("v3-flash");
    setTimeout(function () { box.classList.remove("v3-flash"); }, 950);
    if (n === 1) {
      var field = el.querySelector("textarea, input:not([type=hidden]):not([type=file]), select");
      if (field && visible(field)) field.focus({ preventScroll: true });
    } else if (el.matches("button")) {
      el.focus({ preventScroll: true });
    }
  }

  function renderSteps() {
    if (!activeKey) return;
    var labels = (cardOf(activeKey).getAttribute("data-steps") || "").split("|");
    var cur = stepOf(activeKey);
    document.querySelectorAll("#v3Stepper .v3-step").forEach(function (li) {
      var n = Number(li.getAttribute("data-step"));
      li.classList.toggle("is-done", n < cur);
      li.classList.toggle("is-current", n === cur);
      li.querySelector(".v3-step-label").textContent = labels[n - 1] || "";
      var btn = li.querySelector(".v3-step-btn");
      if (n === cur) btn.setAttribute("aria-current", "step"); else btn.removeAttribute("aria-current");
      btn.setAttribute("aria-label", "Bước " + n + ": " + (labels[n - 1] || "") + (n < cur ? " (đã xong)" : ""));
    });
    var pct = cur >= 4 ? 100 : ((cur - 1) / 3 + 1 / 6) * 100;
    $("v3ProgressBar").style.width = pct.toFixed(1) + "%";

    var next = $("v3NextBtn"), hint = $("v3ActionHint");
    if (cur === 1) {
      next.textContent = "Đi tới ô nhập";
      next.className = "v3-next is-quiet";
      next.onclick = function () { goToStep(1); };
      hint.textContent = "Bước 1 · " + labels[0] + ". Xong thì bấm nút chạy trong khung bên trên.";
    } else if (cur === 2) {
      next.textContent = "Tiếp: " + labels[2];
      next.className = "v3-next";
      next.onclick = function () { goToStep(3); };
      hint.textContent = "Đã có kết quả. Kiểm tra lại trước khi xuất.";
    } else {
      next.textContent = "Về danh sách công việc";
      next.className = "v3-next is-quiet";
      next.onclick = function () { location.hash = "#/"; };
      hint.textContent = "Đã xuất. Có thể chạy lại với dữ liệu khác.";
    }
  }

  function evaluate() {
    if (!activeKey) return;
    var s = state[activeKey] || (state[activeKey] = {});
    var ready = !!firstVisible(panelOf(activeKey), TOOLS[activeKey].ready);
    if (ready !== !!s.ready) {
      s.ready = ready;
      if (!ready) s.exported = false;
      renderSteps();
    }
  }

  var pending = false;
  var observer = new MutationObserver(function () {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () { pending = false; evaluate(); });
  });

  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("button");
    if (!btn || !activeKey) return;
    var inTool = btn.closest(".tab-panel") === panelOf(activeKey) || btn.closest("#gdtDetailOverlay");
    if (inTool && EXPORT_RE.test(btn.textContent)) {
      var s = state[activeKey] || (state[activeKey] = {});
      s.ready = true;
      s.exported = true;
      setTimeout(renderSteps, 0);
    }
  }, true);

  /* ---------------- Điều hướng ---------------- */
  function setIconName(el, on) { if (el) el.style.viewTransitionName = on ? "v3-icon" : ""; }

  function showHome() {
    activeKey = null;
    document.body.setAttribute("data-view", "home");
    $("v3Tool").hidden = true;
    $("v3Home").hidden = false;
    $("v3TopCrumb").textContent = "";
    document.title = baseTitle;
    renderHome();
  }

  function showTool(key) {
    var card = cardOf(key);
    activeKey = key;
    document.body.setAttribute("data-view", "tool");
    $("v3Home").hidden = true;
    $("v3Tool").hidden = false;

    window.switchTab(key);

    var title = card.querySelector(".v3-task-title").textContent;
    $("v3ToolTitle").textContent = title;
    $("v3ToolDesc").textContent = card.querySelector(".v3-task-desc").textContent;
    $("v3ToolGroup").textContent = card.getAttribute("data-group");
    var iconWrap = $("v3ToolIcon");
    iconWrap.textContent = "";
    var svg = card.querySelector(".v3-task-icon svg");
    if (svg) iconWrap.appendChild(svg.cloneNode(true));
    $("v3TopCrumb").textContent = title;
    document.title = title + " · 10X";

    pushRecent(key);
    state[key] = state[key] || {};
    state[key].ready = !!firstVisible(panelOf(key), TOOLS[key].ready);
    renderSteps();
  }

  var previousKey = null;
  function route() {
    var m = /^#\/([a-z0-9]+)/i.exec(location.hash || "");
    var key = m && TOOLS[m[1]] ? m[1] : null;
    if (key === activeKey && (key || !$("v3Home").hidden)) return;

    var from = previousKey, to = key;
    var apply = function () {
      if (to) showTool(to); else showHome();
      $("v3Scroll").scrollTop = 0;
    };

    if (document.startViewTransition && !reduceMotion) {
      // Icon của thẻ "bay" thành icon ở đầu trang công cụ (và ngược lại khi quay về)
      var srcIcon = to ? cardOf(to) && cardOf(to).querySelector(".v3-task-icon") : $("v3ToolIcon");
      setIconName(srcIcon, true);
      var t = document.startViewTransition(function () {
        setIconName(srcIcon, false);
        apply();
        var dst = to ? $("v3ToolIcon") : (from && cardOf(from) && cardOf(from).querySelector(".v3-task-icon"));
        setIconName(dst, true);
        return dst;
      });
      t.finished.finally(function () {
        setIconName($("v3ToolIcon"), false);
        document.querySelectorAll(".v3-task-icon").forEach(function (el) { setIconName(el, false); });
      });
    } else {
      apply();
    }
    previousKey = to;
  }

  document.addEventListener("DOMContentLoaded", function () {
    observer.observe($("v3Panels"), { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "class", "hidden"] });
    document.querySelectorAll("#v3Stepper .v3-step-btn").forEach(function (b) {
      b.addEventListener("click", function () { goToStep(Number(b.getAttribute("data-step"))); });
    });
    window.addEventListener("hashchange", route);
    // Lần đầu: không chạy hiệu ứng chuyển cảnh
    var m = /^#\/([a-z0-9]+)/i.exec(location.hash || "");
    if (m && TOOLS[m[1]]) { showTool(m[1]); previousKey = m[1]; } else { showHome(); }
  });
})();

/* ---------------- Xử lý bảng lương: tổng quan mọi tháng + cảnh báo ô lỗi ----------------
   Đọc globalSheetsData / globalSheetMeta do app.js tạo khi nạp file (không đổi dữ liệu). */
(function () {
  "use strict";
  if (typeof window.doFetchEmployeesExcel !== "function" || typeof window.displaySheetData !== "function") return;

  var $ = function (id) { return document.getElementById(id); };
  var fmt = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
  var money = function (n) { return fmt.format(Math.round(n || 0)); };

  function parseKey(k) {           // "T072026" -> { m: 7, y: 2026, label: "07/2026", order: 202607 }
    var m = /^T(\d{2})(\d{4})$/.exec(k);
    if (!m) return null;
    return { m: +m[1], y: +m[2], label: m[1] + "/" + m[2], order: +m[2] * 100 + +m[1] };
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  // globalSheetsData khai báo bằng `let` trong app.js -> không nằm trên window, đọc qua tên biến
  function sheetData() { return typeof globalSheetsData !== "undefined" && globalSheetsData ? globalSheetsData : {}; }
  function sheets() {
    var data = sheetData();
    return Object.keys(data).map(function (k) { return { key: k, info: parseKey(k) }; })
      .filter(function (s) { return s.info; })
      .sort(function (a, b) { return a.info.order - b.info.order; });
  }
  function totals(rows) {
    return rows.reduce(function (t, r) {
      t.gross += r.tong_thu_nhap || 0; t.tax += r.thue_tncn || 0; t.net += r.thuc_nhan || 0; return t;
    }, { gross: 0, tax: 0, net: 0 });
  }
  function issueSummary(meta) {
    var list = (meta && meta.issues) || [];
    var fixed = list.filter(function (i) { return i.fixed; });
    var open = list.filter(function (i) { return !i.fixed; });
    var people = function (arr) { var s = {}; arr.forEach(function (i) { s[i.ma_nv] = 1; }); return Object.keys(s).length; };
    return { fixed: fixed, open: open, fixedPeople: people(fixed), openPeople: people(open) };
  }

  function selectMonth(key) {
    var sel = $("sheetSelect");
    if (!sel || sel.value === key) return;
    sel.value = key;
    window.displaySheetData();
  }

  function renderOverview() {
    var box = $("v3PayOverview"), body = $("v3PayOverviewBody");
    if (!box || !body) return;
    var list = sheets();
    body.textContent = "";
    if (!list.length) { box.hidden = true; return; }

    var prevNet = null, prevLabel = "";
    list.forEach(function (s) {
      var rows = sheetData()[s.key] || [];
      var meta = (window.globalSheetMeta || {})[s.key] || {};
      var t = totals(rows), iss = issueSummary(meta);
      var netUnsure = iss.open.some(function (i) { return i.field === "thuc_nhan"; });
      var grossUnsure = iss.open.some(function (i) { return i.field === "tong_thu_nhap"; });
      var taxUnsure = iss.open.some(function (i) { return i.field === "thue_tncn"; });
      var amount = function (v, unsure) {
        var td = el("td", "num", unsure ? "Lỗi trong file" : money(v));
        if (unsure) { td.classList.add("is-unsure"); td.title = "Một số ô của tháng này trong file Excel đang báo lỗi nên tổng không tin được"; }
        return td;
      };
      var tr = el("tr");
      tr.setAttribute("data-key", s.key);
      tr.tabIndex = 0;
      tr.setAttribute("role", "button");
      tr.setAttribute("aria-label", "Xem bảng lương tháng " + s.info.label);

      var th = el("th"); th.scope = "row";
      th.appendChild(el("span", "v3-pay-month", "Tháng " + s.info.label));
      tr.appendChild(th);
      tr.appendChild(el("td", "num", String(rows.length)));
      tr.appendChild(amount(t.gross, grossUnsure));
      tr.appendChild(amount(t.tax, taxUnsure));
      tr.appendChild(amount(t.net, netUnsure));

      var delta = el("td", "num v3-pay-delta");
      if (prevNet && t.net && !netUnsure) {
        var pct = (t.net - prevNet) / prevNet * 100;
        delta.textContent = (pct > 0 ? "+" : "") + pct.toFixed(1).replace(".", ",") + "%";
        delta.classList.add(pct > 0.05 ? "is-up" : (pct < -0.05 ? "is-down" : "is-flat"));
        delta.title = "Thực nhận so với tháng " + prevLabel;
      } else delta.textContent = "–";
      tr.appendChild(delta);
      if (!netUnsure && t.net) { prevNet = t.net; prevLabel = s.info.label; }

      var st = el("td");
      var badge;
      if (iss.open.length) badge = el("span", "v3-badge is-danger", iss.openPeople + " NV lỗi");
      else if (iss.fixed.length) badge = el("span", "v3-badge is-info", "Tự tính lại " + iss.fixedPeople + " NV");
      else badge = el("span", "v3-badge is-ok", "Ổn");
      st.appendChild(badge);
      tr.appendChild(st);

      tr.addEventListener("click", function () { selectMonth(s.key); });
      tr.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectMonth(s.key); }
      });
      body.appendChild(tr);
    });

    // Tháng bị thiếu giữa tháng đầu và tháng cuối
    var missing = [];
    var last = list[list.length - 1].info.order;
    for (var o = list[0].info.order; o < last;) {
      var y = Math.floor(o / 100), m = o % 100 + 1;
      if (m > 12) { m = 1; y++; }
      o = y * 100 + m;
      if (o < last && !list.some(function (s) { return s.info.order === o; })) missing.push((m < 10 ? "0" : "") + m + "/" + y);
    }
    var sub = list.length + " tháng lương, từ " + list[0].info.label + " đến " + list[list.length - 1].info.label + ".";
    if (missing.length) sub += " Không có sheet lương tháng " + missing.join(", ") + ".";
    sub += " Bấm vào một tháng để xem chi tiết.";
    $("v3PayOverviewSub").textContent = sub;
    box.hidden = false;
    markActive();
  }

  function markActive() {
    var key = $("sheetSelect") && $("sheetSelect").value;
    document.querySelectorAll("#v3PayOverviewBody tr").forEach(function (tr) {
      var on = tr.getAttribute("data-key") === key;
      tr.classList.toggle("is-active", on);
      if (on) tr.setAttribute("aria-current", "true"); else tr.removeAttribute("aria-current");
    });
  }

  function renderIssues() {
    var box = $("v3PayIssues");
    if (!box) return;
    var key = $("sheetSelect") && $("sheetSelect").value;
    var meta = key && (window.globalSheetMeta || {})[key];
    box.textContent = "";
    if (!meta) { box.hidden = true; return; }
    var info = parseKey(key) || { label: key }, iss = issueSummary(meta);
    var notes = [];

    if (iss.open.length) {
      var d = el("div", "v3-alert is-danger");
      d.appendChild(el("strong", null, "Tháng " + info.label + ": " + iss.open.length + " ô lỗi công thức chưa tự sửa được (" + iss.openPeople + " nhân viên)."));
      var fields = {};
      iss.open.forEach(function (i) { fields[i.label + " " + i.code] = 1; });
      d.appendChild(el("p", null, "Các số liệu này trong file đang báo lỗi nên không dùng được: " + Object.keys(fields).join(", ") +
        ". Mở file Excel, sửa công thức (thường là VLOOKUP sang sheet chấm công) rồi nạp lại."));
      var det = el("details");
      det.appendChild(el("summary", null, "Xem danh sách ô lỗi"));
      var ul = el("ul", "v3-issue-list");
      iss.open.slice(0, 80).forEach(function (i) {
        ul.appendChild(el("li", null, "Dòng " + i.row + " · " + i.ma_nv + (i.ten_nv ? " – " + i.ten_nv : "") + " · " + i.label + ": " + i.code + (i.skipped ? " (dòng bị bỏ qua)" : "")));
      });
      if (iss.open.length > 80) ul.appendChild(el("li", null, "… và " + (iss.open.length - 80) + " ô khác"));
      det.appendChild(ul);
      d.appendChild(det);
      box.appendChild(d);
    }
    if (iss.fixed.length) {
      var f = el("div", "v3-alert is-info");
      f.appendChild(el("strong", null, "Đã tự tính lại Thuế TNCN và Thực nhận cho " + iss.fixedPeople + " nhân viên."));
      f.appendChild(el("p", null, "Các ô này trong file báo " + Array.from(new Set(iss.fixed.map(function (i) { return i.code; }))).join(", ") +
        " (hàm IFS không chạy trên bản Excel đã lưu file). Công cụ tính lại theo đúng biểu thuế lũy tiến trong công thức của file; nên đối chiếu trước khi chi lương."));
      box.appendChild(f);
    }
    if (meta.extraIncomeLabels && meta.extraIncomeLabels.length) {
      notes.push("Cột " + meta.extraIncomeLabels.map(function (s) { return "“" + s.replace(/\s+/g, " ") + "”"; }).join(", ") + " được cộng vào mục Khác.");
    }
    if (!meta.hasStdDaysColumn) notes.push("Mẫu tháng này không có cột Ngày công chuẩn; dùng " + meta.stdDays + " ngày ghi trong sheet.");
    if (meta.legacy) notes.push("Không nhận diện được tiêu đề cột, đang đọc theo vị trí cột của mẫu T10/2026. Hãy kiểm tra kỹ số liệu.");
    if (notes.length) {
      var n = el("div", "v3-alert is-note");
      notes.forEach(function (t) { n.appendChild(el("p", null, t)); });
      box.appendChild(n);
    }
    box.hidden = !box.children.length;
  }

  var origFetch = window.doFetchEmployeesExcel;
  window.doFetchEmployeesExcel = async function () {
    var result = await origFetch.apply(this, arguments);
    renderOverview();
    // Tự chọn tháng mới nhất để có ngay kết quả (vẫn đổi được bằng bảng tổng quan hoặc ô chọn)
    var list = sheets(), sel = $("sheetSelect");
    if (list.length && sel && !sel.value) selectMonth(list[list.length - 1].key);
    return result;
  };
  var origDisplay = window.displaySheetData;
  window.displaySheetData = function () {
    var r = origDisplay.apply(this, arguments);
    markActive();
    renderIssues();
    return r;
  };
})();
