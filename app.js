// =======================================================
// THUẬT TOÁN TÍNH ÂM LỊCH CỦA HỒ NGỌC ĐỨC (Múi giờ +7)
// =======================================================
const PI = Math.PI;

function jdFromDate(dd, mm, yyyy) {
    let a, b, c, e, f;
    if (mm < 3) { yyyy--; mm += 12; }
    a = Math.floor(yyyy / 100);
    b = Math.floor(a / 4);
    c = 2 - a + b;
    e = Math.floor(365.25 * (yyyy + 4716));
    f = Math.floor(30.6001 * (mm + 1));
    return dd + c + e + f - 1524.5;
}

function jdToDate(jd) {
    let a, b, c, d, e, m, day, month, year;
    let z, f, alpha;
    z = Math.floor(jd + 0.5);
    f = (jd + 0.5) - z;
    if (z < 2299161) { a = z; } 
    else {
        alpha = Math.floor((z - 1867216.25) / 36524.25);
        a = z + 1 + alpha - Math.floor(alpha / 4);
    }
    b = a + 1524;
    c = Math.floor((b - 122.1) / 365.25);
    d = Math.floor(365.25 * c);
    e = Math.floor((b - d) / 30.6001);
    day = b - d - Math.floor(30.6001 * e) + f;
    month = (e < 14) ? (e - 1) : (e - 13);
    year = (month > 2) ? (c - 4716) : (c - 4715);
    return [day, month, year];
}

function getSunLongitude(jdn, timeZone) {
    let T = (jdn - 2451545.0 - timeZone / 24.0) / 36525.0;
    let T2 = T * T;
    let dr = PI / 180.0;
    let L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T2;
    let M = 357.52911 + 35999.05029 * T - 0.0001537 * T2;
    let e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T2;
    let C = (1.914602 - 0.004817 * T - 0.000014 * T2) * Math.sin(M * dr) +
            (0.019993 - 0.000101 * T) * Math.sin(2 * M * dr) +
            0.000289 * Math.sin(3 * M * dr);
    let theta = L0 + C;
    return theta - 360.0 * Math.floor(theta / 360.0);
}

function getNewMoonDay(k, timeZone) {
    let T = k / 1236.85;
    let T2 = T * T;
    let T3 = T2 * T;
    let dr = PI / 180.0;
    let Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
    let Jd2 = Jd1 + 0.1734 - 0.000393 * T * Math.sin(145.1 * dr) + 0.0021 * Math.sin(199.5 * dr);
    let M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
    let Mprime = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
    let F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
    let deltaJd = (0.1734 - 0.000393 * T) * Math.sin(M * dr) +
                  0.0021 * Math.sin(2 * M * dr) - 0.4068 * Math.sin(Mprime * dr) +
                  0.0161 * Math.sin(2 * Mprime * dr) - 0.0004 * Math.sin(3 * Mprime * dr) +
                  0.0104 * Math.sin(2 * F * dr) - 0.0051 * Math.sin(M * dr + Mprime * dr) -
                  0.0074 * Math.sin(M * dr - Mprime * dr) + 0.0004 * Math.sin(2 * F * dr + M * dr) -
                  0.0004 * Math.sin(2 * F * dr - M * dr) - 0.0006 * Math.sin(2 * F * dr + Mprime * dr) +
                  0.0010 * Math.sin(2 * F * dr - Mprime * dr) + 0.0005 * Math.sin(M * dr + 2 * Mprime * dr);
    return Math.floor(Jd1 + deltaJd + 0.5 + timeZone / 24.0);
}

function getLunarMonth11(yy, timeZone) {
    let off = yy - 1900;
    let k = Math.floor(off * 12.3685);
    let nm = getNewMoonDay(k, timeZone);
    let sunLong = getSunLongitude(nm, timeZone);
    if (sunLong >= 9) nm = getNewMoonDay(k - 1, timeZone);
    return nm;
}

function getLeapMonthOffset(a11, timeZone) {
    let k, arc, i, leapMonth = 0, isLeap = false;
    let last = a11;
    arc = getSunLongitude(last, timeZone);
    for (i = 1; i <= 14; i++) {
        let next = getNewMoonDay(1, timeZone); 
    }
    return leapMonth;
}

function convertSolar2Lunar(dd, mm, yyyy, timeZone) {
    let jdn = jdFromDate(dd, mm, yyyy);
    let k = Math.floor((jdn - 2415021.076998695) / 29.530588853);
    let monthStart = getNewMoonDay(k + 1, timeZone);
    if (monthStart > jdn) monthStart = getNewMoonDay(k, timeZone);
    let a11 = getLunarMonth11(yyyy, timeZone);
    let b11 = a11;
    if (a11 >= monthStart) {
        a11 = getLunarMonth11(yyyy - 1, timeZone);
    } else {
        b11 = getLunarMonth11(yyyy + 1, timeZone);
    }
    let lunarDay = Math.floor(jdn + 0.5) - monthStart + 1;
    let diff = Math.floor((monthStart - a11) / 29);
    let lunarMonth = diff + 11;
    let lunarYear = yyyy;
    if (lunarMonth > 12) { lunarMonth -= 12; }
    if (lunarMonth < 11) { lunarYear++; }
    
    return { 
        lunarDay: lunarDay, 
        lunarMonth: lunarMonth, 
        lunarYear: lunarYear 
    };
}

// =======================================================
// RENDER LỊCH TUẦN LÊN HEADER (Bắt đầu từ Thứ 2)
// =======================================================
function renderWeeklyCalendar() {
    const wrap = document.getElementById("calDaysWrap");
    const monthText = document.getElementById("calMonthText");
    const lunarText = document.getElementById("calLunarText");
    
    if (!wrap) return;

    const today = new Date();
    const currentDayOfWeek = today.getDay(); // 0: CN, 1: T2, ..., 6: T7
    
    // TÍNH TOÁN LÙI VỀ THỨ 2 ĐẦU TUẦN
    const offset = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1;
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - offset);

    // Mảng thứ tự bắt đầu từ Thứ 2
    const daysOfWeek = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
    let html = "";

    for (let i = 0; i < 7; i++) {
        const d = new Date(startOfWeek);
        d.setDate(startOfWeek.getDate() + i);
        
        const isToday = d.toDateString() === today.toDateString();
        
        // Vì mảng bắt đầu từ T2 (index 0), nên T7 là index 5 và CN là index 6
        const isWeekend = i === 5 || i === 6; 
        
        const dateNum = d.getDate();
        const monthNum = d.getMonth() + 1;
        const yearNum = d.getFullYear();
        
        // GỌI HÀM ÂM LỊCH CHUẨN (Múi giờ +7)
        const lunar = convertSolar2Lunar(dateNum, monthNum, yearNum, 7);
        
        if (isToday) {
            if (monthText) monthText.innerText = `Tháng ${monthNum} - ${yearNum}`;
            if (lunarText) lunarText.innerText = `Âm Lịch tháng ${lunar.lunarMonth}`;
        }

        let classes = "cal-day-block";
        if (isToday) classes += " active";
        if (isWeekend) classes += " weekend"; // Đánh dấu màu pastel cho T7, CN

        html += `
            <div class="${classes}">
                <div class="cal-dow">${daysOfWeek[i]}</div>
                <div class="cal-date">${dateNum}</div>
                <div class="cal-lunar-date">${lunar.lunarDay}</div>
                <div class="cal-dot"></div>
            </div>
        `;
    }
    
    wrap.innerHTML = html;
}

const FIELDS = [
  ["order_code", "Mã đơn/KH"], ["system", "Hệ thống"], ["lead_email", "Email KH"],
  ["lead_phone", "SĐT KH"], ["lead_cccd", "Số CCCD"], ["username", "Username"],
  ["users_name", "Họ tên"], ["orders_amount", "Số tiền"], ["einvoice_created_at", "Ngày TT"],
  ["invoice_number", "Số hóa đơn"], ["ref_username", "Ref user"], ["ref_name", "Ref tên"]
];

let currentColumns = [
  { key: "status", label: "Trạng thái", visible: true },
  ...FIELDS.map(f => ({ key: f[0], label: f[1], visible: true }))
];
let bulkData = []; 

function getToken() { 
  try { return localStorage.getItem("sepay_access_token") || ""; } catch(e) { return ""; } 
}

// Cập nhật giao diện ô mật khẩu / nút theo trạng thái đã lưu hay chưa.
// showInput = true  -> hiện ô nhập để gõ/đổi mật khẩu
// showInput = false -> ẩn ô nhập, nhường chỗ cho widget lịch, đổi nút thành "Đổi mật khẩu"
function setAuthUIState(showInput) {
  const input = document.getElementById("accessToken");
  const btn = document.getElementById("saveTokenBtn");
  if (!input || !btn) return;

  if (showInput) {
    document.body.classList.remove("has-token");
    input.style.display = "";
    input.value = "";
    input.placeholder = "Mật khẩu hệ thống";
    btn.innerText = "Lưu khóa";
    btn.onclick = saveToken;
  } else {
    document.body.classList.add("has-token");
    input.style.display = "none";
    btn.innerText = "Đổi mật khẩu";
    btn.onclick = function () { setAuthUIState(true); };
  }
}

function saveToken() {
  const token = document.getElementById("accessToken").value.trim();
  if (!token) { return; } // Không lưu chuỗi rỗng
  try {
    localStorage.setItem("sepay_access_token", token);
    setAuthUIState(false);
  } catch(e) { alert("Không thể lưu mật khẩu do trình duyệt chặn."); }
}

/* ---------------- LOGIC GIAO DIỆN & SIDEBAR ---------------- */
function toggleSidebar() {
  const sidebar = document.getElementById("appSidebar");
  sidebar.classList.toggle("collapsed");
  const isCollapsed = sidebar.classList.contains("collapsed");
  localStorage.setItem("sidebar_collapsed", isCollapsed ? "true" : "false");
}

// Danh sách toàn bộ theme hiện có. Mỗi theme khai báo:
//  - class: class gắn lên <body> ("" nghĩa là theme mặc định, không cần class)
//  - flatpickr: bảng màu lịch flatpickr dùng kèm ("light" hoặc "dark")
const THEMES = {
  "dark":        { class: "",                 flatpickr: "dark"  },
  "light":       { class: "light-mode",        flatpickr: "light" },
  "teal":        { class: "theme-teal",         flatpickr: "light" },
  "earth-dark":  { class: "theme-earth-dark",   flatpickr: "dark"  },
  "coral-dark":  { class: "theme-coral-dark",   flatpickr: "dark"  },
  "lavender":    { class: "theme-lavender",     flatpickr: "light" },
  "accounting":  { class: "theme-accounting",   flatpickr: "light" },
};
const THEME_CLASSES = Object.values(THEMES).map(t => t.class).filter(Boolean);

function setTheme(themeName) {
  if (!THEMES[themeName]) themeName = "dark";
  const cfg = THEMES[themeName];

  // Gỡ hết class theme cũ trước khi gắn theme mới (không đụng tới các class khác như "has-token").
  document.body.classList.remove(...THEME_CLASSES);
  if (cfg.class) document.body.classList.add(cfg.class);

  const flatpickrTheme = document.getElementById("flatpickr-theme");
  if (flatpickrTheme) {
    flatpickrTheme.href = "https://cdn.jsdelivr.net/npm/flatpickr/dist/themes/" + cfg.flatpickr + ".css";
  }

  const select = document.getElementById("themeSelect");
  if (select) select.value = themeName;

  try { localStorage.setItem("app_theme", themeName); } catch(e) {}
}
/* ----------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  try {
    setAuthUIState(!getToken());
  } catch(e) {}

  // Đọc cấu hình giao diện từ bộ nhớ
  try {
    const isCollapsed = localStorage.getItem("sidebar_collapsed") === "true";
    if (isCollapsed) document.getElementById("appSidebar").classList.add("collapsed");

    // Tương thích ngược: người dùng cũ chỉ có "light" hoặc "dark" trong localStorage,
    // người dùng mới có thể đã chọn "teal" / "earth-dark" / "coral-dark".
    const savedTheme = localStorage.getItem("app_theme");
    setTheme(savedTheme || "light");
  } catch(e) { setTheme("light"); }

  fetch("/api/index").then(r => r.json()).then(d => {
    if (d) {
      // Ẩn authCard nếu không yêu cầu mật khẩu hệ thống
      if (d.auth_required === false) {
        const authCard = document.getElementById("authCard");
        if (authCard) authCard.classList.add("hidden");
      }
      
      // Tự động điền tài khoản eHoadon từ Vercel Environment Variables
      if (d.ehoadon_username) {
        document.getElementById("ehoadonUsername").value = d.ehoadon_username;
      }
      if (d.ehoadon_password) {
        document.getElementById("ehoadonPassword").value = d.ehoadon_password;
      }
    }
  }).catch(() => {});
  
  initColumnSelector();

  // Khởi tạo Flatpickr
  // disableMobile: true -> BẮT BUỘC dùng giao diện lịch tùy chỉnh của Flatpickr trên mọi thiết bị.
  // Nếu để mặc định (false), trên điện thoại/tablet Flatpickr sẽ tự chuyển sang date-picker
  // gốc của hệ điều hành/trình duyệt (mất hết style, hiển thị dạng mm/dd/yyyy như báo lỗi).
  //
  // Cả 3 cặp Từ ngày/Đến ngày (giao dịch, GDT, hóa đơn nội bộ) đều dùng chung 1 lịch range
  // gộp vào ô hiển thị "dd/mm/yyyy-dd/mm/yyyy", đồng bộ ngược ra 2 input ẩn from/to để các
  // hàm xử lý cũ (đọc .value của <id>DateFrom/<id>DateTo) không cần sửa gì thêm.
  function initRangeDatePicker(rangeInputId, fromInputId, toInputId) {
    const elRange = document.getElementById(rangeInputId);
    const elFrom = document.getElementById(fromInputId);
    const elTo = document.getElementById(toInputId);
    if (!elRange || !elFrom || !elTo || typeof flatpickr === 'undefined') return;
    flatpickr(elRange, {
      mode: "range",
      dateFormat: "d/m/Y",
      rangeSeparator: "-",   // ô hiển thị ra đúng dạng 01/01/2026-29/07/2026, không khoảng trắng
      locale: "vn",
      showMonths: 2,         // hiện 2 tháng song song để dễ chọn khoảng dài
      allowInput: true,
      disableMobile: true,
      onChange: function (selectedDates, dateStr, instance) {
        elFrom.value = selectedDates.length >= 1 ? instance.formatDate(selectedDates[0], "d/m/Y") : "";
        elTo.value = selectedDates.length === 2 ? instance.formatDate(selectedDates[1], "d/m/Y") : "";
      }
    });
  }

  initRangeDatePicker('txDateRange', 'txDateFrom', 'txDateTo');
  initRangeDatePicker('gdtDateRange', 'gdtDateFrom', 'gdtDateTo');
  initRangeDatePicker('invDateRange', 'invDateFrom', 'invDateTo');
  initRangeDatePicker('ehoadonDateRange', 'ehoadonFromDate', 'ehoadonToDate');

  // RENDER LỊCH TUẦN LÊN HEADER
  renderWeeklyCalendar();
  // Tự động thêm 1 dòng điền hàng hóa trống sẵn cho tab eHoadon
  addEhoadonItemRow();
});

function switchTab(which) {
  const tabs = ["bulk", "transaction", "invoice", "gdt", "employee", "air", "ehoadon", "vax1"];
  
  tabs.forEach(tab => {
    const idSuffix = tab.charAt(0).toUpperCase() + tab.slice(1);
    const contentEl = document.getElementById("tab" + idSuffix);
    const btnEl = document.getElementById("tab" + idSuffix + "Btn");
    
    if (contentEl) contentEl.classList.toggle("hidden", which !== tab);
    if (btnEl) btnEl.classList.toggle("active", which === tab);
  });

  // Bắt sự kiện tải tài khoản ngân hàng khi vào tab transaction
  if (which === "transaction") {
    const dropdownEl = document.getElementById("txBankAccountIdDropdown");
    // Nếu dropdown trống (chưa có checkbox nào) thì mới tải dữ liệu
    if (dropdownEl && dropdownEl.children.length === 0) {
      loadBankAccounts();
    }
  }
}

// Chuyển đổi Thời gian
function formatTxDate(dateString) {
  if (!dateString) return "";
  const [date, time] = dateString.split(" ");
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y} ${time}`;
}

// Chuẩn hóa ngày về dạng dd/mm/yyyy (luôn 2 chữ số ngày/tháng, bỏ giờ) - dùng khi copy sang Excel/Sheets
function formatDateOnly(dateString) {
  if (!dateString) return "";
  // Bỏ phần giờ nếu có ("YYYY-MM-DD HH:mm:ss" hoặc "dd/MM/yyyy HH:mm")
  const date = String(dateString).trim().split(/[\sT]/)[0];
  const pad2 = (v) => String(v).padStart(2, "0");

  // Đã là dd/MM/yyyy (API eInvoice v1 trả arisingDate dạng này)
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date)) {
    const [d, m, y] = date.split("/");
    return `${pad2(d)}/${pad2(m)}/${y}`;
  }
  // ISO YYYY-MM-DD (transaction_date từ SePay)
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split("-");
    return `${pad2(d)}/${pad2(m)}/${y}`;
  }
  return date;
}

function timeAgo(dateString) {
  if (!dateString) return "";
  const txDate = new Date(dateString.replace(" ", "T") + "+07:00");
  const now = new Date();
  const diffMs = now - txDate;
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return `Vừa xong`;
  if (diffMins < 60) return `${diffMins} phút trước`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} giờ trước`;
  return `${Math.floor(diffHours / 24)} ngày trước`;
}

// Trả về HTML icon ngân hàng: dùng logo thật cho ACB / MB, ngân hàng khác dùng badge chữ cái như cũ
function getBankIconHtml(bankBrandName) {
  const name = (bankBrandName || "").toLowerCase();
  let logoUrl = "";
  if (name.includes("acb")) {
    logoUrl = "https://my.sepay.vn/assets/images/banklogo/acb-icon.png";
  } else if (name.includes("mb")) {
    logoUrl = "https://my.sepay.vn/assets/images/banklogo/mbbank-icon.png";
  }
  if (logoUrl) {
    return `<img src="${logoUrl}" alt="${escapeHtml(bankBrandName || "")}" class="bank-logo-img">`;
  }
  const bankLetter = bankBrandName ? bankBrandName.charAt(0) : "B";
  return `<span class="bank-icon">${escapeHtml(bankLetter)}</span>`;
}

// Copy riêng lẻ nội dung giao dịch của 1 dòng khi bấm vào ô "Nội dung"
function copyTxContentByIndex(i) {
  try {
    const tx = currentTxListData[i];
    if (!tx) return;
    const text = tx.transaction_content || "";
    const cell = document.getElementById(`tx-content-${i}`);
    navigator.clipboard.writeText(text).then(() => {
      if (cell) {
        const original = cell.innerHTML;
        cell.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-check-icon lucide-check-check"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg> Đã copy nội dung!';
        setTimeout(() => { cell.innerHTML = original; }, 1200);
      }
    }).catch(() => { alert("Không thể copy nội dung. Vui lòng thử lại."); });
  } catch (e) {
    alert("Đã xảy ra lỗi khi copy: " + e.message);
  }
}

/* Các hàm Kéo Thả & Tra cứu Bulk */
let dragSrcEl = null;
function initColumnSelector() {
  const container = document.getElementById('colSelector');
  if (!container) return;
  container.innerHTML = '';
  currentColumns.forEach(col => {
    const label = document.createElement('label');
    label.className = 'checkbox-item'; label.draggable = true; label.dataset.key = col.key;
    label.addEventListener('dragstart', function(e) { dragSrcEl = this; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', this.dataset.key); this.style.opacity = '0.4'; });
    label.addEventListener('dragover', function(e) { if (e.preventDefault) e.preventDefault(); e.dataTransfer.dropEffect = 'move'; return false; });
    label.addEventListener('dragenter', function(e) { this.classList.add('over'); });
    label.addEventListener('dragleave', function(e) { this.classList.remove('over'); });
    label.addEventListener('drop', function(e) {
      if (e.stopPropagation) e.stopPropagation();
      if (dragSrcEl !== this) {
        const draggedKey = dragSrcEl.dataset.key; const targetKey = this.dataset.key;
        const draggedIdx = currentColumns.findIndex(c => c.key === draggedKey);
        const targetIdx = currentColumns.findIndex(c => c.key === targetKey);
        const [draggedItem] = currentColumns.splice(draggedIdx, 1);
        currentColumns.splice(targetIdx, 0, draggedItem);
        initColumnSelector(); renderBulkTable();
      }
      return false;
    });
    label.addEventListener('dragend', function(e) { this.style.opacity = '1'; document.querySelectorAll('.checkbox-item').forEach(item => item.classList.remove('over')); });
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = col.key; cb.checked = col.visible;
    cb.addEventListener('change', (e) => { col.visible = e.target.checked; renderBulkTable(); });
    label.innerHTML = `<span class="drag-handle">☰</span>`; label.appendChild(cb); label.appendChild(document.createTextNode(' ' + col.label)); container.appendChild(label);
  });
}

function renderBulkTable() {
  const thead = document.getElementById("bulkThead"); const tbody = document.getElementById("bulkTbody");
  if (!thead || !tbody) return;
  let theadHTML = '<tr>'; currentColumns.forEach(col => { if (col.visible) theadHTML += `<th>${col.label}</th>`; }); theadHTML += '</tr>';
  thead.innerHTML = theadHTML; tbody.innerHTML = ''; bulkData.forEach(rowObj => { appendRowToDOM(rowObj, tbody); });
}

let globalSheetsData = {};
let globalAttendanceData = {}; // key: TMMYYYY → { days, weekdays, rows, sourceSheet }
let currentBankTransferRows = [];
let currentTxListData = []; // Lưu dữ liệu gốc (đã gộp thông tin KH/hóa đơn) của bảng Kiểm tra giao dịch SePay v2 để phục vụ nút Copy
let currentBankTransferContent = "";
let accActiveTab = 'luongthuong'; // 'luongthuong' | 'bhxh' | 'bhxhnld'
let empMainTab = 'luong'; // 'luong' | 'dinhkhoan' | 'chuyenkhoan' | 'chamcong' | 'kiemtra' | 'congthuc'
let bankGroupsData = {};
let bankActiveTab = '';
let gdtLastInvoices = []; // Danh sách hóa đơn thô (từ API gdt_invoice) để mở chi tiết khi bấm dòng
let gdtLastCreds = null;  // { username, password, is_purchase } dùng để gọi lại API lấy chi tiết hóa đơn
let gdtLastToken = null;  // Token đăng nhập GDT, dùng lại khi tải XML / chi tiết
let gdtDetailIdx = null;  // Index hóa đơn đang mở trong popup chi tiết

// --- eHoadon (tạo hóa đơn tự động) ---
let ehoadonCookies = null;       // Cookie/VIEWSTATE phiên đăng nhập eHoadon (server không giữ state giữa các lần gọi)
let ehoadonBuyerSuggestions = []; // Kết quả tìm kiếm khách hàng gần nhất
let ehoadonSelectedBuyer = null;  // Khách hàng đã chọn để tạo hóa đơn
let ehoadonCustomsData = null;    // Dữ liệu JSON đọc được từ file tờ khai hải quan (dùng để ghép nối vào hóa đơn sau này)

function removeVietnameseDiacritics(str) {
  if (!str) return "";
  let s = String(str);
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/đ/g, "d").replace(/Đ/g, "D");
  return s;
}

// =======================================================
// BẢNG LƯƠNG: NHẬN DIỆN CỘT THEO TIÊU ĐỀ
// Mẫu bảng lương đổi qua các tháng (T02 / T03–T06 / T07–T08 / T10… lệch cột khác nhau).
// Tìm dòng tiêu đề có "MSNV", đọc dòng đó + dòng dưới (tiêu đề con) để biết cột nào là gì.
// Không nhận diện đủ cột bắt buộc -> trả về vị trí cố định của mẫu T10/2026 (hành vi cũ).
// =======================================================
const PAYROLL_LEGACY_COLS = {
  ma_nv: 1, ten_nv: 2, luong_cb: 7, ngay_cong_tt: 9, ngay_cong_chuan: 10, ngay_cong_hl: 11,
  trach_nhiem: 12, trang_phuc: 13, com_trua: 14, bhxh: 15, hoa_hong: 16, thuong_dong_gop: 17,
  luong_phep: 18, khac: 19, tong_thu_nhap: 20, bhxh_tru: 21, bhyt_tru: 22, bhtn_tru: 23, cd_tru: 24,
  tong_khau_tru: 25, tntt: 27, thue_tncn: 28, tam_ung: 29, thuc_nhan: 30, stk: 31, ngan_hang: 32,
  ht_tt: 36, od_ts: 37, tnld_bnn: 38, bhyt_cty: 39, bhtn_cty: 40, cd_cty: 41
};
const PAYROLL_FIELD_LABELS = {
  ma_nv: "MSNV", ten_nv: "Họ tên", luong_cb: "Lương cơ bản", ngay_cong_tt: "Ngày công thực tế",
  ngay_cong_chuan: "Ngày công chuẩn", ngay_cong_hl: "Ngày công hưởng lương", trach_nhiem: "Trách nhiệm",
  trang_phuc: "Trang phục", com_trua: "Cơm trưa", bhxh: "Chi phí HT-BHXH", hoa_hong: "Hoa hồng",
  thuong_dong_gop: "Thưởng", luong_phep: "Lương phép", khac: "Khác", tong_thu_nhap: "Tổng thu nhập",
  bhxh_tru: "BHXH (NLĐ)", bhyt_tru: "BHYT (NLĐ)", bhtn_tru: "BHTN (NLĐ)", cd_tru: "CĐ (NLĐ)",
  tong_khau_tru: "Tổng khấu trừ", tntt: "Thu nhập tính thuế", thue_tncn: "Thuế TNCN", tam_ung: "Tạm ứng",
  thuc_nhan: "Thực nhận", stk: "STK", ngan_hang: "Ngân hàng", ht_tt: "HT-TT", od_ts: "ÔĐ-TS",
  tnld_bnn: "TNLĐ-BNN", bhyt_cty: "BHYT (CTY)", bhtn_cty: "BHTN (CTY)", cd_cty: "CĐ (CTY)"
};

function detectPayrollColumns(rows) {
  const norm = (v) => v == null ? "" : String(v).normalize("NFC").toUpperCase().replace(/\s+/g, " ").trim();
  let h = -1;
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    if ((rows[i] || []).some(v => norm(v) === "MSNV")) { h = i; break; }
  }
  const legacy = { cols: Object.assign({}, PAYROLL_LEGACY_COLS), stdDays: 0, legacy: true, missing: [], extraIncome: [] };
  if (h < 0) return legacy;

  const r3 = (rows[h] || []).map(norm);
  const r4 = (rows[h + 1] || []).map(norm);
  const r5 = rows[h + 2] || [];
  const test = (t, m) => m instanceof RegExp ? m.test(t) : t === m;
  const inRow = (row, m, from) => { for (let c = from || 0; c < row.length; c++) if (row[c] && test(row[c], m)) return c; return -1; };
  const any = (m) => { const a = inRow(r4, m); return a >= 0 ? a : inRow(r3, m); };

  const cols = {
    ma_nv: inRow(r3, "MSNV"),
    ten_nv: inRow(r3, /^HỌ (VÀ )?TÊN/),
    luong_cb: any(/^LƯƠNG CƠ BẢN/),
    ngay_cong_tt: any(/^NGÀY CÔNG THỰC TẾ/),
    ngay_cong_chuan: any(/^NGÀY CÔNG CHUẨN/),
    ngay_cong_hl: (() => { const c = any(/^NGÀY CÔNG HƯỞNG LƯƠNG/); return c >= 0 ? c : any("NGÀY CÔNG"); })(),
    trach_nhiem: any(/^TRÁCH NHIỆM/),
    trang_phuc: any(/^TRANG PHỤC/),
    com_trua: any(/^CƠM TRƯA/),
    bhxh: any(/^CHI PHÍ/),
    hoa_hong: any(/^HOA HỒNG/),
    thuong_dong_gop: any(/^THƯỞNG/),
    luong_phep: any(/^LƯƠNG PHÉP/),
    khac: any("KHÁC"),
    tong_thu_nhap: any(/^TỔNG THU NHẬP/),
    tong_khau_tru: any(/^TỔNG KHẤU TRỪ/),
    tntt: any(/^THU NHẬP TÍNH THUẾ/),
    thue_tncn: any(/^TIỀN THUẾ/),
    tam_ung: any(/^TẠM ỨNG/),
    thuc_nhan: any(/^THỰC NHẬN/),
    stk: inRow(r4, "STK"),
    ngan_hang: inRow(r4, "NGÂN HÀNG"),
    ht_tt: inRow(r4, "HT-TT"),
    od_ts: inRow(r4, /^ÔĐ-TS/),
    tnld_bnn: inRow(r4, /^TNLĐ/)
  };
  // Khấu trừ người lao động: tiêu đề con BHXH/BHYT/BHTN/CĐ nằm sau "Các khoản khấu trừ"
  const kt = Math.max(0, inRow(r3, /^CÁC KHOẢN KHẤU TRỪ/));
  cols.bhxh_tru = inRow(r4, "BHXH", kt);
  cols.bhyt_tru = inRow(r4, "BHYT", kt);
  cols.bhtn_tru = inRow(r4, "BHTN", kt);
  cols.cd_tru = inRow(r4, "CĐ", kt);
  // Công ty đóng: BHYT/BHTN/CĐ ở dòng tiêu đề chính, nằm sau cột HT-TT
  const ct = cols.ht_tt >= 0 ? cols.ht_tt : 0;
  cols.bhyt_cty = inRow(r3, "BHYT", ct);
  cols.bhtn_cty = inRow(r3, "BHTN", ct);
  cols.cd_cty = inRow(r3, "CĐ", ct);

  // Số ngày công chuẩn kiểu cũ: 1 ô ở dòng tỷ lệ (ngay dưới tiêu đề), cột Tổng thu nhập
  const r5Std = (() => { const v = parseFloat(r5[cols.tong_thu_nhap]); return v >= 20 && v <= 31 ? v : 0; })();
  // T03/2026: cột ghi "Ngày công chuẩn" nhưng công thức dùng nó làm ngày công hưởng lương (H/$S$5*K)
  if (cols.ngay_cong_hl < 0 && cols.ngay_cong_chuan >= 0 && r5Std) {
    cols.ngay_cong_hl = cols.ngay_cong_chuan;
    cols.ngay_cong_chuan = -1;
  }

  const required = ["ma_nv", "ten_nv", "luong_cb", "ngay_cong_hl", "tong_thu_nhap", "tong_khau_tru", "thuc_nhan"];
  const missingRequired = required.filter(k => cols[k] < 0);
  if (missingRequired.length) {
    legacy.missing = missingRequired;
    return legacy;
  }
  // Mẫu cũ không có cột "Ngày công chuẩn": số ngày chuẩn ghi 1 ô ở dòng tỷ lệ, dưới cột Tổng thu nhập
  const stdDays = cols.ngay_cong_chuan < 0 ? r5Std : 0;
  Object.keys(cols).forEach(k => { if (cols[k] < 0) cols[k] = null; });

  // Khoản thu nhập khác không có tên chuẩn (Tăng ca, Thưởng lễ 30/4…): mọi cột có tiêu đề nằm giữa
  // cột phụ cấp cuối cùng và cột Tổng thu nhập mà chưa gán -> cộng dồn vào "Khác".
  const mapped = new Set(Object.values(cols).filter(v => v != null));
  const incomeFrom = Math.max(...["trang_phuc", "com_trua", "trach_nhiem", "bhxh", "hoa_hong"].map(k => cols[k] == null ? -1 : cols[k]));
  const extraIncome = [];
  for (let c = incomeFrom + 1; c < cols.tong_thu_nhap; c++) {
    if (!mapped.has(c) && (r3[c] || r4[c])) extraIncome.push(c);
  }
  const missing = Object.keys(PAYROLL_LEGACY_COLS).filter(k => cols[k] == null);
  return { cols, stdDays, legacy: false, missing, extraIncome, headerRow: h };
}

// Biểu thuế lũy tiến đúng như công thức IFS trong file bảng lương (5 bậc).
function calcPitProgressive(tntt) {
  const t = Number(tntt) || 0;
  if (t <= 0) return 0;
  let v;
  if (t <= 10000000) v = t * 0.05;
  else if (t <= 30000000) v = t * 0.10 - 500000;
  else if (t <= 60000000) v = t * 0.20 - 3500000;
  else if (t <= 100000000) v = t * 0.30 - 9500000;
  else v = t * 0.35 - 14500000;
  return Math.max(0, Math.round(v));
}

function setEmployeeDropZoneState(state, fileName) {
  const zone = document.getElementById("employeeDropZone");
  const inner = document.getElementById("employeeDropZoneInner");
  const info = document.getElementById("employeeDropFileInfo");
  const nameEl = document.getElementById("employeeDropFileName");
  if (!zone || !inner || !info) return;
  zone.classList.remove("has-file", "processing", "drag-over");
  if (state === "idle") {
    inner.style.display = "";
    info.style.display = "none";
  } else if (state === "processing") {
    zone.classList.add("processing", "has-file");
    inner.style.display = "none";
    info.style.display = "flex";
    if (nameEl) nameEl.textContent = fileName ? `Đang xử lý: ${fileName}` : "Đang xử lý...";
  } else if (state === "done") {
    zone.classList.add("has-file");
    inner.style.display = "none";
    info.style.display = "flex";
    if (nameEl) nameEl.textContent = fileName || "File đã chọn";
  }
}

function isValidEmployeeExcelFile(file) {
  if (!file) return false;
  const name = (file.name || "").toLowerCase();
  return name.endsWith(".xlsx");
}

