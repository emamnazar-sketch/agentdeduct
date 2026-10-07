/* AgentDeduct v2 — Talk: on-device phrase parser (instant, offline fallback).
   Parses plain-English expense/drive phrases into structured data.
   The cloud AI (/api/talk) is tried first when online; this is the fallback. */
(function () {
  "use strict";

  var CAT_KEYWORDS = [
    [/lunch|dinner|breakfast|brunch|coffee|meal|restaurant|starbucks|chipotle/i, "meals"],
    [/client gift|gift for|gift/i, "client_gifts"],
    [/gas\b|fuel|shell|chevron|costco gas/i, "vehicle_actual"],
    [/staples|office depot|office supply|supplies|paper|ink|toner/i, "office_tech"],
    [/facebook ad|google ad|zillow|realtor\.com|marketing|flyer|postcard|ad\b/i, "marketing"],
    [/photographer|photo shoot|staging|stager/i, "photo_staging"],
    [/sign\b|signage|banner/i, "signage"],
    [/phone|internet|verizon|at&t|tmobile|spectrum/i, "phone_internet"],
    [/mls|association dues|\bnar\b|realtor dues/i, "mls_dues"],
    [/e&o|insurance/i, "eo_insurance"],
    [/cpa|accountant|lawyer|attorney|legal/i, "prof_services"],
    [/course|class|license|ce credit|school|training|coaching/i, "license_edu"],
    [/desk fee|brokerage fee|broker fee/i, "desk_fees"],
    [/rent|home office/i, "home_office"],
  ];

  function clean(s) { return String(s || "").trim(); }

  function parseAmount(text) {
    var m = text.match(/\$\s*(\d{1,6}(?:\.\d{1,2})?)/);
    if (m) return Number(m[1]);
    m = text.match(/(\d{1,6}(?:\.\d{1,2})?)\s*(?:dollars|bucks)/i);
    if (m) return Number(m[1]);
    return 0;
  }

  function parseVendor(text) {
    var m = text.match(/(?:\bat|\bfrom)\s+([a-z0-9&'’.\- ]+?)(?:,|$)/i);
    if (m) {
      var v = clean(m[1]).replace(/\s+(for|with)\s+.*/i, "");
      if (v && !/^\d+$/.test(v)) return titleCase(v);
    }
    return "";
  }

  function titleCase(s) {
    return s.replace(/\w\S*/g, function (w) { return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); });
  }

  function categoryFor(text) {
    for (var i = 0; i < CAT_KEYWORDS.length; i++) {
      if (CAT_KEYWORDS[i][0].test(text)) return CAT_KEYWORDS[i][1];
    }
    return "other";
  }

  function isDrive(text) {
    return /\b(drove|driving|miles?|mileage|round trip|trip to)\b/i.test(text);
  }

  function parseDrive(text) {
    var m = text.match(/(\d+(?:\.\d+)?)\s*miles?\b/i);
    if (!m) return null;
    var miles = Number(m[1]);
    if (!(miles > 0) || miles > 2000) return null;
    var dest = "";
    var dm = text.match(/(?:\bto\b|\bfor\b)\s+([a-z0-9&'’.\- ]+?)(?:,|$)/i);
    if (dm) dest = titleCase(clean(dm[1]).replace(/\s+(showing|listing|appointment|meeting).*$/i, "").trim()) || clean(dm[1]);
    if (/^(showing|listing|appointment|meeting)s?$/i.test(dest)) dest = "";
    var purpose = dest ? "Drive to " + dest : "Business driving";
    if (/\bshowing\b/i.test(text)) purpose = dest ? "Showing at " + dest : "Property showing";
    else if (/\blisting\b/i.test(text)) purpose = dest ? "Listing at " + dest : "Listing appointment";
    return { type: "drive", miles: Math.round(miles * 10) / 10, destination: dest, purpose: purpose };
  }

  function parseExpense(text) {
    var amount = parseAmount(text);
    if (!(amount > 0)) return null;
    var categoryId = categoryFor(text);
    var vendor = parseVendor(text);
    var giftFor = "";
    if (categoryId === "client_gifts") {
      var gm = text.match(/\bfor\s+([a-z]+(?:\s+[a-z]+)?)/i);
      if (gm) giftFor = titleCase(clean(gm[1]));
    }
    var purpose = categoryId === "meals" ? "Business meal" : (vendor ? "Business expense" : "");
    if (categoryId === "client_gifts") purpose = giftFor ? "Client gift for " + giftFor : "Client gift";
    return {
      type: "expense",
      amount: Math.round(amount * 100) / 100,
      vendor: vendor,
      categoryId: categoryId,
      purpose: purpose,
      giftFor: giftFor,
    };
  }

  function parse(text) {
    var t = clean(text);
    if (!t) return { type: "unknown" };
    if (isDrive(t)) {
      var d = parseDrive(t);
      if (d) return d;
    }
    var e = parseExpense(t);
    if (e) return e;
    // Drive mentioned but no miles found, or expense without amount
    return { type: "unknown" };
  }

  window.ADTalkParse = { parse: parse, parseExpense: parseExpense, parseDrive: parseDrive };
})();
