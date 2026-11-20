import { notFound } from 'next/navigation';
import { AdultOnly, PageTop } from '@/components/Page';
import ProfileEditor from '@/components/ProfileEditor';
import { getProfile } from '@/lib/profiles';
import { pageAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export default function EditProfilePage({ params }: { params: { id: string } }) {
  if (pageAuth().role !== 'adult') return <AdultOnly />;
  const p = getProfile(Number(params.id));
  if (!p) notFound();
  return (
    <>
      <PageTop title="Edit profile" back="/profiles" />
      <ProfileEditor profile={{ id: p.id, name: p.name, color: p.color, type: p.type }} />
    </>
  );
}
