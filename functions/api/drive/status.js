// GET /api/drive/status — is Google Drive linked? When was the last backup?
import { json, authConfigured, getSession, kvGet } from "../../_lib/auth.js";

export async function onRequest(context) {
  const { request, env } = context;
  if (!authConfigured(env)) return json({ ok: false, error: "not configured" }, 503);
  const session = await getSession(request, env);
  if (!session) return json({ ok: false, error: "not signed in" }, 401);

  const user = (await kvGet(env, "user:" + session.sub)) || {};
  const meta = (await kvGet(env, "drive:meta:" + session.sub)) || {};
  return json({
    ok: true,
    linked: Boolean(user.driveLinked),
    folderId: meta.folderId || null,
    lastSync: meta.lastSync || null,
    receiptsBackedUp: meta.receiptsBackedUp || 0,
  });
}
