'use client';
// Edit playlist (mockup PlaylistEditor): name; titles in order (move up or down, remove, how much of each through
// Show options); Add title (from Browse) and the Family Album; loop, shuffle, schedule (days, time, TV, profile);
// who can see it; Delete and Save.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/lib/client';
import type { Item, Playlist } from '@/lib/playlists';
import type { PickerProfile } from '@/lib/browse-profiles';
import ShowOptions, { type ModeValue } from './ShowOptions';
import type { TvChoice } from './PlaylistScreen';
import { CalendarIcon, DownIcon, LoopIcon, PlusIcon, ShuffleIcon, TrashIcon, UpIcon } from './icons';

const DAYS = [
  ['mon', 'Mon'],
  ['tue', 'Tue'],
  ['wed', 'Wed'],
  ['thu', 'Thu'],
  ['fri', 'Fri'],
  ['sat', 'Sat'],
  ['sun', 'Sun'],
] as const;

function label(i: Pick<Item, 'kind' | 'titleKind' | 'mode' | 'episodes' | 'minutes'>): string {
  if (i.kind === 'album') return i.mode === 'indefinite' ? 'Run indefinitely' : `${i.minutes} min`;
  if (i.mode === 'episodes') return i.titleKind === 'movie' ? 'Whole movie' : `${i.episodes} episode${i.episodes === 1 ? '' : 's'}`;
  if (i.mode === 'stay') return 'Stay on show';
  if (i.mode === 'time') return `${i.minutes} min`;
  return 'Run indefinitely';
}

