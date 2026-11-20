'use client';
// Requests (mockup Requests), and the requests area at the top of the Dashboard (mockup PhoneDashboard): what the
// kids asked for on the TV (more time, a title, a task done), with Approve and Deny (Adult PIN), and what was
// answered today.
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/client';
import type { RequestView } from '@/lib/requests';

export interface RequestLists {
  pending: RequestView[];
  earlier: RequestView[];
}

export function useRequests(initial: RequestLists | null) {
  const [lists, setLists] = useState<RequestLists | null>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(async () => {
    try {
      setLists(await api<RequestLists>('/api/requests'));
    } catch {
      // keep what is shown
    }
  }, []);
  useEffect(() => {
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
  }, [load]);
  async function answer(r: RequestView, decision: 'approve' | 'deny') {
    setMsg(null);
    try {
      const out = await api<RequestLists & { message: string }>(`/api/requests/${r.id}`, { method: 'POST', body: { decision } });
      setLists({ pending: out.pending, earlier: out.earlier });
      setMsg({ ok: true, text: out.message });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not reach the hub.' });
      void load();
    }
  }
  return { lists, msg, answer };
}

export function RequestCard({ r, onAnswer }: { r: RequestView; onAnswer: (r: RequestView, d: 'approve' | 'deny') => void }) {
  return (
    <div className="card" role="group" aria-label={r.title}>
      <div className="lft">
        {r.emoji && (
          <span className="taskpic" aria-hidden="true">
            {r.emoji}
          </span>
        )}
        <div className="col">
          <span className="t">{r.title}</span>
          <span className="s">{r.sub}</span>
        </div>
      </div>
      <div className="grid2">
        <button type="button" className="btn" onClick={() => onAnswer(r, 'deny')}>
          Deny
        </button>
        <button type="button" className="btn pri" onClick={() => onAnswer(r, 'approve')}>
          Approve
        </button>
      </div>
    </div>
  );
}

export default function RequestsScreen({ initial }: { initial: RequestLists }) {
  const { lists, msg, answer } = useRequests(initial);
  const l = lists ?? initial;
  return (
    <main className="main">
      {msg && (
        <p className={`msg ${msg.ok ? 'ok' : 'err'}`} role="status">
          {msg.text}
        </p>
      )}
      <section className="col" style={{ gap: 12 }} aria-label="Waiting">
        {!l.pending.length && (
          <div className="card">
            <span className="t">Nothing waiting</span>
            <span className="s">Requests for more time, a new title or a task done come from the kid screens on the TV.</span>
          </div>
        )}
        {l.pending.map((r) => (
          <RequestCard key={r.id} r={r} onAnswer={(x, d) => void answer(x, d)} />
        ))}
      </section>
      {l.earlier.length > 0 && (
        <section className="card" aria-label="Earlier today">
          <span className="lbl">Earlier today</span>
          {l.earlier.map((r) => (
            <div key={r.id} className="col">
              <span className="t">{r.title}</span>
              <span className="s">{r.sub}</span>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}

/** The requests area at the top of the Dashboard: the first two waiting, and See all. */
export function DashboardRequests({ initial }: { initial: RequestLists }) {
  const { lists, msg, answer } = useRequests(initial);
  const l = lists ?? initial;
  const n = l.pending.length;
  return (
    <section className="col" style={{ gap: 12 }} aria-label="Requests">
      <div className="row">
        <h2 className="h2">{n ? `${n} request${n === 1 ? '' : 's'}` : 'Requests'}</h2>
        <Link href="/profiles/requests">See all</Link>
      </div>
      {!n && <span className="s">Nothing waiting. Kids ask for more time, a title or a task done from the TV.</span>}
      {l.pending.slice(0, 2).map((r) => (
        <RequestCard key={r.id} r={r} onAnswer={(x, d) => void answer(x, d)} />
      ))}
      {msg && (
        <p className={`msg ${msg.ok ? 'ok' : 'err'}`} role="status">
          {msg.text}
        </p>
      )}
    </section>
  );
}
