// Cloudflare Pages Function — /.netlify/functions/dashboard (rewritten to /dashboard)
// Ported from Netlify Function netlify/functions/dashboard.js (2026-10-04 migration).
// Admin-only: requires the AGENTDEDUCT_ADMIN_TOKEN via the x-admin-token header
// or the ?token= query parameter. Returns anonymous usage counters from the
// AGENTDEDUCT_ACTIVITY KV namespace.

const DEFAULT_STATS = {
  totalVisits: 0,
  expensesAdded: 0,
  receiptsAttached: 0,
  csvExports: 0,
  dataDownloads: 0,
  ocrScansAttempted: 0,
  ocrScansFailed: 0,
  reportPrinted: 0,
  users: 0,
  updatedAt: null,
};

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = request.headers.get("x-admin-token") || url.searchParams.get("token");
  const expected = env.AGENTDEDUCT_ADMIN_TOKEN;

  if (!expected || token !== expected) {
    return json({ error: "Unauthorized" }, 401);
  }

  const kv = env.AGENTDEDUCT_ACTIVITY;
  const stats = (await kv.get("stats", { type: "json" })) || DEFAULT_STATS;

  return json({
    totalVisits: Number(stats.totalVisits || 0),
    expensesAdded: Number(stats.expensesAdded || 0),
    receiptsAttached: Number(stats.receiptsAttached || 0),
    csvExports: Number(stats.csvExports || 0),
    dataDownloads: Number(stats.dataDownloads || 0),
    ocrScansAttempted: Number(stats.ocrScansAttempted || 0),
    ocrScansFailed: Number(stats.ocrScansFailed || 0),
    reportPrinted: Number(stats.reportPrinted || 0),
    users: Array.isArray(stats.userIds) ? stats.userIds.length : Number(stats.users || 0),
    updatedAt: stats.updatedAt || null,
  });
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
