'use client';
// Settings (mockup Settings): TVs, the Family Album link (counts and last sync), PINs and lock time, ad blocking (on
// or off and blocked today; on a Windows or Mac hub "Not set up on this computer"), titles and cover art, the hub:
// which computer it runs on and the address to open on a phone, with a QR code (PP7).
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/client';
import { ChevronIcon, HistoryIcon, HubIcon, LockIcon, MoonIcon, PlusIcon, ShieldIcon, TvIcon, WifiIcon } from './icons';
import { Toggle } from './PlaylistEditor';
import QrCode from './QrCode';

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
  host: 'windows' | 'mac' | 'pi' | 'linux';
  hostLabel: string;
  address: string;
  version: string;
  builtAt: string | null;
  uptimeSeconds: number;
  node: string;
  arch: string;
  lastBackup: string | null;
  lastUpdate: { at: string; result: string; message?: string } | null;
  updateRequested: boolean;
}

interface Catalog {
  source: 'tmdb' | 'stub';
  tmdbKeySet: boolean;
  calmCount: number;
}

interface Album {
  linkSet: boolean;
  link: string | null;
  photos: number;
  clips: number;
  syncing: boolean;
  everyHours: number;
  lastSync: { at: number; ok: boolean; added: number; updated: number; removed: number; message: string | null } | null;
  lastGood: number | null;
}

interface AdBlock {
  state: 'on' | 'off' | 'unavailable' | 'not_set_up';
  blockedToday: number | null;
  queriesToday: number | null;
  message: string | null;
}

function n(x: number, word: string) {
  return `${x.toLocaleString('en-US')} ${word}${x === 1 ? '' : 's'}`;
}

/** "412 photos · 24 clips · synced 6:00 PM" (mockup Settings). */
function albumWords(a: Album): string {
  if (!a.linkSet) return 'No album yet. In the Photos app, open the shared album, tap People, turn on Public Website and copy the link here.';
  const counts = `${n(a.photos, 'photo')} · ${n(a.clips, 'clip')}`;
  const good = a.lastSync?.ok ? a.lastSync.at : a.lastGood;
  if (!good) return `${counts} · not synced yet`;
  const d = new Date(good);
  const today = new Date().toDateString() === d.toDateString();
  return `${counts} · synced ${today ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · every ${a.everyHours} hours`;
}

