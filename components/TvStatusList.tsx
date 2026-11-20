'use client';
// Each TV with whether it is online. Checks the TVs when the screen opens.
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';

export interface TvSummary {
  id: number;
  name: string;
  room: string;
  online: boolean;
  defaultProfileName: string | null;
}

export default function TvStatusList({ initial, isAdult }: { initial: TvSummary[]; isAdult: boolean }) {
  const [tvs, setTvs] = useState(initial);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    api<{ tvs: TvSummary[] }>('/api/tvs/refresh', { method: 'POST', body: {} })
      .then((r) => setTvs(r.tvs))
      .catch(() => undefined)
      .finally(() => setChecking(false));
  }, []);

  if (!tvs.length)
    return (
      <div className="card">
        <span className="t">No TVs yet</span>
        <span className="s">{isAdult ? 'Add the TVs in Settings.' : 'An adult adds the TVs in Settings.'}</span>
      </div>
    );
  return (
    <>
      {tvs.map((tv) => (
        <section key={tv.id} className="card" aria-label={`${tv.name} TV`}>
          <div className="row">
            <div className="lft">
              <span className="dot" style={{ background: tv.online ? '#2E9E6B' : '#9AA6BD' }} aria-hidden="true" />
              <h2 className="h2">{tv.name}</h2>
            </div>
            <span className={`badge ${tv.online ? 'ok' : 'off'}`}>{checking ? 'Checking…' : tv.online ? 'Online' : 'Offline'}</span>
          </div>
          <span className="s">
            {tv.room || 'No room set'}
            {tv.defaultProfileName ? ` · starts as ${tv.defaultProfileName}` : ''}
          </span>
        </section>
      ))}
    </>
  );
}
