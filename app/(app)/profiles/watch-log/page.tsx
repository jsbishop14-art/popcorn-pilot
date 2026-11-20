import { AdultOnly, PageTop } from '@/components/Page';
import WatchLogScreen from '@/components/WatchLogScreen';
import { kidSummaries } from '@/lib/kid-views';
import { watchWeek } from '@/lib/safeguards';
import { pageAuth } from '@/lib/server-auth';
import { now } from '@/lib/clock';

export const dynamic = 'force-dynamic';

export default function WatchLogPage() {
  if (pageAuth().role !== 'adult') return <AdultOnly />;
  const at = now();
  const kids = kidSummaries(at).map((k) => ({ id: k.id, name: k.name }));
  return (
    <>
      <PageTop title="Watch log" back="/profiles" />
      <WatchLogScreen kids={kids} initial={kids.length ? watchWeek(kids[0].id, at) : null} />
    </>
  );
}
