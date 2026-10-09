/* AgentDeduct v2 — Deals view: properties with per-listing P&L. */
(function () {
  "use strict";

  var openDealId = null;

  function render() {
    var el = document.getElementById("view-deals");
    var deals = AD.db.deals.slice().sort(function (a, b) { return (a.createdAt < b.createdAt ? 1 : -1); });

    var html = '<h1 class="page-title">Deals</h1><p class="page-sub">Tag expenses and drives to a property — see what each listing really cost you.</p>';

    html += '<button class="btn-ghost" id="addDealBtn" type="button" style="margin:0 0 14px;">＋ Add a property</button>';

    if (!deals.length) {
      html += '<div class="card"><div class="empty"><span class="big-ico">🏘️</span>No properties yet.<br>Add your active listings, then tag expenses to them.</div></div>';
    }

    deals.forEach(function (d) {
      var t = AD.store.dealTotals(AD.db, d.id, AD.year);
      var isOpen = openDealId === d.id;
      html += '<div class="card"><button class="deal-card" data-deal="' + AD.esc(d.id) + '" type="button">' +
        '<span class="pill' + (d.status === "closed" ? " closed" : "") + '">' + (d.status === "closed" ? "Closed" : "Active") + "</span> " +
        '<span class="pill" style="background:var(--surface-2);color:var(--muted);">' + AD.esc(AD.year) + "</span>" +
        '<div class="deal-addr" style="margin-top:8px;">' + AD.esc(d.address) + "</div>" +
        (d.client ? '<div class="deal-client">' + AD.esc(d.client) + "</div>" : "") +
        '<div class="deal-nums">' +
        '<div class="dn"><div class="v">' + AD.money0(t.deductions) + '</div><div class="l">deductions</div></div>' +
        '<div class="dn"><div class="v">' + AD.fmtMiles(t.miles) + '</div><div class="l">miles</div></div>' +
        '<div class="dn"><div class="v">' + t.count + '</div><div class="l">items</div></div>' +
        "</div></button>";
      if (isOpen) html += dealDetailHtml(d);
      html += "</div>";
    });

    el.innerHTML = html;

    document.getElementById("addDealBtn").addEventListener("click", addDealForm);
    el.querySelectorAll("[data-deal]").forEach(function (b) {
      b.addEventListener("click", function () {
        openDealId = openDealId === b.getAttribute("data-deal") ? null : b.getAttribute("data-deal");
        render();
      });
    });
    el.querySelectorAll("[data-close-deal]").forEach(function (b) {
      b.addEventListener("click", function (ev) {
        ev.stopPropagation();
        toggleStatus(b.getAttribute("data-close-deal"));
      });
    });
    el.querySelectorAll("[data-del-deal]").forEach(function (b) {
      b.addEventListener("click", function (ev) {
        ev.stopPropagation();
        deleteDeal(b.getAttribute("data-del-deal"));
      });
    });
  }

  function dealDetailHtml(d) {
    var year = AD.year;
    var items = [];
    AD.db.expenses.forEach(function (e) {
      if (e.dealId !== d.id || String(e.date || "").slice(0, 4) !== year) return;
      var cat = AD.store.CATEGORIES[e.categoryId] || {};
      items.push({ ts: e.date + " " + (e.createdAt || ""), icon: cat.icon || "💰", title: e.vendor || cat.label || "Expense", sub: AD.fmtDate(e.date) + " · " + (cat.label || ""), amt: AD.store.expenseDeductible(e) });
    });
    AD.db.drives.forEach(function (dr) {
      if (dr.dealId !== d.id || String(dr.date || "").slice(0, 4) !== year) return;
      items.push({ ts: dr.date + " " + (dr.createdAt || ""), icon: "🚗", title: dr.purpose || "Business drive", sub: AD.fmtDate(dr.date) + " · " + AD.fmtMiles(dr.miles) + " mi", amt: AD.store.driveDeductible(dr) });
    });
    items.sort(function (a, b) { return a.ts < b.ts ? 1 : -1; });
    var t = AD.store.dealTotals(AD.db, d.id, year);

    var html = '<div style="margin-top:12px;border-top:1px solid var(--line);padding-top:10px;">';
    html += '<div class="total-line"><span>' + AD.esc(year) + ' cost of this listing</span><span>' + AD.money(t.deductions) + "</span></div>";
    html += '<p class="hint">≈ ' + AD.money0(t.deductions * Number(AD.db.settings.taxBracket || 0)) + " back in your pocket at your tax bracket.</p>";
    if (!items.length) {
      html += '<div class="empty">Nothing tagged to this property yet.<br>Tag expenses & drives when you log them.</div>';
    } else {
      html += items.slice(0, 30).map(function (it) {
        return '<div class="row-item"><div class="row-ico">' + it.icon + '</div><div class="row-main">' +
          '<div class="row-title">' + AD.esc(it.title) + '</div><div class="row-sub">' + AD.esc(it.sub) + "</div></div>" +
          '<div class="row-amt">' + AD.money(it.amt) + "</div></div>";
      }).join("");
    }
    html += '<div style="display:flex;gap:8px;margin-top:12px;">' +
      '<button class="btn-inline ghost" data-close-deal="' + AD.esc(d.id) + '" type="button">' +
      (d.status === "closed" ? "Reopen" : "Mark closed") + "</button>" +
      '<button class="btn-inline ghost" data-del-deal="' + AD.esc(d.id) + '" type="button" style="color:var(--red);border-color:var(--red);">Delete</button></div>';
    html += "</div>";
    return html;
  }

  function addDealForm() {
    var address = prompt("Property address (e.g. 123 Main St, Sacramento):");
    if (!address || !address.trim()) return;
    var client = prompt("Client name (optional):") || "";
    AD.db.deals.unshift({
      id: AD.store.uid(),
      address: address.trim(),
      client: client.trim(),
      status: "active",
      createdAt: new Date().toISOString(),
    });
    AD.persist();
    AD.toast("Property added 🏘️");
    render();
  }

  function toggleStatus(id) {
    var d = AD.db.deals.filter(function (x) { return x.id === id; })[0];
    if (!d) return;
    d.status = d.status === "closed" ? "active" : "closed";
    AD.persist();
    render();
  }

  function deleteDeal(id) {
    if (!confirm("Delete this property? Its expenses stay, but won't be tagged anymore.")) return;
    AD.db.deals = AD.db.deals.filter(function (x) { return x.id !== id; });
    AD.db.expenses.forEach(function (e) { if (e.dealId === id) e.dealId = null; });
    AD.db.drives.forEach(function (dr) { if (dr.dealId === id) dr.dealId = null; });
    if (openDealId === id) openDealId = null;
    AD.persist();
    render();
  }

  AD.views.deals = render;
})();
