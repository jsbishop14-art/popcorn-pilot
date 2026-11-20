import { route, json, body } from '@/lib/route';
import { endSession, sessionCookie, signInWithPin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const POST = route('POST /api/auth/pin', async (req, auth) => {
  const b = await body(req);
  const r = await signInWithPin(String(b.pin ?? ''), auth.device);
  if (r.status === 'not_set_up') return json({ error: 'Set the PINs first.', setUp: false }, 409);
  if (r.status === 'locked') return json({ error: 'Too many wrong tries. Wait 1 minute.', lockedUntil: r.lockedUntil }, 429);
  if (r.status === 'wrong') return json({ error: 'Wrong PIN.', triesLeft: r.triesLeft }, 401);
  if (auth.sessionId) endSession(auth.sessionId);
  return json({ ok: true, role: r.pinType }, 200, { 'set-cookie': sessionCookie(r.token) });
});
