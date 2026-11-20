'use client';
// Settings (mockup Settings): TVs, PINs and lock time, hub status. Family Album and ad blocking arrive in PP5.
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/client';
import { ChevronIcon, HistoryIcon, HubIcon, LockIcon, PlusIcon, TvIcon, WifiIcon } from './icons';
import { ComingLaterInline } from './ComingLaterInline';

interface Tv {
  id: number;
  name: string;
  room: string;
  address: string;
  port: number;
  online: boolean;
  defaultProfileName: string | null;
}
interface Found {
  address: string;
  port: number;
  name: string;
  model: string;
  added: boolean;
}
interface Hub {
  version: string;
  builtAt: string | null;
  uptimeSeconds: number;
  node: string;
  arch: string;
  lastBackup: string | null;
  lastUpdate: { at: string; result: string; message?: string } | null;
  updateRequested: boolean;
}

function addr(t: { address: string; port: number }) {
  return t.port === 8060 ? t.address : `${t.address}:${t.port}`;
}

function uptime(s: number) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return d ? `up ${d} day${d === 1 ? '' : 's'}` : `up ${h} h ${Math.floor((s % 3600) / 60)} min`;
}

function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'never';
}

const UPDATE_WORDS: Record<string, string> = {
  updated: 'Updated',
  up_to_date: 'Already up to date',
  rolled_back: 'An update failed its checks and was rolled back',
  failed: 'The last update failed',
};

