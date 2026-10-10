/* AgentDeduct marketing site — shared behavior.
   No app code here; marketing pages only. */
(function () {
  "use strict";

  /* Mobile nav */
  var toggle = document.querySelector(".nav-toggle");
  var links = document.querySelector(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", function () {
      var open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  /* Footer year */
  var year = document.querySelector("[data-year]");
  if (year) year.textContent = String(new Date().getFullYear());

  /* Beta signup form */
  var form = document.getElementById("beta-form");
  if (!form) return;

  var fields = {
    name: document.getElementById("f-name"),
    email: document.getElementById("f-email"),
    brokerage: document.getElementById("f-brokerage"),
    hardest: document.getElementById("f-hardest"),
    consent: document.getElementById("f-consent"),
  };
  var status = document.getElementById("form-status");
  var submitBtn = form.querySelector('button[type="submit"]');

  function setError(input, id, message) {
    var err = document.getElementById(id);
    if (!err) return;
    if (message) {
      err.textContent = message;
      err.classList.add("show");
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", id);
    } else {
      err.textContent = "";
      err.classList.remove("show");
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-describedby");
    }
  }

  function platformValue() {
    var checked = form.querySelector('input[name="platform"]:checked');
    return checked ? checked.value : "";
  }

  function validate() {
    var firstBad = null;

    var name = fields.name.value.trim();
    if (!name) {
      setError(fields.name, "err-name", "Please enter your name.");
      firstBad = firstBad || fields.name;
    } else {
      setError(fields.name, "err-name", "");
    }

    var email = fields.email.value.trim();
    if (!email) {
      setError(fields.email, "err-email", "Please enter your email address.");
      firstBad = firstBad || fields.email;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(fields.email, "err-email", "That email address does not look complete.");
      firstBad = firstBad || fields.email;
    } else {
      setError(fields.email, "err-email", "");
    }

    if (!platformValue()) {
      var perr = document.getElementById("err-platform");
      if (perr) {
        perr.textContent = "Please choose iPhone or Android.";
        perr.classList.add("show");
      }
      firstBad = firstBad || form.querySelector('input[name="platform"]');
    } else {
      var perr2 = document.getElementById("err-platform");
      if (perr2) {
        perr2.textContent = "";
        perr2.classList.remove("show");
      }
    }

    if (!fields.consent.checked) {
      setError(fields.consent, "err-consent", "Please agree so we can email you about the beta.");
      firstBad = firstBad || fields.consent;
    } else {
      setError(fields.consent, "err-consent", "");
    }

    if (firstBad) firstBad.focus();
    return !firstBad;
  }

  function showStatus(kind, html) {
    status.className = "form-status show " + kind;
    status.innerHTML = html;
    status.setAttribute("role", kind === "error" ? "alert" : "status");
    status.scrollIntoView({ block: "nearest" });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (submitBtn.disabled) return;
    if (!validate()) return;

    submitBtn.disabled = true;
    var originalLabel = submitBtn.textContent;
    submitBtn.textContent = "Sending…";

    var brokerage = fields.brokerage.value.trim() || "—";
    var hardest = fields.hardest.value.trim() || "—";

    fetch("/api/beta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: fields.name.value.trim(),
        email: fields.email.value.trim(),
        consent: fields.consent.checked === true,
        message:
          "Brokerage: " + brokerage +
          " | Platform: " + platformValue() +
          " | Hardest to track: " + hardest,
        page: "beta",
      }),
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; });
      })
      .then(function (data) {
        if (data && data.ok === true) {
          form.reset();
          showStatus(
            "success",
            "You\u2019re on the list \u2014 we\u2019ll email you when your beta invitation is ready." +
              '<div class="refer">' +
              "<p><strong>Know another agent?</strong> Agents trust agents \u2014 send them the beta link:</p>" +
              '<div class="refer-row">' +
              '<input type="text" id="refer-link" readonly value="https://agentdeduct.com/beta" aria-label="Beta signup link to share">' +
              '<button type="button" id="refer-copy">Copy link</button>' +
              "</div>" +
              '<p class="refer-note" id="refer-note" role="status"></p>' +
              "</div>"
          );
          var copyBtn = document.getElementById("refer-copy");
          if (copyBtn) {
            copyBtn.addEventListener("click", function () {
              var linkInput = document.getElementById("refer-link");
              var note = document.getElementById("refer-note");
              function done(msg) { if (note) note.textContent = msg; }
              function fallback() {
                linkInput.select();
                try { document.execCommand("copy"); done("Copied \u2014 send it to your favorite agent."); }
                catch (e) { done("Copy it manually \u2014 the link is selected."); }
              }
              if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(linkInput.value).then(
                  function () { done("Copied \u2014 send it to your favorite agent."); },
                  fallback
                );
              } else { fallback(); }
            });
          }
        } else {
          throw new Error("not-ok");
        }
      })
      .catch(function () {
        showStatus(
          "error",
          "Something went wrong \u2014 please try again, or email " +
            '<a href="mailto:agentdeduct@gmail.com">agentdeduct@gmail.com</a>.'
        );
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      });
  });
})();

