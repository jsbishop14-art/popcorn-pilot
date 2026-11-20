'use client';
// Show options (mockup ShowOptions): how much of a title to play. Shows: number of episodes, stay on show, time on
// show, run indefinitely. Movies: whole movie or run indefinitely. The Family Album: a set time or run indefinitely.
import { useState } from 'react';

export type Mode = 'episodes' | 'stay' | 'time' | 'indefinite';
export interface ModeValue {
  mode: Mode;
  episodes: number;
  minutes: number;
}

const TIMES = [15, 20, 30, 45, 60, 90, 120, 180];

export default function ShowOptions({
  name,
  sub,
  kind,
  value,
  onDone,
  onCancel,
}: {
  name: string;
  sub: string;
  kind: 'show' | 'movie' | 'album';
  value: ModeValue;
  onDone: (v: ModeValue) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState<ModeValue>(value);
  const opt = (mode: Mode, title: string, desc: string, extra?: React.ReactNode) => (
    <div className="card opt" role="radio" aria-checked={v.mode === mode} aria-label={title} tabIndex={0} onClick={() => setV({ ...v, mode })} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setV({ ...v, mode })}>
      <div className="row">
        <div className="col">
          <span className="t">{title}</span>
          <span className="s">{desc}</span>
        </div>
        {extra}
      </div>
    </div>
  );
  const minutes = (
    <select
      className="field"
      style={{ width: 'auto' }}
      aria-label="Minutes"
      value={v.minutes}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setV({ ...v, mode: 'time', minutes: Number(e.target.value) })}
    >
      {[...new Set([...TIMES, v.minutes])].sort((a, b) => a - b).map((m) => (
        <option key={m} value={m}>
          {m} min
        </option>
      ))}
    </select>
  );
  return (
    <div className="sheet-bg" onClick={onCancel}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Show options" onClick={(e) => e.stopPropagation()}>
        <h2 className="h2" style={{ fontSize: 22 }}>
          How much {name}?
        </h2>
        <span className="s">{sub}</span>
        <div role="radiogroup" aria-label="How much" className="col" style={{ gap: 10 }}>
          {kind === 'show' &&
            opt(
              'episodes',
              'Number of episodes',
              'Then move to the next title',
              <div className="step" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="mini" aria-label="Fewer episodes" onClick={() => setV({ ...v, mode: 'episodes', episodes: Math.max(1, v.episodes - 1) })}>
                  −
                </button>
                <span className="v" aria-label="Episodes">
                  {v.episodes}
                </span>
                <button type="button" className="mini" aria-label="More episodes" onClick={() => setV({ ...v, mode: 'episodes', episodes: Math.min(99, v.episodes + 1) })}>
                  +
                </button>
              </div>,
            )}
          {kind === 'movie' && opt('episodes', 'Whole movie', 'Then move to the next title')}
          {kind === 'show' && opt('stay', 'Stay on show', 'Keep playing episodes until the playlist is stopped')}
          {kind === 'show' && opt('time', 'Time on show', 'Play for a set time, stop at the end of an episode', minutes)}
          {kind === 'album' && opt('time', 'Set time', 'Photos and clips for a set time', minutes)}
          {opt('indefinite', 'Run indefinitely', 'Keep going, ignore playlist order')}
        </div>
        <div className="btns">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn pri" onClick={() => onDone(v)}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
