import { route, json } from '@/lib/route';
import { browse, catalogSourceName, parseBrowseQuery, viewerFor } from '@/lib/catalog';

export const dynamic = 'force-dynamic';

// ?service=all|netflix|prime|hulu&kind=all|show|movie&q=<search>&profile=<id>
export const GET = route('GET /api/catalog/browse', async (req, auth) => {
  const url = new URL(req.url);
  const viewer = viewerFor(auth, url.searchParams.get('profile'));
  const rows = await browse(viewer, parseBrowseQuery(url));
  return json({ source: catalogSourceName(), profile: viewer.profileId, kidFilter: viewer.kid, rows });
});
