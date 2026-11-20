'use client';
// Title details (mockup TitleDetails, and the details panel of mockup Browse): trailer in the app or on a TV, rating,
// service, seasons, episode length, description, start from, Play on a TV, Add to playlist and Start quick playlist
// (PP3), More like this, and for the Adult PIN: Tag as calm, Block for kids.
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/client';
import { SERVICE_INFO, profileQuery, type Kind, type Service } from '@/lib/catalog/types';
import { BlockIcon, MoonIcon, PlayIcon, PlusIcon, ScreenIcon } from './icons';

export interface CardData {
  key: string;
  kind: Kind;
  name: string;
  rating: string | null;
  services: Service[];
  poster: string | null;
  calm: boolean;
  blocked: boolean;
}

export interface DetailsData extends CardData {
  year: number | null;
  overview: string;
  seasons: { number: number; episodes: number }[];
  episodeMinutes: number | null;
  runtimeMinutes: number | null;
  trailer: string | null;
}

interface Tv {
  id: number;
  name: string;
  online: boolean;
}

export function facts(t: DetailsData): string {
  const parts = [t.services.map((s) => SERVICE_INFO[s].name).join(', ')];
  if (t.kind === 'show') {
    if (t.seasons.length) parts.push(`${t.seasons.length} season${t.seasons.length === 1 ? '' : 's'}`);
    if (t.episodeMinutes) parts.push(`${t.episodeMinutes} min episodes`);
  } else if (t.runtimeMinutes) parts.push(`${Math.floor(t.runtimeMinutes / 60)} hr ${t.runtimeMinutes % 60} min`);
  if (t.year) parts.push(String(t.year));
  return parts.join(' · ');
}

function startOptions(t: DetailsData): string[] {
  if (t.kind !== 'show') return [];
  const seasons = t.seasons.length ? t.seasons : [{ number: 1, episodes: 1 }];
  return ['Season 1 · Episode 1', 'Next unwatched episode', ...seasons.slice(1).map((s) => `Season ${s.number} · Episode 1`)];
}

