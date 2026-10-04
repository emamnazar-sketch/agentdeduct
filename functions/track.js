// Cloudflare Pages Function — POST /.netlify/functions/track (rewritten to /track)
// Ported from Netlify Function netlify/functions/track.js (2026-10-04 migration).
// Stores anonymous usage counters in the AGENTDEDUCT_ACTIVITY KV namespace and
// forwards each event to the Google Sheets webhook.

const ALLOWED_EVENTS = new Set([
  "app_opened",
  "expense_saved",
  "receipt_attached",
  "csv_exported",
  "data_downloaded",
  "ocr_scan_attempted",
  "ocr_scan_failed",
  "report_printed",
]);

const DEFAULT_STATS = {
  totalVisits: 0,
  expensesAdded: 0,
  receiptsAttached: 0,
  csvExports: 0,
  dataDownloads: 0,
  ocrScansAttempted: 0,
  ocrScansFailed: 0,
  users: 0,
  userIds: [],
  updatedAt: null,
};

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const payload = await request.json();
    const event = String(payload.event || "");
    const anonId = String(payload.anonId || "").slice(0, 80);

    if (!ALLOWED_EVENTS.has(event) || !anonId) {
      return json({ ok: false }, 400);
    }

    const kv = env.AGENTDEDUCT_ACTIVITY;
    const stats = (await kv.get("stats", { type: "json" })) || DEFAULT_STATS;
    const next = normalizeStats(stats);

    if (!next.userIds.includes(anonId)) {
      next.userIds.push(anonId);
      next.users = next.userIds.length;
    }

    if (event === "app_opened") next.totalVisits += 1;
    if (event === "expense_saved") next.expensesAdded += 1;
    if (event === "receipt_attached") next.receiptsAttached += 1;
    if (event === "csv_exported") next.csvExports += 1;
    if (event === "data_downloaded") next.dataDownloads += 1;
    if (event === "ocr_scan_attempted") next.ocrScansAttempted += 1;
    if (event === "ocr_scan_failed") next.ocrScansFailed += 1;
    if (event === "report_printed") next.reportPrinted = (next.reportPrinted || 0) + 1;

    next.updatedAt = new Date().toISOString();
    await kv.put("stats", JSON.stringify(next));
    await sendToGoogleSheets(env, {
      type: "usage",
      event,
      anonId,
      page: String(payload.page || "").slice(0, 200),
      device: String(payload.device || "").slice(0, 40),
      appVersion: String(payload.appVersion || "test").slice(0, 40),
      userAgent: String(payload.userAgent || "").slice(0, 500),
    });

    return json({ ok: true });
  } catch {
    return json({ ok: false }, 500);
  }
}

async function sendToGoogleSheets(env, payload) {
  const url = env.GOOGLE_SHEETS_WEBHOOK_URL;
  const secret = env.GOOGLE_SHEETS_WEBHOOK_SECRET;

  if (!url || !secret) return;

  await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify({
      ...payload,
      secret,
    }),
  });
}

function normalizeStats(stats) {
  return {
    ...DEFAULT_STATS,
    ...stats,
    userIds: Array.isArray(stats.userIds) ? stats.userIds.slice(0, 10000) : [],
    users: Array.isArray(stats.userIds) ? stats.userIds.length : Number(stats.users || 0),
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}
