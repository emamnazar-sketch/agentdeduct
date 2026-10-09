/* AgentDeduct v2 — Reports view: Schedule C summary, CPA print export, CSV, backup. */
(function () {
  "use strict";

  function render() {
    var el = document.getElementById("view-reports");
    var year = AD.year;
    var t = AD.store.yearTotals(AD.db, year);
    var groups = AD.store.scheduleCGroups(AD.db, year);
    var bracket = Number(AD.db.settings.taxBracket || 0.22);

    var html = '<h1 class="page-title">Reports</h1><p class="page-sub">CPA-ready summaries for ' + AD.esc(year) + ".</p>";

    // CPA / Schedule C card (this is what prints).
    html += '<div class="card" id="cpaCard"><h3>📋 Schedule C summary — ' + AD.esc(year) + "</h3>";
    if (!groups.length) {
      html += '<div class="empty"><span class="big-ico">📊</span>Nothing to report yet.<br>Log expenses and drives and they\'ll appear here.</div>';
    } else {
      html += groups.map(function (g) {
        return '<div class="cpa-line"><div class="t">' + AD.esc(g.label) + "<small>Schedule C " + AD.esc(g.scheduleC) + "</small></div>" +
          '<div class="a">' + AD.money(g.amount) + "</div></div>";
      }).join("");
      html += '<div class="total-line"><span>Total deductions</span><span>' + AD.money(t.deductions) + "</span></div>";
      html += '<div class="total-line" style="color:var(--green);"><span>Est. tax savings (' + Math.round(bracket * 100) + "%)</span><span>" + AD.money(t.taxSavings) + "</span></div>";
      html += '<p class="hint">Meals are capped at 50% per IRS rules. Mileage uses the IRS rate in effect on each drive\'s date (72.5¢ Jan–Jun 2026, 76¢ Jul–Dec 2026).</p>';
    }
    html += "</div>";

    // Per-deal breakdown.
    var deals = AD.db.deals.filter(function (d) { return d.status !== "archived"; });
    if (deals.length) {
      html += '<div class="card"><h3>🏘️ By property</h3>';
      deals.forEach(function (d) {
        var dt = AD.store.dealTotals(AD.db, d.id, year);
        if (dt.count === 0) return;
        html += '<div class="cpa-line"><div class="t">' + AD.esc(d.address) + "<small>" + dt.count + " items · " + AD.fmtMiles(dt.miles) + " mi</small></div>" +
          '<div class="a">' + AD.money(dt.deductions) + "</div></div>";
      });
      html += "</div>";
    }

    // Audit armor.
    var pct = t.count ? Math.round((t.receipts / t.count) * 100) : 100;
    html += '<div class="card"><h3>🛡️ Audit armor</h3>' +
      '<p class="hint">' + pct + "% of this year's deductions have a receipt attached. " +
      (pct < 100 ? "Every receipt is proof if the IRS ever asks." : "Every deduction is backed by a receipt. Nicely done.") + "</p></div>";

    // Exports.
    html += '<div class="card no-print"><h3>⬇️ Exports & backup</h3>' +
      '<button class="btn-ghost" id="printCpaBtn" type="button">🖨️ Print CPA report (PDF)</button>' +
      '<button class="btn-ghost" id="csvBtn" type="button">📄 Export CSV</button>' +
      '<button class="btn-ghost" id="backupBtn" type="button">💾 Download backup</button>' +
      '<button class="btn-ghost" id="importBtn" type="button">📥 Import backup</button>' +
      '<input type="file" id="importFile" accept="application/json" class="hidden-file" />' +
      '<p class="hint">Your data lives on this device. Download a backup before switching phones.</p></div>';

    el.innerHTML = html;

    document.getElementById("printCpaBtn").addEventListener("click", function () {
      AD.track("report_printed");
      window.print();
    });
    document.getElementById("csvBtn").addEventListener("click", exportCsv);
    document.getElementById("backupBtn").addEventListener("click", downloadBackup);
    document.getElementById("importBtn").addEventListener("click", function () { document.getElementById("importFile").click(); });
    document.getElementById("importFile").addEventListener("change", importBackup);
  }

  function csvCell(v) {
    v = String(v == null ? "" : v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  function exportCsv() {
    var year = AD.year;
    var rows = [["Date", "Type", "Category", "Vendor/Purpose", "Amount", "Deductible", "Property", "Receipt?"]];
    AD.db.expenses.forEach(function (e) {
      if (String(e.date || "").slice(0, 4) !== year) return;
      var cat = AD.store.CATEGORIES[e.categoryId] || {};
      rows.push([e.date, "Expense", cat.label || e.categoryId, e.vendor || e.purpose || "", Number(e.amount || 0).toFixed(2),
        AD.store.expenseDeductible(e).toFixed(2), AD.dealLabel(e.dealId), e.receipt && e.receipt.data ? "yes" : "no"]);
    });
    AD.db.drives.forEach(function (d) {
      if (String(d.date || "").slice(0, 4) !== year) return;
      rows.push([d.date, "Drive", "Mileage", d.purpose || "", Number(d.miles || 0).toFixed(1) + " mi",
        AD.store.driveDeductible(d).toFixed(2), AD.dealLabel(d.dealId), "n/a"]);
    });
    var csv = rows.map(function (r) { return r.map(csvCell).join(","); }).join("\n");
    download("agentdeduct-" + year + ".csv", csv, "text/csv");
    AD.track("csv_exported");
    AD.toast("CSV downloaded 📄");
  }

  function downloadBackup() {
    download("agentdeduct-backup-" + AD.store.todayStr() + ".json", JSON.stringify(AD.db), "application/json");
    AD.track("data_downloaded");
    AD.toast("Backup downloaded 💾");
  }

  function importBackup(ev) {
    var file = ev.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!data || data.version !== 2 || !Array.isArray(data.expenses)) throw new Error("bad file");
        if (!confirm("Replace everything with this backup? This can't be undone.")) return;
        AD.db = data;
        AD.persist();
        AD.refreshYearSelect();
        AD.toast("Backup restored 📥");
        AD.showTab("home");
      } catch (e) {
        AD.toast("That file doesn't look like an AgentDeduct backup");
      }
      ev.target.value = "";
    };
    reader.readAsText(file);
  }

  function download(name, content, type) {
    var blob = new Blob([content], { type: type });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  AD.views.reports = render;
})();
