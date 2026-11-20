'use client';
// Live queue (mockup Queue): pick the TV; now playing with progress, pause and skip; up next for this TV, with how
// much of each title plays. Adult: move titles up or down, remove, change how much (Show options), add to queue.
// Changes here are for this TV only, not the saved playlist.
import Link from 'next/link';
import { useState } from 'react';
import { api, ApiError } from '@/lib/client';
import type { QueueView, TvView } from '@/lib/playback';
import { profileQuery } from '@/lib/catalog/types';
import ShowOptions, { type ModeValue } from './ShowOptions';
import { Progress, nowLine, usePlayback } from './Dashboard';
import { DownIcon, PauseIcon, PlayIcon, PlusIcon, SearchIcon, SkipIcon, TrashIcon, UpIcon } from './icons';

interface Found {
  key: string;
  name: string;
  rating: string | null;
  services: string[];
}

function Poster({ src }: { src: string | null }) {
  // eslint-disable-next-line @next/next/no-img-element -- cover art is served and cached by the hub
  return src ? <img className="poster" src={src} alt="" /> : <span className="poster" style={{ background: 'var(--blue)' }} />;
}

export default function QueueScreen({ tvId, isAdult, initial }: { tvId: number; isAdult: boolean; initial: TvView[] }) {
  const { tvs, setTvs } = usePlayback(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState<QueueView | null>(null);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Found[] | null>(null);

  const list = tvs ?? [];
  const v = list.find((t) => t.tv.id === tvId);
  const pb = v?.playback ?? null;

  async function post(path: string, b: Record<string, unknown>) {
    setMsg(null);
    try {
      const r = await api<{ message: string; tvs: TvView[] }>(`/api/tvs/${tvId}/${path}`, { method: 'POST', body: b });
      setTvs(r.tvs);
      setMsg({ ok: true, text: r.message });
      return true;
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not reach the hub.' });
      return false;
    }
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await api<{ rows: { titles: Found[] }[] }>(`/api/catalog/browse?service=all&q=${encodeURIComponent(q)}${pb?.profileId ? `&profile=${pb.profileId}` : ''}`);
      const seen = new Map<string, Found>();
      for (const row of r.rows) for (const t of row.titles) if (!seen.has(t.key)) seen.set(t.key, t);
      setFound([...seen.values()]);
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : 'Could not search.' });
    }
  }

  const line = v ? nowLine(v) : null;
  return (
    <main className="main">
      <div className="chips" role="group" aria-label="TV">
        {list.map((t) => (
          <Link key={t.tv.id} href={`/tvs/${t.tv.id}/queue`} className={`chip${t.tv.id === tvId ? ' on' : ''}`} aria-current={t.tv.id === tvId ? 'page' : undefined}>
            {t.tv.name}
          </Link>
        ))}
      </div>
      {!v && <span className="s">No such TV.</span>}
      {v && !pb && (
        <div className="card">
          <span className="t">Nothing playing on {v.tv.name}</span>
          {v.lastMessage && (
            <p className="msg err" role="status">
              {v.lastMessage}
            </p>
          )}
          <Link href="/playlists" className="btn pri">
            <PlayIcon size={16} /> Start a playlist
          </Link>
        </div>
      )}
      {pb && (
        <>
          <section className="card np" aria-label="Now playing">
            <span className="lbl" style={{ marginTop: 0 }}>
              Now playing
            </span>
            <div className="lft">
              <Poster src={pb.now?.item.poster ?? null} />
              <div className="col">
                <span className="t">{line?.title}</span>
                <span className="s">
                  {pb.now ? `${pb.now.item.serviceName} · ${pb.now.item.modeLabel}${pb.now.leftMin !== null ? ` · ${pb.now.leftMin} min left` : ''}` : line?.sub}
                  {pb.state === 'paused' ? ' · Paused' : ''}
                </span>
              </div>
            </div>
            <Progress percent={pb.now?.percent ?? null} label="Progress" />
            <div className="grid2">
              <button type="button" className="btn pri" onClick={() => void post('playback', { action: pb.state === 'paused' ? 'resume' : 'pause' })}>
                {pb.state === 'paused' ? <PlayIcon size={16} /> : <PauseIcon size={16} />} {pb.state === 'paused' ? 'Resume' : 'Pause'}
              </button>
              <button type="button" className="btn" onClick={() => void post('playback', { action: 'skip' })}>
                <SkipIcon size={16} color="#FFFFFF" /> Skip
              </button>
            </div>
          </section>
          {pb.message && (
            <p className="msg err" role="status">
              {pb.message}
            </p>
          )}
          <span className="lbl">
            Up next · {pb.quick ? 'Quick playlist' : pb.name}
            {pb.loop ? ' · Loop' : ''}
            {pb.shuffle ? ' · Shuffle' : ''}
          </span>
          <section className="card" style={{ gap: 0 }} aria-label="Up next">
            {pb.upNext.map((i, n) => (
              <div key={i.id} className="qrow" role="group" aria-label={i.name}>
                <div className="lft">
                  <Poster src={i.poster} />
                  <div className="col">
                    <span className="t">{i.name}</span>
                    <span className="s">
                      {i.serviceName} · {i.modeLabel}
                    </span>
                  </div>
                </div>
                {isAdult && (
                  <div className="qtools">
                    <button type="button" className="chip" aria-label={`Edit ${i.name}`} onClick={() => setEditing(i)}>
                      Edit
                    </button>
                    <button type="button" className="mini" aria-label={`Move ${i.name} up`} disabled={n === 0} onClick={() => void post('queue', { action: 'move', itemId: i.id, direction: 'up' })}>
                      <UpIcon size={16} />
                    </button>
                    <button type="button" className="mini" aria-label={`Move ${i.name} down`} disabled={n === pb.upNext.length - 1} onClick={() => void post('queue', { action: 'move', itemId: i.id, direction: 'down' })}>
                      <DownIcon size={16} />
                    </button>
                    <button type="button" className="mini" aria-label={`Remove ${i.name}`} onClick={() => void post('queue', { action: 'remove', itemId: i.id })}>
                      <TrashIcon size={16} />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {!pb.upNext.length && <span className="s">Nothing after this{pb.loop ? '; the playlist starts again' : ''}.</span>}
          </section>
          {pb.past.length > 0 && (
            <details className="card">
              <summary className="t">Played and skipped ({pb.past.length})</summary>
              {pb.past.map((i) => (
                <div key={i.id} className="qrow">
                  <span className="s">{i.name}</span>
                  <span className="s">{i.status === 'failed' ? `Did not play: ${i.note}` : i.status === 'skipped' ? (i.note ?? 'Skipped') : 'Played'}</span>
                </div>
              ))}
            </details>
          )}
          {isAdult && !adding && (
            <button type="button" className="btn dark wide" onClick={() => setAdding(true)}>
              <PlusIcon size={18} color="#FFFFFF" /> Add to queue
            </button>
          )}
          {isAdult && adding && (
            <section className="card" aria-label="Add to queue">
              <form className="b-search" onSubmit={(e) => void search(e)}>
                <SearchIcon size={18} />
                <input className="field" aria-label="Search titles to add" placeholder={`Search${pb.profileName ? ` for ${pb.profileName}` : ''}`} value={q} onChange={(e) => setQ(e.target.value)} />
              </form>
              {found && !found.length && <span className="s">No titles found.</span>}
              {found?.map((t) => (
                <div key={t.key} className="qrow">
                  <span className="t">
                    {t.name} <span className="s">{t.rating ?? 'NR'}</span>
                  </span>
                  <button
                    type="button"
                    className="chip"
                    aria-label={`Add ${t.name}`}
                    onClick={() => void post('queue', { action: 'add', titleKey: t.key }).then((ok) => ok && (setFound(null), setQ(''), setAdding(false)))}
                  >
                    <PlusIcon size={14} /> Add
                  </button>
                </div>
              ))}
              <Link href={`/browse${profileQuery(pb.profileId)}`} className="s">
                Or browse all titles
              </Link>
            </section>
          )}
        </>
      )}
      {msg && (
        <p className={`msg ${msg.ok ? 'ok' : 'err'}`} role="status">
          {msg.text}
        </p>
      )}
      {editing && (
        <ShowOptions
          name={editing.name}
          sub={editing.serviceName}
          kind={editing.kind === 'album' ? 'album' : (editing.titleKind ?? 'show')}
          value={{ mode: editing.mode as ModeValue['mode'], episodes: editing.episodes, minutes: editing.minutes }}
          onCancel={() => setEditing(null)}
          onDone={(m) => {
            void post('queue', { action: 'mode', itemId: editing.id, ...m });
            setEditing(null);
          }}
        />
      )}
    </main>
  );
}
