import { route, json, fail } from '@/lib/route';
import { getTv } from '@/lib/tvs';
import { channelHome } from '@/lib/channel';

export const dynamic = 'force-dynamic';

// The TV home screen data for the channel's own TV (channel arrives in PP6).
export const GET = route('GET /api/channel/home', (_req, auth) => {
  const tv = auth.tvId ? getTv(auth.tvId) : null;
  if (!tv) return fail(401, 'Unknown TV.');
  return json(channelHome(tv));
});
