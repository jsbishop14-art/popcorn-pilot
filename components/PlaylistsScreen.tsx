'use client';
// Playlists (mockup Playlists): New playlist (Adult), Quick playlist, and each playlist as a card with cover art from
// its titles, what is in it, and its schedule. With the Guest PIN the list is for a kid profile: the hub leaves out
// titles that profile may not watch.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import type { Playlist } from '@/lib/playlists';
import type { PickerProfile } from '@/lib/browse-profiles';
import { CalendarIcon, PlusIcon, SparkIcon } from './icons';

export function Covers({ covers }: { covers: string[] }) {
  return (
    <div className="covers" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- cover art is served and cached by the hub */}
      {covers.length ? covers.map((c) => <img key={c} className="poster" src={c} alt="" />) : <span className="poster" />}
    </div>
  );
}

export default function PlaylistsScreen({
  role,
  initial,
  profiles,
  profile: startProfile,
}: {
  role: 'adult' | 'guest';
  initial: Playlist[];
  profiles: PickerProfile[];
  profile: number | null;
}) {
  const [profile, setProfile] = useState<number | null>(startProfile);
  const [list, setList] = useState(initial);
  const q = profile === null ? '' : `?profile=${profile}`;

  // Load the list as the hub has it now (the page the router shows may be an earlier copy), and again when the
  // "Showing for" profile changes.
  useEffect(() => {
    if (role === 'guest' && profile === null) return;
    api<{ playlists: Playlist[] }>(`/api/playlists${q}`)
      .then((r) => setList(r.playlists))
      .catch(() => undefined);
  }, [role, profile, q]);

  return (
    <main className="main">
      <div className="btns">
        {role === 'adult' && (
          <Link href="/playlists/new" className="btn pri">
            <PlusIcon size={18} /> New playlist
          </Link>
        )}
        <Link href={`/playlists/quick${q}`} className="btn">
          Quick playlist
        </Link>
      </div>
      {role === 'guest' && (
        <label className="b-pick">
          <span className="lbl" style={{ marginTop: 0 }}>
            Showing for
          </span>
          <select className="field" aria-label="Showing for" value={profile ?? ''} onChange={(e) => setProfile(Number(e.target.value))}>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {role === 'guest' && !profiles.length && <span className="s">An adult adds a kid profile first.</span>}
      {!list.length && (
        <div className="card">
          <span className="t">No playlists yet</span>
          <span className="s">{role === 'adult' ? 'Make one with New playlist, or pick titles as you go with Quick playlist.' : 'Pick titles as you go with Quick playlist.'}</span>
        </div>
      )}
      <section aria-label="Saved playlists" className="col" style={{ gap: 12 }}>
        {list.map((p) => (
          <Link key={p.id} href={`/playlists/${p.id}${q}`} className="card cardlink" aria-label={`Playlist ${p.name}`}>
            <div className="lft">
              <Covers covers={p.covers} />
              <div className="col">
                <span className="t">{p.name}</span>
                <span className="s">{p.meta}</span>
                {p.schedule.on && (
                  <span className="s" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <CalendarIcon size={14} /> Scheduled {p.schedule.label}
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </section>
      <div className="card">
        <span className="t">Routines</span>
        <span className="s">One button to set a TV up (turn on, profile, volume, playlist, timer) arrives in PP5.</span>
      </div>
      <Link href="/browse/suggestions" className="btn wide">
        <SparkIcon size={20} /> Suggestions
      </Link>
    </main>
  );
}
