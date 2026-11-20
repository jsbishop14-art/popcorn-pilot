// Small pieces shared by the kid safeguard screens (PP4): a toggle, a stepper, the time bar.
'use client';

export function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <button type="button" className="tog" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

export function Stepper({ value, label, step, min, max, words, onChange }: { value: number; label: string; step: number; min: number; max: number; words: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <div className="step kid-step">
      <button type="button" className="mini" aria-label={`Less ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>
        −
      </button>
      <span className="v kid-v" aria-label={label}>
        {words(value)}
      </span>
      <button type="button" className="mini" aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>
        +
      </button>
    </div>
  );
}

export function minutesWords(m: number): string {
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} min`;
  return r ? `${h} hr ${r} min` : `${h} hr`;
}

/** Time left as minutes plus a bar whose color fades from green to yellow to red (handoff 5.4). */
export function TimeBar({ percent, color, label }: { percent: number; color: string; label: string }) {
  return (
    <div className="bar kidbar" role="progressbar" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${percent}%`, background: color }} />
    </div>
  );
}
