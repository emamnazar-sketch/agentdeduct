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
    var m = text.match(/(?:\bat|\bfrom)\s+([a-z0-9&'’.\- ]+?)(?:,|$|\s+\$\d)/i);
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

  /* ---------- number-word normalization ----------
     The speech recognizer often returns "seventy five dollars and fifty
     cents" instead of "$75.50" — and the parser only understands digits.
     normalizeNumbers() converts spoken numbers to digits BEFORE parsing,
     so mic transcripts, typed text, and Fix corrections all benefit.
     Idempotent: text that already has digits passes through unchanged. */

  var NUM_WORDS = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
    seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
    thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
    eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40,
    fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90
  };
  var TENS_WORDS = {
    twenty: 20, thirty: 30, forty: 40, fifty: 50,
    sixty: 60, seventy: 70, eighty: 80, ninety: 90
  };
  var WORD_LIST = Object.keys(NUM_WORDS).concat(["hundred", "thousand", "million", "point", "and"]);
  var NW1 = "(?:" + WORD_LIST.join("|") + ")";
  var NWP = NW1 + "(?:[\\s-]+" + NW1 + ")*";

  // "one hundred twenty three" -> 123 ; "seventy five point five" -> 75.5
  // Returns null when any token is not a number word.
  function wordsToValue(phrase) {
    var tokens = String(phrase || "").toLowerCase().replace(/-/g, " ").split(/\s+/).filter(Boolean);
    var total = 0, cur = 0, seen = false, decimal = "", inDec = false;
    for (var i = 0; i < tokens.length; i++) {
      var w = tokens[i];
      if (w === "and") continue;
      if (inDec) {
        var d = NUM_WORDS[w];
        if (d == null || d > 9) return null;
        decimal += d; seen = true; continue;
      }
      if (w === "point") { inDec = true; continue; }
      if (w === "hundred") { cur = (cur || 1) * 100; seen = true; continue; }
      if (w === "thousand") { total += (cur || 1) * 1000; cur = 0; seen = true; continue; }
      if (w === "million") { total += (cur || 1) * 1000000; cur = 0; seen = true; continue; }
      var v = NUM_WORDS[w];
      if (v == null) return null;
      cur += v; seen = true;
    }
    if (!seen) return null;
    var n = total + cur;
    if (decimal) n += Number("0." + decimal);
    return Math.round(n * 100) / 100;
  }

  function fmtMoney(n) {
    n = Math.round(n * 100) / 100;
    return "$" + (Math.round(n) === n ? String(Math.round(n)) : n.toFixed(2));
  }

  // Whole phrase is just number words -> money ("seventy five fifty" -> "$75.50").
  // Returns null when the phrase is not purely number words.
  function barePhraseToMoney(phrase) {
    var bare = String(phrase || "").trim();
    if (!new RegExp("^" + NWP + "$", "i").test(bare)) return null;
    var split = bare.match(/^(.*?)\s+(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)$/i);
    if (split && !/hundred|thousand|million/i.test(split[1])) {
      var dd = wordsToValue(split[1]);
      var cc = TENS_WORDS[split[2].toLowerCase()];
      if (dd != null && cc != null) return fmtMoney(dd + cc / 100);
    }
    var bv = wordsToValue(bare);
    return bv != null ? fmtMoney(bv) : null;
  }

  function normalizeNumbers(text) {
    var t = String(text || "");
    if (!/[a-z]/i.test(t)) return t;
    t = t.replace(/\ba (hundred|thousand|million)\b/gi, "one $1");
    var m, re;

    // "<words> dollars [and <words> cents]" -> "$75.50"
    re = new RegExp("\\b(" + NWP + ")\\s+dollars?(?:\\s+and\\s+(" + NWP + ")\\s+cents?)?", "gi");
    t = t.replace(re, function (full, dols, cents) {
      var d = wordsToValue(dols);
      if (d == null) return full;
      var c = 0;
      if (cents) {
        var cv = wordsToValue(cents);
        if (cv == null || cv >= 100) return full;
        c = Math.round(cv);
      }
      return fmtMoney(d + c / 100);
    });

    // "$75 fifty" -> "$75.50" (spoken cents after a digit amount)
    re = new RegExp("\\$(\\d{1,6})\\s+(" + NWP + ")\\b", "gi");
    t = t.replace(re, function (full, digs, words) {
      var c = wordsToValue(words);
      if (c == null || c >= 100 || Math.round(c) !== c) return full;
      return "$" + digs + "." + (c < 10 ? "0" + c : String(c));
    });

    // "<words> bucks" -> "$75"
    re = new RegExp("\\b(" + NWP + ")\\s+bucks?\\b", "gi");
    t = t.replace(re, function (full, words) {
      var v = wordsToValue(words);
      return v == null ? full : fmtMoney(v);
    });

    // "<words> miles" -> "22 miles"
    re = new RegExp("\\b(" + NWP + ")\\s+miles?\\b", "gi");
    t = t.replace(re, function (full, words) {
      var v = wordsToValue(words);
      if (v == null) return full;
      return (Math.round(v * 10) / 10) + " miles";
    });

    // Bare "<words> cents" -> "$0.50" (runs after the dollars rule above,
    // so "fifty dollars and fifty cents" is already consumed).
    re = new RegExp("\\b(" + NWP + ")\\s+cents?\\b", "gi");
    t = t.replace(re, function (full, words) {
      var v = wordsToValue(words);
      if (v == null || v >= 100) return full;
      var c = Math.round(v);
      return "$0." + (c < 10 ? "0" + c : String(c));
    });

    // "make it <number words>" (Fix corrections): "make it seventy five fifty"
    t = t.replace(/^(.*?\b(?:make it|change it to|set it to|change to)\s+)(.+)$/i, function (full, pre, rest) {
      var m = barePhraseToMoney(rest);
      return m == null ? full : pre + m;
    });

    // Whole message is just number words (common in Fix corrections):
    // "seventy five fifty" -> "$75.50", "twenty two" -> "$22"
    var bm = barePhraseToMoney(t);
    if (bm != null) return bm;
    return t;
  }

  function parse(text) {
    var t = normalizeNumbers(clean(text));
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

  window.ADTalkParse = { parse: parse, parseExpense: parseExpense, parseDrive: parseDrive, normalizeNumbers: normalizeNumbers, wordsToValue: wordsToValue };
})();
