'use client';
// Watch log (mockup WatchLog): per kid, the week's total against the week's limit, a day by day chart, and every
// title watched (service, TV, start time, approximate minutes). Times are approximate.
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/client';
import type { WatchWeek } from '@/lib/safeguards';
import { minutesWords } from './KidUi';

const DAY_SHORT: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

function shiftWeek(week: string, days: number): string {
  const [y, m, d] = week.split('-').map(Number);
  const x = new Date(y, m - 1, d + days, 12);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export default function WatchLogScreen({ kids, initial }: { kids: { id: number; name: string }[]; initial: WatchWeek | null }) {
  const [log, setLog] = useState<WatchWeek | null>(initial);
  const [kidId, setKidId] = useState<number | null>(initial?.profileId ?? null);
  const [week, setWeek] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (kidId === null) return;
    if (week === null && initial && kidId === initial.profileId) return;
    api<{ log: WatchWeek }>(`/api/profiles/${kidId}/watch-log${week ? `?week=${week}` : ''}`)
      .then((r) => setLog(r.log))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load the watch log.'));
  }, [kidId, week, initial]);

  if (!kids.length)
    return (
      <main className="main">
        <div className="card">
          <span className="t">No kid profiles yet</span>
          <span className="s">The watch log shows what each kid profile watched.</span>
        </div>
      </main>
    );
  const max = Math.max(1, ...(log?.days.map((d) => Math.max(d.minutes, d.limitMin)) ?? [1]));
  return (
    <main className="main">
      <div className="chips" role="group" aria-label="Kid">
        {kids.map((k) => (
          <button key={k.id} type="button" className={`chip${k.id === kidId ? ' on' : ''}`} aria-pressed={k.id === kidId} onClick={() => setKidId(k.id)}>
            {k.name}
          </button>
        ))}
      </div>
      {error && (
        <p className="msg err" role="alert">
          {error}
        </p>
      )}
      {log && (
        <>
          <section className="card" aria-label="Week">
            <div className="row">
              <div className="col">
                <span className="lbl">{week ? `Week of ${log.week}` : 'This week'}</span>
                <span className="h2" style={{ fontSize: 26 }}>
                  {minutesWords(log.totalMin)}
                </span>
                <span className="s">Limit {minutesWords(log.limitMin)}</span>
              </div>
              <div className="btns">
                <button type="button" className="btn" onClick={() => setWeek(shiftWeek(log.week, -7))}>
                  Previous week
                </button>
                {week && (
                  <button type="button" className="btn" onClick={() => setWeek(null)}>
                    This week
                  </button>
                )}
              </div>
            </div>
            <div className="chart" role="img" aria-label={`Minutes by day: ${log.days.map((d) => `${DAY_SHORT[d.day]} ${d.minutes}`).join(', ')}`}>
              {log.days.map((d) => (
                <div key={d.day} className={`day${d.today ? ' today' : ''}`}>
                  <span className="col-bar" style={{ height: `${Math.round((d.minutes / max) * 90)}px` }} />
                  <span className="lbl">{DAY_SHORT[d.day]}</span>
                </div>
              ))}
            </div>
          </section>
          {!log.entries.length && (
            <div className="card">
              <span className="s">Nothing watched this week.</span>
            </div>
          )}
          {log.entries.map((g) => (
            <section key={g.date} className="card" aria-label={g.label}>
              <span className="lbl">{g.label}</span>
              {g.items.map((e) => (
                <div key={e.id} className="row">
                  <div className="col">
                    <span className="t">
                      {e.name}
                      {e.episodes ? ` · ${e.episodes}` : ''}
                    </span>
                    <span className="s">
                      {[e.service, e.tvName, new Date(e.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <span className="t">{e.minutes} min</span>
                </div>
              ))}
            </section>
          ))}
          <span className="s">Times are approximate. Streaming apps don&apos;t report exact playback.</span>
        </>
      )}
    </main>
  );
}
