import { route, json, body, BadRequest, HttpError } from '@/lib/route';
import { adBlockStatus, setAdBlocking } from '@/lib/adblock';
import { logActivity } from '@/lib/activity';
import type { PinType } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Ad blocking (Settings): on or off and the requests blocked today, from AdGuard Home on the hub. Adult PIN only.
export const GET = route('GET /api/adblock', async () => json({ adblock: await adBlockStatus() }));

export const PATCH = route('PATCH /api/adblock', async (req, auth) => {
  const b = await body(req);
  if (typeof b.on !== 'boolean') throw new BadRequest('Say on: true or on: false.');
  let adblock;
  try {
    adblock = await setAdBlocking(b.on);
  } catch (err) {
    throw new HttpError(502, err instanceof Error ? err.message : 'Ad blocking did not answer.');
  }
  logActivity({ pinType: auth.role as PinType, device: auth.device, action: 'adblock.set', summary: `Turned ad blocking ${b.on ? 'on' : 'off'}` });
  return json({ adblock });
});