async function doFetchEmployeesExcel(fileOverride) {
  const fileInput = document.getElementById("employeeExcelFile");
  const box = document.getElementById("sheetsResult");

  const file = fileOverride || (fileInput && fileInput.files && fileInput.files[0]);
  if (!file) {
    box.innerHTML = '<span class="err">Vui lòng chọn file Excel.</span>';
    setEmployeeDropZoneState("idle");
    return;
  }
  if (!isValidEmployeeExcelFile(file)) {
    box.innerHTML = '<span class="err">Vui lòng chọn file Excel (.xlsx).</span>';
    setEmployeeDropZoneState("idle");
    if (fileInput) fileInput.value = "";
    return;
  }

  setEmployeeDropZoneState("processing", file.name);
  box.innerHTML = '<span class="spinner" style="color:var(--accent)"></span> Đang xử lý file...';

  try {
    // Bản v3 có thể đưa sẵn workbook dựng từ Google Sheet (file.__workbook) -> khỏi đọc lại từ byte
    const workbook = file.__workbook || XLSX.read(await file.arrayBuffer(), { type: 'array' });
    
    const pattern = /^T\d{2}20\d{2}$/;
    globalSheetsData = {};
    globalAttendanceData = {};
    // Thông tin nhận diện + danh sách ô lỗi của từng sheet lương (giao diện v3 dùng để cảnh báo)
    window.globalSheetMeta = {};
    
    workbook.SheetNames.forEach(sheetName => {
      const cleanName = sheetName.trim();
      if (pattern.test(cleanName)) {
        const worksheet = workbook.Sheets[sheetName];
        
        // Nhận diện cột theo tiêu đề (xem detectPayrollColumns). Đọc dữ liệu từ dòng 8 (index 7) như trước.
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });
        const layout = detectPayrollColumns(jsonData);
        const COL = layout.cols;
        // Ngày công chuẩn: ưu tiên cột K của từng NV; mẫu cũ lấy ô số ngày chuẩn trong sheet; cuối cùng 26.
        const soNgayCongChuan = layout.stdDays || 26;
        const DATA_START = 7;
        const sheetIssues = [];
        // sheet_to_json trả null cho ô lỗi (#NAME?, #VALUE!...) -> đọc thẳng kiểu ô để phân biệt "trống" với "lỗi"
        const cellErr = (ri, key) => {
          const ci = COL[key];
          if (ci == null) return null;
          const cell = worksheet[XLSX.utils.encode_cell({ r: ri, c: ci })];
          return cell && cell.t === "e" ? (cell.w || "#ERR") : null;
        };
        const dataRows = jsonData.slice(DATA_START);

        let sheetData = [];
        dataRows.forEach((row, rowOffset) => {
          if (!row || !Array.isArray(row)) return;
          const ri = DATA_START + rowOffset;
          const at = (key) => COL[key] == null ? null : row[COL[key]];
          const ma_nv = at("ma_nv");
          const ten_nv = at("ten_nv");
          const luong_cb_raw = at("luong_cb");
          const ngay_cong_tt_raw = at("ngay_cong_tt");
          const ngay_cong_chuan_raw = at("ngay_cong_chuan");
          const ngay_cong_hl_raw = at("ngay_cong_hl");
          const trach_nhiem_raw = at("trach_nhiem");
          const trang_phuc_raw = at("trang_phuc");
          const com_trua_raw = at("com_trua");
          const bhxh_raw = at("bhxh");
          const hoa_hong_raw = at("hoa_hong");
          const thuong_dong_gop_raw = at("thuong_dong_gop");
          const luong_phep_raw = at("luong_phep");
          const khac_raw = (parseFloat(at("khac")) || 0) +
            (layout.extraIncome || []).reduce((sum, c) => sum + (parseFloat(row[c]) || 0), 0);
          const tong_thu_nhap_raw = at("tong_thu_nhap");
          const bhxh_tru_raw = at("bhxh_tru");
          const bhyt_tru_raw = at("bhyt_tru");
          const bhtn_tru_raw = at("bhtn_tru");
          const cd_tru_raw = at("cd_tru");
          const tong_khau_tru_raw = at("tong_khau_tru");
          const tntt_raw = at("tntt");
          const thue_tncn_raw = at("thue_tncn");
          const tam_ung_raw = at("tam_ung");
          const thuc_nhan_raw = at("thuc_nhan");
          const stk_raw = at("stk");
          const ngan_hang_raw = at("ngan_hang");
          const ht_tt_raw = at("ht_tt");
          const od_ts_raw = at("od_ts");
          const tnld_bnn_raw = at("tnld_bnn");
          const bhyt_cty_raw = at("bhyt_cty");
          const bhtn_cty_raw = at("bhtn_cty");
          const cd_cty_raw = at("cd_cty");
          // Có MSNV nhưng ô Họ tên lỗi công thức -> dòng không đọc được, báo lại thay vì bỏ qua im lặng
          const tenErr = cellErr(ri, "ten_nv");
          if (tenErr && ma_nv != null && String(ma_nv).trim() !== "") {
            sheetIssues.push({ row: ri + 1, ma_nv: String(ma_nv).trim(), ten_nv: "", field: "ten_nv",
              label: "Họ tên", code: tenErr, fixed: false, skipped: true });
          }
          
          const ma_nv_str = ma_nv !== undefined && ma_nv !== null ? String(ma_nv).trim() : "";
          const ten_nv_str = ten_nv !== undefined && ten_nv !== null ? String(ten_nv).trim() : "";
          
          if (ma_nv_str !== "" && ten_nv_str !== "") {
            const luong_cb = parseFloat(luong_cb_raw) || 0;
            const ngay_cong_tt = parseFloat(ngay_cong_tt_raw) || 0;
            let ngay_cong_chuan = parseFloat(ngay_cong_chuan_raw) || 0;
            const ngay_cong_hl = parseFloat(ngay_cong_hl_raw) || 0;
            const trach_nhiem = Math.round(parseFloat(trach_nhiem_raw) || 0);
            const trang_phuc = parseFloat(trang_phuc_raw) || 0;
            const com_trua = parseFloat(com_trua_raw) || 0;
            const bhxh = parseFloat(bhxh_raw) || 0;
            const hoa_hong = parseFloat(hoa_hong_raw) || 0;
            const thuong_dong_gop = parseFloat(thuong_dong_gop_raw) || 0;
            const luong_phep = parseFloat(luong_phep_raw) || 0;
            const khac = parseFloat(khac_raw) || 0;
            const tong_thu_nhap = parseFloat(tong_thu_nhap_raw) || 0;
            const bhxh_tru = parseFloat(bhxh_tru_raw) || 0;
            const bhyt_tru = parseFloat(bhyt_tru_raw) || 0;
            const bhtn_tru = parseFloat(bhtn_tru_raw) || 0;
            const cd_tru = parseFloat(cd_tru_raw) || 0;
            const tong_khau_tru = parseFloat(tong_khau_tru_raw) || 0;
            let thue_tncn = parseFloat(thue_tncn_raw) || 0;
            const tam_ung = parseFloat(tam_ung_raw) || 0;
            let thuc_nhan = parseFloat(thuc_nhan_raw) || 0;
            const stk = stk_raw !== undefined && stk_raw !== null ? String(stk_raw).trim() : "";
            const ngan_hang = ngan_hang_raw !== undefined && ngan_hang_raw !== null ? String(ngan_hang_raw).trim() : "";
            const ht_tt = parseFloat(ht_tt_raw) || 0;
            const od_ts = parseFloat(od_ts_raw) || 0;
            const tnld_bnn = parseFloat(tnld_bnn_raw) || 0;
            const bhyt_cty = parseFloat(bhyt_cty_raw) || 0;
            const bhtn_cty = parseFloat(bhtn_cty_raw) || 0;
            const cd_cty = parseFloat(cd_cty_raw) || 0;
            const tong_bhxh_nld = bhxh_tru + bhyt_tru + bhtn_tru; // V + W + X (BHXH người lao động đóng)
            const tong_ajakal = ht_tt + od_ts + tnld_bnn; // AK + AL + AM
            const tong_bhxh_moi = ht_tt + od_ts + tnld_bnn + bhyt_cty + bhtn_cty; // Tổng BHXH CTY Đóng (không gồm CĐ)

            // --- Ô lỗi công thức ngay trong file Excel ---
            // Vd. Thuế TNCN dùng hàm IFS bị lưu thành "_xludf.IFS" -> #NAME?, kéo theo Thực nhận #NAME?.
            // Tự tính lại Thuế (theo đúng biểu lũy tiến trong công thức) và Thực nhận khi đủ dữ liệu;
            // các ô lỗi khác chỉ ghi nhận để cảnh báo, không đoán giá trị.
            const issue = (key, code, fixed, value) =>
              sheetIssues.push({ row: ri + 1, ma_nv: ma_nv_str, ten_nv: ten_nv_str, field: key, label: PAYROLL_FIELD_LABELS[key] || key, code, fixed, value });
            let thueOk = true;
            const thueErr = cellErr(ri, "thue_tncn");
            if (thueErr) {
              if (COL.tntt != null && !cellErr(ri, "tntt")) {
                thue_tncn = calcPitProgressive(parseFloat(tntt_raw) || 0);
                issue("thue_tncn", thueErr, true, thue_tncn);
              } else { thueOk = false; issue("thue_tncn", thueErr, false); }
            }
            const thucNhanErr = cellErr(ri, "thuc_nhan");
            if (thucNhanErr) {
              const blocked = ["tong_thu_nhap", "tong_khau_tru", "tam_ung"].some(k => cellErr(ri, k));
              if (thueOk && !blocked) {
                thuc_nhan = Math.round(tong_thu_nhap - tong_khau_tru - thue_tncn - tam_ung);
                issue("thuc_nhan", thucNhanErr, true, thuc_nhan);
              } else issue("thuc_nhan", thucNhanErr, false);
            }
            Object.keys(COL).forEach(k => {
              if (k === "thue_tncn" || k === "thuc_nhan") return;
              const e = cellErr(ri, k);
              if (e) issue(k, e, false);
            });
            if (!(ngay_cong_chuan > 0) && COL.ngay_cong_chuan == null) ngay_cong_chuan = soNgayCongChuan;
            
            // Mẫu số chia: ưu tiên Ngày công chuẩn (cột K) của từng NV, fallback 26
            let mauSoChia = soNgayCongChuan;
            if (ngay_cong_chuan > 0) {
                mauSoChia = ngay_cong_chuan;
            }

            // Công thức: (Lương CB / Ngày công chuẩn) * Ngày công hưởng lương + phụ cấp
            //   H / K * L + (M Trách nhiệm + N Trang phục + O Cơm + P HT-BHXH)
            const luong_tinh_toan = Math.round((luong_cb / mauSoChia) * ngay_cong_hl) + trach_nhiem + trang_phuc + com_trua + bhxh;

            sheetData.push({
              ma_nv: ma_nv_str,
              ten_nv: ten_nv_str,
              luong_cb: luong_cb,
              ngay_cong_tt: ngay_cong_tt,         // J: Ngày công thực tế
              ngay_cong_chuan: ngay_cong_chuan,   // K: Ngày công chuẩn
              ngay_cong_hl: ngay_cong_hl,         // L: Ngày công hưởng lương
              trang_phuc: trang_phuc,
              com_trua: com_trua,
              trach_nhiem: trach_nhiem,
              bhxh: bhxh,
              luong_tinh_toan: luong_tinh_toan,
              hoa_hong: hoa_hong,
              thuong_dong_gop: thuong_dong_gop,
              luong_phep: luong_phep,
              khac: khac,
              tong_thu_nhap: tong_thu_nhap,
              bhxh_tru: bhxh_tru,
              bhyt_tru: bhyt_tru,
              bhtn_tru: bhtn_tru,
              cd_tru: cd_tru,
              tong_khau_tru: tong_khau_tru,
              thue_tncn: thue_tncn,
              tam_ung: tam_ung,
              thuc_nhan: thuc_nhan,
              stk: stk,
              ngan_hang: ngan_hang,
              ht_tt: ht_tt,
              od_ts: od_ts,
              tnld_bnn: tnld_bnn,
              tong_ajakal: tong_ajakal,
              bhyt_cty: bhyt_cty,
              bhtn_cty: bhtn_cty,
              cd_cty: cd_cty,
              tong_bhxh_nld: tong_bhxh_nld,
              tong_bhxh_moi: tong_bhxh_moi
            });
          }
        });
        
        globalSheetsData[cleanName] = sheetData;
        window.globalSheetMeta[cleanName] = {
          legacy: layout.legacy, missing: layout.missing, stdDays: soNgayCongChuan,
          extraIncomeLabels: (layout.extraIncome || []).map(c => String((jsonData[layout.headerRow] || [])[c] || "").trim()),
          hasStdDaysColumn: COL.ngay_cong_chuan != null, issues: sheetIssues
        };
      }

      // --- Parse sheet Chấm công ---
      // Mẫu không đồng nhất giữa các tháng:
      //  T2: STT | MSNV | 1..28 | tổng  (mã NV ở cột 1)
      //  T3/T4: MÃ NHÂN VIÊN | 1..31 | tổng  (mã ở cột 0)
      //  T5: (không có nhãn mã) | 1..31  rồi data bắt đầu bằng mã NV
      //  T6: không có dòng số ngày — chỉ data L/N/P… theo cột
      //  T7: thứ (T2..CN) + MÃ NV | "1".."31"
      const isAttendanceByName = /ch[aấ]m\s*c[oô]ng/i.test(cleanName);
      if (isAttendanceByName || !pattern.test(cleanName)) {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });
        if (jsonData && jsonData.length >= 3) {
          const normCell = (v) => v == null ? "" : String(v).trim().toUpperCase().replace(/\s+/g, " ");
          const compactCell = (v) => normCell(v).replace(/\s+/g, "").replace(/\n/g, "");
          const isEmpHeader = (v) => {
            const c = compactCell(v);
            const n = normCell(v);
            return (
              c === "MSNV" || c === "MÃNV" || c === "MANV" ||
              c === "MÃNHÂNVIÊN" || c === "MANHANVIEN" || c === "MÃNHANVIEN" ||
              n === "MÃ NV" || n === "MA NV" ||
              /^M[ÃA]\s*N[VÂĂ]/.test(n) ||
              /^MS\s*NV$/.test(n)
            );
          };
          const parseDayNum = (v) => {
            if (v == null || v === "") return NaN;
            if (typeof v === "number" && v >= 1 && v <= 31 && Number.isInteger(v)) return v;
            const s = String(v).trim();
            if (/^\d{1,2}$/.test(s)) {
              const n = parseInt(s, 10);
              if (n >= 1 && n <= 31) return n;
            }
            return NaN;
          };
          const isAttCode = (v) => {
            if (v == null || v === "") return false;
            const s = String(v).trim().toUpperCase();
            return /^(L|N|P|V|K|H|LE|LỄ)$/.test(s);
          };

          // --- Suy ra monthKey (ưu tiên tên sheet) ---
          const defaultYear = (() => {
            for (const sn of (workbook.SheetNames || [])) {
              const pm = String(sn).match(/(20\d{2})/);
              if (pm) return pm[1];
            }
            return new Date().getFullYear().toString();
          })();
          const tryMonthFromText = (text, allowMonthOnly) => {
            if (!text) return null;
            const s = String(text).trim();
            // Date object from Excel
            if (text instanceof Date && !isNaN(text.getTime())) {
              const mm = text.getMonth() + 1;
              const yy = text.getFullYear();
              if (mm >= 1 && mm <= 12 && yy >= 2000) {
                return `T${String(mm).padStart(2, "0")}${yy}`;
              }
            }
            let m = s.match(/(?:^|[^\d])(\d{1,2})\s*[\/\-\.]\s*(20\d{2})(?:[^\d]|$)/);
            if (m) {
              const mm = parseInt(m[1], 10);
              if (mm >= 1 && mm <= 12) return `T${String(mm).padStart(2, "0")}${m[2]}`;
            }
            m = s.match(/th[aá]ng\s*(\d{1,2})\s*[\/\-\.\s]?\s*(20\d{2})/i);
            if (m) {
              const mm = parseInt(m[1], 10);
              if (mm >= 1 && mm <= 12) return `T${String(mm).padStart(2, "0")}${m[2]}`;
            }
            m = s.match(/\bT\s*(\d{1,2})\s*[\/\-]?\s*(20\d{2})\b/i);
            if (m) {
              const mm = parseInt(m[1], 10);
              if (mm >= 1 && mm <= 12) return `T${String(mm).padStart(2, "0")}${m[2]}`;
            }
            if (allowMonthOnly) {
              m = s.match(/\bT\s*(\d{1,2})\b/i) || s.match(/th[aá]ng\s*(\d{1,2})\b/i);
              if (m) {
                const mm = parseInt(m[1], 10);
                if (mm >= 1 && mm <= 12) return `T${String(mm).padStart(2, "0")}${defaultYear}`;
              }
            }
            return null;
          };
          let monthKey = tryMonthFromText(cleanName, true);
          if (!monthKey) {
            for (let ri = 0; ri < Math.min(4, jsonData.length); ri++) {
              const row = jsonData[ri] || [];
              for (let ci = 0; ci < Math.min(6, row.length); ci++) {
                monthKey = tryMonthFromText(row[ci], false);
                if (monthKey) break;
              }
              if (monthKey) break;
            }
          }
          if (!monthKey) monthKey = cleanName;

          let daysInMonth = 31;
          const mk = monthKey.match(/^T(\d{2})(\d{4})$/i);
          if (mk) {
            const mm = parseInt(mk[1], 10);
            const yy = parseInt(mk[2], 10);
            if (mm >= 1 && mm <= 12 && yy >= 2000) {
              daysInMonth = new Date(yy, mm, 0).getDate();
            }
          }

          // --- Tìm dòng header có nhiều số ngày 1..31 liên tiếp ---
          let headerRowIdx = -1;
          let dayCols = []; // { colIdx, dayNum }
          let empColIdx = 0;

          for (let i = 0; i < Math.min(12, jsonData.length); i++) {
            const row = jsonData[i];
            if (!row || !Array.isArray(row)) continue;
            const found = [];
            for (let c = 0; c < row.length; c++) {
              const num = parseDayNum(row[c]);
              if (!isNaN(num)) found.push({ colIdx: c, dayNum: num });
            }
            // Cần ít nhất 20 cột ngày, hoặc ≥ 15 nếu tên sheet là chấm công
            const minDays = isAttendanceByName ? 15 : 20;
            if (found.length >= minDays) {
              // Kiểm tra có dãy gần liên tiếp (1,2,3...)
              const nums = found.map(f => f.dayNum).sort((a, b) => a - b);
              if (nums[0] <= 3 && nums[nums.length - 1] >= 20) {
                headerRowIdx = i;
                dayCols = found.filter(f => f.dayNum >= 1 && f.dayNum <= 31);
                break;
              }
            }
          }

          // Tìm cột mã NV trên dòng header (MSNV / MÃ NV / MÃ NHÂN VIÊN)
          if (headerRowIdx >= 0) {
            const headerRow = jsonData[headerRowIdx];
            let foundEmp = -1;
            for (let c = 0; c < Math.min(5, headerRow.length); c++) {
              if (isEmpHeader(headerRow[c])) {
                foundEmp = c;
                break;
              }
            }
            if (foundEmp >= 0) {
              empColIdx = foundEmp;
            } else {
              // Không có nhãn → cột ngay trước cột ngày đầu tiên
              const firstDayCol = Math.min(...dayCols.map(d => d.colIdx));
              empColIdx = Math.max(0, firstDayCol - 1);
              // Nếu cột đó là STT (số thứ tự) thì lùi thêm 1 không — data rows sẽ tự lọc
              // T2: STT=0, MSNV=1, days from 2 → firstDayCol=2 → empColIdx=1 OK nếu MSNV matched
            }
          }

          // Fallback T6-style: không có dòng số ngày, nhưng tên sheet là chấm công
          // Suy cột ngày từ dòng data đầu tiên chứa mã NV + chuỗi L/N/P…
          if (headerRowIdx < 0 && isAttendanceByName) {
            for (let i = 0; i < Math.min(8, jsonData.length); i++) {
              const row = jsonData[i];
              if (!row || !Array.isArray(row)) continue;
              // Tìm cột có mã NV dạng chữ (BTANH...) và các cột sau là mã chấm công
              for (let c = 0; c <= 2; c++) {
                const ma = row[c] != null ? String(row[c]).trim() : "";
                if (!ma || ma.length < 2 || ma.length > 20) continue;
                if (/^\d+$/.test(ma)) continue; // bỏ STT
                if (isEmpHeader(ma) || /^(STT|MÃ|MA)\b/i.test(ma)) continue;
                // Đếm mã chấm công ở các cột sau
                let attCount = 0;
                const inferred = [];
                for (let d = c + 1; d < Math.min(c + 1 + 31, row.length); d++) {
                  if (isAttCode(row[d])) {
                    attCount++;
                    inferred.push({ colIdx: d, dayNum: inferred.length + 1 });
                  } else if (row[d] == null || row[d] === "") {
                    // cho phép ô trống trong chuỗi ngày
                    inferred.push({ colIdx: d, dayNum: inferred.length + 1 });
                  } else {
                    break; // gặp tổng số / text khác → dừng
                  }
                }
                if (attCount >= 10 && inferred.length >= 20) {
                  headerRowIdx = i - 1; // data bắt đầu từ i; coi "header" là dòng trước
                  if (headerRowIdx < 0) headerRowIdx = i; // sẽ skip chính dòng này bằng filter
                  empColIdx = c;
                  dayCols = inferred.slice(0, daysInMonth);
                  // Đánh dấu special: data bắt đầu từ dòng i (không phải headerRowIdx+1)
                  // Dùng headerRowIdx = i - 1 và bắt đầu đọc từ i
                  break;
                }
              }
              if (dayCols.length >= 15) break;
            }
          }

          if (dayCols.length >= 15 || (isAttendanceByName && dayCols.length >= 10)) {
            // Lọc ngày hợp lệ theo tháng
            const validDayCols = dayCols.filter(d => d.dayNum >= 1 && d.dayNum <= daysInMonth);
            // Weekday: dòng ngay trên header (nếu có T2/CN...)
            const weekdayRow = headerRowIdx > 0 ? (jsonData[headerRowIdx - 1] || []) : [];
            const weekdays = validDayCols.map(d => {
              const w = weekdayRow[d.colIdx];
              if (w == null || w === "") return "";
              const s = String(w).trim();
              // bỏ #NAME? / lỗi công thức
              if (/^#/.test(s)) return "";
              return s;
            });
            const days = validDayCols.map(d => d.dayNum);

            // Cột tổng: trên dòng header (nếu có), sau cột ngày cuối
            const headerRow = headerRowIdx >= 0 ? (jsonData[headerRowIdx] || []) : [];
            const lastDayCol = dayCols.length ? Math.max(...dayCols.map(d => d.colIdx)) : 0;
            const sumHeaders = [];
            for (let c = lastDayCol + 1; c < headerRow.length; c++) {
              const h = headerRow[c] != null ? String(headerRow[c]).trim().replace(/\s+/g, " ") : "";
              if (h && !/^#/.test(h)) sumHeaders.push({ colIdx: c, label: h });
            }
            // T6: tổng header có thể nằm ở dòng weekday / dòng khác
            if (sumHeaders.length === 0) {
              for (let ri = 0; ri <= Math.min(headerRowIdx + 1, 3); ri++) {
                const r = jsonData[ri] || [];
                for (let c = lastDayCol + 1; c < r.length; c++) {
                  const h = r[c] != null ? String(r[c]).trim().replace(/\s+/g, " ") : "";
                  if (h && !/^#/.test(h) && /tổng|ngày công|vắng|phép|lễ/i.test(h)) {
                    if (!sumHeaders.some(s => s.colIdx === c)) {
                      sumHeaders.push({ colIdx: c, label: h });
                    }
                  }
                }
              }
            }

            // Dòng bắt đầu data: sau header; với T6-style headerRowIdx có thể trỏ dòng trước data
            let dataStart = headerRowIdx + 1;
            // Nếu dòng headerRowIdx+1 không có mã NV hợp lệ nhưng chính headerRowIdx có (T6 edge)
            // thì đã xử lý bằng cách set headerRowIdx = i-1 ở trên

            const attRows = [];
            for (let r = dataStart; r < jsonData.length; r++) {
              const row = jsonData[r];
              if (!row || !Array.isArray(row)) continue;
              const ma = row[empColIdx] != null ? String(row[empColIdx]).trim() : "";
              if (!ma) continue;
              const maUp = ma.toUpperCase();
              // Bỏ header lặp / chú thích / STT thuần số / legend
              if (isEmpHeader(ma) || maUp === "STT" || maUp === "MSNV") continue;
              if (/^(l|n|v|p|k|h|u|s)\s*[=:]/i.test(ma)) continue;
              if (/làm việc|nghỉ tuần|nghỉ phép|vắng|không lương|chế độ/i.test(ma)) continue;
              if (ma.length > 25) continue;
              // Bỏ dòng chỉ là số STT (khi empCol nhầm sang cột STT)
              if (/^\d{1,3}$/.test(ma)) {
                // thử cột kế bên nếu đang ở STT
                const alt = row[empColIdx + 1] != null ? String(row[empColIdx + 1]).trim() : "";
                if (alt && !/^\d+$/.test(alt) && alt.length <= 20 && !isEmpHeader(alt)) {
                  // dùng alt làm mã — nhưng chỉ khi dayCols không trùng cột đó
                  // an toàn hơn: skip dòng STT
                }
                continue;
              }

              const dayCodes = validDayCols.map(d => {
                const raw = row[d.colIdx];
                if (raw == null || raw === "") return "";
                return String(raw).trim().toUpperCase();
              });
              // Bỏ dòng không có mã chấm công nào (có thể là dòng nhóm/team)
              // Mã hợp lệ: L N P V H K U S (và LE/LỄ)
              if (!dayCodes.some(c => c && /^(L|N|P|V|K|U|S|H|LE|LỄ)$/.test(c))) continue;

              let tongLam = 0, tongNghi = 0, tongLe = 0, tongPhep = 0, tongK = 0, tongVang = 0;
              dayCodes.forEach(code => {
                if (code === "L") tongLam++;
                else if (code === "N") tongNghi++;
                else if (code === "P") tongPhep++;
                else if (code === "V") tongVang++;
                else if (code === "K" || code === "U") tongK++; // U = không hưởng lương
                else if (code === "S") tongK++;                 // S = nghỉ chế độ — gom cột K/không lương
                else if (code === "LE" || code === "LỄ" || code === "H") tongLe++;
              });

              const sums = {};
              sumHeaders.forEach(sh => {
                const val = row[sh.colIdx];
                sums[sh.label] = val != null && val !== "" ? (parseFloat(val) || String(val).trim()) : "";
              });

              const getSum = (keys, fallback) => {
                for (const k of keys) {
                  if (sums[k] !== undefined && sums[k] !== "" && !isNaN(parseFloat(sums[k]))) {
                    return parseFloat(sums[k]);
                  }
                }
                for (const label of Object.keys(sums)) {
                  const low = label.toLowerCase().replace(/\s+/g, " ");
                  if (keys.some(k => low.includes(k.toLowerCase().replace(/tổng\s*/i, "").trim()))) {
                    const v = parseFloat(sums[label]);
                    if (!isNaN(v)) return v;
                  }
                }
                return fallback;
              };

              attRows.push({
                ma_nv: ma,
                days: dayCodes,
                tong_lam: getSum(["Tổng Làm", "Tong Lam", "Tổng làm", "Tổng Làm thực tế", "Ngày công thực tế"], tongLam),
                tong_nghi: getSum(["Tổng Nghỉ", "Tong Nghi", "Tổng nghỉ"], tongNghi),
                tong_le: getSum(["Tổng Lễ", "Tong Le", "Tổng lễ"], tongLe),
                tong_phep: getSum(["Tổng Phép Có Lương", "Tong Phep", "Phép Có Lương", "Tổng phép", "Tổng Phép Có Lương"], tongPhep),
                tong_k: getSum(["Tổng K lương", "Tong K", "K lương", "Không lương", "Tổng Phép K lương"], tongK),
                tong_vang: getSum(["Vắng Không lý do", "Vang", "Vắng", "Tổng Vắng"], tongVang),
                ngay_cong_chuan: getSum(["Ngày công chuẩn", "Ngay cong chuan"], ""),
                ngay_cong_huong_luong: getSum(["Ngày công hưởng lương", "Ngay cong huong luong", "Ngày công HL", "Ngày hưởng lương"], ""),
                raw_sums: sums
              });
            }

            if (attRows.length > 0) {
              const existing = globalAttendanceData[monthKey];
              if (!existing || (attRows.length >= (existing.rows || []).length)) {
                globalAttendanceData[monthKey] = {
                  days,
                  weekdays,
                  rows: attRows,
                  sourceSheet: cleanName,
                  sumHeaders: sumHeaders.map(s => s.label)
                };
              }
            }
          }
        }
      }
    });
    
    const sheetNames = Object.keys(globalSheetsData);
    const attKeys = Object.keys(globalAttendanceData);
    // Gộp key tháng từ cả sheet lương và sheet chấm công
    const allMonthKeys = Array.from(new Set([...sheetNames, ...attKeys]));

    if (allMonthKeys.length === 0) {
      box.innerHTML = '<span class="err">Không tìm thấy Sheet lương (T012026...) hoặc sheet Chấm công nào.</span>';
      document.getElementById("sheetSelect").innerHTML = '<option value="">-- Chưa có dữ liệu --</option>';
      const resultCard = document.getElementById("employeeResultCard");
      if (resultCard) resultCard.style.display = "none";
      setEmployeeDropZoneState("done", file.name);
      return;
    }

    const select = document.getElementById("sheetSelect");
    select.innerHTML = '<option value="">-- Chọn Tháng / Sheet --</option>';
    // Sắp xếp theo năm-tháng tăng dần (T01/2026 trước T02/2026...)
    const sortedNames = allMonthKeys.slice().sort((a, b) => {
      const ma = a.match(/^T(\d{2})(\d{4})$/i);
      const mb = b.match(/^T(\d{2})(\d{4})$/i);
      if (ma && mb) {
        const ya = parseInt(ma[2], 10), yb = parseInt(mb[2], 10);
        if (ya !== yb) return ya - yb;
        return parseInt(ma[1], 10) - parseInt(mb[1], 10);
      }
      return a.localeCompare(b, "vi");
    });
    sortedNames.forEach(name => {
      const opt = document.createElement("option");
      opt.value = name;
      const m = name.match(/^T(\d{2})(\d{4})$/i);
      opt.textContent = m ? `T${m[1]}/${m[2]}` : name;
      select.appendChild(opt);
    });

    const attLabel = attKeys.length > 0
      ? ` · ${attKeys.length} sheet chấm công (${attKeys.map(k => {
          const m = k.match(/^T(\d{2})(\d{4})$/i);
          return m ? `T${m[1]}/${m[2]}` : k;
        }).join(", ")})`
      : "";
    const luongNote = sheetNames.length > 0 ? `${sheetNames.length} sheet lương` : "0 sheet lương";
    box.innerHTML = `<span class="badge ok">🎉 Đã đọc xong! Tìm thấy ${luongNote}${attLabel}. Hãy chọn tháng bên dưới.</span>`;
    setEmployeeDropZoneState("done", file.name);

  } catch (e) {
    box.innerHTML = `<span class="err">❌ Lỗi: ${e.message}</span>`;
    setEmployeeDropZoneState("done", file.name);
  }
}
function displaySheetData() {
  const selectedSheet = document.getElementById("sheetSelect").value;
  const resultCard = document.getElementById("employeeResultCard");
  const wrapper = document.getElementById("employeeTableWrapper");
  const tbody = document.getElementById("employeeTbody");

  const accWrapper = document.getElementById("accountingWrapper");
  const accTbody = document.getElementById("accountingTbody");
  const accTbody2 = document.getElementById("accountingTbody2");
  const accTbody3 = document.getElementById("accountingTbody3");
  const bankWrapper = document.getElementById("bankTransferWrapper");
  const bankTbody = document.getElementById("bankTransferTbody");

  if (!selectedSheet) {
    if (resultCard) resultCard.style.display = "none";
    currentBankTransferRows = [];
    currentBankTransferContent = "";
    bankGroupsData = {};
    bankActiveTab = '';
    const bankTabsWrapEmpty = document.getElementById("bankTabsWrap");
    if (bankTabsWrapEmpty) bankTabsWrapEmpty.innerHTML = "";
    updateAuditAlerts();
    return;
  }

  const rows = globalSheetsData[selectedSheet] || [];
  tbody.innerHTML = "";
  accTbody.innerHTML = "";
  accTbody2.innerHTML = "";
  accTbody3.innerHTML = "";
  bankTbody.innerHTML = "";

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="31" style="text-align:center;">Không có dữ liệu trong sheet này.</td></tr>`;
    currentBankTransferRows = [];
    currentBankTransferContent = "";
    bankGroupsData = {};
    bankActiveTab = '';
    const bankTabsWrapEmpty2 = document.getElementById("bankTabsWrap");
    if (bankTabsWrapEmpty2) bankTabsWrapEmpty2.innerHTML = "";
    if (resultCard) resultCard.style.display = "block";
    empMainTab = "luong";
    applyEmpMainTabView();
  } else {
    const formatMoney = (v) => Number(v).toLocaleString('vi-VN');
    
    // Các biến cộng dồn cho dòng Tổng
    let sumLuongCb = 0, sumTrangPhuc = 0, sumComTrua = 0, sumTrachNhiem = 0, sumBhxh = 0, sumLuongTinhToan = 0;
    let sumHoaHong = 0, sumThuongDongGop = 0, sumLuongPhep = 0, sumKhac = 0, sumTongThuNhap = 0;
    let sumBhxhTru = 0, sumBhytTru = 0, sumBhtnTru = 0, sumCdTru = 0, sumThueTncn = 0, sumThucNhan = 0;
    let sumHtTt = 0, sumOdTs = 0, sumTnldBnn = 0, sumTongAjakal = 0, sumBhytCty = 0, sumBhtnCty = 0, sumCdCty = 0, sumTongBhxhNld = 0, sumTongBhxhMoi = 0;
    let detailRowsHoaHongHTML = '', detailRowsThuongDgHTML = '', detailRowsLuongTtHTML = '', detailRowsLuongPhepHTML = '', detailRowsKhacHTML = '', detailRows3341HTML = '';
    let detailRows3383HTML = '', detailRows3384HTML = '', detailRows3385HTML = '', detailRows3382HTML = '', detailRows6422HTML = '';
    let detailRowsNld3383HTML = '', detailRowsNld3384HTML = '', detailRowsNld3385HTML = '', detailRowsNld3335HTML = '', detailRowsNld3341HTML = '';

    rows.forEach(r => {
      // Đổ dữ liệu ra bảng chính (Lương tính toán ở cuối cùng)
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="freeze-col-1" style="font-weight:600; color:var(--accent);">${escapeHtml(r.ma_nv)}</td>
        <td class="freeze-col-2" title="${escapeHtml(r.ten_nv)}">${escapeHtml(toTitleCaseVN(r.ten_nv))}</td>
        <td style="text-align: right;">${formatMoney(r.luong_cb)}</td>
        <td style="text-align: right;">${formatMoney(r.trach_nhiem)}</td>
        <td style="text-align: center;">${r.ngay_cong_tt}</td>
        <td style="text-align: center;">${r.ngay_cong_chuan != null ? r.ngay_cong_chuan : ""}</td>
        <td style="text-align: center;">${r.ngay_cong_hl}</td>
        <td style="text-align: right;">${formatMoney(r.trang_phuc)}</td>
        <td style="text-align: right;">${formatMoney(r.com_trua)}</td>
        <td style="text-align: right;">${formatMoney(r.bhxh)}</td>
        <td style="text-align: right; font-weight: 700; color: var(--amount-in);">${formatMoney(r.luong_tinh_toan)}</td>
        <td style="text-align: right;">${formatMoney(r.hoa_hong)}</td>
        <td style="text-align: right;">${formatMoney(r.thuong_dong_gop)}</td>
        <td style="text-align: right;">${formatMoney(Math.round(r.luong_phep))}</td>
        <td style="text-align: right;">${formatMoney(r.khac)}</td>
        <td style="text-align: right; font-weight: 700;">${formatMoney(r.tong_thu_nhap)}</td>
        <td style="text-align: right;">${formatMoney(r.bhxh_tru)}</td>
        <td style="text-align: right;">${formatMoney(r.bhyt_tru)}</td>
        <td style="text-align: right;">${formatMoney(r.bhtn_tru)}</td>
        <td style="text-align: right;">${formatMoney(r.cd_tru)}</td>
        <td style="text-align: right;">${formatMoney(Math.round(r.thue_tncn))}</td>
        <td style="text-align: right; font-weight: 800; color: var(--amount-in);">${formatMoney(Math.round(r.thuc_nhan))}</td>
        <td style="text-align: center;">${escapeHtml(r.stk)}</td>
        <td style="text-align: center;">${escapeHtml(r.ngan_hang)}</td>
        <td style="text-align: right;">${formatMoney(r.ht_tt)}</td>
        <td style="text-align: right;">${formatMoney(r.od_ts)}</td>
        <td style="text-align: right;">${formatMoney(r.tnld_bnn)}</td>
        <td style="text-align: right; font-weight: 700;">${formatMoney(r.tong_ajakal)}</td>
        <td style="text-align: right;">${formatMoney(r.bhyt_cty)}</td>
        <td style="text-align: right;">${formatMoney(r.bhtn_cty)}</td>
        <td style="text-align: right; font-weight: 700;">${formatMoney(r.tong_bhxh_nld)}</td>
        <td style="text-align: right; font-weight: 700;">${formatMoney(r.tong_bhxh_moi)}</td>
        <td style="text-align: right;">${formatMoney(r.cd_cty)}</td>
      `;
      tbody.appendChild(tr);

      // Cộng dồn các cột
      sumLuongCb += r.luong_cb;
      sumTrangPhuc += r.trang_phuc;
      sumComTrua += r.com_trua;
      sumTrachNhiem += r.trach_nhiem;
      sumBhxh += r.bhxh;
      sumLuongTinhToan += r.luong_tinh_toan;
      sumHoaHong += r.hoa_hong;
      sumThuongDongGop += r.thuong_dong_gop;
      sumLuongPhep += r.luong_phep;
      sumKhac += r.khac;
      sumTongThuNhap += r.tong_thu_nhap;
      sumBhxhTru += r.bhxh_tru;
      sumBhytTru += r.bhyt_tru;
      sumBhtnTru += r.bhtn_tru;
      sumCdTru += r.cd_tru;
      sumThueTncn += r.thue_tncn;
      sumThucNhan += r.thuc_nhan;
      sumHtTt += r.ht_tt;
      sumOdTs += r.od_ts;
      sumTnldBnn += r.tnld_bnn;
      sumTongAjakal += r.tong_ajakal;
      sumBhytCty += r.bhyt_cty;
      sumBhtnCty += r.bhtn_cty;
      sumCdCty += r.cd_cty;
      sumTongBhxhNld += r.tong_bhxh_nld;
      sumTongBhxhMoi += r.tong_bhxh_moi;
      
      // Tạo dòng chi tiết Hạch toán theo nhân viên — tách riêng từng cột nguồn
      // Nợ 6421: Hoa hồng bán hàng (P)
      detailRowsHoaHongHTML += `
        <tr class="detail-row-hoahong" style="display: none; background: rgba(0,0,0,0.02);">
          <td></td>
          <td style="font-weight: 600;">3341</td>
          <td style="padding-left: 20px; font-size: 12px; color: var(--text-muted);">
            └─ ${escapeHtml(r.ten_nv)} (${escapeHtml(r.ma_nv)})
          </td>
          <td style="text-align: right;">${formatMoney(r.hoa_hong)}</td>
          <td></td>
        </tr>
      `;

      // Nợ 6421: Thưởng ghi nhận đóng góp (Q)
      detailRowsThuongDgHTML += `
        <tr class="detail-row-thuongdg" style="display: none; background: rgba(0,0,0,0.02);">
          <td></td>
          <td style="font-weight: 600;">3341</td>
          <td style="padding-left: 20px; font-size: 12px; color: var(--text-muted);">
            └─ ${escapeHtml(r.ten_nv)} (${escapeHtml(r.ma_nv)})
          </td>
          <td style="text-align: right;">${formatMoney(r.thuong_dong_gop)}</td>
          <td></td>
        </tr>
      `;

      // Nợ 6422: Lương tính toán
      detailRowsLuongTtHTML += `
        <tr class="detail-row-luongtt" style="display: none; background: rgba(0,0,0,0.02);">
          <td></td>
          <td style="font-weight: 600;">3341</td>
          <td style="padding-left: 20px; font-size: 12px; color: var(--text-muted);">
            └─ ${escapeHtml(r.ten_nv)} (${escapeHtml(r.ma_nv)})
          </td>
          <td style="text-align: right;">${formatMoney(r.luong_tinh_toan)}</td>
          <td></td>
        </tr>
      `;

      // Nợ 6422: Lương phép năm (R)
      detailRowsLuongPhepHTML += `
        <tr class="detail-row-luongphep" style="display: none; background: rgba(0,0,0,0.02);">
          <td></td>
          <td style="font-weight: 600;">3341</td>
          <td style="padding-left: 20px; font-size: 12px; color: var(--text-muted);">
            └─ ${escapeHtml(r.ten_nv)} (${escapeHtml(r.ma_nv)})
          </td>
          <td style="text-align: right;">${formatMoney(Math.round(r.luong_phep))}</td>
          <td></td>
        </tr>
      `;

      // Nợ 6422: Khác (S)
      detailRowsKhacHTML += `
        <tr class="detail-row-khac" style="display: none; background: rgba(0,0,0,0.02);">
          <td></td>
          <td style="font-weight: 600;">3341</td>
          <td style="padding-left: 20px; font-size: 12px; color: var(--text-muted);">
            └─ ${escapeHtml(r.ten_nv)} (${escapeHtml(r.ma_nv)})
          </td>
          <td style="text-align: right;">${formatMoney(r.khac)}</td>
          <td></td>
        </tr>
      `;

      // Có 3341: tổng các khoản Nợ ở trên (per nhân viên)
      const tong_phai_tra_nv = r.hoa_hong + r.thuong_dong_gop + r.luong_tinh_toan + r.luong_phep + r.khac;
      detailRows3341HTML += `
        <tr class="detail-row-3341" style="display: none; background: rgba(0,0,0,0.02);">
          <td style="font-weight: 600;">6421/6422</td>
          <td></td>
          <td style="padding-left: 20px; font-size: 12px; color: var(--text-muted);">
            └─ ${escapeHtml(r.ten_nv)} (${escapeHtml(r.ma_nv)})
          </td>
          <td style="text-align: right;">${formatMoney(Math.round(tong_phai_tra_nv))}</td>
          <td></td>
        </tr>
      `;

      // ---- Chi tiết theo từng nhân viên cho bảng "Trích BHXH và KPCĐ cty đóng" ----
      // Có 3383: BHXH (r.tong_ajakal = AJ + AK + AL)
      detailRows3383HTML += `
        <tr class="detail-row-3383" style="display: none; background: rgba(0,0,0,0.02);">
          <td></td>
          <td style="font-weight: 600;">3383</td>
          <td style="padding-left: 20px; font-size: 12px; color: var(--text-muted);">
            └─ ${escapeHtml(r.ten_nv)} (${escapeHtml(r.ma_nv)})
          </td>
          <td style="text-align: right;">${formatMoney(r.tong_ajakal)}</td>
          <td></td>
        </tr>
      `;

      // Có 3384: BHYT (cột AM)
      detailRows3384HTML += `
        <tr class="detail-row-3384" style="display: none; background: rgba(0,0,0,0.02);">
          <td></td>
          <td style="font-weight: 600;">3384</td>
          <td style="padding-left: 20px; font-size: 12px; color: var(--text-muted);">
            └─ ${escapeHtml(r.ten_nv)} (${escapeHtml(r.ma_nv)})
          </td>
          <td style="text-align: right;">${formatMoney(r.bhyt_cty)}</td>
          <td></td>
        </tr>
      `;

      // Có 3385: BHTN (cột AN)
      detailRows3385HTML += `
        <tr class="detail-row-3385" style="display: none; background: rgba(0,0,0,0.02);">
          <td></td>
          <td style="font-weight: 600;">3385</td>
          <td style="padding-left: 20px; font-size: 12px; color: var(--text-muted);">
            └─ ${escapeHtml(r.ten_nv)} (${escapeHtml(r.ma_nv)})
          </td>
          <td style="text-align: right;">${formatMoney(r.bhtn_cty)}</td>
          <td></td>
        </tr>
      `;

      // Có 3382: KPCĐ (cột AO)
      detailRows3382HTML += `
        <tr class="detail-row-3382" style="display: none; background: rgba(0,0,0,0.02);">
          <td></td>
          <td style="font-weight: 600;">3382</td>
          <td style="padding-left: 20px; font-size: 12px; color: var(--text-muted);">
            └─ ${escapeHtml(r.ten_nv)} (${escapeHtml(r.ma_nv)})
          </td>
          <td style="text-align: right;">${formatMoney(r.cd_cty)}</td>
          <td></td>
        </tr>
      `;

      // Nợ 6422 (tổng): BHXH + BHYT + BHTN + KPCĐ theo từng nhân viên
      const tong_6422_nv = r.tong_ajakal + r.bhyt_cty + r.bhtn_cty + r.cd_cty;
      detailRows6422HTML += `
        <tr class="detail-row-6422" style="display: none; background: rgba(0,0,0,0.02);">
          <td style="font-weight: 600;">6422</td>
          <td></td>
          <td style="padding-left: 20px; font-size: 12px; color: var(--text-muted);">
            └─ ${escapeHtml(r.ten_nv)} (${escapeHtml(r.ma_nv)})
          </td>
          <td style="text-align: right;">${formatMoney(tong_6422_nv)}</td>
          <td></td>
        </tr>
      `;

      // ---- Chi tiết theo từng nhân viên cho bảng "Trích BHXH và TNCN từ lương NLĐ" ----
      // Có 3383: BHXH (cột U)
      detailRowsNld3383HTML += `
        <tr class="detail-row-nld3383" style="display: none; background: rgba(0,0,0,0.02);">
          <td></td>
          <td style="font-weight: 600;">3383</td>
          <td style="padding-left: 20px; font-size: 12px; color: var(--text-muted);">
            └─ ${escapeHtml(r.ten_nv)} (${escapeHtml(r.ma_nv)})
          </td>
          <td style="text-align: right;">${formatMoney(r.bhxh_tru)}</td>
          <td></td>
        </tr>
      `;

      // Có 3384: BHYT (cột V)
      detailRowsNld3384HTML += `
        <tr class="detail-row-nld3384" style="display: none; background: rgba(0,0,0,0.02);">
          <td></td>
          <td style="font-weight: 600;">3384</td>
          <td style="padding-left: 20px; font-size: 12px; color: var(--text-muted);">
            └─ ${escapeHtml(r.ten_nv)} (${escapeHtml(r.ma_nv)})
          </td>
          <td style="text-align: right;">${formatMoney(r.bhyt_tru)}</td>
          <td></td>
        </tr>
      `;

      // Có 3385: BHTN (cột W)
      detailRowsNld3385HTML += `
        <tr class="detail-row-nld3385" style="display: none; background: rgba(0,0,0,0.02);">
          <td></td>
          <td style="font-weight: 600;">3385</td>
          <td style="padding-left: 20px; font-size: 12px; color: var(--text-muted);">
            └─ ${escapeHtml(r.ten_nv)} (${escapeHtml(r.ma_nv)})
          </td>
          <td style="text-align: right;">${formatMoney(r.bhtn_tru)}</td>
          <td></td>
        </tr>
      `;

      // Có 3335: Thuế TNCN (cột AB)
      detailRowsNld3335HTML += `
        <tr class="detail-row-nld3335" style="display: none; background: rgba(0,0,0,0.02);">
          <td></td>
          <td style="font-weight: 600;">3335</td>
          <td style="padding-left: 20px; font-size: 12px; color: var(--text-muted);">
            └─ ${escapeHtml(r.ten_nv)} (${escapeHtml(r.ma_nv)})
          </td>
          <td style="text-align: right;">${formatMoney(Math.round(r.thue_tncn))}</td>
          <td></td>
        </tr>
      `;

      // Nợ 3341 (tổng): BHXH + BHYT + BHTN + Thuế TNCN theo từng nhân viên
      const tong_nld_3341 = r.bhxh_tru + r.bhyt_tru + r.bhtn_tru + r.thue_tncn;
      detailRowsNld3341HTML += `
        <tr class="detail-row-nld3341" style="display: none; background: rgba(0,0,0,0.02);">
          <td style="font-weight: 600;">3341</td>
          <td></td>
          <td style="padding-left: 20px; font-size: 12px; color: var(--text-muted);">
            └─ ${escapeHtml(r.ten_nv)} (${escapeHtml(r.ma_nv)})
          </td>
          <td style="text-align: right;">${formatMoney(Math.round(tong_nld_3341))}</td>
          <td></td>
        </tr>
      `;
    });

    // Thêm dòng TỔNG CỘNG vào cuối bảng lương
    const totalTr = document.createElement("tr");
    totalTr.style.background = "var(--total-row-bg)";
    totalTr.innerHTML = `
      <td colspan="2" class="freeze-col-total" style="text-align: right; font-weight: 800; text-transform: uppercase;">Tổng cộng:</td>
      <td style="text-align: right; font-weight: 700; color: var(--amount-in);">${formatMoney(sumLuongCb)}</td>
      <td style="text-align: right; font-weight: 700; color: var(--amount-in);">${formatMoney(sumTrachNhiem)}</td>
      <td colspan="3"></td>
      <td style="text-align: right; font-weight: 700; color: var(--amount-in);">${formatMoney(sumTrangPhuc)}</td>
      <td style="text-align: right; font-weight: 700; color: var(--amount-in);">${formatMoney(sumComTrua)}</td>
      <td style="text-align: right; font-weight: 700; color: var(--amount-in);">${formatMoney(sumBhxh)}</td>
      <td style="text-align: right; font-weight: 800; color: var(--amount-in); font-size: 14px;">${formatMoney(sumLuongTinhToan)}</td>
      <td style="text-align: right; font-weight: 700; color: var(--amount-in);">${formatMoney(sumHoaHong)}</td>
      <td style="text-align: right; font-weight: 700; color: var(--amount-in);">${formatMoney(sumThuongDongGop)}</td>
      <td style="text-align: right; font-weight: 700; color: var(--amount-in);">${formatMoney(Math.round(sumLuongPhep))}</td>
      <td style="text-align: right; font-weight: 700; color: var(--amount-in);">${formatMoney(sumKhac)}</td>
      <td style="text-align: right; font-weight: 800; color: var(--amount-in); font-size: 14px;">${formatMoney(Math.round(sumTongThuNhap))}</td>
      <td style="text-align: right; font-weight: 700;">${formatMoney(sumBhxhTru)}</td>
      <td style="text-align: right; font-weight: 700;">${formatMoney(sumBhytTru)}</td>
      <td style="text-align: right; font-weight: 700;">${formatMoney(sumBhtnTru)}</td>
      <td style="text-align: right; font-weight: 700;">${formatMoney(sumCdTru)}</td>
      <td style="text-align: right; font-weight: 700;">${formatMoney(Math.round(sumThueTncn))}</td>
      <td style="text-align: right; font-weight: 800; color: var(--amount-in); font-size: 14px;">${formatMoney(Math.round(sumThucNhan))}</td>
      <td colspan="2"></td>
      <td style="text-align: right; font-weight: 700;">${formatMoney(sumHtTt)}</td>
      <td style="text-align: right; font-weight: 700;">${formatMoney(sumOdTs)}</td>
      <td style="text-align: right; font-weight: 700;">${formatMoney(sumTnldBnn)}</td>
      <td style="text-align: right; font-weight: 800; color: var(--amount-in); font-size: 14px;">${formatMoney(sumTongAjakal)}</td>
      <td style="text-align: right; font-weight: 700;">${formatMoney(sumBhytCty)}</td>
      <td style="text-align: right; font-weight: 700;">${formatMoney(sumBhtnCty)}</td>
      <td style="text-align: right; font-weight: 800; color: var(--amount-in); font-size: 14px;">${formatMoney(sumTongBhxhNld)}</td>
      <td style="text-align: right; font-weight: 800; color: var(--amount-in); font-size: 14px;">${formatMoney(sumTongBhxhMoi)}</td>
      <td style="text-align: right; font-weight: 700;">${formatMoney(sumCdCty)}</td>
    `;
    tbody.appendChild(totalTr);

    // Đổ dữ liệu vào bảng Hạch toán: các dòng Nợ sắp xếp số tiền giảm dần, Có 3341 ở cuối
    const sumTong3341 = Math.round(sumHoaHong + sumThuongDongGop + sumLuongTinhToan + sumLuongPhep + sumKhac);

    const accNoRows = [
      {
        amount: sumLuongTinhToan,
        detailKey: "luongtt",
        tkNo: "6422",
        label: "Lương tính toán",
        amountDisplay: formatMoney(sumLuongTinhToan),
        details: detailRowsLuongTtHTML
      },
      {
        amount: sumThuongDongGop,
        detailKey: "thuongdg",
        tkNo: "6421",
        label: "Thưởng ghi nhận đóng góp (Q)",
        amountDisplay: formatMoney(sumThuongDongGop),
        details: detailRowsThuongDgHTML
      },
      {
        amount: Math.round(sumLuongPhep),
        detailKey: "luongphep",
        tkNo: "6422",
        label: "Lương phép năm (R)",
        amountDisplay: formatMoney(Math.round(sumLuongPhep)),
        details: detailRowsLuongPhepHTML
      },
      {
        amount: sumHoaHong,
        detailKey: "hoahong",
        tkNo: "6421",
        label: "Hoa hồng bán hàng (P)",
        amountDisplay: formatMoney(sumHoaHong),
        details: detailRowsHoaHongHTML
      },
      {
        amount: sumKhac,
        detailKey: "khac",
        tkNo: "6422",
        label: "Khác (S)",
        amountDisplay: formatMoney(sumKhac),
        details: detailRowsKhacHTML
      }
    ];
    accNoRows.sort((a, b) => b.amount - a.amount);

    let accHTML = "";
    accNoRows.forEach(row => {
      accHTML += `
      <tr style="cursor: pointer; background: var(--badge-ok-bg); transition: 0.2s;" onclick="toggleAccDetail('${row.detailKey}')" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
        <td style="font-weight: 800; color: var(--accent); font-size: 14px;">${row.tkNo}</td>
        <td></td>
        <td style="font-weight: 700;">${row.label}</td>
        <td style="text-align: right; font-weight: 800; color: var(--amount-in); font-size: 14px;">${row.amountDisplay}</td>
        <td style="text-align: center;"><span id="icon-${row.detailKey}" style="font-size: 12px; color: var(--accent);">▼</span></td>
      </tr>
    `;
      accHTML += row.details;
    });

    accHTML += `
      <tr style="cursor: pointer; background: var(--badge-err-bg); transition: 0.2s;" onclick="toggleAccDetail('3341')" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
        <td></td>
        <td style="font-weight: 800; color: var(--accent); font-size: 14px;">3341</td>
        <td style="font-weight: 700;">Phải trả người lao động</td>
        <td style="text-align: right; font-weight: 800; color: var(--amount-in); font-size: 14px;">${formatMoney(sumTong3341)}</td>
        <td style="text-align: center;"><span id="icon-3341" style="font-size: 12px; color: var(--accent);">▼</span></td>
      </tr>
    `;
    accHTML += detailRows3341HTML;

    accTbody.innerHTML = accHTML;

    // Bảng con: Trích BHXH và KPCĐ cty đóng
    // Nợ 6422 = tổng 4 khoản Có bên dưới (3383 BHXH + 3384 BHYT + 3385 BHTN + 3382 KPCĐ)
    const sumBHXH_3383 = Math.round(sumTongAjakal);   // Cột "Tổng BHXH" (AJ+AK+AL)
    const sumBHYT_3384 = Math.round(sumBhytCty);      // Cột AM
    const sumBHTN_3385 = Math.round(sumBhtnCty);      // Cột AN
    const sumKPCD_3382 = Math.round(sumCdCty);        // Cột AO
    const sumTong6422 = sumBHXH_3383 + sumBHYT_3384 + sumBHTN_3385 + sumKPCD_3382;

    accTbody2.innerHTML = `
      <tr style="cursor: pointer; background: var(--badge-err-bg); transition: 0.2s;" onclick="toggleAccDetail('6422')" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
        <td style="font-weight: 800; color: var(--accent); font-size: 14px;">6422</td>
        <td></td>
        <td style="font-weight: 700;">Trích BHXH, KPCĐ cty đóng</td>
        <td style="text-align: right; font-weight: 800; color: var(--amount-in); font-size: 14px;">${formatMoney(sumTong6422)}</td>
        <td style="text-align: center;"><span id="icon-6422" style="font-size: 12px; color: var(--accent);">▼</span></td>
      </tr>
      ${detailRows6422HTML}
      <tr style="cursor: pointer; background: var(--badge-ok-bg); transition: 0.2s;" onclick="toggleAccDetail('3383')" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
        <td></td>
        <td style="font-weight: 800; color: var(--accent); font-size: 14px;">3383</td>
        <td style="font-weight: 700;">BHXH</td>
        <td style="text-align: right; font-weight: 700;">${formatMoney(sumBHXH_3383)}</td>
        <td style="text-align: center;"><span id="icon-3383" style="font-size: 12px; color: var(--accent);">▼</span></td>
      </tr>
      ${detailRows3383HTML}
      <tr style="cursor: pointer; background: var(--badge-ok-bg); transition: 0.2s;" onclick="toggleAccDetail('3384')" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
        <td></td>
        <td style="font-weight: 800; color: var(--accent); font-size: 14px;">3384</td>
        <td style="font-weight: 700;">BHYT</td>
        <td style="text-align: right; font-weight: 700;">${formatMoney(sumBHYT_3384)}</td>
        <td style="text-align: center;"><span id="icon-3384" style="font-size: 12px; color: var(--accent);">▼</span></td>
      </tr>
      ${detailRows3384HTML}
      <tr style="cursor: pointer; background: var(--badge-ok-bg); transition: 0.2s;" onclick="toggleAccDetail('3385')" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
        <td></td>
        <td style="font-weight: 800; color: var(--accent); font-size: 14px;">3385</td>
        <td style="font-weight: 700;">BHTN</td>
        <td style="text-align: right; font-weight: 700;">${formatMoney(sumBHTN_3385)}</td>
        <td style="text-align: center;"><span id="icon-3385" style="font-size: 12px; color: var(--accent);">▼</span></td>
      </tr>
      ${detailRows3385HTML}
      <tr style="cursor: pointer; background: var(--badge-ok-bg); transition: 0.2s;" onclick="toggleAccDetail('3382')" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
        <td></td>
        <td style="font-weight: 800; color: var(--accent); font-size: 14px;">3382</td>
        <td style="font-weight: 700;">KPCĐ</td>
        <td style="text-align: right; font-weight: 700;">${formatMoney(sumKPCD_3382)}</td>
        <td style="text-align: center;"><span id="icon-3382" style="font-size: 12px; color: var(--accent);">▼</span></td>
      </tr>
      ${detailRows3382HTML}
    `;

    // Bảng con: Trích BHXH và TNCN từ lương NLĐ
    // Nợ 3341 = tổng 4 khoản Có bên dưới (3383 BHXH + 3384 BHYT + 3385 BHTN + 3335 Thuế TNCN)
    const sumBHXH_U = Math.round(sumBhxhTru);     // Cột BHXH (U)
    const sumBHYT_V = Math.round(sumBhytTru);     // Cột BHYT (V)
    const sumBHTN_W = Math.round(sumBhtnTru);     // Cột BHTN (W)
    const sumTNCN_AB = Math.round(sumThueTncn);   // Cột Tiền thuế TNCN (AB)
    const sumTong3341Nld = sumBHXH_U + sumBHYT_V + sumBHTN_W + sumTNCN_AB;

    accTbody3.innerHTML = `
      <tr style="cursor: pointer; background: var(--badge-err-bg); transition: 0.2s;" onclick="toggleAccDetail('nld3341')" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
        <td style="font-weight: 800; color: var(--accent); font-size: 14px;">3341</td>
        <td></td>
        <td style="font-weight: 700;">Trích BHXH, thuế TNCN NLĐ đóng</td>
        <td style="text-align: right; font-weight: 800; color: var(--amount-in); font-size: 14px;">${formatMoney(sumTong3341Nld)}</td>
        <td style="text-align: center;"><span id="icon-nld3341" style="font-size: 12px; color: var(--accent);">▼</span></td>
      </tr>
      ${detailRowsNld3341HTML}
      <tr style="cursor: pointer; background: var(--badge-ok-bg); transition: 0.2s;" onclick="toggleAccDetail('nld3383')" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
        <td></td>
        <td style="font-weight: 800; color: var(--accent); font-size: 14px;">3383</td>
        <td style="font-weight: 700;">BHXH</td>
        <td style="text-align: right; font-weight: 700;">${formatMoney(sumBHXH_U)}</td>
        <td style="text-align: center;"><span id="icon-nld3383" style="font-size: 12px; color: var(--accent);">▼</span></td>
      </tr>
      ${detailRowsNld3383HTML}
      <tr style="cursor: pointer; background: var(--badge-ok-bg); transition: 0.2s;" onclick="toggleAccDetail('nld3384')" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
        <td></td>
        <td style="font-weight: 800; color: var(--accent); font-size: 14px;">3384</td>
        <td style="font-weight: 700;">BHYT</td>
        <td style="text-align: right; font-weight: 700;">${formatMoney(sumBHYT_V)}</td>
        <td style="text-align: center;"><span id="icon-nld3384" style="font-size: 12px; color: var(--accent);">▼</span></td>
      </tr>
      ${detailRowsNld3384HTML}
      <tr style="cursor: pointer; background: var(--badge-ok-bg); transition: 0.2s;" onclick="toggleAccDetail('nld3385')" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
        <td></td>
        <td style="font-weight: 800; color: var(--accent); font-size: 14px;">3385</td>
        <td style="font-weight: 700;">BHTN</td>
        <td style="text-align: right; font-weight: 700;">${formatMoney(sumBHTN_W)}</td>
        <td style="text-align: center;"><span id="icon-nld3385" style="font-size: 12px; color: var(--accent);">▼</span></td>
      </tr>
      ${detailRowsNld3385HTML}
      <tr style="cursor: pointer; background: var(--badge-ok-bg); transition: 0.2s;" onclick="toggleAccDetail('nld3335')" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
        <td></td>
        <td style="font-weight: 800; color: var(--accent); font-size: 14px;">3335</td>
        <td style="font-weight: 700;">Thuế TNCN</td>
        <td style="text-align: right; font-weight: 700;">${formatMoney(sumTNCN_AB)}</td>
        <td style="text-align: center;"><span id="icon-nld3335" style="font-size: 12px; color: var(--accent);">▼</span></td>
      </tr>
      ${detailRowsNld3335HTML}
    `;

    // Giữ đúng panel đang được chọn (mặc định 'luongthuong') khi đổi sheet
    applyAccTabView();

    // Bảng: Danh sách chuyển khoản lương - nhóm theo Ngân hàng (AF), mỗi ngân hàng 1 bảng riêng qua pill switch
    bankGroupsData = {};
    rows.forEach(r => {
      const bankKeyRaw = removeVietnameseDiacritics(r.ngan_hang || "").trim().toUpperCase();
      const bankKey = bankKeyRaw || "KHÁC";
      if (!bankGroupsData[bankKey]) bankGroupsData[bankKey] = [];
      bankGroupsData[bankKey].push(r);
    });
    const bankKeys = getSortedBankKeys();

    // Nội dung giao dịch theo tháng dùng cho nút Copy (không đổi theo ngân hàng)
    const monthMatch = selectedSheet.match(/^T(\d{2})(\d{4})$/i);
    currentBankTransferContent = monthMatch ? `CHI LUONG T${monthMatch[1]}/${monthMatch[2]}` : `CHI LUONG ${selectedSheet}`;

    if (bankKeys.length === 0) {
      currentBankTransferRows = [];
      const bankTabsWrapEmpty3 = document.getElementById("bankTabsWrap");
      if (bankTabsWrapEmpty3) bankTabsWrapEmpty3.innerHTML = "";
    } else {
      if (!bankActiveTab || !bankKeys.includes(bankActiveTab)) {
        bankActiveTab = bankKeys[0];
      }
      renderBankTabs(bankKeys);
      renderBankTransferTable();
    }
  }

  // Hiện card kết quả + mặc định tab Bảng lương (giữ tab đang chọn nếu đã có dữ liệu)
  if (resultCard) resultCard.style.display = "block";
  if (!empMainTab || !["luong", "dinhkhoan", "chuyenkhoan", "chamcong", "kiemtra", "congthuc"].includes(empMainTab)) {
    empMainTab = "luong";
  }
  applyEmpMainTabView();

  // Cột "Mã NV" co dãn theo độ dài mã dài nhất; cập nhật lại vị trí cố định (sticky)
  // của cột "Tên NV" ngay sau đó cho khớp, tránh bị đè/khuất chữ.
  updateFreezeCol1Width();
}

