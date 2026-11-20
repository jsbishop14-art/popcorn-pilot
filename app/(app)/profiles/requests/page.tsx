import { AdultOnly, PageTop } from '@/components/Page';
import RequestsScreen from '@/components/RequestsScreen';
import { listRequests } from '@/lib/requests';
import { pageAuth } from '@/lib/server-auth';
import { now } from '@/lib/clock';

export const dynamic = 'force-dynamic';

export default function RequestsPage() {
  if (pageAuth().role !== 'adult') return <AdultOnly />;
  return (
    <>
      <PageTop title="Requests" back="/profiles" />
      <RequestsScreen initial={listRequests(now())} />
    </>
  );
}
