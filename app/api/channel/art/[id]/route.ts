import { route, fail } from '@/lib/route';
import { readArt } from '@/lib/catalog/art';

export const dynamic = 'force-dynamic';

// Cover art for the TV (PP6): the same pictures as GET /api/catalog/art/[id], for the channel token.
export const GET = route('GET /api/channel/art/[id]', async (_req, _auth, ctx) => {
  const art = await readArt(ctx.params.id);
  if (!art) return fail(404, 'No such picture.');
  return new Response(new Uint8Array(art.body), {
    headers: {
      'content-type': art.type,
      'cache-control': 'private, max-age=86400',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
      'x-content-type-options': 'nosniff',
    },
  });
});
