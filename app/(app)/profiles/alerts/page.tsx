import { AdultOnly, PageTop } from '@/components/Page';
import AlertsScreen from '@/components/AlertsScreen';
import { listAlerts } from '@/lib/safeguards';
import { listTvs } from '@/lib/tvs';
import { pageAuth } from '@/lib/server-auth';
import { now } from '@/lib/clock';

export const dynamic = 'force-dynamic';

export default function AlertsPage() {
  if (pageAuth().role !== 'adult') return <AdultOnly />;
  return (
    <>
      <PageTop title="Alerts" back="/profiles" />
      <AlertsScreen alerts={listAlerts({ limit: 200 })} tvs={listTvs().map((t) => ({ id: t.id, name: t.name }))} now={now()} />
    </>
  );
}
