import Link from 'next/link';
import { PageTop } from '@/components/Page';
import Dashboard from '@/components/Dashboard';
import { DashboardRequests } from '@/components/RequestsScreen';
import { allTvViews } from '@/lib/playback';
import { listProfiles } from '@/lib/profiles';
import { listRequests } from '@/lib/requests';
import { alertsToday, listAlerts } from '@/lib/safeguards';
import { pageAuth } from '@/lib/server-auth';
import { now } from '@/lib/clock';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const auth = pageAuth();
  const isAdult = auth.role === 'adult';
  const at = now();
  const profiles = listProfiles().map((p) => ({ id: p.id, name: p.name, kid: p.type === 'kid' }));
  // Requests and alerts are for the Adult PIN only (the Guest PIN cannot approve; the hub refuses it too).
  const today = isAdult ? alertsToday(at) : 0;
  const latest = isAdult && today ? listAlerts({ limit: 1 })[0] : null;
  const top = isAdult ? (
    <>
      <DashboardRequests initial={listRequests(at)} />
      {latest && (
        <section className="card" aria-label="Alerts">
          <div className="row">
            <h2 className="h2">
              {today} alert{today === 1 ? '' : 's'} today
            </h2>
            <Link href="/profiles/alerts">See all</Link>
          </div>
          <div className="col">
            <span className="t">{latest.title}</span>
            <span className="s">
              {latest.detail} · {latest.time}
            </span>
          </div>
        </section>
      )}
    </>
  ) : null;
  return (
    <>
      <PageTop title="Home" />
      <main className="main">
        <Dashboard initial={allTvViews()} isAdult={isAdult} profiles={profiles} requests={top} />
      </main>
    </>
  );
}
