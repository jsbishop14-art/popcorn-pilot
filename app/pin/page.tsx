'use client';
// PIN entry (mockup Pin). Adult PIN for full control, Guest PIN for kid mode and playlists.
import { useCallback, useEffect, useState } from 'react';
import { BackIcon, Logo } from '@/components/icons';

export default function PinPage() {
  const [digits, setDigits] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    setIdle(new URLSearchParams(window.location.search).get('idle') === '1');
    fetch('/api/auth/state', { cache: 'no-store' })
      .then((r) => r.json())
      .then((s: { setUp: boolean; lockedUntil: number | null }) => {
        if (!s.setUp) window.location.replace('/setup');
        if (s.lockedUntil) setLockedUntil(s.lockedUntil);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!lockedUntil) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [lockedUntil]);

  const locked = lockedUntil !== null && lockedUntil > now;
  const secondsLeft = locked ? Math.ceil((lockedUntil - now) / 1000) : 0;

  const submit = useCallback(async (pin: string) => {
    setBusy(true);
    try {
      const res = await fetch('/api/auth/pin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin }) });
      const b = (await res.json()) as { ok?: boolean; error?: string; triesLeft?: number; lockedUntil?: number };
      if (res.ok) {
        window.location.assign('/home');
        return;
      }
      setDigits('');
      if (b.lockedUntil) {
        setLockedUntil(b.lockedUntil);
        setNow(Date.now());
        setError(null);
      } else if (b.triesLeft !== undefined) setError(`Wrong PIN. ${b.triesLeft} ${b.triesLeft === 1 ? 'try' : 'tries'} left.`);
      else setError(b.error ?? 'Something went wrong.');
    } catch {
      setDigits('');
      setError('The hub did not answer. Try again.');
    } finally {
      setBusy(false);
    }
  }, []);

  const press = useCallback(
    (d: string) => {
      if (busy || locked) return;
      setError(null);
      setIdle(false);
      setDigits((cur) => {
        if (cur.length >= 4) return cur;
        const next = cur + d;
        if (next.length === 4) void submit(next);
        return next;
      });
    },
    [busy, locked, submit],
  );
  const del = useCallback(() => setDigits((cur) => cur.slice(0, -1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') del();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press, del]);

  return (
    <main className="pin">
      <span className="pin-mark">
        <Logo size={46} />
      </span>
      <div className="col" style={{ alignItems: 'center', gap: 6 }}>
        <h1 className="h1" style={{ flexGrow: 0 }}>
          Enter PIN
        </h1>
        <span className="s center">Adult PIN for full control · Guest PIN for kid mode and playlists</span>
      </div>
      <div className="pin-dots" role="img" aria-label={`${digits.length} of 4 digits entered`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`pin-dot${i < digits.length ? ' on' : ''}`} />
        ))}
      </div>
      <div aria-live="polite" style={{ minHeight: 40 }}>
        {locked && (
          <p className="msg err" role="alert">
            Too many wrong tries. Try again in {secondsLeft} s.
          </p>
        )}
        {!locked && error && (
          <p className="msg err" role="alert">
            {error}
          </p>
        )}
        {!locked && !error && idle && <p className="msg ok">Locked after no use. Enter your PIN.</p>}
      </div>
      <div className="pin-pad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" className="pin-key" aria-label={d} disabled={locked || busy} onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <span />
        <button type="button" className="pin-key" aria-label="0" disabled={locked || busy} onClick={() => press('0')}>
          0
        </button>
        <button type="button" className="pin-key ghost" aria-label="Delete" onClick={del}>
          <BackIcon size={26} />
        </button>
      </div>
    </main>
  );
}
