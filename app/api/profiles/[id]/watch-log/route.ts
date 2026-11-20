import { route, json, idParam } from '@/lib/route';
import { watchWeek } from '@/lib/safeguards';
import { now } from '@/lib/clock';

export const dynamic = 'force-dynamic';

// One week of a kid's watch log (?week=YYYY-MM-DD, any day of that week; default this week).
export const GET = route('GET /api/profiles/[id]/watch-log', (req, _auth, ctx) => {
  const week = new URL(req.url).searchParams.get('week') ?? undefined;
  return json({ log: watchWeek(idParam(ctx), now(), week) });
});