function updateFreezeCol1Width() {
  const table = document.getElementById("employeeTable");
  if (!table) return;
  const col1Cells = table.querySelectorAll("td.freeze-col-1, th.freeze-col-1");
  let maxWidth = 60;
  col1Cells.forEach(cell => {
    const w = cell.getBoundingClientRect().width;
    if (w > maxWidth) maxWidth = w;
  });
  const leftPx = Math.ceil(maxWidth) + "px";
  table.querySelectorAll("td.freeze-col-2, th.freeze-col-2").forEach(cell => {
    cell.style.left = leftPx;
  });
}

// Trả về danh sách mã ngân hàng đã sắp xếp: ACB lên đầu, còn lại theo bảng chữ cái
function getSortedBankKeys() {
  return Object.keys(bankGroupsData).sort((a, b) => {
    if (a === "ACB") return -1;
    if (b === "ACB") return 1;
    return a.localeCompare(b, 'vi');
  });
}

// Vẽ các nút pill switch giữa các ngân hàng
function renderBankTabs(bankKeys) {
  const tabsWrap = document.getElementById("bankTabsWrap");
  if (!tabsWrap) return;
  let html = "";
  bankKeys.forEach(key => {
    const count = (bankGroupsData[key] || []).length;
    const active = key === bankActiveTab ? " active" : "";
    const keyEscaped = escapeHtml(key);
    html += `<button type="button" class="acc-seg-btn${active}" onclick="switchBankTab('${key.replace(/'/g, "\\'")}')">${keyEscaped} (${count})</button>`;
  });
  tabsWrap.innerHTML = html;
}

// Chuyển tab ngân hàng đang xem
function switchBankTab(bankKey) {
  bankActiveTab = bankKey;
  renderBankTabs(getSortedBankKeys());
  renderBankTransferTable();
}

// Vẽ bảng chuyển khoản cho ngân hàng đang được chọn (tab hiện tại)
function renderBankTransferTable() {
  const bankTbody = document.getElementById("bankTransferTbody");
  if (!bankTbody) return;
  const formatMoney = (v) => Number(v).toLocaleString('vi-VN');
  const activeRows = bankGroupsData[bankActiveTab] || [];
  // Ghi nhớ dữ liệu gốc (số thật) của bảng đang hiển thị để dùng cho nút Copy
  currentBankTransferRows = activeRows;

  let bankHTML = "";
  let totalAmount = 0;
  activeRows.forEach((r, idx) => {
    const tenNvKhongDau = removeVietnameseDiacritics(r.ten_nv).toUpperCase();
    const soTienRounded = Math.round(r.thuc_nhan);
    totalAmount += soTienRounded;
    bankHTML += `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td style="font-weight: 600;">${escapeHtml(tenNvKhongDau)}</td>
        <td>${escapeHtml(r.stk)}</td>
        <td style="text-align: right; font-weight: 700; color: var(--amount-in);">${formatMoney(soTienRounded)}</td>
      </tr>
    `;
  });
  if (activeRows.length > 0) {
    bankHTML += `
      <tr style="background: var(--badge-ok-bg);">
        <td colspan="3" style="text-align: right; font-weight: 800;">Tổng cộng (${activeRows.length} người)</td>
        <td style="text-align: right; font-weight: 800; color: var(--amount-in); font-size: 14px;">${formatMoney(totalAmount)}</td>
      </tr>
    `;
  }
  bankTbody.innerHTML = bankHTML || `<tr><td colspan="4" style="text-align:center;">Không có dữ liệu.</td></tr>`;
}

