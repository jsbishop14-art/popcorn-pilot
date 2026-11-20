import { route, json, body, BadRequest } from '@/lib/route';
import { setSetting } from '@/lib/db';
import { LOCK_CHOICES, lockMinutes } from '@/lib/auth';
import { logActivity } from '@/lib/activity';
import { readSecrets, updateSecrets } from '@/lib/secrets';
import { calmCount, catalogSourceName, validTmdbKey } from '@/lib/catalog';
import type { PinType } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** The catalog part of Settings. The TMDB key itself never leaves the secret store. */
function catalog() {
  return { source: catalogSourceName(), tmdbKeySet: Boolean(readSecrets().tmdb_api_key), calmCount: calmCount() };
}

export const GET = route('GET /api/settings', () => json({ lockMinutes: lockMinutes(), lockChoices: LOCK_CHOICES, catalog: catalog() }));

export const PATCH = route('PATCH /api/settings', async (req, auth) => {
  const b = await body(req);
  if (b.lockMinutes !== undefined) {
    const n = Number(b.lockMinutes);
    if (!(LOCK_CHOICES as readonly number[]).includes(n)) throw new BadRequest(`Lock time is one of ${LOCK_CHOICES.join(', ')} minutes.`);
    const before = lockMinutes();
    setSetting('lock_minutes', String(n));
    if (before !== n)
      logActivity({ pinType: auth.role as PinType, device: auth.device, action: 'settings.lock_minutes', summary: `Changed the app lock time from ${before} to ${n} min` });
  }
  if (b.tmdbKey !== undefined) {
    if (b.tmdbKey === null) {
      if (readSecrets().tmdb_api_key) {
        updateSecrets({ tmdb_api_key: undefined });
        logActivity({ pinType: auth.role as PinType, device: auth.device, action: 'settings.tmdb_key', summary: 'Removed the TMDB key (the built-in sample catalog is used)' });
      }
    } else {
      const key = typeof b.tmdbKey === 'string' ? b.tmdbKey.trim() : '';
      if (!validTmdbKey(key)) throw new BadRequest('That does not look like a TMDB key. Use the API key (32 letters and numbers) or the read access token.');
      updateSecrets({ tmdb_api_key: key });
      logActivity({ pinType: auth.role as PinType, device: auth.device, action: 'settings.tmdb_key', summary: 'Saved a TMDB key (titles now come from TMDB)' });
    }
  }
  return json({ lockMinutes: lockMinutes(), catalog: catalog() });
});
