import { AdultOnly, PageTop } from '@/components/Page';
import ActivityList from '@/components/ActivityList';
import { listActivity } from '@/lib/activity';
import { pageAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export default function ActivityPage() {
  if (pageAuth().role !== 'adult') return <AdultOnly />;
  const items = listActivity().map((a) => ({ ...a, pin_type: a.pin_type as 'adult' | 'guest' | 'kid' | 'hub' }));
  return (
    <>
      <PageTop title="Activity history" back="/settings" />
      <ActivityList initial={items} />
    </>
  );
}
