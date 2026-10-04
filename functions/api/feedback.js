// Cloudflare Pages Function — /.netlify/functions/feedback (rewritten to /feedback)
// Ported from Netlify Function netlify/functions/feedback.js (2026-10-04 migration).
// Forwards feedback submissions to the Google Sheets webhook.

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const payload = await request.json();
    const message = String(payload.message || "").trim();

    if (!message) {
      return json({ ok: false, error: "Feedback message is required" }, 400);
    }

    await sendToGoogleSheets(env, {
      type: "feedback",
      name: String(payload.name || "").slice(0, 120),
      email: String(payload.email || "").slice(0, 160),
      feedbackType: String(payload.feedbackType || "").slice(0, 80),
      message: message.slice(0, 5000),
      page: String(payload.page || "").slice(0, 200),
      anonId: String(payload.anonId || "").slice(0, 80),
      userAgent: String(payload.userAgent || "").slice(0, 500),
    });

    return json({ ok: true });
  } catch {
    return json({ ok: false, error: "Feedback could not be submitted" }, 500);
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

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}
