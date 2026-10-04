/* AgentDeduct — shared auth/Drive helpers for Cloudflare Pages Functions.
   Google-only sign-in + Google Drive backup. Sessions are HS256 JWTs in an
   HttpOnly cookie; Google refresh tokens are AES-GCM encrypted in KV.
   Reuses the existing AGENTDEDUCT_ACTIVITY KV binding (keys prefixed). */

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export function authConfigured(env) {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.SESSION_SECRET);
}

/* ---------- base64url ---------- */
export function b64urlEncode(bytes) {
  var bin = "";
  var arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (var i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function b64urlDecode(str) {
  var s = String(str).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  var bin = atob(s);
  var out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ---------- keys ---------- */
async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]
  );
}
async function aesKey(secret) {
  var digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("agentdeduct-aes:" + secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/* ---------- session JWT (HS256) ---------- */
export async function signSession(payload, secret) {
  var header = b64urlEncode(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  var body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  var key = await hmacKey(secret);
  var sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(header + "." + body));
  return header + "." + body + "." + b64urlEncode(sig);
}
export async function verifySession(token, secret) {
  try {
    var parts = String(token).split(".");
    if (parts.length !== 3) return null;
    var key = await hmacKey(secret);
    var ok = await crypto.subtle.verify(
      "HMAC", key, b64urlDecode(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1])
    );
    if (!ok) return null;
    var payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
    if (!payload.sub || !payload.exp || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch { return null; }
}

/* ---------- refresh-token encryption (AES-GCM) ---------- */
export async function encryptToken(plaintext, secret) {
  var key = await aesKey(secret);
  var iv = crypto.getRandomValues(new Uint8Array(12));
  var ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return b64urlEncode(iv) + "." + b64urlEncode(ct);
}
export async function decryptToken(packed, secret) {
  var parts = String(packed).split(".");
  if (parts.length !== 2) throw new Error("bad token envelope");
  var key = await aesKey(secret);
  var pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64urlDecode(parts[0]) }, key, b64urlDecode(parts[1])
  );
  return new TextDecoder().decode(pt);
}

/* ---------- cookies ---------- */
export function getCookie(request, name) {
  var header = request.headers.get("cookie") || "";
  var parts = header.split(";");
  for (var i = 0; i < parts.length; i++) {
    var kv = parts[i].split("=");
    if (kv[0] && kv[0].trim() === name) return decodeURIComponent((kv[1] || "").trim());
  }
  return "";
}
export function sessionSetCookie(token, maxAgeSec) {
  return "ad_session=" + encodeURIComponent(token) +
    "; Path=/; Max-Age=" + maxAgeSec + "; HttpOnly; Secure; SameSite=Lax";
}
export function sessionClearCookie() {
  return "ad_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax";
}
export function stateSetCookie(state) {
  return "ad_oauth_state=" + encodeURIComponent(state) +
    "; Path=/api/auth/callback; Max-Age=600; HttpOnly; Secure; SameSite=Lax";
}

export async function getSession(request, env) {
  var token = getCookie(request, "ad_session");
  if (!token) return null;
  return verifySession(token, env.SESSION_SECRET);
}

/* ---------- KV (prefixed, on the shared activity namespace) ---------- */
export async function kvGet(env, key) {
  if (!env.AGENTDEDUCT_ACTIVITY) return null;
  try {
    var raw = await env.AGENTDEDUCT_ACTIVITY.get("auth:" + key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export async function kvPut(env, key, value, ttlSeconds) {
  if (!env.AGENTDEDUCT_ACTIVITY) return;
  var opts = ttlSeconds ? { expirationTtl: ttlSeconds } : undefined;
  await env.AGENTDEDUCT_ACTIVITY.put("auth:" + key, JSON.stringify(value), opts);
}
export async function kvDel(env, key) {
  if (!env.AGENTDEDUCT_ACTIVITY) return;
  await env.AGENTDEDUCT_ACTIVITY.delete("auth:" + key);
}

/* ---------- Google OAuth ---------- */
export var GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export var GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export var GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
export var DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export function randomState() {
  var b = crypto.getRandomValues(new Uint8Array(24));
  return b64urlEncode(b);
}

export function googleAuthUrl(env, opts) {
  // opts: { state, scopes[], redirectUri, driveLink }
  var p = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: opts.scopes.join(" "),
    state: opts.state,
  });
  if (opts.driveLink) {
    // Incremental auth: keep already-granted scopes, force consent so we get a refresh token.
    p.set("access_type", "offline");
    p.set("prompt", "consent");
    p.set("include_granted_scopes", "true");
  }
  return GOOGLE_AUTH_URL + "?" + p.toString();
}

export async function exchangeCode(env, code, redirectUri) {
  var res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri, grant_type: "authorization_code",
    }).toString(),
  });
  if (!res.ok) throw new Error("token exchange failed: " + res.status);
  return res.json(); // { access_token, refresh_token?, expires_in, scope, ... }
}

