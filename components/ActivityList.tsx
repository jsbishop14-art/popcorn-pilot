'use client';
// Activity history (mockup Activity): every change, which PIN, which device, when.
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';

interface Item {
  id: number;
  at: string;
  pin_type: 'adult' | 'guest' | 'kid' | 'hub';
  device: string;
  summary: string;
}

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'adult', label: 'Adult PIN' },
  { key: 'guest', label: 'Guest PIN' },
] as const;

const BADGE: Record<Item['pin_type'], { cls: string; text: string }> = {
  adult: { cls: 'soft', text: 'Adult' },
  guest: { cls: 'ok', text: 'Guest' },
  kid: { cls: 'ok', text: 'Kid' },
  hub: { cls: 'off', text: 'Hub' },
};

function when(iso: string) {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function ActivityList({ initial }: { initial: Item[] }) {
  const [filter, setFilter] = useState<'' | 'adult' | 'guest'>('');
  const [items, setItems] = useState(initial);
  const [first, setFirst] = useState(true);

  useEffect(() => {
    if (first) {
      setFirst(false);
      return;
    }
    api<{ activity: Item[] }>(`/api/activity${filter ? `?pin=${filter}` : ''}`)
      .then((r) => setItems(r.activity))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  return (
    <main className="main">
      <div className="chips" role="radiogroup" aria-label="Filter">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" role="radio" aria-checked={filter === f.key} className={`chip${filter === f.key ? ' on' : ''}`} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="card" aria-label="Changes">
        {!items.length && <span className="s">No changes yet.</span>}
        {items.map((a, i) => (
          <div key={a.id}>
            {i > 0 && <div className="sep" style={{ marginBottom: 10 }} />}
            <div className="row">
              <div className="lft">
                <span className={`badge ${BADGE[a.pin_type].cls}`}>{BADGE[a.pin_type].text}</span>
                <div className="col">
                  <span className="t">{a.summary}</span>
                  <span className="s">
                    {a.device} · {when(a.at)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
