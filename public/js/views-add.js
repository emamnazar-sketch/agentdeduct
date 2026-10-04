/* AgentDeduct v2 — quick-add bottom sheet: 10-second expense or drive logging. */
(function () {
  "use strict";

  var mode = "expense"; // expense | drive
  var category = "marketing";
  var allForWork = true;
  var receiptFile = null;
  var receiptInfo = null;

  function setMode(m) {
    mode = m;
    document.getElementById("segExpense").classList.toggle("active", m === "expense");
    document.getElementById("segDrive").classList.toggle("active", m === "drive");
    document.getElementById("paneExpense").style.display = m === "expense" ? "" : "none";
    document.getElementById("paneDrive").style.display = m === "drive" ? "" : "none";
    document.getElementById("sheetTitle").textContent = m === "expense" ? "Log expense" : "Log drive";
  }

  function renderCatGrid() {
    var grid = document.getElementById("catGrid");
    grid.innerHTML = AD.store.CATEGORY_ORDER.filter(function (k) { return k !== "mileage"; }).map(function (k) {
      var c = AD.store.CATEGORIES[k];
      return '<button type="button" class="cat-cell' + (k === category ? " active" : "") + '" data-cat="' + k + '">' +
        '<span class="ci">' + c.icon + "</span><span>" + AD.esc(c.label) + "</span></button>";
    }).join("");
    grid.querySelectorAll("[data-cat]").forEach(function (b) {
      b.addEventListener("click", function () {
        category = b.getAttribute("data-cat");
        renderCatGrid();
        updateGiftUi();
      });
    });
  }

  function updateGiftUi() {
    var isGift = (AD.store.CATEGORIES[category] || {}).gift;
    document.getElementById("giftWrap").style.display = isGift ? "" : "none";
    checkGiftWarning();
  }

  function checkGiftWarning() {
    var warn = document.getElementById("giftWarn");
    var amt = Number(document.getElementById("fAmount").value || 0);
    var isGift = (AD.store.CATEGORIES[category] || {}).gift;
    if (isGift && amt > 25) {
      warn.style.display = "";
      warn.innerHTML = "⚠️ <b>Heads up:</b> the IRS caps client gifts at <b>$25 per person per year</b>. Only $25 of this is deductible — the rest isn't.";
    } else {
      warn.style.display = "none";
    }
  }

  function updateWorkUi() {
    document.getElementById("choiceYes").classList.toggle("active", allForWork);
    document.getElementById("choicePartly").classList.toggle("active", !allForWork);
    document.getElementById("pctWrap").style.display = allForWork ? "none" : "";
  }

  function reset() {
    setMode("expense");
    category = "marketing";
    allForWork = true;
    receiptFile = null;
    receiptInfo = null;
    renderCatGrid();
    updateWorkUi();
    updateGiftUi();
    document.getElementById("fAmount").value = "";
    document.getElementById("fVendor").value = "";
    document.getElementById("fPurpose").value = "";
    document.getElementById("fDate").value = AD.store.todayStr();
    document.getElementById("fDeal").innerHTML = AD.dealOptions("", true);
    document.getElementById("fPct").value = 80;
    document.getElementById("fGiftFor").value = "";
    document.getElementById("receiptName").textContent = "No receipt attached";
    AD.ocr.setStatus(document.getElementById("ocrStatus"), "Snap the receipt — the scanner reads it on your phone.");
    // drive pane
    document.getElementById("dMiles").value = "";
    document.getElementById("dPurpose").value = "";
    document.getElementById("dDate").value = AD.store.todayStr();
    document.getElementById("dDeal").innerHTML = AD.dealOptions("", true);
    document.getElementById("dFrom").value = "";
    document.getElementById("dTo").value = "";
    var dRateHint = document.getElementById("driveRateHint");
    if (dRateHint) {
      var rNow = AD.store.rateForDate(AD.store.todayStr(), Number(AD.db.settings.mileageRateOverride || 0));
      dRateHint.textContent = "IRS rate for that date: " + Math.round(rNow * 1000) / 10 + "¢/mi";
    }
  }

  function fillVendorDatalist() {
    var vendors = {};
    AD.db.expenses.forEach(function (e) { if (e.vendor) vendors[e.vendor] = 1; });
    document.getElementById("vendorList").innerHTML = Object.keys(vendors).slice(0, 40).map(function (v) {
      return '<option value="' + AD.esc(v) + '">';
    }).join("");
  }

  function onReceiptChange(ev) {
    var file = ev.target.files[0];
    receiptFile = file || null;
    document.getElementById("receiptName").textContent = file ? "📎 " + file.name : "No receipt attached";
    if (file) {
      AD.track("receipt_attached");
      AD.ocr.scanReceipt(file, document.getElementById("ocrStatus")).then(function (parsed) {
        if (!parsed) return;
        if (parsed.vendor && !document.getElementById("fVendor").value) document.getElementById("fVendor").value = parsed.vendor;
        if (parsed.date && !document.getElementById("fDate").value) document.getElementById("fDate").value = parsed.date;
        if (parsed.amount && !document.getElementById("fAmount").value) document.getElementById("fAmount").value = parsed.amount;
      });
    }
  }

  function saveExpense() {
    var amount = Number(document.getElementById("fAmount").value || 0);
    if (!(amount > 0)) { AD.toast("Enter the amount first"); return; }
    var cat = AD.store.CATEGORIES[category] || AD.store.CATEGORIES.other;
    var pct = allForWork ? 100 : Math.min(100, Math.max(1, Number(document.getElementById("fPct").value || 80)));

    AD.ocr.readReceipt(receiptFile).then(function (receipt) {
      var exp = {
        id: AD.store.uid(),
        date: document.getElementById("fDate").value || AD.store.todayStr(),
        amount: amount,
        categoryId: category,
        vendor: document.getElementById("fVendor").value.trim(),
        purpose: document.getElementById("fPurpose").value.trim(),
        businessUsePct: pct,
        dealId: document.getElementById("fDeal").value || null,
        giftFor: cat.gift ? document.getElementById("fGiftFor").value.trim() : "",
        receipt: receipt,
        createdAt: new Date().toISOString(),
      };
      AD.db.expenses.unshift(exp);
      AD.persist();
      AD.track("expense_saved");
      var save = AD.store.expenseDeductible(exp) * Number(AD.db.settings.taxBracket || 0);
      AD.closeSheet();
      AD.toast("Saved ✓  +" + AD.money0(save) + " in tax savings");
      AD.showTab(AD.views._lastTab || "home");
    }).catch(function () {
      AD.toast("Couldn't read the receipt photo — try again");
    });
  }

  function saveDrive() {
    var miles = Number(document.getElementById("dMiles").value || 0);
    if (!(miles > 0)) { AD.toast("Enter the miles first"); return; }
    var date = document.getElementById("dDate").value || AD.store.todayStr();
    var drive = {
      id: AD.store.uid(),
      date: date,
      miles: Math.round(miles * 10) / 10,
      rate: AD.store.rateForDate(date, AD.db.settings.mileageRateOverride),
      purpose: document.getElementById("dPurpose").value.trim() || "Business driving",
      dealId: document.getElementById("dDeal").value || null,
      origin: document.getElementById("dFrom").value.trim(),
      destination: document.getElementById("dTo").value.trim(),
      gps: false,
      createdAt: new Date().toISOString(),
    };
    AD.db.drives.unshift(drive);
    AD.persist();
    AD.track("expense_saved");
    var save = AD.store.driveDeductible(drive) * Number(AD.db.settings.taxBracket || 0);
    AD.closeSheet();
    AD.toast("Drive saved ✓  +" + AD.money0(save) + " in tax savings");
    AD.showTab("drives");
  }

  function render() {
    AD.views._lastTab = AD.views._lastTab || "home";
    reset();
    fillVendorDatalist();
  }

  function init() {
    document.getElementById("segExpense").addEventListener("click", function () { setMode("expense"); });
    document.getElementById("segDrive").addEventListener("click", function () { setMode("drive"); });
    document.getElementById("choiceYes").addEventListener("click", function () { allForWork = true; updateWorkUi(); });
    document.getElementById("choicePartly").addEventListener("click", function () { allForWork = false; updateWorkUi(); });
    document.getElementById("fAmount").addEventListener("input", checkGiftWarning);
    document.getElementById("receiptInput").addEventListener("change", onReceiptChange);
    document.getElementById("receiptBtn").addEventListener("click", function () { document.getElementById("receiptInput").click(); });
    document.getElementById("saveExpenseBtn").addEventListener("click", saveExpense);
    document.getElementById("saveDriveBtn").addEventListener("click", saveDrive);
    // Track which tab opened the sheet so we can return.
    document.getElementById("fabAdd").addEventListener("click", function () {
      var active = document.querySelector(".tab.active");
      AD.views._lastTab = active ? active.dataset.tab : "home";
    });
  }

  AD.views.add = { render: render, init: init, setMode: setMode };
  document.addEventListener("DOMContentLoaded", init);
})();
