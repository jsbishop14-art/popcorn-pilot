// Profiles list (mockup Profiles), with each kid's time today and the kid tools (PP4): Earn time tasks, Requests,
// Watch log, Alerts.
import Link from 'next/link';
import { AdultOnly, PageTop } from '@/components/Page';
import { ChevronIcon, PlusIcon } from '@/components/icons';
import { TimeBar } from '@/components/KidUi';
import { listProfiles } from '@/lib/profiles';
import { pageAuth } from '@/lib/server-auth';
import { kidSummaries } from '@/lib/kid-views';
import { listTasks, pendingCount } from '@/lib/requests';
import { alertsToday, kidRules } from '@/lib/safeguards';
import { durationWords } from '@/lib/playlists';
import { now } from '@/lib/clock';

export const dynamic = 'force-dynamic';

export default function ProfilesPage() {
  if (pageAuth().role !== 'adult') return <AdultOnly />;
  const at = now();
  const profiles = listProfiles();
  const kids = new Map(kidSummaries(at).map((k) => [k.id, k]));
  const tasks = listTasks();
  // The weekly cap is per kid; the line shows it when every kid has the same one.
  const caps = [...new Set([...kids.keys()].map((id) => kidRules(id)?.weeklyBonusCap ?? 0))];
  const waiting = pendingCount();
  const alerts = alertsToday(at);
  const tools = [
    { href: '/profiles/tasks', t: 'Earn time tasks', s: `${tasks.length} task${tasks.length === 1 ? '' : 's'}${caps.length === 1 ? ` · ${durationWords(caps[0])} weekly cap` : ''}`, n: 0 },
    { href: '/profiles/requests', t: 'Requests', s: waiting ? `${waiting} waiting` : 'None waiting', n: waiting },
    { href: '/profiles/watch-log', t: 'Watch log', s: 'Weekly totals', n: 0 },
    { href: '/profiles/alerts', t: 'Alerts', s: `${alerts} today`, n: 0 },
  ];
  return (
    <>
      <PageTop title="Profiles" />
      <main className="main">
        {!profiles.length && (
          <div className="card">
            <span className="t">No profiles yet</span>
            <span className="s">Add one for each person who watches. Kid profiles get safeguards.</span>
          </div>
        )}
        {profiles.map((p) => {
          const k = kids.get(p.id);
          return (
            <Link key={p.id} href={`/profiles/${p.id}`} className="card cardlink" aria-label={`Edit ${p.name}`}>
              <div className="row">
                <div className="lft">
                  <span className="fd" style={{ background: p.color }}>
                    {p.initial}
                  </span>
                  <div className="col">
                    <span className="t">{p.name}</span>
                    <span className="s">{p.summary}</span>
                  </div>
                </div>
                <span className={`badge ${p.type === 'kid' ? 'ok' : 'soft'}`}>{p.type === 'kid' ? 'Kid' : 'Adult'}</span>
              </div>
              {k && (
                <>
                  <div className="row">
                    <span className="lbl">Today</span>
                    <span className="s">
                      {k.time.usedMin} of {k.time.limitMin + k.time.bonusMin} min used
                    </span>
                  </div>
                  <TimeBar percent={k.time.percent} color={k.time.color} label={`${p.name} time left today`} />
                </>
              )}
            </Link>
          );
        })}
        <Link href="/profiles/new" className="btn dark wide">
          <PlusIcon size={20} color="#FFFFFF" /> Add profile
        </Link>
        <span className="lbl">Kid tools</span>
        <nav className="card" aria-label="Kid tools">
          {tools.map((x) => (
            <Link key={x.href} href={x.href} className="rowlink">
              <div className="col">
                <span className="t">{x.t}</span>
                <span className="s">{x.s}</span>
              </div>
              <span className="lft">
                {x.n > 0 && <span className="badge warn">{x.n}</span>}
                <ChevronIcon />
              </span>
            </Link>
          ))}
        </nav>
      </main>
    </>
  );
}
