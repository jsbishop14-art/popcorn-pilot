# PP1 build spec: foundation, PIN access, profiles, TVs and the hub

## 0. Josh's words (verbatim)

- 2026-11-19 22:10: "approved. now build it using the integrated browser. this sessions should act as the overwatch to ensure the build continues"
- 2026-11-19 22:15: "1. CC in the claude browser using github. exactly as the command center was built ... 7. build everything that doesnt need hardware 8. no budget at this time"
- Requirements: docs/specs/POPCORN-PILOT-HANDOFF.md. Rulings in force: docs/claude/chain.md. Layout: docs/mockup/.
- 2026-11-19 21:35, answers: "1. profiles can be added and changed within the system. this shouldn't be hard coded 2. no limits 3. only popcorn 4. pin"
- 2026-11-19 21:48: "2. log in should be pin only. no names or accounts. kid has none" (asked about guest scope: "1. kid mode and playlists")
- Handoff sections: 1, 1.1, 1.2, 2, 3, 10 (shell, PIN entry, Settings, Profiles list), 11, 12, 13.

## 1. What Josh gets

- The app on the hub: PIN entry (mockup Pin), then the 5-tab shell (Home, Browse, Playlists, Profiles, Settings) in
  the approved look, working at phone and desktop width. Tabs not built yet show a short "coming in a later build" note.
- Adult PIN and Guest PIN, set on first run (first-run screen asks for both), changeable in Settings. Lockout after 5
  wrong tries for 1 minute. Auto lock after the set idle time (default 5 min).
- Profiles list and a basic profile editor: name, color, Adult or Kid. Create, edit, delete (soft delete). Kid safeguard
  fields are stored with defaults but their editor arrives in PP4.
- Settings: TVs (discover on the network, add by address, rename, room, default profile, online status), PINs, lock
  time, hub status. Activity history screen (mockup Activity) recording every change with PIN type and device.
- The device layer: a TV driver interface and the Roku ECP driver (keypress, launch, search launch, active app, device
  info, media player, power), plus a fake Roku server used by every test.
- The hub runs on Raspberry Pi OS 64-bit: install script and guide (docs/install-pi.md), a service that starts on
  boot, the secret store, nightly database backup, and the updater (pull main, install, migrate, restart, smoke, roll
  back on failure; daily plus a Check for updates now button).
- CI (one deliberate run per build), the pre-push hook, seed data, migrations with expected objects.

## 2. Stack (decided, same as Command Center unless a reason is logged)

Next.js 14 App Router, React 18, TypeScript, SQLite via better-sqlite3, Vitest, Playwright, Node 20, Node crypto only
(scrypt for PINs, AES-256-GCM for the secret store). Fonts bundled locally. Must build and run on arm64 Linux.

## 3. Must stay true

- Guest PIN can never reach settings, profiles, safeguards, PINs, approvals or activity history (UI absent, route 403).
- Kid profiles never have a PIN. No names or accounts anywhere.
- No real outside calls: the fake Roku stands in. Build sessions never touch a real TV or the Pi.

## 4. Checks

1. First run sets both PINs; wrong PIN 5 times locks for 1 minute; idle lock returns to PIN entry.
2. Permission map (Adult, Guest, signed out, channel token) for every route, deny and allow.
3. Browser tests reach Profiles, Profile editor, Settings, TVs and Activity from the menus with the Adult PIN; with the
   Guest PIN those entry points are absent.
4. Roku driver against the fake Roku: keypress, launch with content id, search launch, active app, power on and off.
5. Discovery finds the fake Roku; add by address works; offline TV shows as offline.
6. Updater: a failed smoke rolls back to the previous version (temp git test, as in Command Center CC12).
7. Install script passes shellcheck and a dry run.

## 5. Not in this build

Browse (PP2), playlists and playback (PP3), safeguard editor and enforcement (PP4), routines, Family Album, ad blocking
(PP5), the Roku channel (PP6).

## 6. Grant

None.
