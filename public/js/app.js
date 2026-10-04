/* AgentDeduct v2 — app boot, routing, shared UI helpers. */
(function () {
  "use strict";

  var money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  var money0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  function fmtMoney(n) { return money.format(Number(n) || 0); }
  function fmtMoney0(n) { return money0.format(Math.round(Number(n) || 0)); }
  function fmtMiles(n) {
    n = Number(n) || 0;
    return (Math.round(n * 10) / 10).toLocaleString("en-US", { maximumFractionDigits: 1 });
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtDate(iso) {
    if (!iso) return "";
    var p = String(iso).slice(0, 10).split("-");
    if (p.length < 3) return iso;
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  function fmtDateLong(iso) {
    if (!iso) return "";
    var p = String(iso).slice(0, 10).split("-");
    if (p.length < 3) return iso;
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  var toastTimer = null;
  function toast(msg) {
    var el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2600);
  }

  function applyTheme() {
    var mode = (AD.db.settings.darkMode || "auto");
    var dark = mode === "dark" || (mode === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (dark) document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
  }

  /* ---- tabs ---- */
  var currentTab = "home";
  function showTab(name) {
    currentTab = name;
    document.querySelectorAll(".view").forEach(function (v) { v.classList.remove("active"); });
    document.querySelectorAll(".tab").forEach(function (t) { t.classList.toggle("active", t.dataset.tab === name); });
    var el = document.getElementById("view-" + name);
    if (el) el.classList.add("active");
    var render = AD.views[name];
    if (render) render();
    window.scrollTo(0, 0);
  }

  /* ---- bottom sheet ---- */
  function openSheet() {
    document.getElementById("scrim").classList.add("open");
    document.getElementById("addSheet").classList.add("open");
    AD.views.add.render();
  }
  function closeSheet() {
    document.getElementById("scrim").classList.remove("open");
    document.getElementById("addSheet").classList.remove("open");
  }

  /* ---- deal options for pickers ---- */
  function dealOptions(selectedId, includeNone) {
    var deals = AD.db.deals.filter(function (d) { return d.status !== "archived"; });
    var html = includeNone ? '<option value="">No property</option>' : "";
    html += deals.map(function (d) {
      return '<option value="' + esc(d.id) + '"' + (d.id === selectedId ? " selected" : "") + ">" +
        esc(d.address) + (d.status === "closed" ? " (closed)" : "") + "</option>";
    }).join("");
    return html;
  }
  function dealLabel(dealId) {
    if (!dealId) return "";
    var d = AD.db.deals.filter(function (x) { return x.id === dealId; })[0];
    return d ? d.address : "";
  }

  function persist() {
    AD.store.save(AD.db);
    if (AD.db._quotaWarning) {
      AD.db._quotaWarning = false;
      toast("Saved, but receipt photos were too large to keep.");
    }
  }

  function yearOptions() {
    var years = {};
    AD.db.expenses.forEach(function (e) { years[String(e.date || "").slice(0, 4)] = 1; });
    AD.db.drives.forEach(function (d) { years[String(d.date || "").slice(0, 4)] = 1; });
    var cur = String(new Date().getFullYear());
    years[cur] = 1;
    years[String(Number(cur) - 1)] = 1;
    return Object.keys(years).sort().reverse();
  }

  function refreshYearSelect() {
    var sel = document.getElementById("yearSelect");
    var years = yearOptions();
    sel.innerHTML = years.map(function (y) {
      return '<option value="' + y + '"' + (y === AD.year ? " selected" : "") + ">" + y + "</option>";
    }).join("");
  }

  function boot() {
    AD.db = AD.store.load();
    AD.year = String(new Date().getFullYear());
    applyTheme();
    refreshYearSelect();

    document.getElementById("yearSelect").addEventListener("change", function (e) {
      AD.year = e.target.value;
      showTab(currentTab);
    });

    document.querySelectorAll(".tab").forEach(function (t) {
      t.addEventListener("click", function () { showTab(t.dataset.tab); });
    });
    document.getElementById("fabAdd").addEventListener("click", openSheet);
    document.getElementById("settingsBtn").addEventListener("click", function () { showTab("settings"); });
    document.getElementById("scrim").addEventListener("click", closeSheet);
    document.getElementById("sheetClose").addEventListener("click", closeSheet);

    // Theme follows the OS while set to auto.
    try {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
        if ((AD.db.settings.darkMode || "auto") === "auto") applyTheme();
      });
    } catch (e) {}

    // First-run: a friendly hello + analytics ping.
    try {
      if (!localStorage.getItem("agentDeduct.v2.seen")) {
        localStorage.setItem("agentDeduct.v2.seen", "yes");
        AD.track("app_opened");
      }
    } catch (e) {}

    showTab("home");
  }

  window.AD = window.AD || {};
  AD.views = AD.views || {};
  Object.assign(AD, {
    money: fmtMoney, money0: fmtMoney0, fmtMiles: fmtMiles, esc: esc,
    fmtDate: fmtDate, fmtDateLong: fmtDateLong,
    toast: toast, showTab: showTab, openSheet: openSheet, closeSheet: closeSheet,
    dealOptions: dealOptions, dealLabel: dealLabel,
    persist: persist, refreshYearSelect: refreshYearSelect, applyTheme: applyTheme,
    boot: boot,
  });

  document.addEventListener("DOMContentLoaded", boot);
})();