function copyForMisaAmis() {
  try {
    const selectedSheet = document.getElementById("sheetSelect").value;
    if (!selectedSheet || !globalSheetsData[selectedSheet]) {
      alert("Vui lòng chọn Sheet (Tháng) để có dữ liệu.");
      return;
    }

    const rows = globalSheetsData[selectedSheet];
    const loaiNV = "Khác";

    // Ngày cuối tháng từ sheet TMMYYYY → dd/MM/yyyy (vd. T062026 → 30/06/2026)
    // Nhãn sheet trong diễn giải: T06/2026
    let dateStr = selectedSheet;
    let sheetLabel = selectedSheet;
    const sheetMatch = selectedSheet.match(/^T(\d{2})(\d{4})$/i);
    if (sheetMatch) {
      const month = parseInt(sheetMatch[1], 10);
      const year = parseInt(sheetMatch[2], 10);
      const lastDay = new Date(year, month, 0).getDate();
      dateStr = `${String(lastDay).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
      sheetLabel = `T${sheetMatch[1]}/${sheetMatch[2]}`;
    }

    // Các nhóm Nợ — thứ tự sort theo tổng số tiền giảm dần (giống bảng định khoản)
    const groups = [
      {
        key: "luongtt",
        tkNo: "6422",
        dienGiai: "Chi phí lương tháng " + sheetLabel,
        getAmount: (r) => r.luong_tinh_toan
      },
      {
        key: "thuongdg",
        tkNo: "6421",
        dienGiai: "Chi phí thưởng ghi nhận đóng góp " + sheetLabel,
        getAmount: (r) => r.thuong_dong_gop
      },
      {
        key: "luongphep",
        tkNo: "6422",
        dienGiai: "Chi phí lương phép năm " + sheetLabel,
        getAmount: (r) => r.luong_phep
      },
      {
        key: "hoahong",
        tkNo: "6421",
        dienGiai: "Hoa hồng bán hàng " + sheetLabel,
        getAmount: (r) => r.hoa_hong
      },
      {
        key: "khac",
        tkNo: "6422",
        dienGiai: "Chi phí khác " + sheetLabel,
        getAmount: (r) => r.khac
      }
    ];

    groups.forEach(g => {
      g.total = rows.reduce((s, r) => s + (Number(g.getAmount(r)) || 0), 0);
    });
    groups.sort((a, b) => b.total - a.total);

    const tsvLines = [];
    groups.forEach(g => {
      rows.forEach(r => {
        const amount = Number(g.getAmount(r)) || 0;
        if (amount > 0) {
          tsvLines.push([
            dateStr,                  // A: Ngày CT
            dateStr,                  // B: Ngày HT
            "",                       // C: Số CT
            g.dienGiai,               // D: Diễn giải
            loaiNV,                   // E: Loại nghiệp vụ
            "",                       // F: cột ẩn
            g.dienGiai,               // G: Diễn giải hạch toán
            g.tkNo,                   // H: TK Nợ
            "3341",                   // I: TK Có
            Math.round(amount),       // J: Số tiền
            "",                       // K: Mã ĐT Nợ
            r.ma_nv                   // L: Mã ĐT Có
          ].join("\t"));
        }
      });
    });

    if (tsvLines.length === 0) {
      alert("Không có phát sinh hạch toán nào.");
      return;
    }

    const tsv = tsvLines.join("\n") + "\n";

    navigator.clipboard.writeText(tsv).then(() => {
      const btn = document.getElementById("copyAmisBtn");
      const originalText = btn.innerHTML;
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-check-icon lucide-check-check"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg> Đã Copy! Dán vào file MISA';
      setTimeout(() => { btn.innerHTML = originalText; }, 3000);
    }).catch(() => { alert("Không thể copy. Vui lòng thử lại."); });

  } catch (e) {
    alert("Đã xảy ra lỗi: " + e.message);
  }
}

function copyForMisaAmisBhxh() {
  try {
    const selectedSheet = document.getElementById("sheetSelect").value;
    if (!selectedSheet || !globalSheetsData[selectedSheet]) {
      alert("Vui lòng chọn Sheet (Tháng) để có dữ liệu.");
      return;
    }

    const rows = globalSheetsData[selectedSheet];
    let tsvLines = [];

    // Ngày cuối tháng + nhãn sheet T06/2026 từ tên sheet (VD: T062026)
    let dateStr = selectedSheet;
    let thangStr = selectedSheet;
    const monthMatch = selectedSheet.match(/^T(\d{2})(\d{4})$/i);
    if (monthMatch) {
      const month = parseInt(monthMatch[1], 10);
      const year = parseInt(monthMatch[2], 10);
      const lastDay = new Date(year, month, 0).getDate();
      dateStr = `${String(lastDay).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
      thangStr = `T${monthMatch[1]}/${monthMatch[2]}`;
    }
    const loaiNV = ""; // Cột E bỏ trống theo yêu cầu

    // Diễn giải (cột D) LUÔN CỐ ĐỊNH cho mọi dòng
    const dienGiaiCoDinh = "Trích BHXH, BHYT, BHTN, KPCĐ cty đóng " + thangStr;

    // BƯỚC 1: Lần lượt từng nhân viên -> 3383 (BHXH) -> 3384 (BHYT) -> 3385 (BHTN)
    rows.forEach(r => {
      if (r.tong_ajakal > 0) {
        // Nếu NV không có HT-TT (AJ) và ÔĐ-TS (AK), chỉ có TNLĐ-BNN (AL) -> đổi diễn giải hạch toán riêng
        const chiCoTnlDBnn = (r.ht_tt === 0 && r.od_ts === 0 && r.tnld_bnn > 0);
        let dienGiaiHT = (chiCoTnlDBnn ? "Trích BHXH-TNBNN cty đóng " : "Trích BHXH cty đóng ") + thangStr;
        tsvLines.push([
          dateStr,                    // Cột A: Ngày CT
          dateStr,                    // Cột B: Ngày HT
          "",                         // Cột C: Số CT
          dienGiaiCoDinh,             // Cột D: Diễn giải (cố định)
          loaiNV,                     // Cột E: Loại nghiệp vụ
          "",                         // Cột F: BỊ ẨN TRONG EXCEL
          dienGiaiHT,                 // Cột G: Diễn giải hạch toán
          "6422",                     // Cột H: TK Nợ
          "3383",                     // Cột I: TK Có
          Math.round(r.tong_ajakal),  // Cột J: Số tiền
          r.ma_nv,                    // Cột K: Mã ĐT Nợ
          r.ma_nv                     // Cột L: Mã ĐT Có
        ].join("\t"));
      }
      if (r.bhyt_cty > 0) {
        let dienGiaiHT = "Trích BHYT cty đóng " + thangStr;
        tsvLines.push([
          dateStr, dateStr, "", dienGiaiCoDinh, loaiNV, "", dienGiaiHT,
          "6422", "3384", Math.round(r.bhyt_cty), r.ma_nv, r.ma_nv
        ].join("\t"));
      }
      if (r.bhtn_cty > 0) {
        let dienGiaiHT = "Trích BHTN cty đóng " + thangStr;
        tsvLines.push([
          dateStr, dateStr, "", dienGiaiCoDinh, loaiNV, "", dienGiaiHT,
          "6422", "3385", Math.round(r.bhtn_cty), r.ma_nv, r.ma_nv
        ].join("\t"));
      }
    });

    // BƯỚC 2: Sau khi hết danh sách NV ở bước 1, duyệt lại toàn bộ để xuất KPCĐ (3382) dồn cuối
    rows.forEach(r => {
      if (r.cd_cty > 0) {
        let dienGiaiHT = "Trích KPCĐ cty đóng " + thangStr;
        tsvLines.push([
          dateStr, dateStr, "", dienGiaiCoDinh, loaiNV, "", dienGiaiHT,
          "6422", "3382", Math.round(r.cd_cty), r.ma_nv, r.ma_nv
        ].join("\t"));
      }
    });

    if (tsvLines.length === 0) {
      alert("Không có phát sinh hạch toán nào.");
      return;
    }

    const tsv = tsvLines.join("\n") + "\n";

    navigator.clipboard.writeText(tsv).then(() => {
      const btn = document.getElementById("copyAmisBhxhBtn");
      const originalText = btn.innerHTML;
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-check-icon lucide-check-check"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg> Đã Copy! Dán vào file MISA';
      setTimeout(() => { btn.innerHTML = originalText; }, 3000);
    }).catch(() => { alert("Không thể copy. Vui lòng thử lại."); });

  } catch (e) {
    alert("Đã xảy ra lỗi: " + e.message);
  }
}

function copyForMisaAmisBhxhNld() {
  try {
    const selectedSheet = document.getElementById("sheetSelect").value;
    if (!selectedSheet || !globalSheetsData[selectedSheet]) {
      alert("Vui lòng chọn Sheet (Tháng) để có dữ liệu.");
      return;
    }

    const rows = globalSheetsData[selectedSheet];
    let tsvLines = [];

    // Ngày cuối tháng + nhãn sheet T06/2026 từ tên sheet (VD: T062026)
    let dateStr = selectedSheet;
    let thangStr = selectedSheet;
    const monthMatch = selectedSheet.match(/^T(\d{2})(\d{4})$/i);
    if (monthMatch) {
      const month = parseInt(monthMatch[1], 10);
      const year = parseInt(monthMatch[2], 10);
      const lastDay = new Date(year, month, 0).getDate();
      dateStr = `${String(lastDay).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
      thangStr = `T${monthMatch[1]}/${monthMatch[2]}`;
    }
    const loaiNV = ""; // Cột E bỏ trống theo yêu cầu

    // Diễn giải (cột D) LUÔN CỐ ĐỊNH cho mọi dòng
    const dienGiaiCoDinh = "Trích BHXH và TNCN từ lương NLĐ " + thangStr;

    // BƯỚC 1: Lần lượt từng nhân viên -> 3383 (BHXH) -> 3384 (BHYT) -> 3385 (BHTN)
    rows.forEach(r => {
      if (r.bhxh_tru > 0) {
        let dienGiaiHT = "Trích BHXH từ lương NLĐ " + thangStr;
        tsvLines.push([
          dateStr, dateStr, "", dienGiaiCoDinh, loaiNV, "", dienGiaiHT,
          "3341", "3383", Math.round(r.bhxh_tru), r.ma_nv, r.ma_nv
        ].join("\t"));
      }
      if (r.bhyt_tru > 0) {
        let dienGiaiHT = "Trích BHYT từ lương NLĐ " + thangStr;
        tsvLines.push([
          dateStr, dateStr, "", dienGiaiCoDinh, loaiNV, "", dienGiaiHT,
          "3341", "3384", Math.round(r.bhyt_tru), r.ma_nv, r.ma_nv
        ].join("\t"));
      }
      if (r.bhtn_tru > 0) {
        let dienGiaiHT = "Trích BHTN từ lương NLĐ " + thangStr;
        tsvLines.push([
          dateStr, dateStr, "", dienGiaiCoDinh, loaiNV, "", dienGiaiHT,
          "3341", "3385", Math.round(r.bhtn_tru), r.ma_nv, r.ma_nv
        ].join("\t"));
      }
    });

    // BƯỚC 2: Sau khi hết danh sách NV ở bước 1, duyệt lại toàn bộ để xuất Thuế TNCN (33351)
    rows.forEach(r => {
      if (r.thue_tncn > 0) {
        let dienGiaiHT = "Trích thuế TNCN từ lương NLĐ " + thangStr;
        tsvLines.push([
          dateStr, dateStr, "", dienGiaiCoDinh, loaiNV, "", dienGiaiHT,
          "3341", "33351", Math.round(r.thue_tncn), r.ma_nv, r.ma_nv
        ].join("\t"));
      }
    });

    if (tsvLines.length === 0) {
      alert("Không có phát sinh hạch toán nào.");
      return;
    }

    const tsv = tsvLines.join("\n") + "\n";

    navigator.clipboard.writeText(tsv).then(() => {
      const btn = document.getElementById("copyAmisBhxhNldBtn");
      const originalText = btn.innerHTML;
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-check-icon lucide-check-check"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg> Đã Copy! Dán vào file MISA';
      setTimeout(() => { btn.innerHTML = originalText; }, 3000);
    }).catch(() => { alert("Không thể copy. Vui lòng thử lại."); });

  } catch (e) {
    alert("Đã xảy ra lỗi: " + e.message);
  }
}
  
function switchAccTab(tab) {
  accActiveTab = tab;
  applyAccTabView();
}

function applyAccTabView() {
  const panels = {
    luongthuong: document.getElementById("accPanelLuongThuong"),
    bhxh: document.getElementById("accPanelBhxh"),
    bhxhnld: document.getElementById("accPanelBhxhNld")
  };
  const btns = {
    luongthuong: document.getElementById("accTabBtn-luongthuong"),
    bhxh: document.getElementById("accTabBtn-bhxh"),
    bhxhnld: document.getElementById("accTabBtn-bhxhnld")
  };
  if (!panels.luongthuong || !panels.bhxh || !panels.bhxhnld) return;
  Object.keys(panels).forEach(key => {
    panels[key].style.display = accActiveTab === key ? "block" : "none";
    if (btns[key]) btns[key].classList.toggle("active", accActiveTab === key);
  });
}

function switchEmpMainTab(tab) {
  // Giữ vị trí cuộn trang khi chuyển tab (tránh nhảy về đầu trang do thay đổi chiều cao panel)
  const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
  empMainTab = tab;
  applyEmpMainTabView();
  // Khôi phục scroll sau khi layout cập nhật (renderAttendanceTable / toggle display)
  requestAnimationFrame(() => {
    window.scrollTo(0, scrollY);
    // Một frame nữa đề phòng layout còn thay đổi (sticky cols, table render)
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollY);
    });
  });
}

/**
 * Từ tab Kiểm tra lỗi: chuyển sang Bảng chấm công và nháy dòng nhân viên tương ứng.
 * Gọi khi click MÃ NV bị Lệch / Cảnh báo (có dữ liệu chấm công).
 */
function jumpToAttendanceRow(maNv) {
  const ma = (maNv || "").trim().toUpperCase();
  if (!ma) return;

  // Chuyển tab (không giữ scroll cũ — sẽ cuộn tới dòng NV)
  empMainTab = "chamcong";
  applyEmpMainTabView();

  const tryHighlight = () => {
    const tbody = document.getElementById("attendanceTbody");
    if (!tbody) return false;
    // Xóa highlight cũ
    tbody.querySelectorAll("tr.att-row-flash").forEach(tr => tr.classList.remove("att-row-flash"));
    const row = tbody.querySelector(`tr[data-ma-nv="${CSS.escape(ma)}"]`);
    if (!row) return false;

    row.classList.add("att-row-flash");
    // Cuộn trong container bảng (nếu có) + đưa dòng vào giữa viewport
    const scrollBox = document.getElementById("attendanceTableScroll");
    if (scrollBox) {
      const rowTop = row.offsetTop;
      const target = Math.max(0, rowTop - scrollBox.clientHeight / 3);
      scrollBox.scrollTo({ top: target, behavior: "smooth" });
    }
    row.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });

    // Tự gỡ class sau khi animation kết thúc (để có thể nháy lại lần sau)
    window.clearTimeout(jumpToAttendanceRow._timer);
    jumpToAttendanceRow._timer = window.setTimeout(() => {
      row.classList.remove("att-row-flash");
    }, 3200);
    return true;
  };

  // Đợi bảng chấm công render xong (2 frame)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!tryHighlight()) {
        // Thử lại sau một nhịp ngắn nếu DOM chưa kịp
        setTimeout(tryHighlight, 80);
      }
    });
  });
}

function getAttendanceCodeClass(code) {
  const c = (code || "").toUpperCase();
  if (c === "L") return "att-code-l";
  if (c === "N") return "att-code-n";
  if (c === "P") return "att-code-p";
  if (c === "V") return "att-code-v";
  if (c === "K" || c === "U") return "att-code-k"; // U = không hưởng lương
  if (c === "S") return "att-code-s";               // S = nghỉ chế độ BHXH
  if (c === "H" || c === "LE" || c === "LỄ") return "att-code-le";
  return "";
}

function renderAttendanceTable() {
  const thead = document.getElementById("attendanceThead");
  const tbody = document.getElementById("attendanceTbody");
  const emptyMsg = document.getElementById("attendanceEmptyMsg");
  if (!thead || !tbody) return;

  const selectedSheet = document.getElementById("sheetSelect")?.value || "";
  let att = selectedSheet ? globalAttendanceData[selectedSheet] : null;

  // Fallback: nếu key không khớp chính xác, thử map theo tháng TMMYYYY
  if (!att && selectedSheet) {
    const m = selectedSheet.match(/^T(\d{2})(\d{4})$/i);
    if (m) {
      const keys = Object.keys(globalAttendanceData);
      // 1) Key dạng TMMYYYY cùng tháng/năm
      let found = keys.find(k => {
        const km = k.match(/^T(\d{2})(\d{4})$/i);
        return km && km[1] === m[1] && km[2] === m[2];
      });
      // 2) Key dạng tên sheet chứa tháng (vd. "CHẤM CÔNG T7", "Cham cong 07/2026")
      if (!found) {
        const mmNum = parseInt(m[1], 10);
        const yy = m[2];
        found = keys.find(k => {
          const kLow = k.toLowerCase();
          // T07/2026, T7/2026, 07/2026, tháng 7 2026...
          if (new RegExp(`(?:^|\\D)0?${mmNum}[\\/\\-\\s]?${yy}\\b`).test(k)) return true;
          if (kLow.includes(`t${m[1]}${yy}`) || kLow.includes(`t${mmNum}${yy}`)) return true;
          // Chỉ số tháng nếu tên có "chấm công" và đúng 1 key tháng đó
          const km2 = k.match(/(?:T|THÁNG\s*)(\d{1,2})\b/i);
          if (km2 && parseInt(km2[1], 10) === mmNum && kLow.match(/ch[aấ]m\s*c[oô]ng/i)) return true;
          return false;
        });
      }
      if (found) att = globalAttendanceData[found];
    }
  }
  // Chỉ fallback sang sheet chấm công duy nhất khi CHƯA chọn tháng
  // (tránh hiện nhầm tháng 07 khi user chọn T06, T08...)
  if (!att && !selectedSheet) {
    const keys = Object.keys(globalAttendanceData);
    if (keys.length === 1) att = globalAttendanceData[keys[0]];
  }

  thead.innerHTML = "";
  tbody.innerHTML = "";

  if (!att || !att.rows || att.rows.length === 0) {
    if (emptyMsg) {
      emptyMsg.style.display = "block";
      const available = Object.keys(globalAttendanceData || {});
      const availNote = available.length > 0
        ? ` Sheet chấm công đã đọc được: <b>${available.map(k => {
            const m = k.match(/^T(\d{2})(\d{4})$/i);
            return m ? `T${m[1]}/${m[2]}` : escapeHtml(k);
          }).join(", ")}</b>.`
        : " Chưa đọc được sheet chấm công nào từ file.";
      emptyMsg.innerHTML = selectedSheet
        ? `<span class="err">Không tìm thấy dữ liệu chấm công tương ứng với tháng <b>${escapeHtml(selectedSheet)}</b>.${availNote} Sheet cần tên dạng "CHẤM CÔNG T4" (hoặc chứa "CHẤM CÔNG") và có cột MÃ NV + các ngày trong tháng.</span>`
        : `<span class="err">Chưa có dữ liệu chấm công. Chọn file Excel có sheet chấm công rồi chọn tháng.</span>`;
    }
    return;
  }
  if (emptyMsg) emptyMsg.style.display = "none";

  const days = att.days || [];
  const weekdays = att.weekdays || [];

  // Header 2 dòng: thứ + số ngày — cột tổng gọn theo công thức (1)(2)(3)
  let h1 = `<tr><th class="freeze-col-1 att-th-ma" rowspan="2">Mã NV</th>`;
  weekdays.forEach((w) => {
    const isWeekend = /CN|T7/i.test(w);
    h1 += `<th class="att-th-day${isWeekend ? " is-weekend" : ""}">${escapeHtml(w || "")}</th>`;
  });
  h1 += `<th class="att-th-sum att-code-l" rowspan="2" title="Tổng Làm = count(L)">Σ L</th>`;
  h1 += `<th class="att-th-sum att-code-n" rowspan="2" title="Tổng Nghỉ tuần = count(N)">Σ N</th>`;
  h1 += `<th class="att-th-sum att-code-le" rowspan="2" title="Tổng Lễ = count(H)">Σ H</th>`;
  h1 += `<th class="att-th-sum att-code-v" rowspan="2" title="Tổng Vắng = count(V)">Σ V</th>`;
  h1 += `<th class="att-th-sum" rowspan="2" title="(1) Ngày công thực tế = tổng L">(1)<br>TT</th>`;
  h1 += `<th class="att-th-sum" rowspan="2" title="(2) Ngày công chuẩn = 30(31) − N">(2)<br>Chuẩn</th>`;
  h1 += `<th class="att-th-sum" rowspan="2" title="(3) Ngày công hưởng lương = L+H+P+V">(3)<br>HL</th>`;
  h1 += `</tr>`;

  let h2 = `<tr>`;
  days.forEach((d, i) => {
    const w = weekdays[i] || "";
    const isWeekend = /CN|T7/i.test(w);
    h2 += `<th class="att-th-day${isWeekend ? " is-weekend" : ""}">${d}</th>`;
  });
  h2 += `</tr>`;
  thead.innerHTML = h1 + h2;

  att.rows.forEach(r => {
    const tr = document.createElement("tr");
    const maNorm = (r.ma_nv || "").trim().toUpperCase();
    if (maNorm) tr.setAttribute("data-ma-nv", maNorm);

    // Đếm lại theo quy tắc mới (đảm bảo khớp cột tổng)
    let cntL = 0, cntN = 0, cntH = 0, cntP = 0, cntV = 0, cntU = 0, cntS = 0;
    (r.days || []).forEach(code => {
      const c = (code || "").toUpperCase();
      if (c === "L") cntL++;
      else if (c === "N") cntN++;
      else if (c === "P") cntP++;
      else if (c === "V") cntV++;
      else if (c === "U" || c === "K") cntU++;
      else if (c === "S") cntS++;
      else if (c === "H" || c === "LE" || c === "LỄ") cntH++;
    });
    // Ưu tiên số đã parse từ sheet nếu có, không thì dùng đếm
    const tongL = r.tong_lam !== "" && r.tong_lam != null ? r.tong_lam : cntL;
    const tongN = r.tong_nghi !== "" && r.tong_nghi != null ? r.tong_nghi : cntN;
    const tongH = r.tong_le !== "" && r.tong_le != null ? r.tong_le : cntH;
    const tongV = r.tong_vang !== "" && r.tong_vang != null ? r.tong_vang : cntV;
    const nctt = r.ngay_cong_thuc_te !== "" && r.ngay_cong_thuc_te != null
      ? r.ngay_cong_thuc_te
      : (typeof tongL === "number" ? tongL : cntL);
    const ncchuan = r.ngay_cong_chuan !== "" && r.ngay_cong_chuan != null
      ? r.ngay_cong_chuan
      : "";
    const nchl = r.ngay_cong_huong_luong !== "" && r.ngay_cong_huong_luong != null
      ? r.ngay_cong_huong_luong
      : (cntL + cntH + cntP + cntV);

    let tds = `<td class="freeze-col-1 att-ma">${escapeHtml(r.ma_nv)}</td>`;
    (r.days || []).forEach((code, i) => {
      const cls = getAttendanceCodeClass(code);
      const w = weekdays[i] || "";
      const isWeekend = /CN|T7/i.test(w);
      tds += `<td class="att-day ${cls}${isWeekend && !code ? " is-weekend-bg" : ""}">${escapeHtml(code || "")}</td>`;
    });
    for (let i = (r.days || []).length; i < days.length; i++) {
      tds += `<td class="att-day"></td>`;
    }
    tds += `<td class="att-sum att-code-l">${tongL}</td>`;
    tds += `<td class="att-sum att-code-n">${tongN}</td>`;
    tds += `<td class="att-sum att-code-le">${tongH}</td>`;
    tds += `<td class="att-sum att-code-v">${tongV !== "" ? tongV : ""}</td>`;
    tds += `<td class="att-sum att-sum-strong">${nctt !== "" ? nctt : ""}</td>`;
    tds += `<td class="att-sum">${ncchuan !== "" ? ncchuan : ""}</td>`;
    tds += `<td class="att-sum att-sum-strong">${nchl !== "" ? nchl : ""}</td>`;
    tr.innerHTML = tds;
    tbody.appendChild(tr);
  });
}

/** Lấy dữ liệu chấm công theo key tháng đang chọn (cùng logic map với renderAttendanceTable) */
function resolveAttendanceForSheet(selectedSheet) {
  if (!selectedSheet) return null;
  let att = globalAttendanceData[selectedSheet] || null;
  if (!att) {
    const m = selectedSheet.match(/^T(\d{2})(\d{4})$/i);
    if (m) {
      const keys = Object.keys(globalAttendanceData);
      let found = keys.find(k => {
        const km = k.match(/^T(\d{2})(\d{4})$/i);
        return km && km[1] === m[1] && km[2] === m[2];
      });
      if (!found) {
        const mmNum = parseInt(m[1], 10);
        const yy = m[2];
        found = keys.find(k => {
          const kLow = k.toLowerCase();
          if (new RegExp(`(?:^|\\D)0?${mmNum}[\\/\\-\\s]?${yy}\\b`).test(k)) return true;
          if (kLow.includes(`t${m[1]}${yy}`) || kLow.includes(`t${mmNum}${yy}`)) return true;
          const km2 = k.match(/(?:T|THÁNG\s*)(\d{1,2})\b/i);
          if (km2 && parseInt(km2[1], 10) === mmNum && kLow.match(/ch[aấ]m\s*c[oô]ng/i)) return true;
          return false;
        });
      }
      if (found) att = globalAttendanceData[found];
    }
  }
  return att;
}

/**
 * Tính kết quả đối soát CC ↔ Lương cho 1 tháng.
 *
 * Quy tắc chấm công (theo legend file mới):
 *   L = Làm việc
 *   N = Nghỉ tuần
 *   V = Vắng (không lý do / được phép năm bù)  — vẫn tính vào HL
 *   P = Nghỉ phép có lương
 *   H = Nghỉ lễ
 *   U = Không hưởng lương
 *   S = Nghỉ chế độ BHXH
 *   K = (cũ) Phép không lương — vẫn đếm nếu gặp
 *   TN/KH = Nghỉ việc riêng có lương (hiếu, hỉ) — ô chấm công ghi TN, KH hoặc TN/KH
 *   DL = Du lịch theo đoàn công ty
 *
 * Công thức:
 *   (1) Ngày công thực tế     = tổng L
 *   (2) Ngày công chuẩn       = số ngày trong tháng − N
 *   (3) Ngày công hưởng lương = L + H + P + V + TN/KH + DL
 *   L + N + H + P + V + U + S + TN/KH + DL = tổng số ngày trong tháng
 *
 * @returns {{ sheet, ok, err, warn, rows, attCount, payCount, hasData }}
 */
function computeAuditStats(selectedSheet) {
  const empty = { sheet: selectedSheet || "", ok: 0, err: 0, warn: 0, rows: [], attCount: 0, payCount: 0, hasData: false };
  if (!selectedSheet) return empty;

  const payRows = globalSheetsData[selectedSheet] || [];
  const att = resolveAttendanceForSheet(selectedSheet);

  // Số ngày trong tháng từ key sheet TMMYYYY (vd T082026 → 8/2026)
  let daysInMonth = 0;
  const mm = selectedSheet.match(/^T(\d{2})(\d{4})$/i);
  if (mm) {
    const month = parseInt(mm[1], 10);
    const year = parseInt(mm[2], 10);
    if (month >= 1 && month <= 12 && year > 2000) {
      daysInMonth = new Date(year, month, 0).getDate();
    }
  }

  const attMap = {};
  (att && att.rows ? att.rows : []).forEach(r => {
    const ma = (r.ma_nv || "").trim().toUpperCase();
    if (!ma) return;
    let L = 0, N = 0, P = 0, V = 0, K = 0, H = 0, U = 0, S = 0, TN = 0, DL = 0;
    (r.days || []).forEach(code => {
      const c = (code || "").toUpperCase();
      if (c === "L") L++;
      else if (c === "N") N++;
      else if (c === "P") P++;
      else if (c === "V") V++;
      else if (c === "K") K++;
      else if (c === "U") U++;
      else if (c === "S") S++;
      else if (c === "TN" || c === "KH" || c === "TN/KH") TN++;
      else if (c === "DL") DL++;
      else if (c === "H" || c === "LE" || c === "LỄ") H++;
    });
    // (1) Công TT = tổng L
    // (2) Công chuẩn = daysInMonth − N (nếu biết số ngày tháng)
    // (3) Công HL = L + H + P + V + TN/KH + DL
    attMap[ma] = {
      L_count: L, N, P, V, K, H, U, S, TN, DL,
      cong_tt_cc: L,
      cong_chuan_cc: daysInMonth > 0 ? daysInMonth - N : "",
      cong_hl_uoc: L + H + P + V + TN + DL
    };
  });

  const payMap = {};
  payRows.forEach(r => {
    const ma = (r.ma_nv || "").trim().toUpperCase();
    if (!ma) return;
    payMap[ma] = {
      ten: r.ten_nv || "",
      nctt: r.ngay_cong_tt,
      nchl: r.ngay_cong_hl
    };
  });

  const allMa = Array.from(new Set([...Object.keys(attMap), ...Object.keys(payMap)])).sort((a, b) => a.localeCompare(b, "vi"));
  let ok = 0, err = 0, warn = 0;
  const rows = [];

  allMa.forEach(ma => {
    const a = attMap[ma];
    const p = payMap[ma];
    const issues = [];
    let status = "ok";

    if (a && !p) {
      status = "warn";
      issues.push("Có chấm công, không có dòng lương");
    } else if (!a && p) {
      status = "warn";
      issues.push("Có bảng lương, không có chấm công");
    } else if (a && p) {
      const nctt = parseFloat(p.nctt);
      const nchl = parseFloat(p.nchl);
      if (!isNaN(nctt) && nctt !== a.cong_tt_cc) {
        status = "err";
        issues.push(`Công TT: CC=${a.cong_tt_cc} ≠ Lương=${nctt}`);
      }
      if (!isNaN(nchl) && nchl !== a.cong_hl_uoc) {
        status = "err";
        issues.push(`Công HL: ước L+H+P+V+TN/KH+DL=${a.cong_hl_uoc} ≠ Lương=${nchl}`);
      }
      if (issues.length === 0) {
        status = "ok";
        issues.push("Khớp công TT & HL");
      }
    }

    if (status === "ok") ok++;
    else if (status === "err") err++;
    else warn++;

    rows.push({ ma, a, p, status, issues });
  });

  return {
    sheet: selectedSheet,
    ok, err, warn,
    rows,
    attCount: Object.keys(attMap).length,
    payCount: Object.keys(payMap).length,
    hasData: allMa.length > 0
  };
}

/** Cập nhật badge trên tab + banner cảnh báo (P1) */
function updateAuditAlerts() {
  const selectedSheet = document.getElementById("sheetSelect")?.value || "";
  const badge = document.getElementById("empAuditBadge");
  const banner = document.getElementById("empAuditBanner");
  const card = document.getElementById("employeeResultCard");

  // Ẩn khi chưa có card / chưa chọn tháng
  if (!selectedSheet || (card && card.style.display === "none")) {
    if (badge) { badge.style.display = "none"; badge.textContent = ""; }
    if (banner) { banner.style.display = "none"; banner.innerHTML = ""; }
    return;
  }

  const stats = computeAuditStats(selectedSheet);
  const problem = stats.err + stats.warn;

  if (badge) {
    if (problem > 0) {
      badge.style.display = "inline-flex";
      badge.textContent = String(problem);
      badge.classList.remove("is-err", "is-warn");
      badge.classList.add(stats.err > 0 ? "is-err" : "is-warn");
      badge.title = stats.err > 0
        ? `${stats.err} lệch, ${stats.warn} cảnh báo`
        : `${stats.warn} cảnh báo`;
    } else {
      badge.style.display = "none";
      badge.textContent = "";
    }
  }

  if (banner) {
    // Ẩn banner khi đang đứng ngay tab Kiểm tra lỗi (tránh trùng thông tin)
    if (problem > 0 && empMainTab !== "kiemtra") {
      banner.style.display = "flex";
      banner.classList.remove("is-err", "is-warn");
      banner.classList.add(stats.err > 0 ? "is-err" : "is-warn");
      const sheetLabel = (() => {
        const m = selectedSheet.match(/^T(\d{2})(\d{4})$/i);
        return m ? `T${m[1]}/${m[2]}` : selectedSheet;
      })();
      const parts = [];
      if (stats.err > 0) parts.push(`<b>${stats.err} lệch công</b>`);
      if (stats.warn > 0) parts.push(`<b>${stats.warn} cảnh báo</b>`);
      banner.innerHTML = `
        <span>⚠ Tháng ${escapeHtml(sheetLabel)}: ${parts.join(", ")} (đối soát chấm công ↔ bảng lương).</span>
        <button type="button" class="emp-audit-link" onclick="switchEmpMainTab('kiemtra')">Xem chi tiết →</button>
      `;
    } else {
      banner.style.display = "none";
      banner.innerHTML = "";
    }
  }
}

/**
 * Kiểm tra chéo Chấm công ↔ Bảng lương — render bảng chi tiết
 */
function renderAuditTable() {
  const tbody = document.getElementById("auditTbody");
  const emptyMsg = document.getElementById("auditEmptyMsg");
  const summaryEl = document.getElementById("auditSummary");
  if (!tbody) return;

  const selectedSheet = document.getElementById("sheetSelect")?.value || "";
  tbody.innerHTML = "";

  if (!selectedSheet) {
    if (emptyMsg) {
      emptyMsg.style.display = "block";
      emptyMsg.innerHTML = `<span class="err">Chưa chọn tháng. Hãy chọn tháng trên dropdown rồi mở tab Kiểm tra lỗi.</span>`;
    }
    if (summaryEl) summaryEl.textContent = "Chưa chọn tháng.";
    updateAuditAlerts();
    return;
  }

  const stats = computeAuditStats(selectedSheet);

  if (!stats.hasData) {
    if (emptyMsg) {
      emptyMsg.style.display = "block";
      emptyMsg.innerHTML = `<span class="err">Tháng <b>${escapeHtml(selectedSheet)}</b> không có dữ liệu bảng lương lẫn chấm công để đối soát.</span>`;
    }
    if (summaryEl) summaryEl.textContent = "Không có dữ liệu.";
    updateAuditAlerts();
    return;
  }
  if (emptyMsg) emptyMsg.style.display = "none";

  // Dồn lỗi lên đầu: Lệch → Cảnh báo → OK
  const statusOrder = { err: 0, warn: 1, ok: 2 };
  const sortedRows = [...stats.rows].sort((x, y) => {
    const sx = statusOrder[x.status] ?? 9;
    const sy = statusOrder[y.status] ?? 9;
    if (sx !== sy) return sx - sy;
    return (x.ma || "").localeCompare(y.ma || "", "vi");
  });

  sortedRows.forEach((row, idx) => {
    const { ma, a, p, status, issues } = row;
    const tr = document.createElement("tr");
    if (status === "err") tr.classList.add("audit-row-err");
    else if (status === "warn") tr.classList.add("audit-row-warn");

    const badge = status === "ok"
      ? `<span class="badge ok">OK</span>`
      : status === "err"
        ? `<span class="badge err">Lệch</span>`
        : `<span class="badge" style="background:#fff3e0;color:#e67e22;">Cảnh báo</span>`;

    const cell = (v, cls) => {
      const empty = v === undefined || v === null || v === "";
      return `<td class="audit-td${cls ? " " + cls : ""}">${empty ? "—" : escapeHtml(String(v))}</td>`;
    };

    // Lệch / Cảnh báo / có CC: click MÃ NV (hoặc cả dòng) → tab Chấm công + nháy dòng
    const canJump = (status === "err" || status === "warn" || !!a);
    if (canJump) {
      tr.classList.add("audit-row-clickable");
      tr.setAttribute("data-jump-ma", ma);
      tr.title = `Bấm để xem chấm công của ${ma}`;
    }

    const maCell = canJump
      ? `<td class="freeze-col-1"><a href="javascript:void(0)" class="audit-ma-link" data-jump-ma="${escapeHtml(ma)}" role="button">${escapeHtml(ma)}</a></td>`
      : `<td class="freeze-col-1" style="font-weight:600; color:var(--accent);">${escapeHtml(ma)}</td>`;

    // Highlight số lệch giữa CC và Lương
    const ncttCc = a ? a.cong_tt_cc : null;
    const ncttLuong = p && p.nctt != null ? p.nctt : null;
    const nchlCc = a ? a.cong_hl_uoc : null;
    const nchlLuong = p && p.nchl != null ? p.nchl : null;
    const ttMismatch = ncttCc != null && ncttLuong != null && Number(ncttCc) !== Number(ncttLuong);
    const hlMismatch = nchlCc != null && nchlLuong != null && Number(nchlCc) !== Number(nchlLuong);

    tr.innerHTML = `
      <td class="audit-td audit-td-stt">${idx + 1}</td>
      ${maCell}
      ${cell(a ? a.L_count : "", "att-code-l")}
      ${cell(a ? a.H : "", "att-code-le")}
      ${cell(a ? a.P : "", "att-code-p")}
      ${cell(a ? a.V : "", "att-code-v")}
      ${cell(a ? a.TN : "")}
      ${cell(a ? a.DL : "")}
      ${cell(a ? a.U : "", "att-code-k")}
      ${cell(a ? a.S : "", "att-code-s")}
      ${cell(a ? a.N : "", "att-code-n")}
      ${cell(ncttCc, ttMismatch ? "audit-mismatch" : "att-sum-strong")}
      ${cell(ncttLuong, ttMismatch ? "audit-mismatch" : "")}
      ${cell(nchlCc, hlMismatch ? "audit-mismatch" : "att-sum-strong")}
      ${cell(nchlLuong, hlMismatch ? "audit-mismatch" : "")}
      <td class="audit-td">${badge}</td>
      <td class="audit-td-detail">${escapeHtml(issues.join("; "))}</td>
    `;
    tbody.appendChild(tr);
  });

  // Event delegation: click MÃ NV hoặc cả dòng → nhảy sang chấm công
  if (!tbody._auditJumpBound) {
    tbody._auditJumpBound = true;
    tbody.addEventListener("click", (e) => {
      const link = e.target.closest("[data-jump-ma]");
      if (!link) return;
      e.preventDefault();
      const ma = link.getAttribute("data-jump-ma");
      if (ma) jumpToAttendanceRow(ma);
    });
  }

  if (summaryEl) {
    const attNote = stats.attCount > 0 ? `CC: ${stats.attCount} NV` : "CC: không có";
    const payNote = `Lương: ${stats.payCount} NV`;
    summaryEl.innerHTML = `Tháng <b>${escapeHtml(selectedSheet)}</b> · ${attNote} · ${payNote} · ` +
      `<span style="color:var(--amount-in);">OK ${stats.ok}</span> · ` +
      `<span style="color:var(--badge-err-text);">Lệch ${stats.err}</span> · ` +
      `<span style="color:#e67e22;">Cảnh báo ${stats.warn}</span>`;
  }

  updateAuditAlerts();
}

/**
 * Kiểm tra công thức cộng tiền trên bảng lương.
 * Sai lệch cho phép ≤ 1 đồng (làm tròn).
 *
 * F0: Lương TT = round((H/K)*L) + M+N+O+P   (tính từ thành phần — dùng làm gốc)
 * F1: Tổng TN (U) ≟ Lương TT + Q + R + S + T
 * F2: Tổng trừ (Z) ≟ V + W + X + Y
 * F3: Thực nhận (AE) ≟ U − (V+W+X+Y) − AC − AD
 */
function computeFormulaAuditStats(selectedSheet) {
  const empty = { sheet: selectedSheet || "", ok: 0, err: 0, warn: 0, rows: [], payCount: 0, hasData: false };
  if (!selectedSheet) return empty;

  const payRows = globalSheetsData[selectedSheet] || [];
  if (!payRows.length) return empty;

  const TOL = 1; // cho phép lệch 1 đồng do làm tròn
  let ok = 0, err = 0, warn = 0;
  const rows = [];

  payRows.forEach(r => {
    const ma = (r.ma_nv || "").trim().toUpperCase();
    if (!ma) return;

    const luongTt = Math.round(r.luong_tinh_toan || 0);
    const tongTnExcel = Math.round(r.tong_thu_nhap || 0);
    const tongTnTinh = Math.round(luongTt + (r.hoa_hong || 0) + (r.thuong_dong_gop || 0) + (r.luong_phep || 0) + (r.khac || 0));
    const truTinh = Math.round((r.bhxh_tru || 0) + (r.bhyt_tru || 0) + (r.bhtn_tru || 0) + (r.cd_tru || 0));
    const truExcel = Math.round(r.tong_khau_tru || 0);
    const thue = Math.round(r.thue_tncn || 0);
    const tamUng = Math.round(r.tam_ung || 0);
    const thucNhanExcel = Math.round(r.thuc_nhan || 0);
    const thucNhanTinh = Math.round(tongTnExcel - truTinh - thue - tamUng);

    const issues = [];
    let status = "ok";

    // Cảnh báo thiếu dữ liệu cơ bản
    if (!r.luong_cb && !tongTnExcel && !thucNhanExcel) {
      status = "warn";
      issues.push("Thiếu dữ liệu lương");
    } else {
      // F1: Tổng thu nhập
      if (Math.abs(tongTnExcel - tongTnTinh) > TOL) {
        status = "err";
        issues.push(`F1 Tổng TN: U=${tongTnExcel.toLocaleString("vi-VN")} ≠ tính=${tongTnTinh.toLocaleString("vi-VN")} (Δ=${(tongTnExcel - tongTnTinh).toLocaleString("vi-VN")})`);
      }
      // F2: Tổng khấu trừ (chỉ so khi Excel có Z > 0 hoặc có thành phần trừ)
      if (truExcel > 0 || truTinh > 0) {
        if (Math.abs(truExcel - truTinh) > TOL) {
          status = "err";
          issues.push(`F2 Σ trừ: Z=${truExcel.toLocaleString("vi-VN")} ≠ V+W+X+Y=${truTinh.toLocaleString("vi-VN")} (Δ=${(truExcel - truTinh).toLocaleString("vi-VN")})`);
        }
      }
      // F3: Thực nhận
      if (thucNhanExcel > 0 || tongTnExcel > 0) {
        if (Math.abs(thucNhanExcel - thucNhanTinh) > TOL) {
          status = "err";
          issues.push(`F3 Thực nhận: AE=${thucNhanExcel.toLocaleString("vi-VN")} ≠ tính=${thucNhanTinh.toLocaleString("vi-VN")} (Δ=${(thucNhanExcel - thucNhanTinh).toLocaleString("vi-VN")})`);
        }
      }
      if (issues.length === 0) {
        status = "ok";
        issues.push("Khớp F1–F3");
      }
    }

    if (status === "ok") ok++;
    else if (status === "err") err++;
    else warn++;

    rows.push({
      ma,
      ten: r.ten_nv || "",
      status,
      issues,
      luongTt,
      tongTnExcel,
      tongTnTinh,
      truTinh,
      truExcel,
      thucNhanExcel,
      thucNhanTinh,
      f1ok: Math.abs(tongTnExcel - tongTnTinh) <= TOL,
      f2ok: !(truExcel > 0 || truTinh > 0) || Math.abs(truExcel - truTinh) <= TOL,
      f3ok: !(thucNhanExcel > 0 || tongTnExcel > 0) || Math.abs(thucNhanExcel - thucNhanTinh) <= TOL
    });
  });

  return {
    sheet: selectedSheet,
    ok, err, warn,
    rows,
    payCount: rows.length,
    hasData: rows.length > 0
  };
}

function renderFormulaAuditTable() {
  const tbody = document.getElementById("formulaAuditTbody");
  const emptyMsg = document.getElementById("formulaAuditEmptyMsg");
  const summaryEl = document.getElementById("formulaAuditSummary");
  const badge = document.getElementById("empFormulaBadge");
  if (!tbody) return;

  const selectedSheet = document.getElementById("sheetSelect")?.value || "";
  tbody.innerHTML = "";

  if (!selectedSheet) {
    if (emptyMsg) {
      emptyMsg.style.display = "block";
      emptyMsg.innerHTML = `<span class="err">Chưa chọn tháng. Hãy chọn tháng trên dropdown rồi mở tab Công thức.</span>`;
    }
    if (summaryEl) summaryEl.textContent = "Chưa chọn tháng.";
    if (badge) { badge.style.display = "none"; badge.textContent = ""; }
    return;
  }

  const stats = computeFormulaAuditStats(selectedSheet);

  if (badge) {
    if (stats.err + stats.warn > 0) {
      badge.style.display = "inline-flex";
      badge.textContent = String(stats.err + stats.warn);
      badge.classList.remove("is-err", "is-warn");
      badge.classList.add(stats.err > 0 ? "is-err" : "is-warn");
    } else {
      badge.style.display = "none";
      badge.textContent = "";
    }
  }

  if (!stats.hasData) {
    if (emptyMsg) {
      emptyMsg.style.display = "block";
      emptyMsg.innerHTML = `<span class="err">Tháng <b>${escapeHtml(selectedSheet)}</b> không có dữ liệu bảng lương để kiểm tra công thức.</span>`;
    }
    if (summaryEl) summaryEl.textContent = "Không có dữ liệu.";
    return;
  }
  if (emptyMsg) emptyMsg.style.display = "none";

  const statusOrder = { err: 0, warn: 1, ok: 2 };
  const sortedRows = [...stats.rows].sort((x, y) => {
    const sx = statusOrder[x.status] ?? 9;
    const sy = statusOrder[y.status] ?? 9;
    if (sx !== sy) return sx - sy;
    return (x.ma || "").localeCompare(y.ma || "", "vi");
  });

  const fmt = (n) => (n === undefined || n === null || n === "") ? "—" : Number(n).toLocaleString("vi-VN");

  sortedRows.forEach((row, idx) => {
    const tr = document.createElement("tr");
    if (row.status === "err") tr.classList.add("audit-row-err");
    else if (row.status === "warn") tr.classList.add("audit-row-warn");

    const badgeHtml = row.status === "ok"
      ? `<span class="badge ok">OK</span>`
      : row.status === "err"
        ? `<span class="badge err">Lệch</span>`
        : `<span class="badge" style="background:#fff3e0;color:#e67e22;">Cảnh báo</span>`;

    tr.innerHTML = `
      <td class="audit-td audit-td-stt">${idx + 1}</td>
      <td class="freeze-col-1" style="font-weight:600; color:var(--accent);">${escapeHtml(row.ma)}</td>
      <td class="audit-td">${fmt(row.luongTt)}</td>
      <td class="audit-td${!row.f1ok ? " audit-mismatch" : ""}">${fmt(row.tongTnExcel)}</td>
      <td class="audit-td${!row.f1ok ? " audit-mismatch" : " att-sum-strong"}">${fmt(row.tongTnTinh)}</td>
      <td class="audit-td${!row.f2ok ? " audit-mismatch" : " att-sum-strong"}">${fmt(row.truTinh)}</td>
      <td class="audit-td${!row.f2ok ? " audit-mismatch" : ""}">${fmt(row.truExcel)}</td>
      <td class="audit-td${!row.f3ok ? " audit-mismatch" : ""}">${fmt(row.thucNhanExcel)}</td>
      <td class="audit-td${!row.f3ok ? " audit-mismatch" : " att-sum-strong"}">${fmt(row.thucNhanTinh)}</td>
      <td class="audit-td">${badgeHtml}</td>
      <td class="audit-td-detail">${escapeHtml(row.issues.join("; "))}</td>
    `;
    tbody.appendChild(tr);
  });

  if (summaryEl) {
    summaryEl.innerHTML = `Tháng <b>${escapeHtml(selectedSheet)}</b> · Lương: ${stats.payCount} NV · ` +
      `<span style="color:var(--amount-in);">OK ${stats.ok}</span> · ` +
      `<span style="color:var(--badge-err-text);">Lệch ${stats.err}</span> · ` +
      `<span style="color:#e67e22;">Cảnh báo ${stats.warn}</span>`;
  }
}

function applyEmpMainTabView() {
  const panels = {
    luong: document.getElementById("employeeTableWrapper"),
    dinhkhoan: document.getElementById("accountingWrapper"),
    chuyenkhoan: document.getElementById("bankTransferWrapper"),
    chamcong: document.getElementById("attendanceWrapper"),
    kiemtra: document.getElementById("auditWrapper"),
    congthuc: document.getElementById("formulaAuditWrapper")
  };
  const btns = {
    luong: document.getElementById("empMainBtn-luong"),
    dinhkhoan: document.getElementById("empMainBtn-dinhkhoan"),
    chuyenkhoan: document.getElementById("empMainBtn-chuyenkhoan"),
    chamcong: document.getElementById("empMainBtn-chamcong"),
    kiemtra: document.getElementById("empMainBtn-kiemtra"),
    congthuc: document.getElementById("empMainBtn-congthuc")
  };
  const titleEl = document.getElementById("employeeResultTitle");
  const titles = {
    luong: "Bảng lương chi tiết",
    dinhkhoan: "Định khoản Hạch toán",
    chuyenkhoan: "Danh sách chuyển khoản lương",
    chamcong: "Bảng chấm công",
    kiemtra: "Kiểm tra lỗi (CC ↔ Lương)",
    congthuc: "Kiểm tra công thức lương"
  };
  Object.keys(panels).forEach(key => {
    if (panels[key]) panels[key].style.display = empMainTab === key ? "block" : "none";
    if (btns[key]) btns[key].classList.toggle("active", empMainTab === key);
  });
  if (titleEl) titleEl.textContent = titles[empMainTab] || "Dữ liệu nhân sự";
  if (empMainTab === "luong") {
    // Cập nhật lại sticky cột sau khi panel hiện lại
    setTimeout(updateFreezeCol1Width, 0);
  }
  if (empMainTab === "chamcong") {
    renderAttendanceTable();
  }
  if (empMainTab === "kiemtra") {
    renderAuditTable();
  } else if (empMainTab === "congthuc") {
    renderFormulaAuditTable();
  } else {
    // Cập nhật badge + banner khi đang ở tab khác (banner ẩn khi đang ở kiemtra)
    updateAuditAlerts();
  }
}
  
function appendRowToDOM(rowObj, tbody) {
  let tr = document.createElement("tr"); let tds = ''; let errorPrinted = false; 
  currentColumns.forEach(col => {
    if (!col.visible) return;
    if (col.key === 'status') { tds += `<td>${rowObj.badgeHTML}</td>`; } 
    else if (rowObj.isError) {
      if (!errorPrinted) { tds += `<td><span style="color:var(--badge-err-text); font-weight:600;">${escapeHtml(rowObj.errorMsg)}</span></td>`; errorPrinted = true; } 
      else { tds += `<td></td>`; }
    } else { tds += `<td>${escapeHtml(rowObj.raw[col.key] || "")}</td>`; }
  });
  tr.innerHTML = tds; tbody.appendChild(tr);
}
  
async function doBulkLookup() {
  const rawInput = document.getElementById("bulkCodes").value;
  const codes = rawInput.split(/[\n,; \t]+/).map(c => c.trim()).filter(c => c !== "");
  const saSystem = document.getElementById("bulkSaSystem").value;
  const btn = document.getElementById("bulkBtn"); const progress = document.getElementById("bulkProgress");
  const tableWrap = document.getElementById("bulkTableWrap"); const copyBtn = document.getElementById("copyExcelBtn");
  if (codes.length === 0) { progress.style.display = 'block'; progress.innerHTML = '<span class="err">Vui lòng nhập ít nhất 1 mã đơn.</span>'; return; }
  const hasSaCode = codes.some(c => c.toUpperCase().startsWith("SA"));
  if (hasSaCode && !saSystem) { progress.style.display = 'block'; progress.innerHTML = '<span class="err">Danh sách có mã SA... — vui lòng chọn hệ thống tra cứu (10X hoặc SOLOBIZ) ở trên trước khi chạy.</span>'; return; }
  btn.disabled = true; bulkData = []; progress.style.display = 'block'; tableWrap.style.display = 'block'; copyBtn.style.display = 'none';
  renderBulkTable(); const tbody = document.getElementById("bulkTbody"); let successCount = 0;
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i]; progress.innerHTML = `<span class="spinner" style="color:var(--accent)"></span> Đang xử lý ${i + 1}/${codes.length}... (${code})`;
    let rowObj = { code: code, raw: {}, isError: false, errorMsg: "" };
    try {
      const resp = await fetch("/api/index", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "lookup", code, sa_system: saSystem, access_token: getToken() }) });
      const data = await resp.json();
      if (resp.ok) {
        const ok = data.status_msg === "Thành công"; if (ok) successCount++;
        const badgeText = ok ? 'Thành công' : (data.status_msg || 'Thất bại');
        rowObj.badgeHTML = ok ? `<span class="badge ok">${escapeHtml(badgeText)}</span>` : `<span class="badge err">${escapeHtml(badgeText)}</span>`; rowObj.raw = data;
      } else { rowObj.isError = true; rowObj.badgeHTML = `<span class="badge err">Lỗi</span>`; rowObj.errorMsg = `${data.error || "Lỗi server"} (${code})`; }
    } catch (e) { rowObj.isError = true; rowObj.badgeHTML = `<span class="badge err">Lỗi</span>`; rowObj.errorMsg = `${e.message} (${code})`; }
    bulkData.push(rowObj); appendRowToDOM(rowObj, tbody);
  }
  progress.innerHTML = `🎉 Hoàn tất! Thành công <strong style="color:var(--badge-ok-text)">${successCount}/${codes.length}</strong> mã.`; copyBtn.style.display = "inline-flex"; btn.disabled = false;
}

function copyTableToExcel() {
  try {
    const table = document.getElementById('bulkTable'); if (!table) return; let tsv = "";
    const tbody = table.querySelector('tbody');
    const rows = tbody ? Array.from(tbody.querySelectorAll('tr')) : [];
    rows.forEach(row => { const cells = Array.from(row.querySelectorAll('th, td')).map(td => td.innerText.trim()); tsv += cells.join("\t") + "\n"; });
    navigator.clipboard.writeText(tsv).then(() => {
      const btn = document.getElementById("copyExcelBtn"); const originalText = btn.innerHTML; btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-check-icon lucide-check-check"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg> Đã Copy vào Khay nhớ tạm!';
      setTimeout(() => { btn.innerHTML = originalText; }, 2000);
    }).catch(err => { alert("Không thể tự động copy. Vui lòng thử lại."); });
  } catch(e) { alert("Đã xảy ra lỗi khi copy: " + e.message); }
}

async function loadBankAccounts() {
  const dropdownEl = document.getElementById("txBankAccountIdDropdown");
  const selectBrandEl = document.getElementById("txBankBrand");
  
  // Chỉ dừng nếu không tìm thấy khung dropdown của multi-select
  if (!dropdownEl) return; 

  try {
    const resp = await fetch("/api/index", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_bank_accounts", access_token: getToken() })
    });
    const data = await resp.json();
    
    if (resp.ok && data.bank_accounts) {
      dropdownEl.innerHTML = '';
      if (selectBrandEl) selectBrandEl.innerHTML = '<option value="">-- Tất cả ngân hàng --</option>';
      
      const uniqueBrands = new Set();

      data.bank_accounts.forEach(bank => {
        // Tạo Checkbox cho từng tài khoản và chèn vào dropdown
        const label = document.createElement('label');
        label.className = 'ms-checkbox-item';
        label.innerHTML = `<input type="checkbox" value="${bank.id}" onchange="updateMultiSelectLabel()" /> <span>${bank.bank_short_name} - ${bank.account_number}</span>`;
        dropdownEl.appendChild(label);

        if (bank.bank_short_name) uniqueBrands.add(bank.bank_short_name);
      });

      // Nếu có dùng bộ lọc txBankBrand ở giao diện thì mới đổ dữ liệu vào
      if (selectBrandEl) {
        uniqueBrands.forEach(brand => {
          const optionBrand = document.createElement("option");
          optionBrand.value = brand; optionBrand.text = brand;
          selectBrandEl.appendChild(optionBrand);
        });
      }
    }
  } catch (e) { console.error("Lỗi tải danh sách ngân hàng:", e); }
}

// Hàm phụ: Cập nhật chữ trên label khi tích chọn checkbox
function updateMultiSelectLabel() {
  const checked = document.querySelectorAll('#txBankAccountIdDropdown input:checked');
  const labelEl = document.getElementById('txBankAccountIdLabel');
  if (checked.length === 0) {
    labelEl.innerText = '-- Tất cả tài khoản --';
  } else {
    labelEl.innerText = `Đã chọn ${checked.length} tài khoản`;
  }
}

// Ẩn bảng checkbox đi khi bấm chuột ra ngoài khung
document.addEventListener('click', function(e) {
  const container = document.getElementById('multiSelectContainer');
  if (container && !container.contains(e.target)) {
    const dropdown = document.getElementById('txBankAccountIdDropdown');
    if(dropdown) dropdown.classList.remove('show');
  }
});

// Khai báo biến toàn cục
let bankStatementBase64 = "";
let bankStatementFileName = "";

function setBankDropZoneState(state, fileName) {
  const zone = document.getElementById("bankDropZone");
  const inner = document.getElementById("bankDropZoneInner");
  const info = document.getElementById("bankDropFileInfo");
  const nameEl = document.getElementById("bankDropFileName");
  if (!zone || !inner || !info) return;
  zone.classList.remove("has-file", "processing", "drag-over");
  if (state === "idle") {
    inner.style.display = "";
    info.style.display = "none";
  } else if (state === "processing") {
    zone.classList.add("processing", "has-file");
    inner.style.display = "none";
    info.style.display = "flex";
    if (nameEl) nameEl.textContent = fileName ? `Đang xử lý: ${fileName}` : "Đang xử lý...";
  } else if (state === "done") {
    zone.classList.add("has-file");
    inner.style.display = "none";
    info.style.display = "flex";
    if (nameEl) nameEl.textContent = fileName || "File đã chọn";
  }
}

function isValidBankExcelFile(file) {
  if (!file) return false;
  const name = (file.name || "").toLowerCase();
  return name.endsWith(".xlsx");
}

async function doBankStatement(fileOverride) {
  const fileInput = document.getElementById("bankExcelFile");
  const box = document.getElementById("bankResult");
  const tableWrap = document.getElementById("bankTableWrap");

  const file = fileOverride || (fileInput && fileInput.files && fileInput.files[0]);
  if (!file) {
    box.innerHTML = '<span class="err" style="color:var(--badge-err-text)">Vui lòng chọn file sao kê.</span>';
    setBankDropZoneState("idle");
    return;
  }
  if (!isValidBankExcelFile(file)) {
    box.innerHTML = '<span class="err" style="color:var(--badge-err-text)">Vui lòng chọn file Excel (.xlsx).</span>';
    setBankDropZoneState("idle");
    if (fileInput) fileInput.value = "";
    return;
  }

  setBankDropZoneState("processing", file.name);
  box.innerHTML = '<span class="spinner" style="color:var(--accent)"></span> Đang xử lý tổng hợp sao kê, vui lòng đợi…';
  if (tableWrap) tableWrap.style.display = 'none';

  try {
    const b64 = await fileToBase64(file);
    const resp = await fetch("/api/index", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bank_statement", file_base64: b64, access_token: getToken() })
    });
    const data = await resp.json();

    if (!resp.ok) {
      box.innerHTML = `<span class="err" style="color:var(--badge-err-text)">❌ ${data.error || "Lỗi"}</span>`;
      setBankDropZoneState("done", file.name);
      return;
    }
    
    // Lưu lại dữ liệu Base64 để dùng cho nút tải về
    bankStatementBase64 = data.file_base64;
    bankStatementFileName = "TongHop_" + file.name;

    // Dùng SheetJS để đọc file Excel Base64 trả về
    const wb = XLSX.read(data.file_base64, { type: 'base64', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: "dd/mm/yyyy" });

    // Tạo giao diện bảng HTML - Đã thêm cụm nút Tải về & Copy
    let tableHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:16px;">
        <h3 style="margin:0;">Xem trước Kết quả</h3>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button id="copyBankTableBtn" class="btn-outline" onclick="copyBankStatementTable()" style="font-size:13px; padding:8px 16px;">📋 Copy cho Excel / Sheets</button>
          <button onclick="downloadBankStatement()" style="font-size:13px; padding:8px 16px;">⬇️ Tải về Excel</button>
        </div>
      </div>
      <div class="table-responsive">
        <table id="bankStatementTable" class="sepay-table" style="width:100%; white-space:nowrap;">
          <thead>
    `;

    if (jsonData.length > 0) {
       const headers = jsonData[0];
       tableHTML += '<tr>';
       headers.forEach(h => { tableHTML += `<th>${escapeHtml(h || "")}</th>`; });
       tableHTML += '</tr></thead><tbody>';

       for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length === 0) continue;
          
          tableHTML += '<tr>';
          for (let j = 0; j < headers.length; j++) {
             let cellData = row[j];
             let displayCell = cellData !== undefined && cellData !== null ? String(cellData) : "";
             
             // Căn phải đối với các cột số
             const align = (!isNaN(parseFloat(cellData)) && isFinite(cellData) && !displayCell.includes("/")) ? "text-align: right;" : "text-align: left;";
             
             if (j === 0) {
               // Cột "Nội dung diễn giải": cho phép gõ chữ trực tiếp vào ô (contenteditable), không phải inputbox
               tableHTML += `<td class="editable-cell" contenteditable="true" data-placeholder="Nhập nội dung..." style="${align}">${escapeHtml(displayCell)}</td>`;
             } else {
               tableHTML += `<td style="${align}">${escapeHtml(displayCell)}</td>`;
             }
          }
          tableHTML += '</tr>';
       }
    }
    tableHTML += '</tbody></table></div>';
    
    box.innerHTML = `<span class="badge ok">🎉 Đã xử lý xong! Vui lòng xem kết quả bên dưới.</span>`;
    if (tableWrap) {
       tableWrap.innerHTML = tableHTML;
       tableWrap.style.display = 'block';
    }
    setBankDropZoneState("done", file.name);

  } catch (e) {
    box.innerHTML = `<span class="err" style="color:var(--badge-err-text)">❌ Lỗi: ${e.message}</span>`;
    setBankDropZoneState("done", file.name);
  }
}

