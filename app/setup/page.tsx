'use client';
// First run: set the Adult PIN and the Guest PIN. No names, no accounts.
import { useEffect, useState } from 'react';
import { Logo } from '@/components/icons';

function PinField({ id, label, hint, value, onChange }: { id: string; label: string; hint: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="col" htmlFor={id} style={{ gap: 6 }}>
      <span className="t">{label}</span>
      <span className="s" id={`${id}-hint`}>
        {hint}
      </span>
      <input
        id={id}
        aria-label={label}
        aria-describedby={`${id}-hint`}
        className="field"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        pattern="[0-9]{4}"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
      />
    </label>
  );
}

export default function SetupPage() {
  const [adult, setAdult] = useState('');
  const [adult2, setAdult2] = useState('');
  const [guest, setGuest] = useState('');
  const [guest2, setGuest2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/auth/state', { cache: 'no-store' })
      .then((r) => r.json())
      .then((s: { setUp: boolean }) => {
        if (s.setUp) window.location.replace('/pin');
      })
      .catch(() => undefined);
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (adult.length !== 4 || guest.length !== 4) return setError('Each PIN is 4 digits.');
    if (adult !== adult2) return setError('The two Adult PINs do not match.');
    if (guest !== guest2) return setError('The two Guest PINs do not match.');
    if (adult === guest) return setError('The Adult PIN and the Guest PIN must be different.');
    setBusy(true);
    const res = await fetch('/api/auth/setup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ adultPin: adult, guestPin: guest }) });
    setBusy(false);
    if (res.ok || res.status === 409) {
      window.location.assign('/pin');
      return;
    }
    const b = (await res.json().catch(() => ({}))) as { error?: string };
    setError(b.error ?? 'Something went wrong.');
  }

  return (
    <main className="main" style={{ maxWidth: 480, margin: '0 auto', paddingTop: 40 }}>
      <div className="row" style={{ justifyContent: 'flex-start' }}>
        <span className="brand-mark">
          <Logo />
        </span>
        <h1 className="h1">Welcome to Popcorn Pilot</h1>
      </div>
      <p className="s">Set two 4 digit PINs. There are no names or accounts: the PIN decides what each person can do.</p>
      <form className="card" onSubmit={save}>
        <PinField id="adult" label="Adult PIN" hint="Full control: settings, profiles, approvals" value={adult} onChange={setAdult} />
        <PinField id="adult2" label="Adult PIN again" hint="Type it again to be sure" value={adult2} onChange={setAdult2} />
        <div className="sep" />
        <PinField id="guest" label="Guest PIN" hint="Kid mode and playlists only" value={guest} onChange={setGuest} />
        <PinField id="guest2" label="Guest PIN again" hint="Type it again to be sure" value={guest2} onChange={setGuest2} />
        {error && (
          <p className="msg err" role="alert">
            {error}
          </p>
        )}
        <button className="btn pri wide" type="submit" disabled={busy}>
          Save PINs
        </button>
      </form>
    </main>
  );
}
