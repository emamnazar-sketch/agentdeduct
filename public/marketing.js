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
            "You\u2019re on the list \u2014 we\u2019ll email you when your beta invitation is ready."
          );
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