// Hàm tải về Excel
function downloadBankStatement() {
  if (bankStatementBase64 && bankStatementFileName) {
      downloadBase64(bankStatementBase64, bankStatementFileName);
  } else {
      alert("Chưa có file để tải về!");
  }
}

// Hàm Copy bảng Sao kê - đọc trực tiếp từ bảng đang hiển thị (bao gồm cả nội dung người dùng vừa gõ vào cột "Nội dung diễn giải")
// Không copy dòng tiêu đề (NỘI DUNG DIỄN GIẢI, GỬI VÀO, RÚT RA, SỐ DƯ LŨY KẾ, GHI CHÚ...)
function buildBankStatementTsvFromDOM() {
  const table = document.getElementById('bankStatementTable');
  if (!table) return "";
  const rows = table.querySelectorAll('tr');
  const lines = [];
  rows.forEach((tr, rowIndex) => {
    // Bỏ qua dòng tiêu đề (thead) — chỉ copy dữ liệu
    if (rowIndex === 0) return;
    const cells = tr.querySelectorAll('th, td');
    const vals = Array.from(cells).map((cell, colIndex) => {
      let text = (cell.innerText || cell.textContent || "").trim();
      // Xóa dấu chấm/phẩy ở các cột số (Index 1, 2, 3)
      if (colIndex >= 1 && colIndex <= 3) {
        text = text.replace(/[,.]/g, '');
      }
      // Lọc bỏ ký tự tab/xuống dòng thừa
      return text.replace(/\t/g, " ").replace(/\n/g, " ");
    });
    lines.push(vals.join("\t"));
  });
  return lines.join("\n");
}

function copyBankStatementTable() {
  const tsv = buildBankStatementTsvFromDOM();
  if (!tsv) {
      alert("Chưa có dữ liệu để copy!");
      return;
  }
  navigator.clipboard.writeText(tsv).then(() => {
      const btn = document.getElementById("copyBankTableBtn");
      const originalText = btn.innerHTML;
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-check-icon lucide-check-check"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg> Đã Copy vào Khay nhớ tạm!';
      setTimeout(() => { btn.innerHTML = originalText; }, 2000);
  }).catch(err => {
      alert("Không thể copy. Vui lòng kiểm tra quyền trình duyệt.");
  });
}

async function doTxSearch() {
  const code = document.getElementById("txSearchCode").value.trim(); const box = document.getElementById("txSearchResult"); const btn = document.getElementById("txSearchBtn");
  if (!code) { box.innerHTML = '<div class="msg err">Vui lòng nhập mã cần tìm.</div>'; return; }
  btn.disabled = true; box.innerHTML = '<div class="msg"><span class="spinner" style="color:var(--accent)"></span> Đang kết nối SePay v2...</div>';
  try {
    const resp = await fetch("/api/index", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "search_transaction", code: code, access_token: getToken() }) });
    const data = await resp.json();
    if (!resp.ok) { box.innerHTML = `<div class="msg err">❌ ${data.error || "Lỗi server"}</div>`; return; }
    const tx = data.transaction;
    let rows = "";
    for (const [key, value] of Object.entries(tx)) {
        let displayValue = escapeHtml(value);
        if (key === "amount_in") displayValue = `<span style="color:var(--badge-ok-text); font-weight:bold;">+ ${Number(value).toLocaleString('vi-VN')} VND</span>`;
        if (value === null) displayValue = '<span style="color:var(--text-muted)">null</span>';
        rows += `<tr><td style="color:var(--text-muted); font-weight:600; width:200px;">${escapeHtml(key)}</td><td style="word-break: break-all;">${displayValue}</td></tr>`;
    }
    box.innerHTML = `<div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; flex-wrap: wrap;"><span class="badge ok">🎉 Tìm thấy giao dịch!</span><button id="copyTxSearchBtn" class="btn-outline" onclick="copyTableToClipboard('txSearchTable', 'copyTxSearchBtn')" style="font-size: 12px; padding: 6px 10px; white-space:nowrap; flex-shrink:0;">📋 Copy</button></div><div class="table-responsive"><table id="txSearchTable" style="width:100%; border-collapse: collapse;"><tbody>${rows}</tbody></table></div>`;
  } catch (e) { box.innerHTML = `<div class="msg err">❌ Lỗi kết nối mạng: ${e.message}</div>`; } finally { btn.disabled = false; }
}

// HÀM LIỆT KÊ DANH SÁCH GIAO DỊCH
async function doTxList() {
  const dateFromVal = document.getElementById("txDateFrom").value; 
  const dateToVal = document.getElementById("txDateTo").value;
  const selectBrandEl = document.getElementById("txBankBrand");
  const bankBrandVal = selectBrandEl ? selectBrandEl.value.trim() : "";
  
  // Lấy danh sách các tài khoản đang được Tích Chọn
  const selectedAccounts = Array.from(document.querySelectorAll('#txBankAccountIdDropdown input:checked')).map(cb => cb.value);
  
  const box = document.getElementById("txListResult");
  const btn = document.getElementById("txListBtn");
  
  if (!dateFromVal || !dateToVal) {
    box.innerHTML = '<div class="msg err">Vui lòng chọn "Từ ngày" và "Đến ngày".</div>'; 
    return; 
  }
  
  const parseDateToAPI = (str) => {
    const parts = str.split('/');
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return str;
  };
  
  const dateFrom = parseDateToAPI(dateFromVal) + " 00:00:00";
  const dateTo = parseDateToAPI(dateToVal) + " 23:59:59";
  
  btn.disabled = true;
  box.innerHTML = '<div class="msg"><span class="spinner" style="color:var(--accent)"></span> Đang tải danh sách từ SePay...</div>';
  
  try {
    const resp = await fetch("/api/index", { 
      method: "POST", 
      headers: { "Content-Type": "application/json" }, 
      body: JSON.stringify({ 
          action: "list_transactions", 
          date_from: dateFrom, 
          date_to: dateTo, 
          bank_brand: bankBrandVal,          
          bank_account: "", 
          access_token: getToken() 
      }) 
    });
    const data = await resp.json();
    
    if (!resp.ok) { 
      box.innerHTML = `<div class="msg err">❌ ${data.error || "Lỗi server"}</div>`; 
      return; 
    }
    
    let txs = data.transactions;
    
    // BỘ LỌC ĐA TÀI KHOẢN
    if (selectedAccounts.length > 0) {
      txs = txs.filter(tx => selectedAccounts.includes(tx.bank_account_id));
    }

    if (!txs || txs.length === 0) {
      box.innerHTML = '<div class="msg">⚠️ Không có giao dịch chuyển khoản nào khớp với điều kiện lọc.</div>';
      return;
    }
    
    // TÍNH TOÁN SỐ DƯ LŨY KẾ
    let runningBalance = 0;
    let totalAmountIn = 0;
    let totalAmountOut = 0;

    // 2. Sắp xếp giao dịch từ cũ đến mới để tính lũy kế đúng dòng thời gian
    txs.sort((a, b) => new Date(a.transaction_date.replace(" ", "T")) - new Date(b.transaction_date.replace(" ", "T")));

    txs.forEach(tx => {
      let inAmt = Number(tx.amount_in || 0);
      let outAmt = Number(tx.amount_out || 0);
      totalAmountIn += inAmt;
      totalAmountOut += outAmt;
      
      runningBalance = runningBalance + inAmt - outAmt;
      tx.currentBalance = runningBalance; // Gắn số dư tương ứng vào object
    });

    // 3. Đảo ngược mảng để hiển thị Giao dịch mới nhất lên đầu bảng (Tùy chọn UX)
    txs.reverse();
    
    // Lưu lại dữ liệu gốc để nút Copy dùng (không phụ thuộc vào innerText của DOM)
    currentTxListData = txs;

    // VẼ BẢNG HTML
    let rows = "";
    txs.forEach((tx, i) => {
      const formattedDate = formatTxDate(tx.transaction_date);
      const relativeTime = timeAgo(tx.transaction_date);
      
      let amountInHtml = Number(tx.amount_in) > 0 ? `<span class="amount-in">+${Number(tx.amount_in).toLocaleString('vi-VN')}</span>` : "";
      let amountOutHtml = Number(tx.amount_out) > 0 ? `<span class="amount-out">-${Number(tx.amount_out).toLocaleString('vi-VN')}</span>` : "";
      const bankIconHtml = getBankIconHtml(tx.bank_brand_name);
      const paymentCode = (tx.code || "").trim();
      const lookupCellContent = paymentCode ? `<span class="spinner" style="color:var(--accent)"></span>` : "—";

      rows += `
        <tr data-tx-index="${i}">
          <td data-sort-value="${tx.transaction_date}">
            <div>${formattedDate}</div>
            <div class="text-muted-small">${relativeTime}</div>
          </td>
          <td>
            <div class="bank-tag">
              ${bankIconHtml}
              ${escapeHtml(tx.account_number)}
            </div>
          </td>
          <td class="tx-content-cell" id="tx-content-${i}" title="${escapeHtml(tx.transaction_content)} — Click để copy" onclick="copyTxContentByIndex(${i})">
            ${escapeHtml(tx.transaction_content)}
          </td>
          <td style="text-align: right;">${amountInHtml}</td>
          <td style="text-align: right;">${amountOutHtml}</td>
          <td class="text-id">${escapeHtml(tx.code || "—")}</td>
          <td id="tx-name-${i}">${lookupCellContent}</td>
          <td id="tx-userid-${i}">${lookupCellContent}</td>
          <td id="tx-invoice-${i}">${lookupCellContent}</td>
          <td id="tx-arisingdate-${i}">${lookupCellContent}</td>
          <td id="tx-amountbeforetax-${i}" style="text-align: right;">${lookupCellContent}</td>
          <td id="tx-vatamount-${i}" style="text-align: right;">${lookupCellContent}</td>
          <td id="tx-totalamount-${i}" style="text-align: right;">${lookupCellContent}</td>
        </tr>`;
    });

    // Dòng Tổng phát sinh đặt trong <tfoot> (không phải trong rows/<tbody>) để khi
    // bấm sort theo cột Tiền vào/Tiền ra, dòng tổng luôn nằm cố định ở cuối bảng
    // thay vì bị xáo trộn lẫn vào giữa các dòng giao dịch.
    const totalRowHtml = `
      <tr class="total-row">
        <td colspan="3" style="text-align: right; font-weight: 800; text-transform: uppercase;">Tổng phát sinh:</td>
        <td style="text-align: right; font-weight: 700; color: var(--amount-in);">${totalAmountIn.toLocaleString('vi-VN')}</td>
        <td style="text-align: right; font-weight: 700; color: var(--amount-out);">${totalAmountOut.toLocaleString('vi-VN')}</td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
      </tr>`;
      
    box.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; flex-wrap: wrap;">
        <span class="badge ok">🎉 Đã tải ${txs.length} giao dịch</span>
        <span class="text-muted-small" style="flex-shrink:0;">💡 Bấm vào tiêu đề cột "Thời gian" / "Tiền vào (+)" / "Tiền ra (-)" để sắp xếp. Bấm lại cột "Thời gian" bất cứ lúc nào để đưa bảng về đúng thứ tự thời gian ban đầu.</span>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button id="copyTxListBtn" class="btn-outline" onclick="copyTxListTable()" style="font-size: 12px; padding: 6px 10px; white-space:nowrap; flex-shrink:0;">📋 Copy cho Excel / Sheets</button>
          <button id="copyTxListMisaBtn" class="btn-outline" onclick="copyTxListForMisa()" style="font-size: 12px; padding: 6px 10px; white-space:nowrap; flex-shrink:0;">📋 Copy cho mẫu DS bán MISA</button>
        </div>
      </div>
      <div class="table-responsive" style="border: 1px solid var(--border); border-radius: 8px;">
        <table class="sepay-table" id="txListTable">
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Tài khoản</th>
              <th>Nội dung</th>
              <th style="text-align: right;">Tiền vào (+)</th>
              <th style="text-align: right;">Tiền ra (-)</th>
              <th>Mã thanh toán</th>
              <th>Tên KH</th>
              <th>Mã KH</th>
              <th>Số HĐ</th>
              <th>Ngày lập</th>
              <th style="text-align: right;">Tiền hàng</th>
              <th style="text-align: right;">Tiền thuế</th>
              <th style="text-align: right;">Tổng tiền</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>${totalRowHtml}</tfoot>
        </table>
      </div>`;

    // Cho phép bấm vào tiêu đề cột "Tiền vào (+)" / "Tiền ra (-)" để sắp xếp
    // (tăng dần/giảm dần khi bấm lặp lại), giúp các giao dịch có số tiền
    // giống hoặc gần nhau tự gom lại thành từng nhóm liền kề, dễ đối chiếu.
    const txListTableEl = document.getElementById("txListTable");
    if (txListTableEl) {
      attachSortableHeaders(txListTableEl, { 0: 'date', 3: 'number', 4: 'number' });
    }

    // Tự động tra cứu Tên KH / Mã KH / Số HĐ cho từng dòng có Mã thanh toán
    lookupCustomerInfoForTxList(txs);
      
  } catch (e) { 
    box.innerHTML = `<div class="msg err">❌ Lỗi kết nối mạng: ${e.message}</div>`; 
  } finally { 
    btn.disabled = false; 
  }
}

async function lookupCustomerInfoForTxList(txs) {
  const amountFmt = (v) => (v === "" || v === null || v === undefined) ? "—" : Number(v).toLocaleString('vi-VN');
  for (let i = 0; i < txs.length; i++) {
    const code = (txs[i].code || "").trim();
    const nameEl = document.getElementById(`tx-name-${i}`);
    const userEl = document.getElementById(`tx-userid-${i}`);
    const invEl = document.getElementById(`tx-invoice-${i}`);
    const dateEl = document.getElementById(`tx-arisingdate-${i}`);
    const beforeTaxEl = document.getElementById(`tx-amountbeforetax-${i}`);
    const vatEl = document.getElementById(`tx-vatamount-${i}`);
    const totalEl = document.getElementById(`tx-totalamount-${i}`);
    if (!code) continue; // Đã hiển thị "—" sẵn khi render bảng

    let invoiceNumber = "";
    try {
      const resp = await fetch("/api/index", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "lookup", code, sa_system: "", access_token: getToken() })
      });
      const data = await resp.json();
      const ok = resp.ok && data.status_msg === "Thành công";
      if (nameEl) nameEl.textContent = ok ? (data.users_name || "—") : "—";
      if (userEl) userEl.textContent = ok ? (data.username || "—") : "—";
      invoiceNumber = ok ? (data.invoice_number || "") : "";
      if (invEl) invEl.textContent = invoiceNumber || "—";
      // Lưu lại vào đối tượng tx gốc để nút Copy dùng
      txs[i].customer_name = ok ? (data.users_name || "") : "";
      txs[i].customer_code = ok ? (data.username || "") : "";
      txs[i].invoice_number = invoiceNumber;
      txs[i].ref_username = ok ? (data.ref_username || "") : "";
      txs[i].invoice_item_name = ok ? (data.invoice_item_name || "") : "";
    } catch (e) {
      if (nameEl) nameEl.textContent = "—";
      if (userEl) userEl.textContent = "—";
      if (invEl) invEl.textContent = "—";
      txs[i].customer_name = "";
      txs[i].customer_code = "";
      txs[i].invoice_number = "";
      txs[i].ref_username = "";
      txs[i].invoice_item_name = "";
    }

    // Nếu tìm được Số HĐ, tra cứu tiếp thông tin hóa đơn (Ngày lập, Tiền hàng, Tiền thuế, Tổng tiền)
    if (!invoiceNumber) {
      if (dateEl) dateEl.textContent = "—";
      if (beforeTaxEl) beforeTaxEl.textContent = "—";
      if (vatEl) vatEl.textContent = "—";
      if (totalEl) totalEl.textContent = "—";
      txs[i].invoice_date = "";
      txs[i].amount_before_tax = "";
      txs[i].vat_amount = "";
      txs[i].total_amount = "";
      continue;
    }
    try {
      const respInv = await fetch("/api/index", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "invoice", code: invoiceNumber, access_token: getToken() })
      });
      const dataInv = await respInv.json();
      const okInv = respInv.ok && dataInv.status_msg === "Thành công";
      if (dateEl) dateEl.textContent = okInv ? (dataInv.arising_date || "—") : "—";
      if (beforeTaxEl) beforeTaxEl.textContent = okInv ? amountFmt(dataInv.amount_before_tax) : "—";
      if (vatEl) vatEl.textContent = okInv ? amountFmt(dataInv.vat_amount) : "—";
      if (totalEl) totalEl.textContent = okInv ? amountFmt(dataInv.total_amount) : "—";
      // Lưu lại vào đối tượng tx gốc để nút Copy dùng (giữ số thô, không định dạng)
      txs[i].invoice_date = okInv ? (dataInv.arising_date || "") : "";
      txs[i].amount_before_tax = okInv ? (dataInv.amount_before_tax ?? "") : "";
      txs[i].vat_amount = okInv ? (dataInv.vat_amount ?? "") : "";
      txs[i].total_amount = okInv ? (dataInv.total_amount ?? "") : "";
    } catch (e) {
      if (dateEl) dateEl.textContent = "—";
      if (beforeTaxEl) beforeTaxEl.textContent = "—";
      if (vatEl) vatEl.textContent = "—";
      if (totalEl) totalEl.textContent = "—";
      txs[i].invoice_date = "";
      txs[i].amount_before_tax = "";
      txs[i].vat_amount = "";
      txs[i].total_amount = "";
    }
  }
}
  
function copyBankTransferForBank() {
  try {
    if (!currentBankTransferRows || currentBankTransferRows.length === 0) {
      alert("Chưa có dữ liệu để copy. Vui lòng chọn Sheet (Tháng) trước.");
      return;
    }
    let tsv = "";
    currentBankTransferRows.forEach((r, idx) => {
      const tenNvKhongDau = removeVietnameseDiacritics(r.ten_nv).toUpperCase();
      // Số tiền copy dưới dạng số nguyên thật (không có dấu chấm/phẩy ngăn cách)
      // để khi dán vào file Excel của ngân hàng, ô nhận đúng kiểu Number chứ không phải Text.
      const soTien = Math.round(Number(r.thuc_nhan) || 0);
      tsv += [idx + 1, tenNvKhongDau, r.stk, soTien, currentBankTransferContent].join("\t") + "\n";
    });
    navigator.clipboard.writeText(tsv).then(() => {
      const btn = document.getElementById("copyBankTransferBtn");
      const originalText = btn.innerHTML;
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-check-icon lucide-check-check"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg> Đã Copy! Dán vào file NH';
      setTimeout(() => { btn.innerHTML = originalText; }, 2500);
    }).catch(() => { alert("Không thể tự động copy. Vui lòng thử lại."); });
  } catch (e) {
    alert("Đã xảy ra lỗi khi copy: " + e.message);
  }
}

function copyTableToClipboard(tableId, btnId) {
  try {
    const table = document.getElementById(tableId); if (!table) return;
    const tbody = table.querySelector('tbody');
    const rows = tbody ? Array.from(tbody.querySelectorAll('tr')) : [];
    // Dùng join("\n") giữa các dòng thay vì nối "\n" sau MỖI dòng (kể cả dòng cuối) -
    // tránh để lại ký tự xuống dòng thừa ở cuối chuỗi, thứ khiến Excel hiểu nhầm là
    // còn thêm 1 dòng nữa (trống) sau khi dán.
    // Bỏ qua dòng đang bị ẩn (display:none) do người dùng đang áp dụng bộ lọc -
    // giống hành vi copy trong Excel khi có AutoFilter, chỉ copy đúng phần đang xem.
    const tsv = rows
      .filter(row => row.style.display !== 'none')
      .map(row => Array.from(row.querySelectorAll('th, td')).map(td => td.innerText.trim()).join("\t"))
      .join("\n");
    navigator.clipboard.writeText(tsv).then(() => {
      const btn = document.getElementById(btnId); const originalText = btn.innerText; btn.innerText = "✅ Đã Copy vào Khay nhớ tạm!";
      setTimeout(() => { btn.innerHTML = originalText; }, 2000);
    }).catch(err => { alert("Không thể tự động copy. Vui lòng thử lại."); });
  } catch(e) { alert("Đã xảy ra lỗi khi copy: " + e.message); }
}

// ==== LỌC + SẮP XẾP KIỂU EXCEL cho các bảng tra cứu hóa đơn theo khoảng ngày ====
// colTypes: mảng cùng độ dài số cột header, giá trị 'text' | 'number' | null.
// null = cột không có ô lọc/không sắp xếp được (VD cột STT, cột luôn để trống).
// onVisibilityChange(visibleRows): callback tùy chọn, gọi lại mỗi khi bộ lọc đổi -
// dùng để tính lại dòng "Tổng cộng" đúng theo các dòng đang hiển thị (giống AutoFilter + SUBTOTAL trong Excel).
function attachTableFilterSort(table, colTypes, onVisibilityChange) {
  const thead = table.querySelector('thead');
  const headerRow = thead.querySelector('tr');
  const ths = Array.from(headerRow.children);

  const filterRow = document.createElement('tr');
  filterRow.className = 'table-filter-row';
  ths.forEach((th, i) => {
    const td = document.createElement('td');
    if (colTypes[i] !== null) {
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Lọc...';
      input.className = 'table-filter-input';
      input.addEventListener('input', () => applyTableFilters(table, onVisibilityChange));
      td.appendChild(input);
    }
    filterRow.appendChild(td);
  });
  thead.appendChild(filterRow);

  ths.forEach((th, i) => {
    if (colTypes[i] === null) return;
    th.style.cursor = 'pointer';
    th.title = 'Bấm để sắp xếp';
    th.dataset.sortDir = '';
    th.addEventListener('click', () => sortTableByColumn(table, i, colTypes[i], th, ths));
  });
}

function applyTableFilters(table, onVisibilityChange) {
  const tbody = table.querySelector('tbody');
  const rows = Array.from(tbody.querySelectorAll('tr'));
  const filters = [];
  Array.from(table.querySelectorAll('.table-filter-row td')).forEach((td, i) => {
    const input = td.querySelector('.table-filter-input');
    const val = input ? input.value.trim().toLowerCase() : '';
    if (val) filters.push({ col: i, val });
  });

  rows.forEach((row) => {
    const cells = Array.from(row.children);
    const visible = filters.every(f => (cells[f.col]?.innerText || '').toLowerCase().includes(f.val));
    row.style.display = visible ? '' : 'none';
  });

  if (onVisibilityChange) {
    onVisibilityChange(rows.filter(r => r.style.display !== 'none'));
  }
}

// Gắn sự kiện sort cho các cột được chỉ định (mà KHÔNG chèn thêm hàng ô lọc
// như attachTableFilterSort), dùng cho các bảng chỉ cần bấm-để-sắp-xếp ở
// một vài cột cụ thể (VD: cột Tiền vào / Tiền ra trong bảng liệt kê giao dịch).
// colIndexToType: object dạng { [chỉ số cột]: 'number' | 'text' }
function attachSortableHeaders(table, colIndexToType) {
  const thead = table.querySelector('thead');
  const headerRow = thead.querySelector('tr');
  const ths = Array.from(headerRow.children);
  Object.keys(colIndexToType).forEach((idxStr) => {
    const i = Number(idxStr);
    const th = ths[i];
    if (!th) return;
    th.style.cursor = 'pointer';
    th.title = 'Bấm để sắp xếp';
    th.dataset.sortDir = '';
    th.addEventListener('click', () => sortTableByColumn(table, i, colIndexToType[i], th, ths));
  });
}

function sortTableByColumn(table, colIdx, colType, th, allThs) {
  const tbody = table.querySelector('tbody');
  const rows = Array.from(tbody.querySelectorAll('tr'));
  const dir = th.dataset.sortDir === 'asc' ? 'desc' : 'asc';
  allThs.forEach((h) => {
    h.dataset.sortDir = '';
    const ind = h.querySelector('.sort-indicator');
    if (ind) ind.remove();
  });
  th.dataset.sortDir = dir;

  const getValue = (row) => {
    if (colType === 'date') {
      // Dùng ngày giờ gốc (ISO/"YYYY-MM-DD HH:mm:ss") gắn sẵn trong data-sort-value
      // thay vì đọc text hiển thị (dd/mm/yyyy + "X phút trước"), để sort chính xác
      // theo thời gian thực và không bị lệch khi giá trị "X phút trước" thay đổi.
      const raw = row.children[colIdx]?.dataset.sortValue || '';
      const t = new Date(raw.replace(' ', 'T')).getTime();
      return isNaN(t) ? -Infinity : t;
    }
    const text = (row.children[colIdx]?.innerText || '').trim();
    if (colType === 'number') {
      // Số Việt Nam dùng dấu chấm ngăn cách hàng nghìn (VD "7.388.889") - bỏ dấu
      // chấm trước khi parse, kèm bỏ ký tự "%" và "—" (ô trống/không xác định).
      const num = parseFloat(text.replace(/\./g, '').replace(',', '.').replace('%', '').replace('—', ''));
      return isNaN(num) ? -Infinity : num;
    }
    return text.toLowerCase();
  };

  rows.sort((a, b) => {
    const va = getValue(a), vb = getValue(b);
    if (va < vb) return dir === 'asc' ? -1 : 1;
    if (va > vb) return dir === 'asc' ? 1 : -1;
    return 0;
  });
  rows.forEach(row => tbody.appendChild(row));

  const indicator = document.createElement('span');
  indicator.className = 'sort-indicator';
  indicator.textContent = dir === 'asc' ? ' ▲' : ' ▼';
  th.appendChild(indicator);
}

// Nút Copy riêng cho bảng "Kiểm tra giao dịch SePay v2"
// Lấy trực tiếp từ dữ liệu gốc (currentTxListData) thay vì đọc innerText của DOM,
// để mỗi giao dịch luôn ra đúng 1 hàng ngang, không bị tách dòng do "44 phút trước" / icon ngân hàng,
// và không copy kèm dòng "Tổng phát sinh".
function copyTxListTable() {
  try {
    if (!currentTxListData || currentTxListData.length === 0) {
      alert("Chưa có dữ liệu để copy. Vui lòng tra cứu danh sách giao dịch trước.");
      return;
    }
    let tsv = "";
    currentTxListData.forEach(tx => {
      const formattedDate = formatDateOnly(tx.transaction_date); // chỉ ngày tháng năm, dạng dd/mm/yyyy
      const soTaiKhoan = tx.account_number || "";
      const noiDung = (tx.transaction_content || "").replace(/[\r\n\t]+/g, " ").trim();

      const inAmt = Number(tx.amount_in || 0);
      const outAmt = Number(tx.amount_out || 0);
      const tienVao = inAmt > 0 ? String(inAmt) : "";
      const tienRa = outAmt > 0 ? String(outAmt) : "";

      const maDonHang = tx.code || "";
      const tenKh = tx.customer_name || "";
      const maKh = tx.customer_code || "";
      const soHd = tx.invoice_number || "";
      const ngayHd = formatDateOnly(tx.invoice_date || "");
      const tienChuaVat = (tx.amount_before_tax === "" || tx.amount_before_tax === undefined || tx.amount_before_tax === null) ? "" : String(Number(tx.amount_before_tax));
      const soTienVat = (tx.vat_amount === "" || tx.vat_amount === undefined || tx.vat_amount === null) ? "" : String(Number(tx.vat_amount));
      const tongTien = (tx.total_amount === "" || tx.total_amount === undefined || tx.total_amount === null) ? "" : String(Number(tx.total_amount));

      tsv += [formattedDate, soTaiKhoan, noiDung, tienVao, tienRa, maDonHang, tenKh, maKh, soHd, ngayHd, tienChuaVat, soTienVat, tongTien].join("\t") + "\n";
    });
    tsv = tsv.replace(/\n$/, ""); // bỏ dòng trống thừa ở cuối khi dán vào Excel/Sheets
    navigator.clipboard.writeText(tsv).then(() => {
      const btn = document.getElementById("copyTxListBtn");
      const originalText = btn.innerText; btn.innerText = "✅ Đã Copy vào Khay nhớ tạm!";
      setTimeout(() => { btn.innerHTML = originalText; }, 2000);
    }).catch(() => { alert("Không thể tự động copy. Vui lòng thử lại."); });
  } catch (e) {
    alert("Đã xảy ra lỗi khi copy: " + e.message);
  }
}

// Nút Copy riêng cho mẫu "DS bán MISA" - xuất đúng 50 cột theo cấu trúc file mẫu
// nhập khẩu Danh sách hóa đơn bán hàng của MISA (dựa trên cùng dữ liệu gốc
// currentTxListData như nút Copy cho Excel/Sheets ở trên).
// Chỉ lấy các dòng "Tiền vào (+)" (bỏ qua các dòng "Tiền ra (-)").
// Cột 1-5 là nội dung cố định: "Bán hàng hóa trong nước", "Chưa thu tiền",
// "Không", "Có", "Đã lập". Cột 6 lấy cùng nội dung Ngày lập (giống cột 7).
// Cột "Ngày lập" xuất hiện thêm 2 lần nữa (cột 7 và cột 13). Cột 7 (đi kèm Mã
// thanh toán ở cột 8) có thêm 3 cột trống ngay bên phải (cột 9-11). Ngay bên
// phải cột Tên KH (cột 15) có thêm 6 cột trống (cột 16-21). Ngay bên phải cột
// trống ở cột 23 (sau Tên hàng lần 1, cột 22) có thêm 6 cột trống (cột 24-29),
// trước khi tới Tên hàng lần 2 (cột 30). Thêm 1 cột trống nữa ngay trước "131"
// (cột 33) nên TK Nợ "131" ở cột 34. Thêm 7 cột trống bên trái "8" (cột 40-46,
// "8" ở cột 47) và 1 cột trống bên trái Tiền thuế (cột 48, Tiền thuế ở cột 49).
function copyTxListForMisa() {
  try {
    if (!currentTxListData || currentTxListData.length === 0) {
      alert("Chưa có dữ liệu để copy. Vui lòng tra cứu danh sách giao dịch trước.");
      return;
    }
    // Lấy thứ tự theo đúng thứ tự đang hiển thị trên bảng (sau khi user sort),
    // để khi copy sang mẫu DS bán MISA cũng giữ đúng thứ tự đã sắp xếp.
    // data-tx-index gắn trên mỗi <tr> lúc render, trỏ về index trong currentTxListData.
    let orderedData = currentTxListData;
    const tableEl = document.getElementById("txListTable");
    if (tableEl) {
      const domRows = Array.from(tableEl.querySelectorAll("tbody tr[data-tx-index]"));
      if (domRows.length > 0) {
        const indices = domRows
          .map(row => parseInt(row.dataset.txIndex, 10))
          .filter(i => !isNaN(i) && i >= 0 && i < currentTxListData.length);
        if (indices.length > 0) {
          orderedData = indices.map(i => currentTxListData[i]);
        }
      }
    }
    // Bỏ qua các dòng "Tiền ra (-)" (giao dịch tiền ra, VD hoàn tiền) - mẫu DS bán
    // MISA chỉ cần các giao dịch "Tiền vào (+)" (giao dịch bán hàng thực tế).
    const rowsToExport = orderedData.filter(tx => Number(tx.amount_in || 0) > 0);
    if (rowsToExport.length === 0) {
      alert("Không có giao dịch \"Tiền vào (+)\" nào để copy.");
      return;
    }

    let tsv = "";
    rowsToExport.forEach(tx => {
      const ngayLap = formatDateOnly(tx.invoice_date || "");
      const maThanhToan = tx.code || "";
      const soHd = tx.invoice_number || "";
      const maKh = tx.customer_code || "";
      const tenKh = tx.customer_name || "";
      const tenHang = (tx.invoice_item_name || "").replace(/[\r\n\t]+/g, " ").trim();
      const tienHang = (tx.amount_before_tax === "" || tx.amount_before_tax === undefined || tx.amount_before_tax === null) ? "" : String(Number(tx.amount_before_tax));
      const tienThue = (tx.vat_amount === "" || tx.vat_amount === undefined || tx.vat_amount === null) ? "" : String(Number(tx.vat_amount));

      // Cột 17: TK Có doanh thu - "5113.TT" nếu ref là "cqm" hoặc "SA0003", còn lại "5113.AFF"
      const refRaw = (tx.ref_username || "").trim().toLowerCase();
      const isTT = refRaw === "cqm" || refRaw === "sa0003";
      const tkCoDoanhThu = isTT ? "5113.TT" : "5113.AFF";

      const cols = [
        "Bán hàng hóa trong nước", // 1.  (cố định)
        "Chưa thu tiền",           // 2.  (cố định)
        "Không",                   // 3.  (cố định)
        "Có",                      // 4.  (cố định)
        "Đã lập",                  // 5.  (cố định)
        ngayLap,                   // 6.  Ngày lập
        ngayLap,                 // 7.  Ngày lập
        maThanhToan,             // 8.  Mã thanh toán
        "",                      // 9.  (trống)
        "",                      // 10. (trống)
        "",                      // 11. (trống)
        soHd,                    // 12. Số HĐ
        ngayLap,                 // 13. Ngày lập
        maKh,                    // 14. Mã KH
        tenKh,                    // 15. Tên KH
        "",                       // 16. (trống - mới chèn)
        "",                       // 17. (trống - mới chèn)
        "",                       // 18. (trống - mới chèn)
        "",                       // 19. (trống - mới chèn)
        "",                       // 20. (trống - mới chèn)
        "",                       // 21. (trống - mới chèn)
        tenHang,                  // 22. Tên hàng (invoice_item_name)
        "",                       // 23. (trống)
        "",                       // 24. (trống - mới chèn)
        "",                       // 25. (trống - mới chèn)
        "",                       // 26. (trống - mới chèn)
        "",                       // 27. (trống - mới chèn)
        "",                       // 28. (trống - mới chèn)
        "",                       // 29. (trống - mới chèn)
        tenHang,                  // 30. Tên hàng (invoice_item_name)
        "",                       // 31. (trống)
        "",                       // 32. (trống)
        "",                       // 33. (trống - mới chèn)
        "131",                    // 34. TK Nợ
        tkCoDoanhThu,             // 35. TK Có doanh thu
        "Khóa",                   // 36. Đvt
        "1",                      // 37. Số lượng
        tienHang,                  // 38. Tiền hàng
        tienHang,                  // 39. Tiền hàng
        "",                        // 40. (trống - mới chèn)
        "",                        // 41. (trống - mới chèn)
        "",                        // 42. (trống - mới chèn)
        "",                        // 43. (trống - mới chèn)
        "",                        // 44. (trống - mới chèn)
        "",                        // 45. (trống - mới chèn)
        "",                        // 46. (trống - mới chèn)
        "8",                       // 47. Thuế suất
        "",                        // 48. (trống - mới chèn)
        tienThue,                   // 49. Tiền thuế
        "33311",                    // 50. TK thuế
      ];

      tsv += cols.join("\t") + "\n";
    });
    tsv = tsv.replace(/\n$/, ""); // bỏ dòng trống thừa ở cuối khi dán vào Excel/Sheets

    navigator.clipboard.writeText(tsv).then(() => {
      const btn = document.getElementById("copyTxListMisaBtn");
      const originalText = btn.innerText; btn.innerText = "✅ Đã Copy vào Khay nhớ tạm!";
      setTimeout(() => { btn.innerHTML = originalText; }, 2000);
    }).catch(() => { alert("Không thể tự động copy. Vui lòng thử lại."); });
  } catch (e) {
    alert("Đã xảy ra lỗi khi copy: " + e.message);
  }
}

async function doInvoiceLookup() {
  const rawInput = document.getElementById("invoiceCodes").value;
  const codes = rawInput.split(/[\n,; \t]+/).map(c => c.trim()).filter(c => c !== "");
  const btn = document.getElementById("invoiceBtn"); const progress = document.getElementById("invoiceProgress");
  const tableWrap = document.getElementById("invoiceTableWrap"); const copyBtn = document.getElementById("copyInvoiceBtn");
  const tbody = document.getElementById("invoiceTbody");
  if (codes.length === 0) { progress.style.display = 'block'; progress.innerHTML = '<span class="err">Vui lòng nhập ít nhất 1 số hóa đơn.</span>'; return; }
  btn.disabled = true; progress.style.display = 'block'; tableWrap.style.display = 'block'; copyBtn.style.display = 'none';
  tbody.innerHTML = ''; let successCount = 0;
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i]; progress.innerHTML = `<span class="spinner" style="color:var(--accent)"></span> Đang xử lý ${i + 1}/${codes.length}... (${code})`;
    let tr = document.createElement("tr");
    try {
      const resp = await fetch("/api/index", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "invoice", code, access_token: getToken() }) });
      const data = await resp.json();
      if (resp.ok) {
        const ok = data.status_msg === "Thành công"; if (ok) successCount++;
        const badgeHTML = ok ? `<span class="badge ok">${escapeHtml(data.status_msg)}</span>` : `<span class="badge err">${escapeHtml(data.status_msg || 'Thất bại')}</span>`;
        const amountFmt = (v) => (v === "" || v === null || v === undefined) ? "" : Number(v).toLocaleString('vi-VN');
        tr.innerHTML = `
          <td>${badgeHTML}</td>
          <td>${escapeHtml(data.invoice_no)}</td>
          <td>${escapeHtml(data.pattern_serial)}</td>
          <td>${escapeHtml(data.arising_date)}</td>
          <td>${escapeHtml(data.customer_name)}</td>
          <td>${escapeHtml(data.customer_id)}</td>
          <td>${escapeHtml(data.customer_address)}</td>
          <td>${amountFmt(data.amount_before_tax)}</td>
          <td>${amountFmt(data.vat_amount)}</td>
          <td>${amountFmt(data.total_amount)}</td>
          <td>${escapeHtml(data.payment_method)}</td>
          <td>${escapeHtml(data.invoice_type)}</td>`;
      } else {
        tr.innerHTML = `<td><span class="badge err">Lỗi</span></td><td>${escapeHtml(code)}</td><td colspan="10">${escapeHtml(data.error || "Lỗi server")}</td>`;
      }
    } catch (e) {
      tr.innerHTML = `<td><span class="badge err">Lỗi</span></td><td>${escapeHtml(code)}</td><td colspan="10">${escapeHtml(e.message)}</td>`;
    }
    tbody.appendChild(tr);
  }
  progress.innerHTML = `🎉 Hoàn tất! Thành công <strong style="color:var(--badge-ok-text)">${successCount}/${codes.length}</strong> hóa đơn.`; copyBtn.style.display = "inline-flex"; btn.disabled = false;
}

// TRA CỨU HÓA ĐƠN THEO KHOẢNG NGÀY (SePay eInvoice) - lấy toàn bộ hóa đơn 1 lần,
// không cần nhập từng số hóa đơn như doInvoiceLookup() ở trên.
async function doInvoiceLookupByDate() {
  const dateFrom = document.getElementById("invDateFrom").value.trim();
  const dateTo = document.getElementById("invDateTo").value.trim();
  const invoiceKind = document.getElementById("invInvoiceKind").value;
  const btn = document.getElementById("invByDateBtn");
  const progress = document.getElementById("invoiceByDateProgress");
  const resultsContainer = document.getElementById("invoiceByDateResultsContainer");

  if (!dateFrom || !dateTo) {
    progress.style.display = 'block';
    progress.innerHTML = '<span class="err">Vui lòng chọn Từ ngày và Đến ngày.</span>';
    return;
  }

  btn.disabled = true;
  progress.style.display = 'block';
  progress.innerHTML = '<span class="spinner" style="color:var(--accent)"></span> Đang tải toàn bộ hóa đơn...';
  resultsContainer.innerHTML = '';

  try {
    const resp = await fetch("/api/index", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "invoice_by_date",
        start_date: dateFrom,
        end_date: dateTo,
        invoice_kind: invoiceKind,
        access_token: getToken()
      })
    });
    const data = await resp.json();
    if (!resp.ok) {
      progress.innerHTML = `<span class="err">${escapeHtml(data.error || "Lỗi server")}</span>`;
      btn.disabled = false;
      return;
    }

    const courses = data.courses || [];
    const summaryRow = document.createElement("div");
    summaryRow.className = "invoice-summary-row";
    resultsContainer.appendChild(summaryRow);
    renderInvoiceByDateSummaryTable(courses, summaryRow);
    renderInvoiceByDateRefSummaryTable(courses, summaryRow);
    renderInvoiceByDateTabs(courses);

    const total = data.total || 0;
    progress.innerHTML = total
      ? `<div class="stat-pills">
           <span class="stat-pill">🎉 Hoàn tất</span>
           <span class="stat-pill"><strong>${total}</strong>&nbsp;hóa đơn</span>
           <span class="stat-pill"><strong>${courses.length}</strong>&nbsp;khóa học</span>
         </div>`
      : 'Không tìm thấy hóa đơn nào trong khoảng ngày này.';
  } catch (e) {
    progress.innerHTML = `<span class="err">${escapeHtml(e.message)}</span>`;
  }
  btn.disabled = false;
}

// Bảng tổng hợp: mỗi khóa học 1 dòng, kèm dòng TỔNG CỘNG gộp tất cả khóa học.
// Dùng lại đúng logic loại trừ hóa đơn gốc đã bị điều chỉnh (inv.note) như từng
// bảng chi tiết, để không cộng trùng tiền.
function renderInvoiceByDateSummaryTable(courses, targetContainer) {
  const amountFmt = (v) => (v === "" || v === null || v === undefined) ? "" : Number(v).toLocaleString('vi-VN');

  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.style.cssText = "margin-bottom: 0;";

  const headerRow = document.createElement("div");
  headerRow.style.cssText = "display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;";
  headerRow.innerHTML = `
    <h3 style="margin:0; font-size:14px;">Tổng hợp theo khóa học</h3>
    <button id="copyInvoiceSummaryBtn" class="btn-outline" onclick="copyTableToClipboard('invoiceByDateSummaryTable', 'copyInvoiceSummaryBtn')" style="font-size: 13px;">📋 Copy cho Excel / Sheets</button>`;
  wrap.appendChild(headerRow);
  const hintRow = document.createElement("div");
  hintRow.style.cssText = "font-size:12px; color:var(--text-muted); margin-bottom:10px;";
  hintRow.textContent = "💡 Bấm vào 1 dòng để xem chi tiết khóa học đó bên dưới";
  wrap.appendChild(hintRow);

  const tableResponsive = document.createElement("div");
  tableResponsive.className = "table-responsive";
  const table = document.createElement("table");
  table.className = "bulk-table";
  table.id = "invoiceByDateSummaryTable";
  table.innerHTML = `
    <thead>
      <tr>
        <th>STT</th><th>Tên khóa học</th><th>Số lượng HĐ</th>
        <th>Số tiền</th><th>VAT (8%)</th><th>Tổng tiền</th><th>Số tiền REF</th>
      </tr>
    </thead>
    <tbody></tbody>`;
  const tbody = table.querySelector("tbody");

  let grandAmount = 0, grandVat = 0, grandTotal = 0, grandRef = 0, grandCount = 0;

  courses.forEach((course, idx) => {
    const invoices = course.invoices || [];
    let sumAmount = 0, sumVat = 0, sumTotal = 0, sumRef = 0;
    invoices.forEach((inv) => {
      if (inv.note && inv.note_type !== "thay_the" && inv.note_type !== "reverse_matched") return; // chỉ bỏ qua hóa đơn gốc bị điều chỉnh giảm (hoàn tiền); thay thế và các hóa đơn điều chỉnh đã tra ngược được đơn hàng (reverse_matched) vẫn tính vì tiền là thật
      sumAmount += Number(inv.amount_before_tax) || 0;
      sumVat += Number(inv.vat_amount) || 0;
      sumTotal += Number(inv.total_amount) || 0;
      sumRef += Number(inv.hoahong) || 0;
    });
    grandAmount += sumAmount; grandVat += sumVat; grandTotal += sumTotal; grandRef += sumRef;
    grandCount += invoices.length;

    const tr = document.createElement("tr");
    tr.id = `courseSummaryRow_${idx}`;
    if (idx === 0) tr.classList.add("active-course-row");
    tr.dataset.count = invoices.length;
    tr.dataset.amount = sumAmount;
    tr.dataset.vat = sumVat;
    tr.dataset.total = sumTotal;
    tr.dataset.ref = sumRef;
    tr.style.cursor = "pointer";
    tr.title = "Bấm để xem chi tiết khóa học này";
    tr.onclick = () => switchInvoiceCourseTab(idx, courses.length);
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${escapeHtml(course.title)}</td>
      <td>${invoices.length}</td>
      <td>${amountFmt(sumAmount)}</td>
      <td>${amountFmt(sumVat)}</td>
      <td>${amountFmt(sumTotal)}</td>
      <td>${amountFmt(sumRef)}</td>`;
    tbody.appendChild(tr);
  });

  // Dòng tổng cộng đặt trong <tfoot> - không bị copyTableToClipboard() lấy vào
  // (hàm này chỉ đọc <tbody>), tránh copy nhầm dòng tổng khi dán qua Excel/Sheets.
  const tfoot = document.createElement("tfoot");
  tfoot.innerHTML = `
    <tr style="font-weight:700; background:var(--total-row-bg);">
      <td colspan="2" style="text-align:right;">TỔNG CỘNG TẤT CẢ KHÓA HỌC</td>
      <td>${grandCount}</td>
      <td>${amountFmt(grandAmount)}</td>
      <td>${amountFmt(grandVat)}</td>
      <td>${amountFmt(grandTotal)}</td>
      <td>${amountFmt(grandRef)}</td>
    </tr>`;
  table.appendChild(tfoot);

  // Lọc kiểu Excel + sắp xếp, giống bảng chi tiết từng khóa học.
  const summaryColTypes = [null, 'text', 'number', 'number', 'number', 'number', 'number'];
  attachTableFilterSort(table, summaryColTypes, (visibleRows) => {
    let vCount = 0, vAmount = 0, vVat = 0, vTotal = 0, vRef = 0;
    visibleRows.forEach((row) => {
      vCount += Number(row.dataset.count) || 0;
      vAmount += Number(row.dataset.amount) || 0;
      vVat += Number(row.dataset.vat) || 0;
      vTotal += Number(row.dataset.total) || 0;
      vRef += Number(row.dataset.ref) || 0;
    });
    const tfootTds = tfoot.querySelectorAll('tr td');
    tfootTds[1].textContent = vCount;
    tfootTds[2].textContent = amountFmt(vAmount);
    tfootTds[3].textContent = amountFmt(vVat);
    tfootTds[4].textContent = amountFmt(vTotal);
    tfootTds[5].textContent = amountFmt(vRef);
  });
  // Bảng tổng hợp chỉ có vài dòng, hàng "Lọc..." không cần thiết - bỏ đi, chỉ giữ sắp xếp theo cột.
  const filterRow = table.querySelector('.table-filter-row');
  if (filterRow) filterRow.remove();

  tableResponsive.appendChild(table);
  wrap.appendChild(tableResponsive);
  targetContainer.appendChild(wrap);
}