export default function TitleDetails({
  title,
  profile,
  role,
  source,
  onOpen,
  headingLevel = 2,
}: {
  title: DetailsData;
  profile: number | null;
  role: 'adult' | 'guest';
  source: 'tmdb' | 'stub';
  onOpen: (key: string) => void;
  headingLevel?: 1 | 2;
}) {
  const [t, setT] = useState(title);
  const [tvs, setTvs] = useState<Tv[] | null>(null);
  const [tvId, setTvId] = useState<number | null>(null);
  const [service, setService] = useState<Service>(title.services[0]);
  const [startFrom, setStartFrom] = useState(startOptions(title)[0] ?? '');
  const [playing, setPlaying] = useState(false);
  const [more, setMore] = useState<CardData[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setT(title);
    setService(title.services[0]);
    setStartFrom(startOptions(title)[0] ?? '');
    setPlaying(false);
    setMore(null);
    setMsg(null);
  }, [title]);

  useEffect(() => {
    api<{ tvs: Tv[] }>('/api/tvs')
      .then((r) => {
        setTvs(r.tvs);
        setTvId((cur) => cur ?? r.tvs.find((x) => x.online)?.id ?? r.tvs[0]?.id ?? null);
      })
      .catch(() => setTvs([]));
  }, []);

  const tv = tvs?.find((x) => x.id === tvId) ?? null;

  async function send(what: 'play' | 'trailer') {
    if (!tv) return;
    setBusy(true);
    setMsg(null);
    try {
      await api(`/api/catalog/titles/${t.key}/${what}`, {
        method: 'POST',
        body: what === 'play' ? { tvId: tv.id, profile, service, startFrom: startFrom || undefined } : { tvId: tv.id, profile },
      });
      setMsg({ ok: true, text: what === 'play' ? `Playing ${t.name} on ${tv.name}` : `Trailer sent to ${tv.name}` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not reach the TV.' });
    } finally {
      setBusy(false);
    }
  }

  async function tag(which: 'calm' | 'block') {
    const on = which === 'calm' ? !t.calm : !t.blocked;
    setMsg(null);
    try {
      await api(`/api/catalog/titles/${t.key}/${which}`, { method: 'POST', body: which === 'calm' ? { calm: on } : { blocked: on } });
      setT((cur) => (which === 'calm' ? { ...cur, calm: on } : { ...cur, blocked: on }));
      setMsg({
        ok: true,
        text: which === 'calm' ? (on ? `${t.name} is tagged as calm` : `${t.name} is no longer tagged as calm`) : on ? `${t.name} is blocked for kids` : `${t.name} is no longer blocked for kids`,
      });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not save.' });
    }
  }

  async function moreLikeThis() {
    if (more) return setMore(null);
    try {
      setMore((await api<{ titles: CardData[] }>(`/api/catalog/titles/${t.key}/similar${profileQuery(profile)}`)).titles);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not load similar titles.' });
    }
  }

  const H = headingLevel === 1 ? 'h1' : 'h2';
  const starts = startOptions(t);

  return (
    <div className="col" style={{ gap: 12 }} aria-label={`${t.name} details`} role="region">
      <div className="trailer" aria-label="Trailer" role="region">
        {!playing && (
          <>
            <button type="button" className="play" aria-label="Play trailer here" onClick={() => setPlaying(true)} disabled={!t.trailer}>
              <PlayIcon size={26} color="#0F1B33" />
            </button>
            <span className="s" style={{ color: '#D6DDEA' }}>
              {t.trailer ? 'Trailer' : 'No trailer for this title'}
            </span>
          </>
        )}
        {playing && t.trailer && source === 'tmdb' && (
          <iframe
            title={`${t.name} trailer`}
            src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(t.trailer)}?autoplay=1&rel=0`}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        )}
        {playing && t.trailer && source === 'stub' && (
          <div className="stand-in" role="status">
            Trailer playing: {t.name} (sample catalog stand in; with a TMDB key the real trailer plays here)
          </div>
        )}
      </div>

      {headingLevel === 2 && <H className="h2" style={{ fontSize: 22 }}>{t.name}</H>}
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <div className="chips" style={{ alignItems: 'center' }}>
          <span className="badge">{t.rating ?? 'Not rated'}</span>
          <span className="s">{facts(t)}</span>
        </div>
        <button type="button" className="chip" onClick={() => void send('trailer')} disabled={!tv || !t.trailer || busy}>
          <ScreenIcon size={16} /> Trailer on TV
        </button>
      </div>
      {t.overview && <p className="desc">{t.overview}</p>}

      {t.services.length > 1 && (
        <label className="col" style={{ gap: 6 }}>
          <span className="lbl">Watch on</span>
          <select className="field" value={service} onChange={(e) => setService(e.target.value as Service)} aria-label="Watch on">
            {t.services.map((s) => (
              <option key={s} value={s}>
                {SERVICE_INFO[s].name}
              </option>
            ))}
          </select>
        </label>
      )}
      {starts.length > 0 && (
        <label className="col" style={{ gap: 6 }}>
          <span className="lbl">Start from</span>
          <select className="field" value={startFrom} onChange={(e) => setStartFrom(e.target.value)} aria-label="Start from">
            {starts.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      )}
      {tvs && tvs.length > 0 && (
        <label className="col" style={{ gap: 6 }}>
          <span className="lbl">TV</span>
          <select className="field" value={tvId ?? ''} onChange={(e) => setTvId(Number(e.target.value))} aria-label="TV">
            {tvs.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
                {x.online ? '' : ' (offline)'}
              </option>
            ))}
          </select>
        </label>
      )}
      {tvs && tvs.length === 0 && <span className="s">No TVs yet. {role === 'adult' ? 'Add one in Settings.' : 'An adult adds TVs in Settings.'}</span>}

      <div className="col" style={{ gap: 8 }}>
        <button type="button" className="btn dark wide" onClick={() => void send('play')} disabled={!tv || busy}>
          <PlayIcon size={18} color="#FFFFFF" /> {tv ? `Play on ${tv.name}` : 'Play on a TV'}
        </button>
        <button type="button" className="btn pri wide" disabled aria-describedby={`pp3-${t.key}`}>
          <PlusIcon size={18} /> Add to playlist
        </button>
        <div className="btns">
          <button type="button" className="btn" disabled aria-describedby={`pp3-${t.key}`}>
            Start quick playlist
          </button>
          <button type="button" className="btn" onClick={() => void moreLikeThis()} aria-expanded={more !== null}>
            More like this
          </button>
        </div>
        <span className="s" id={`pp3-${t.key}`}>
          Add to playlist and Start quick playlist: coming in PP3.
        </span>
      </div>

      {role === 'adult' && (
        <div className="chips">
          <button type="button" className="chip" aria-pressed={t.calm} onClick={() => void tag('calm')}>
            <MoonIcon size={16} /> Tag as calm
          </button>
          <button type="button" className="chip" aria-pressed={t.blocked} onClick={() => void tag('block')}>
            <BlockIcon size={16} /> Block for kids
          </button>
        </div>
      )}

      {msg && (
        <p className={`msg ${msg.ok ? 'ok' : 'err'}`} role="status">
          {msg.text}
        </p>
      )}

      {more && (
        <section aria-label="More like this" className="col" style={{ gap: 8 }}>
          <span className="lbl">More like this</span>
          {more.length === 0 && <span className="s">Nothing similar for this profile.</span>}
          <div className="b-grid" style={{ display: 'grid' }}>
            {more.map((m) => (
              <button key={m.key} type="button" className="tile" aria-label={m.name} onClick={() => onOpen(m.key)}>
                <span className="pic">
                  {/* eslint-disable-next-line @next/next/no-img-element -- cover art is served and cached by the hub */}
                  {m.poster ? <img src={m.poster} alt="" loading="lazy" /> : <span className="poster-img" />}
                  <span className="badge">{m.rating ?? 'NR'}</span>
                </span>
                <span className="tn">{m.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
