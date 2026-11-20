'use client';
// Earn time tasks (mockup Tasks): pick a kid, see the bonus earned this week against the weekly cap (resets Monday),
// each task with its picture and minutes and today's state (approve one the kid marked done on the TV, or mark it
// done here), and make a new task with a name, minutes and a picture.
import { useState } from 'react';
import { api, ApiError } from '@/lib/client';
import type { KidTasks } from '@/lib/requests';
import { TrashIcon } from './icons';
import { minutesWords } from './KidUi';

interface Data {
  tasks: { id: number; name: string; minutes: number; picture: string; emoji: string }[];
  kids: KidTasks[];
  pictures: Record<string, { label: string; emoji: string }>;
}

const EARNS = [5, 10, 15, 20, 30];

export default function TasksScreen({ initial }: { initial: Data }) {
  const [data, setData] = useState<Data>(initial);
  const [kidId, setKidId] = useState<number | null>(initial.kids[0]?.profileId ?? null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState(10);
  const [picture, setPicture] = useState('toys');

  const kid = data.kids.find((k) => k.profileId === kidId) ?? null;

  async function reload() {
    setData(await api<Data>('/api/tasks'));
  }

  async function run(fn: () => Promise<string>) {
    setMsg(null);
    try {
      const text = await fn();
      await reload();
      setMsg({ ok: true, text });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not reach the hub.' });
    }
  }

  return (
    <main className="main">
      {!data.kids.length ? (
        <div className="card">
          <span className="t">No kid profiles yet</span>
          <span className="s">Add a kid profile in Profiles; tasks earn time for kids.</span>
        </div>
      ) : (
        <div className="chips" role="group" aria-label="Kid">
          {data.kids.map((k) => (
            <button key={k.profileId} type="button" className={`chip${k.profileId === kidId ? ' on' : ''}`} aria-pressed={k.profileId === kidId} onClick={() => setKidId(k.profileId)}>
              {k.name}
            </button>
          ))}
        </div>
      )}
      {kid && (
        <section className="card" aria-label="Bonus this week">
          <div className="row">
            <span className="lbl">Bonus this week</span>
            <span className="t">
              {kid.bonus.usedMin} of {kid.bonus.capMin} min
            </span>
          </div>
          <div className="bar kidbar">
            <span style={{ width: `${kid.bonus.capMin ? Math.min(100, Math.round((kid.bonus.usedMin / kid.bonus.capMin) * 100)) : 0}%`, background: 'var(--mint)' }} />
          </div>
          <span className="s">Weekly cap resets Monday</span>
        </section>
      )}
      {msg && (
        <p className={`msg ${msg.ok ? 'ok' : 'err'}`} role="status">
          {msg.text}
        </p>
      )}
      <section className="card" aria-label="Tasks">
        {!data.tasks.length && <span className="s">No tasks yet. Make one below.</span>}
        {(kid ? kid.tasks : data.tasks.map((t) => ({ ...t, state: null, granted: null, requestId: null }))).map((t) => (
          <div key={t.id} className="qrow" role="group" aria-label={t.name}>
            <div className="lft">
              <span className="taskpic" aria-hidden="true">
                {t.emoji}
              </span>
              <div className="col">
                <span className="t">{t.name}</span>
                <span className="s">
                  +{t.minutes} min
                  {t.state === 'pending' ? ' · kid marked done' : t.state === 'approved' ? ` · today${t.granted !== t.minutes ? ` (+${t.granted} min, weekly cap)` : ''}` : ''}
                </span>
              </div>
            </div>
            <div className="qtools">
              {kid && t.state === 'approved' && <span className="badge ok">Approved</span>}
              {kid && t.state === 'pending' && t.requestId && (
                <button type="button" className="btn pri" onClick={() => void run(async () => (await api<{ message: string }>(`/api/requests/${t.requestId}`, { method: 'POST', body: { decision: 'approve' } })).message)}>
                  Approve
                </button>
              )}
              {kid && t.state === null && (
                <button type="button" className="btn" onClick={() => void run(async () => (await api<{ message: string }>(`/api/tasks/${t.id}/done`, { method: 'POST', body: { profileId: kid.profileId } })).message)}>
                  Mark done
                </button>
              )}
              <button type="button" className="mini" aria-label={`Delete ${t.name}`} onClick={() => void run(async () => (await api(`/api/tasks/${t.id}`, { method: 'DELETE' }), `Deleted ${t.name}`))}>
                <TrashIcon size={16} />
              </button>
            </div>
          </div>
        ))}
      </section>
      <form
        className="card"
        aria-label="New task"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const r = await api<{ task: { name: string; minutes: number } }>('/api/tasks', { method: 'POST', body: { name, minutes, picture } });
            setName('');
            return `Added ${r.task.name} (+${r.task.minutes} min)`;
          });
        }}
      >
        <span className="lbl">New task</span>
        <label className="col" style={{ gap: 6 }}>
          <span className="s">Task</span>
          <input className="field" aria-label="Task" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Pick up toys" />
        </label>
        <div className="col" style={{ gap: 6 }}>
          <span className="s">Earns</span>
          <div className="chips" role="radiogroup" aria-label="Earns">
            {EARNS.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={minutes === m} className={`chip${minutes === m ? ' on' : ''}`} onClick={() => setMinutes(m)}>
                {minutesWords(m)}
              </button>
            ))}
          </div>
        </div>
        <div className="col" style={{ gap: 6 }}>
          <span className="s">Picture</span>
          <div className="chips" role="radiogroup" aria-label="Picture">
            {Object.entries(data.pictures).map(([k, p]) => (
              <button key={k} type="button" role="radio" aria-checked={picture === k} aria-label={p.label} className={`chip${picture === k ? ' on' : ''}`} onClick={() => setPicture(k)}>
                <span aria-hidden="true">{p.emoji}</span>
              </button>
            ))}
          </div>
        </div>
        <button type="submit" className="btn dark wide" disabled={!name.trim()}>
          Add task
        </button>
      </form>
    </main>
  );
}
