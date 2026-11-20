'use client';
// TV remote (mockup Remote): what is playing, arrows and OK, Back, Pause, Skip, volume and mute, Send to the other
// TV, Turn off TV. Pause and Skip act on the playlist when one is playing (so the hub's clock pauses too).
import { useState } from 'react';
import { api, ApiError } from '@/lib/client';
import type { TvView } from '@/lib/playback';
import { Progress, nowLine, usePlayback } from './Dashboard';
import { ArrowIcon, BackIcon, MuteIcon, PauseIcon, PlayIcon, PowerIcon, SendIcon, SkipIcon } from './icons';

export default function RemoteScreen({ tvId, initial }: { tvId: number; initial: TvView[] }) {
  const { tvs, setTvs, load } = usePlayback(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const list = tvs ?? [];
  const v = list.find((t) => t.tv.id === tvId);
  const pb = v?.playback ?? null;
  const line = v ? nowLine(v) : null;

  async function post(path: string, b: Record<string, unknown>) {
    setMsg(null);
    try {
      const r = await api<{ message: string; tvs?: TvView[] }>(`/api/tvs/${tvId}/${path}`, { method: 'POST', body: b });
      if (r.tvs) setTvs(r.tvs);
      else void load();
      setMsg({ ok: true, text: r.message });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not reach the hub.' });
    }
  }
  const key = (k: string) => void post('remote', { key: k });

  if (!v) return <main className="main">No such TV.</main>;
  return (
    <main className="main">
      <div className="row">
        <span className={`badge ${v.tv.online ? 'ok' : 'off'}`}>{v.tv.online ? 'Online' : 'Offline'}</span>
      </div>
      <section className="card" aria-label="Now playing">
        {pb && line ? (
          <>
            <div className="row">
              <div className="lft">
                {/* eslint-disable-next-line @next/next/no-img-element -- cover art is served and cached by the hub */}
                {pb.now?.item.poster ? <img className="thumb" src={pb.now.item.poster} alt="" /> : <span className="thumb" />}
                <div className="col">
                  <span className="t">{line.title}</span>
                  <span className="s">{line.sub}</span>
                </div>
              </div>
              {pb.kid && <span className="badge ok">Kid mode</span>}
            </div>
            <Progress percent={pb.now?.percent ?? null} label="Progress" />
          </>
        ) : (
          <span className="s">Nothing playing from Popcorn Pilot.</span>
        )}
      </section>
      <div className="dpad" role="group" aria-label="Arrows">
        <button type="button" className="u" aria-label="Up" onClick={() => key('Up')}>
          <ArrowIcon dir="up" />
        </button>
        <button type="button" className="d" aria-label="Down" onClick={() => key('Down')}>
          <ArrowIcon dir="down" />
        </button>
        <button type="button" className="l" aria-label="Left" onClick={() => key('Left')}>
          <ArrowIcon dir="left" />
        </button>
        <button type="button" className="r" aria-label="Right" onClick={() => key('Right')}>
          <ArrowIcon dir="right" />
        </button>
        <button type="button" className="ok" onClick={() => key('Select')}>
          OK
        </button>
      </div>
      <div className="grid3">
        <button type="button" className="btn" onClick={() => key('Back')}>
          <BackIcon size={18} /> Back
        </button>
        <button
          type="button"
          className="btn dark"
          onClick={() => (pb ? void post('playback', { action: pb.state === 'paused' ? 'resume' : 'pause' }) : key('Play'))}
        >
          {pb?.state === 'paused' ? <PlayIcon size={18} color="#FFFFFF" /> : <PauseIcon size={18} color="#FFFFFF" />} {pb?.state === 'paused' ? 'Play' : 'Pause'}
        </button>
        <button type="button" className="btn" disabled={!pb} onClick={() => void post('playback', { action: 'skip' })}>
          <SkipIcon size={18} /> Skip
        </button>
        <button type="button" className="btn" onClick={() => key('VolumeDown')}>
          Vol −
        </button>
        <button type="button" className="btn" aria-label="Mute" onClick={() => key('VolumeMute')}>
          <MuteIcon size={18} />
        </button>
        <button type="button" className="btn" onClick={() => key('VolumeUp')}>
          Vol +
        </button>
      </div>
      <div className="grid2">
        {list
          .filter((o) => o.tv.id !== tvId)
          .map((o) => (
            <button key={o.tv.id} type="button" className="btn pri" disabled={!pb} onClick={() => void post('send', { toTvId: o.tv.id })}>
              <SendIcon size={18} /> Send to {o.tv.name}
            </button>
          ))}
        <button type="button" className="btn" onClick={() => key('PowerOff')}>
          <PowerIcon size={18} /> Turn off TV
        </button>
      </div>
      {msg && (
        <p className={`msg ${msg.ok ? 'ok' : 'err'}`} role="status">
          {msg.text}
        </p>
      )}
    </main>
  );
}
