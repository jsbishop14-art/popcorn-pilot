import { route, json, fail, body } from '@/lib/route';
import { changePin, checkPin, type PinType } from '@/lib/auth';
import { readSecrets } from '@/lib/secrets';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';

// Change the Adult PIN or the Guest PIN. Needs the current Adult PIN again.
export const POST = route('POST /api/settings/pins', async (req, auth) => {
  const b = await body(req);
  const which = b.which;
  if (which !== 'adult' && which !== 'guest') return fail(400, 'Say which PIN: adult or guest.');
  if (!(await checkPin(String(b.currentAdultPin ?? ''), readSecrets().adult_pin_hash))) return fail(403, 'The current Adult PIN is wrong.');
  const r = await changePin(which, b.newPin);
  if (r.status === 'invalid') return fail(400, r.message);
  logActivity({ pinType: auth.role as PinType, device: auth.device, action: `pin.change_${which}`, summary: `Changed the ${which === 'adult' ? 'Adult' : 'Guest'} PIN` });
  return json({ ok: true });
});
