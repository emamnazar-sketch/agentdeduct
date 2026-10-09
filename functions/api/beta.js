// Cloudflare Pages Function — STAGING ONLY (staging-marketing branch).
// Beta signup endpoint with honest save semantics: it returns {ok:true}
// ONLY when the Google Sheets webhook is configured and accepts the POST.
// Unlike /api/feedback (which returns ok:true even when the webhook env
// vars are missing), this endpoint never reports a save that didn't happen.

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const p = await request.json();
    const name = String(p.name || "").trim().slice(0, 120);
    const email = String(p.email || "").trim().slice(0, 160);

    if (!name) return json({ ok: false, error: "Name is required" }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json({ ok: false, error: "A valid email is required" }, 400);
    }
    if (!p.consent) return json({ ok: false, error: "Consent is required" }, 400);

    const url = env.GOOGLE_SHEETS_WEBHOOK_URL;
    const secret = env.GOOGLE_SHEETS_WEBHOOK_SECRET;
    if (!url || !secret) {
      return json({ ok: false, error: "Signup system is not configured yet" }, 503);
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        type: "beta-signup",
        feedbackType: "beta-signup",
        name,
        email,
        message: String(p.message || "").slice(0, 2000),
        page: "beta",
        secret,
      }),
    });

    if (!res.ok) {
      return json({ ok: false, error: "Signup could not be saved" }, 502);
    }
    return json({ ok: true });
  } catch {
    return json({ ok: false, error: "Signup could not be saved" }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
