// GET /api/auth/callback — Google OAuth callback.
// Verifies state, exchanges the code, stores an encrypted Drive refresh token
// (when the Drive scope was granted), and sets the session cookie.
import {
  json, authConfigured, getCookie, signSession, sessionSetCookie,
  exchangeCode, googleUserInfo, grantedScopes, DRIVE_FILE_SCOPE,
  encryptToken, kvGet, kvPut,
} from "../../_lib/auth.js";

const SESSION_DAYS = 30;

export async function onRequest(context) {
  const { request, env } = context;
  if (!authConfigured(env)) {
    return json({ ok: false, error: "Google sign-in is not configured yet." }, 503);
  }
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");
  const cookieState = getCookie(request, "ad_oauth_state");

  if (err) return redirect(url, "/?auth=cancelled");
  if (!code || !state || !cookieState || state !== cookieState) {
    return redirect(url, "/?auth=error");
  }

  try {
    const redirectUri = new URL("/api/auth/callback", url.origin).toString();
    const tokens = await exchangeCode(env, code, redirectUri);
    const info = await googleUserInfo(tokens.access_token);
    if (!info.sub || !info.email) throw new Error("incomplete profile");

    const scopes = grantedScopes(tokens);
    const driveGranted = scopes.indexOf(DRIVE_FILE_SCOPE) >= 0;

    // Keep any existing Drive link if this sign-in didn't include the scope.
    const prev = (await kvGet(env, "user:" + info.sub)) || {};
    let driveLinked = Boolean(prev.driveLinked);
    if (driveGranted && tokens.refresh_token) {
      const packed = await encryptToken(tokens.refresh_token, env.SESSION_SECRET);
      await kvPut(env, "refresh:" + info.sub, { v: packed });
      driveLinked = true;
    }
    await kvPut(env, "user:" + info.sub, {
      email: info.email, name: info.name || "", picture: info.picture || "",
      driveLinked, updatedAt: new Date().toISOString(),
    });

    const now = Math.floor(Date.now() / 1000);
    const session = await signSession(
      { sub: info.sub, email: info.email, name: info.name || "", iat: now, exp: now + SESSION_DAYS * 86400 },
      env.SESSION_SECRET
    );

    const headers = new Headers();
    headers.set("location", new URL("/?auth=done" + (driveGranted ? "&drive=linked" : ""), url.origin).toString());
    headers.append("set-cookie", sessionSetCookie(session, SESSION_DAYS * 86400));
    // Clear the one-time state cookie.
    headers.append("set-cookie", "ad_oauth_state=; Path=/api/auth/callback; Max-Age=0; HttpOnly; Secure; SameSite=Lax");
    headers.set("cache-control", "no-store");
    return new Response(null, { status: 302, headers });
  } catch (e) {
    return redirect(url, "/?auth=error");
  }
}

function redirect(url, to) {
  return Response.redirect(new URL(to, url.origin).toString(), 302);
}
