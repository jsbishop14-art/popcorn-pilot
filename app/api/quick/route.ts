import { route, json } from '@/lib/route';
import { viewerFor } from '@/lib/catalog';
import { clearQuick, getPlaylist, quickRow } from '@/lib/playlists';
import { allTvViews } from '@/lib/playback';
import { logActivity } from '@/lib/activity';
import type { PinType } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// The quick playlist (not saved), for the "Showing for" profile, and the TVs playing it.
export const GET = route('GET /api/quick', (req, auth) => {
  const viewer = viewerFor(auth, new URL(req.url).searchParams.get('profile'));
  const r = quickRow();
  const quick = r ? getPlaylist(r.id, viewer) : null;
  const playingOn = r ? allTvViews().filter((t) => t.playback?.playlistId === r.id).map((t) => ({ id: t.tv.id, name: t.tv.name })) : [];
  return json({ quick, playingOn });
});

// Clear the quick playlist. Anything already playing from it keeps playing.
export const DELETE = route('DELETE /api/quick', (_req, auth) => {
  const cleared = clearQuick();
  if (cleared) logActivity({ pinType: auth.role as PinType, device: auth.device, action: 'quick.clear', summary: 'Cleared the quick playlist' });
  return json({ ok: true, cleared });
});
