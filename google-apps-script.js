const SPREADSHEET_ID = "1R7pOjIfMaoQ_wOICFGNRHjdXP10zrJsD2Gt_cBKoTSM";
const WEBHOOK_SECRET = "ea1343a985f2833b5a0c06832c1ff78d";

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

