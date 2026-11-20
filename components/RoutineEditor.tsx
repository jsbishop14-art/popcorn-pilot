'use client';
// Routine editor (mockup RoutineEditor): the name, the TV it sets up and a picture; the steps in order (turn on,
// profile, volume, playlist, timer; each at most once), moved up or down or removed; Add step; Run on a schedule
// (days and a time); Test now (runs the steps as they are here, without setting the timer) and Save. Adult PIN only.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/lib/client';
import type { RoutineView, RunResult } from '@/lib/routines';
import { Toggle } from './PlaylistEditor';
import { RoutineIcon, RunSteps } from './RoutinesScreen';
import { CalendarIcon, DownIcon, PersonIcon, PlaylistIcon, PlusIcon, PowerIcon, TimerIcon, TrashIcon, UpIcon, VolumeIcon } from './icons';

type Kind = 'power_on' | 'profile' | 'volume' | 'playlist' | 'timer';
interface EStep {
  kind: Kind;
  profileId: number | null;
  volume: number | null;
  playlistId: number | null;
  minutes: number | null;
}

const KINDS: Kind[] = ['power_on', 'profile', 'volume', 'playlist', 'timer'];
const NAMES: Record<Kind, string> = { power_on: 'Turn on', profile: 'Profile', volume: 'Volume', playlist: 'Playlist', timer: 'Timer' };
const DAYS = [
  ['mon', 'Mon'],
  ['tue', 'Tue'],
  ['wed', 'Wed'],
  ['thu', 'Thu'],
  ['fri', 'Fri'],
  ['sat', 'Sat'],
  ['sun', 'Sun'],
] as const;
const ICONS = [
  ['sun', 'Morning'],
  ['tv', 'TV'],
  ['moon', 'Bedtime'],
  ['star', 'Special'],
] as const;

function StepIcon({ kind }: { kind: Kind }) {
  if (kind === 'power_on') return <PowerIcon size={20} />;
  if (kind === 'profile') return <PersonIcon size={20} />;
  if (kind === 'volume') return <VolumeIcon size={20} />;
  if (kind === 'playlist') return <PlaylistIcon size={20} />;
  return <TimerIcon size={20} />;
}

function daysLabel(days: string[]): string {
  const order = DAYS.map(([d]) => d).filter((d) => days.includes(d));
  if (order.length === 7) return 'Every day';
  if (order.length === 5 && order.every((d) => !['sat', 'sun'].includes(d))) return 'Mon to Fri';
  if (order.length === 2 && order.includes('sat') && order.includes('sun')) return 'Weekends';
  return order.map((d) => DAYS.find(([x]) => x === d)?.[1]).join(', ');
}

