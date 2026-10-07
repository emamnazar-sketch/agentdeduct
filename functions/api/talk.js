// Cloudflare Pages Function — POST /api/talk
// Talk brain: sends the agent's message to Workers AI (free tier) and returns
// strict JSON the app can turn into an expense or drive.
// If the AI binding isn't configured or the call fails, the frontend falls
// back to the on-device phrase parser (js/talk-parse.js).

const MODEL = "@cf/meta/llama-3.2-3b-instruct";

const SYSTEM = [
  "You parse short messages from real estate agents into expense or mileage records.",
  "Reply with ONLY a JSON object, no other text.",
  'Expense: {"type":"expense","amount":45.5,"vendor":"Staples","categoryId":"office_tech","purpose":"Printer paper","giftFor":""}',
  'Drive: {"type":"drive","miles":22.5,"destination":"Maple St","purpose":"Showing at Maple St"}',
  'Unknown: {"type":"unknown"}',
  "Categories: mileage, desk_fees, mls_dues, eo_insurance, marketing, photo_staging, signage, client_gifts, phone_internet, home_office, license_edu, office_tech, meals, vehicle_actual, prof_services, other.",
  "Rules: amount is a number, no $ sign. mileage entries are type drive, never expense. If no amount (expense) or no miles (drive) can be found, return unknown. Keep vendor/destination short.",
].join("\n");

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let message = "";
  try {
    const body = await request.json();
    message = String(body.message || "").trim().slice(0, 500);
  } catch (e) { /* fall through */ }
  if (!message) return json({ ok: false, error: "Empty message" }, 400);

  // No AI binding configured (or not on Cloudflare) — tell the app to use its local parser.
  if (!env.AI || typeof env.AI.run !== "function") {
    return json({ ok: false, fallback: true, error: "AI not configured" }, 200);
  }

  try {
    const out = await env.AI.run(MODEL, {
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: message },
      ],
      max_tokens: 160,
    });
    // Workers AI returns `response` as a parsed object when the model emits
    // clean JSON, or as a string otherwise. Handle both.
    let parsed = null;
    if (out && out.response != null) {
      if (typeof out.response === "object") {
        parsed = out.response;
      } else {
        parsed = extractJson(String(out.response));
      }
    }
    if (!parsed && out && out.choices && out.choices[0] && out.choices[0].message) {
      parsed = extractJson(String(out.choices[0].message.content || ""));
    }
    if (!parsed || typeof parsed.type !== "string") return json({ ok: false, fallback: true }, 200);
    return json({ ok: true, parsed: sanitize(parsed) });
  } catch (e) {
    return json({ ok: false, fallback: true }, 200);
  }
}

function extractJson(text) {
  // Tolerate code fences or stray prose around the JSON.
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (e) { return null; }
}

const VALID_CATS = new Set([
  "mileage", "desk_fees", "mls_dues", "eo_insurance", "marketing", "photo_staging",
  "signage", "client_gifts", "phone_internet", "home_office", "license_edu",
  "office_tech", "meals", "vehicle_actual", "prof_services", "other",
]);

function num(v, max) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= max ? Math.round(n * 100) / 100 : 0;
}

function str(v, max) {
  return String(v == null ? "" : v).trim().slice(0, max);
}

function sanitize(p) {
  if (p.type === "expense") {
    const amount = num(p.amount, 1000000);
    if (!amount) return { type: "unknown" };
    return {
      type: "expense",
      amount,
      vendor: str(p.vendor, 80),
      categoryId: VALID_CATS.has(p.categoryId) ? p.categoryId : "other",
      purpose: str(p.purpose, 140),
      giftFor: str(p.giftFor, 60),
    };
  }
  if (p.type === "drive") {
    const miles = num(p.miles, 2000);
    if (!miles) return { type: "unknown" };
    return {
      type: "drive",
      miles,
      destination: str(p.destination, 80),
      purpose: str(p.purpose, 140) || "Business driving",
    };
  }
  return { type: "unknown" };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
