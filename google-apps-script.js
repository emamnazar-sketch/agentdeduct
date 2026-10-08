const SPREADSHEET_ID = "1R7pOjIfMaoQ_wOICFGNRHjdXP10zrJsD2Gt_cBKoTSM";
const WEBHOOK_SECRET = "54bfb41249c03292d7a078060397504ebd7060fafd2140c8"; // rotated 2026-10-07: update Apps Script project + Cloudflare env GOOGLE_SHEETS_WEBHOOK_SECRET to match

function doPost(event) {
  try {
    const payload = JSON.parse(event.postData.contents || "{}");
    if (payload.secret !== WEBHOOK_SECRET) {
      return json({ ok: false, error: "Unauthorized" });
    }

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);

    if (payload.type === "usage") {
      spreadsheet.getSheetByName("Usage Events").appendRow([
        new Date(),
        payload.event || "",
        payload.anonId || "",
        payload.page || "",
        payload.device || "",
        payload.appVersion || "",
        payload.userAgent || "",
      ]);
      return json({ ok: true });
    }

    if (payload.type === "feedback") {
      spreadsheet.getSheetByName("Feedback").appendRow([
        new Date(),
        payload.name || "",
        payload.email || "",
        payload.feedbackType || "",
        payload.message || "",
        payload.page || "",
        payload.anonId || "",
        payload.userAgent || "",
      ]);
      return json({ ok: true });
    }

    return json({ ok: false, error: "Unknown type" });
  } catch (error) {
    return json({ ok: false, error: String(error) });
  }
}

function json(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

