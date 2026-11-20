'use client';
// The 5-tab shell (Home, Browse, Playlists, Profiles, Settings). The Guest PIN gets Home, Browse and Playlists only.
// Locks back to PIN entry after the set time of no use; the hub enforces the same limit on its side.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { GearIcon, HomeIcon, LockIcon, Logo, PersonIcon, PlaylistIcon, SearchIcon } from './icons';

const TABS = [
  { href: '/home', label: 'Home', Icon: HomeIcon, adultOnly: false },
  { href: '/browse', label: 'Browse', Icon: SearchIcon, adultOnly: false },
  { href: '/playlists', label: 'Playlists', Icon: PlaylistIcon, adultOnly: false },
  { href: '/profiles', label: 'Profiles', Icon: PersonIcon, adultOnly: true },
  { href: '/settings', label: 'Settings', Icon: GearIcon, adultOnly: true },
];

async function lockNow(reason: 'idle' | 'button') {
  await fetch('/api/auth/lock', { method: 'POST' }).catch(() => undefined);
  window.location.assign(reason === 'idle' ? '/pin?idle=1' : '/pin');
}

export function LockButton() {
  return (
    <button type="button" className="icb" aria-label="Lock app" onClick={() => void lockNow('button')}>
      <LockIcon size={20} />
    </button>
  );
}

export default function Shell({ role, lockMinutes, children }: { role: 'adult' | 'guest'; lockMinutes: number; children: React.ReactNode }) {
  const path = usePathname();
  const last = useRef(Date.now());
  const lastPing = useRef(Date.now());

  useEffect(() => {
    const limit = lockMinutes * 60_000;
    const used = () => {
      const now = Date.now();
      last.current = now;
      // Tell the hub the app is in use, at most once a minute.
      if (now - lastPing.current > 60_000) {
        lastPing.current = now;
        void fetch('/api/auth/state', { cache: 'no-store' }).catch(() => undefined);
      }
    };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, used, { passive: true }));
    const check = () => {
      if (Date.now() - last.current >= limit) void lockNow('idle');
    };
    const timer = setInterval(check, 5_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      events.forEach((e) => window.removeEventListener(e, used));
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, [lockMinutes]);

  const tabs = TABS.filter((t) => role === 'adult' || !t.adultOnly);
  return (
    <div className="shell" data-role={role}>
      <nav className="nav" aria-label="Main" style={{ '--tabs': tabs.length } as React.CSSProperties}>
        <Link href="/home" className="brand" aria-label="Popcorn Pilot home">
          <span className="brand-mark">
            <Logo />
          </span>
          <span className="brand-name">Popcorn Pilot</span>
        </Link>
        {tabs.map(({ href, label, Icon }) => {
          const on = path === href || path.startsWith(href + '/');
          return (
            <Link key={href} href={href} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined}>
              <Icon />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className={path === '/browse' ? 'shell-body wide' : 'shell-body'}>{children}</div>
    </div>
  );
}
