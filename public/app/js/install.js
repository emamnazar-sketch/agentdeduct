/* AgentDeduct v2 — PWA install handling (Add to Home Screen). */
(function () {
  "use strict";

  var deferredPrompt = null;
  var listeners = [];

  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }
  function isAndroid() {
    return /android/i.test(navigator.userAgent);
  }
  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
  }
  function notify() {
    listeners.forEach(function (fn) { try { fn(); } catch (e) {} });
  }

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredPrompt = e;
    notify();
  });
  window.addEventListener("appinstalled", function () {
    deferredPrompt = null;
    notify();
  });

  window.ADInstall = {
    canPrompt: function () { return !!deferredPrompt; },
    isIOS: isIOS,
    isAndroid: isAndroid,
    isStandalone: isStandalone,
    onChange: function (fn) { listeners.push(fn); },
    prompt: function () {
      if (!deferredPrompt) return Promise.resolve(false);
      var p = deferredPrompt;
      deferredPrompt = null;
      try {
        var r = p.prompt();
        if (r && r.then) return r.then(function () { notify(); return true; });
      } catch (e) {}
      notify();
      return Promise.resolve(true);
    }
  };
})();
