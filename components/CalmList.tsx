'use client';
// Calm titles (Settings): the titles tagged as calm, for the bedtime wind-down (PP4 plays only these at the end).
import Link from 'next/link';
import { useState } from 'react';
import { api, ApiError } from '@/lib/client';
import { SERVICE_INFO, type Service } from '@/lib/catalog/types';

interface Tagged {
  key: string;
  name: string;
  services: Service[];
  rating: string | null;
}

export default function CalmList({ initial }: { initial: Tagged[] }) {
  const [list, setList] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function untag(t: Tagged) {
    try {
      await api(`/api/catalog/titles/${t.key}/calm`, { method: 'POST', body: { calm: false } });
      setList((cur) => cur.filter((x) => x.key !== t.key));
      setMsg({ ok: true, text: `${t.name} is no longer tagged as calm` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not save.' });
    }
  }

  return (
    <main className="main">
      <span className="s">Bedtime wind-down plays only these titles in its last stretch. Tag more from a title&rsquo;s details in Browse.</span>
      {list.length === 0 && (
        <div className="card">
          <span className="t">No calm titles yet</span>
          <span className="s">Open a title in Browse and press Tag as calm.</span>
        </div>
      )}
      {list.length > 0 && (
        <div className="card" style={{ gap: 0 }} aria-label="Calm titles" role="list">
          {list.map((t, i) => (
            <div key={t.key} role="listitem">
              {i > 0 && <div className="sep" />}
              <div className="row" style={{ padding: '10px 0' }}>
                <Link href={`/browse/${t.key}`} className="col cardlink">
                  <span className="t">{t.name}</span>
                  <span className="s">
                    {t.services.map((s) => SERVICE_INFO[s].name).join(', ')} · {t.rating ?? 'Not rated'}
                  </span>
                </Link>
                <button type="button" className="btn" onClick={() => void untag(t)} aria-label={`Remove the calm tag from ${t.name}`}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {msg && (
        <p className={`msg ${msg.ok ? 'ok' : 'err'}`} role="status">
          {msg.text}
        </p>
      )}
    </main>
  );
}
