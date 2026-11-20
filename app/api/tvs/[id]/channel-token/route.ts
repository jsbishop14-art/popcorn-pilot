import { route, json, fail, idParam } from '@/lib/route';
import { getTv, newChannelToken } from '@/lib/tvs';
import { logActivity } from '@/lib/activity';
import type { PinType } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// A new pairing token for this TV's Popcorn Pilot channel (the channel arrives in PP6). Shown once.
export const POST = route('POST /api/tvs/[id]/channel-token', (_req, auth, ctx) => {
  const id = idParam(ctx);
  const token = newChannelToken(id);
  if (!token) return fail(404, 'No such TV.');
  logActivity({ pinType: auth.role as PinType, device: auth.device, action: 'tv.channel_token', summary: `Made a new channel token for ${getTv(id)?.name}` });
  return json({ token });
});