function timeLabel(t: string): string {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export interface EditorChoices {
  tvs: { id: number; name: string }[];
  profiles: { id: number; name: string; type: string }[];
  playlists: { id: number; name: string }[];
}

export default function RoutineEditor({ routine, choices, tvId }: { routine: RoutineView | null; choices: EditorChoices; tvId: number | null }) {
  const router = useRouter();
  const [name, setName] = useState(routine?.name ?? '');
  const [icon, setIcon] = useState(routine?.icon ?? 'tv');
  const [tv, setTv] = useState<number | null>(routine?.tvId ?? tvId ?? choices.tvs[0]?.id ?? null);
  const [steps, setSteps] = useState<EStep[]>(
    routine?.steps.map((s) => ({ kind: s.kind, profileId: s.profileId, volume: s.volume, playlistId: s.playlistId, minutes: s.minutes })) ?? [{ kind: 'power_on', profileId: null, volume: null, playlistId: null, minutes: null }],
  );
  const [sch, setSch] = useState({ on: routine?.schedule.on ?? false, days: (routine?.schedule.days ?? ['mon', 'tue', 'wed', 'thu', 'fri']) as string[], time: routine?.schedule.time ?? '07:00' });
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [test, setTest] = useState<RunResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const tvName = choices.tvs.find((t) => t.id === tv)?.name ?? 'the TV';
  const unused = KINDS.filter((k) => !steps.some((s) => s.kind === k));

  function addStep(kind: Kind) {
    const s: EStep = { kind, profileId: null, volume: null, playlistId: null, minutes: null };
    if (kind === 'profile') s.profileId = choices.profiles[0]?.id ?? null;
    if (kind === 'volume') s.volume = 18;
    if (kind === 'playlist') s.playlistId = choices.playlists[0]?.id ?? null;
    if (kind === 'timer') s.minutes = 45;
    setSteps((cur) => [...cur, s]);
    setAdding(false);
  }

  function change(i: number, patch: Partial<EStep>) {
    setSteps((cur) => cur.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }

  function move(i: number, d: -1 | 1) {
    setSteps((cur) => {
      const next = [...cur];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });
  }

  const definition = () => ({ id: routine?.id, name, icon, tvId: tv, steps, schedule: sch });

  async function save() {
    setMsg(null);
    try {
      if (routine) await api(`/api/routines/${routine.id}`, { method: 'PATCH', body: definition() });
      else await api('/api/routines', { method: 'POST', body: definition() });
      router.push('/playlists/routines');
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not save the routine.' });
    }
  }

  async function testNow() {
    setMsg(null);
    setTest(null);
    setTesting(true);
    try {
      setTest((await api<{ result: RunResult }>('/api/routines/test', { method: 'POST', body: definition() })).result);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not test the routine.' });
    } finally {
      setTesting(false);
    }
  }

  async function remove() {
    if (!routine) return;
    try {
      await api(`/api/routines/${routine.id}`, { method: 'DELETE' });
      router.push('/playlists/routines');
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not delete the routine.' });
    }
  }

  return (
    <main className="main">
      <label className="col" style={{ gap: 6 }}>
        <span className="lbl">Name</span>
        <input className="field" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="Routine name" placeholder="Morning cartoons" />
      </label>
      <div className="grid2">
        <label className="col" style={{ gap: 6 }}>
          <span className="lbl">TV</span>
          <select className="field" aria-label="Routine TV" value={tv ?? ''} onChange={(e) => setTv(Number(e.target.value))}>
            {!choices.tvs.length && <option value="">Add a TV in Settings first</option>}
            {choices.tvs.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <div className="col" style={{ gap: 6 }}>
          <span className="lbl">Picture</span>
          <div className="chips" role="group" aria-label="Picture">
            {ICONS.map(([k, w]) => (
              <button key={k} type="button" className="chip" aria-pressed={icon === k} aria-label={w} onClick={() => setIcon(k)} style={{ padding: '0 10px' }}>
                <RoutineIcon icon={k} size={16} />
              </button>
            ))}
          </div>
        </div>
      </div>

      <section className="card" style={{ gap: 0 }} aria-label="Steps">
        {steps.map((s, i) => (
          <div key={s.kind}>
            {i > 0 && <div className="sep" />}
            <div className="row" style={{ padding: '8px 0', flexWrap: 'wrap' }}>
              <div className="lft">
                <span className="fd" style={{ width: 28, height: 28, borderRadius: 14, background: '#0F1B33', color: '#FFFFFF', fontSize: 14, fontWeight: 600 }}>{i + 1}</span>
                <StepIcon kind={s.kind} />
                <span className="t">{NAMES[s.kind]}</span>
              </div>
              <div className="lft" style={{ gap: 6 }}>
                {s.kind === 'power_on' && <span className="chip">{tvName}</span>}
                {s.kind === 'profile' && (
                  <select className="field" style={{ width: 130, height: 38 }} aria-label="Profile step" value={s.profileId ?? ''} onChange={(e) => change(i, { profileId: Number(e.target.value) })}>
                    {choices.profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
                {s.kind === 'volume' && (
                  <input className="field" style={{ width: 72, height: 38 }} type="number" min={0} max={100} inputMode="numeric" aria-label="Volume level" value={s.volume ?? ''} onChange={(e) => change(i, { volume: e.target.value === '' ? null : Number(e.target.value) })} />
                )}
                {s.kind === 'playlist' && (
                  <select className="field" style={{ width: 150, height: 38 }} aria-label="Playlist step" value={s.playlistId ?? ''} onChange={(e) => change(i, { playlistId: Number(e.target.value) })}>
                    {!choices.playlists.length && <option value="">No playlists yet</option>}
                    {choices.playlists.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
                {s.kind === 'timer' && (
                  <label className="lft" style={{ gap: 4 }}>
                    <input className="field" style={{ width: 72, height: 38 }} type="number" min={1} max={600} inputMode="numeric" aria-label="Timer minutes" value={s.minutes ?? ''} onChange={(e) => change(i, { minutes: e.target.value === '' ? null : Number(e.target.value) })} />
                    <span className="s">min</span>
                  </label>
                )}
                <button type="button" className="icb" style={{ width: 32, height: 32 }} disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${NAMES[s.kind]} up`}>
                  <UpIcon size={16} />
                </button>
                <button type="button" className="icb" style={{ width: 32, height: 32 }} disabled={i === steps.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${NAMES[s.kind]} down`}>
                  <DownIcon size={16} />
                </button>
                <button type="button" className="icb" style={{ width: 32, height: 32 }} onClick={() => setSteps((cur) => cur.filter((_, j) => j !== i))} aria-label={`Remove ${NAMES[s.kind]}`}>
                  <TrashIcon size={16} />
                </button>
              </div>
            </div>
          </div>
        ))}
        {unused.length > 0 && (
          <button type="button" className="btn wide" style={{ marginTop: 10 }} aria-expanded={adding} onClick={() => setAdding((v) => !v)}>
            <PlusIcon size={18} /> Add step
          </button>
        )}
        {adding && (
          <div className="chips" role="group" aria-label="Add a step" style={{ marginTop: 10 }}>
            {unused.map((k) => (
              <button key={k} type="button" className="chip" onClick={() => addStep(k)}>
                <StepIcon kind={k} /> {NAMES[k]}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="card" aria-label="Schedule">
        <div className="row">
          <div className="lft">
            <CalendarIcon size={20} />
            <div className="col">
              <span className="t">Run on a schedule</span>
              <span className="s">{sch.on ? `${daysLabel(sch.days) || 'Pick days'} · ${timeLabel(sch.time)}` : 'Manual: Run or the TV home screen'}</span>
            </div>
          </div>
          <Toggle on={sch.on} label="Run on a schedule" onChange={(on) => setSch({ ...sch, on })} />
        </div>
        {sch.on && (
          <>
            <div className="chips" role="group" aria-label="Days">
              {DAYS.map(([d, w]) => (
                <button key={d} type="button" className="chip" aria-pressed={sch.days.includes(d)} onClick={() => setSch({ ...sch, days: sch.days.includes(d) ? sch.days.filter((x) => x !== d) : [...sch.days, d] })}>
                  {w}
                </button>
              ))}
            </div>
            <input className="field" type="time" aria-label="Time" value={sch.time} onChange={(e) => setSch({ ...sch, time: e.target.value })} />
          </>
        )}
      </section>

      {test && <RunSteps result={test} />}
      {msg && (
        <p className={`msg ${msg.ok ? 'ok' : 'err'}`} role="alert">
          {msg.text}
        </p>
      )}
      <div className="grid2">
        <button type="button" className="btn" onClick={() => void testNow()} disabled={testing}>
          <PowerIcon size={18} /> {testing ? 'Testing…' : 'Test now'}
        </button>
        <button type="button" className="btn pri" onClick={() => void save()}>
          Save
        </button>
      </div>
      {routine && (
        <div className="btns">
          {!confirmDelete ? (
            <button type="button" className="btn danger" onClick={() => setConfirmDelete(true)}>
              <TrashIcon size={18} /> Delete
            </button>
          ) : (
            <button type="button" className="btn danger" onClick={() => void remove()}>
              Delete {routine.name} for good
            </button>
          )}
        </div>
      )}
    </main>
  );
}
