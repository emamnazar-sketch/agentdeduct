/* AgentDeduct v2 — GPS drive tracking.
   Foreground tracking via the Geolocation API. Distances are computed on-device
   with the haversine formula; no location data ever leaves the phone. */
(function () {
  "use strict";

  function toRad(d) { return d * Math.PI / 180; }

  function haversineMiles(a, b) {
    var R = 3958.8; // earth radius, miles
    var dLat = toRad(b.lat - a.lat);
    var dLon = toRad(b.lon - a.lon);
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  var tracker = null;

  function supported() {
    return !!(navigator.geolocation && navigator.geolocation.watchPosition);
  }

  function start(onUpdate, onError) {
    if (!supported()) { onError("Location isn't available on this device."); return null; }
    if (tracker) stop();
    var state = {
      watchId: null,
      points: [],
      miles: 0,
      startedAt: Date.now(),
      last: null,
    };
    tracker = state;
    state.watchId = navigator.geolocation.watchPosition(
      function (pos) {
        if (!tracker || tracker !== state) return;
        var acc = pos.coords.accuracy || 9999;
        if (acc > 60) return; // ignore noisy fixes
        var p = { lat: pos.coords.latitude, lon: pos.coords.longitude, t: Date.now(), acc: Math.round(acc) };
        if (state.last) {
          var seg = haversineMiles(state.last, p);
          if (seg < 0.005) return; // standing still / jitter
          if (seg > 3) { state.last = p; return; } // teleport = bad fix, skip
          state.miles += seg;
        }
        state.last = p;
        if (!state.points.length || Date.now() - state.points[state.points.length - 1].t > 30000) {
          state.points.push(p);
          if (state.points.length > 120) state.points.shift();
        }
        onUpdate({ miles: state.miles, elapsedMs: Date.now() - state.startedAt, points: state.points.length });
      },
      function (err) {
        var msg = "Couldn't get your location.";
        if (err && err.code === 1) msg = "Location permission was denied. You can still log miles manually.";
        if (err && err.code === 2) msg = "Location is unavailable right now. You can still log miles manually.";
        onError(msg);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    return state;
  }

  function stop() {
    if (tracker && tracker.watchId != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(tracker.watchId);
    }
    var s = tracker;
    tracker = null;
    return s;
  }

  function active() { return !!tracker; }

  window.AD = window.AD || {};
  window.AD.gps = { supported: supported, start: start, stop: stop, active: active, haversineMiles: haversineMiles };
})();
