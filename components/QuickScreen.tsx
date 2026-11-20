'use client';
// Quick playlist (mockup QuickAdd): not saved, titles picked as you go from Browse. When nothing plays it yet, it asks
// "Start now?" and on which TV; later picks go to the end. Save as playlist (Adult) names it and keeps it.
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/client';
import type { Playlist } from '@/lib/playlists';
import { profileQuery } from '@/lib/catalog/types';
import { PlayIcon, PlusIcon, QueueIcon } from './icons';
import { ItemRow, type TvChoice } from './PlaylistScreen';

export default function QuickScreen({ role, profile, tvs }: { role: 'adult' | 'guest'; profile: number | null; tvs: TvChoice[] }) {
  const [quick, setQuick] = useState<Playlist | null>(null);
  const [playingOn, setPlayingOn] = useState<{ id: number; name: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tvId, setTvId] = useState<number | null>(tvs.find((t) => t.online)?.id ?? tvs[0]?.id ?? null);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saved, setSaved] = useState<{ id: number; name: string } | null>(null);
  const q = profileQuery(profile);

  const load = useCallback(async () => {
    try {
      const r = await api<{ quick: Playlist | null; playingOn: { id: number; name: string }[] }>(`/api/quick${q}`);
      setQuick(r.quick);
      setPlayingOn(r.playingOn);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not reach the hub.' });
    } finally {
      setLoaded(true);
    }
  }, [q]);
  useEffect(() => void load(), [load]);

  async function start() {
    setMsg(null);
    try {
      await api('/api/quick/start', { method: 'POST', body: { tvId, profile: profile ?? undefined } });
      setMsg({ ok: true, text: `Started the quick playlist on ${tvs.find((t) => t.id === tvId)?.name}` });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not reach the hub.' });
    }
  }

  async function save() {
    setMsg(null);
    try {
      const r = await api<{ playlist: { id: number; name: string } }>('/api/quick/save', { method: 'POST', body: { name } });
      setSaved(r.playlist);
      setMsg({ ok: true, text: `Saved as the playlist ${r.playlist.name}` });
      setQuick(null);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not save.' });
    }
  }

  async function clear() {
    setMsg(null);
    try {
      await api('/api/quick', { method: 'DELETE' });
      setMsg({ ok: true, text: 'Cleared the quick playlist' });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not reach the hub.' });
    }
  }

  const [first, ...rest] = quick?.items ?? [];
  return (
    <main className="main">
      <span className="s">Not saved. Pick titles as you go.</span>
      {loaded && !first && (
        <div className="card">
          <span className="t">No titles yet</span>
          <span className="s">In Browse, open a title and press Start quick playlist.</span>
        </div>
      )}
      {first && (
        <section className="card" aria-label="First title">
          <ItemRow i={first} />
          {playingOn.length === 0 ? (
            <div className="col" style={{ gap: 8 }}>
              <span className="t">Start now?</span>
              {tvs.length > 0 && (
                <select className="field" aria-label="TV" value={tvId ?? ''} onChange={(e) => setTvId(Number(e.target.value))}>
                  {tvs.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.online ? '' : ' (offline)'}
                    </option>
                  ))}
                </select>
              )}
              <div className="btns">
                <button type="button" className="btn dark" disabled={!tvId} onClick={() => void start()}>
                  <PlayIcon size={16} color="#FFFFFF" /> Start on {tvs.find((t) => t.id === tvId)?.name ?? 'a TV'}
                </button>
                <Link href={`/browse${q}`} className="btn">
                  Keep adding
                </Link>
              </div>
            </div>
          ) : (
            <div className="row">
              <span className="s">Playing on {playingOn.map((t) => t.name).join(' and ')}</span>
              <Link href={`/tvs/${playingOn[0].id}/queue`} className="chip">
                <QueueIcon size={14} /> Live queue
              </Link>
            </div>
          )}
        </section>
      )}
      {rest.length > 0 && (
        <>
          <span className="lbl">Up next</span>
          <section className="card" style={{ gap: 0 }} aria-label="Up next">
            {rest.map((i) => (
              <ItemRow key={i.id} i={i} />
            ))}
          </section>
        </>
      )}
      {quick && quick.hiddenCount > 0 && <span className="s">{quick.hiddenCount} more not shown for this profile.</span>}
      <Link href={`/browse${q}`} className="btn wide">
        <PlusIcon size={18} /> Add another title
      </Link>
      {role === 'adult' && first && (
        <section className="card" aria-label="Save as playlist">
          <label className="col" style={{ gap: 6 }}>
            <span className="lbl">Playlist name</span>
            <input className="field" aria-label="Playlist name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </label>
          <button type="button" className="btn pri wide" onClick={() => void save()}>
            Save as playlist
          </button>
        </section>
      )}
      {first && (
        <button type="button" className="btn" onClick={() => void clear()}>
          Clear quick playlist
        </button>
      )}
      {msg && (
        <p className={`msg ${msg.ok ? 'ok' : 'err'}`} role="status">
          {msg.text}
        </p>
      )}
      {saved && (
        <Link href={`/playlists/${saved.id}`} className="btn">
          Open {saved.name}
        </Link>
      )}
    </main>
  );
}
