'use client';
// One TV: rename, room, default profile, channel pairing token, remove.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/lib/client';
import { TrashIcon } from './icons';

interface Tv {
  id: number;
  name: string;
  room: string;
  address: string;
  port: number;
  model: string | null;
  online: boolean;
  lastSeenAt: string | null;
  defaultProfileId: number | null;
  hasChannelToken: boolean;
}

export default function TvEditor({ tv, profiles }: { tv: Tv; profiles: { id: number; name: string; type: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState(tv.name);
  const [room, setRoom] = useState(tv.room);
  const [profileId, setProfileId] = useState<string>(tv.defaultProfileId ? String(tv.defaultProfileId) : '');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [pairMsg, setPairMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  async function save() {
    setMsg(null);
    try {
      await api(`/api/tvs/${tv.id}`, { method: 'PATCH', body: { name, room, defaultProfileId: profileId ? Number(profileId) : null } });
      router.push('/settings');
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not save.' });
    }
  }

  async function makeToken() {
    const r = await api<{ token: string }>(`/api/tvs/${tv.id}/channel-token`, { method: 'POST', body: {} });
    setToken(r.token);
  }

  async function pair() {
    setPairMsg(null);
    try {
      const r = await api<{ message: string }>(`/api/tvs/${tv.id}/pair`, { method: 'POST', body: {} });
      setPairMsg({ ok: true, text: `${r.message}. The TV now shows the Popcorn Pilot home screen.` });
      router.refresh();
    } catch (e) {
      setPairMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not pair the channel.' });
    }
  }

  async function remove() {
    await api(`/api/tvs/${tv.id}`, { method: 'DELETE' });
    router.push('/settings');
    router.refresh();
  }

  return (
    <main className="main">
      <div className="card">
        <div className="row">
          <span className="s">
            Roku{tv.model ? ` ${tv.model}` : ''} · {tv.port === 8060 ? tv.address : `${tv.address}:${tv.port}`}
          </span>
          <span className={`badge ${tv.online ? 'ok' : 'off'}`}>{tv.online ? 'Online' : 'Offline'}</span>
        </div>
        <label className="col" style={{ gap: 6 }}>
          <span className="lbl">Name</span>
          <input className="field" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="Name" />
        </label>
        <label className="col" style={{ gap: 6 }}>
          <span className="lbl">Room</span>
          <input className="field" value={room} maxLength={40} onChange={(e) => setRoom(e.target.value)} aria-label="Room" />
        </label>
        <label className="col" style={{ gap: 6 }}>
          <span className="lbl">Default profile</span>
          <select className="field" value={profileId} onChange={(e) => setProfileId(e.target.value)} aria-label="Default profile">
            <option value="">None</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.type === 'kid' ? 'Kid' : 'Adult'})
              </option>
            ))}
          </select>
          <span className="s">The profile this TV starts on.</span>
        </label>
      </div>
      {msg && (
        <p className={`msg ${msg.ok ? 'ok' : 'err'}`} role="alert">
          {msg.text}
        </p>
      )}
      <button type="button" className="btn pri wide" onClick={() => void save()}>
        Save
      </button>

      <span className="lbl">Popcorn Pilot channel</span>
      <div className="card">
        <span className="s">
          The Popcorn Pilot channel on the TV shows the home screen, kid screens and Now playing. Pair it once the channel is
          installed (install guide). {tv.hasChannelToken ? 'This TV is paired.' : 'Not paired yet.'}
        </span>
        <button type="button" className="btn pri" onClick={() => void pair()}>
          {tv.hasChannelToken ? 'Pair the channel again' : 'Pair the channel'}
        </button>
        {pairMsg && (
          <p className={`msg ${pairMsg.ok ? 'ok' : 'err'}`} role="status">
            {pairMsg.text}
          </p>
        )}
        <span className="s">If pairing cannot reach the TV, a token can be typed into the channel by hand instead.</span>
        {token ? (
          <div className="col" role="status">
            <span className="t">New channel token (shown once)</span>
            <span className="mono">{token}</span>
          </div>
        ) : (
          <button type="button" className="btn" onClick={() => void makeToken()}>
            {tv.hasChannelToken ? 'Replace channel token' : 'Make channel token'}
          </button>
        )}
      </div>

      {confirmRemove ? (
        <div className="card" role="alertdialog" aria-label="Remove TV">
          <span className="t">Remove {tv.name}?</span>
          <div className="btns">
            <button type="button" className="btn" onClick={() => setConfirmRemove(false)}>
              Keep
            </button>
            <button type="button" className="btn danger" onClick={() => void remove()}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn wide" onClick={() => setConfirmRemove(true)}>
          <TrashIcon size={18} /> Remove TV
        </button>
      )}
    </main>
  );
}
