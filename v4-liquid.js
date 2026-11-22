/* V4 — LIQUID GLASS. Chạy SAU app.js, nạp trong index.html. Chỉ thêm hiệu ứng, không đổi logic dữ liệu.
   1. Khúc xạ mép kính (chỉ Chromium hỗ trợ backdrop-filter: url(#svg)): mỗi bề mặt nổi có 1 bản đồ dịch chuyển
      vẽ theo đúng kích thước + bo góc của nó -> nền phía sau bị bẻ cong dọc mép như thấu kính.
   2. Ánh sáng phản chiếu (specular) đi theo con trỏ / ngón tay.
   3. Viên kính trượt + co giãn trong nhóm nút chọn (.inv-seg, .acc-seg-wrap).
   4. Thanh trên thu gọn khi cuộn xuống.
   Người dùng bật "giảm độ trong suốt" -> tắt 1, 2; bật "giảm chuyển động" -> tắt hiệu ứng trượt/co giãn. */
(function () {
  "use strict";
  var body = document.body;
  if (!body.classList.contains("v4")) return;

  var mq = function (q) { return !!(window.matchMedia && window.matchMedia(q).matches); };
  var reduceTransparency = mq("(prefers-reduced-transparency: reduce)");
  var reduceMotion = mq("(prefers-reduced-motion: reduce)");
  var brands = (navigator.userAgentData && navigator.userAgentData.brands) || [];
  // userAgentData chỉ có trên HTTPS -> dự phòng bằng UA ("Chrome/" có ở Chrome, Edge, Opera, Cốc Cốc; không có ở Safari, Firefox, Chrome iOS)
  var isChromium = brands.some(function (b) { return /Chromium/i.test(b.brand); }) || /Chrome\//.test(navigator.userAgent);
  var canRefract = isChromium && !reduceTransparency;

  body.classList.add("lg");
  if (canRefract) body.classList.add("lg-refract");
  if (reduceTransparency) body.classList.add("lg-flat");

  /* ---------------- 1. KHÚC XẠ MÉP KÍNH ---------------- */
  var REFRACT_SEL = ".v3-top, .v3-back, .v3-chip, .lg-seg-pill, .gdt-modal-box, .trade-dlg";
  var SVGNS = "http://www.w3.org/2000/svg";
  var defs = null, uid = 0, filters = new Map();

  function ensureDefs() {
    if (defs) return defs;
    var svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.style.position = "absolute";
    defs = document.createElementNS(SVGNS, "defs");
    svg.appendChild(defs);
    body.appendChild(svg);
    return defs;
  }

  // Bản đồ dịch chuyển cho hình chữ nhật bo góc: R/G = hướng pháp tuyến hướng vào trong * độ mạnh,
  // độ mạnh tăng dần khi càng gần mép (trong dải "band" px). Giữa tấm kính = 128 (không dịch chuyển).
  function lensMap(w, h, r, band) {
    var k = 0.5;                                   // vẽ ở nửa độ phân giải, feImage tự kéo giãn
    var cw = Math.max(2, Math.round(w * k)), ch = Math.max(2, Math.round(h * k));
    var c = document.createElement("canvas");
    c.width = cw; c.height = ch;
    var ctx = c.getContext("2d");
    var img = ctx.createImageData(cw, ch), d = img.data;
    var hw = w / 2, hh = h / 2;
    r = Math.min(r, hw, hh);
    for (var j = 0; j < ch; j++) {
      for (var i = 0; i < cw; i++) {
        var px = (i + 0.5) / k - hw, py = (j + 0.5) / k - hh;
        var ax = Math.abs(px), ay = Math.abs(py);
        var qx = ax - (hw - r), qy = ay - (hh - r);
        var nx, ny, inside;
        if (qx > 0 && qy > 0) {
          var len = Math.sqrt(qx * qx + qy * qy) || 1;
          inside = r - len; nx = qx / len; ny = qy / len;
        } else if (qx > qy) {
          inside = r - qx; nx = 1; ny = 0;
        } else {
          inside = r - qy; nx = 0; ny = 1;
        }
        nx *= px < 0 ? -1 : 1; ny *= py < 0 ? -1 : 1;   // pháp tuyến hướng ra ngoài
        var t = inside >= band ? 0 : 1 - Math.max(0, inside) / band;
        var m = t * t;                                  // mạnh dần về phía mép
        var o = (j * cw + i) * 4;
        d[o] = 128 - nx * m * 127;                      // lấy mẫu dịch vào phía trong -> mép như bị phóng to, bẻ cong
        d[o + 1] = 128 - ny * m * 127;
        d[o + 2] = 128;
        d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL();
  }

  function radiusOf(el, w, h) {
    var v = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    return Math.min(v, w / 2, h / 2);
  }

  function buildFilter(el) {
    var w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
    if (w < 8 || h < 8) return;
    var r = Math.round(radiusOf(el, w, h));
    var rec = filters.get(el);
    var key = w + "x" + h + "r" + r;
    if (rec && rec.key === key) return;
    if (!rec) {
      var id = "lg-f" + (++uid);
      var f = document.createElementNS(SVGNS, "filter");
      f.setAttribute("id", id);
      f.setAttribute("filterUnits", "userSpaceOnUse");
      f.setAttribute("color-interpolation-filters", "sRGB");
      var im = document.createElementNS(SVGNS, "feImage");
      im.setAttribute("result", "map");
      im.setAttribute("preserveAspectRatio", "none");
      var dm = document.createElementNS(SVGNS, "feDisplacementMap");
      dm.setAttribute("in", "SourceGraphic");
      dm.setAttribute("in2", "map");
      dm.setAttribute("xChannelSelector", "R");
      dm.setAttribute("yChannelSelector", "G");
      f.appendChild(im); f.appendChild(dm);
      ensureDefs().appendChild(f);
      rec = { id: id, f: f, im: im, dm: dm };
      filters.set(el, rec);
      el.style.setProperty("--lg-filter", "url(#" + id + ")");
    }
    rec.key = key;
    var band = Math.min(22, h / 2, w / 2);
    rec.f.setAttribute("x", 0); rec.f.setAttribute("y", 0);
    rec.f.setAttribute("width", w); rec.f.setAttribute("height", h);
    rec.im.setAttribute("x", 0); rec.im.setAttribute("y", 0);
    rec.im.setAttribute("width", w); rec.im.setAttribute("height", h);
    rec.im.setAttribute("href", lensMap(w, h, r, band));
    rec.dm.setAttribute("scale", Math.round(Math.min(36, band * 1.6)));
  }

  var ro = canRefract ? new ResizeObserver(function (entries) {
    entries.forEach(function (e) { buildFilter(e.target); });
  }) : null;
  function watchRefract(root) {
    if (!ro) return;
    (root.matches && root.matches(REFRACT_SEL) ? [root] : []).concat(Array.prototype.slice.call(root.querySelectorAll ? root.querySelectorAll(REFRACT_SEL) : []))
      .forEach(function (el) {
        if (el.__lgWatched) return;
        el.__lgWatched = true;
        ro.observe(el);
      });
  }

  /* ---------------- 2. ÁNH SÁNG THEO CON TRỎ ---------------- */
  var SHINE_SEL = ".v3-top, .v3-back, .v3-chip, .v3-task, .card, button, .gdt-modal-box, .trade-dlg";
  var shineEl = null, raf = 0, lastEv = null;
  function paintShine() {
    raf = 0;
    if (!shineEl || !lastEv) return;
    var b = shineEl.getBoundingClientRect();
    shineEl.style.setProperty("--lg-x", ((lastEv.clientX - b.left) / b.width * 100).toFixed(1) + "%");
    shineEl.style.setProperty("--lg-y", ((lastEv.clientY - b.top) / b.height * 100).toFixed(1) + "%");
  }
  if (!reduceTransparency) {
    document.addEventListener("pointermove", function (e) {
      var el = e.target.closest && e.target.closest(SHINE_SEL);
      if (el !== shineEl) {
        if (shineEl) shineEl.classList.remove("lg-lit");
        shineEl = el;
        if (el) el.classList.add("lg-lit");
      }
      lastEv = e;
      if (el && !raf) raf = requestAnimationFrame(paintShine);
    }, { passive: true });
    document.addEventListener("pointerleave", function () {
      if (shineEl) shineEl.classList.remove("lg-lit");
      shineEl = null;
    });
  }

  /* ---------------- 3. VIÊN KÍNH TRƯỢT TRONG NHÓM NÚT CHỌN ---------------- */
  var SEG_SEL = ".inv-seg, .acc-seg-wrap";
  function placePill(seg) {
    var pill = seg.__lgPill;
    var act = seg.querySelector(":scope > button.active");
    if (!act || !act.offsetWidth) { pill.style.opacity = "0"; return; }
    var x = act.offsetLeft, y = act.offsetTop, w = act.offsetWidth, h = act.offsetHeight;
    var prev = seg.__lgPos;
    seg.__lgPos = { x: x, y: y, w: w, h: h };
    pill.style.width = w + "px";
    pill.style.height = h + "px";
    pill.style.transform = "translate(" + x + "px," + y + "px)";
    pill.style.opacity = "1";
    // Co giãn như giọt nước khi trượt sang vị trí mới
    if (prev && !reduceMotion && (prev.x !== x || prev.y !== y) && pill.animate) {
      var dir = x > prev.x ? 1 : -1;
      pill.animate([
        { transform: "translate(" + prev.x + "px," + prev.y + "px) scale(1,1)", width: prev.w + "px" },
        { transform: "translate(" + ((prev.x + x) / 2 - dir * 4) + "px," + ((prev.y + y) / 2) + "px) scale(1.12,0.86)", width: Math.max(prev.w, w) + "px", offset: 0.45 },
        { transform: "translate(" + x + "px," + y + "px) scale(1,1)", width: w + "px" }
      ], { duration: 460, easing: "cubic-bezier(0.32, 0.72, 0, 1)" });
    }
  }
  function setupSeg(seg) {
    if (seg.__lgPill) return;
    var pill = document.createElement("span");
    pill.className = "lg-seg-pill";
    pill.setAttribute("aria-hidden", "true");
    seg.insertBefore(pill, seg.firstChild);
    seg.__lgPill = pill;
    seg.classList.add("lg-seg");
    // Chỉ nghe đổi class/hidden của các nút (không nghe "style" vì chính viên kính đổi style -> lặp vô hạn)
    new MutationObserver(function (list) {
      if (list.some(function (m) { return m.target !== pill; })) placePill(seg);
    }).observe(seg, { subtree: true, attributes: true, attributeFilter: ["class", "hidden"] });
    new ResizeObserver(function () { seg.__lgPos = null; placePill(seg); }).observe(seg);
    placePill(seg);
    watchRefract(pill);
  }

  /* ---------------- 4. THANH TRÊN THU GỌN KHI CUỘN ---------------- */
  var scroller = document.getElementById("v3Scroll");
  if (scroller) {
    var ticking = false;
    scroller.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        body.classList.toggle("lg-scrolled", scroller.scrollTop > 24);
      });
    }, { passive: true });
  }

  /* ---------------- KHỞI ĐỘNG + THEO DÕI PHẦN TỬ MỚI (app.js vẽ thêm nội dung động) ---------------- */
  var SKIP = /^(TR|TD|TH|TBODY|THEAD|TFOOT|OPTION|SPAN|B|I|SMALL|BR)$/;   // bảng lớn: không cần quét từng dòng
  function scan(root) {
    if (!root.querySelectorAll || SKIP.test(root.tagName)) return;
    watchRefract(root);
    if (root.matches && root.matches(SEG_SEL)) setupSeg(root);
    root.querySelectorAll(SEG_SEL).forEach(setupSeg);
  }
  function start() {
    scan(body);
    new MutationObserver(function (list) {
      list.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) scan(n); }); });
    }).observe(body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