export default function SettingsScreen({ initialTvs }: { initialTvs: Tv[] }) {
  const [tvs, setTvs] = useState<Tv[]>(initialTvs);
  const [checking, setChecking] = useState(true);
  const [found, setFound] = useState<Found[] | null>(null);
  const [finding, setFinding] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [address, setAddress] = useState('');
  const [newName, setNewName] = useState('');
  const [tvMsg, setTvMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [lockMinutes, setLockMinutes] = useState<number | null>(null);
  const [lockChoices, setLockChoices] = useState<number[]>([]);
  const [pinWhich, setPinWhich] = useState<'adult' | 'guest' | null>(null);
  const [current, setCurrent] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPin2, setNewPin2] = useState('');
  const [pinMsg, setPinMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [hub, setHub] = useState<Hub | null>(null);
  const [hubMsg, setHubMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      setTvs((await api<{ tvs: Tv[] }>('/api/tvs/refresh', { method: 'POST', body: {} })).tvs);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refresh().catch(() => undefined);
    api<{ lockMinutes: number; lockChoices: number[] }>('/api/settings')
      .then((s) => {
        setLockMinutes(s.lockMinutes);
        setLockChoices(s.lockChoices);
      })
      .catch(() => undefined);
    api<{ hub: Hub }>('/api/hub/status')
      .then((r) => setHub(r.hub))
      .catch(() => undefined);
  }, [refresh]);

  async function find() {
    setFinding(true);
    setTvMsg(null);
    try {
      setFound((await api<{ found: Found[] }>('/api/tvs/discover', { method: 'POST', body: {} })).found);
    } catch (e) {
      setTvMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not search.' });
    } finally {
      setFinding(false);
    }
  }

  async function add(a: string, name?: string) {
    setTvMsg(null);
    try {
      const r = await api<{ tv: Tv }>('/api/tvs', { method: 'POST', body: { address: a, name: name || undefined } });
      setTvs((cur) => [...cur, r.tv].sort((x, y) => x.name.localeCompare(y.name)));
      setFound((cur) => cur?.map((f) => (addr(f) === addr(r.tv) ? { ...f, added: true } : f)) ?? null);
      setTvMsg({ ok: true, text: `Added ${r.tv.name}${r.tv.online ? '' : '. It did not answer, so it shows as offline.'}` });
      setAddress('');
      setNewName('');
      setShowAdd(false);
    } catch (e) {
      setTvMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not add the TV.' });
    }
  }

  async function saveLock(n: number) {
    const r = await api<{ lockMinutes: number }>('/api/settings', { method: 'PATCH', body: { lockMinutes: n } });
    setLockMinutes(r.lockMinutes);
  }

  async function changePin(e: React.FormEvent) {
    e.preventDefault();
    if (!pinWhich) return;
    if (newPin !== newPin2) return setPinMsg({ ok: false, text: 'The two new PINs do not match.' });
    try {
      await api('/api/settings/pins', { method: 'POST', body: { which: pinWhich, currentAdultPin: current, newPin } });
      setPinMsg({ ok: true, text: `${pinWhich === 'adult' ? 'Adult' : 'Guest'} PIN changed.` });
      setPinWhich(null);
      setCurrent('');
      setNewPin('');
      setNewPin2('');
    } catch (err) {
      setPinMsg({ ok: false, text: err instanceof ApiError ? err.message : 'Could not change the PIN.' });
    }
  }

  async function checkUpdates() {
    await api('/api/hub/update', { method: 'POST', body: {} });
    setHubMsg('The hub will check for updates within a minute. If there is one, the app restarts by itself.');
    setHub((h) => (h ? { ...h, updateRequested: true } : h));
  }

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 4);

  return (
    <main className="main">
      <span className="lbl">TVs</span>
      {tvs.length === 0 && (
        <div className="card">
          <span className="t">No TVs yet</span>
          <span className="s">Find the Rokus on the home network, or type a TV address.</span>
        </div>
      )}
      {tvs.length > 0 && (
        <div className="card" style={{ gap: 0 }}>
          {tvs.map((tv, i) => (
            <div key={tv.id}>
              {i > 0 && <div className="sep" />}
              <Link href={`/settings/tvs/${tv.id}`} className="rowlink" aria-label={`TV ${tv.name}`} style={{ padding: '10px 0' }}>
                <div className="lft">
                  <TvIcon />
                  <div className="col">
                    <span className="t">{tv.name}</span>
                    <span className="s">
                      Roku · {addr(tv)}
                      {tv.room ? ` · ${tv.room}` : ''}
                    </span>
                    <span className="s">Default profile: {tv.defaultProfileName ?? 'none'}</span>
                  </div>
                </div>
                <div className="lft" style={{ gap: 6 }}>
                  <span className={`badge ${tv.online ? 'ok' : 'off'}`}>{checking ? 'Checking…' : tv.online ? 'Online' : 'Offline'}</span>
                  <ChevronIcon size={18} />
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
      <div className="btns">
        <button type="button" className="btn" onClick={() => void find()} disabled={finding}>
          <WifiIcon size={20} /> {finding ? 'Looking…' : 'Find TVs on the network'}
        </button>
        <button type="button" className="btn" onClick={() => setShowAdd((v) => !v)} aria-expanded={showAdd}>
          <PlusIcon size={20} /> Add by address
        </button>
      </div>
      {found && (
        <div className="card" aria-label="TVs found">
          <span className="t">{found.length ? `Found ${found.length} ${found.length === 1 ? 'TV' : 'TVs'}` : 'No Rokus answered'}</span>
          {!found.length && <span className="s">Check the Roku is on and &ldquo;Control by mobile apps&rdquo; allows network access, or add it by address.</span>}
          {found.map((f) => (
            <div key={addr(f)} className="row">
              <div className="col">
                <span className="t">{f.name}</span>
                <span className="s">
                  {f.model || 'Roku'} · {addr(f)}
                </span>
              </div>
              {f.added ? (
                <span className="badge soft">Added</span>
              ) : (
                <button type="button" className="btn pri" onClick={() => void add(addr(f))} aria-label={`Add ${f.name}`}>
                  Add
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {showAdd && (
        <form
          className="card"
          aria-label="Add a TV by address"
          onSubmit={(e) => {
            e.preventDefault();
            void add(address, newName);
          }}
        >
          <label className="col" style={{ gap: 6 }}>
            <span className="t">TV address</span>
            <span className="s">On the Roku: Settings, Network, About. Like 192.168.1.40</span>
            <input className="field" value={address} onChange={(e) => setAddress(e.target.value)} aria-label="TV address" inputMode="decimal" />
          </label>
          <label className="col" style={{ gap: 6 }}>
            <span className="t">Name (optional)</span>
            <input className="field" value={newName} maxLength={40} onChange={(e) => setNewName(e.target.value)} aria-label="TV name" />
          </label>
          <button type="submit" className="btn pri wide">
            Add TV
          </button>
        </form>
      )}
      {tvMsg && (
        <p className={`msg ${tvMsg.ok ? 'ok' : 'err'}`} role="status">
          {tvMsg.text}
        </p>
      )}

      <span className="lbl">Family Album</span>
      <ComingLaterInline text="The iCloud shared album link arrives in PP5." />

      <span className="lbl">PINs</span>
      <div className="card">
        <div className="row">
          <div className="lft">
            <LockIcon />
            <div className="col">
              <span className="t">Lock the app after</span>
              <span className="s">{lockMinutes ?? '…'} min of no use</span>
            </div>
          </div>
          <select className="field" style={{ width: 110 }} aria-label="Lock the app after" value={lockMinutes ?? ''} onChange={(e) => void saveLock(Number(e.target.value))}>
            {lockChoices.map((n) => (
              <option key={n} value={n}>
                {n} min
              </option>
            ))}
          </select>
        </div>
        <div className="sep" />
        <div className="btns">
          <button type="button" className="btn" onClick={() => { setPinWhich('adult'); setPinMsg(null); }}>
            Change Adult PIN
          </button>
          <button type="button" className="btn" onClick={() => { setPinWhich('guest'); setPinMsg(null); }}>
            Change Guest PIN
          </button>
        </div>
        {pinWhich && (
          <form className="col" style={{ gap: 10 }} onSubmit={(e) => void changePin(e)} aria-label={`Change ${pinWhich} PIN`}>
            <label className="col" style={{ gap: 6 }}>
              <span className="t">Current Adult PIN</span>
              <input className="field" type="password" inputMode="numeric" value={current} onChange={(e) => setCurrent(digits(e.target.value))} aria-label="Current Adult PIN" />
            </label>
            <label className="col" style={{ gap: 6 }}>
              <span className="t">New {pinWhich === 'adult' ? 'Adult' : 'Guest'} PIN</span>
              <input className="field" type="password" inputMode="numeric" value={newPin} onChange={(e) => setNewPin(digits(e.target.value))} aria-label="New PIN" />
            </label>
            <label className="col" style={{ gap: 6 }}>
              <span className="t">New PIN again</span>
              <input className="field" type="password" inputMode="numeric" value={newPin2} onChange={(e) => setNewPin2(digits(e.target.value))} aria-label="New PIN again" />
            </label>
            <div className="btns">
              <button type="button" className="btn" onClick={() => setPinWhich(null)}>
                Cancel
              </button>
              <button type="submit" className="btn pri">
                Save PIN
              </button>
            </div>
          </form>
        )}
        {pinMsg && (
          <p className={`msg ${pinMsg.ok ? 'ok' : 'err'}`} role="status">
            {pinMsg.text}
          </p>
        )}
      </div>

      <span className="lbl">Ad blocking</span>
      <ComingLaterInline text="Home screen ad and tracking blocking arrives in PP5." />

      <span className="lbl">Hub</span>
      <div className="card" style={{ gap: 0 }}>
        <div className="row" style={{ padding: '6px 0' }}>
          <div className="lft">
            <HubIcon />
            <div className="col">
              <span className="t">Raspberry Pi</span>
              <span className="s">{hub ? `Online · ${uptime(hub.uptimeSeconds)} · version ${hub.version.slice(0, 7)}` : 'Checking…'}</span>
              {hub && <span className="s">Last backup: {when(hub.lastBackup)}</span>}
              {hub && (
                <span className="s">
                  Last update: {hub.lastUpdate ? `${UPDATE_WORDS[hub.lastUpdate.result] ?? hub.lastUpdate.result}, ${when(hub.lastUpdate.at)}` : 'none yet'}
                </span>
              )}
            </div>
          </div>
          <span className="badge ok">OK</span>
        </div>
        <div className="sep" />
        <div style={{ padding: '10px 0' }}>
          <button type="button" className="btn wide" onClick={() => void checkUpdates()} disabled={hub?.updateRequested}>
            {hub?.updateRequested ? 'Update check requested' : 'Check for updates now'}
          </button>
          {hubMsg && (
            <p className="msg ok" role="status">
              {hubMsg}
            </p>
          )}
        </div>
        <div className="sep" />
        <Link href="/settings/activity" className="rowlink">
          <div className="lft">
            <HistoryIcon />
            <div className="col">
              <span className="t">Activity history</span>
              <span className="s">Adult and guest changes</span>
            </div>
          </div>
          <ChevronIcon size={18} />
        </Link>
      </div>
    </main>
  );
}
