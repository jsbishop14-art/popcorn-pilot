import { route, json } from '@/lib/route';
import { catalogSourceName, details, viewerFor } from '@/lib/catalog';

export const dynamic = 'force-dynamic';

// ?profile=<id>. A title the profile may not see answers 404.
export const GET = route('GET /api/catalog/titles/[id]', async (req, auth, ctx) => {
  const viewer = viewerFor(auth, new URL(req.url).searchParams.get('profile'));
  return json({ source: catalogSourceName(), title: await details(viewer, ctx.params.id) });
});
