// POST /api/drive/sync — back up the agent's data to their Google Drive.
// Body: { snapshot: <db object>, receipts: [{ id, name, dataUrl }] }
// Creates/updates an "AgentDeduct" folder (only the app's own files — the
// drive.file scope can't see anything else), writes agentdeduct-backup.json,
// and uploads receipt photos it hasn't seen before (deduped in KV).
import {
  json, authConfigured, getSession, kvGet, kvPut,
  decryptToken, refreshAccessToken,
  driveFetch, driveFindFile, driveUploadMultipart, driveUpdateMedia,
  ensureDriveFolder, dataUrlToBytes,
} from "../../_lib/auth.js";

const BACKUP_NAME = "agentdeduct-backup.json";
const FOLDER_NAME = "AgentDeduct";
const RECEIPTS_FOLDER = "Receipts";
const MAX_BODY_BYTES = 40 * 1024 * 1024;

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  if (!authConfigured(env)) return json({ ok: false, error: "not configured" }, 503);
  const session = await getSession(request, env);
  if (!session) return json({ ok: false, error: "not signed in" }, 401);

  const stored = await kvGet(env, "refresh:" + session.sub);
  if (!stored || !stored.v) {
    return json({ ok: false, error: "drive_not_linked", message: "Link Google Drive first." }, 409);
  }

  let body;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json({ ok: false, error: "backup too large" }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "invalid JSON body" }, 400);
  }
  const snapshot = body.snapshot && typeof body.snapshot === "object" ? body.snapshot : null;
  const receipts = Array.isArray(body.receipts) ? body.receipts.slice(0, 500) : [];
  if (!snapshot) return json({ ok: false, error: "snapshot is required" }, 400);

  try {
    const refreshToken = await decryptToken(stored.v, env.SESSION_SECRET);
    const accessToken = await refreshAccessToken(env, refreshToken);

    const folderId = await ensureDriveFolder(accessToken, FOLDER_NAME);
    const receiptsId = await ensureDriveFolder(accessToken, RECEIPTS_FOLDER, folderId);

    // 1) Backup JSON — update in place when it already exists.
    const payload = JSON.stringify({
      app: "AgentDeduct", version: 2, exportedAt: new Date().toISOString(),
      email: session.email, data: snapshot,
    });
    const bytes = new TextEncoder().encode(payload);
    const existing = await driveFindFile(accessToken, BACKUP_NAME, folderId);
    if (existing) {
      await driveUpdateMedia(accessToken, existing.id, bytes, "application/json");
    } else {
      await driveUploadMultipart(accessToken,
        { name: BACKUP_NAME, parents: [folderId], mimeType: "application/json" },
        bytes, "application/json");
    }

    // 2) Receipts — skip ones already uploaded (KV dedupe by receipt id).
    let uploaded = 0, skipped = 0;
    for (const r of receipts) {
      const rid = String((r && r.id) || "").slice(0, 120);
      const dataUrl = r && r.dataUrl;
      if (!rid || !dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) { skipped++; continue; }
      const seen = await kvGet(env, "drive:receipt:" + session.sub + ":" + rid);
      if (seen && seen.fileId) { skipped++; continue; }
      try {
        const { mime, bytes: img } = dataUrlToBytes(dataUrl);
        const safeName = String(r.name || ("receipt-" + rid + ".jpg")).replace(/[^\w.\- ]+/g, "_").slice(0, 120);
        const up = await driveUploadMultipart(accessToken,
          { name: safeName, parents: [receiptsId] }, img, mime);
        await kvPut(env, "drive:receipt:" + session.sub + ":" + rid, { fileId: up.id });
        uploaded++;
      } catch { skipped++; }
    }

    const meta = (await kvGet(env, "drive:meta:" + session.sub)) || {};
    const receiptsBackedUp = (meta.receiptsBackedUp || 0) + uploaded;
    await kvPut(env, "drive:meta:" + session.sub, {
      folderId, lastSync: new Date().toISOString(), receiptsBackedUp,
    });

    return json({ ok: true, folderId, backupUpdated: true, receiptsUploaded: uploaded, receiptsSkipped: skipped });
  } catch (e) {
    const msg = String((e && e.message) || "sync failed");
    // Token revoked or expired beyond refresh → tell the client to re-link.
    if (/40[01]/.test(msg)) {
      return json({ ok: false, error: "drive_not_linked", message: "Please link Google Drive again." }, 409);
    }
    return json({ ok: false, error: "sync failed" }, 502);
  }
}