/* Screenshot carousel — auto-advance with dots, arrows, swipe, keyboard.
   Honors prefers-reduced-motion (manual navigation only in that case). */
(function () {
  "use strict";
  var root = document.getElementById("app-carousel");
  if (!root) return;

  var track = root.querySelector(".carousel-track");
  var slides = Array.prototype.slice.call(root.querySelectorAll(".carousel-slide"));
  var prev = root.querySelector(".carousel-prev");
  var next = root.querySelector(".carousel-next");
  var dots = Array.prototype.slice.call(root.querySelectorAll(".carousel-dot"));
  var caption = root.querySelector(".carousel-caption");
  if (!track || !slides.length) return;
  root.classList.add("is-live");

  var reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var index = 0;
  var timer = null;

  function render() {
    track.style.transform = "translateX(-" + index * 100 + "%)";
    for (var i = 0; i < slides.length; i++) {
      var active = i === index;
      slides[i].setAttribute("aria-hidden", active ? "false" : "true");
      if (dots[i]) {
        dots[i].classList.toggle("active", active);
        if (active) dots[i].setAttribute("aria-current", "true");
        else dots[i].removeAttribute("aria-current");
      }
    }
    if (caption) caption.textContent = slides[index].getAttribute("data-caption") || "";
  }

  function go(i) {
    index = (i + slides.length) % slides.length;
    render();
  }

  function startAuto() {
    if (reduceMotion || timer) return;
    timer = window.setInterval(function () { go(index + 1); }, 4000);
  }

  function stopAuto() {
    if (timer) { window.clearInterval(timer); timer = null; }
  }

  function nudge(i) { go(i); stopAuto(); startAuto(); }

  if (prev) prev.addEventListener("click", function () { nudge(index - 1); });
  if (next) next.addEventListener("click", function () { nudge(index + 1); });
  dots.forEach(function (d, i) {
    d.addEventListener("click", function () { nudge(i); });
  });

  /* Pause while keyboard-focused or touched; resume after.
     (No hover-pause: on desktop the cursor naturally rests on the hero,
     which made autoplay look broken.) */
  root.addEventListener("focusin", stopAuto);
  root.addEventListener("focusout", startAuto);
  root.addEventListener("touchstart", stopAuto, { passive: true });
  root.addEventListener("touchend", startAuto, { passive: true });

  /* Swipe support */
  var startX = null;
  root.addEventListener("touchstart", function (e) {
    startX = e.touches[0].clientX;
  }, { passive: true });
  root.addEventListener("touchend", function (e) {
    if (startX === null) return;
    var dx = e.changedTouches[0].clientX - startX;
    startX = null;
    if (Math.abs(dx) > 40) nudge(index + (dx < 0 ? 1 : -1));
  }, { passive: true });

  /* Arrow keys when focus is inside the carousel */
  root.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") { e.preventDefault(); nudge(index - 1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); nudge(index + 1); }
  });

  /* Don't run the timer in a hidden tab */
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stopAuto();
    else startAuto();
  });

  render();
  startAuto();
})();
