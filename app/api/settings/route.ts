import { route, json, body, BadRequest } from '@/lib/route';
import { setSetting } from '@/lib/db';
import { LOCK_CHOICES, lockMinutes } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import type { PinType } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const GET = route('GET /api/settings', () => json({ lockMinutes: lockMinutes(), lockChoices: LOCK_CHOICES }));

export const PATCH = route('PATCH /api/settings', async (req, auth) => {
  const b = await body(req);
  if (b.lockMinutes !== undefined) {
    const n = Number(b.lockMinutes);
    if (!(LOCK_CHOICES as readonly number[]).includes(n)) throw new BadRequest(`Lock time is one of ${LOCK_CHOICES.join(', ')} minutes.`);
    const before = lockMinutes();
    setSetting('lock_minutes', String(n));
    if (before !== n)
      logActivity({ pinType: auth.role as PinType, device: auth.device, action: 'settings.lock_minutes', summary: `Changed the app lock time from ${before} to ${n} min` });
  }
  return json({ lockMinutes: lockMinutes() });
});
