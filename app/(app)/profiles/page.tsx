// Profiles list (mockup Profiles).
import Link from 'next/link';
import { AdultOnly, ComingLater, PageTop } from '@/components/Page';
import { PlusIcon } from '@/components/icons';
import { listProfiles } from '@/lib/profiles';
import { pageAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export default function ProfilesPage() {
  if (pageAuth().role !== 'adult') return <AdultOnly />;
  const profiles = listProfiles();
  return (
    <>
      <PageTop title="Profiles" />
      <main className="main">
        {!profiles.length && (
          <div className="card">
            <span className="t">No profiles yet</span>
            <span className="s">Add one for each person who watches. Kid profiles get safeguards.</span>
          </div>
        )}
        {profiles.map((p) => (
          <Link key={p.id} href={`/profiles/${p.id}`} className="card cardlink" aria-label={`Edit ${p.name}`}>
            <div className="row">
              <div className="lft">
                <span className="fd" style={{ background: p.color }}>
                  {p.initial}
                </span>
                <div className="col">
                  <span className="t">{p.name}</span>
                  <span className="s">{p.summary}</span>
                </div>
              </div>
              <span className={`badge ${p.type === 'kid' ? 'ok' : 'soft'}`}>{p.type === 'kid' ? 'Kid' : 'Adult'}</span>
            </div>
          </Link>
        ))}
        <Link href="/profiles/new" className="btn dark wide">
          <PlusIcon size={20} color="#FFFFFF" /> Add profile
        </Link>
        <span className="lbl">Kid tools</span>
        <ComingLater what="Earn time tasks, requests, watch log and alerts" build="PP4" />
      </main>
    </>
  );
}
