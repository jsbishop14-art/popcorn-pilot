import { route, json, body } from '@/lib/route';
import { addTv, guestView, listTvs } from '@/lib/tvs';
import { logActivity } from '@/lib/activity';
import type { PinType } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const GET = route('GET /api/tvs', (_req, auth) => {
  const tvs = listTvs();
  return json({ tvs: auth.role === 'adult' ? tvs : tvs.map(guestView) });
});

export const POST = route('POST /api/tvs', async (req, auth) => {
  const tv = await addTv(await body(req));
  logActivity({
    pinType: auth.role as PinType,
    device: auth.device,
    action: 'tv.add',
    summary: `Added TV ${tv.name} at ${tv.address}${tv.port === 8060 ? '' : `:${tv.port}`}${tv.online ? '' : ' (offline)'}`,
  });
  return json({ tv }, 201);
});
