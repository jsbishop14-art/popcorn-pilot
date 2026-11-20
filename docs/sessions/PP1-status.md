# PP1 status: foundation, PIN access, profiles, TVs and the hub

Branch: pp1-foundation (from origin/main e9dbc46). Spec: docs/specs/PP1-BUILD-SPEC.md.

## RESUME

### Josh's words (spec section 0, verbatim)

- 2026-11-19 22:10: "approved. now build it using the integrated browser. this sessions should act as the overwatch to ensure the build continues"
- 2026-11-19 22:15: "1. CC in the claude browser using github. exactly as the command center was built ... 7. build everything that doesnt need hardware 8. no budget at this time"
- Requirements: docs/specs/POPCORN-PILOT-HANDOFF.md. Rulings in force: docs/claude/chain.md. Layout: docs/mockup/.
- 2026-11-19 21:35, answers: "1. profiles can be added and changed within the system. this shouldn't be hard coded 2. no limits 3. only popcorn 4. pin"
- 2026-11-19 21:48: "2. log in should be pin only. no names or accounts. kid has none" (asked about guest scope: "1. kid mode and playlists")
- Handoff sections: 1, 1.1, 1.2, 2, 3, 10 (shell, PIN entry, Settings, Profiles list), 11, 12, 13.

### Starting prompt (verbatim)

Unattended run in a FRESH session, started by scripts/run_chain.py. Your job is ONLY build PP1.
1. Read CLAUDE.md, docs/claude/chain.md and the handoff sections your spec names. If docs/specs/PP1-BUILD-SPEC.md is not on main, bring it
   from origin/docs/next-builds with your first commit.
2. git fetch origin. If origin/pp1-foundation exists: check it out, report git status (never discard uncommitted work), read
   docs/sessions/PP1-status.md and continue from PICK UP HERE. Otherwise create pp1-foundation from origin/main and the
   status file with a RESUME block quoting the spec's section 0 and this prompt verbatim.
3. Build docs/specs/PP1-BUILD-SPEC.md per docs/process.md section 4 (decide and log; hard stops only). Commit and push the feature branch
   after every step. ONE deliberate CI run. Keep a tool call printing output at least every 20 minutes.
4. No production grant. Production is Josh's Raspberry Pi, which build sessions never touch, and no real TV is touched (handoff section 12). Migrations land with the code and the Pi updater applies them. No real outside calls: use the stubs and the fake Roku. No real email, ever. Build everything that does not need hardware; list hardware steps in chain.md under Waits on hardware. 
5. Land per the landing rule as adapted in CLAUDE.md (handoff section 12). The merge commit message MUST start with
   "[Merge] PP1 (". The Pi updater deploys and smoke-checks after the merge (handoff section 11). Record the
   landing in chain.md and the status file.
6. Then STOP. Do not start the next build. If a hard stop or a question for Josh blocks landing, write it in the status
   file's Questions section (plain text, full question, options, recommendation), push, and end. If the status file
   already holds questions with NO recorded answer, change nothing and end at once, saying so: Josh answers through the
   chat session, which records the answers in the status file.

### Grant

None (spec section 6). Production is the Pi; never touched.

### Hard stops

- Anything that cannot be undone.
- Any real outside call (TMDB, iCloud, YouTube, AdGuard Home, a real Roku) or real email.
- Touching the Pi or a real TV.

### Later rulings

(none)

## Decided without asking

- D-1: Fonts bundled from the @fontsource npm packages (Fredoka, Nunito), no font CDN. Reason: handoff 1.2.
- D-2: Wrong-PIN lockout is hub-wide, not per device: 5 wrong tries from any phone or computer lock PIN entry for
  1 minute for everyone, and the lockout is written to Activity history. Reason: per-device counting is easy to dodge
  by switching devices; the spec says 5 tries, 1 minute.
- D-3: Sessions live on the hub (the cookie holds only a random token; the hub keeps an HMAC of it). Idle lock is
  enforced on the hub and by the app's own timer. Lock time choices: 1, 2, 5, 10, 15, 30, 60 min (default 5).
- D-4: The Guest PIN sees the TV list on Home (name, room, online, default profile), nothing about TV setup. Reason:
  kid mode and playlists need to pick a TV; no settings are exposed.
- D-5: Channel token per TV (CLAUDE.md section 7 role): made by the Adult PIN on the TV screen, shown once, only its
  hash kept. One channel route in PP1 (GET /api/channel/hello) so the permission map covers the token; PP6 builds
  pairing on it.
- D-6: Changing a PIN in Settings needs the current Adult PIN again; changing the Guest PIN signs out Guest sessions.
- D-7: TV addresses must be on the home network (private IPv4; loopback allowed for the fake Roku). A TV can be
  added while it is off; it shows Offline.
