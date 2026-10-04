// GET /api/auth/login — start Google sign-in.
// ?scope=drive → incremental auth round-trip that adds Google Drive access.
import {
  json, authConfigured, randomState, googleAuthUrl, stateSetCookie, DRIVE_FILE_SCOPE,
} from "../../_lib/auth.js";

export async function onRequest(context) {
  const { request, env } = context;
  if (!authConfigured(env)) {
    return json({ ok: false, error: "Google sign-in is not configured yet." }, 503);
  }
  const url = new URL(request.url);
  const driveLink = url.searchParams.get("scope") === "drive";
  const redirectUri = new URL("/api/auth/callback", url.origin).toString();
  const state = randomState();
  const scopes = driveLink
    ? ["openid", "email", "profile", DRIVE_FILE_SCOPE]
    : ["openid", "email", "profile"];
  const authUrl = googleAuthUrl(env, { state, scopes, redirectUri, driveLink });

  const headers = new Headers();
  headers.set("location", authUrl);
  headers.append("set-cookie", stateSetCookie(state));
  headers.set("cache-control", "no-store");
  return new Response(null, { status: 302, headers });
}
