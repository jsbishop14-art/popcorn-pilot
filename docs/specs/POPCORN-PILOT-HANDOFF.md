# Popcorn Pilot Build Handoff v1

Nov 19, 2026 · Josh

Follow docs/process.md (the build process, in this repo) for how to build; this document says what to build. Ask Josh
what, never how. Section 12 lists where process.md is adapted for this project.

## Sources

- Mockup, the source of truth for layout: docs/mockup/ (exported from the approved mockup canvas "Popcorn Pilot
  Mockups", https://claude.ai/artifact/TWzLDZgunNCdy9RTps34ew). Bracketed values are placeholders. Show names in the
  mockup are invented placeholders; gray boxes stand for real cover art.
- Josh's words: docs/claude/chain.md, "Rulings in force".

## 1. What it is

Popcorn Pilot is a home TV controller. It streamlines viewing across Netflix, Prime Video and Hulu (all on ad free
plans): it replaces the Roku home screen with its own, removes home screen ads and bloat, runs playlists that mix the
three services and a Family Album of photos and clips, and enforces kid safeguards (ratings, screen time, viewing
hours, snap back). It is for one household, personal use, free to run, no new paid services. Not a commercial product.

### 1.1 Platform

| Item | Decision |
| --- | --- |
| Hub | A Raspberry Pi 5 (8GB) on the home network, always on, Raspberry Pi OS 64-bit. Josh has not bought it yet. The hub runs the web app, database, scheduler, Roku driver, snap back watcher, photo cache and ad blocking DNS |
| TVs in this build | 2 Rokus: Living room and Guest room |
| Later | 2 Samsung TVs (Tizen) in a later build. The device layer is pluggable so a Samsung driver can be added without changing the rest |
| Access | Home network only. No remote access from outside the house, no tunnel, no cloud service |
| Clients | Phone browser and computer browser on the home Wi-Fi (one responsive web app), and the Popcorn Pilot Roku channel on each TV |
| Logins | No names or accounts. PIN only (§3) |
| Builds | Run in GitHub Codespaces under docs/process.md, never on the Pi |
| Updates | The Pi updates itself after each build lands (§11) |
| Secrets | TMDB API key, PIN hashes, session secret: in a secret store on the Pi, never in code, logs or the repo |

### 1.2 Look

Approved in the mockup: dark navy ground (#0F1B33 / #16264A), popcorn yellow accent (#FFC94A), coral (#FF8A65), mint
(#7FC8A9) and blue (#8FB3FF) secondary colors, Fredoka headings, Nunito body text. TV kid screens are the most playful;
the phone and computer app is a calmer light version (#F3F5F9 ground) with the same fonts, accent and logo. Fonts are
bundled with the app (no font CDN at run time; the hub may have no internet at times).

## 2. TVs and the device layer

1. Each TV has a name, room, address on the home network, type (Roku now), default profile, and online status.
2. Settings finds TVs on the network (Roku SSDP discovery) and also accepts a typed address.
3. Roku control uses Roku External Control Protocol (ECP) on port 8060: keypress, launch, active app, device info,
   media player state, power on and off. The Roku setting "Control by mobile apps" must allow network access; the
   install guide tells Josh where.
4. Launching a title: by channel id (Netflix 12, Prime Video 13, Hulu 2285, YouTube 837) plus the best available
   route: a deep link with the service's content id when known, else Roku search launch (ECP /search/browse with
   keyword, type, provider id and launch=true). Which route works per service is verified on real hardware later;
   the build supports both and records which one each title used.
5. One playlist can play on both TVs at once. Room presence is manual: pause on one TV, resume on the other ("Send
   to").
6. A fake Roku (an ECP server in the test suite) stands in for real TVs in every build and CI run.

## 3. Access, PINs and profiles

1. Access is by PIN only. No names, no accounts, no email.
   - Adult PIN: one shared PIN, full control (app sign in, switching profiles on the TV, approvals on the TV,
     leaving kid mode).
   - Guest PIN: kid mode and playlists only (start, stop, pick playlists, switch a TV to a kid profile). Nothing in
     settings, profiles, safeguards, PINs or approvals.
   - Kid profiles have no PIN.
2. The app locks back to PIN entry after a set time of no use (Settings, default 5 min). PINs are 4 digits, stored
   hashed, with a lockout after repeated wrong tries.
3. Profiles are created, edited and deleted in the app. Nothing hard coded. Each has a name, a color, an initial, and
   a type: Adult (no limits) or Kid (safeguards, §5). Profiles exist only in Popcorn Pilot and are not mapped to
   Netflix, Hulu or Prime profiles.
4. Each TV has a default profile. The TV profile picker shows every profile; adult profiles and Guest ask for the PIN.
5. Activity history records every change: which PIN (Adult or Guest), from which device (phone, computer, which TV),
   what changed, and when. One shared adult PIN means history cannot tell Josh from Christine (accepted).

## 4. Catalog and Browse

1. Title data, cover art, ratings, runtimes, seasons, trailers and which of Netflix, Prime Video and Hulu streams each
   title come from TMDB (free API key, personal use). Until Josh supplies the key, and always in CI and build
   sessions, a stub with fixture data stands in. Results are cached on the hub.
2. Browse on the phone and computer: pick the platform (All, Netflix, Prime Video, Hulu), search, filter shows or
   movies, and choose which profile you are browsing for. "All" shows one row per platform. Titles show cover art,
   title and rating.
3. Phone Browse is simpler than desktop: platform chips, search, one poster grid; details open as a full screen.
   Desktop shows rows plus a details panel (mockup Browse).
4. Title details: trailer, rating, seasons, episode length, description, start from (season and episode, or next
   unwatched), Play on a TV, Add to playlist, Start quick playlist, More like this, Tag as calm, Block for kids.
5. Trailers play in the app or on a chosen TV (YouTube channel on the Roku).
6. Browsing for a kid profile hides titles above that kid's allowed ratings and titles on that kid's block list.
7. Suggestions recommend titles to add, filtered by the profile's ratings and by availability on the three services.
   Rule based (similar titles from TMDB), no AI.
8. The catalog comes from TMDB, not the platforms, so a title can occasionally show on a service after it has left.
   When a launch fails, the app says so and moves to the next title.

## 5. Kid safeguards (per kid profile)

1. Allowed ratings (TV-Y, TV-Y7, TV-G, G, PG, TV-PG, PG-13, …) and a block list of specific titles.
2. Daily screen time limit, configurable by day of week.
3. Allowed viewing hours window. A start outside the window is refused and alerted.
4. When time runs out: a warning a set time before (default 5 min), the current episode finishes, then the TV turns
   off. Time left is shown to kids as minutes plus a bar whose color fades from green to yellow to red.
5. Episode aware stop: stop at the episode boundary nearest the limit. Timing is approximate (streaming apps do not
   reliably report playback position); the watch log says so.
6. Kids can ask for more time or a new title from the TV. An adult approves or denies in the app, or with the adult
   PIN on the TV.
7. Snap back: in kid mode, any app change Popcorn Pilot did not start (Home button, Netflix, Hulu, Prime or other
   shortcut buttons on the remote) is reversed within a few seconds: the hub polls each Roku's active app, compares it
   with what the hub launched, and relaunches Popcorn Pilot or the playlist. Roku does not let an app disable those
   buttons; snap back is how they are neutralized.
8. Inside the Popcorn Pilot channel in kid mode, only arrows, OK and volume do anything.
9. Inside an allowed streaming app a kid can browse other titles. Accepted for now.
10. Adults are alerted in the app (Alerts screen and dashboard) when a kid leaves the playlist, presses Home, opens an
    app Popcorn Pilot did not launch, starts outside viewing hours, or when time is up. In app only: no push, email or
    text.
11. Bedtime wind-down: adults tag titles as calm; in the last stretch (default 15 min) only calm titles play, the
    volume steps down, then the TV turns off.
12. Earn more time: adults create tasks (name, minutes, picture) from phone or computer. A kid or an adult marks a task
    done; when a kid marks it done on the TV, an adult approves. Weekly bonus cap per kid, resetting Monday.
13. Watch log: per kid history (title, service, TV, start time, approximate minutes) and weekly totals with a day by
    day chart, viewed in the app.

## 6. Playlists and playback

1. Playlists mix Netflix, Prime Video, Hulu and the Family Album. No local movie files.
2. Saved playlists and unsaved quick playlists: pick a first title, the app asks whether to start now (and on which
   TV), keep adding, optionally save as a playlist.
3. Per show, one of: number of episodes, stay on show, time on show (stop at the end of an episode), run indefinitely.
4. Manual start, schedules (day and time, TV), loop, shuffle, and a live queue per TV (reorder, remove, skip, add).
5. Playlists are shared across profiles; kid profiles only see titles within their rules.
6. Playlist cards show cover art from their titles.
7. Between titles the TV shows the Now playing bridge screen (up next, countdown, Play now, Skip).
8. Picking titles uses the app's Browse (§4), which mirrors each platform's browsing. No pasting links.

## 7. Routines

One button sets a TV up: turn on, profile, volume, playlist, timer, in order, editable steps. Manual or scheduled (days
and time). Examples in the mockup: Morning cartoons, Movie night, Bedtime wind-down. A Test now button runs it.

## 8. Family Album

1. Source: an iCloud shared album, read through its public web link (no Apple ID on the Pi). Photos and short clips.
2. The hub syncs it on a schedule and caches it. Settings shows the link, counts and last sync.
3. It is the scrolling background of the TV home screen and a playlist item (photos and clips, shuffle).
4. CI and build sessions never call iCloud: a stub with fixture images stands in.

## 9. TV screens (the Popcorn Pilot Roku channel)

1. A sideloaded Roku channel (developer mode, free), written in BrightScript and SceneGraph. It talks only to the hub
   on the home network.
2. Screens, per the mockup: Home (photo slideshow background, room name, clock, current profile button, routines,
   playlists), Kid home (Keep watching, Pick a show, Earn more time, time left), Profile picker, PIN entry, Kid picker
   board (6 tiles with cover art and title; adult views fit as many as the screen allows), Earn time, Time warning,
   Time is up, Request sent, Now playing bridge.
3. Profile switching is the on screen profile button, not a remote button.
4. On power on, the hub opens the Popcorn Pilot channel, so the TV starts on the Popcorn Pilot home screen.
5. The time warning cannot draw over Netflix, Hulu or Prime (Roku does not let one channel draw over another). Default:
   warn before the last episode starts on the bridge screen; if a warning is still due mid episode, the hub briefly
   brings up the Popcorn Pilot warning screen and resumes. Confirm on hardware later.
6. The channel package builds and validates in CI (BrighterScript compiler). Installing it on the Rokus needs
   hardware and Josh turning on developer mode, so it is a later step.

## 10. Phone and computer app

One responsive web app served by the hub. Tabs: Home, Browse, Playlists, Profiles, Settings. Screens, per the mockup:
PIN entry, Dashboard (requests first, then each TV with what is playing and time left), TV remote, Live queue,
Requests, Alerts, Browse (desktop and phone), Title details, Playlists, Playlist editor, Show options, Quick playlist,
Suggestions, Routines, Routine editor, Profiles, Profile editor with kid safeguards, Earn time tasks, Watch log,
Activity history, Settings (TVs, default profile per TV, Family Album link, PINs, lock time, ad blocking status, hub
status, calm titles).

## 10.1 Ad blocking

AdGuard Home (free, open source) on the Pi blocks Roku home screen ads and tracking. Settings shows on or off and the
count blocked today, read from AdGuard Home's local API. The router must hand out the Pi as DNS; some Rokus are hard
coded to Google DNS, so the install guide covers a router rule. CI uses a stub.

## 11. Hub install and updates

1. An install script and guide for a fresh Raspberry Pi OS 64-bit: Node 20, the app as a service that starts on boot,
   AdGuard Home, the secret store, the database, nightly backup by file copy.
2. After each build lands, the Pi updater pulls main, installs, migrates, restarts, smoke checks and rolls back on
   failure (the Command Center updater pattern). Daily check plus a Check for updates now button in Settings.
3. Install guide steps Josh does by hand: flash the Pi, plug it in, run one command, set the router DNS, turn on Roku
   developer mode and "Control by mobile apps", enter the TMDB key and iCloud album link in Settings.

## 12. Where process.md is adapted

1. Production is the Raspberry Pi. Build sessions never touch it. There is no production database to migrate from a
   build session; migrations land with the code and the Pi updater applies them. Process.md's third landing condition
   (migrations already on production) does not apply.
2. Landing without Josh when CI is green on the branch rebased onto current main (or green with only docs/ or root
   *.md changed since) and every agreed check passed, with its number stated.
3. No tenant id or row security (single household, local SQLite). Process.md section 6's last row does not apply.
4. No real outside calls from CI or build sessions: TMDB, iCloud, YouTube, AdGuard Home and Roku are stubbed. No real
   email, ever.
5. Hardware steps (installing on the Pi, sideloading the channel, checking launch routes on real Rokus) are not done by
   build sessions. They are listed in chain.md under "Waits on hardware".

## 13. Checks that apply to every build

1. Every new screen or button: a browser test that signs in with each PIN (Adult, Guest) and reaches it by clicking
   from the app's own menus. Where it is not for that PIN, the entry point is absent and the route refuses.
2. Permission map for Adult PIN, Guest PIN, signed out, and the Roku channel token, deny and allow, for every route.
3. Kid rules enforced on the hub, not only in the UI.
4. Layout matches the mockup screens named in the build spec.
