import { route, json, body } from '@/lib/route';
import { viewerFor } from '@/lib/catalog';
import { createPlaylist, listPlaylists } from '@/lib/playlists';
import { logActivity } from '@/lib/activity';
import type { PinType } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Saved playlists, for the "Showing for" profile (?profile=). A kid profile sees only the titles its rules allow.
export const GET = route('GET /api/playlists', (req, auth) => {
  const viewer = viewerFor(auth, new URL(req.url).searchParams.get('profile'));
  return json({ playlists: listPlaylists(viewer) });
});

// New playlist. Body: { name }.
export const POST = route('POST /api/playlists', async (req, auth) => {
  const b = await body(req);
  const p = createPlaylist({ name: b.name });
  logActivity({ pinType: auth.role as PinType, device: auth.device, action: 'playlist.create', summary: `Made the playlist ${p.name}` });
  return json({ playlist: p }, 201);
});
