import { route, json, fail } from '@/lib/route';
import { getTv } from '@/lib/tvs';
import { channelNowPlaying } from '@/lib/channel';

export const dynamic = 'force-dynamic';

// Now playing and up next for the channel's own TV (the Now playing bridge screen, PP6).
export const GET = route('GET /api/channel/now-playing', (_req, auth) => {
  const tv = auth.tvId ? getTv(auth.tvId) : null;
  if (!tv) return fail(401, 'Unknown TV.');
  return json(channelNowPlaying(tv));
});
