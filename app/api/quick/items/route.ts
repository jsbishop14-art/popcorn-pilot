import { route, json, body } from '@/lib/route';
import { viewerFor } from '@/lib/catalog';
import { actorOf, quickAdd } from '@/lib/playback';

export const dynamic = 'force-dynamic';

// Add a title to the quick playlist (Start quick playlist in Browse). Body: { titleKey, service?, profile, mode?,
// episodes?, minutes?, startFrom? }. The kid rules of `profile` apply. Answers first: true for the first pick, so
// the app asks whether to start now.
export const POST = route('POST /api/quick/items', async (req, auth) => {
  const b = await body(req);
  const viewer = viewerFor(auth, b.profile);
  const r = await quickAdd(actorOf(auth), viewer, b);
  return json(r, 201);
});
