'use client';
// The kid safeguards part of the profile editor (mockup ProfileEditor): allowed ratings, daily screen time by day,
// viewing hours, the warning, finish the current episode, wind-down, snap back, alerts, asking for more time, the
// weekly bonus cap, and the block list. The hub enforces all of it; this screen only sets it.
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/client';
import { Stepper, Toggle, minutesWords } from './KidUi';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
type Day = (typeof DAYS)[number];
const DAY_LABEL: Record<Day, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

export interface Rules {
  allowedRatings: string[];
  blockedTitles: string[];
  dailyLimits: Record<Day, number>;
  hoursStart: string;
  hoursEnd: string;
  warningMinutes: number;
  finishEpisode: boolean;
  windDown: boolean;
  windDownMinutes: number;
  snapBack: boolean;
  alertOnSnapBack: boolean;
  canAskForTime: boolean;
  weeklyBonusCap: number;
}

interface Blocked {
  key: string;
  name: string;
  rating: string | null;
  everyKid: boolean;
}

interface Loaded {
  rules: Rules;
  ratings: string[];
  blocked: Blocked[];
}

/** Loads the safeguards; `onChange` hands the edited rules to the profile editor, which saves them with the profile. */
export default function SafeguardsEditor({ profileId, onChange }: { profileId: number; onChange: (r: Rules | null) => void }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [rules, setRules] = useState<Rules | null>(null);
  const [blocked, setBlocked] = useState<Blocked[]>([]);
  const [eachDay, setEachDay] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ key: string; name: string; rating: string | null }[] | null>(null);

  useEffect(() => {
    api<Loaded>(`/api/profiles/${profileId}/safeguards`)
      .then((d) => {
        setData(d);
        setRules(d.rules);
        setBlocked(d.blocked);
        const l = d.rules.dailyLimits;
        setEachDay(!(l.mon === l.tue && l.mon === l.wed && l.mon === l.thu));
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load the safeguards.'));
  }, [profileId]);

  useEffect(() => onChange(rules), [rules, onChange]);

  if (error) return <p className="msg err" role="alert">{error}</p>;
  if (!data || !rules) return <span className="s">Loading the safeguards…</span>;
  const set = (patch: Partial<Rules>) => setRules({ ...rules, ...patch });
  const setDays = (days: Day[], v: number) => set({ dailyLimits: { ...rules.dailyLimits, ...Object.fromEntries(days.map((d) => [d, v])) } });

  const dayRows: { label: string; days: Day[] }[] = eachDay
    ? DAYS.map((d) => ({ label: DAY_LABEL[d], days: [d] }))
    : [
        { label: 'Mon to Thu', days: ['mon', 'tue', 'wed', 'thu'] },
        { label: 'Friday', days: ['fri'] },
        { label: 'Saturday', days: ['sat'] },
        { label: 'Sunday', days: ['sun'] },
      ];

  async function search() {
    if (!q.trim()) return;
    try {
      const r = await api<{ rows: { titles: { key: string; name: string; rating: string | null }[] }[] }>(`/api/catalog/browse?service=all&kind=all&q=${encodeURIComponent(q.trim())}`);
      const seen = new Set<string>();
      setFound(r.rows.flatMap((x) => x.titles).filter((t) => !seen.has(t.key) && seen.add(t.key)).slice(0, 8));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not search.');
    }
  }

  function block(t: { key: string; name: string; rating: string | null }) {
    if (rules!.blockedTitles.includes(t.key)) return;
    set({ blockedTitles: [...rules!.blockedTitles, t.key] });
    setBlocked([{ ...t, everyKid: false }, ...blocked.filter((b) => b.key !== t.key)]);
  }

  function unblock(key: string) {
    set({ blockedTitles: rules!.blockedTitles.filter((k) => k !== key) });
    setBlocked(blocked.filter((b) => b.key !== key || b.everyKid));
  }

  return (
    <>
      <section className="card" aria-label="Allowed ratings">
        <span className="lbl">Allowed ratings</span>
        <div className="chips">
          {data.ratings.map((r) => {
            const on = rules.allowedRatings.includes(r);
            return (
              <button key={r} type="button" className={`chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => set({ allowedRatings: on ? rules.allowedRatings.filter((x) => x !== r) : [...rules.allowedRatings, r] })}>
                {r}
              </button>
            );
          })}
        </div>
        <span className="s">Titles above these ratings are hidden for this profile</span>
      </section>

      <section className="card" aria-label="Daily screen time">
        <div className="row">
          <span className="lbl">Daily screen time</span>
          <button type="button" className="chip" aria-pressed={eachDay} onClick={() => setEachDay(!eachDay)}>
            {eachDay ? 'Group weekdays' : 'Set each day'}
          </button>
        </div>
        {dayRows.map((d) => (
          <div key={d.label} className="row">
            <span className="t">{d.label}</span>
            <Stepper value={rules.dailyLimits[d.days[0]]} label={`${d.label} screen time`} step={15} min={0} max={720} words={minutesWords} onChange={(v) => setDays(d.days, v)} />
          </div>
        ))}
      </section>

      <section className="card" aria-label="Viewing hours">
        <span className="lbl">Viewing hours</span>
        <div className="row kid-wrap">
          <span className="t">Allowed between</span>
          <div className="lft" style={{ gap: 8 }}>
            <input className="field" type="time" aria-label="Viewing hours start" value={rules.hoursStart} onChange={(e) => set({ hoursStart: e.target.value })} style={{ width: 118 }} />
            <span className="s">to</span>
            <input className="field" type="time" aria-label="Viewing hours end" value={rules.hoursEnd === '24:00' ? '23:59' : rules.hoursEnd} onChange={(e) => set({ hoursEnd: e.target.value === '23:59' ? '24:00' : e.target.value })} style={{ width: 118 }} />
          </div>
        </div>
        <span className="s">A start outside these hours is refused and shows in Alerts.</span>
      </section>

      <section className="card" aria-label="When time runs out">
        <span className="lbl">When time runs out</span>
        <div className="row">
          <span className="t">Warning before time is up</span>
          <Stepper value={rules.warningMinutes} label="warning" step={1} min={1} max={30} words={(v) => `${v} min`} onChange={(v) => set({ warningMinutes: v })} />
        </div>
        <div className="row">
          <div className="col">
            <span className="t">Finish the current episode</span>
            <span className="s">Then the TV turns off</span>
          </div>
          <Toggle on={rules.finishEpisode} label="Finish the current episode" onChange={(v) => set({ finishEpisode: v })} />
        </div>
      </section>

      <section className="card" aria-label="Bedtime wind-down">
        <div className="row">
          <div className="col">
            <span className="t">Bedtime wind-down</span>
            <span className="s">Calm titles, volume steps down</span>
          </div>
          <Toggle on={rules.windDown} label="Bedtime wind-down" onChange={(v) => set({ windDown: v })} />
        </div>
        <div className="row">
          <span className="t">Wind-down length</span>
          <Stepper value={rules.windDownMinutes} label="wind-down length" step={5} min={5} max={60} words={(v) => `${v} min`} onChange={(v) => set({ windDownMinutes: v })} />
        </div>
      </section>

      <section className="card" aria-label="Guardrails">
        <span className="lbl">Guardrails</span>
        {(
          [
            ['snapBack', 'Snap back to playlist', 'Undo Home and app buttons'],
            ['alertOnSnapBack', 'Alert me when it happens', 'Shows in Alerts'],
            ['canAskForTime', 'Can ask for more time', 'Adult approves'],
          ] as const
        ).map(([k, t, s]) => (
          <div key={k} className="row">
            <div className="col">
              <span className="t">{t}</span>
              <span className="s">{s}</span>
            </div>
            <Toggle on={rules[k]} label={t} onChange={(v) => set({ [k]: v } as Partial<Rules>)} />
          </div>
        ))}
      </section>

      <section className="card" aria-label="Earn more time">
        <span className="lbl">Earn more time</span>
        <div className="row">
          <div className="col">
            <span className="t">Weekly bonus cap</span>
            <span className="s">Minutes from tasks, resets Monday</span>
          </div>
          <Stepper value={rules.weeklyBonusCap} label="weekly bonus cap" step={5} min={0} max={600} words={minutesWords} onChange={(v) => set({ weeklyBonusCap: v })} />
        </div>
      </section>

      <section className="card" aria-label="Blocked titles">
        <div className="row">
          <span className="lbl">Blocked titles</span>
          <span className="s">
            {blocked.length} title{blocked.length === 1 ? '' : 's'}
          </span>
        </div>
        {blocked.map((b) => (
          <div key={b.key} className="row">
            <div className="col">
              <span className="t">{b.name}</span>
              <span className="s">{[b.rating, b.everyKid ? 'Blocked for every kid (Browse)' : null].filter(Boolean).join(' · ')}</span>
            </div>
            {!b.everyKid && (
              <button type="button" className="btn" aria-label={`Unblock ${b.name}`} onClick={() => unblock(b.key)}>
                Unblock
              </button>
            )}
          </div>
        ))}
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <input className="field" aria-label="Find a title to block" placeholder="Find a title to block" value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="submit" className="btn">
            Find
          </button>
        </form>
        {found && (
          <div className="col" role="list" aria-label="Titles found">
            {!found.length && <span className="s">No titles found.</span>}
            {found.map((t) => (
              <div key={t.key} className="row" role="listitem">
                <span className="t">
                  {t.name} <span className="s">{t.rating ?? 'Not rated'}</span>
                </span>
                <button type="button" className="btn" aria-label={`Block ${t.name}`} disabled={rules.blockedTitles.includes(t.key)} onClick={() => block(t)}>
                  {rules.blockedTitles.includes(t.key) ? 'Blocked' : 'Block'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
