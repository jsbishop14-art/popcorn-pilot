'use client';
// Suggestions (mockup Suggestions): rule based picks, similar to what a profile played (or to the calm titles), then
// popular titles; filtered to the profile's allowed ratings and the three services by the hub.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/client';
import { SERVICE_INFO, profileQuery } from '@/lib/catalog/types';
import type { CardData } from './TitleDetails';
import type { BrowseProfile } from './BrowseScreen';
import { PlusIcon } from './icons';

interface Item extends CardData {
  reason: string;
}

export default function SuggestionsScreen({ role, profiles, initialProfile }: { role: 'adult' | 'guest'; profiles: BrowseProfile[]; initialProfile: number | null }) {
  const [profile, setProfile] = useState<number | null>(initialProfile);
  const [calm, setCalm] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (role === 'guest' && profile === null) return;
    const p = new URLSearchParams();
    if (profile !== null) p.set('profile', String(profile));
    if (calm) p.set('calm', '1');
    let live = true;
    setItems(null);
    setError(null);
    api<{ items: Item[] }>(`/api/catalog/suggestions?${p.toString()}`)
      .then((r) => live && setItems(r.items))
      .catch((e) => live && setError(e instanceof ApiError ? e.message : 'Could not load suggestions.'));
    return () => {
      live = false;
    };
  }, [profile, calm, role]);

  if (role === 'guest' && profiles.length === 0) {
    return (
      <main className="main">
        <div className="card">
          <span className="t">No kid profiles yet</span>
          <span className="s">With the Guest PIN, suggestions are for a kid profile. An adult adds kid profiles in Profiles.</span>
        </div>
      </main>
    );
  }

  return (
    <main className="main">
      <div className="chips" role="group" aria-label="Suggestions for">
        {role === 'adult' && (
          <button type="button" className={`chip${profile === null && !calm ? ' on' : ''}`} aria-pressed={profile === null && !calm} onClick={() => { setProfile(null); setCalm(false); }}>
            For everyone
          </button>
        )}
        {profiles.map((p) => (
          <button key={p.id} type="button" className={`chip${profile === p.id && !calm ? ' on' : ''}`} aria-pressed={profile === p.id && !calm} onClick={() => { setProfile(p.id); setCalm(false); }}>
            For {p.name}
          </button>
        ))}
        <button type="button" className={`chip${calm ? ' on' : ''}`} aria-pressed={calm} onClick={() => setCalm((c) => !c)}>
          Calm titles
        </button>
      </div>
      <span className="s">
        {calm ? 'Similar to the titles tagged as calm. ' : ''}Filtered to {profile === null ? 'your services' : `${profiles.find((p) => p.id === profile)?.name ?? 'this profile'}’s allowed ratings and your services`}.
      </span>
      {error && (
        <p className="msg err" role="alert">
          {error}
        </p>
      )}
      {!items && !error && <span className="s">Loading suggestions…</span>}
      {items && items.length === 0 && (
        <div className="card">
          <span className="t">No suggestions yet</span>
          <span className="s">{calm ? 'Tag titles as calm from their details (Adult PIN) to get calm suggestions.' : 'Nothing matches this profile’s ratings right now.'}</span>
        </div>
      )}
      <section aria-label="Suggested titles" className="col" style={{ gap: 12 }}>
        {items?.map((t) => (
          <div key={t.key} className="card">
            <div className="row">
              <Link href={`/browse/${t.key}${profileQuery(profile)}`} className="lft cardlink" aria-label={`Open ${t.name}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- cover art is served and cached by the hub */}
                {t.poster ? <img className="poster-sm" src={t.poster} alt="" loading="lazy" /> : <span className="poster-sm" />}
                <span className="col">
                  <span className="t">{t.name}</span>
                  <span className="s">
                    {t.services.map((s) => SERVICE_INFO[s].name).join(', ')} · {t.rating ?? 'Not rated'}
                  </span>
                  <span className="s">{t.reason}</span>
                </span>
              </Link>
              <button type="button" className="icb" aria-label={`Add ${t.name} to a playlist (coming in PP3)`} title="Adding to a playlist is coming in PP3" disabled>
                <PlusIcon size={20} />
              </button>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