- D-8: Activity history also records hub events (first run PIN setup, lockouts) with a "Hub" badge.
- D-9: The app is served on port 80 on the Pi (http://popcorn.local, hostname set in Raspberry Pi Imager).
- D-10: AdGuard Home is not in the PP1 install script. Reason: spec section 5 puts ad blocking in PP5 (handoff 11.1
  lists it in the install; PP5 adds it to the script).
- D-11: The updater stops the app while it updates (a few minutes at 4:00 AM) so the pre-update database copy is
  consistent, and restores that copy when it rolls back. "Check for updates now" leaves a request file that a
  systemd path unit watches (the app itself never runs the updater or holds root).
- D-12: Next.js telemetry is turned off in the build session, CI and the Pi service. Reason: it is an outside call.
- D-13: Desktop width: the tabs become a left sidebar from 900px; content up to 760px wide.
- D-14: Sections of the mockup that belong to later builds (Kid tools, Family Album, Ad blocking) show a one-line
  "arrives in PPn" note.
- D-15: CI has a second job on GitHub's arm64 runner (free for public repos): install, unit tests and the production
  build on arm64, the Pi's architecture.
- D-16: A profile switched from Kid to Adult keeps its stored safeguards, so switching back restores them. Deleting a
  profile clears it as any TV's default profile.
- D-17: The page guard asks the hub over loopback (127.0.0.1), not through the name the browser used.

## Questions

(none)

## Progress

- Step 0 (2e457a7): branch created; spec, handoff, chain.md, mockup and runner brought from origin/docs/next-builds.
- Step 1 (7bc44ab): scaffold, migration 001 (13 expected objects), secret store, PIN auth, permission map, Roku
  driver, fake Roku, discovery. unit 13/13.
- Step 2 (ea23e7c): API routes, profiles, TVs, activity, hub status. unit 135/135.
- Step 3 (9c30b5d): screens (PIN entry, first run, shell, Profiles, editor, Settings, TV, Activity), page guard.
- Step 4 (632d090): browser tests. e2e 17/17; HTTP permission map 144 answers.
- Step 5 (7305755): updater with rollback, install script, systemd units, backup, smoke, seed. unit 146/146.
- Step 6 (see git log): install guide, CI workflow, status and chain.
- Local checks before the CI push (caching off, fresh npm ci, each exit code read on its own line): lint 0,
  type-check 0, gen-types --check 0, migrate 0 (13 expected objects, 0 missing), shellcheck 0, install dry run 0,
  unit 0 (146/146), next build 0, e2e 0 (17/17; HTTP permission map 144 answers). Controls that must fail: map
  entry flipped (2 unit fails), rollback restore removed (1 updater fail), planted shellcheck issue (caught), Settings
  tab shown to Guest (e2e fails).
- CI run 1 (deliberate, run 44673857800): green. test job: unit 146/146, e2e 17/17 (HTTP permission map 144
  answers), lint, typecheck, gen-types, migrate, shellcheck, install dry run, build. arm64 job (aarch64): unit
  146/146, build. 1 of 5 CI runs used.
- Checks (spec section 4), all passed:
  1. First run, lockout, idle lock: unit auth.test.ts 12/12; e2e first-run 1/1, idle 3/3, lockout 1/1 (real
     60 s wait).
  2. Permission map, every route and role, deny and allow: unit permissions.test.ts 101/101 (24 routes x 4 roles
     plus pages); e2e http-map 144 answers over HTTP (24 routes and 12 pages x 4 roles).
  3. Menus: e2e screens 8/8 (4 at phone width, 4 at desktop width): Profiles, Profile editor, Settings, TV,
     Activity reached by clicking with the Adult PIN; with the Guest PIN the entries are absent and the pages 403.
  4. Roku driver against the fake Roku: unit roku-driver 10/10 driver tests (keypress, launch with content id,
     search launch, active app, device info, media player, power off and on, offline, refused control, address).
  5. Discovery finds the fake Roku; add by address; offline shows offline: unit 3/3 discovery + 5/5 TVs; e2e tvs 3/3.
  6. Updater rollback in temp git repos: unit updater 6/6 (failed smoke and failed build roll back and restore the
     database).
  7. Install script: unit install 5/5 (shellcheck clean, dry run exit 0, every command printed not run).
- Landing: CI green on a branch containing current main (e9dbc46, unchanged). Changed after the tested tree: only
  docs/claude/chain.md and docs/sessions/PP1-status.md (this record). Merged to main with "[Merge] PP1 (".
  Deploy and smoke are the Pi updater's (the Pi is not bought yet; first install per docs/install-pi.md).

## PICK UP HERE

PP1 has landed. Nothing left for PP1. Do not start PP2 from this session.