// Bảng tổng hợp tiền REF theo Mã ref (gộp từ TẤT CẢ khóa học). Bấm vào 1 dòng
// để mở rộng xem breakdown: mã ref đó kiếm được bao nhiêu tiền REF từ mỗi khóa học.
function renderInvoiceByDateRefSummaryTable(courses, targetContainer) {
  const amountFmt = (v) => (v === "" || v === null || v === undefined) ? "" : Number(v).toLocaleString('vi-VN');

  // Một số mã ref thực chất là CÙNG 1 NGƯỜI, chỉ khác mã do đổi username/mã KH
  // theo thời gian - gộp về đúng 1 tên chuẩn duy nhất trước khi tính tổng.
  // Key của map này PHẢI viết thường (chữ thường) vì bước chuẩn hóa bên dưới
  // luôn so khớp theo dạng chữ thường, không phân biệt hoa/thường.
  const REF_ALIAS_MAP = {
    "sa0005": "phk",
    "sa0003": "cqm",
    "sa0009": "bigman",
  };

  // refMap: { [mã ref đã chuẩn hóa]: { total: number, byCourse: { [tên khóa học]: number } } }
  const refMap = {};
  courses.forEach((course) => {
    (course.invoices || []).forEach((inv) => {
      if (inv.note && inv.note_type !== "thay_the" && inv.note_type !== "reverse_matched") return; // chỉ bỏ qua hóa đơn gốc bị điều chỉnh giảm (hoàn tiền); thay thế và reverse_matched vẫn tính ref
      const rawRef = (inv.ref_username || "").trim();
      if (!rawRef) return;
      // Không phân biệt hoa/thường: "phk", "PHK", "Phk" đều gộp về cùng 1 dòng.
      const normalizedRef = rawRef.toLowerCase();
      const ref = REF_ALIAS_MAP[normalizedRef] || normalizedRef;
      const amount = Number(inv.hoahong) || 0;
      if (!refMap[ref]) refMap[ref] = { total: 0, byCourse: {} };
      refMap[ref].total += amount;
      refMap[ref].byCourse[course.title] = (refMap[ref].byCourse[course.title] || 0) + amount;
    });
  });
  // Bỏ qua mã ref có tổng tiền REF bằng 0 (VD hoa hồng 0% hoặc dữ liệu rỗng).
  // Dùng Math.round thay vì so sánh !== 0 trực tiếp - phép cộng/trừ số thực có
  // thể để lại sai số cực nhỏ (VD 0.0000000001) khiến tổng không đúng bằng 0 tuyệt đối.
  const refEntries = Object.entries(refMap)
    .filter(([, data]) => Math.round(data.total) !== 0)
    .sort((a, b) => b[1].total - a[1].total);

  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.style.cssText = "margin-bottom: 0;";

  const headerRow = document.createElement("div");
  headerRow.style.cssText = "display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;";
  headerRow.innerHTML = `
    <h3 style="margin:0; font-size:14px;">Tổng hợp tiền REF theo Mã ref</h3>
    <button id="copyInvoiceRefSummaryBtn" class="btn-outline" onclick="copyTableToClipboard('invoiceByDateRefSummaryTable', 'copyInvoiceRefSummaryBtn')" style="font-size: 13px;">📋 Copy cho Excel / Sheets</button>`;
  wrap.appendChild(headerRow);

  const tableResponsive = document.createElement("div");
  tableResponsive.className = "table-responsive";
  const table = document.createElement("table");
  table.className = "bulk-table";
  table.id = "invoiceByDateRefSummaryTable";
  table.innerHTML = `
    <thead>
      <tr><th style="width:28px;"></th><th>STT</th><th>Mã ref</th><th>Tổng tiền REF</th></tr>
    </thead>
    <tbody></tbody>`;
  const tbody = table.querySelector("tbody");

  let grandRef = 0;

  refEntries.forEach(([ref, data], idx) => {
    grandRef += data.total;
    const detailId = `refDetail_${idx}`;

    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";
    tr.title = "Bấm để xem chi tiết theo khóa học";
    tr.innerHTML = `
      <td class="ref-toggle-icon" style="text-align:center;">▶</td>
      <td>${idx + 1}</td>
      <td>${escapeHtml(ref)}</td>
      <td>${amountFmt(data.total)}</td>`;
    tr.onclick = () => toggleRefDetailRow(detailId, tr);
    tbody.appendChild(tr);

    const courseRowsHTML = Object.entries(data.byCourse)
      .sort((a, b) => b[1] - a[1])
      .map(([title, amt]) => `
        <tr>
          <td style="padding:4px 8px 4px 24px; border:none;">${escapeHtml(title)}</td>
          <td style="padding:4px 8px; text-align:right; border:none; white-space:nowrap;">${amountFmt(amt)}</td>
        </tr>`)
      .join("");

    const detailTr = document.createElement("tr");
    detailTr.id = detailId;
    detailTr.style.display = "none";
    detailTr.innerHTML = `
      <td colspan="4" style="padding:0; background:var(--input-bg);">
        <table style="width:100%; border-collapse:collapse;"><tbody>${courseRowsHTML}</tbody></table>
      </td>`;
    tbody.appendChild(detailTr);
  });

  const tfoot = document.createElement("tfoot");
  tfoot.innerHTML = `
    <tr style="font-weight:700; background:var(--total-row-bg);">
      <td colspan="3" style="text-align:right;">TỔNG CỘNG</td>
      <td>${amountFmt(grandRef)}</td>
    </tr>`;
  table.appendChild(tfoot);

  tableResponsive.appendChild(table);
  wrap.appendChild(tableResponsive);
  targetContainer.appendChild(wrap);
}

function toggleRefDetailRow(detailId, triggerRow) {
  const detailRow = document.getElementById(detailId);
  if (!detailRow) return;
  const isOpen = detailRow.style.display !== "none";
  detailRow.style.display = isOpen ? "none" : "table-row";
  const icon = triggerRow.querySelector(".ref-toggle-icon");
  if (icon) icon.textContent = isOpen ? "▶" : "▼";
}
// Dựng các panel bảng chi tiết theo khóa học, ẩn/hiện qua lại bằng cách bấm vào
// dòng tương ứng trong bảng "Tổng hợp theo khóa học" phía trên (switchInvoiceCourseTab).
// Không còn dải tab pill riêng vì trùng lặp với danh sách đã có sẵn trong bảng tổng hợp.
function renderInvoiceByDateTabs(courses) {
  const container = document.getElementById("invoiceByDateResultsContainer");
  if (courses.length === 0) return;

  courses.forEach((course, idx) => {
    const panel = document.createElement("div");
    panel.id = `coursePanel_${idx}`;
    panel.style.display = idx === 0 ? "block" : "none";
    renderInvoiceByDateCourseTable(course, idx, panel);
    container.appendChild(panel);
  });
}

function switchInvoiceCourseTab(activeIdx, total) {
  for (let i = 0; i < total; i++) {
    const row = document.getElementById(`courseSummaryRow_${i}`);
    const panel = document.getElementById(`coursePanel_${i}`);
    if (row) row.classList.toggle("active-course-row", i === activeIdx);
    if (panel) panel.style.display = i === activeIdx ? "block" : "none";
  }
}

// Dựng 1 bảng riêng cho 1 khóa học (item.id), dùng chung 13 cột đã thống nhất.
// Mỗi bảng có nút copy riêng (copyTableToClipboard đã có sẵn, dùng chung cho toàn app).
function renderInvoiceByDateCourseTable(course, courseIdx, panel) {
  const amountFmt = (v) => (v === "" || v === null || v === undefined) ? "" : Number(v).toLocaleString('vi-VN');
  const invoices = course.invoices || [];
  const tableId = `invoiceByDateTable_${courseIdx}`;
  const btnId = `copyInvoiceByDateBtn_${courseIdx}`;

  const card = document.createElement("div");
  card.className = "card";
  panel.appendChild(card);

  const headerRow = document.createElement("div");
  headerRow.style.cssText = "display:flex; justify-content:flex-end; align-items:center; margin-bottom:10px;";
  headerRow.innerHTML = `
    <button id="${btnId}" class="btn-outline" onclick="copyTableToClipboard('${tableId}', '${btnId}')" style="font-size: 13px;">📋 Copy cho Excel / Sheets</button>`;
  card.appendChild(headerRow);

  const tableResponsive = document.createElement("div");
  tableResponsive.className = "table-responsive";
  const table = document.createElement("table");
  table.className = "bulk-table";
  table.id = tableId;
  table.innerHTML = `
    <thead>
      <tr>
        <th>STT</th><th>Mã ĐH</th><th>Họ và Tên</th><th>Mã KH</th><th>Số tiền</th><th>VAT (8%)</th>
        <th>Tổng tiền</th><th>Mã ref</th><th>Tên ref</th><th>% Ref</th><th>Số tiền REF</th>
        <th>Số HĐ</th><th>Note</th><th>Ngày GD</th>
      </tr>
    </thead>
    <tbody></tbody>`;
  const tbody = table.querySelector("tbody");

  invoices.forEach((inv, idx) => {
    // Hóa đơn GỐC bị điều chỉnh giảm (note_type = "dieu_chinh", thường là hoàn
    // tiền) -> xóa trắng 7 cột tiền/ref để không cộng nhầm vào tổng cuối bảng.
    // Hóa đơn GỐC bị thay thế (note_type = "thay_the", VD đổi cá nhân sang công
    // ty) -> tiền vẫn là tiền thật, GIỮ NGUYÊN 7 cột, chỉ thêm ghi chú.
    // Hóa đơn điều chỉnh/thay thế đã tra ngược được đơn hàng từ hóa đơn GỐC
    // (note_type = "reverse_matched") -> GIỮ NGUYÊN 7 cột (đã được backend ép
    // về số âm sẵn), để thể hiện đúng khoản hoàn/trừ tiền trong bảng.
    const blankColumns = !!inv.note && inv.note_type !== "thay_the" && inv.note_type !== "reverse_matched";
    const orderCodeHTML = inv.order_code
      ? escapeHtml(inv.order_code)
      : `<span style="color:var(--text-muted);">—</span>`;
    const refRateHTML = (inv.commission_rate === "" || inv.commission_rate === null || inv.commission_rate === undefined)
      ? ""
      : `${escapeHtml(inv.commission_rate)}%`;
    const tr = document.createElement("tr");
    tr.dataset.amount = blankColumns ? "0" : (Number(inv.amount_before_tax) || 0);
    tr.dataset.vat = blankColumns ? "0" : (Number(inv.vat_amount) || 0);
    tr.dataset.total = blankColumns ? "0" : (Number(inv.total_amount) || 0);
    tr.dataset.ref = blankColumns ? "0" : (Number(inv.hoahong) || 0);
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${orderCodeHTML}</td>
      <td>${escapeHtml(inv.lead_name)}</td>
      <td>${escapeHtml(inv.username)}</td>
      <td>${blankColumns ? "" : amountFmt(inv.amount_before_tax)}</td>
      <td>${blankColumns ? "" : amountFmt(inv.vat_amount)}</td>
      <td>${blankColumns ? "" : amountFmt(inv.total_amount)}</td>
      <td>${blankColumns ? "" : escapeHtml(inv.ref_username)}</td>
      <td></td>
      <td>${blankColumns ? "" : refRateHTML}</td>
      <td>${blankColumns ? "" : amountFmt(inv.hoahong)}</td>
      <td>${escapeHtml(inv.invoice_no)}</td>
      <td>${escapeHtml(inv.note)}</td>
      <td>${escapeHtml(inv.arising_date)}</td>`;
    tbody.appendChild(tr);
  });

  // Dòng tổng cộng đặt trong <tfoot> (KHÔNG phải <tbody>) - vì copyTableToClipboard()
  // chỉ đọc dữ liệu trong <tbody>, nên đặt ở đây là cách tự nhiên nhất để nút copy
  // không vô tình copy luôn dòng tổng này.
  let sumAmount = 0, sumVat = 0, sumTotal = 0, sumRef = 0;
  invoices.forEach((inv) => {
    if (inv.note && inv.note_type !== "thay_the" && inv.note_type !== "reverse_matched") return; // chỉ bỏ qua hóa đơn gốc bị điều chỉnh giảm (hoàn tiền); thay thế và reverse_matched vẫn cộng vào tổng
    sumAmount += Number(inv.amount_before_tax) || 0;
    sumVat += Number(inv.vat_amount) || 0;
    sumTotal += Number(inv.total_amount) || 0;
    sumRef += Number(inv.hoahong) || 0;
  });
  const tfoot = document.createElement("tfoot");
  tfoot.innerHTML = `
    <tr style="font-weight:700; background:var(--total-row-bg);">
      <td colspan="4" style="text-align:right;">Tổng cộng</td>
      <td>${amountFmt(sumAmount)}</td>
      <td>${amountFmt(sumVat)}</td>
      <td>${amountFmt(sumTotal)}</td>
      <td colspan="3"></td>
      <td>${amountFmt(sumRef)}</td>
      <td colspan="3"></td>
    </tr>`;
  table.appendChild(tfoot);

  // Lọc kiểu Excel (ô nhập dưới mỗi tiêu đề cột) + bấm tiêu đề để sắp xếp.
  // Khi lọc thay đổi, tính lại dòng "Tổng cộng" theo đúng các dòng đang hiển thị,
  // dùng data-amount/vat/total/ref đã gắn sẵn (tránh phải parse lại số đã format).
  const courseColTypes = [null, 'text', 'text', 'text', 'number', 'number', 'number', 'text', null, 'number', 'number', 'text', 'text', 'text'];
  attachTableFilterSort(table, courseColTypes, (visibleRows) => {
    let vSumAmount = 0, vSumVat = 0, vSumTotal = 0, vSumRef = 0;
    visibleRows.forEach((row) => {
      vSumAmount += Number(row.dataset.amount) || 0;
      vSumVat += Number(row.dataset.vat) || 0;
      vSumTotal += Number(row.dataset.total) || 0;
      vSumRef += Number(row.dataset.ref) || 0;
    });
    const tfootTds = tfoot.querySelectorAll('tr td');
    tfootTds[1].textContent = amountFmt(vSumAmount);
    tfootTds[2].textContent = amountFmt(vSumVat);
    tfootTds[3].textContent = amountFmt(vSumTotal);
    tfootTds[5].textContent = amountFmt(vSumRef);
  });

  tableResponsive.appendChild(table);
  card.appendChild(tableResponsive);
}

// TRA CỨU HÓA ĐƠN ĐIỆN TỬ (GDT) - đăng nhập bằng MST/mật khẩu + khoảng ngày
// Chia làm 3 lần gọi API tuần tự theo từng loại hóa đơn (ttxly), mỗi lần trả kết quả
// xong là hiển thị luôn 1 bảng riêng, nối tiếp bảng trước, không cần chờ đủ cả 3 loại.
const GDT_INVOICE_TYPES = [
  { ttxly: 5, title: "Hóa đơn có mã CQT" },
  { ttxly: 6, title: "Hóa đơn không mã" },
  { ttxly: 8, title: "Hóa đơn từ máy tính tiền" },
];

function toggleGdtRowMark(checkboxEl) {
  const tr = checkboxEl.closest("tr");
  if (!tr) return;
  tr.classList.toggle("gdt-row-marked", checkboxEl.checked);
  updateGdtBulkBar();
}

function toggleGdtSelectAll(headerCb) {
  const table = headerCb.closest("table");
  if (!table) return;
  table.querySelectorAll("tbody .gdt-row-check").forEach(cb => {
    cb.checked = headerCb.checked;
    const tr = cb.closest("tr");
    if (tr) tr.classList.toggle("gdt-row-marked", cb.checked);
  });
  updateGdtBulkBar();
}

function getSelectedGdtRows() {
  const selected = [];
  document.querySelectorAll("#gdtResultsContainer tbody .gdt-row-check:checked").forEach(cb => {
    const tr = cb.closest("tr");
    const idx = Number(tr && tr.dataset.gdtIdx);
    if (Number.isInteger(idx) && gdtLastInvoices[idx]) {
      selected.push({ idx, inv: gdtLastInvoices[idx] });
    }
  });
  return selected;
}

function updateGdtBulkBar() {
  const bar = document.getElementById("gdtBulkBar");
  const countEl = document.getElementById("gdtBulkCount");
  if (!bar || !countEl) return;
  const n = getSelectedGdtRows().length;
  countEl.textContent = n === 1 ? "Đã chọn 1 hóa đơn" : `Đã chọn ${n} hóa đơn`;
  bar.classList.toggle("hidden", n === 0);

  document.querySelectorAll("#gdtResultsContainer table").forEach(table => {
    const headerCb = table.querySelector("thead .gdt-select-all");
    if (!headerCb) return;
    const boxes = [...table.querySelectorAll("tbody .gdt-row-check")];
    const checked = boxes.filter(cb => cb.checked).length;
    headerCb.checked = boxes.length > 0 && checked === boxes.length;
    headerCb.indeterminate = checked > 0 && checked < boxes.length;
  });
}

// Mục Hóa đơn nội bộ: đổi giữa tra theo số hóa đơn / theo khoảng ngày (chỉ ẩn/hiện ô nhập, kết quả giữ nguyên)
function switchInvMode(mode, btnEl) {
  document.getElementById("invModeCodes").classList.toggle("hidden", mode !== "codes");
  document.getElementById("invModeDate").classList.toggle("hidden", mode !== "date");
  btnEl.parentElement.querySelectorAll(".inv-seg-btn").forEach(b => {
    b.classList.toggle("active", b === btnEl);
    b.setAttribute("aria-selected", b === btnEl ? "true" : "false");
  });
}

function selectChoiceGroup(hiddenInputId, value, btnEl) {
  document.getElementById(hiddenInputId).value = value;
  const group = btnEl.closest(".mst-choice-group");
  if (group) group.querySelectorAll(".mst-choice-btn").forEach(b => b.classList.remove("active"));
  btnEl.classList.add("active");
}

async function doGdtInvoiceLookup() {
  const username = document.getElementById("gdtUsername").value.trim();
  const password = document.getElementById("gdtPassword").value;
  const dateFrom = document.getElementById("gdtDateFrom").value.trim();
  const dateTo = document.getElementById("gdtDateTo").value.trim();
  const isPurchase = document.getElementById("gdtIsPurchase").value === "true";

  const btn = document.getElementById("gdtSearchBtn");
  const progress = document.getElementById("gdtProgress");
  const resultsContainer = document.getElementById("gdtResultsContainer");

  if (!username || !password) {
    progress.style.display = "block";
    progress.innerHTML = '<span class="err">Vui lòng nhập Mã số thuế và Mật khẩu.</span>';
    return;
  }
  if (!dateFrom || !dateTo) {
    progress.style.display = "block";
    progress.innerHTML = '<span class="err">Vui lòng chọn "Từ ngày" và "Đến ngày".</span>';
    return;
  }

  btn.disabled = true;
  progress.style.display = "block";
  resultsContainer.innerHTML = "";
  gdtLastInvoices = [];
  gdtLastCreds = { username, password, is_purchase: isPurchase };
  gdtLastToken = null;
  updateGdtBulkBar();

  let sharedToken = null;   // Dùng lại token đăng nhập lần đầu cho 2 lần gọi sau, khỏi phải giải captcha lại
  let totalFound = 0;
  const problems = [];

  for (let t = 0; t < GDT_INVOICE_TYPES.length; t++) {
    const { ttxly, title } = GDT_INVOICE_TYPES[t];
    progress.innerHTML = `<span class="spinner" style="color:var(--accent)"></span> Đang tra cứu "${escapeHtml(title)}"... (${t + 1}/${GDT_INVOICE_TYPES.length})`;

    try {
      const resp = await fetch("/api/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "gdt_invoice_by_type",
          username, password,
          start_date: dateFrom, end_date: dateTo,
          is_purchase: isPurchase,
          ttxly,
          token: sharedToken,
          access_token: getToken()
        })
      });
      const data = await resp.json();

      if (!resp.ok) {
        problems.push(`${title}: ${data.error || "Lỗi không xác định"}`);
        // Nếu ngay lần đầu tiên (đăng nhập) đã lỗi thì dừng luôn, không thử tiếp các loại còn lại
        if (t === 0) break;
        continue;
      }

      if (data.token) {
        sharedToken = data.token;
        gdtLastToken = data.token;
      }
      const invoices = data.invoices || [];
      totalFound += invoices.length;
      renderGdtTypeTable(title, invoices);

      if (data.warnings && data.warnings.length > 0) {
        problems.push(...data.warnings.map(w => `${title}: ${w}`));
      }
    } catch (e) {
      problems.push(`${title}: Lỗi kết nối - ${e.message}`);
      if (t === 0) break;
    }
  }

  // Xoá mật khẩu khỏi ô nhập ngay sau khi gửi xong, không giữ lại trên form
  document.getElementById("gdtPassword").value = "";

  let summaryHtml;
  if (totalFound > 0) {
    summaryHtml = `🎉 Tìm thấy tổng cộng <strong style="color:var(--badge-ok-text)">${totalFound}</strong> hóa đơn.`;
  } else if (problems.length === 0) {
    summaryHtml = "⚠️ Không tìm thấy hóa đơn nào trong khoảng thời gian đã chọn.";
  } else {
    summaryHtml = "";
  }

  let problemHtml = "";
  if (problems.length > 0) {
    problemHtml = `<div style="margin-top:8px; color: var(--amount-out);">⚠️ ${problems.map(escapeHtml).join("<br>")}</div>`;
  }
  progress.innerHTML = summaryHtml + problemHtml;
  btn.disabled = false;
}

// Vẽ 1 bảng kết quả cho MỘT loại hóa đơn, nối tiếp vào bên dưới các bảng trước đó.
// Mỗi dòng trong bảng được gán index toàn cục trong gdtLastInvoices để mở popup chi tiết đúng hóa đơn.
function renderGdtTypeTable(title, invoices) {
  const container = document.getElementById("gdtResultsContainer");
  const amountFmt = (v) => (v === "" || v === null || v === undefined) ? "" : Number(v).toLocaleString('vi-VN');
  const dateFmt = (v) => {
    if (!v) return "";
    // API trả dạng "2026-07-19T17:00:00Z" -> hiển thị dd/mm/yyyy
    const d = new Date(v);
    if (isNaN(d.getTime())) return escapeHtml(v);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  };

  const wrap = document.createElement("div");
  wrap.className = "card";

  const heading = document.createElement("h3");
  heading.style.cssText = "margin:0 0 14px; font-size:14px;";
  heading.innerHTML = `${escapeHtml(title)} <span style="color:var(--text-muted); font-weight:600;">(${invoices.length})</span>`;
  wrap.appendChild(heading);

  if (invoices.length === 0) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.innerText = "Không có hóa đơn nào thuộc loại này.";
    wrap.appendChild(empty);
    container.appendChild(wrap);
    return;
  }

  const tableResponsive = document.createElement("div");
  tableResponsive.className = "table-responsive";
  const table = document.createElement("table");
  table.className = "bulk-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th style="width:40px;">
          <input type="checkbox" class="gdt-row-check gdt-select-all" title="Chọn tất cả" onchange="toggleGdtSelectAll(this)" />
        </th>
        <th>#</th><th>Ký hiệu</th><th>Số HĐ</th><th>Ngày lập</th>
        <th>MST đối tác</th><th>Tên đối tác</th><th style="text-align:right;">Tổng tiền</th>
        <th>XML</th>
      </tr>
    </thead>
    <tbody></tbody>`;
  const tbody = table.querySelector("tbody");

  invoices.forEach((inv, idx) => {
    const globalIdx = gdtLastInvoices.length;
    gdtLastInvoices.push(inv);

    const tr = document.createElement("tr");
    tr.dataset.gdtIdx = String(globalIdx);
    tr.title = "Bấm để xem chi tiết hóa đơn";
    tr.onclick = () => openGdtInvoiceDetail(globalIdx);
    tr.innerHTML = `
      <td style="text-align:center;" onclick="event.stopPropagation();">
        <input type="checkbox" class="gdt-row-check" onchange="toggleGdtRowMark(this)" />
      </td>
      <td style="text-align:center;">${idx + 1}</td>
      <td>${escapeHtml(inv.khhdon)}</td>
      <td>${escapeHtml(inv.shdon)}</td>
      <td>${dateFmt(inv.tdlap)}</td>
      <td>${escapeHtml(inv.nbmst)}</td>
      <td>${escapeHtml(inv.nbten)}</td>
      <td style="text-align:right;">${amountFmt(inv.tgtttbso)}</td>
      <td style="text-align:center;" onclick="event.stopPropagation();">
        <button type="button" class="gdt-xml-btn" title="Tải file invoice.xml gốc" onclick="downloadGdtInvoiceXml(${globalIdx}, this)">XML</button>
      </td>`;
    tbody.appendChild(tr);
  });

  tableResponsive.appendChild(table);
  wrap.appendChild(tableResponsive);
  container.appendChild(wrap);
}

// Nhãn tiếng Việt thân thiện cho các trường hay gặp trong dữ liệu hóa đơn GDT.
// Trường nào không có trong danh sách này vẫn được hiển thị bình thường (dùng luôn tên trường gốc).
const GDT_FIELD_LABELS = {
  loai: "Loại hóa đơn", khhdon: "Ký hiệu hóa đơn", khmshdon: "Mẫu số hóa đơn",
  shdon: "Số hóa đơn", tdlap: "Ngày lập", nbmst: "MST người bán", nbten: "Tên người bán",
  nbdchi: "Địa chỉ người bán", nmmst: "MST người mua", nmten: "Tên người mua",
  nmdchi: "Địa chỉ người mua", tgtcthue: "Tổng tiền trước thuế", tgtthue: "Tổng tiền thuế",
  tgtttbso: "Tổng tiền thanh toán", thtruocthue: "Tổng tiền trước thuế", ttxly: "Trạng thái xử lý",
  ttcktmai: "Tiền chiết khấu thương mại", nlap: "Người lập", hdon: "Mã hóa đơn", id: "ID hóa đơn",
  hthdon: "Hình thức hóa đơn", tthai: "Trạng thái", dvtte: "Đơn vị tiền tệ", tgia: "Tỷ giá",
  hsgcnkntt: "Ký hiệu mã CQT", cqt: "Cơ quan thuế", khdon: "Ký hiệu đơn hàng"
};

function gdtFieldLabel(key) {
  if (GDT_FIELD_LABELS[key]) return GDT_FIELD_LABELS[key];
  return String(key).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function gdtFormatValue(val) {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "boolean") return val ? "Có" : "Không";
  if (typeof val === "number") {
    // Các trường số tiền lớn hiển thị theo định dạng VN, còn lại giữ nguyên
    return Number.isInteger(val) || Math.abs(val) >= 1000 ? val.toLocaleString('vi-VN') : String(val);
  }
  if (typeof val === "string") {
    // Nhận diện chuỗi ngày dạng ISO để hiển thị dễ đọc hơn
    const isoMatch = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val);
    if (isoMatch) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      }
    }
    return escapeHtml(val);
  }
  return escapeHtml(JSON.stringify(val));
}

