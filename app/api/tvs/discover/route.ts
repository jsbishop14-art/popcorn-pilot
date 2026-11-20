import { route, json } from '@/lib/route';
import { discoverRokus } from '@/lib/devices/discovery';
import { listTvs } from '@/lib/tvs';

export const dynamic = 'force-dynamic';

// Find Rokus on the home network. Already-added ones are marked.
export const POST = route('POST /api/tvs/discover', async () => {
  const added = new Set(listTvs().map((t) => `${t.address}:${t.port}`));
  const found = (await discoverRokus()).map((f) => ({ ...f, added: added.has(`${f.address}:${f.port}`) }));
  return json({ found });
});
