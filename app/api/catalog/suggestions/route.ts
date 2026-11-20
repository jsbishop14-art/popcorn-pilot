import { route, json } from '@/lib/route';
import { suggestions, viewerFor } from '@/lib/catalog';

export const dynamic = 'force-dynamic';

// ?profile=<id>&calm=1. Rule based: similar titles, then popular titles; filtered by the profile and the services.
export const GET = route('GET /api/catalog/suggestions', async (req, auth) => {
  const url = new URL(req.url);
  const viewer = viewerFor(auth, url.searchParams.get('profile'));
  const r = await suggestions(viewer, { calm: url.searchParams.get('calm') === '1' });
  return json({ profile: viewer.profileId, kidFilter: viewer.kid, ...r });
});