// Render một object phẳng (key -> giá trị đơn) thành lưới các ô field
function renderGdtFieldGrid(obj) {
  const keys = Object.keys(obj).filter(k => {
    const v = obj[k];
    return !(Array.isArray(v) || (v && typeof v === "object"));
  });
  if (keys.length === 0) return '<div class="hint">Không có trường dữ liệu nào.</div>';
  return `<div class="gdt-field-grid">` + keys.map(k => `
    <div class="gdt-field">
      <div class="gdt-field-label">${escapeHtml(gdtFieldLabel(k))}</div>
      <div class="gdt-field-value">${gdtFormatValue(obj[k])}</div>
    </div>`).join("") + `</div>`;
}

// Render một mảng object (VD: danh sách hàng hóa/dịch vụ) thành bảng con
function renderGdtArrayTable(title, arr) {
  if (!arr || arr.length === 0) return "";
  const allKeys = [];
  arr.forEach(item => {
    if (item && typeof item === "object") {
      Object.keys(item).forEach(k => { if (!allKeys.includes(k)) allKeys.push(k); });
    }
  });
  if (allKeys.length === 0) return "";
  let html = `<div class="gdt-section-title">${escapeHtml(title)}</div>`;
  html += `<div class="table-responsive"><table class="bulk-table"><thead><tr>` +
    allKeys.map(k => `<th>${escapeHtml(gdtFieldLabel(k))}</th>`).join("") + `</tr></thead><tbody>`;
  arr.forEach(item => {
    html += "<tr>" + allKeys.map(k => `<td>${gdtFormatValue(item ? item[k] : "")}</td>`).join("") + "</tr>";
  });
  html += `</tbody></table></div>`;
  return html;
}

// Render toàn bộ dữ liệu chi tiết hóa đơn nhận được từ API (không giả định trước cấu trúc,
// hiển thị đầy đủ mọi trường trả về: field đơn -> lưới ô, field là mảng object -> bảng con,
// field là object lồng -> đệ quy thành 1 khối riêng có tiêu đề).
function renderGdtDetailContent(data) {
  if (!data || typeof data !== "object") {
    return `<div class="hint">Không có dữ liệu chi tiết.</div>`;
  }
  let html = "";
  html += `<div class="gdt-section-title">Thông tin chung</div>`;
  html += renderGdtFieldGrid(data);

  Object.keys(data).forEach(k => {
    const v = data[k];
    if (Array.isArray(v)) {
      html += renderGdtArrayTable(gdtFieldLabel(k), v);
    } else if (v && typeof v === "object") {
      html += `<div class="gdt-section-title">${escapeHtml(gdtFieldLabel(k))}</div>`;
      html += renderGdtFieldGrid(v);
    }
  });
  return html;
}

async function openGdtInvoiceDetail(idx) {
  const inv = gdtLastInvoices[idx];
  if (!inv || !gdtLastCreds) return;

  gdtDetailIdx = idx;
  const overlay = document.getElementById("gdtDetailOverlay");
  const body = document.getElementById("gdtDetailBody");
  overlay.classList.remove("hidden");
  body.innerHTML = '<span class="spinner" style="color:var(--accent)"></span> Đang tải chi tiết hóa đơn...';

  try {
    const resp = await fetch("/api/index", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "gdt_invoice_detail",
        username: gdtLastCreds.username,
        password: gdtLastCreds.password,
        is_purchase: gdtLastCreds.is_purchase,
        invoice: inv,
        access_token: getToken()
      })
    });
    const data = await resp.json();

    if (!resp.ok) {
      body.innerHTML = `<span class="err">❌ ${escapeHtml(data.error || "Không lấy được chi tiết hóa đơn.")}</span>`;
      return;
    }

    // Chấp nhận cả trường hợp API trả thẳng object chi tiết hoặc bọc trong { detail: {...} } / { invoice: {...} }
    const detail = data.detail || data.invoice || data;
    body.innerHTML = renderGdtDetailContent(detail);
  } catch (e) {
    body.innerHTML = `<span class="err">❌ Lỗi kết nối: ${escapeHtml(e.message)}</span>`;
  }
}

function closeGdtInvoiceDetail() {
  document.getElementById("gdtDetailOverlay").classList.add("hidden");
  gdtDetailIdx = null;
}

function gdtXmlFilename(inv) {
  const mst = String(inv && inv.nbmst || "unknown").replace(/[^\w.\-]+/g, "_");
  const khh = String(inv && inv.khhdon || "").replace(/[^\w.\-]+/g, "_");
  const sh = String(inv && inv.shdon || "").replace(/[^\w.\-]+/g, "_");
  return `${mst}_${khh}_${sh}.xml`.replace(/_+/g, "_");
}

function downloadBlobFile(blob, filename) {
  if (typeof saveAs === "function") {
    saveAs(blob, filename);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function downloadTextFile(text, filename, mime) {
  const blob = new Blob([text], { type: mime || "application/xml;charset=utf-8" });
  downloadBlobFile(blob, filename);
}

function crc32Bytes(data) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i];
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function zipStoreFiles(files) {
  const enc = new TextEncoder();
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
  const chunks = [];
  const centrals = [];
  let offset = 0;

  files.forEach(f => {
    const nameBytes = enc.encode(f.name);
    const data = typeof f.content === "string" ? enc.encode(f.content) : f.content;
    const crc = crc32Bytes(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    chunks.push(local, data);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);
    offset += local.length + data.length;
  });

  const centralSize = centrals.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  return new Blob([...chunks, ...centrals, end], { type: "application/zip" });
}

async function fetchGdtInvoiceXml(inv) {
  if (!gdtLastCreds) throw new Error("Vui lòng tra cứu hóa đơn trước khi tải XML.");
  const resp = await fetch("/api/index", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "gdt_invoice_export_xml",
      username: gdtLastCreds.username,
      password: gdtLastCreds.password,
      invoice: inv,
      token: gdtLastToken,
      access_token: getToken()
    })
  });
  const data = await resp.json();
  if (data.token) gdtLastToken = data.token;
  if (!resp.ok) throw new Error(data.error || "Không tải được file XML.");
  if (!data.xml) throw new Error("Máy chủ không trả về nội dung invoice.xml.");
  return data;
}

async function downloadGdtInvoiceXml(idx, btnEl) {
  const inv = gdtLastInvoices[idx];
  if (!inv) return;
  const original = btnEl ? btnEl.textContent : "";
  const progress = document.getElementById("gdtProgress");
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = "..."; }
  try {
    const data = await fetchGdtInvoiceXml(inv);
    downloadTextFile(data.xml, data.filename || gdtXmlFilename(inv));
    if (btnEl) btnEl.textContent = "OK";
    if (progress) {
      progress.style.display = "block";
      progress.innerHTML = `Đã tải <strong>${escapeHtml(data.filename || gdtXmlFilename(inv))}</strong>`;
    }
  } catch (e) {
    if (btnEl) btnEl.textContent = "Lỗi";
    if (progress) {
      progress.style.display = "block";
      progress.innerHTML = `<span class="err">❌ ${escapeHtml(e.message)}</span>`;
    }
  } finally {
    if (btnEl) {
      btnEl.disabled = false;
      setTimeout(() => { if (btnEl.textContent === "OK" || btnEl.textContent === "Lỗi") btnEl.textContent = original || "XML"; }, 1400);
    }
  }
}

async function downloadSelectedGdtXml() {
  const selected = getSelectedGdtRows();
  const progress = document.getElementById("gdtProgress");
  const bulkBtn = document.getElementById("gdtBulkXmlBtn");
  if (selected.length === 0) return;
  if (!gdtLastCreds) {
    if (progress) {
      progress.style.display = "block";
      progress.innerHTML = '<span class="err">Vui lòng tra cứu hóa đơn trước khi tải XML.</span>';
    }
    return;
  }

  if (bulkBtn) bulkBtn.disabled = true;
  const files = [];
  const errors = [];

  for (let i = 0; i < selected.length; i++) {
    const { inv } = selected[i];
    if (progress) {
      progress.style.display = "block";
      progress.innerHTML = `<span class="spinner" style="color:var(--accent)"></span> Đang tải XML ${i + 1}/${selected.length} (số ${escapeHtml(inv.shdon)} — ${escapeHtml(inv.khhdon)})...`;
    }
    try {
      const data = await fetchGdtInvoiceXml(inv);
      let name = data.filename || gdtXmlFilename(inv);
      const used = files.map(f => f.name);
      if (used.includes(name)) {
        const stem = name.replace(/\.xml$/i, "");
        let n = 2;
        while (used.includes(`${stem}_${n}.xml`)) n++;
        name = `${stem}_${n}.xml`;
      }
      files.push({ name, content: data.xml });
    } catch (e) {
      errors.push(`${inv.khhdon || ""}-${inv.shdon || ""}: ${e.message}`);
    }
    if (i < selected.length - 1) await new Promise(r => setTimeout(r, 280));
  }

  if (files.length === 1 && errors.length === 0) {
    downloadTextFile(files[0].content, files[0].name);
  } else if (files.length > 0) {
    const blob = zipStoreFiles(files);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlobFile(blob, `hoa-don-xml_${stamp}.zip`);
  }

  if (progress) {
    progress.style.display = "block";
    if (files.length && errors.length === 0) {
      progress.innerHTML = `🎉 Đã tải ${files.length} file XML.`;
    } else if (files.length) {
      progress.innerHTML = `⚠️ Đã tải ${files.length}/${selected.length} file XML.<div style="margin-top:8px; color: var(--amount-out);">${errors.map(escapeHtml).join("<br>")}</div>`;
    } else {
      progress.innerHTML = `<span class="err">❌ Không tải được XML nào.</span><div style="margin-top:8px; color: var(--amount-out);">${errors.map(escapeHtml).join("<br>")}</div>`;
    }
  }
  if (bulkBtn) bulkBtn.disabled = false;
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const overlay = document.getElementById("gdtDetailOverlay");
    if (overlay && !overlay.classList.contains("hidden")) closeGdtInvoiceDetail();
  }
});

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(",", 2)[1]); r.onerror = reject; r.readAsDataURL(file);
  });
}
function downloadBase64(b64, filename) {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}
function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
}

// Chuyển tên viết hoa toàn bộ (VD: "HỒ ANH ĐỨC") thành dạng viết hoa đầu mỗi từ ("Hồ Anh Đức"), chỉ dùng để hiển thị
function toTitleCaseVN(str) {
  if (str === null || str === undefined) return "";
  return String(str).toLowerCase().split(" ").map(w => w ? w.charAt(0).toUpperCase() + w.slice(1) : w).join(" ");
}

// Lưu dữ liệu đã xử lý để dùng lại khi bấm "Tải về Excel", không cần đọc lại file
let airProcessedData = null;

// Bảng định mức & giá tiền theo từng phân loại hàng, dùng để tự động điền gợi ý vào 3 ô ghi chú
const AIR_CATEGORY_RATES = {
  "BLOUSE": { label: "Blouse", unit: "cái", rate: "2m", price: "4,5$" },
  "KID": { label: "Kid", unit: "cái", rate: "1,8m", price: "5$" },
  "JUBAH": { label: "Jubah", unit: "cái", rate: "3.5m", price: "9$" },
  "KURUNG": { label: "Kurung", unit: "bộ", rate: "3,5m", price: "10$" }
};

function setAirDropZoneState(state, fileName) {
  const zone = document.getElementById("airDropZone");
  const inner = document.getElementById("airDropZoneInner");
  const info = document.getElementById("airDropFileInfo");
  const nameEl = document.getElementById("airDropFileName");
  if (!zone || !inner || !info) return;

  zone.classList.remove("has-file", "processing", "drag-over");
  if (state === "idle") {
    inner.style.display = "";
    info.style.display = "none";
  } else if (state === "processing") {
    zone.classList.add("processing", "has-file");
    inner.style.display = "none";
    info.style.display = "flex";
    if (nameEl) nameEl.textContent = fileName ? `Đang xử lý: ${fileName}` : "Đang xử lý...";
  } else if (state === "done") {
    zone.classList.add("has-file");
    inner.style.display = "none";
    info.style.display = "flex";
    if (nameEl) nameEl.textContent = fileName || "File đã chọn";
  }
}

function isValidAirExcelFile(file) {
  if (!file) return false;
  const name = (file.name || "").toLowerCase();
  return name.endsWith(".xlsx") || name.endsWith(".xls");
}

async function doProcessAirPacking(fileOverride) {
  const fileInput = document.getElementById("airExcelFile");
  const box = document.getElementById("airResult");
  const resultArea = document.getElementById("airResultArea");

  const file = fileOverride || (fileInput && fileInput.files && fileInput.files[0]);
  if (!file) {
    box.innerHTML = '<span class="err">Vui lòng chọn file Excel.</span>';
    setAirDropZoneState("idle");
    return;
  }
  if (!isValidAirExcelFile(file)) {
    box.innerHTML = '<span class="err">Vui lòng chọn file Excel (.xlsx hoặc .xls).</span>';
    setAirDropZoneState("idle");
    if (fileInput) fileInput.value = "";
    return;
  }

  setAirDropZoneState("processing", file.name);
  resultArea.style.display = "none";
  box.innerHTML = '<span class="spinner" style="color:var(--accent)"></span> Đang đọc và xử lý dữ liệu...';

  try {
    // 1. ĐỌC DỮ LIỆU BẰNG SHEETJS
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: 'array' });

    let allBagsData = [];
    let customerName = "Khách hàng";
    let firstSheetProcessed = false;

    for (let i = 0; i < wb.SheetNames.length; i++) {
      const sheetName = wb.SheetNames[i];
      if (sheetName.toUpperCase() === 'TOTAL') continue;

      const ws = wb.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 });
      if (jsonData.length === 0) continue;

      if (!firstSheetProcessed && jsonData.length > 3) {
        if (jsonData[3][1]) customerName = String(jsonData[3][1]).trim();
        firstSheetProcessed = true;
      }

      // Đọc ô B5 (dòng 5, cột B) của sheet để xác định phân loại hàng hóa (VD: BLOUSE).
      // Nếu giá trị là "Kurung" (không phân biệt hoa/thường) thì để trống ô kết quả (nhưng vẫn giữ
      // giá trị gốc ở sheetCategoryRaw để tổng hợp vào ghi chú).
      let sheetCategory = "";
      let sheetCategoryRaw = "";
      if (jsonData.length > 4 && jsonData[4] && jsonData[4][1] !== undefined && jsonData[4][1] !== null) {
        const rawCategory = String(jsonData[4][1]).trim();
        sheetCategoryRaw = rawCategory;
        if (rawCategory.toUpperCase() !== "KURUNG") {
          sheetCategory = rawCategory;
        }
      }

      let headerIdx = jsonData.findIndex(row => row && row.some(cell => String(cell).toUpperCase().includes('BAG NO')));
      if (headerIdx === -1) continue;

      const headers = jsonData[headerIdx];
      const colBagNo = headers.findIndex(h => String(h).toUpperCase().includes('BAG NO'));
      const colItems = headers.findIndex(h => String(h).toUpperCase().includes('ITEMS'));
      const colKgs = headers.findIndex(h => String(h).toUpperCase().includes('KGS'));
      const colQtity = headers.findIndex(h => String(h).toUpperCase().includes('QTITY'));
      // Các cột size (S/M/L/XL...) nằm từ cột SIZE đến trước cột QTITY, dùng khi ô QTITY bị trống
      const colSize = headers.findIndex(h => String(h).toUpperCase().includes('SIZE'));

      let currentBagNo = null;
      let currentKgs = null;
      let sheetBagsMap = new Map();

      for (let r = headerIdx + 1; r < jsonData.length; r++) {
        const row = jsonData[r];
        if (!row || row.length === 0) continue;
        if (colItems !== -1 && (row[colItems] === undefined || row[colItems] === null || String(row[colItems]).trim() === "")) continue;

        let bagNo = row[colBagNo];
        currentBagNo = (bagNo !== undefined && bagNo !== null && String(bagNo).trim() !== "") ? String(bagNo).trim() : currentBagNo;

        let kgsRaw = row[colKgs];
        if (kgsRaw !== undefined && kgsRaw !== null && String(kgsRaw).trim() !== "") {
          let kgs = parseFloat(String(kgsRaw).replace(',', '.'));
          if (!isNaN(kgs)) currentKgs = kgs;
        }

        let qtity;
        const qtityRaw = row[colQtity];
        if ((qtityRaw === undefined || qtityRaw === null || String(qtityRaw).trim() === "") && colSize !== -1 && colSize < colQtity) {
          // File gốc quên kéo công thức =SUM(...) xuống: tự cộng các cột size
          qtity = 0;
          for (let c = colSize; c < colQtity; c++) qtity += parseFloat(row[c]) || 0;
        } else {
          qtity = parseFloat(qtityRaw) || 0;
        }

        if (currentBagNo) {
          if (!sheetBagsMap.has(currentBagNo)) {
            sheetBagsMap.set(currentBagNo, { BAG_NO: currentBagNo, QTITY: 0, KGS: currentKgs, CATEGORY: sheetCategory, RAW_CATEGORY: sheetCategoryRaw, SHEET_NAME: sheetName });
          }
          sheetBagsMap.get(currentBagNo).QTITY += qtity;
        }
      }
      sheetBagsMap.forEach(val => allBagsData.push(val));
    }

    if (allBagsData.length === 0) {
      box.innerHTML = `<span class="err">❌ Không tìm thấy dữ liệu hợp lệ trong file!</span>`;
      setAirDropZoneState("done", file.name);
      return;
    }

    // Tổng hợp số lượng theo từng phân loại hàng (dựa trên RAW_CATEGORY, gồm cả Kurung)
    // để tự động gợi ý nội dung cho 3 ô ghi chú. Chỉ xét các phân loại có trong bảng định mức.
    let categoryTotals = new Map();
    allBagsData.forEach(bag => {
      const key = (bag.RAW_CATEGORY || "").trim().toUpperCase();
      if (!key || !AIR_CATEGORY_RATES[key]) return;
      categoryTotals.set(key, (categoryTotals.get(key) || 0) + bag.QTITY);
    });
    const topCategories = Array.from(categoryTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    const categoryNotes = topCategories.map(([key, qty]) => {
      const info = AIR_CATEGORY_RATES[key];
      return `${qty} ${info.unit} ${info.label}, định mức ${info.rate}, giá ${info.price}`;
    });

    // Lưu lại để tải về sau, không tự động tải xuống ngay
    const today = new Date();
    const dateStr = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth()+1).toString().padStart(2, '0')}/${today.getFullYear()}`;
    airProcessedData = { allBagsData, customerName, dateStr, categoryNotes };

    renderAirPreviewTable(airProcessedData);
    resultArea.style.display = "block";
    const sheetCount = new Set(allBagsData.map(b => b.SHEET_NAME).filter(Boolean)).size;
    box.innerHTML = `<span class="badge ok">✅ Đã xử lý xong ${allBagsData.length} bao${sheetCount ? ` từ ${sheetCount} sheet` : ""}. Cuối mỗi sheet có dòng tổng để đối chiếu file gốc.</span>`;
    setAirDropZoneState("done", file.name);
  } catch (e) {
    box.innerHTML = `<span class="err">❌ Lỗi: ${e.message}</span>`;
    setAirDropZoneState("done", file.name);
  }
}

function initAirDropZone() {
  const zone = document.getElementById("airDropZone");
  const fileInput = document.getElementById("airExcelFile");
  const changeBtn = document.getElementById("airDropChangeBtn");
  if (!zone || !fileInput) return;

  const openPicker = () => {
    if (zone.classList.contains("processing")) return;
    fileInput.value = "";
    fileInput.click();
  };

  zone.addEventListener("click", (e) => {
    if (e.target.closest("#airDropChangeBtn")) return;
    if (zone.classList.contains("has-file") && !zone.classList.contains("processing")) {
      // Đã có file: chỉ mở lại khi bấm "Chọn file khác"
      return;
    }
    openPicker();
  });

  zone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!zone.classList.contains("has-file") || zone.classList.contains("processing")) openPicker();
    }
  });

  if (changeBtn) {
    changeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openPicker();
    });
  }

  fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files[0]) {
      doProcessAirPacking(fileInput.files[0]);
    }
  });

  zone.addEventListener("dragenter", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!zone.classList.contains("processing")) zone.classList.add("drag-over");
  });
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    if (!zone.classList.contains("processing")) zone.classList.add("drag-over");
  });
  zone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!zone.contains(e.relatedTarget)) zone.classList.remove("drag-over");
  });
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    zone.classList.remove("drag-over");
    if (zone.classList.contains("processing")) return;
    const files = e.dataTransfer && e.dataTransfer.files;
    if (!files || !files.length) return;
    const file = files[0];
    if (!isValidAirExcelFile(file)) {
      const box = document.getElementById("airResult");
      if (box) box.innerHTML = '<span class="err">Vui lòng chọn file Excel (.xlsx hoặc .xls).</span>';
      return;
    }
    // Đồng bộ vào input để người dùng có thể thấy (nếu cần)
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
    } catch (_) { /* một số trình duyệt cũ không hỗ trợ gán files */ }
    doProcessAirPacking(file);
  });
}

function initBankDropZone() {
  const zone = document.getElementById("bankDropZone");
  const fileInput = document.getElementById("bankExcelFile");
  const changeBtn = document.getElementById("bankDropChangeBtn");
  if (!zone || !fileInput) return;

  const openPicker = () => {
    if (zone.classList.contains("processing")) return;
    fileInput.value = "";
    fileInput.click();
  };

  zone.addEventListener("click", (e) => {
    if (e.target.closest("#bankDropChangeBtn")) return;
    if (zone.classList.contains("has-file") && !zone.classList.contains("processing")) return;
    openPicker();
  });

  zone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!zone.classList.contains("has-file") || zone.classList.contains("processing")) openPicker();
    }
  });

  if (changeBtn) {
    changeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openPicker();
    });
  }

  fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files[0]) {
      doBankStatement(fileInput.files[0]);
    }
  });

  zone.addEventListener("dragenter", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!zone.classList.contains("processing")) zone.classList.add("drag-over");
  });
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    if (!zone.classList.contains("processing")) zone.classList.add("drag-over");
  });
  zone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!zone.contains(e.relatedTarget)) zone.classList.remove("drag-over");
  });
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    zone.classList.remove("drag-over");
    if (zone.classList.contains("processing")) return;
    const files = e.dataTransfer && e.dataTransfer.files;
    if (!files || !files.length) return;
    const file = files[0];
    if (!isValidBankExcelFile(file)) {
      const box = document.getElementById("bankResult");
      if (box) box.innerHTML = '<span class="err" style="color:var(--badge-err-text)">Vui lòng chọn file Excel (.xlsx).</span>';
      return;
    }
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
    } catch (_) { /* ignore */ }
    doBankStatement(file);
  });
}

function initEmployeeDropZone() {
  const zone = document.getElementById("employeeDropZone");
  const fileInput = document.getElementById("employeeExcelFile");
  const changeBtn = document.getElementById("employeeDropChangeBtn");
  if (!zone || !fileInput) return;

  const openPicker = () => {
    if (zone.classList.contains("processing")) return;
    fileInput.value = "";
    fileInput.click();
  };

  zone.addEventListener("click", (e) => {
    if (e.target.closest("#employeeDropChangeBtn")) return;
    if (zone.classList.contains("has-file") && !zone.classList.contains("processing")) return;
    openPicker();
  });

  zone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!zone.classList.contains("has-file") || zone.classList.contains("processing")) openPicker();
    }
  });

  if (changeBtn) {
    changeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openPicker();
    });
  }

  fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files[0]) {
      doFetchEmployeesExcel(fileInput.files[0]);
    }
  });

  zone.addEventListener("dragenter", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!zone.classList.contains("processing")) zone.classList.add("drag-over");
  });
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    if (!zone.classList.contains("processing")) zone.classList.add("drag-over");
  });
  zone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!zone.contains(e.relatedTarget)) zone.classList.remove("drag-over");
  });
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    zone.classList.remove("drag-over");
    if (zone.classList.contains("processing")) return;
    const files = e.dataTransfer && e.dataTransfer.files;
    if (!files || !files.length) return;
    const file = files[0];
    if (!isValidEmployeeExcelFile(file)) {
      const box = document.getElementById("sheetsResult");
      if (box) box.innerHTML = '<span class="err">Vui lòng chọn file Excel (.xlsx).</span>';
      return;
    }
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
    } catch (_) { /* ignore */ }
    doFetchEmployeesExcel(file);
  });
}

function initAllDropZones() {
  initAirDropZone();
  initBankDropZone();
  initEmployeeDropZone();
}

// Khởi tạo drop zone khi DOM sẵn sàng
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAllDropZones);
} else {
  initAllDropZones();
}

function formatAirTotal(n) {
  const v = Number(n) || 0;
  return Math.round(v * 100) / 100;
}

function airCollapseDurationMs() {
  try {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 0;
  } catch (e) {}
  return 500;
}

function hideAirBagRow(tr) {
  clearTimeout(tr._airHideTimer);
  tr.classList.add("is-hidden");
  const ms = airCollapseDurationMs();
  if (ms === 0) {
    tr.classList.add("is-removed");
    return;
  }
  tr._airHideTimer = setTimeout(() => {
    if (tr.classList.contains("is-hidden")) tr.classList.add("is-removed");
  }, ms);
}

function showAirBagRow(tr) {
  clearTimeout(tr._airHideTimer);
  const wasRemoved = tr.classList.contains("is-removed");
  tr.classList.remove("is-removed");
  if (!tr.classList.contains("is-hidden")) return;
  if (wasRemoved) void tr.offsetHeight;
  requestAnimationFrame(() => {
    tr.classList.remove("is-hidden");
  });
}

function toggleAirSheetGroup(row, forceCollapsed) {
  if (!row) return;
  const idx = row.getAttribute("data-sheet-idx");
  if (idx === null) return;
  const willCollapse = (forceCollapsed !== undefined) ? !!forceCollapsed : !row.classList.contains("collapsed");
  row.classList.toggle("collapsed", willCollapse);
  row.setAttribute("aria-expanded", willCollapse ? "false" : "true");
  document.querySelectorAll('#airTbody tr.air-bag-row[data-sheet-idx="' + idx + '"]').forEach((tr) => {
    if (willCollapse) hideAirBagRow(tr);
    else showAirBagRow(tr);
  });
  updateAirCollapseAllBtn();
}

function toggleAllAirSheets() {
  const rows = document.querySelectorAll("#airTbody tr.sheet-total-row");
  if (!rows.length) return;
  const anyExpanded = Array.from(rows).some((r) => !r.classList.contains("collapsed"));
  rows.forEach((r) => toggleAirSheetGroup(r, anyExpanded));
}

function updateAirCollapseAllBtn() {
  const btn = document.getElementById("airCollapseAllBtn");
  if (!btn) return;
  const rows = document.querySelectorAll("#airTbody tr.sheet-total-row");
  const allCollapsed = rows.length > 0 && Array.from(rows).every((r) => r.classList.contains("collapsed"));
  btn.textContent = allCollapsed ? "Mở tất cả" : "Thu gọn tất cả";
}

function renderAirPreviewTable(processed) {
  const { allBagsData, customerName, dateStr, categoryNotes } = processed;
  const tbody = document.getElementById("airTbody");
  document.getElementById("airPreviewTitle").innerText = `Xem trước dữ liệu - HÀNG XUẤT AIR - ${dateStr}`;

  // Tự động điền gợi ý nội dung ghi chú (SL, định mức, giá) theo tối đa 3 phân loại hàng có số lượng lớn nhất
  const noteIds = ["airNote1", "airNote2", "airNote3"];
  noteIds.forEach((id, idx) => {
    const el = document.getElementById(id);
    if (el) el.value = (categoryNotes && categoryNotes[idx]) ? categoryNotes[idx] : "";
  });

  let totalSets = 0;
  let totalWeight = 0;
  let rowsHtml = "";
  let stt = 0;
  let i = 0;
  let sheetIdx = 0;
  while (i < allBagsData.length) {
    const sheetName = allBagsData[i].SHEET_NAME || "";
    let sheetSets = 0;
    let sheetWeight = 0;
    let sheetBagCount = 0;
    while (i < allBagsData.length && (allBagsData[i].SHEET_NAME || "") === sheetName) {
      const bag = allBagsData[i];
      stt += 1;
      sheetBagCount += 1;
      sheetSets += bag.QTITY;
      sheetWeight += (bag.KGS || 0);
      totalSets += bag.QTITY;
      totalWeight += (bag.KGS || 0);
      rowsHtml += `<tr class="air-bag-row" data-sheet-idx="${sheetIdx}">
      <td style="text-align:center;">${stt}</td>
      <td style="text-align:center;">${escapeHtml(String(bag.BAG_NO))}</td>
      <td>${escapeHtml(customerName)}</td>
      <td style="text-align:right;">${bag.QTITY}</td>
      <td style="text-align:right;">${(bag.KGS || 0)}</td>
      <td>${escapeHtml(bag.CATEGORY || "")}</td>
    </tr>`;
      i += 1;
    }
    const sheetLabel = sheetName ? `Tổng ${sheetName}` : "Tổng sheet";
    rowsHtml += `<tr class="sheet-total-row" data-sheet-idx="${sheetIdx}" role="button" tabindex="0" aria-expanded="true" title="Bấm để thu gọn / mở bag của sheet" onclick="toggleAirSheetGroup(this)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleAirSheetGroup(this);}">
      <td style="text-align:center;"><span class="sheet-toggle" aria-hidden="true">▼</span></td>
      <td style="text-align:center;">${sheetBagCount}</td>
      <td>${escapeHtml(sheetLabel)}</td>
      <td style="text-align:right;">${formatAirTotal(sheetSets)}</td>
      <td style="text-align:right;">${formatAirTotal(sheetWeight)}</td>
      <td></td>
    </tr>`;
    sheetIdx += 1;
  }
  tbody.innerHTML = rowsHtml;

  document.getElementById("airTotalBags").innerText = allBagsData.length;
  const totalLabelEl = document.getElementById("airTotalLabel");
  if (totalLabelEl) totalLabelEl.innerText = "TỔNG CỘNG";
  document.getElementById("airTotalSets").innerText = formatAirTotal(totalSets);
  document.getElementById("airTotalWeight").innerText = formatAirTotal(totalWeight);
  updateAirCollapseAllBtn();

  // Chỉ hiện nút "Chia sẻ ngay" trên thiết bị/trình duyệt hỗ trợ Web Share API (đa số điện thoại)
  const shareBtn = document.getElementById("shareAirBtn");
  if (shareBtn) {
    shareBtn.style.display = (typeof navigator.share === "function") ? "inline-block" : "none";
  }
}

// Tạo file Excel Air Packing List (dùng chung cho cả Tải về và Chia sẻ)
async function buildAirExcelFile() {
  if (!airProcessedData) {
    throw new Error("Vui lòng xử lý file trước.");
  }
  const { allBagsData, customerName, dateStr } = airProcessedData;

  // TẠO FILE MỚI & ĐỊNH DẠNG BẰNG EXCELJS
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Sheet1');

  const titleRow = worksheet.addRow([`HÀNG XUẤT AIR - ${dateStr}`]);
  worksheet.mergeCells('A1:E1');
  const titleCell = worksheet.getCell('A1');
  titleCell.font = { name: 'Arial', size: 14, bold: true };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7C7AC' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  const customBorder = {
    top: { style: 'thin', color: { argb: 'FFBE5014' } },
    left: { style: 'thin', color: { argb: 'FFBE5014' } },
    bottom: { style: 'thin', color: { argb: 'FFBE5014' } },
    right: { style: 'thin', color: { argb: 'FFBE5014' } }
  };

  const headerRow = worksheet.addRow(['STT', 'Bag\nMARK', 'Customer Name', 'SET', 'Weight']);
  headerRow.height = 49.5;
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBE2D5' } };
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = customBorder;
  });

  let totalSets = 0;
  let totalWeight = 0;
  allBagsData.forEach((bag, idx) => {
    totalSets += bag.QTITY;
    totalWeight += (bag.KGS || 0);
    const row = worksheet.addRow([idx + 1, bag.BAG_NO, customerName, bag.QTITY, bag.KGS || 0]);
    row.eachCell((cell) => {
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = customBorder;
    });
    // Ghi phân loại hàng hóa đơn giản vào cột F, không kẻ viền/tô màu, để trống nếu không có
    if (bag.CATEGORY) {
      worksheet.getCell(`F${row.number}`).value = bag.CATEGORY;
    }
  });

  const totalRow = worksheet.addRow(['', allBagsData.length, '', totalSets, totalWeight]);
  totalRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7C7AC' } };
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = customBorder;
  });

  worksheet.getColumn(1).width = 8.38;
  worksheet.getColumn(2).width = 8.38;
  worksheet.getColumn(3).width = 24.38;
  worksheet.getColumn(4).width = 8.38;
  worksheet.getColumn(5).width = 8.38;
  worksheet.getColumn(6).width = 12;

  // Ghi 3 dòng ghi chú thêm vào cột B, cách dòng tổng 2 dòng, bỏ qua ô trống (không tạo dòng cho ô trống)
  const noteValues = [
    document.getElementById("airNote1").value.trim(),
    document.getElementById("airNote2").value.trim(),
    document.getElementById("airNote3").value.trim()
  ].filter(v => v !== "");

  let noteRowNum = totalRow.number + 2;
  noteValues.forEach((val) => {
    worksheet.getCell(`B${noteRowNum}`).value = val;
    noteRowNum++;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const exportFileName = `AIR-${dateStr.replace(/\//g, '-')}.xlsx`;
  const blob = new Blob([buffer], { type: "application/octet-stream" });
  return { blob, exportFileName };
}

async function doDownloadAirPacking() {
  const box = document.getElementById("airResult");
  const dlBtn = document.getElementById("downloadAirBtn");

  if (!airProcessedData) {
    box.innerHTML = '<span class="err">Vui lòng xử lý file trước khi tải về.</span>';
    return;
  }

  dlBtn.disabled = true;
  box.innerHTML = '<span class="spinner" style="color:var(--accent)"></span> Đang tạo file Excel và định dạng Style (Màu, Viền)...';

  try {
    const { blob, exportFileName } = await buildAirExcelFile();
    saveAs(blob, exportFileName);
    box.innerHTML = `<span class="badge ok">🎉 Tuyệt vời! File  <b>${exportFileName}</b>  với đầy đủ Style đã được tạo ra.</span>`;
  } catch (e) {
    box.innerHTML = `<span class="err">❌ Lỗi: ${e.message}</span>`;
  } finally {
    dlBtn.disabled = false;
  }
}
  
async function doShareAirPacking() {
  const box = document.getElementById("airResult");
  const shareBtn = document.getElementById("shareAirBtn");

  if (!airProcessedData) {
    box.innerHTML = '<span class="err">Vui lòng xử lý file trước khi chia sẻ.</span>';
    return;
  }

  if (typeof navigator.share !== "function") {
    box.innerHTML = '<span class="err">Trình duyệt này không hỗ trợ chia sẻ trực tiếp. Vui lòng dùng nút "Tải về Excel" rồi gửi thủ công.</span>';
    return;
  }

  shareBtn.disabled = true;
  box.innerHTML = '<span class="spinner" style="color:var(--accent)"></span> Đang tạo file để chia sẻ...';

  try {
    const { blob, exportFileName } = await buildAirExcelFile();
    const file = new File([blob], exportFileName, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });

    // Kiểm tra thiết bị có hỗ trợ chia sẻ FILE (không chỉ text/link) hay không
    if (navigator.canShare && !navigator.canShare({ files: [file] })) {
      box.innerHTML = '<span class="err">Thiết bị này không hỗ trợ chia sẻ file Excel trực tiếp. Vui lòng dùng nút "Tải về Excel" rồi gửi thủ công qua Zalo/WhatsApp.</span>';
      return;
    }

    await navigator.share({
      files: [file],
      title: exportFileName,
      text: `File Air Packing List - ${exportFileName}`
    });

    box.innerHTML = `<span class="badge ok">🎉 Đã mở bảng chia sẻ cho file <b>${exportFileName}</b>. Chọn Zalo/WhatsApp để gửi tiếp.</span>`;
  } catch (e) {
    // Người dùng bấm huỷ bảng chia sẻ cũng sẽ rơi vào đây (AbortError) -> không coi là lỗi thật sự
    if (e && e.name === "AbortError") {
      box.innerHTML = '<span class="hint">Đã huỷ chia sẻ.</span>';
    } else {
      box.innerHTML = `<span class="err">❌ Lỗi khi chia sẻ: ${e.message}</span>`;
    }
  } finally {
    shareBtn.disabled = false;
  }
}

function toggleAccDetail(accountId) {
  const rows = document.querySelectorAll('.detail-row-' + accountId);
  const icon = document.getElementById('icon-' + accountId);
  
  if (rows.length > 0) {
    // Kiểm tra trạng thái của dòng đầu tiên
    const isHidden = rows[0].style.display === 'none';
    
    rows.forEach(r => {
      r.style.display = isHidden ? 'table-row' : 'none';
    });
    
    // Đổi icon mũi tên
    if (icon) icon.innerText = isHidden ? '▲' : '▼';
  }
}

