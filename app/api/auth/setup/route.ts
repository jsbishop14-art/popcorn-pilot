import { route, json, fail, body } from '@/lib/route';
import { setUpPins } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// First run: set both PINs. Refused once they are set.
export const POST = route('POST /api/auth/setup', async (req, auth) => {
  const b = await body(req);
  const r = await setUpPins(b.adultPin, b.guestPin, auth.device);
  if (r.status === 'already_set_up') return fail(409, 'The PINs are already set. Change them in Settings.');
  if (r.status === 'invalid') return fail(400, r.message);
  return json({ ok: true });
});
