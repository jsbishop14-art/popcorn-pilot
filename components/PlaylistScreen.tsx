'use client';
// One playlist: its titles with how much of each plays, loop, shuffle, schedule, and Start on one or both TVs for a
// profile (no profile: each TV's default profile; the Guest PIN starts for a kid profile). Adult: Edit.
import Link from 'next/link';
import { useState } from 'react';
import { api, ApiError } from '@/lib/client';
import type { Playlist } from '@/lib/playlists';
import type { PickerProfile } from '@/lib/browse-profiles';
import { PlayIcon, QueueIcon } from './icons';
import { Covers } from './PlaylistsScreen';

export interface TvChoice {
  id: number;
  name: string;
  online: boolean;
  defaultProfileName: string | null;
}

export function ItemRow({ i }: { i: Playlist['items'][number] }) {
  return (
    <div className="qrow">
      <div className="lft">
        {/* eslint-disable-next-line @next/next/no-img-element -- cover art is served and cached by the hub */}
        {i.poster ? <img className="poster" src={`/api/catalog/art/${encodeURIComponent(i.poster)}`} alt="" /> : <span className="poster" style={{ background: 'var(--blue)' }} />}
        <div className="col">
          <span className="t">{i.name}</span>
          <span className="s">
            {i.serviceName}
            {i.rating ? ` · ${i.rating}` : ''}
          </span>
        </div>
      </div>
      <span className="chip">{i.modeLabel}</span>
    </div>
  );
}

export default function PlaylistScreen({
  role,
  playlist: p,
  tvs,
  profiles,
  profile,
}: {
  role: 'adult' | 'guest';
  playlist: Playlist;
  tvs: TvChoice[];
  profiles: PickerProfile[];
  profile: number | null;
}) {
  const [picked, setPicked] = useState<number[]>(tvs.filter((t) => t.online).slice(0, 1).map((t) => t.id));
  const [who, setWho] = useState<string>(role === 'guest' ? String(profile ?? profiles[0]?.id ?? '') : '');
  const [msg, setMsg] = useState<{ ok: boolean; text: string; tv?: number } | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    setMsg(null);
    try {
      await api(`/api/playlists/${p.id}/start`, { method: 'POST', body: { tvIds: picked, profile: who || undefined } });
      const names = tvs.filter((t) => picked.includes(t.id)).map((t) => t.name);
      setMsg({ ok: true, text: `Started ${p.name} on ${names.join(' and ')}`, tv: picked[0] });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not reach the hub.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="main">
      <div className="lft">
        <Covers covers={p.covers} />
        <div className="col">
          <span className="s">{p.meta}</span>
          <span className="s">{p.schedule.on ? `Scheduled ${p.schedule.label}` : 'Not scheduled'}</span>
        </div>
      </div>
      <section className="card" style={{ gap: 0 }} aria-label="Titles">
        {p.items.map((i) => (
          <ItemRow key={i.id} i={i} />
        ))}
        {!p.items.length && <span className="s">No titles yet.</span>}
        {p.hiddenCount > 0 && <span className="s">{p.hiddenCount} more not shown for this profile.</span>}
      </section>
      {role === 'adult' && (
        <Link href={`/playlists/${p.id}/edit`} className="btn wide">
          Edit playlist
        </Link>
      )}

      <section className="card" aria-label="Start">
        <h2 className="h2">Start</h2>
        <div className="chips" role="group" aria-label="TVs">
          {tvs.map((t) => (
            <button
              key={t.id}
              type="button"
              className="chip"
              aria-pressed={picked.includes(t.id)}
              onClick={() => setPicked((cur) => (cur.includes(t.id) ? cur.filter((x) => x !== t.id) : [...cur, t.id]))}
            >
              {t.name}
              {t.online ? '' : ' (offline)'}
            </button>
          ))}
        </div>
        {!tvs.length && <span className="s">No TVs yet.</span>}
        <label className="col" style={{ gap: 6 }}>
          <span className="lbl">Profile</span>
          <select className="field" aria-label="Profile" value={who} onChange={(e) => setWho(e.target.value)}>
            {role === 'adult' && <option value="">Each TV&apos;s default profile</option>}
            {profiles.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
                {x.type === 'kid' ? ' (Kid)' : ''}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn dark wide" disabled={!picked.length || busy || !p.items.length} onClick={() => void start()}>
          <PlayIcon size={18} color="#FFFFFF" /> {picked.length > 1 ? 'Start on both TVs' : `Start on ${tvs.find((t) => t.id === picked[0])?.name ?? 'a TV'}`}
        </button>
        {msg && (
          <p className={`msg ${msg.ok ? 'ok' : 'err'}`} role="status">
            {msg.text}
          </p>
        )}
        {msg?.ok && msg.tv && (
          <Link href={`/tvs/${msg.tv}/queue`} className="btn">
            <QueueIcon size={16} /> Open the live queue
          </Link>
        )}
      </section>
    </main>
  );
}