// =======================================================
// EHOADON - ĐỌC TỜ KHAI HẢI QUAN (Excel -> JSON, chỉ hiển thị, chưa ghép vào form)
async function doEhoadonParseCustomsDeclaration() {
  const fileInput = document.getElementById("ehoadonCustomsFile");
  const statusEl = document.getElementById("ehoadonCustomsStatus");
  const resultEl = document.getElementById("ehoadonCustomsResult");
  const btn = document.getElementById("ehoadonCustomsBtn");

  if (!fileInput.files.length) {
    statusEl.style.display = "block";
    statusEl.innerHTML = '<span class="err">Vui lòng chọn file tờ khai hải quan.</span>';
    return;
  }

  const file = fileInput.files[0];
  btn.disabled = true;
  statusEl.style.display = "block";
  statusEl.innerHTML = '<span class="spinner" style="color:var(--accent)"></span> Đang đọc & phân tích file...';
  resultEl.innerHTML = "";

  try {
    const b64 = await fileToBase64(file);
    const resp = await fetch("/api/index", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "parse_customs_declaration",
        file_base64: b64,
        filename: file.name,
        access_token: getToken()
      })
    });
    const data = await resp.json();

    if (!resp.ok) {
      statusEl.innerHTML = `<span class="err">❌ ${escapeHtml(data.error || "Đọc file thất bại")}</span>`;
      return;
    }

    ehoadonCustomsData = data;
    const soDongHang = (data.danh_sach_hang_hoa || []).length;
    statusEl.innerHTML = `<span class="ok">✅ Đã đọc xong (${soDongHang} dòng hàng)</span>`;
    resultEl.innerHTML = `<pre style="white-space:pre-wrap; word-break:break-word; background:var(--input-bg); border:1px solid var(--input-border); border-radius:8px; padding:12px; max-height:520px; overflow:auto; font-size:12.5px; color:var(--text-main);">${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
    // Thêm dòng này ngay bên dưới:
    applyCustomsDataToForm(data);
  } catch (e) {
    statusEl.innerHTML = `<span class="err">Lỗi kết nối: ${escapeHtml(e.message)}</span>`;
  } finally {
    btn.disabled = false;
  }
}

// EHOADON - TẠO HÓA ĐƠN TỰ ĐỘNG (van.ehoadon.vn)
// =======================================================
async function doEhoadonLogin() {
  const username = document.getElementById("ehoadonUsername").value.trim();
  const password = document.getElementById("ehoadonPassword").value;
  const statusEl = document.getElementById("ehoadonLoginStatus");
  const btn = document.getElementById("ehoadonLoginBtn");

  if (!username || !password) {
    statusEl.style.display = "block";
    statusEl.innerHTML = '<span class="err">Vui lòng nhập tài khoản và mật khẩu.</span>';
    return;
  }

  btn.disabled = true;
  statusEl.style.display = "block";
  statusEl.innerHTML = '<span class="spinner" style="color:var(--accent)"></span> Đang đăng nhập...';

  try {
    const resp = await fetch("/api/index", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ehoadon_login", username, password, access_token: getToken() })
    });
    const data = await resp.json();

    if (!resp.ok) {
      statusEl.innerHTML = `<span class="err">${escapeHtml(data.error || "Đăng nhập thất bại")}</span>`;
      return;
    }

    ehoadonCookies = data.cookies || null;
    statusEl.innerHTML = '<span class="ok">✅ Đăng nhập eHoadon thành công.</span>';
    // Hiện toàn bộ các chức năng còn lại sau khi có Cookie
    document.getElementById("ehoadonCustomsCard").style.display = "block";
    document.getElementById("ehoadonBuyerCard").style.display = "block";
    document.getElementById("ehoadonInvoiceCard").style.display = "block";
    const whCard = document.getElementById("ehoadonWarehouseCard");
    if (whCard) whCard.style.display = "block";
    document.getElementById("ehoadonListCard").style.display = "block";
    
    // Gán ngày hôm nay vào lịch Flatpickr của tab eHoadon
    const ehoadonFp = document.getElementById("ehoadonDateRange")._flatpickr;
    if (ehoadonFp) {
      const todayDate = new Date();
      ehoadonFp.setDate([todayDate, todayDate]);
      document.getElementById("ehoadonFromDate").value = ehoadonFp.formatDate(todayDate, "d/m/Y");
      document.getElementById("ehoadonToDate").value = ehoadonFp.formatDate(todayDate, "d/m/Y");
    }
  } catch (e) {
    statusEl.innerHTML = `<span class="err">Lỗi kết nối: ${escapeHtml(e.message)}</span>`;
  } finally {
    btn.disabled = false;
    document.getElementById("ehoadonPassword").value = "";
  }
}

async function doEhoadonBuyerSearch() {
  const keyword = document.getElementById("ehoadonBuyerKeyword").value.trim();
  const resultsEl = document.getElementById("ehoadonBuyerResults");
  const btn = document.getElementById("ehoadonBuyerSearchBtn");

  if (!ehoadonCookies) {
    resultsEl.innerHTML = '<span class="err">Chưa đăng nhập eHoadon.</span>';
    return;
  }

  btn.disabled = true;
  resultsEl.innerHTML = '<span class="spinner" style="color:var(--accent)"></span> Đang tìm...';

  try {
    const resp = await fetch("/api/index", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ehoadon_buyer_search", cookies: ehoadonCookies, keyword, access_token: getToken() })
    });
    const data = await resp.json();

    if (!resp.ok) {
      resultsEl.innerHTML = `<span class="err">${escapeHtml(data.error || "Tìm kiếm thất bại")}</span>`;
      return;
    }
    if (data.cookies) ehoadonCookies = { ...ehoadonCookies, ...data.cookies };

    ehoadonBuyerSuggestions = data.suggestions || [];
    if (ehoadonBuyerSuggestions.length === 0) {
      resultsEl.innerHTML = '<span class="hint">Không tìm thấy khách hàng nào.</span>';
      return;
    }

    // Biến để tìm khách hàng giống nhất
    let bestMatchIdx = -1;
    let highestSim = 0;

    resultsEl.innerHTML = ehoadonBuyerSuggestions.map((b, i) => {
      const name = b.BuyerName || b.UnitName || "(Không tên)";
      
      // Tính độ giống nhau
      const sim = stringSimilarity(keyword, name);
      if (sim > highestSim) {
        highestSim = sim;
        bestMatchIdx = i;
      }

      return `<div style="padding:8px 0; border-bottom: 1px solid var(--border);">
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
          <input type="radio" name="ehoadonBuyerChoice" id="buyerRadio_${i}" onclick="selectEhoadonBuyer(${i})" />
          <span><b>${escapeHtml(name)}</b> — ${escapeHtml(b.FullAddress || "")} (${escapeHtml(b.PayMethodName || "")})</span>
        </label>
      </div>`;
    }).join("");

    // Nếu tìm thấy khách hàng giống trên 95% (0.95), tự động click chọn
    if (highestSim >= 0.95 && bestMatchIdx !== -1) {
      const radioBtn = document.getElementById(`buyerRadio_${bestMatchIdx}`);
      if (radioBtn) {
        radioBtn.checked = true;
        selectEhoadonBuyer(bestMatchIdx);
      }
    }
  } catch (e) {
    resultsEl.innerHTML = `<span class="err">Lỗi kết nối: ${escapeHtml(e.message)}</span>`;
  } finally {
    btn.disabled = false;
  }
}

function selectEhoadonBuyer(i) {
  ehoadonSelectedBuyer = ehoadonBuyerSuggestions[i];
  document.getElementById("ehoadonInvoiceCard").style.display = "block";
  const container = document.getElementById("ehoadonItemsContainer");
  if (container.childElementCount === 0) addEhoadonItemRow();
}

function addEhoadonItemRow() {
  const container = document.getElementById("ehoadonItemsContainer");
  const row = document.createElement("div");
  row.className = "row ehoadon-item-row";
  row.style.gap = "8px";
  row.innerHTML = `
    <input type="text" placeholder="Tên hàng hóa" class="ehoadon-item-name" style="flex:2; min-width:160px;">
    <input type="text" placeholder="Đơn vị (Bộ)" class="ehoadon-item-unit" style="flex:1; min-width:90px;">
    <input type="text" placeholder="Số lượng (100)" class="ehoadon-item-qty" style="flex:1; min-width:90px;">
    <input type="text" placeholder="Đơn giá (237.150)" class="ehoadon-item-price" style="flex:1; min-width:110px;">
    <input type="text" placeholder="Thành tiền (tự tính nếu trống)" class="ehoadon-item-amount" style="flex:1; min-width:140px;">
    <button type="button" class="btn-outline" onclick="this.parentElement.remove()" style="flex:0 0 auto;">✕</button>
  `;
  container.appendChild(row);
}
  
function collectEhoadonItems() {
  return [...document.querySelectorAll("#ehoadonItemsContainer .ehoadon-item-row")].map(row => ({
    name: row.querySelector(".ehoadon-item-name").value,
    unit: row.querySelector(".ehoadon-item-unit").value,
    qty: row.querySelector(".ehoadon-item-qty").value,
    price: row.querySelector(".ehoadon-item-price").value,
    amount: row.querySelector(".ehoadon-item-amount").value,
  })).filter(item => item.name.trim() !== "");
}

async function doEhoadonCreateInvoice() {
  const statusEl = document.getElementById("ehoadonInvoiceStatus");
  const btn = document.getElementById("ehoadonCreateBtn");
  const items = collectEhoadonItems();

  if (!ehoadonCookies) {
    statusEl.style.display = "block";
    statusEl.innerHTML = '<span class="err">Chưa đăng nhập eHoadon.</span>';
    return;
  }
  if (!ehoadonSelectedBuyer) {
    statusEl.style.display = "block";
    statusEl.innerHTML = '<span class="err">Chưa chọn khách hàng.</span>';
    return;
  }
  if (items.length === 0) {
    statusEl.style.display = "block";
    statusEl.innerHTML = '<span class="err">Phải nhập ít nhất 1 hàng hóa.</span>';
    return;
  }

  btn.disabled = true;
  statusEl.style.display = "block";
  statusEl.innerHTML = '<span class="spinner" style="color:var(--accent)"></span> Đang tạo hóa đơn...';

  try {
    const resp = await fetch("/api/index", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "ehoadon_invoice_create",
        cookies: ehoadonCookies,
        buyer_info: ehoadonSelectedBuyer,
        note: document.getElementById("ehoadonNote").value,
        items,
        access_token: getToken()
      })
    });
    const data = await resp.json();

    if (!resp.ok) {
      statusEl.innerHTML = `<span class="err">${escapeHtml(data.error || "Tạo hóa đơn thất bại")}</span>`;
      return;
    }
    if (data.cookies) ehoadonCookies = { ...ehoadonCookies, ...data.cookies };

    statusEl.innerHTML = `<span class="ok">✅ Hóa đơn đã được lưu (GUID: ${escapeHtml(data.invoice_guid || "")})</span>`;
  } catch (e) {
    statusEl.innerHTML = `<span class="err">Lỗi kết nối: ${escapeHtml(e.message)}</span>`;
  } finally {
    btn.disabled = false;
  }
}

async function doEhoadonCreateWarehouse() {
  const statusEl = document.getElementById("ehoadonWarehouseStatus");
  const btn = document.getElementById("ehoadonWarehouseBtn");
  const items = collectEhoadonItems();

  if (!ehoadonCookies) {
    statusEl.style.display = "block";
    statusEl.innerHTML = '<span class="err">Chưa đăng nhập eHoadon.</span>';
    return;
  }
  if (items.length === 0) {
    statusEl.style.display = "block";
    statusEl.innerHTML = '<span class="err">Phải nhập ít nhất 1 hàng hóa (dùng danh sách hàng phía trên).</span>';
    return;
  }
  // Phiếu XK bắt buộc đơn giá & thành tiền
  const missing = items.find(it => !String(it.price || "").trim() || (!String(it.amount || "").trim() && !String(it.qty || "").trim()));
  if (missing) {
    statusEl.style.display = "block";
    statusEl.innerHTML = '<span class="err">Mỗi dòng hàng cần có đơn giá (và thành tiền hoặc số lượng để tự tính).</span>';
    return;
  }

  const warehouse_info = {
    ShiftCommandNo: document.getElementById("ehoadonWhCommandNo").value.trim(),
    ShiftCommandDate: document.getElementById("ehoadonWhCommandDate").value.trim(),
    ShiftUnitName: document.getElementById("ehoadonWhUnitName").value.trim(),
    ShiftReason: document.getElementById("ehoadonWhReason").value.trim(),
    ReferenceNote: "",
    TransporterName: "",
    ContractNo: "",
    OutWareHouse: document.getElementById("ehoadonWhOut").value.trim(),
    InWareHouse: document.getElementById("ehoadonWhIn").value.trim(),
    Transportation: document.getElementById("ehoadonWhTransport").value.trim(),
    TaxCodeAgent: "",
  };

  btn.disabled = true;
  statusEl.style.display = "block";
  statusEl.innerHTML = '<span class="spinner" style="color:var(--accent)"></span> Đang tạo phiếu xuất kho...';

  try {
    const resp = await fetch("/api/index", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "ehoadon_warehouse_create",
        cookies: ehoadonCookies,
        warehouse_info,
        items,
        access_token: getToken()
      })
    });
    const data = await resp.json();

    if (!resp.ok) {
      statusEl.innerHTML = `<span class="err">${escapeHtml(data.error || "Tạo phiếu xuất kho thất bại")}</span>`;
      return;
    }
    if (data.cookies) ehoadonCookies = { ...ehoadonCookies, ...data.cookies };

    statusEl.innerHTML = `<span class="ok">✅ Phiếu xuất kho đã lưu (GUID: ${escapeHtml(data.invoice_guid || "")})</span>`;
  } catch (e) {
    statusEl.innerHTML = `<span class="err">Lỗi kết nối: ${escapeHtml(e.message)}</span>`;
  } finally {
    btn.disabled = false;
  }
}
  
// Hàm tính khoảng cách Levenshtein để đo độ giống nhau của 2 chuỗi
function stringSimilarity(s1, s2) {
  if (!s1 || !s2) return 0;
  const longer = s1.length > s2.length ? s1.toLowerCase() : s2.toLowerCase();
  const shorter = s1.length > s2.length ? s2.toLowerCase() : s1.toLowerCase();
  if (longer.length === 0) return 1.0;
  
  const costs = [];
  for (let i = 0; i <= longer.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= shorter.length; j++) {
      if (i === 0) costs[j] = j;
      else if (j > 0) {
        let newValue = costs[j - 1];
        if (longer.charAt(i - 1) !== shorter.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[shorter.length] = lastValue;
  }
  return (longer.length - costs[shorter.length]) / parseFloat(longer.length);
}

// Hàm đẩy dữ liệu Hải quan vào form eHoadon
function applyCustomsDataToForm(data) {
  if (!data) return;

  // 1. Điền Tên khách hàng vào ô Tìm kiếm
  const tenCongTy = data.nguoi_nhap_khau?.ten_cong_ty || "";
  if (tenCongTy) {
    document.getElementById("ehoadonBuyerKeyword").value = tenCongTy;
  }

  // 2. Điền số tờ khai & ngày đăng ký vào ô Ghi chú + form phiếu XK
  const soToKhai = data.thong_tin_chung?.so_to_khai || "";
  const ngayDangKyTime = data.thong_tin_chung?.ngay_dang_ky || "";
  const ngayDangKy = ngayDangKyTime.split(" ")[0]; // Lấy phần ngày DD/MM/YYYY
  
  if (soToKhai) {
    document.getElementById("ehoadonNote").value = `Hóa đơn GTGT cho tờ khai xuất khẩu số ${soToKhai} ngày ${ngayDangKy}`;
  }

  // Map sang form Phiếu xuất kho
  const whReason = document.getElementById("ehoadonWhReason");
  const whUnit = document.getElementById("ehoadonWhUnitName");
  const whDate = document.getElementById("ehoadonWhCommandDate");
  const whCmdNo = document.getElementById("ehoadonWhCommandNo");
  if (whReason && soToKhai) {
    whReason.value = `Phiếu xuất kho cho tờ khai xuất khẩu số ${soToKhai} ngày ${ngayDangKy}`;
  }
  // ShiftUnitName mặc định cố định — không ghi đè từ tờ khai
  if (whUnit && !whUnit.value.trim()) {
    whUnit.value = "CÔNG TY TNHH MAY MẶC THÀNH KIỀU";
  }
  if (whDate) {
    // Chuyển DD/MM/YYYY -> YYYY-MM-DD nếu có thể
    let isoDate = "";
    const m = ngayDangKy.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) isoDate = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    else isoDate = new Date().toISOString().slice(0, 10);
    whDate.value = isoDate;
  }
  // ShiftCommandNo: dd/mm/yy-{2 chữ cái đầu tên KH} từ ngày ĐK tờ khai + ten_cong_ty
  if (whCmdNo) {
    let datePart = "";
    const mDate = ngayDangKy.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (mDate) {
      const dd = mDate[1].padStart(2, "0");
      const mm = mDate[2].padStart(2, "0");
      const yy = mDate[3].length === 4 ? mDate[3].slice(-2) : mDate[3].padStart(2, "0");
      datePart = `${dd}/${mm}/${yy}`;
    } else {
      const d = new Date();
      datePart = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(-2)}`;
    }
    const letters = String(tenCongTy || "")
      .replace(/[^A-Za-zÀ-ỹ]/g, "")
      .toUpperCase()
      .slice(0, 2) || "XX";
    whCmdNo.value = `${datePart}-${letters}`;
  }
  // Kho nhập (InWareHouse) từ địa điểm xếp hàng
  const whIn = document.getElementById("ehoadonWhIn");
  if (whIn) {
    const diaDiemXep = String(data.thong_tin_van_chuyen_luu_kho?.dia_diem_xep_hang || "").toUpperCase();
    if (diaDiemXep.includes("VNSGN")) {
      whIn.value = "Kho hải quan Tân Sơn Nhất";
    } else if (diaDiemXep.includes("VNCLI")) {
      whIn.value = "Cảng Cát Lái";
    }
  }

  // 3. Xử lý danh sách hàng hóa
  const itemsContainer = document.getElementById("ehoadonItemsContainer");
  if (!itemsContainer) return;
  
  // Xóa sạch các dòng hàng hóa cũ (nếu có) trước khi điền dữ liệu mới
  itemsContainer.innerHTML = "";
  
  const danhSachHangHoa = data.danh_sach_hang_hoa || [];
  
  // Nếu tờ khai không có hàng hóa, tạo mặc định 1 dòng trống
  if (danhSachHangHoa.length === 0) {
      addEhoadonItemRow();
  } else {
      // Hàm phụ định dạng số theo chuẩn VN (VD: 261420 -> "261.420")
      const formatNumberVN = (num) => {
          if (num === null || num === undefined) return "";
          return Number(num).toLocaleString("vi-VN"); 
      };

      // Duyệt qua từng dòng hàng trong tờ khai
      danhSachHangHoa.forEach(hang => {
          addEhoadonItemRow(); // Gọi hàm tạo DOM dòng trống trước
          
          // Lấy dòng vừa tạo (dòng cuối cùng trong container)
          const rows = itemsContainer.querySelectorAll(".ehoadon-item-row");
          const currentRow = rows[rows.length - 1];
          
          // Quy đổi Đơn vị tính
          let donVi = hang.so_luong?.don_vi || "";
          let donViVN = donVi;
          if (donVi.toUpperCase() === "SET") donViVN = "Bộ";
          else if (donVi.toUpperCase() === "PCE") donViVN = "Cái";

          // Điền giá trị vào các ô input tương ứng
          currentRow.querySelector(".ehoadon-item-name").value = hang.mo_ta_hang_hoa || "";
          currentRow.querySelector(".ehoadon-item-unit").value = donViVN;
          currentRow.querySelector(".ehoadon-item-qty").value = formatNumberVN(hang.so_luong?.gia_tri);
          currentRow.querySelector(".ehoadon-item-price").value = formatNumberVN(hang.don_gia_tinh_thue_vnd);
          currentRow.querySelector(".ehoadon-item-amount").value = formatNumberVN(hang.tri_gia_tinh_thue_vnd);
      });
  }

  // ==========================================
  // THÊM ĐOẠN NÀY ĐỂ TỰ ĐỘNG CHẠY TÌM KIẾM
  // ==========================================
  if (tenCongTy) {
      // Dùng setTimeout 300ms để đảm bảo trình duyệt đã kịp render các ô input xong
      // trước khi đẩy lệnh gọi API tìm kiếm
      setTimeout(() => {
          const btn = document.getElementById("ehoadonBuyerSearchBtn");
          // Chỉ tự động tìm nếu nút không bị vô hiệu hóa
          if (btn && !btn.disabled) {
              doEhoadonBuyerSearch();
          }
      }, 300);
  }
}
  
async function doEhoadonFetchInvoiceList() {
  const fromDateRaw = document.getElementById("ehoadonFromDate").value;
  const toDateRaw = document.getElementById("ehoadonToDate").value;
  const resultsEl = document.getElementById("ehoadonListResults");
  const btn = document.getElementById("ehoadonListBtn");

  if (!ehoadonCookies) {
    resultsEl.innerHTML = '<span class="err">Chưa đăng nhập eHoadon.</span>';
    return;
  }

  btn.disabled = true;
  resultsEl.innerHTML = '<span class="spinner" style="color:var(--accent)"></span> Đang tải...';

  try {
    const resp = await fetch("/api/index", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "ehoadon_invoice_list",
        cookies: ehoadonCookies,
        from_date: fromDateRaw,
        to_date: toDateRaw,
        access_token: getToken()
      })
    });
    const data = await resp.json();

    if (!resp.ok) {
      resultsEl.innerHTML = `<span class="err">${escapeHtml(data.error || "Lấy danh sách thất bại")}</span>`;
      return;
    }
    if (data.cookies) ehoadonCookies = { ...ehoadonCookies, ...data.cookies };

    const invoices = data.invoices || [];
    if (invoices.length === 0) {
      resultsEl.innerHTML = '<span class="hint">Không có hóa đơn nào trong khoảng thời gian này.</span>';
      return;
    }

    const rows = invoices.map(inv => `
      <tr>
        <td>${escapeHtml(inv.invoice_no)}</td>
        <td>${escapeHtml(inv.buyer)}</td>
        <td style="text-align:right;">${escapeHtml(inv.amount)}</td>
      </tr>
    `).join("");

    resultsEl.innerHTML = `<div class="table-responsive"><table class="bulk-table" style="width:100%;">
      <thead><tr><th>Số HĐ</th><th>Khách hàng</th><th style="text-align:right;">Tổng tiền</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  } catch (e) {
    resultsEl.innerHTML = `<span class="err">Lỗi kết nối: ${escapeHtml(e.message)}</span>`;
  } finally {
    btn.disabled = false;
  }
}

// ============================================================
// Tab Giải mã VAX1 (AES-256-CBC, key = SHA-256(A ⊕ 0x5C))
// ============================================================
const VAX1_A = [
  10, 29, 4, 113, 15, 25, 31, 9, 14, 25, 113, 12, 16, 9, 27, 21,
  18, 113, 8, 19, 23, 25, 18, 113, 110, 108, 110, 106, 28, 5, 30, 3,
  20, 8, 3, 10, 29, 29, 12, 12
];

let _vax1PlaintextCache = "";

async function vax1DeriveKey() {
  const bArr = new Uint8Array(VAX1_A.map((a) => (a ^ 92) & 0xff));
  const hash = await crypto.subtle.digest("SHA-256", bArr);
  return crypto.subtle.importKey("raw", hash, { name: "AES-CBC" }, false, ["decrypt"]);
}

function vax1Pkcs7Unpad(buf) {
  if (!buf || buf.length === 0) throw new Error("Ciphertext rỗng");
  const pad = buf[buf.length - 1];
  if (pad < 1 || pad > 16) throw new Error("PKCS7 padding không hợp lệ");
  for (let i = 0; i < pad; i++) {
    if (buf[buf.length - 1 - i] !== pad) throw new Error("PKCS7 padding không hợp lệ");
  }
  return buf.slice(0, buf.length - pad);
}

function vax1Base64ToBytes(b64) {
  const cleaned = String(b64 || "").replace(/\s+/g, "");
  const padLen = (4 - (cleaned.length % 4)) % 4;
  const padded = cleaned + "=".repeat(padLen);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function decryptVax1Payload(payload) {
  let s = String(payload || "").trim();
  if (s.startsWith("VAX1:")) s = s.slice(5).trim();
  // Cho phép nội dung có nhiều dòng — lấy đoạn base64 dài nhất chứa VAX1 hoặc toàn bộ
  if (!s.includes("VAX1:") && !/^[A-Za-z0-9+/=\s]+$/.test(s.slice(0, 200))) {
    const m = String(payload || "").match(/VAX1:\s*([A-Za-z0-9+/=\s]+)/);
    if (m) s = m[1].replace(/\s+/g, "");
  } else {
    s = s.replace(/\s+/g, "");
  }
  if (!s) throw new Error("Không tìm thấy payload VAX1");

  const raw = vax1Base64ToBytes(s);
  if (raw.length <= 16) throw new Error("Payload quá ngắn (thiếu IV)");

  const iv = raw.slice(0, 16);
  const ct = raw.slice(16);
  const key = await vax1DeriveKey();
  const decrypted = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, key, ct);
  // Web Crypto đã unpad PKCS7; vẫn giữ raw ArrayBuffer
  return new Uint8Array(decrypted);
}

function vax1BytesToUtf8(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (_) {
    return null;
  }
}

async function doDecryptVax1() {
  const pasteInput = document.getElementById("vax1PasteInput");
  const urlInput = document.getElementById("vax1UrlInput");
  const statusEl = document.getElementById("vax1Status");
  const resultCard = document.getElementById("vax1ResultCard");
  const resultPre = document.getElementById("vax1ResultPre");
  const metaEl = document.getElementById("vax1Meta");
  const btn = document.getElementById("vax1DecryptBtn");
  const headersInput = document.getElementById("vax1HeadersInput");
  const pasted = (pasteInput && pasteInput.value || "").trim();
  const url = (urlInput && urlInput.value || "").trim();
  const headersText = (headersInput && headersInput.value || "").trim();

  if (!pasted && !url) {
    statusEl.style.display = "block";
    statusEl.innerHTML = '<span class="err">Vui lòng dán nội dung mã hóa hoặc nhập URL nguồn.</span>';
    return;
  }

  btn.disabled = true;
  statusEl.style.display = "block";
  statusEl.innerHTML = pasted
    ? '<span class="spinner" style="color:var(--accent)"></span> Đang giải mã…'
    : '<span class="spinner" style="color:var(--accent)"></span> Đang tải và giải mã…';
  resultCard.style.display = "none";
  _vax1PlaintextCache = "";

  try {
    let sourceText = pasted;

    if (!sourceText) {
      const resp = await fetch("/api/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "fetch_vax1",
          url,
          headers: headersText || undefined,
          access_token: getToken(),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        statusEl.innerHTML = `<span class="err">${escapeHtml(data.error || "Tải URL thất bại")}</span>`;
        return;
      }
      sourceText = data.text || "";
      if (!sourceText && data.text_b64) {
        try {
          sourceText = atob(data.text_b64);
        } catch (_) {
          statusEl.innerHTML = '<span class="err">Không đọc được nội dung nhị phân từ URL.</span>';
          return;
        }
      }
      if (!sourceText) {
        statusEl.innerHTML = '<span class="err">URL không trả về nội dung.</span>';
        return;
      }
    }

    const plainBytes = await decryptVax1Payload(sourceText);
    let text = vax1BytesToUtf8(plainBytes);
    let note = "";
    if (text === null) {
      const hex = Array.from(plainBytes.slice(0, 64)).map((b) => b.toString(16).padStart(2, "0")).join(" ");
      text = `[Binary ${plainBytes.length} bytes]\nHex (64 byte đầu): ${hex}…`;
      note = "Không phải UTF-8; có thể cần giải nén thêm (zlib/gzip) ngoài trình duyệt.";
    }

    _vax1PlaintextCache = text;
    const sourceLabel = pasted ? "từ nội dung dán" : "từ URL";
    metaEl.textContent = `Nguồn: ${sourceLabel} · Kích thước: ${plainBytes.length.toLocaleString()} byte` + (note ? ` — ${note}` : "");
    resultPre.textContent = text;
    resultCard.style.display = "block";
    statusEl.innerHTML = '<span style="color:var(--badge-ok-text);font-weight:500;">✅ Giải mã thành công</span>';
  } catch (e) {
    statusEl.innerHTML = `<span class="err">Lỗi: ${escapeHtml(e.message || String(e))}</span>`;
  } finally {
    btn.disabled = false;
  }
}

function clearVax1Result() {
  const pasteInput = document.getElementById("vax1PasteInput");
  const urlInput = document.getElementById("vax1UrlInput");
  const headersInput = document.getElementById("vax1HeadersInput");
  const statusEl = document.getElementById("vax1Status");
  const resultCard = document.getElementById("vax1ResultCard");
  const resultPre = document.getElementById("vax1ResultPre");
  if (pasteInput) pasteInput.value = "";
  if (urlInput) urlInput.value = "";
  if (headersInput) headersInput.value = "";
  if (statusEl) { statusEl.style.display = "none"; statusEl.innerHTML = ""; }
  if (resultCard) resultCard.style.display = "none";
  if (resultPre) resultPre.textContent = "";
  _vax1PlaintextCache = "";
}

async function copyVax1Result() {
  const text = _vax1PlaintextCache || (document.getElementById("vax1ResultPre") || {}).textContent || "";
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById("vax1CopyBtn");
    if (btn) {
      const old = btn.textContent;
      btn.textContent = "✅ Đã copy";
      setTimeout(() => { btn.textContent = old; }, 1500);
    }
  } catch (e) {
    alert("Không copy được: " + (e.message || e));
  }
}


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
      // Một tháng có thể dính nhiều vấn đề: mỗi vấn đề một nhãn, không có vấn đề nào mới ghi "Ổn"
      var audit = computeAuditStats(s.key);
      var badges = [];
      if (iss.open.length) badges.push(["is-danger", "Lỗi công thức " + iss.openPeople + " NV",
        "Ô trong file Excel đang báo lỗi (#NAME?, #VALUE!...) và app không tự tính lại được"]);
      if (audit.err) badges.push(["is-danger", "Lệch công " + audit.err + " NV",
        "Ngày công trên bảng lương khác với chấm công — xem tab Kiểm tra lỗi"]);
      if (!audit.attCount) badges.push(["is-warn", "Chưa có chấm công",
        "Không tìm thấy sheet chấm công của tháng này nên chưa đối soát được ngày công"]);
      if (iss.fixed.length) badges.push(["is-info", "Tự tính lại " + iss.fixedPeople + " NV",
        "Ô Thuế TNCN / Thực nhận lỗi công thức trong file, app đã tự tính lại"]);
      if (!badges.length) badges.push(["is-ok", "Ổn", "Không có ô lỗi công thức, ngày công khớp với chấm công"]);
      badges.forEach(function (b, i) {
        if (i) st.appendChild(document.createTextNode(" "));
        var badge = el("span", "v3-badge " + b[0], b[1]);
        badge.title = b[2];
        st.appendChild(badge);
      });
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
    // Tự mở tháng trước tháng hiện tại (kỳ lương đang làm); file không có tháng đó thì mở tháng mới nhất
    var list = sheets(), sel = $("sheetSelect");
    if (list.length && sel && !sel.value) {
      var d = new Date();
      d.setDate(1); d.setMonth(d.getMonth() - 1);
      var want = d.getFullYear() * 100 + d.getMonth() + 1;
      var hit = list.filter(function (s) { return s.info.order === want; })[0];
      selectMonth((hit || list[list.length - 1]).key);
    }
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

/* ---------------- Bảng lương: đọc thẳng Google Sheet ----------------
   Đăng nhập Google ngay trên trình duyệt (Google Identity Services, quyền chỉ-đọc Sheets),
   gọi Google Sheets API lấy giá trị Google đã tính, dựng lại thành 1 workbook trong bộ nhớ
   rồi đưa qua đúng hàm đọc file Excel sẵn có (doFetchEmployeesExcel) — không đổi logic xử lý.
   Access token chỉ giữ trong bộ nhớ của tab (hết hạn sau ~1 giờ), không lưu ở đâu cả. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var btn = $("v3GsheetBtn"), input = $("v3GsheetUrl"), statusEl = $("v3GsheetStatus");
  if (!btn || !input || !statusEl) return;

  var SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
  var URL_KEY = "v3_payroll_gsheet_url";
  var PAYROLL_RE = /^T\d{2}20\d{2}$/;
  var ATTEND_RE = /ch[aấ]m\s*c[oô]ng/i;
  var ERR_RE = /^#(N\/A|NAME\?|VALUE!|REF!|DIV\/0!|NUM!|NULL!|ERROR!)$/;
  var ERR_CODE = { "#NULL!": 0, "#DIV/0!": 7, "#VALUE!": 15, "#REF!": 23, "#NAME?": 29, "#NUM!": 36, "#N/A": 42, "#ERROR!": 15 };

  var token = null, tokenExp = 0, clientIdPromise = null, gsiPromise = null;

  try { var saved = localStorage.getItem(URL_KEY); if (saved && !input.value) input.value = saved; } catch (e) {}

  function setStatus(text, kind) {
    statusEl.textContent = text || "";
    statusEl.className = "v3-gsheet-status" + (kind ? " is-" + kind : "");
  }
  function setBusy(on, label) {
    btn.disabled = on;
    btn.setAttribute("aria-busy", on ? "true" : "false");
    $("v3GsheetBtnText").textContent = label || (token && Date.now() < tokenExp ? "Đọc lại từ Google Sheet" : "Đăng nhập Google và đọc");
  }

  function spreadsheetId(text) {
    var s = String(text || "").trim();
    var m = /\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/.exec(s);
    if (m) return m[1];
    return /^[a-zA-Z0-9_-]{20,}$/.test(s) ? s : "";
  }

  function getClientId() {
    if (!clientIdPromise) {
      clientIdPromise = fetch("/api/index", { cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : {}; })
        .then(function (d) { return (d && d.google_client_id) || ""; })
        .catch(function () { return ""; });
    }
    return clientIdPromise;
  }

  function loadGsi() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (!gsiPromise) {
      gsiPromise = new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = "https://accounts.google.com/gsi/client";
        s.async = true;
        s.onload = function () { resolve(); };
        s.onerror = function () { gsiPromise = null; reject(new Error("Không tải được thư viện đăng nhập Google. Kiểm tra mạng rồi thử lại.")); };
        document.head.appendChild(s);
      });
    }
    return gsiPromise;
  }

  function getToken(clientId) {
    if (token && Date.now() < tokenExp - 60000) return Promise.resolve(token);
    return new Promise(function (resolve, reject) {
      var client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: function (resp) {
          if (resp && resp.access_token) {
            token = resp.access_token;
            tokenExp = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
            resolve(token);
          } else reject(new Error((resp && resp.error_description) || "Đăng nhập Google không thành công."));
        },
        error_callback: function (err) {
          var t = err && err.type;
          reject(new Error(t === "popup_closed" ? "Bạn đã đóng cửa sổ đăng nhập Google."
            : t === "popup_failed_to_open" ? "Trình duyệt chặn cửa sổ đăng nhập. Cho phép popup cho trang này rồi thử lại."
            : "Đăng nhập Google không thành công."));
        }
      });
      client.requestAccessToken({ prompt: token ? "" : "select_account" });
    });
  }

  function api(url, tk) {
    return fetch(url, { headers: { Authorization: "Bearer " + tk } }).then(function (r) {
      if (r.ok) return r.json();
      return r.json().catch(function () { return {}; }).then(function (body) {
        var msg = (body && body.error && body.error.message) || ("HTTP " + r.status);
        if (r.status === 401) { token = null; msg = "Phiên đăng nhập Google đã hết hạn. Bấm lại để đăng nhập."; }
        else if (r.status === 403) msg = "Tài khoản Google này chưa có quyền xem file, hoặc Google Sheets API chưa được bật cho ứng dụng. (" + msg + ")";
        else if (r.status === 404) msg = "Không tìm thấy file. Kiểm tra lại link Google Sheet.";
        throw new Error(msg);
      });
    });
  }

  // Dựng workbook trong bộ nhớ từ kết quả Sheets API; ô lỗi (#VALUE!...) giữ đúng kiểu "lỗi"
  // để phần đọc bảng lương nhận ra và cảnh báo như khi đọc file Excel.
  function toWorkbookFile(title, sheetTitles, valueRanges) {
    var wb = XLSX.utils.book_new();
    valueRanges.forEach(function (vr, i) {
      var ws = XLSX.utils.aoa_to_sheet(vr.values || [[]]);
      Object.keys(ws).forEach(function (addr) {
        if (addr.charAt(0) === "!") return;
        var c = ws[addr];
        if (c && c.t === "s" && ERR_RE.test(c.v)) { ws[addr] = { t: "e", v: ERR_CODE[c.v] != null ? ERR_CODE[c.v] : 15, w: c.v }; }
      });
      XLSX.utils.book_append_sheet(wb, ws, sheetTitles[i].slice(0, 31));
    });
    // Không ghi ra byte rồi đọc lại: gắn workbook vào File để doFetchEmployeesExcel dùng thẳng
    var file = new File([], title + " (Google Sheet).xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    file.__workbook = wb;
    return file;
  }

  async function run() {
    var id = spreadsheetId(input.value);
    if (!id) { setStatus("Dán link Google Sheet dạng https://docs.google.com/spreadsheets/d/…", "err"); input.focus(); return; }
    try { localStorage.setItem(URL_KEY, input.value.trim()); } catch (e) {}

    setBusy(true, "Đang kết nối…");
    try {
      var clientId = await getClientId();
      if (!clientId) throw new Error("Chưa cấu hình đăng nhập Google: thêm biến môi trường GOOGLE_OAUTH_CLIENT_ID trên Vercel rồi deploy lại.");
      await loadGsi();
      setStatus("Đang chờ đăng nhập Google…");
      var tk = await getToken(clientId);

      setBusy(true, "Đang đọc…");
      setStatus("Đang lấy danh sách sheet…");
      var base = "https://sheets.googleapis.com/v4/spreadsheets/" + encodeURIComponent(id);
      var meta = await api(base + "?fields=" + encodeURIComponent("properties.title,sheets.properties(title,sheetType)"), tk);
      var titles = (meta.sheets || [])
        .map(function (s) { return s.properties || {}; })
        .filter(function (p) { return !p.sheetType || p.sheetType === "GRID"; })
        .map(function (p) { return p.title; })
        .filter(function (t) { var n = String(t).normalize("NFC").trim(); return PAYROLL_RE.test(n) || ATTEND_RE.test(n); });
      if (!titles.some(function (t) { return PAYROLL_RE.test(String(t).trim()); })) {
        throw new Error("File không có sheet lương dạng T072026, T082026…");
      }

      setStatus("Đang đọc " + titles.length + " sheet (lương và chấm công)…");
      var qs = titles.map(function (t) { return "ranges=" + encodeURIComponent("'" + String(t).replace(/'/g, "''") + "'"); }).join("&");
      var data = await api(base + "/values:batchGet?" + qs + "&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER&majorDimension=ROWS", tk);

      var file = toWorkbookFile((meta.properties && meta.properties.title) || "Bảng lương", titles, data.valueRanges || []);
      await window.doFetchEmployeesExcel(file);
      var now = new Date();
      setStatus("Đã đọc " + titles.length + " sheet từ “" + ((meta.properties && meta.properties.title) || "Google Sheet") + "” lúc " +
        String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0") + ".", "ok");
    } catch (e) {
      setStatus(e && e.message ? e.message : String(e), "err");
    } finally {
      setBusy(false);
    }
  }

  btn.addEventListener("click", run);
  input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); run(); } });
  // Cho phép kiểm thử phần dựng workbook mà không cần đăng nhập
  window.__v3GsheetToFile = toWorkbookFile;
})();