export async function refreshAccessToken(env, refreshToken) {
  var res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken, client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET, grant_type: "refresh_token",
    }).toString(),
  });
  if (!res.ok) throw new Error("token refresh failed: " + res.status);
  var data = await res.json();
  return data.access_token;
}

export async function googleUserInfo(accessToken) {
  var res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { authorization: "Bearer " + accessToken },
  });
  if (!res.ok) throw new Error("userinfo failed: " + res.status);
  return res.json(); // { sub, email, name, picture }
}

export function grantedScopes(tokenResponse) {
  return String(tokenResponse.scope || "").split(" ");
}

/* ---------- Google Drive ---------- */
export async function driveFetch(accessToken, path, opts) {
  opts = opts || {};
  var res = await fetch("https://www.googleapis.com" + path, {
    method: opts.method || "GET",
    headers: Object.assign({ authorization: "Bearer " + accessToken }, opts.headers || {}),
    body: opts.body,
  });
  if (!res.ok) {
    var txt = "";
    try { txt = await res.text(); } catch {}
    throw new Error("drive api " + res.status + ": " + txt.slice(0, 200));
  }
  var ct = res.headers.get("content-type") || "";
  return ct.indexOf("application/json") >= 0 ? res.json() : res.text();
}

export async function ensureDriveFolder(accessToken, name, parentId) {
  var q = "name='" + name.replace(/'/g, "\\'") + "' and mimeType='application/vnd.google-apps.folder' and trashed=false";
  if (parentId) q += " and '" + parentId + "' in parents";
  var found = await driveFetch(accessToken,
    "/drive/v3/files?q=" + encodeURIComponent(q) + "&fields=files(id,name)&spaces=drive&pageSize=1");
  if (found.files && found.files.length) return found.files[0].id;
  var meta = { name, mimeType: "application/vnd.google-apps.folder" };
  if (parentId) meta.parents = [parentId];
  var created = await driveFetch(accessToken, "/drive/v3/files?fields=id", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(meta),
  });
  return created.id;
}

export async function driveUploadMultipart(accessToken, metadata, bytes, mimeType) {
  var boundary = "ad" + randomState().replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
  var head = "--" + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) + "\r\n--" + boundary + "\r\nContent-Type: " + mimeType + "\r\n\r\n";
  var tail = "\r\n--" + boundary + "--";
  var headB = new TextEncoder().encode(head);
  var tailB = new TextEncoder().encode(tail);
  var body = new Uint8Array(headB.length + bytes.length + tailB.length);
  body.set(headB, 0); body.set(bytes, headB.length); body.set(tailB, headB.length + bytes.length);
  return driveFetch(accessToken, "/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST",
    headers: { "content-type": 'multipart/related; boundary="' + boundary + '"' },
    body,
  });
}

export async function driveFindFile(accessToken, name, parentId) {
  var q = "name='" + name.replace(/'/g, "\\'") + "' and trashed=false and '" + parentId + "' in parents";
  var found = await driveFetch(accessToken,
    "/drive/v3/files?q=" + encodeURIComponent(q) + "&fields=files(id,name)&spaces=drive&pageSize=1");
  return (found.files && found.files[0]) || null;
}

export async function driveUpdateMedia(accessToken, fileId, bytes, mimeType) {
  return driveFetch(accessToken, "/upload/drive/v3/files/" + fileId + "?uploadType=media&fields=id", {
    method: "PATCH", headers: { "content-type": mimeType }, body: bytes,
  });
}

export function dataUrlToBytes(dataUrl) {
  var m = String(dataUrl).match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!m) throw new Error("bad data url");
  var mime = m[1] || "application/octet-stream";
  var bin = atob(m[3]);
  var bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mime, bytes };
}
