'use client';
// Browse (mockups Browse and PhoneBrowse): platform tabs (All, Netflix, Prime Video, Hulu), search, shows or movies,
// and "Showing for". Desktop: one row per platform (or per kind on one platform) and a details panel. Phone: one
// poster grid; a title opens full screen. The hub applies the kid rules of the "Showing for" profile.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/client';
import { SERVICE_INFO, profileQuery, type Service } from '@/lib/catalog/types';
import TitleDetails, { type CardData, type DetailsData } from './TitleDetails';
import { SearchIcon, SparkIcon } from './icons';

export interface BrowseProfile {
  id: number;
  name: string;
  type: 'adult' | 'kid';
}

interface Row {
  id: string;
  name: string;
  service: Service;
  titles: CardData[];
}

const PLATFORMS: { id: 'all' | Service; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'netflix', label: 'Netflix' },
  { id: 'prime', label: 'Prime Video' },
  { id: 'hulu', label: 'Hulu' },
];

export function Tile({ t, on, onPick }: { t: CardData; on?: boolean; onPick: () => void }) {
  return (
    <button type="button" className={`tile${on ? ' on' : ''}`} aria-label={t.name} aria-pressed={on} onClick={onPick}>
      <span className="pic">
        {/* eslint-disable-next-line @next/next/no-img-element -- cover art is served and cached by the hub */}
        {t.poster ? <img src={t.poster} alt="" loading="lazy" /> : <span className="poster-img" />}
        <span className="badge">{t.rating ?? 'NR'}</span>
      </span>
      <span className="tn">{t.name}</span>
    </button>
  );
}

export default function BrowseScreen({ role, profiles, initialProfile }: { role: 'adult' | 'guest'; profiles: BrowseProfile[]; initialProfile: number | null }) {
  const router = useRouter();
  const [platform, setPlatform] = useState<'all' | Service>('all');
  const [kind, setKind] = useState<'all' | 'show' | 'movie'>('all');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [profile, setProfile] = useState<number | null>(initialProfile);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [source, setSource] = useState<'tmdb' | 'stub'>('stub');
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DetailsData | null>(null);
  const seq = useRef(0);

  // Search waits for a pause in typing.
  useEffect(() => {
    const h = setTimeout(() => setQuery(q.trim()), 250);
    return () => clearTimeout(h);
  }, [q]);

  useEffect(() => {
    if (role === 'guest' && profile === null) return;
    const n = ++seq.current;
    const p = new URLSearchParams({ service: platform, kind, q: query });
    if (profile !== null) p.set('profile', String(profile));
    setError(null);
    api<{ rows: Row[]; source: 'tmdb' | 'stub' }>(`/api/catalog/browse?${p.toString()}`)
      .then((r) => {
        if (n !== seq.current) return;
        setRows(r.rows);
        setSource(r.source);
      })
      .catch((e) => n === seq.current && setError(e instanceof ApiError ? e.message : 'Could not load titles.'));
  }, [platform, kind, query, profile, role]);

  // A different profile may not see the open title.
  useEffect(() => setSelected(null), [profile]);

  const open = useCallback(
    async (key: string) => {
      const wide = window.matchMedia('(min-width: 900px)').matches;
      if (!wide) return router.push(`/browse/${key}${profileQuery(profile)}`);
      try {
        const r = await api<{ title: DetailsData; source: 'tmdb' | 'stub' }>(`/api/catalog/titles/${key}${profileQuery(profile)}`);
        setSelected(r.title);
        setSource(r.source);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Could not open the title.');
      }
    },
    [profile, router],
  );

  if (role === 'guest' && profiles.length === 0) {
    return (
      <main className="main">
        <div className="card">
          <span className="t">No kid profiles yet</span>
          <span className="s">With the Guest PIN, Browse shows titles for a kid profile. An adult adds kid profiles in Profiles.</span>
        </div>
      </main>
    );
  }

  const placeholder = platform === 'all' ? 'Search all platforms' : `Search ${SERVICE_INFO[platform].name}`;
  const profileName = profiles.find((p) => p.id === profile)?.name;
  const grid: CardData[] = [];
  const seen = new Set<string>();
  for (const r of rows ?? [])
    for (const t of r.titles) {
      if (seen.has(t.key)) continue;
      seen.add(t.key);
      grid.push(t);
    }

  return (
    <main className="main">
      <div className="b-tools">
        <div className="chips" role="tablist" aria-label="Platform">
          {PLATFORMS.map((p) => (
            <button key={p.id} type="button" role="tab" aria-selected={platform === p.id} className={`chip${platform === p.id ? ' on' : ''}`} onClick={() => setPlatform(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        <label className="b-search">
          <SearchIcon size={20} />
          <span className="vh">Search titles</span>
          <input className="field" type="search" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="row">
          <div className="b-pick">
            <select className="field" aria-label="Showing for" value={profile ?? ''} onChange={(e) => setProfile(e.target.value ? Number(e.target.value) : null)}>
              {role === 'adult' && <option value="">Showing for: everyone (no kid filter)</option>}
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  Showing for: {p.name}
                  {p.type === 'kid' ? ' (Kid)' : ''}
                </option>
              ))}
            </select>
            <select className="field" aria-label="Shows or movies" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="all">Shows + Movies</option>
              <option value="show">Shows</option>
              <option value="movie">Movies</option>
            </select>
          </div>
          <Link className="chip" href={`/browse/suggestions${profileQuery(profile)}`}>
            <SparkIcon size={16} /> Suggestions
          </Link>
        </div>
        {source === 'stub' && <span className="s">Sample catalog (no TMDB key yet). An adult adds the key in Settings.</span>}
      </div>

      {error && (
        <p className="msg err" role="alert">
          {error}
        </p>
      )}

      <div className="b-body">
        <div className="b-main">
          <div className="b-rows">
            {rows?.map((r) => (
              <section key={r.id} aria-label={r.name} className="col" style={{ gap: 10 }}>
                <h2 className="h2">{r.name}</h2>
                {r.titles.length === 0 && <span className="s">{query ? `Nothing on ${SERVICE_INFO[r.service].name} matches.` : `Nothing here${profileName ? ` for ${profileName}` : ''}.`}</span>}
                <div className="b-row">
                  {r.titles.map((t) => (
                    <Tile key={t.key} t={t} on={selected?.key === t.key} onPick={() => void open(t.key)} />
                  ))}
                </div>
              </section>
            ))}
          </div>
          <section className="b-grid" aria-label="Titles">
            {rows && grid.length === 0 && <span className="s" style={{ gridColumn: '1 / -1' }}>No titles{profileName ? ` for ${profileName}` : ''}.</span>}
            {grid.map((t) => (
              <Tile key={t.key} t={t} onPick={() => void open(t.key)} />
            ))}
          </section>
          {!rows && !error && <span className="s">Loading titles…</span>}
        </div>
        {selected && (
          <aside className="b-aside" aria-label="Title details">
            <TitleDetails title={selected} profile={profile} role={role} source={source} onOpen={(k) => void open(k)} />
          </aside>
        )}
      </div>
    </main>
  );
}
