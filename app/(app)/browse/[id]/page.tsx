// Title details, full screen (mockup TitleDetails). The hub applies the kid rules of the profile in ?profile=.
import { PageTop } from '@/components/Page';
import TitleScreen from '@/components/TitleScreen';
import { catalogSourceName, details, viewerFor } from '@/lib/catalog';
import { HttpError, BadRequest } from '@/lib/route';
import { CatalogUnavailable, profileQuery } from '@/lib/catalog/types';
import { pageAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export default async function TitlePage({ params, searchParams }: { params: { id: string }; searchParams: Record<string, string | string[] | undefined> }) {
  const auth = pageAuth();
  const role = auth.role === 'adult' ? 'adult' : 'guest';
  const asked = Array.isArray(searchParams.profile) ? searchParams.profile[0] : searchParams.profile;
  let profile: number | null = null;
  let problem: string | null = null;
  let title: Awaited<ReturnType<typeof details>> | null = null;
  try {
    const viewer = viewerFor(auth, asked);
    profile = viewer.profileId;
    title = await details(viewer, params.id);
  } catch (err) {
    if (err instanceof HttpError || err instanceof BadRequest || err instanceof CatalogUnavailable) problem = err.message;
    else throw err;
  }
  const back = `/browse${profileQuery(profile)}`;
  if (!title) {
    return (
      <>
        <PageTop title="Title" back={back} />
        <main className="main">
          <div className="note" role="alert">
            <span className="t">{problem}</span>
          </div>
        </main>
      </>
    );
  }
  return (
    <>
      <PageTop title={title.name} back={back} />
      <TitleScreen title={title} profile={profile} role={role} source={catalogSourceName()} />
    </>
  );
}
