/* AgentDeduct v2 — Drives view: GPS trip tracking + manual mileage log. */
(function () {
  "use strict";

  var liveTimer = null;

  function stopLiveUi() {
    if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
  }

  function render() {
    stopLiveUi();
    var el = document.getElementById("view-drives");
    var year = AD.year;
    var drives = AD.db.drives
      .filter(function (d) { return String(d.date || "").slice(0, 4) === year; })
      .sort(function (a, b) { return (a.date < b.date ? 1 : a.date > b.date ? -1 : 0); });
    var miles = drives.reduce(function (s, d) { return s + Number(d.miles || 0); }, 0);
    var ded = drives.reduce(function (s, d) { return s + AD.store.driveDeductible(d); }, 0);

    var html = '<h1 class="page-title">Drives</h1><p class="page-sub">Your car is your biggest deduction. Log every mile.</p>';

    // Live GPS card.
    html += '<div class="card" id="gpsCard">';
    if (AD.gps.active()) {
      html += liveCardHtml(0, 0);
    } else {
      html += '<h3>🚗 Track a drive with GPS</h3>' +
        '<p class="hint">Hit start, drive, hit stop. Your route is measured on this phone — nothing is uploaded.</p>' +
        (AD.gps.supported()
          ? '<button class="btn-drive" id="startDriveBtn" type="button">▶ Start drive</button>'
          : '<div class="warn">📍 <b>GPS isn\'t available</b> on this device or browser — use manual logging below.</div>');
    }
    html += "</div>";

    html += '<div class="stat-grid">' +
      '<div class="stat"><div class="v">' + AD.fmtMiles(miles) + '</div><div class="l">miles in ' + AD.esc(year) + '</div></div>' +
      '<div class="stat"><div class="v">' + AD.money0(ded) + '</div><div class="l">mileage deduction</div></div>' +
      '<div class="stat"><div class="v">' + drives.length + '</div><div class="l">drives logged</div></div></div>';

    html += '<div class="card"><h3>Drive log</h3>';
    if (!drives.length) {
      html += '<div class="empty"><span class="big-ico">🛣️</span>No drives yet.<br>Start one above or tap + to log miles manually.</div>';
    } else {
      html += drives.slice(0, 40).map(function (d) {
        var deal = AD.dealLabel(d.dealId);
        return '<div class="row-item"><div class="row-ico">' + (d.gps ? "🛰️" : "🚗") + '</div><div class="row-main">' +
          '<div class="row-title">' + AD.esc(d.purpose || "Business drive") + '</div>' +
          '<div class="row-sub">' + AD.fmtDate(d.date) + " · " + AD.fmtMiles(d.miles) + " mi" +
          (deal ? " · " + AD.esc(deal) : "") + "</div></div>" +
          '<div class="row-amt">' + AD.money(AD.store.driveDeductible(d)) + "<small>deduction</small></div></div>";
      }).join("");
      if (drives.length > 40) html += '<div class="hint center">Showing 40 most recent — see Reports for the full year.</div>';
    }
    html += "</div>";
    el.innerHTML = html;

    var startBtn = document.getElementById("startDriveBtn");
    if (startBtn) startBtn.addEventListener("click", startDrive);
    var stopBtn = document.getElementById("stopDriveBtn");
    if (stopBtn) stopBtn.addEventListener("click", stopDrive);
    if (AD.gps.active()) tickLive();
  }

  function liveCardHtml(miles, elapsedMs) {
    var mins = Math.floor(elapsedMs / 60000);
    return '<div class="drive-live"><div class="eyebrow" style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;"><span class="pulse">🔴</span> Tracking drive…</div>' +
      '<div class="drive-miles" id="liveMiles">' + AD.fmtMiles(miles) + '</div>' +
      '<div class="drive-meta"><span id="liveTime">' + mins + ' min</span> · keep this app open while driving</div>' +
      '<button class="btn-drive stop" id="stopDriveBtn" type="button">⏹ Stop drive</button></div>';
  }

  function tickLive() {
    stopLiveUi();
    liveTimer = setInterval(function () {
      if (!AD.gps.active()) { stopLiveUi(); render(); return; }
      // Re-render light: update numbers without rebuilding the card.
      var card = document.getElementById("gpsCard");
      if (!card) return;
      // We re-read from a snapshot stored on the button dataset by startDrive's onUpdate.
      var m = parseFloat(card.dataset.miles || "0");
      var t0 = parseInt(card.dataset.t0 || String(Date.now()), 10);
      var lm = document.getElementById("liveMiles");
      var lt = document.getElementById("liveTime");
      if (lm) lm.textContent = AD.fmtMiles(m);
      if (lt) lt.textContent = Math.floor((Date.now() - t0) / 60000) + " min";
    }, 2000);
  }

  function startDrive() {
    var card = document.getElementById("gpsCard");
    AD.gps.start(
      function (snap) {
        var c = document.getElementById("gpsCard");
        if (c) { c.dataset.miles = snap.miles; }
      },
      function (msg) {
        AD.toast(msg);
        render();
      }
    );
    if (AD.gps.active()) {
      card.dataset.t0 = String(Date.now());
      card.dataset.miles = "0";
      card.innerHTML = liveCardHtml(0, 0);
      document.getElementById("stopDriveBtn").addEventListener("click", stopDrive);
      tickLive();
      AD.toast("Drive tracking started — drive safe 🚗");
    }
  }

  function stopDrive() {
    var s = AD.gps.stop();
    stopLiveUi();
    var miles = s ? Math.round(s.miles * 10) / 10 : 0;
    var date = AD.store.todayStr();
    if (miles < 0.1) {
      AD.toast("That drive was too short to log");
      render();
      return;
    }
    // Finish in the quick-add sheet: purpose + property, then save.
    AD.openSheet();
    AD.views.add.setMode("drive");
    document.getElementById("dMiles").value = miles;
    document.getElementById("dDate").value = date;
    document.getElementById("dPurpose").focus();
    AD.toast("Drive: " + AD.fmtMiles(miles) + " mi — add a purpose to save it");
    render();
  }

  AD.views.drives = render;
})();
