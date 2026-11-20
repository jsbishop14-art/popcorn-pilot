import { route, json } from '@/lib/route';
import { allTvViews } from '@/lib/playback';

export const dynamic = 'force-dynamic';

// Each TV with what it is playing, progress, the live queue and any message (Dashboard, Live queue, Remote).
export const GET = route('GET /api/playback', () => json({ tvs: allTvViews() }));
