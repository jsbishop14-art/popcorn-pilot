'use client';
// The Dashboard (mockup PhoneDashboard): requests first (PP4), then each TV with whether it is online, what it is
// playing (title, service, playlist, place in the playlist), progress, and its controls. Refreshes every 10 seconds.
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/client';
import type { TvView } from '@/lib/playback';
import { PauseIcon, PlayIcon, PowerIcon, QueueIcon, SendIcon, SkipIcon } from './icons';

export function nowLine(v: TvView): { title: string; sub: string } | null {
  const pb = v.playback;
  if (!pb) return null;
  const n = pb.now;
  if (!n) return { title: pb.name, sub: pb.state === 'paused' ? 'Paused' : 'Starting the next title' };
  const ep = n.episode ? ` · E${n.episode}${n.episodes ? ` of ${n.episodes}` : ''}` : '';
  const place = pb.index ? ` · ${pb.index} of ${pb.count}` : '';
  return { title: `${n.item.name}${ep}`, sub: `${n.item.serviceName} · ${pb.quick ? 'Quick playlist' : pb.name}${place}` };
}

export function Progress({ percent, label }: { percent: number | null; label: string }) {
  if (percent === null) return null;
  return (
    <div className="bar" role="progressbar" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}

export function usePlayback(initial: TvView[] | null) {
  const [tvs, setTvs] = useState<TvView[] | null>(initial);
  const load = useCallback(async () => {
    try {
      setTvs((await api<{ tvs: TvView[] }>('/api/playback')).tvs);
    } catch {
      // keep what is shown
    }
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
  }, [load]);
  return { tvs, setTvs, load };
}

export default function Dashboard({ initial, isAdult }: { initial: TvView[]; isAdult: boolean }) {
  const { tvs, setTvs, load } = usePlayback(initial);
  const [checking, setChecking] = useState(true);
  const [msg, setMsg] = useState<{ tv: number; ok: boolean; text: string } | null>(null);
  const [sendFrom, setSendFrom] = useState<number | null>(null);

  useEffect(() => {
    api('/api/tvs/refresh', { method: 'POST', body: {} })
      .then(() => load())
      .catch(() => undefined)
      .finally(() => setChecking(false));
  }, [load]);

  async function act(tvId: number, path: string, b: Record<string, unknown>) {
    setMsg(null);
    try {
      const r = await api<{ message: string; tvs?: TvView[] }>(`/api/tvs/${tvId}/${path}`, { method: 'POST', body: b });
      if (r.tvs) setTvs(r.tvs);
      else void load();
      setMsg({ tv: tvId, ok: true, text: r.message });
    } catch (e) {
      setMsg({ tv: tvId, ok: false, text: e instanceof ApiError ? e.message : 'Could not reach the hub.' });
    }
    setSendFrom(null);
  }

  const list = tvs ?? [];
  return (
    <>
      <section className="card" aria-label="Requests">
        <div className="row">
          <h2 className="h2">Requests</h2>
        </div>
        <span className="s">Requests for more time or a new title come from the kid screens on the TV (PP4).</span>
      </section>
      {!list.length && (
        <div className="card">
          <span className="t">No TVs yet</span>
          <span className="s">{isAdult ? 'Add the TVs in Settings.' : 'An adult adds the TVs in Settings.'}</span>
        </div>
      )}
      {list.map((v) => {
        const pb = v.playback;
        const line = nowLine(v);
        const others = list.filter((o) => o.tv.id !== v.tv.id);
        return (
          <section key={v.tv.id} className="card" aria-label={`${v.tv.name} TV`}>
            <div className="row">
              <div className="lft">
                <span className="dot" style={{ background: v.tv.online ? '#2E9E6B' : '#9AA6BD' }} aria-hidden="true" />
                <h2 className="h2">{v.tv.name}</h2>
              </div>
              <div className="chips">
                {pb?.kid && <span className="badge ok">Kid mode</span>}
                <span className={`badge ${v.tv.online ? 'ok' : 'off'}`}>{checking ? 'Checking…' : v.tv.online ? 'Online' : 'Offline'}</span>
              </div>
            </div>
            {pb && line ? (
              <>
                <div className="lft">
                  {/* eslint-disable-next-line @next/next/no-img-element -- cover art is served and cached by the hub */}
                  {pb.now?.item.poster ? <img className="thumb" src={pb.now.item.poster} alt="" /> : <span className="thumb" />}
                  <div className="col">
                    <span className="t">{line.title}</span>
                    <span className="s">{line.sub}</span>
                  </div>
                </div>
                <Progress percent={pb.now?.percent ?? null} label={`${v.tv.name} progress`} />
                <span className="s">
                  {pb.state === 'paused' ? 'Paused' : 'Playing'}
                  {pb.profileName ? ` · ${pb.profileName}` : ''}
                  {pb.now?.leftMin !== null && pb.now?.leftMin !== undefined ? ` · about ${pb.now.leftMin} min left on this title` : ''}
                </span>
                {pb.message && (
                  <p className="msg err" role="status">
                    {pb.message}
                  </p>
                )}
                <div className="grid3">
                  <button type="button" className="btn" onClick={() => void act(v.tv.id, 'playback', { action: pb.state === 'paused' ? 'resume' : 'pause' })}>
                    {pb.state === 'paused' ? <PlayIcon size={16} /> : <PauseIcon size={16} />} {pb.state === 'paused' ? 'Resume' : 'Pause'}
                  </button>
                  <button type="button" className="btn" onClick={() => void act(v.tv.id, 'playback', { action: 'skip' })}>
                    <SkipIcon size={16} /> Skip
                  </button>
                  <button type="button" className="btn" onClick={() => void act(v.tv.id, 'playback', { action: 'stop' })}>
                    Stop
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className="s">
                  {v.tv.room || 'No room set'}
                  {v.tv.defaultProfileName ? ` · starts as ${v.tv.defaultProfileName}` : ''} · Nothing playing
                </span>
                {v.lastMessage && (
                  <p className="msg err" role="status">
                    {v.lastMessage}
                  </p>
                )}
              </>
            )}
            <div className="btns">
              <Link href={`/tvs/${v.tv.id}/queue`} className="btn">
                <QueueIcon size={16} /> Queue
              </Link>
              {isAdult && (
                <Link href={`/tvs/${v.tv.id}/remote`} className="btn">
                  Remote
                </Link>
              )}
              {isAdult && pb && others.length > 0 && (
                <button type="button" className="btn" aria-expanded={sendFrom === v.tv.id} onClick={() => setSendFrom(sendFrom === v.tv.id ? null : v.tv.id)}>
                  <SendIcon size={16} /> Send to…
                </button>
              )}
              {!pb && (
                <Link href="/playlists" className="btn pri">
                  <PlayIcon size={16} /> Start a playlist
                </Link>
              )}
              {isAdult && !pb && (
                <button type="button" className="btn" onClick={() => void act(v.tv.id, 'remote', { key: 'PowerOn' })}>
                  <PowerIcon size={16} /> Turn on
                </button>
              )}
            </div>
            {sendFrom === v.tv.id && (
              <div className="chips" role="group" aria-label={`Send ${v.tv.name} to`}>
                {others.map((o) => (
                  <button key={o.tv.id} type="button" className="chip" onClick={() => void act(v.tv.id, 'send', { toTvId: o.tv.id })}>
                    Send to {o.tv.name}
                  </button>
                ))}
              </div>
            )}
            {msg && msg.tv === v.tv.id && (
              <p className={`msg ${msg.ok ? 'ok' : 'err'}`} role="status">
                {msg.text}
              </p>
            )}
          </section>
        );
      })}
    </>
  );
}
