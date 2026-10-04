/* AgentDeduct v2 — on-device receipt OCR (Tesseract.js).
   The image never leaves the phone: recognition runs locally. */
(function () {
  "use strict";

  function setStatus(el, message, tone) {
    if (!el) return;
    el.textContent = message;
    el.className = "ocr-status" + (tone ? " " + tone : "");
  }

  function parseReceiptText(text) {
    var lines = String(text || "")
      .split(/\r?\n/)
      .map(function (line) { return line.replace(/[|_*~]/g, " ").replace(/\s+/g, " ").trim(); })
      .filter(Boolean);
    var out = { vendor: "", date: "", amount: 0 };
    if (lines.length) {
      // Vendor: first line that isn't mostly numbers/symbols.
      for (var i = 0; i < Math.min(lines.length, 4); i++) {
        var alpha = (lines[i].match(/[A-Za-z]/g) || []).length;
        if (alpha >= 3 && lines[i].length <= 40) { out.vendor = lines[i]; break; }
      }
    }
    var joined = lines.join("\n");
    var dateMatch = joined.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (dateMatch) {
      var y = dateMatch[3].length === 2 ? "20" + dateMatch[3] : dateMatch[3];
      out.date = y + "-" + String(dateMatch[1]).padStart(2, "0") + "-" + String(dateMatch[2]).padStart(2, "0");
    }
    // Amount: prefer a line mentioning total, else the largest money value.
    var moneyLines = [];
    lines.forEach(function (line) {
      var m = line.match(/\$?\s?(\d{1,6}(?:,\d{3})*\.\d{2})/);
      if (m) moneyLines.push({ line: line, value: parseFloat(m[1].replace(/,/g, "")) });
    });
    if (moneyLines.length) {
      var totalLine = moneyLines.filter(function (x) { return /total|amount due|balance/i.test(x.line); });
      var pick = totalLine.length ? totalLine[totalLine.length - 1] : moneyLines.reduce(function (a, b) { return b.value > a.value ? b : a; });
      out.amount = pick.value;
    }
    return out;
  }

  function scanReceipt(file, statusEl) {
    return new Promise(function (resolve) {
      if (!file || !file.type || file.type.indexOf("image/") !== 0) {
        setStatus(statusEl, "PDF receipts are attached only — enter the fields manually.", "warning");
        resolve(null);
        return;
      }
      if (!window.Tesseract) {
        setStatus(statusEl, "Scanner is unavailable right now — you can still enter it manually.", "warning");
        if (window.AD && AD.track) AD.track("ocr_scan_failed");
        resolve(null);
        return;
      }
      setStatus(statusEl, "Scanning receipt on this device…", "working");
      if (window.AD && AD.track) AD.track("ocr_scan_attempted");
      window.Tesseract.recognize(file, "eng", {
        logger: function (m) {
          if (m.status === "recognizing text" && m.progress) {
            setStatus(statusEl, "Scanning receipt on this device… " + Math.round(m.progress * 100) + "%", "working");
          }
        },
      }).then(function (result) {
        var parsed = parseReceiptText((result.data && result.data.text) || "");
        var filled = [];
        if (parsed.vendor) filled.push("vendor");
        if (parsed.date) filled.push("date");
        if (parsed.amount) filled.push("amount");
        if (filled.length) setStatus(statusEl, "Auto-filled " + filled.join(", ") + ". Please review before saving.", "success");
        else setStatus(statusEl, "Receipt attached — I couldn't read enough, please enter fields manually.", "warning");
        resolve(parsed);
      }).catch(function () {
        setStatus(statusEl, "Receipt attached — auto-fill couldn't read this image.", "warning");
        if (window.AD && AD.track) AD.track("ocr_scan_failed");
        resolve(null);
      });
    });
  }

  /* Downscale a receipt photo so localStorage stays healthy. */
  function compressImage(file, maxSide) {
    maxSide = maxSide || 1400;
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var image = new Image();
        image.onload = function () {
          var scale = Math.min(1, maxSide / Math.max(image.width, image.height));
          var canvas = document.createElement("canvas");
          canvas.width = Math.round(image.width * scale);
          canvas.height = Math.round(image.height * scale);
          canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve({ name: file.name, type: "image/jpeg", data: canvas.toDataURL("image/jpeg", 0.72) });
        };
        image.onerror = reject;
        image.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function readReceipt(file) {
    if (!file) return Promise.resolve(null);
    if (file.type && file.type.indexOf("image/") === 0) return compressImage(file);
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve({ name: file.name, type: file.type, data: reader.result }); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  window.AD = window.AD || {};
  window.AD.ocr = { scanReceipt: scanReceipt, readReceipt: readReceipt, parseReceiptText: parseReceiptText, setStatus: setStatus };
})();