export function Toggle({ on, label: l, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <button type="button" className="tog" role="switch" aria-checked={on} aria-label={l} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

export default function PlaylistEditor({ playlist, tvs, profiles }: { playlist: Playlist; tvs: TvChoice[]; profiles: PickerProfile[] }) {
  const router = useRouter();
  const [name, setName] = useState(playlist.name);
  const [items, setItems] = useState<Item[]>(playlist.items);
  const [loop, setLoop] = useState(playlist.loop);
  const [shuffle, setShuffle] = useState(playlist.shuffle);
  const [sch, setSch] = useState({
    on: playlist.schedule.on,
    days: playlist.schedule.days as string[],
    time: playlist.schedule.time ?? '08:00',
    tvId: playlist.schedule.tvId ?? tvs[0]?.id ?? null,
    profileId: playlist.schedule.profileId,
  });
  const [editing, setEditing] = useState<Item | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const move = (i: number, d: -1 | 1) =>
    setItems((cur) => {
      const next = [...cur];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });

  async function addAlbum() {
    setMsg(null);
    try {
      const r = await api<{ playlist: Playlist }>(`/api/playlists/${playlist.id}/items`, { method: 'POST', body: { kind: 'album' } });
      const added = r.playlist.items.filter((x) => !items.some((y) => y.id === x.id));
      setItems((cur) => [...cur, ...added]);
      setMsg({ ok: true, text: 'Added the Family Album (its photos arrive in a later build; until then it is skipped)' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not save.' });
    }
  }

  async function save() {
    setMsg(null);
    try {
      await api(`/api/playlists/${playlist.id}`, {
        method: 'PATCH',
        body: {
          name,
          loop,
          shuffle,
          items: items.map((i) => ({ id: i.id, mode: i.mode, episodes: i.episodes, minutes: i.minutes })),
          schedule: { on: sch.on, days: sch.days, time: sch.time, tvId: sch.tvId, profileId: sch.profileId },
        },
      });
      setMsg({ ok: true, text: `Saved ${name}` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not save.' });
    }
  }

  async function remove() {
    try {
      await api(`/api/playlists/${playlist.id}`, { method: 'DELETE' });
      router.push('/playlists');
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not delete.' });
    }
  }

  return (
    <main className="main">
      <label className="col" style={{ gap: 6 }}>
        <span className="lbl">Name</span>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Name" />
      </label>

      <section className="card" style={{ gap: 0 }} aria-label="Titles">
        {items.map((i, n) => (
          <div key={i.id} className="qrow" aria-label={i.name} role="group">
            <div className="lft">
              {/* eslint-disable-next-line @next/next/no-img-element -- cover art is served and cached by the hub */}
              {i.poster ? <img className="poster" src={`/api/catalog/art/${encodeURIComponent(i.poster)}`} alt="" /> : <span className="poster" style={{ background: 'var(--blue)' }} />}
              <div className="col">
                <span className="t">{i.name}</span>
                <span className="s">
                  {i.serviceName}
                  {i.rating ? ` · ${i.rating}` : ''}
                </span>
                <button type="button" className="chip" style={{ alignSelf: 'flex-start', marginTop: 4 }} aria-label={`How much ${i.name}: ${label(i)}`} onClick={() => setEditing(i)}>
                  {label(i)}
                </button>
              </div>
            </div>
            <div className="qtools">
              <button type="button" className="mini" aria-label={`Move ${i.name} up`} disabled={n === 0} onClick={() => move(n, -1)}>
                <UpIcon size={16} />
              </button>
              <button type="button" className="mini" aria-label={`Move ${i.name} down`} disabled={n === items.length - 1} onClick={() => move(n, 1)}>
                <DownIcon size={16} />
              </button>
              <button type="button" className="mini" aria-label={`Remove ${i.name}`} onClick={() => setItems((cur) => cur.filter((x) => x.id !== i.id))}>
                <TrashIcon size={16} />
              </button>
            </div>
          </div>
        ))}
        {!items.length && <span className="s">No titles yet. Add them from Browse.</span>}
        <div className="btns" style={{ marginTop: 10 }}>
          <Link href="/browse" className="btn">
            <PlusIcon size={18} /> Add title
          </Link>
          <button type="button" className="btn" onClick={() => void addAlbum()}>
            <PlusIcon size={18} /> Family Album
          </button>
        </div>
        <span className="s" style={{ marginTop: 6 }}>
          Add title opens Browse: pick a title, then Add to playlist. Save your changes here first.
        </span>
      </section>

      <section className="card" aria-label="Playback">
        <div className="row">
          <div className="lft">
            <LoopIcon size={20} />
            <span className="t">Loop</span>
          </div>
          <Toggle on={loop} label="Loop" onChange={setLoop} />
        </div>
        <div className="row">
          <div className="lft">
            <ShuffleIcon size={20} />
            <span className="t">Shuffle</span>
          </div>
          <Toggle on={shuffle} label="Shuffle" onChange={setShuffle} />
        </div>
        <div className="sep" />
        <div className="row">
          <div className="lft">
            <CalendarIcon size={20} />
            <span className="t">Schedule</span>
          </div>
          <Toggle on={sch.on} label="Schedule" onChange={(on) => setSch({ ...sch, on })} />
        </div>
        {sch.on && (
          <div className="col" style={{ gap: 8 }}>
            <div className="chips" role="group" aria-label="Days">
              {DAYS.map(([d, w]) => (
                <button key={d} type="button" className="chip" aria-pressed={sch.days.includes(d)} onClick={() => setSch({ ...sch, days: sch.days.includes(d) ? sch.days.filter((x) => x !== d) : [...sch.days, d] })}>
                  {w}
                </button>
              ))}
            </div>
            <div className="grid2">
              <input className="field" type="time" aria-label="Time" value={sch.time} onChange={(e) => setSch({ ...sch, time: e.target.value })} />
              <select className="field" aria-label="Schedule TV" value={sch.tvId ?? ''} onChange={(e) => setSch({ ...sch, tvId: Number(e.target.value) })}>
                {tvs.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <select className="field" aria-label="Schedule profile" value={sch.profileId ?? ''} onChange={(e) => setSch({ ...sch, profileId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">The TV&apos;s default profile</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.type === 'kid' ? ' (Kid)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="sep" />
        <div className="col">
          <span className="t">Who can see it</span>
          <span className="s">All profiles · kids see allowed titles only</span>
        </div>
      </section>

      <div className="btns">
        {!confirmDelete ? (
          <button type="button" className="btn danger" onClick={() => setConfirmDelete(true)}>
            <TrashIcon size={18} /> Delete
          </button>
        ) : (
          <button type="button" className="btn danger" onClick={() => void remove()}>
            Delete {playlist.name} for good
          </button>
        )}
        <button type="button" className="btn pri" onClick={() => void save()}>
          Save
        </button>
      </div>
      {msg && (
        <p className={`msg ${msg.ok ? 'ok' : 'err'}`} role="status">
          {msg.text}
        </p>
      )}

      {editing && (
        <ShowOptions
          name={editing.name}
          sub={`${editing.serviceName}${editing.startFrom ? ` · starts at ${editing.startFrom}` : ''}`}
          kind={editing.kind === 'album' ? 'album' : (editing.titleKind ?? 'show')}
          value={{ mode: editing.mode, episodes: editing.episodes, minutes: editing.minutes }}
          onCancel={() => setEditing(null)}
          onDone={(v: ModeValue) => {
            setItems((cur) => cur.map((x) => (x.id === editing.id ? { ...x, ...v } : x)));
            setEditing(null);
          }}
        />
      )}
    </main>
  );
}
