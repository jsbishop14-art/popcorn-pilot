'use client';
// Profile editor (mockup ProfileEditor): name, Adult or Kid, color, and for a kid profile every safeguard (PP4).
// A new kid profile starts with the default safeguards; they are changed after it is saved.
import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/client';
import { TrashIcon } from './icons';
import SafeguardsEditor, { type Rules } from './SafeguardsEditor';

const COLORS = ['#FFC94A', '#FF8A65', '#7FC8A9', '#8FB3FF', '#C9A7F5'];

export interface EditableProfile {
  id?: number;
  name: string;
  color: string;
  type: 'adult' | 'kid';
}

export default function ProfileEditor({ profile }: { profile: EditableProfile }) {
  const router = useRouter();
  const [name, setName] = useState(profile.name);
  const [type, setType] = useState(profile.type);
  const [color, setColor] = useState(profile.color);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const rules = useRef<Rules | null>(null);
  const onRules = useCallback((r: Rules | null) => {
    rules.current = r;
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (profile.id) {
        await api(`/api/profiles/${profile.id}`, { method: 'PATCH', body: { name, type, color } });
        if (type === 'kid' && profile.type === 'kid' && rules.current) await api(`/api/profiles/${profile.id}/safeguards`, { method: 'PATCH', body: { ...rules.current } });
      } else await api('/api/profiles', { method: 'POST', body: { name, type, color } });
      router.push('/profiles');
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save.');
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api(`/api/profiles/${profile.id}`, { method: 'DELETE' });
      router.push('/profiles');
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete.');
      setBusy(false);
    }
  }

  return (
    <main className="main">
      <div className="card">
        <label className="col" style={{ gap: 6 }}>
          <span className="lbl">Name</span>
          <input className="field" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="Name" />
        </label>
        <div className="col" style={{ gap: 6 }}>
          <span className="lbl">Type</span>
          <div className="chips" role="radiogroup" aria-label="Type">
            {(['adult', 'kid'] as const).map((t) => (
              <button key={t} type="button" role="radio" aria-checked={type === t} className={`chip${type === t ? ' on' : ''}`} onClick={() => setType(t)}>
                {t === 'adult' ? 'Adult' : 'Kid'}
              </button>
            ))}
          </div>
          <span className="s">{type === 'adult' ? 'No limits. Asks for the Adult PIN on the TV.' : 'Safeguards apply. Kids have no PIN.'}</span>
        </div>
        <div className="col" style={{ gap: 6 }}>
          <span className="lbl">Color</span>
          <div className="chips" role="radiogroup" aria-label="Color">
            {COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={`Color ${c}`} className={`swatch${color === c ? ' on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />
            ))}
          </div>
        </div>
      </div>
      {type === 'kid' && profile.id && profile.type === 'kid' && <SafeguardsEditor profileId={profile.id} onChange={onRules} />}
      {type === 'kid' && !(profile.id && profile.type === 'kid') && (
        <div className="note" role="note">
          <span className="t">Kid safeguards</span>
          <span className="s">Starts with allowed ratings TV-Y, TV-Y7, TV-G and G; 60 min on weekdays; viewing between 7:00 AM and 7:30 PM; snap back on. Save, then open the profile again to change them.</span>
        </div>
      )}
      {error && (
        <p className="msg err" role="alert">
          {error}
        </p>
      )}
      {confirmDelete ? (
        <div className="card" role="alertdialog" aria-label="Delete profile">
          <span className="t">Delete {profile.name}?</span>
          <span className="s">TVs that start on this profile will have no default profile.</span>
          <div className="btns">
            <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
              Keep
            </button>
            <button type="button" className="btn danger" disabled={busy} onClick={() => void remove()}>
              Delete
            </button>
          </div>
        </div>
      ) : (
        <div className="btns">
          {profile.id && (
            <button type="button" className="btn" onClick={() => setConfirmDelete(true)}>
              <TrashIcon size={18} /> Delete profile
            </button>
          )}
          <button type="button" className="btn pri" disabled={busy} onClick={() => void save()}>
            Save
          </button>
        </div>
      )}
    </main>
  );
}
