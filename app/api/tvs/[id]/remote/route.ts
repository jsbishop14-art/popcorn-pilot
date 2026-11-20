import { route, json, body, idParam } from '@/lib/route';
import { actorOf, remote } from '@/lib/playback';

export const dynamic = 'force-dynamic';

// A TV remote button. Body: { key } (Up, Down, Left, Right, Select, Back, Play, VolumeUp, VolumeDown, VolumeMute,
// PowerOn, PowerOff).
export const POST = route('POST /api/tvs/[id]/remote', async (req, auth, ctx) => {
  const b = await body(req);
  const words = await remote(actorOf(auth), idParam(ctx), b.key);
  return json({ ok: true, message: words });
});
