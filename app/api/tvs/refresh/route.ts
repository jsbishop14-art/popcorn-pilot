import { route, json } from '@/lib/route';
import { guestView, refreshTvs } from '@/lib/tvs';

export const dynamic = 'force-dynamic';

// Check which TVs are online now.
export const POST = route('POST /api/tvs/refresh', async (_req, auth) => {
  const tvs = await refreshTvs();
  return json({ tvs: auth.role === 'adult' ? tvs : tvs.map(guestView) });
});
