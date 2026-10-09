/* AgentDeduct v2 — Talk: conversational expense/drive logging.
   Floating button opens a chat sheet. Messages go to /api/talk (Workers AI,
   free tier) first; when offline or the AI is unavailable, the on-device
   phrase parser (js/talk-parse.js) handles it. Nothing is ever saved without
   the agent tapping Save on the confirm card. */
(function () {
  "use strict";

  var sheet, msgs, input, fileInput, statusEl, greeted = false;
  var pending = null; // parsed object awaiting confirmation

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function money(n) {
    return "$" + (Math.round(n * 100) / 100).toFixed(2);
  }

  function catLabel(id) {
    var c = (AD.store.CATEGORIES || {})[id];
    return c ? c.icon + " " + c.label : id;
  }

  /* ---------- UI construction ---------- */

  function build() {
    var fab = document.createElement("button");
    fab.id = "talkFab";
    fab.className = "talk-fab";
    fab.type = "button";
    fab.setAttribute("aria-label", "Talk to AgentDeduct");
    fab.innerHTML = "💬";
    fab.addEventListener("click", open);
    document.body.appendChild(fab);

    sheet = document.createElement("div");
    sheet.id = "talkSheet";
    sheet.className = "sheet talk-sheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    sheet.setAttribute("aria-label", "Talk to AgentDeduct");
    sheet.innerHTML =
      '<div class="grabber"></div>' +
      '<h2>💬 Talk to AgentDeduct</h2>' +
      '<button class="btn-inline ghost" id="talkClose" type="button" style="position:absolute;top:14px;right:16px;">Close</button>' +
      '<p class="hint" style="margin:0 0 10px;">Just say what you spent or drove — I\'ll log it.</p>' +
      '<div class="talk-msgs" id="talkMsgs"></div>' +
      '<div class="talk-input-row">' +
      '<button class="talk-icon-btn" id="talkAttach" type="button" aria-label="Attach receipt photo">📎</button>' +
      '<input id="talkInput" type="text" placeholder=\'Spent $45 on lunch…\' autocomplete="off" />' +
      '<button class="talk-icon-btn" id="talkMic" type="button" aria-label="Dictate" style="display:none;">🎤</button>' +
      '<button class="talk-send" id="talkSend" type="button" aria-label="Send">➤</button>' +
      "</div>" +
      '<input type="file" id="talkFile" accept="image/*" style="display:none;" />' +
      '<p class="ocr-status" id="talkOcrStatus"></p>';
    document.body.appendChild(sheet);

    msgs = sheet.querySelector("#talkMsgs");
    input = sheet.querySelector("#talkInput");
    fileInput = sheet.querySelector("#talkFile");
    statusEl = sheet.querySelector("#talkOcrStatus");

    sheet.querySelector("#talkClose").addEventListener("click", close);
    sheet.querySelector("#talkSend").addEventListener("click", function () { sendInput(); });
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") sendInput(); });
    sheet.querySelector("#talkAttach").addEventListener("click", function () { fileInput.click(); });
    fileInput.addEventListener("change", onReceipt);
    document.getElementById("scrim").addEventListener("click", close);

    // Mic: only where the browser supports speech recognition.
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      var mic = sheet.querySelector("#talkMic");
      mic.style.display = "";
      mic.addEventListener("click", function () {
        try {
          var rec = new SR();
          rec.lang = "en-US";
          rec.interimResults = false;
          rec.maxAlternatives = 5;
          mic.textContent = "🔴";
          rec.onresult = function (ev) {
            var res = ev.results[0];
            var t = res[0].transcript, best = t;
            // The recognizer often returns number-words in its top guess but
            // digits in a lower alternative — for a money app, digits win.
            if (!/\d/.test(t)) {
              for (var i = 1; i < res.length; i++) {
                if (res[i] && /\d/.test(res[i].transcript)) { best = res[i].transcript; break; }
              }
            }
            input.value = ADTalkParse.normalizeNumbers(best);
            mic.textContent = "🎤";
            input.focus();
          };
          rec.onend = function () { mic.textContent = "🎤"; };
          rec.onerror = function () { mic.textContent = "🎤"; };
          rec.start();
        } catch (e) { /* mic unavailable */ }
      });
    }
  }

  function open() {
    document.getElementById("scrim").classList.add("open");
    sheet.classList.add("open");
    if (!greeted) {
      greeted = true;
      botSay("👋 Hi! Tell me what you spent or drove and I'll log it — for example:<br>“Spent $45 on lunch with a client”<br>“Drove 22 miles to Maple St”<br>You can also 📎 a receipt photo.");
    }
    setTimeout(function () { input.focus(); }, 350);
  }

  function close() {
    document.getElementById("scrim").classList.remove("open");
    sheet.classList.remove("open");
  }

  /* ---------- messages ---------- */

  function scrollDown() { msgs.scrollTop = msgs.scrollHeight; }

  function bubble(html, cls) {
    var d = document.createElement("div");
    d.className = "tmsg " + cls;
    d.innerHTML = html;
    msgs.appendChild(d);
    scrollDown();
    return d;
  }

  function userSay(text) { bubble(esc(text), "user"); }
  function botSay(html) { bubble(html, "bot"); }

  function typing(on) {
    var t = document.getElementById("talkTyping");
    if (on && !t) {
      t = document.createElement("div");
      t.id = "talkTyping";
      t.className = "tmsg bot ttyping";
      t.textContent = "…";
      msgs.appendChild(t);
      scrollDown();
    } else if (!on && t) {
      t.remove();
    }
  }

  /* ---------- parsing ---------- */

  function aiParse(text) {
    return fetch("/api/talk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: text }),
    })
      .then(function (r) { return r.json(); })
      .then(function (j) { return j && j.ok && j.parsed ? j.parsed : null; })
      .catch(function () { return null; });
  }

  function sendInput() {
    var text = input.value.trim();
    if (!text) return;
    input.value = "";
    send(text);
  }

  function send(text) {
    // Normalize number-words to digits first, so the AI and the local
    // parser both see "75.50" instead of "seventy five fifty" — and the
    // user sees exactly what was understood.
    text = ADTalkParse.normalizeNumbers(text);
    userSay(text);
    // Correction flow: merge into the pending confirm.
    if (pending && pending.awaitingFix) {
      applyFix(text);
      return;
    }
    typing(true);
    var p = (navigator.onLine !== false)
      ? aiParse(text).then(function (r) { return r || ADTalkParse.parse(text); })
      : Promise.resolve(ADTalkParse.parse(text));
    p.then(function (parsed) {
      typing(false);
      handleParsed(parsed);
    });
  }

  function handleParsed(parsed) {
    if (!parsed || parsed.type === "unknown") {
      botSay("I didn't quite catch that. Try something like:<br>“Spent $45 on lunch”<br>“Drove 20 miles to a showing”<br>Or 📎 a receipt photo and I'll read it.");
      return;
    }
    pending = { data: parsed, awaitingFix: false, receiptFile: null, receiptName: "" };
    showConfirm();
  }

  // Tap-to-edit: the amount/miles on the confirm card is a button that
  // swaps into an inline number field, so fixing a number never needs
  // another voice round-trip.
  function editBtn(which, label, ariaLabel) {
    return '<button type="button" class="tedit-num" data-edit="' + which +
      '" aria-label="' + ariaLabel + '">' + esc(label) + "</button>";
  }

  function editNumber(cardEl, which) {
    var p = pending && pending.data;
    if (!p) return;
    var btn = cardEl.querySelector('.tedit-num[data-edit="' + which + '"]');
    if (!btn) return;
    var cur = which === "miles" ? p.miles : p.amount;
    var inp = document.createElement("input");
    inp.type = "number";
    inp.step = which === "miles" ? "0.1" : "0.01";
    inp.min = "0";
    inp.value = cur;
    inp.className = "tedit-input";
    inp.setAttribute("aria-label", which === "miles" ? "Edit miles" : "Edit amount");
    inp.setAttribute("inputmode", "decimal");
    btn.replaceWith(inp);
    inp.focus();
    if (inp.select) inp.select();
    var done = false;
    function commit(save) {
      if (done) return; done = true;
      var v = Number(String(inp.value).replace(/[^0-9.]/g, ""));
      if (save && v > 0 && v <= 1000000) {
        if (which === "miles") p.miles = Math.round(v * 10) / 10;
        else p.amount = Math.round(v * 100) / 100;
      }
      showConfirm();
    }
    inp.addEventListener("keydown", function (e) {
      if (e.key === "Enter") commit(true);
      else if (e.key === "Escape") commit(false);
    });
    inp.addEventListener("blur", function () { commit(true); });
  }

  function describe(p) {
    if (p.type === "expense") {
      var lines = ["💰 <b>" + editBtn("amount", money(p.amount), "Edit amount") + "</b> · " + esc(catLabel(p.categoryId))];
      if (p.vendor) lines.push("🏪 " + esc(p.vendor));
      if (p.purpose) lines.push("📝 " + esc(p.purpose));
      if (p.categoryId === "client_gifts" && p.amount > 25) {
        lines.push("⚠️ <b>Over the $25/person/year IRS gift limit</b> — only $25 is deductible.");
      }
      return lines.join("<br>");
    }
    var dl = ["🚗 <b>" + editBtn("miles", p.miles + " miles", "Edit miles") + "</b>"];
    if (p.destination) dl.push("📍 " + esc(p.destination));
    if (p.purpose) dl.push("📝 " + esc(p.purpose));
    return dl.join("<br>");
  }

  function showConfirm() {
    var p = pending.data;
    var html = '<div class="tconfirm"><div class="tconfirm-title">I got this — look right?</div>' +
      '<div class="tconfirm-body">' + describe(p) +
      (pending.receiptName ? "<br>🧾 " + esc(pending.receiptName) : "") + "</div>" +
      '<div class="tconfirm-actions">' +
      '<button class="btn-primary tconfirm-save" type="button">✓ Save</button>' +
      '<button class="btn-ghost tconfirm-fix" type="button">✏️ Fix</button>' +
      "</div></div>";
    var el = bubble(html, "bot");
    el.querySelector(".tconfirm-save").addEventListener("click", savePending);
    el.querySelector(".tconfirm-fix").addEventListener("click", function () {
      pending.awaitingFix = true;
      botSay("What should change? For example: “make it $50” or “it's marketing”. You can also tap the amount above to edit it directly.");
    });
    var numBtn = el.querySelector(".tedit-num");
    if (numBtn) {
      numBtn.addEventListener("click", function () { editNumber(el, numBtn.getAttribute("data-edit")); });
    }
  }

  function applyFix(text) {
    var fix = ADTalkParse.parse(text); // parse() normalizes number-words
    var p = pending.data;
    var changed = false;
    if (fix.type === "expense" && p.type === "expense") {
      if (fix.amount > 0 && fix.amount !== p.amount) { p.amount = fix.amount; changed = true; }
      if (fix.vendor && fix.vendor !== p.vendor) { p.vendor = fix.vendor; changed = true; }
      if (fix.purpose && fix.purpose !== p.purpose) { p.purpose = fix.purpose; changed = true; }
      if (fix.categoryId && fix.categoryId !== "other" && fix.categoryId !== p.categoryId) { p.categoryId = fix.categoryId; changed = true; }
      if (fix.giftFor && fix.giftFor !== p.giftFor) { p.giftFor = fix.giftFor; changed = true; }
    } else if (fix.type === "drive" && p.type === "drive") {
      if (fix.miles > 0 && fix.miles !== p.miles) { p.miles = fix.miles; changed = true; }
      if (fix.destination && fix.destination !== p.destination) { p.destination = fix.destination; p.purpose = fix.purpose; changed = true; }
    } else {
      // Try category-only correction ("it's marketing", "make it a gift")
      var cat = fixCategoryOnly(text);
      if (cat && p.type === "expense" && cat !== p.categoryId) { p.categoryId = cat; changed = true; }
    }
    pending.awaitingFix = false;
    if (!changed) {
      botSay("I didn't catch that change — try “make it $50”, “it's marketing”, or tap the amount above to edit it directly.");
    }
    showConfirm();
  }

  function fixCategoryOnly(text) {
    var t = text.toLowerCase();
    var map = [
      [/market/i, "marketing"], [/meal|lunch|dinner/i, "meals"], [/gift/i, "client_gifts"],
      [/gas|fuel/i, "vehicle_actual"], [/office|suppl/i, "office_tech"], [/phone/i, "phone_internet"],
    ];
    for (var i = 0; i < map.length; i++) if (map[i][0].test(t)) return map[i][1];
    return "";
  }

  /* ---------- saving ---------- */

  function savePending() {
    var p = pending.data;
    pending.awaitingFix = false;
    if (p.type === "expense") saveExpense(p, pending.receiptFile);
    else saveDrive(p);
    pending = null;
  }

  function saveExpense(p, receiptFile) {
    var finish = function (receipt) {
      var cat = AD.store.CATEGORIES[p.categoryId] || AD.store.CATEGORIES.other;
      var exp = {
        id: AD.store.uid(),
        date: AD.store.todayStr(),
        amount: p.amount,
        categoryId: p.categoryId,
        vendor: p.vendor || "",
        purpose: p.purpose || "",
        businessUsePct: 100,
        dealId: null,
        giftFor: cat.gift ? (p.giftFor || "") : "",
        receipt: receipt || null,
        createdAt: new Date().toISOString(),
      };
      AD.db.expenses.unshift(exp);
      AD.persist();
      AD.track("expense_saved");
      var save = AD.store.expenseDeductible(exp) * Number(AD.db.settings.taxBracket || 0);
      botSay("Saved ✓ &nbsp;+" + AD.money0(save) + " in tax savings. Anything else?");
      AD.toast("Saved ✓");
    };
    if (receiptFile) {
      AD.ocr.readReceipt(receiptFile).then(function (r) { finish(r); }).catch(function () { finish(null); });
    } else finish(null);
  }

  function saveDrive(p) {
    var date = AD.store.todayStr();
    var drive = {
      id: AD.store.uid(),
      date: date,
      miles: p.miles,
      rate: AD.store.rateForDate(date, AD.db.settings.mileageRateOverride),
      purpose: p.purpose || "Business driving",
      dealId: null,
      origin: "",
      destination: p.destination || "",
      gps: false,
      createdAt: new Date().toISOString(),
    };
    AD.db.drives.unshift(drive);
    AD.persist();
    AD.track("expense_saved");
    botSay("Saved ✓ " + p.miles + " miles. Anything else?");
    AD.toast("Drive saved ✓");
  }

  /* ---------- receipt photo ---------- */

  function onReceipt(ev) {
    var file = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!file) return;
    userSay("🧾 " + esc(file.name));
    statusEl.textContent = "Reading receipt…";
    typing(true);
    AD.ocr.scanReceipt(file, statusEl).then(function (parsed) {
      typing(false);
      statusEl.textContent = "";
      if (!parsed || !(parsed.amount > 0)) {
        botSay("I couldn't read that receipt clearly. Try a sharper photo, or just tell me the amount — e.g. “$45 at Staples”.");
        return;
      }
      pending = {
        data: {
          type: "expense",
          amount: Math.round(Number(parsed.amount) * 100) / 100,
          vendor: parsed.vendor || "",
          categoryId: ADTalkParse.parse("office " + (parsed.vendor || "")).categoryId || "other",
          purpose: "Receipt",
          giftFor: "",
        },
        awaitingFix: false,
        receiptFile: file,
        receiptName: file.name,
      };
      // Smarter category guess from vendor text
      var catGuess = ADTalkParse.parse(parsed.vendor || "").categoryId;
      if (catGuess && catGuess !== "other") pending.data.categoryId = catGuess;
      showConfirm();
    }).catch(function () {
      typing(false);
      statusEl.textContent = "";
      botSay("I couldn't read that receipt. Try a sharper photo, or tell me the amount directly.");
    });
  }

  /* ---------- init ---------- */

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }

  window.ADTalk = { open: open, close: close, send: send };
})();
