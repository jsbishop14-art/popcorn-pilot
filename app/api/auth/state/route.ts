import { route, json } from '@/lib/route';
import { isSetUp, lockMinutes, lockState } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Public: what PIN entry needs to know. Counts as use for a signed-in session (the app pings it while in use).
export const GET = route('GET /api/auth/state', (_req, auth) => {
  const lock = lockState();
  const now = Date.now();
  return json({
    setUp: isSetUp(),
    role: auth.role,
    idleLocked: Boolean(auth.idleLocked),
    lockMinutes: auth.role === 'adult' || auth.role === 'guest' ? lockMinutes() : null,
    lockedUntil: lock.locked_until > now ? lock.locked_until : null,
  });
});
