import { route, fail } from '@/lib/route';
import { readArt } from '@/lib/catalog/art';

export const dynamic = 'force-dynamic';

// Cover art, served from the hub (stub posters, or TMDB posters cached on the hub).
export const GET = route('GET /api/catalog/art/[id]', async (_req, _auth, ctx) => {
  const art = await readArt(ctx.params.id);
  if (!art) return fail(404, 'No such picture.');
  return new Response(new Uint8Array(art.body), {
    headers: {
      'content-type': art.type,
      'cache-control': 'private, max-age=86400',
      // The SVG posters are pictures only: no scripts, no outside loads.
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
      'x-content-type-options': 'nosniff',
    },
  });
});
