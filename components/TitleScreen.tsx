'use client';
// Title details as a full screen (phone; mockup TitleDetails). More like this opens the next title here too.
import { useRouter } from 'next/navigation';
import { profileQuery } from '@/lib/catalog/types';
import TitleDetails, { type DetailsData } from './TitleDetails';

export default function TitleScreen({ title, profile, role, source }: { title: DetailsData; profile: number | null; role: 'adult' | 'guest'; source: 'tmdb' | 'stub' }) {
  const router = useRouter();
  return (
    <main className="main">
      <TitleDetails title={title} profile={profile} role={role} source={source} headingLevel={1} onOpen={(k) => router.push(`/browse/${k}${profileQuery(profile)}`)} />
    </main>
  );
}
