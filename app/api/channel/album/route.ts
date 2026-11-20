import { route, json, fail } from '@/lib/route';
import { getTv } from '@/lib/tvs';
import { albumEntries } from '@/lib/album';

export const dynamic = 'force-dynamic';

// The Family Album for the TV (PP6): its photos and clips in a random order (the album plays shuffled), each with
// the address the channel loads it from (with its channel token).
export const GET = route('GET /api/channel/album', (_req, auth) => {
  const tv = auth.tvId ? getTv(auth.tvId) : null;
  if (!tv) return fail(401, 'Unknown TV.');
  return json({ items: albumEntries() });
});
