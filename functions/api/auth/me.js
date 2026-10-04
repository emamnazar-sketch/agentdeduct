// GET /api/auth/me — who is signed in (if anyone).
import { json, authConfigured, getSession, kvGet } from "../../_lib/auth.js";

export async function onRequest(context) {
  const { request, env } = context;
  if (!authConfigured(env)) {
    return json({ authEnabled: false, signedIn: false });
  }
  const session = await getSession(request, env);
  if (!session) {
    return json({ authEnabled: true, signedIn: false });
  }
  const record = (await kvGet(env, "user:" + session.sub)) || {};
  return json({
    authEnabled: true,
    signedIn: true,
    user: {
      email: session.email,
      name: record.name || session.name || "",
      picture: record.picture || "",
    },
    driveLinked: Boolean(record.driveLinked),
  });
}