function adWords(a: AdBlock): string {
  if (a.state === 'not_set_up') return a.message ?? 'Not set up on this computer';
  if (a.state === 'unavailable') return a.message ?? 'Ad blocking is not answering on the hub.';
  if (a.state === 'off') return `Off: home screen ads are not blocked${a.blockedToday !== null ? ` (${n(a.blockedToday, 'request')} blocked earlier today)` : ''}`;
  return a.blockedToday !== null ? `${n(a.blockedToday, 'request')} blocked today` : 'On';
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

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [tmdbKey, setTmdbKey] = useState('');
  const [tmdbMsg, setTmdbMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [album, setAlbum] = useState<Album | null>(null);
  const [albumLinkText, setAlbumLinkText] = useState('');
  const [albumBusy, setAlbumBusy] = useState(false);
  const [albumMsg, setAlbumMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [adblock, setAdblock] = useState<AdBlock | null>(null);
  const [adMsg, setAdMsg] = useState<string | null>(null);

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
    api<{ lockMinutes: number; lockChoices: number[]; catalog: Catalog; album: Album }>('/api/settings')
      .then((s) => {
        setLockMinutes(s.lockMinutes);
        setLockChoices(s.lockChoices);
        setCatalog(s.catalog);
        setAlbum(s.album);
        setAlbumLinkText(s.album.link ?? '');
      })
      .catch(() => undefined);
    api<{ adblock: AdBlock }>('/api/adblock')
      .then((r) => setAdblock(r.adblock))
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

  async function saveTmdb(e: React.FormEvent) {
    e.preventDefault();
    setTmdbMsg(null);
    try {
      const r = await api<{ catalog: Catalog }>('/api/settings', { method: 'PATCH', body: { tmdbKey: tmdbKey.trim() } });
      setCatalog(r.catalog);
      setTmdbKey('');
      setTmdbMsg({ ok: true, text: 'TMDB key saved. Browse now shows titles from TMDB.' });
    } catch (err) {
      setTmdbMsg({ ok: false, text: err instanceof ApiError ? err.message : 'Could not save the key.' });
    }
  }

  async function removeTmdb() {
    setTmdbMsg(null);
    const r = await api<{ catalog: Catalog }>('/api/settings', { method: 'PATCH', body: { tmdbKey: null } });
    setCatalog(r.catalog);
    setTmdbMsg({ ok: true, text: 'TMDB key removed. Browse shows the sample catalog.' });
  }

  async function syncNow(): Promise<void> {
    setAlbumBusy(true);
    setAlbumMsg(null);
    try {
      const r = await api<{ result: { ok: boolean; added: number; updated: number; removed: number }; album: Album }>('/api/album/sync', { method: 'POST', body: {} });
      setAlbum(r.album);
      if (r.result.ok) setAlbumMsg({ ok: true, text: `Synced: ${r.result.added} added, ${r.result.updated} updated, ${r.result.removed} removed.` });
    } catch (e) {
      setAlbumMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not sync the album.' });
    } finally {
      setAlbumBusy(false);
    }
  }

  async function saveAlbum(e: React.FormEvent) {
    e.preventDefault();
    setAlbumMsg(null);
    try {
      const r = await api<{ album: Album }>('/api/settings', { method: 'PATCH', body: { albumLink: albumLinkText.trim() } });
      setAlbum(r.album);
      setAlbumLinkText(r.album.link ?? '');
    } catch (err) {
      setAlbumMsg({ ok: false, text: err instanceof ApiError ? err.message : 'Could not save the link.' });
      return;
    }
    await syncNow();
  }

  async function removeAlbum() {
    setAlbumMsg(null);
    const r = await api<{ album: Album }>('/api/settings', { method: 'PATCH', body: { albumLink: null } });
    setAlbum(r.album);
    setAlbumLinkText('');
    setAlbumMsg({ ok: true, text: 'Album link removed. The photos were cleared from the hub (they stay in iCloud).' });
  }

  async function setAdblockOn(on: boolean) {
    setAdMsg(null);
    try {
      setAdblock((await api<{ adblock: AdBlock }>('/api/adblock', { method: 'PATCH', body: { on } })).adblock);
    } catch (e) {
      setAdMsg(e instanceof ApiError ? e.message : 'Ad blocking did not answer.');
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
      <div className="card" aria-label="Family Album" role="region">
        <form className="col" style={{ gap: 8 }} onSubmit={(e) => void saveAlbum(e)}>
          <label className="col" style={{ gap: 6 }}>
            <span className="t">iCloud shared album link</span>
            <input className="field" type="url" autoComplete="off" value={albumLinkText} onChange={(e) => setAlbumLinkText(e.target.value)} aria-label="iCloud shared album link" placeholder="https://www.icloud.com/sharedalbum/#…" />
          </label>
          <span className="s" role="note">
            {album === null ? 'Checking…' : albumWords(album)}
          </span>
          <div className="btns">
            <button type="submit" className="btn pri" disabled={!albumLinkText.trim() || albumLinkText.trim() === (album?.link ?? '') || albumBusy}>
              Save link
            </button>
            {album?.linkSet && (
              <button type="button" className="btn" onClick={() => void syncNow()} disabled={albumBusy}>
                {albumBusy ? 'Syncing…' : 'Sync now'}
              </button>
            )}
            {album?.linkSet && (
              <button type="button" className="btn" onClick={() => void removeAlbum()} disabled={albumBusy}>
                Remove link
              </button>
            )}
          </div>
        </form>
        {album?.lastSync && !album.lastSync.ok && (
          <p className="msg err" role="alert">
            Last sync failed: {album.lastSync.message}
            {album.lastGood ? ` The photos from ${when(new Date(album.lastGood).toISOString())} are still shown.` : ''}
          </p>
        )}
        {albumMsg && (
          <p className={`msg ${albumMsg.ok ? 'ok' : 'err'}`} role="status">
            {albumMsg.text}
          </p>
        )}
      </div>

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
      <div className="card" aria-label="Ad blocking" role="region">
        <div className="row">
          <div className="lft">
            <ShieldIcon />
            <div className="col">
              <span className="t">Block home screen ads and tracking</span>
              <span className="s" role="note">
                {adblock === null ? 'Checking…' : adWords(adblock)}
              </span>
            </div>
          </div>
          {adblock && (adblock.state === 'on' || adblock.state === 'off') && <Toggle on={adblock.state === 'on'} label="Ad blocking" onChange={(on) => void setAdblockOn(on)} />}
          {adblock?.state === 'unavailable' && <span className="badge off">Not answering</span>}
          {adblock?.state === 'not_set_up' && <span className="badge off">Not set up</span>}
        </div>
        {adMsg && (
          <p className="msg err" role="alert">
            {adMsg}
          </p>
        )}
      </div>

      <span className="lbl">Titles and cover art</span>
      <div className="card" aria-label="Titles and cover art" role="region">
        <div className="col">
          <span className="t">TMDB key</span>
          <span className="s" role="note">
            {catalog === null
              ? 'Checking…'
              : catalog.source === 'tmdb'
                ? 'Titles, cover art and trailers come from TMDB.'
                : 'No TMDB key yet: Browse shows a built-in sample catalog. Get a free key at themoviedb.org (Settings, API).'}
          </span>
        </div>
        <form className="col" style={{ gap: 8 }} onSubmit={(e) => void saveTmdb(e)}>
          <input className="field" type="password" autoComplete="off" value={tmdbKey} onChange={(e) => setTmdbKey(e.target.value)} aria-label="TMDB key" placeholder={catalog?.tmdbKeySet ? 'A key is saved. Type a new one to replace it.' : 'Paste the TMDB API key'} />
          <div className="btns">
            <button type="submit" className="btn pri" disabled={!tmdbKey.trim()}>
              Save key
            </button>
            {catalog?.tmdbKeySet && (
              <button type="button" className="btn" onClick={() => void removeTmdb()}>
                Remove key
              </button>
            )}
          </div>
        </form>
        {tmdbMsg && (
          <p className={`msg ${tmdbMsg.ok ? 'ok' : 'err'}`} role="status">
            {tmdbMsg.text}
          </p>
        )}
      </div>

      <span className="lbl">Hub</span>
      <div className="card" style={{ gap: 0 }} aria-label="Hub" role="region">
        <div className="row" style={{ padding: '6px 0' }}>
          <div className="lft">
            <HubIcon />
            <div className="col">
              <span className="t">{hub ? hub.hostLabel : 'Hub'}</span>
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
        {hub && (
          <>
            <div className="sep" />
            <div className="row" style={{ padding: '10px 0', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
              <div className="col" style={{ flex: '1 1 180px' }}>
                <span className="t">Open on a phone</span>
                <span className="s">On the home Wi-Fi, open this address or point the phone camera at the code.</span>
                <span className="t" aria-label="Hub address" style={{ wordBreak: 'break-all' }}>
                  {hub.address}
                </span>
              </div>
              <QrCode text={hub.address} label={`QR code for ${hub.address}`} />
            </div>
            {hub.host === 'windows' || hub.host === 'mac' ? (
              <span className="s" role="note" style={{ paddingBottom: 10 }}>
                While this {hub.hostLabel} sleeps or is off, kid limits, snap back, schedules and routines pause until it is back.
              </span>
            ) : null}
          </>
        )}
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
        <Link href="/settings/calm" className="rowlink">
          <div className="lft">
            <MoonIcon />
            <div className="col">
              <span className="t">Calm titles</span>
              <span className="s">{catalog ? `${catalog.calmCount} tagged` : '…'}</span>
            </div>
          </div>
          <ChevronIcon size={18} />
        </Link>
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
