/* AgentDeduct v2 — Settings view. */
(function () {
  "use strict";

  var BRACKETS = [
    { v: 0.10, label: "10% — up to $11,925" },
    { v: 0.12, label: "12% — up to $48,475" },
    { v: 0.22, label: "22% — up to $103,350" },
    { v: 0.24, label: "24% — up to $197,300" },
    { v: 0.32, label: "32% — up to $250,525" },
    { v: 0.35, label: "35% — up to $626,350" },
    { v: 0.37, label: "37% — over $626,350" },
  ];

  function accountCard() {
    var me = (AD.auth && AD.auth.me()) || { authEnabled: false, signedIn: false };
    var html = '<div class="card"><h3>👤 Account</h3>';
    if (!me.authEnabled) {
      html += '<p class="hint">Google sign-in isn\'t set up yet — the app works fully on this device until then.</p>';
    } else if (me.signedIn) {
      var u = me.user || {};
      html += '<div class="set-row"><div style="display:flex;align-items:center;gap:10px;">' +
        (u.picture ? '<img src="' + esc(u.picture) + '" alt="" style="width:36px;height:36px;border-radius:50%;">' : "") +
        '<div><div class="t">' + esc(u.name || u.email || "Signed in") + '</div>' +
        '<div class="s">' + esc(u.email || "") + "</div></div></div></div>";
      if (me.driveLinked) {
        var last = "";
        try { last = localStorage.getItem("agentDeduct.lastBackup.v1") || ""; } catch (e) {}
        html += '<div class="set-row"><div><div class="t">☁️ Google Drive linked</div>' +
          '<div class="s">' + (last ? "Last backup " + esc(last.slice(0, 10)) : "Backups run automatically") + "</div></div>" +
          '<button class="btn-ghost" id="backupNowBtn" type="button">Back up now</button></div>';
      } else {
        html += '<div class="set-row"><div><div class="t">☁️ Google Drive</div>' +
          '<div class="s">Not linked — back up data &amp; receipts</div></div>' +
          '<button class="btn-ghost" id="linkDriveBtn" type="button">Link Drive</button></div>';
      }
      html += '<button class="btn-ghost" id="signOutBtn" type="button" style="margin-top:8px;">Sign out</button>';
    } else {
      html += '<a class="btn-ghost" href="/api/auth/login" style="display:block;text-align:center;text-decoration:none;">Sign in with Google</a>';
    }
    return html + "</div>";
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function render() {
    var el = document.getElementById("view-settings");
    var s = AD.db.settings;

    var html = '<h1 class="page-title">Settings</h1><p class="page-sub">Tune the app to your tax situation.</p>';

    html += accountCard();

    html += '<div class="card"><h3>💰 Your tax bracket</h3>' +
      '<p class="hint">Your federal marginal bracket — it turns deductions into "money back in your pocket." Pick the closest; single-filer ranges shown.</p>' +
      '<div class="set-row"><div><div class="t">Marginal bracket</div></div>' +
      '<select id="setBracket">' + BRACKETS.map(function (b) {
        return '<option value="' + b.v + '"' + (Number(s.taxBracket) === b.v ? " selected" : "") + ">" + b.label + "</option>";
      }).join("") + "</select></div></div>";

    var autoRate = AD.store.rateForDate(AD.store.todayStr(), 0);
    html += '<div class="card"><h3>🚗 Mileage rate</h3>' +
      '<p class="hint">The IRS sets the standard rate. The app applies it automatically by drive date — 72.5¢/mi Jan–Jun 2026, <b>76¢/mi Jul–Dec 2026</b> (mid-year IRS increase). Override only if your CPA tells you to.</p>' +
      '<div class="set-row"><div><div class="t">Rate mode</div><div class="s">Currently: ' + Math.round(autoRate * 1000) / 10 + '¢/mi automatic</div></div>' +
      '<select id="setRateMode"><option value="auto"' + (!s.mileageRateOverride ? " selected" : "") + '>Automatic (IRS)</option>' +
      '<option value="manual"' + (s.mileageRateOverride ? " selected" : "") + ">Manual</option></select></div>" +
      '<div class="set-row" id="rateManualRow" style="display:' + (s.mileageRateOverride ? "" : "none") + ';"><div><div class="t">Custom rate</div><div class="s">Cents per mile</div></div>' +
      '<select id="setRate">' + [50, 55, 60, 65, 67, 70, 72.5, 76, 80].map(function (c) {
        var v = c / 100;
        return '<option value="' + v + '"' + (Number(s.mileageRateOverride) === v ? " selected" : "") + ">" + c + "¢/mi</option>";
      }).join("") + "</select></div></div>";

    html += '<div class="card"><h3>🌙 Appearance</h3>' +
      '<div class="set-row"><div><div class="t">Dark mode</div></div>' +
      '<select id="setTheme">' +
      '<option value="auto"' + (s.darkMode === "auto" ? " selected" : "") + ">Auto (follows phone)</option>" +
      '<option value="light"' + (s.darkMode === "light" ? " selected" : "") + ">Light</option>" +
      '<option value="dark"' + (s.darkMode === "dark" ? " selected" : "") + ">Dark</option>" +
      "</select></div></div>";

    var counts = AD.db.expenses.length + AD.db.drives.length;
    html += '<div class="card"><h3>💾 Your data</h3>' +
      '<div class="set-row"><div><div class="t">On this device</div><div class="s">' + AD.db.expenses.length + ' expenses · ' + AD.db.drives.length + ' drives · ' + AD.db.deals.length + ' properties</div></div></div>' +
      '<button class="btn-ghost" id="wipeBtn" type="button"><span class="btn-danger">🗑️ Erase everything</span></button>' +
      '<p class="hint">There is no account to delete — erasing here wipes the app clean on this device.</p></div>';

    html += '<div class="card"><h3>🔒 Privacy</h3><p class="privacy-note">' +
      "<b>Your data lives on this device.</b><br>" +
      "Every expense, drive, and receipt photo stays in this browser unless you link Google Drive — then encrypted backups go to a private AgentDeduct folder in your Drive, and nothing else. " +
      "The receipt scanner runs on your phone — photos are never uploaded anywhere else. " +
      "Anonymous usage counts (like “expense saved”) help improve the app and contain zero personal data. " +
      '<a href="privacy.html" style="color:var(--green);font-weight:700;">Full privacy policy</a></p></div>';

    html += '<div class="card"><h3>💬 Feedback</h3>' +
      '<p class="hint">Found a bug? Want a feature? Tell us — it goes straight to the builder.</p>' +
      '<a href="feedback.html" class="btn-ghost" style="display:block;text-align:center;text-decoration:none;">Send feedback</a></div>';

    html += '<p class="hint center">AgentDeduct is a tracking tool, not tax advice.<br>Your CPA has the final word. 🤝</p>';

    el.innerHTML = html;

    document.getElementById("setBracket").addEventListener("change", function (e) {
      AD.db.settings.taxBracket = Number(e.target.value);
      AD.persist();
      AD.toast("Bracket updated — savings recalculated ✓");
    });
    document.getElementById("setRateMode").addEventListener("change", function (e) {
      var manual = e.target.value === "manual";
      document.getElementById("rateManualRow").style.display = manual ? "" : "none";
      AD.db.settings.mileageRateOverride = manual ? Number(document.getElementById("setRate").value) : 0;
      AD.persist();
    });
    document.getElementById("setRate").addEventListener("change", function (e) {
      AD.db.settings.mileageRateOverride = Number(e.target.value);
      AD.persist();
      AD.toast("Custom mileage rate saved");
    });
    document.getElementById("setTheme").addEventListener("change", function (e) {
      AD.db.settings.darkMode = e.target.value;
      AD.persist();
      AD.applyTheme();
    });
    document.getElementById("wipeBtn").addEventListener("click", function () {
      if (!confirm("Erase ALL expenses, drives, and properties on this device? This can't be undone.")) return;
      if (!confirm("Really sure? Download a backup from Reports first if you want to keep it.")) return;
      try { localStorage.removeItem("agentDeduct.db.v2"); } catch (e) {}
      location.reload();
    });
    var linkBtn = document.getElementById("linkDriveBtn");
    if (linkBtn) linkBtn.addEventListener("click", function () { AD.auth.linkDrive(); });
    var backupBtn = document.getElementById("backupNowBtn");
    if (backupBtn) backupBtn.addEventListener("click", function () {
      backupBtn.disabled = true;
      backupBtn.textContent = "Backing up…";
      AD.auth.backupNow().then(function () { AD.views.settings(); });
    });
    var outBtn = document.getElementById("signOutBtn");
    if (outBtn) outBtn.addEventListener("click", function () {
      if (confirm("Sign out of AgentDeduct on this device? Your data stays on this phone.")) AD.auth.signOut();
    });
  }

  AD.views.settings = render;
})();
