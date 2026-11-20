import { route, json } from '@/lib/route';
import { clearedSessionCookie, endSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Lock the app now (lock button, or the app's idle timer).
export const POST = route('POST /api/auth/lock', (_req, auth) => {
  if (auth.sessionId) endSession(auth.sessionId);
  return json({ ok: true }, 200, { 'set-cookie': clearedSessionCookie() });
});
