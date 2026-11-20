import Link from 'next/link';
import { BackIcon } from './icons';
import { LockButton } from './Shell';

export function PageTop({ title, back }: { title: string; back?: string }) {
  return (
    <header className="top">
      {back && (
        <Link href={back} className="icb" aria-label="Back">
          <BackIcon />
        </Link>
      )}
      <h1 className="h1">{title}</h1>
      <LockButton />
    </header>
  );
}

export function ComingLater({ what, build }: { what: string; build: string }) {
  return (
    <div className="note" role="note">
      <span className="t">{what} is coming in a later build</span>
      <span className="s">Planned for {build}.</span>
    </div>
  );
}

/** Shown if a page is reached with a PIN it is not for (the middleware already answers 403 first). */
export function AdultOnly() {
  return (
    <div className="note" role="alert">
      <span className="t">Not available with the Guest PIN</span>
      <span className="s">This part of Popcorn Pilot needs the Adult PIN.</span>
    </div>
  );
}
