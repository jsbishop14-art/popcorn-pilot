'use client';
// New playlist: a name, then the editor opens to add titles.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/lib/client';

export default function NewPlaylist() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      const r = await api<{ playlist: { id: number } }>('/api/playlists', { method: 'POST', body: { name } });
      router.push(`/playlists/${r.playlist.id}/edit`);
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'Could not save.');
    }
  }
  return (
    <form className="main" onSubmit={(e) => void save(e)}>
      <label className="col" style={{ gap: 6 }}>
        <span className="lbl">Name</span>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Name" />
      </label>
      <button type="submit" className="btn pri wide">
        Make playlist
      </button>
      {msg && (
        <p className="msg err" role="status">
          {msg}
        </p>
      )}
    </form>
  );
}
