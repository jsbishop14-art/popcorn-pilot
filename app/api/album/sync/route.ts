import { route, json } from '@/lib/route';
import { albumStatus, syncAlbum } from '@/lib/album';

export const dynamic = 'force-dynamic';

// Sync the Family Album now (Settings). Waits for the sync; a link that does not work comes back as a result with
// the error in plain words (and stays in Settings), never as a crash.
export const POST = route('POST /api/album/sync', async (_req, auth) => {
  // The route is for the Adult PIN only.
  const result = await syncAlbum({ pinType: 'adult', device: auth.device });
  return json({ result, album: albumStatus() });
});
