import { route, json } from '@/lib/route';
import { similar, viewerFor } from '@/lib/catalog';

export const dynamic = 'force-dynamic';

// More like this. ?profile=<id>
export const GET = route('GET /api/catalog/titles/[id]/similar', async (req, auth, ctx) => {
  const viewer = viewerFor(auth, new URL(req.url).searchParams.get('profile'));
  return json({ titles: await similar(viewer, ctx.params.id) });
});
