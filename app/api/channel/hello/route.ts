import { route, json, fail } from '@/lib/route';
import { getTv } from '@/lib/tvs';
import { listProfiles } from '@/lib/profiles';

export const dynamic = 'force-dynamic';

// The Roku channel's first call (channel arrives in PP6): which TV it is, and the profiles for the picker.
export const GET = route('GET /api/channel/hello', (_req, auth) => {
  const tv = auth.tvId ? getTv(auth.tvId) : null;
  if (!tv) return fail(401, 'Unknown TV.');
  return json({
    tv: { id: tv.id, name: tv.name, room: tv.room, defaultProfileId: tv.defaultProfileId },
    profiles: listProfiles().map((p) => ({ id: p.id, name: p.name, color: p.color, initial: p.initial, type: p.type })),
  });
});
