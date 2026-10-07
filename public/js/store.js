/* AgentDeduct v2 — data layer.
   Privacy-first: everything lives in localStorage on the user's device.
   Migrates v1 expenses (agentDeduct.expenses.v1) into the v2 database. */
(function () {
  "use strict";

  var DB_KEY = "agentDeduct.db.v2";
  var V1_KEY = "agentDeduct.expenses.v1";

  /* IRS standard mileage rates (business), by date. The IRS raised the 2026
     rate mid-year: 72.5c Jan 1–Jun 30, 76c Jul 1–Dec 31 (Announcement 2026-11). */
  var RATE_TABLE = [
    { from: "2026-07-01", rate: 0.76 },
    { from: "2026-01-01", rate: 0.725 },
    { from: "2025-01-01", rate: 0.7 },
    { from: "2024-01-01", rate: 0.67 },
    { from: "2023-01-01", rate: 0.655 },
    { from: "0000-01-01", rate: 0.625 },
  ];

  function rateForDate(dateStr, overrideRate) {
    if (overrideRate && overrideRate > 0) return Number(overrideRate);
    var d = String(dateStr || "").slice(0, 10);
    for (var i = 0; i < RATE_TABLE.length; i++) {
      if (d >= RATE_TABLE[i].from) return RATE_TABLE[i].rate;
    }
    return 0.76;
  }

  /* Agent-specific categories. `line`/`scheduleC` power the CPA export.
     `rate` is the deductible fraction (meals = 50%). */
  var CATEGORIES = {
    mileage:        { label: "Mileage",              icon: "🚗", line: "Car and truck expenses",      scheduleC: "Line 44", kind: "mileage", rate: 1 },
    desk_fees:      { label: "Desk & brokerage fees",icon: "🏢", line: "Commissions and fees",        scheduleC: "Line 10", rate: 1 },
    mls_dues:       { label: "MLS & association dues",icon: "🤝", line: "Other expenses",              scheduleC: "Line 27a", rate: 1 },
    eo_insurance:   { label: "E&O insurance",        icon: "🛡️", line: "Insurance (other)",           scheduleC: "Line 15", rate: 1 },
    marketing:      { label: "Marketing & ads",      icon: "📣", line: "Advertising",                 scheduleC: "Line 8", rate: 1 },
    photo_staging:  { label: "Photos & staging",     icon: "📸", line: "Advertising",                 scheduleC: "Line 8", rate: 1 },
    signage:        { label: "Signage",              icon: "🪧", line: "Advertising",                 scheduleC: "Line 8", rate: 1 },
    client_gifts:   { label: "Client gifts",         icon: "🎁", line: "Other expenses",              scheduleC: "Line 27a", rate: 1, gift: true },
    phone_internet: { label: "Phone & internet",     icon: "📱", line: "Utilities",                   scheduleC: "Line 25", rate: 1 },
    home_office:    { label: "Home office",          icon: "🏠", line: "Office expense (Form 8829)",  scheduleC: "Line 30", rate: 1 },
    license_edu:    { label: "License & education",  icon: "🎓", line: "Other expenses",              scheduleC: "Line 27a", rate: 1 },
    office_tech:    { label: "Office & tech",        icon: "💻", line: "Office expense",              scheduleC: "Line 18", rate: 1 },
    meals:          { label: "Business meals",        icon: "🍽️", line: "Meals (50% limit)",           scheduleC: "Line 24b", rate: 0.5 },
    vehicle_actual: { label: "Vehicle (actual costs)",icon: "⛽", line: "Car and truck expenses",      scheduleC: "Line 44", rate: 1 },
    prof_services:  { label: "CPA / legal / pros",   icon: "⚖️", line: "Legal & professional",        scheduleC: "Line 17", rate: 1 },
    other:          { label: "Other",                icon: "📦", line: "Other expenses",              scheduleC: "Line 27a", rate: 1 },
  };
  var CATEGORY_ORDER = ["mileage", "desk_fees", "mls_dues", "marketing", "photo_staging", "signage", "client_gifts", "phone_internet", "home_office", "license_edu", "eo_insurance", "office_tech", "meals", "vehicle_actual", "prof_services", "other"];

  /* v1 category keys -> v2 */
  var V1_CATEGORY_MAP = {
    desk_fees: "desk_fees",
    mileage: "mileage",
    vehicle_actual: "vehicle_actual",
    office_tech: "office_tech",
    meals: "meals",
    license_education: "license_edu",
    advertising: "marketing",
    website: "marketing",
    insurance: "eo_insurance",
    internet_cell: "phone_internet",
    other: "other",
  };

  function blankDb() {
    return {
      version: 2,
      settings: {
        taxBracket: 0.22,
        darkMode: "auto",
        mileageRateOverride: 0, // 0 = automatic IRS rate by date
        agentName: "",
      },
      expenses: [],
      drives: [],
      deals: [],
    };
  }

  function uid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function migrateV1(db) {
    var raw = null;
    try { raw = localStorage.getItem(V1_KEY); } catch (e) { raw = null; }
    if (!raw) return db;
    var list = [];
    try { list = JSON.parse(raw) || []; } catch (e) { list = []; }
    list.forEach(function (e) {
      var cat = V1_CATEGORY_MAP[e.categoryId] || "other";
      if (cat === "mileage") {
        db.drives.push({
          id: e.id || uid(),
          date: e.date || todayStr(),
          miles: Number(e.miles || 0),
          rate: Number(e.mileageRate || 0) || rateForDate(e.date),
          purpose: e.purpose || e.vendor || "Business driving",
          dealId: null,
          origin: "",
          destination: "",
          gps: false,
          createdAt: e.createdAt || new Date().toISOString(),
        });
      } else {
        db.expenses.push({
          id: e.id || uid(),
          date: e.date || todayStr(),
          amount: Number(e.amount || 0),
          categoryId: cat,
          vendor: e.vendor || "",
          purpose: e.purpose || "",
          businessUsePct: Math.round(Number(e.businessUse != null ? e.businessUse : 1) * 100),
          dealId: null,
          giftFor: "",
          receipt: e.receipt || null,
          createdAt: e.createdAt || new Date().toISOString(),
        });
      }
    });
    try { localStorage.removeItem(V1_KEY); } catch (e) {}
    return db;
  }

  function load() {
    var db = blankDb();
    try {
      var raw = localStorage.getItem(DB_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.version === 2) {
          db.settings = Object.assign(db.settings, parsed.settings || {});
          db.expenses = Array.isArray(parsed.expenses) ? parsed.expenses : [];
          db.drives = Array.isArray(parsed.drives) ? parsed.drives : [];
          db.deals = Array.isArray(parsed.deals) ? parsed.deals : [];
          return db;
        }
      }
    } catch (e) {}
    return migrateV1(db);
  }

  function save(db) {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch (e) {
      // Quota exceeded (usually giant receipt photos). Persist without receipt images as a fallback.
      try {
        var slim = JSON.parse(JSON.stringify(db));
        slim.expenses.forEach(function (x) { if (x.receipt) x.receipt = { name: x.receipt.name || "receipt", type: x.receipt.type || "", data: "" }; });
        localStorage.setItem(DB_KEY, JSON.stringify(slim));
        db._quotaWarning = true;
      } catch (e2) {}
    }
  }

  /* ---- math ---- */

  function expenseDeductible(exp) {
    var cat = CATEGORIES[exp.categoryId] || CATEGORIES.other;
    var pct = Math.min(100, Math.max(0, Number(exp.businessUsePct == null ? 100 : exp.businessUsePct))) / 100;
    return Number(exp.amount || 0) * pct * (cat.rate != null ? cat.rate : 1);
  }

  function driveDeductible(drive) {
    return Number(drive.miles || 0) * (Number(drive.rate) || rateForDate(drive.date));
  }

  function inYear(item, year) {
    return String(item.date || "").slice(0, 4) === String(year);
  }

  function inMonth(item, year, month) {
    var mm = String(month).padStart(2, "0");
    return String(item.date || "").slice(0, 7) === String(year) + "-" + mm;
  }

  function yearTotals(db, year) {
    var t = { expenses: 0, deductibleExpenses: 0, miles: 0, mileageDeduction: 0, receipts: 0, count: 0 };
    db.expenses.forEach(function (e) {
      if (!inYear(e, year)) return;
      t.expenses += Number(e.amount || 0);
      t.deductibleExpenses += expenseDeductible(e);
      t.count++;
      if (e.receipt && e.receipt.data) t.receipts++;
    });
    db.drives.forEach(function (d) {
      if (!inYear(d, year)) return;
      t.miles += Number(d.miles || 0);
      t.mileageDeduction += driveDeductible(d);
    });
    t.deductions = t.deductibleExpenses + t.mileageDeduction;
    t.taxSavings = t.deductions * Number(db.settings.taxBracket || 0);
    return t;
  }

  function monthTotals(db, year, month) {
    var t = { expenses: 0, deductibleExpenses: 0, miles: 0, mileageDeduction: 0, receipts: 0, count: 0 };
    db.expenses.forEach(function (e) {
      if (!inMonth(e, year, month)) return;
      t.expenses += Number(e.amount || 0);
      t.deductibleExpenses += expenseDeductible(e);
      t.count++;
      if (e.receipt && e.receipt.data) t.receipts++;
    });
    db.drives.forEach(function (d) {
      if (!inMonth(d, year, month)) return;
      t.miles += Number(d.miles || 0);
      t.mileageDeduction += driveDeductible(d);
    });
    t.deductions = t.deductibleExpenses + t.mileageDeduction;
    t.taxSavings = t.deductions * Number(db.settings.taxBracket || 0);
    return t;
  }

  function dealTotals(db, dealId, year) {
    var t = { expenses: 0, deductions: 0, miles: 0, mileageDeduction: 0, count: 0 };
    db.expenses.forEach(function (e) {
      if (e.dealId !== dealId) return;
      if (year && !inYear(e, year)) return;
      t.expenses += Number(e.amount || 0);
      t.deductions += expenseDeductible(e);
      t.count++;
    });
    db.drives.forEach(function (d) {
      if (d.dealId !== dealId) return;
      if (year && !inYear(d, year)) return;
      t.miles += Number(d.miles || 0);
      var dd = driveDeductible(d);
      t.mileageDeduction += dd;
      t.deductions += dd;
      t.count++;
    });
    return t;
  }

  /* ---- schedule C grouping for the CPA export ---- */
  function scheduleCGroups(db, year) {
    var groups = {};
    function add(key, label, scheduleC, amount) {
      if (!groups[key]) groups[key] = { key: key, label: label, scheduleC: scheduleC, amount: 0 };
      groups[key].amount += amount;
    }
    db.expenses.forEach(function (e) {
      if (!inYear(e, year)) return;
      var cat = CATEGORIES[e.categoryId] || CATEGORIES.other;
      add(cat.scheduleC + " " + cat.line, cat.line, cat.scheduleC, expenseDeductible(e));
    });
    db.drives.forEach(function (d) {
      if (!inYear(d, year)) return;
      add("Line 44 Car and truck expenses", "Car and truck expenses", "Line 44", driveDeductible(d));
    });
    return Object.keys(groups).map(function (k) { return groups[k]; })
      .filter(function (g) { return g.amount > 0.005; })
      .sort(function (a, b) { return b.amount - a.amount; });
  }

  /* ---- nudges ---- */

  // Next quarterly estimated-tax due date (US federal, 2nd half 2026+).
  function nextQuarterlyDue() {
    var dues = ["2026-09-15", "2027-01-15", "2027-04-15", "2027-06-15", "2027-09-15", "2028-01-15"];
    var t = todayStr();
    for (var i = 0; i < dues.length; i++) {
      if (dues[i] >= t) return dues[i];
    }
    return null;
  }

  // Simple recurring-bill detector: same vendor+category+amount seen ~25-40 days ago, none since.
  function recurringSuggestions(db) {
    var out = [];
    var t = todayStr();
    var seen = {};
    db.expenses.forEach(function (e) {
      if (!e.vendor || !e.amount) return;
      var key = (e.vendor + "|" + e.categoryId + "|" + Number(e.amount).toFixed(2)).toLowerCase();
      (seen[key] = seen[key] || []).push(e);
    });
    Object.keys(seen).forEach(function (key) {
      var list = seen[key].sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      if (list.length < 2) return;
      var last = list[list.length - 1];
      var prev = list[list.length - 2];
      var dLast = new Date(last.date + "T00:00:00");
      var dPrev = new Date(prev.date + "T00:00:00");
      var gap = Math.round((dLast - dPrev) / 86400000);
      var sinceLast = Math.round((new Date(t + "T00:00:00") - dLast) / 86400000);
      if (gap >= 25 && gap <= 40 && sinceLast >= 25 && sinceLast <= 45) {
        var alreadyThisMonth = db.expenses.some(function (e) {
          return (e.vendor + "|" + e.categoryId + "|" + Number(e.amount).toFixed(2)).toLowerCase() === key &&
            e.date.slice(0, 7) === t.slice(0, 7);
        });
        if (!alreadyThisMonth) {
          out.push({ vendor: last.vendor, categoryId: last.categoryId, amount: Number(last.amount), businessUsePct: last.businessUsePct });
        }
      }
    });
    return out.slice(0, 3);
  }

  window.AD = window.AD || {};
  window.AD.store = {
    CATEGORIES: CATEGORIES,
    CATEGORY_ORDER: CATEGORY_ORDER,
    load: load,
    save: save,
    uid: uid,
    todayStr: todayStr,
    rateForDate: rateForDate,
    expenseDeductible: expenseDeductible,
    driveDeductible: driveDeductible,
    yearTotals: yearTotals,
    monthTotals: monthTotals,
    dealTotals: dealTotals,
    scheduleCGroups: scheduleCGroups,
    nextQuarterlyDue: nextQuarterlyDue,
    recurringSuggestions: recurringSuggestions,
  };
})();
