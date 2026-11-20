'use client';
// Alerts (mockup Alerts): what the kid rules did, in the app only (no push, email or text). Filter by TV; grouped
// by day.
import { useState } from 'react';
import type { AlertView } from '@/lib/safeguards';

function dayLabel(at: number, today: Date): string {
  const d = new Date(at);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(today) - start(d)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export default function AlertsScreen({ alerts, tvs, now }: { alerts: AlertView[]; tvs: { id: number; name: string }[]; now: number }) {
  const [tv, setTv] = useState<number | null>(null);
  const shown = alerts.filter((a) => tv === null || a.tvId === tv);
  const today = new Date(now);
  const groups: { label: string; items: AlertView[] }[] = [];
  for (const a of shown) {
    const label = dayLabel(a.at, today);
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push(a);
    else groups.push({ label, items: [a] });
  }
  return (
    <main className="main">
      <div className="chips" role="group" aria-label="TV">
        <button type="button" className={`chip${tv === null ? ' on' : ''}`} aria-pressed={tv === null} onClick={() => setTv(null)}>
          All
        </button>
        {tvs.map((t) => (
          <button key={t.id} type="button" className={`chip${tv === t.id ? ' on' : ''}`} aria-pressed={tv === t.id} onClick={() => setTv(t.id)}>
            {t.name}
          </button>
        ))}
      </div>
      {!groups.length && (
        <div className="card">
          <span className="t">No alerts</span>
          <span className="s">Snap backs, starts outside viewing hours, time warnings and time up show here.</span>
        </div>
      )}
      {groups.map((g) => (
        <section key={g.label} className="card" aria-label={g.label}>
          <span className="lbl">{g.label}</span>
          {g.items.map((a) => (
            <div key={a.id} className="col" role="article" aria-label={a.title}>
              <span className="t">{a.title}</span>
              <span className="s">
                {a.detail} · {a.time}
              </span>
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}
