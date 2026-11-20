import { route, json, idParam } from '@/lib/route';
import { pairChannel } from '@/lib/channel';

export const dynamic = 'force-dynamic';

// Pair this TV's Popcorn Pilot channel (PP6): a new channel token, handed to the channel on the TV with the hub
// address. Adult PIN only (Settings). The token is never shown or logged.
export const POST = route('POST /api/tvs/[id]/pair', async (_req, auth, ctx) => {
  const message = await pairChannel(idParam(ctx), { pinType: 'adult', device: auth.device });
  return json({ ok: true, message });
});
