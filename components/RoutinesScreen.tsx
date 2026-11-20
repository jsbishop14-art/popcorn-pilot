'use client';
// Routines (mockup Routines): each routine with its picture, schedule, TV and profile, and Run. Run does every step
// in order on the hub and shows what each did, or where it stopped and why. A timer still to turn a TV off can be
// cancelled. Adult PIN only. Opened from a TV card on Home ("Start routine"), the list shows that TV's routines.
import Link from 'next/link';
import { useState } from 'react';
import { api, ApiError } from '@/lib/client';
import type { RoutineView, RunResult } from '@/lib/routines';
import { ChevronIcon, MoonIcon, PlayIcon, PlusIcon, ScreenIcon, SparkIcon, SunIcon } from './icons';

export function RoutineIcon({ icon, size = 22 }: { icon: string; size?: number }) {
  if (icon === 'sun') return <SunIcon size={size} />;
  if (icon === 'moon') return <MoonIcon size={size} />;
  if (icon === 'star') return <SparkIcon size={size} />;
  return <ScreenIcon size={size} />;
}

export function RunSteps({ result }: { result: Pick<RunResult, 'ok' | 'message' | 'steps'> }) {
  return (
    <div className="col" style={{ gap: 4 }} role="status" aria-label="Routine result">
      <p className={`msg ${result.ok ? 'ok' : 'err'}`} style={{ margin: 0 }}>
        {result.message}
      </p>
      <ol className="col" style={{ gap: 2, margin: 0, paddingLeft: 20 }}>
        {result.steps.map((s) => (
          <li key={s.n} className="s">
            {s.ok ? '✓' : '✗'} {s.name}: {s.words}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function RoutinesScreen({ initial, tv }: { initial: RoutineView[]; tv: { id: number; name: string } | null }) {
  const [list, setList] = useState(initial);
  const [busy, setBusy] = useState<number | null>(null);
  const [result, setResult] = useState<{ id: number; r: RunResult } | null>(null);
  const [err, setErr] = useState<{ id: number; text: string } | null>(null);
  const shown = tv ? list.filter((r) => r.tvId === tv.id) : list;

  function replace(r: RoutineView | null | undefined) {
    if (r) setList((cur) => cur.map((x) => (x.id === r.id ? r : x)));
  }

  async function run(id: number) {
    setBusy(id);
    setErr(null);
    setResult(null);
    try {
      const r = await api<{ result: RunResult; routine: RoutineView }>(`/api/routines/${id}/run`, { method: 'POST', body: {} });
      setResult({ id, r: r.result });
      replace(r.routine);
    } catch (e) {
      setErr({ id, text: e instanceof ApiError ? e.message : 'Could not run the routine.' });
    } finally {
      setBusy(null);
    }
  }

  async function cancelTimer(id: number) {
    try {
      const r = await api<{ routine: RoutineView }>(`/api/routines/${id}/timer`, { method: 'DELETE' });
      replace(r.routine);
    } catch (e) {
      setErr({ id, text: e instanceof ApiError ? e.message : 'Could not cancel the timer.' });
    }
  }

  return (
    <main className="main">
      <span className="s">One button sets the TV, profile, volume, playlist and timer.</span>
      {tv && (
        <div className="row">
          <span className="t">Routines for {tv.name}</span>
          <Link href="/playlists/routines">Show all</Link>
        </div>
      )}
      {!shown.length && (
        <div className="card">
          <span className="t">No routines yet</span>
          <span className="s">Make one with New routine: for example turn on the Living room, pick a profile, set the volume and start a playlist.</span>
        </div>
      )}
      <section aria-label="Routines" className="col" style={{ gap: 12 }}>
        {shown.map((r) => (
          <div key={r.id} className="card" aria-label={`Routine ${r.name}`} role="group">
            <div className="row">
              <Link href={`/playlists/routines/${r.id}`} className="lft" aria-label={`Edit ${r.name}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <span className="thumb" style={{ background: '#FFF3C4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <RoutineIcon icon={r.icon} />
                </span>
                <div className="col">
                  <span className="t">{r.name}</span>
                  <span className="s">{r.summary}</span>
                </div>
                <ChevronIcon size={16} />
              </Link>
              <button type="button" className="btn pri" style={{ height: 40 }} disabled={busy !== null || r.tvId === null} onClick={() => void run(r.id)} aria-label={`Run ${r.name}`}>
                <PlayIcon size={16} /> {busy === r.id ? 'Running…' : 'Run'}
              </button>
            </div>
            {r.timer && (
              <div className="row">
                <span className="s">{r.timer.words}</span>
                <button type="button" className="btn" style={{ height: 36 }} onClick={() => void cancelTimer(r.id)}>
                  Cancel timer
                </button>
              </div>
            )}
            {result?.id === r.id ? (
              <RunSteps result={result.r} />
            ) : (
              r.lastRun && (
                <span className="s">
                  Last run {new Date(r.lastRun.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}: {r.lastRun.message}
                </span>
              )
            )}
            {err?.id === r.id && (
              <p className="msg err" role="alert">
                {err.text}
              </p>
            )}
          </div>
        ))}
      </section>
      <Link href={tv ? `/playlists/routines/new?tv=${tv.id}` : '/playlists/routines/new'} className="btn dark wide">
        <PlusIcon size={18} /> New routine
      </Link>
    </main>
  );
}
