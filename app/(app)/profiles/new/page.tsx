import { AdultOnly, PageTop } from '@/components/Page';
import ProfileEditor from '@/components/ProfileEditor';
import { pageAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export default function NewProfilePage() {
  if (pageAuth().role !== 'adult') return <AdultOnly />;
  return (
    <>
      <PageTop title="Add profile" back="/profiles" />
      <ProfileEditor profile={{ name: '', color: '#FFC94A', type: 'kid' }} />
    </>
  );
}
