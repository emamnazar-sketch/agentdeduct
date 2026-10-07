/* AgentDeduct v2 — Home view: tax-savings hero, nudges, today's activity. */
(function () {
  "use strict";

  var BRACKETS = [0.10, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37];

  function bracketNudges() {
    var html = "";
    // Quarterly estimated tax reminder.
    var due = AD.store.nextQuarterlyDue();
    if (due) {
      var days = Math.round((new Date(due + "T00:00:00") - new Date(AD.store.todayStr() + "T00:00:00")) / 86400000);
      if (days <= 21) {
        var label = new Date(due + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" });
        html += '<div class="nudge gold"><span class="ico">⏰</span><div><b>Estimated taxes due ' + label + '.</b><br>' +
          'Your deductions so far cut what you owe. Log everything before then.</div></div>';
      }
    }
    // Recurring bills.
    AD.store.recurringSuggestions(AD.db).forEach(function (s) {
      var cat = AD.store.CATEGORIES[s.categoryId] || {};
      html += '<div class="nudge blue"><span class="ico">🔁</span><div><b>' + AD.esc(s.vendor) + ' ' + AD.money(s.amount) +
        ' looks due again.</b><br>Same bill as last month' + (cat.label ? " (" + AD.esc(cat.label) + ")" : "") +
        '.</div><span class="act"><button class="btn-inline" data-recurring=\'' + AD.esc(JSON.stringify(s)) + "'>Log it</button></span></div>";
    });
    // Audit armor: deductions without receipts.
    var t = AD.store.yearTotals(AD.db, AD.year);
    if (t.count > 0 && t.receipts < t.count) {
      var missing = t.count - t.receipts;
      html += '<div class="nudge"><span class="ico">🛡️</span><div><b>Audit armor: ' + missing + ' deduction' +
        (missing === 1 ? "" : "s") + ' missing a receipt.</b><br>Snap a photo and every dollar is defended.</div></div>';
    }
    return html;
  }

  function todayItems() {
    var t = AD.store.todayStr();
    var items = [];
    AD.db.drives.forEach(function (d) {
      if (d.date === t) items.push({ kind: "drive", date: d.date, title: d.purpose || "Business drive", sub: AD.fmtMiles(d.miles) + " mi", amt: AD.store.driveDeductible(d), icon: "🚗" });
    });
    AD.db.expenses.forEach(function (e) {
      if (e.date === t) {
        var cat = AD.store.CATEGORIES[e.categoryId] || {};
        items.push({ kind: "expense", date: e.date, title: e.vendor || cat.label || "Expense", sub: cat.label || "", amt: AD.store.expenseDeductible(e), icon: cat.icon || "💰" });
      }
    });
    return items;
  }

  function recentItems(n) {
    var items = [];
    AD.db.drives.forEach(function (d) {
      items.push({ ts: d.date + " " + (d.createdAt || ""), kind: "drive", title: d.purpose || "Business drive", sub: AD.fmtDate(d.date) + " · " + AD.fmtMiles(d.miles) + " mi", amt: AD.store.driveDeductible(d), icon: "🚗" });
    });
    AD.db.expenses.forEach(function (e) {
      var cat = AD.store.CATEGORIES[e.categoryId] || {};
      items.push({ ts: e.date + " " + (e.createdAt || ""), kind: "expense", title: e.vendor || cat.label || "Expense", sub: AD.fmtDate(e.date) + (cat.label ? " · " + cat.label : ""), amt: AD.store.expenseDeductible(e), icon: cat.icon || "💰" });
    });
    items.sort(function (a, b) { return a.ts < b.ts ? 1 : -1; });
    return items.slice(0, n || 6);
  }

  var MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  function monthLabel(ym) {
    var p = String(ym || "").split("-");
    var mi = Number(p[1] || 1) - 1;
    return MONTH_NAMES[Math.min(11, Math.max(0, mi))] + " " + (p[0] || "");
  }

  function shiftMonth(ym, dir) {
    var p = String(ym || "").split("-");
    var d = new Date(Number(p[0]), Number(p[1]) - 1 + dir, 1);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }

  function render() {
    var el = document.getElementById("view-home");
    var period = AD.db.settings.homePeriod || "year";
    var vm = AD.db.settings.homeMonth || AD.store.todayStr().slice(0, 7);
    var t, periodLabel;
    if (period === "month") {
      var mp = vm.split("-");
      t = AD.store.monthTotals(AD.db, mp[0], mp[1]);
      periodLabel = monthLabel(vm);
    } else {
      t = AD.store.yearTotals(AD.db, AD.year);
      periodLabel = AD.year;
    }
    var bracket = Number(AD.db.settings.taxBracket || 0.22);
    var pct = Math.round(bracket * 100);

    var html = "";
    html += '<div class="period-toggle no-print" role="tablist" aria-label="View period">' +
      '<button type="button" id="ptYear" class="' + (period === "year" ? "active" : "") + '">📅 Year</button>' +
      '<button type="button" id="ptMonth" class="' + (period === "month" ? "active" : "") + '">🗓️ Month</button></div>';
    if (period === "month") {
      html += '<div class="month-nav no-print">' +
        '<button type="button" id="monthPrev" aria-label="Previous month">◀</button>' +
        '<span id="monthLabel">' + AD.esc(periodLabel) + "</span>" +
        '<button type="button" id="monthNext" aria-label="Next month">▶</button></div>';
    }
    html += '<div class="hero no-print"><div class="eyebrow">Estimated ' + AD.esc(periodLabel) + ' tax savings</div>' +
      '<div class="big savings-tick" id="heroSavings">' + AD.money0(t.taxSavings) + "</div>" +
      '<div class="sub">from ' + AD.money0(t.deductions) + ' in deductions</div>' +
      '<div class="bracket">at a ' + pct + '% tax bracket · <button type="button" id="heroBracket">change</button></div></div>';

    html += bracketNudges();

    html += '<div class="stat-grid">' +
      '<div class="stat"><div class="v">' + AD.fmtMiles(t.miles) + '</div><div class="l">miles driven</div></div>' +
      '<div class="stat"><div class="v">' + t.count + '</div><div class="l">deductions logged</div></div>' +
      '<div class="stat"><div class="v">' + t.receipts + '</div><div class="l">receipts saved</div></div></div>';

    var today = todayItems();
    html += '<div class="card"><h3>Today</h3>';
    if (!today.length) {
      html += '<div class="empty"><span class="big-ico">☀️</span>Nothing logged yet today.<br>It takes 10 seconds — tap + below.</div>';
    } else {
      html += today.map(function (it) {
        return '<div class="row-item"><div class="row-ico">' + it.icon + '</div><div class="row-main">' +
          '<div class="row-title">' + AD.esc(it.title) + '</div><div class="row-sub">' + AD.esc(it.sub) + "</div></div>" +
          '<div class="row-amt">' + AD.money(it.amt) + "<small>deduction</small></div></div>";
      }).join("");
    }
    html += "</div>";

    var recent = recentItems(6);
    html += '<div class="card"><h3>Recent activity</h3>';
    if (!recent.length) {
      html += '<div class="empty"><span class="big-ico">🚗</span>Your drives and expenses will show up here.</div>';
    } else {
      html += recent.map(function (it) {
        return '<div class="row-item"><div class="row-ico">' + it.icon + '</div><div class="row-main">' +
          '<div class="row-title">' + AD.esc(it.title) + '</div><div class="row-sub">' + AD.esc(it.sub) + "</div></div>" +
          '<div class="row-amt">' + AD.money(it.amt) + "</div></div>";
      }).join("");
    }
    html += "</div>";

    html += '<p class="privacy-note center">🔒 <b>Private by design.</b> Everything stays on this device — no account, no cloud, no selling your data. <a href="privacy.html" style="color:var(--green);font-weight:700;">How it works</a></p>';

    el.innerHTML = html;

    var py = document.getElementById("ptYear");
    if (py) py.addEventListener("click", function () {
      AD.db.settings.homePeriod = "year"; AD.persist(); render();
    });
    var pm = document.getElementById("ptMonth");
    if (pm) pm.addEventListener("click", function () {
      AD.db.settings.homePeriod = "month";
      if (!AD.db.settings.homeMonth) AD.db.settings.homeMonth = AD.store.todayStr().slice(0, 7);
      AD.persist(); render();
    });
    var mp = document.getElementById("monthPrev");
    if (mp) mp.addEventListener("click", function () {
      AD.db.settings.homeMonth = shiftMonth(AD.db.settings.homeMonth || AD.store.todayStr().slice(0, 7), -1);
      AD.persist(); render();
    });
    var mn = document.getElementById("monthNext");
    if (mn) mn.addEventListener("click", function () {
      AD.db.settings.homeMonth = shiftMonth(AD.db.settings.homeMonth || AD.store.todayStr().slice(0, 7), 1);
      AD.persist(); render();
    });

    var hb = document.getElementById("heroBracket");
    if (hb) hb.addEventListener("click", function () { AD.showTab("settings"); });

    el.querySelectorAll("[data-recurring]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        try {
          var s = JSON.parse(btn.getAttribute("data-recurring"));
          AD.db.expenses.unshift({
            id: AD.store.uid(),
            date: AD.store.todayStr(),
            amount: s.amount,
            categoryId: s.categoryId,
            vendor: s.vendor,
            purpose: "",
            businessUsePct: s.businessUsePct != null ? s.businessUsePct : 100,
            dealId: null,
            giftFor: "",
            receipt: null,
            createdAt: new Date().toISOString(),
          });
          AD.persist();
          AD.track("expense_saved");
          AD.toast("Logged " + AD.money(s.amount) + " for " + s.vendor);
          popSavings();
          render();
        } catch (e) {}
      });
    });
  }

  function popSavings() {
    var el = document.getElementById("heroSavings");
    if (!el) return;
    el.classList.remove("tickpop");
    void el.offsetWidth;
    el.classList.add("tickpop");
  }

  AD.views.home = render;
  AD.views.popSavings = popSavings;
})();
