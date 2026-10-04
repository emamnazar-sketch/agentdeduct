// GET /api/auth/logout — clear the session cookie and go home.
import { sessionClearCookie } from "../../_lib/auth.js";

export async function onRequest() {
  const headers = new Headers();
  headers.set("location", "/");
  headers.append("set-cookie", sessionClearCookie());
  headers.set("cache-control", "no-store");
  return new Response(null, { status: 302, headers });
}
