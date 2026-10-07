/* AgentDeduct v2 — Google sign-in gate + Google Drive linking & backup.
   The app boots through AD.auth.ensure(): when Google auth is configured and
   the visitor isn't signed in, a gate overlay blocks the app. After sign-in,
   the app automatically prompts to link Google Drive (one-tap incremental
   OAuth). Linked drives get automatic silent backups of data + receipts. */
(function () {
  "use strict";

  var meCache = null;
  var DISMISS_KEY = "agentDeduct.driveDismissed.v1";
  var backingUp = false;

  function fetchMe() {
    return fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" })
      .then(function (r) { return r.json(); })
      .catch(function () { return { authEnabled: false, signedIn: false }; });
  }

  function ensure() {
    if (meCache) return Promise.resolve(meCache);
    return fetchMe().then(function (me) { meCache = me; return me; });
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------- public landing + sign-in gate ----------
     Logged-out visitors see a real landing page describing the app
     (Google requires app info to be visible without login), with the
     Google sign-in button front and center. */
  function renderGate() {
    document.body.classList.add("is-gated");
    var veil = document.createElement("div");
    veil.className = "gate-veil gate-landing";
    veil.innerHTML =
      '<div class="gate-card gate-wide">' +
      '<div class="gate-top">' +
        '<img class="gate-logo" src="assets/agentdeduct-logo.png?v=5" alt="AgentDeduct">' +
        "<h1>AgentDeduct</h1>" +
        '<p class="gate-sub">The mileage-first tax deduction app for real estate agents.</p>' +
        '<a class="gbtn" href="/api/auth/login">' +
          '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
          '<path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.3H12v4.3h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.1.4 3.4 2.6.3.1c2.1-2 3.8-4.9 3.8-8.9z"/>' +
          '<path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.1 0-5.8-2.1-6.8-5l-.4.1-3.6 2.8v.4C3.2 21.3 7.3 24 12 24z"/>' +
          '<path fill="#FBBC05" d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4l-.1-.4-3.6-2.8-.3.1C.4 8.2 0 10 0 12s.4 3.8 1.2 5.5l4-3.1z"/>' +
          '<path fill="#EA4335" d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.3 0 3.2 2.7 1.2 6.5l4 3.1c1-2.8 3.7-4.9 6.8-4.9z"/>' +
          "</svg>" +
          "<span>Continue with Google</span>" +
        "</a>" +
        '<p class="gate-note">We only see your name and email.<br>Your tax data stays yours.</p>' +
      "</div>" +
      '<div class="gate-info">' +
        "<h2>What AgentDeduct does</h2>" +
        "<p>AgentDeduct helps real estate agents capture every deductible mile and dollar. Log drives and expenses in seconds, snap receipt photos, and get tax-ready totals — built for busy agents.</p>" +
        '<ul class="gate-feats">' +
          "<li><span>🚗</span><span><b>Mileage tracking</b> — log business drives with IRS-ready records.</span></li>" +
          "<li><span>💬</span><span><b>Talk to AgentDeduct</b> — say what you spent and it files the expense.</span></li>" +
          "<li><span>🧾</span><span><b>Receipt scanner</b> — snap a photo and the totals are read automatically.</span></li>" +
          "<li><span>💾</span><span><b>Google Drive backup</b> — your data backs up automatically to a file in your own Drive.</span></li>" +
          "<li><span>📊</span><span><b>Tax reports</b> — clean deduction totals when filing time comes.</span></li>" +
        "</ul>" +
        "<h2>Your data</h2>" +
        "<p>Sign-in uses your Google account — we see only your name and email. Backups live in <b>your</b> Google Drive: AgentDeduct can only access the backup files it creates, never your other files. Export or delete your data anytime from Settings.</p>" +
        '<p class="gate-links"><a href="/privacy.html">Privacy Policy</a> &nbsp;·&nbsp; <a href="/terms.html">Terms of Service</a></p>' +
      "</div>" +
      "</div>";
    document.body.appendChild(veil);
  }

  /* ---------- Drive link prompt ---------- */
  function dismissed() {
    try { return localStorage.getItem(DISMISS_KEY) === "yes"; } catch (e) { return false; }
  }
  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, "yes"); } catch (e) {}
  }

  function promptDriveLink() {
    if (dismissed()) return;
    var veil = document.createElement("div");
    veil.className = "modal-veil";
    veil.id = "drivePrompt";
    veil.innerHTML =
      '<div class="modal-card">' +
        '<div class="modal-ico">💾</div>' +
        "<h2>Link Google Drive?</h2>" +
        '<p class="modal-sub">AgentDeduct can back up your expenses, drives, and receipt photos to a private <b>AgentDeduct</b> folder in your Google Drive — automatically. It can only touch files it creates.</p>' +
        '<button class="btn-primary" id="driveLinkBtn" type="button">Link Google Drive</button>' +
        '<button class="btn-ghost" id="driveLaterBtn" type="button">Not now</button>' +
      "</div>";
    document.body.appendChild(veil);
    document.getElementById("driveLinkBtn").addEventListener("click", function () {
      window.location.href = "/api/auth/login?scope=drive";
    });
    document.getElementById("driveLaterBtn").addEventListener("click", function () {
      dismiss();
      veil.remove();
    });
  }

  function linkDrive() {
    window.location.href = "/api/auth/login?scope=drive";
  }
  function signOut() {
    meCache = null;
    window.location.href = "/api/auth/logout";
  }

  /* ---------- backup ---------- */
  function collectReceipts() {
    var out = [];
    try {
      AD.db.expenses.forEach(function (e) {
        if (e.receipt && e.receipt.data && typeof e.receipt.data === "string" &&
            e.receipt.data.indexOf("data:") === 0) {
          out.push({ id: e.id, name: e.receipt.name || "receipt.jpg", dataUrl: e.receipt.data });
        }
      });
    } catch (e) {}
    return out;
  }

  function backupNow(opts) {
    opts = opts || {};
    if (backingUp) return Promise.resolve({ ok: false, busy: true });
    if (!meCache || !meCache.signedIn || !meCache.driveLinked) {
      return Promise.resolve({ ok: false, error: "not linked" });
    }
    backingUp = true;
    var snapshot;
    try { snapshot = JSON.parse(JSON.stringify(AD.db)); } catch (e) { snapshot = null; }
    if (!snapshot) { backingUp = false; return Promise.resolve({ ok: false }); }
    return fetch("/api/drive/sync", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ snapshot: snapshot, receipts: collectReceipts() }),
    })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); })
      .then(function (res) {
        backingUp = false;
        var j = res.body || {};
        if (j.ok) {
          if (!opts.silent) {
            var extra = j.receiptsUploaded ? " · " + j.receiptsUploaded + " receipt" + (j.receiptsUploaded === 1 ? "" : "s") : "";
            AD.toast("Backed up to Google Drive ✓" + extra);
          }
          try { localStorage.setItem("agentDeduct.lastBackup.v1", new Date().toISOString()); } catch (e) {}
        } else if (j.error === "drive_not_linked") {
          meCache.driveLinked = false;
          if (!opts.silent) {
            AD.toast("Drive needs re-linking");
            promptDriveLink();
          }
        } else if (!opts.silent) {
          AD.toast("Backup didn't go through — try again");
        }
        return j;
      })
      .catch(function () {
        backingUp = false;
        if (!opts.silent) AD.toast("Backup didn't go through — try again");
        return { ok: false };
      });
  }

  /* ---------- post-boot ---------- */
  function afterBoot(auth) {
    // Surface OAuth result messages once.
    try {
      var q = new URLSearchParams(window.location.search);
      var res = q.get("auth");
      if (res) {
        if (res === "done") {
          AD.toast(q.get("drive") === "linked" ? "Google Drive linked ✓" : "Signed in ✓");
          // Fresh sign-in: Drive isn't linked yet → ask right away.
          if (q.get("drive") !== "linked" && auth && auth.signedIn && !auth.driveLinked) {
            setTimeout(promptDriveLink, 600);
          }
        } else if (res === "cancelled") {
          AD.toast("Sign-in cancelled");
        } else if (res === "error") {
          AD.toast("Sign-in didn't work — try again");
        }
        q.delete("auth"); q.delete("drive");
        var clean = window.location.pathname + (q.toString() ? "?" + q.toString() : "");
        window.history.replaceState(null, "", clean);
        return;
      }
    } catch (e) {}

    if (auth && auth.authEnabled && auth.signedIn && !auth.driveLinked) {
      setTimeout(promptDriveLink, 1200);
    }
    // Silent auto-backup shortly after boot when Drive is linked.
    if (auth && auth.signedIn && auth.driveLinked && window.navigator.onLine !== false) {
      setTimeout(function () { backupNow({ silent: true }); }, 8000);
    }
  }

  window.AD = window.AD || {};
  AD.auth = {
    ensure: ensure,
    me: function () { return meCache; },
    renderGate: renderGate,
    afterBoot: afterBoot,
    linkDrive: linkDrive,
    signOut: signOut,
    backupNow: backupNow,
  };
})();
