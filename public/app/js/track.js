/* AgentDeduct v2 — anonymous usage analytics (no personal data). */
(function () {
  "use strict";
  var ANON_ID_KEY = "agentDeduct.analyticsId.v1";

  function anonId() {
    try {
      var id = localStorage.getItem(ANON_ID_KEY);
      if (!id) {
        id = (crypto.randomUUID ? crypto.randomUUID() : "a" + Date.now().toString(36) + Math.random().toString(36).slice(2));
        localStorage.setItem(ANON_ID_KEY, id);
      }
      return id;
    } catch (e) { return "unknown"; }
  }

  function trackEvent(event) {
    try {
      fetch("/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: event, anonId: anonId() }),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {}
  }

  window.AD = window.AD || {};
  window.AD.track = trackEvent;
})();
