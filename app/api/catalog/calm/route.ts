import { route, json } from '@/lib/route';
import { taggedTitles } from '@/lib/catalog';

export const dynamic = 'force-dynamic';

// The calm titles list for Settings (Adult PIN).
export const GET = route('GET /api/catalog/calm', () => json({ titles: taggedTitles('calm') }));
