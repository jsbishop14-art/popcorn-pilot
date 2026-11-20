import { AdultOnly, PageTop } from '@/components/Page';
import RoutinesScreen from '@/components/RoutinesScreen';
import { listRoutines } from '@/lib/routines';
import { getTv } from '@/lib/tvs';
import { pageAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export default function RoutinesPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  if (pageAuth().role !== 'adult') return <AdultOnly />;
  const n = Number(searchParams.tv);
  const tv = Number.isInteger(n) && n > 0 ? getTv(n) : null;
  return (
    <>
      <PageTop title="Routines" back={tv ? '/home' : '/playlists'} />
      <RoutinesScreen initial={listRoutines()} tv={tv ? { id: tv.id, name: tv.name } : null} />
    </>
  );
}
