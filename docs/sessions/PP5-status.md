# PP5 status: routines, Family Album and ad blocking

Branch: pp5-routines-album-adblock (from origin/main c142ce1). Spec: docs/specs/PP5-BUILD-SPEC.md (already on main).

## RESUME

### Josh's words (spec section 0, verbatim)

- 2026-11-19 22:10: "approved. now build it using the integrated browser. this sessions should act as the overwatch to ensure the build continues"
- 2026-11-19 22:15: "1. CC in the claude browser using github. exactly as the command center was built ... 7. build everything that doesnt need hardware 8. no budget at this time"
- Requirements: docs/specs/POPCORN-PILOT-HANDOFF.md. Rulings in force: docs/claude/chain.md. Layout: docs/mockup/.
- 2026-11-19 21:35, ideas: "5. yes 6. yes 10. yes. does that work if this runs on a raspberry pi?"
- 2026-11-19 21:44: "6. icloud 7. all of the above. theyll be added to the icloud folder"; 2026-11-19 21:48: "3. only through streaming"
- 2026-11-19 21:35: "21. home screen and adds. homescreen should be custom. ideally scrolling pictures from an album"
- Handoff sections: 7, 8, 10.1, 11. Layout: docs/mockup/Routines, RoutineEditor, Settings.

### Starting prompt (verbatim)

Unattended run in a FRESH session, started by scripts/run_chain.py. Your job is ONLY build PP5.
1. Read CLAUDE.md, docs/claude/chain.md and the handoff sections your spec names. If docs/specs/PP5-BUILD-SPEC.md is not on main, bring it
   from origin/docs/next-builds with your first commit.
2. git fetch origin. If origin/pp5-routines-album-adblock exists: check it out, report git status (never discard uncommitted work), read
   docs/sessions/PP5-status.md and continue from PICK UP HERE. Otherwise create pp5-routines-album-adblock from origin/main and the
   status file with a RESUME block quoting the spec's section 0 and this prompt verbatim.
3. Build docs/specs/PP5-BUILD-SPEC.md per docs/process.md section 4 (decide and log; hard stops only). Commit and push the feature branch
   after every step. ONE deliberate CI run. Keep a tool call printing output at least every 20 minutes.
4. No production grant. Production is Josh's Raspberry Pi, which build sessions never touch, and no real TV is touched (handoff section 12). Migrations land with the code and the Pi updater applies them. No real outside calls: use the stubs and the fake Roku. No real email, ever. Build everything that does not need hardware; list hardware steps in chain.md under Waits on hardware. 
5. Land per the landing rule as adapted in CLAUDE.md (handoff section 12). The merge commit message MUST start with
   "[Merge] PP5 (". The Pi updater deploys and smoke-checks after the merge (handoff section 11). Record the
   landing in chain.md and the status file.
6. Then STOP. Do not start the next build. If a hard stop or a question for Josh blocks landing, write it in the status
   file's Questions section (plain text, full question, options, recommendation), push, and end. If the status file
   already holds questions with NO recorded answer, change nothing and end at once, saying so: Josh answers through the
   chat session, which records the answers in the status file.

### Grant

None (spec section 5). Production is the Pi; never touched.

### Hard stops

- Anything that cannot be undone.
- Any real outside call (TMDB, iCloud, YouTube, AdGuard Home, a real Roku) or real email.
- Touching the Pi or a real TV.

### Later rulings

(none)

## Decided without asking

- D-1: Routines are Adult PIN only (list, make, edit, run, Test now, cancel a timer). They set a TV's power, profile
  (an adult one too), volume and playlist, like Settings; the roles table gives the Guest PIN playlists and kid
  mode, not TV setup. The Guest PIN gets no Routines button on Playlists and no Start routine on Home; the pages and
  routes answer 403. Narrower of the two choices; reversible.
- D-2: The Roku channel (PP6) may run a routine for its own TV from the TV home screen (mockup Main: "Routines ...
  OK to start"): POST /api/channel/routines/[id]/run. Refused in kid mode (403 "Leaving kid mode needs the Adult
  PIN."), and the home screen lists no routines in kid mode. Another TV's routine: 404.
- D-3: A routine sets up one TV (picked in the editor, shown on the Turn on step). Each step kind at most once, in
  any order the editor sets; at least one step.
- D-4: Volume: Roku's control protocol has no "set volume to". The step presses Volume down 100 times (setting
  volume_presses_to_zero, default 100) to reach 0, then Volume up to the level. It also clears the wind-down volume
  steps (the level is now known). Checking the real TVs waits on hardware.
- D-5: Turn on: nothing if the TV already reports on; otherwise Turn on, then wait up to 20 s
  (PP_ROUTINE_POWER_WAIT_MS) for it to report on. A TV that does not answer fails the step.
- D-6: The playlist step starts for the routine's Profile step, else the profile the TV is on, else the TV's default
  profile. It goes through the playback engine, so the kid rules apply: a refused kid start (outside viewing hours,
  no time left) fails the step and the run stops there.
- D-7: Timer: turns the TV off (stopping what plays) its minutes after the step. A newer timer on the same TV
  replaces an older one; Routines shows a waiting timer with Cancel timer; deleting the routine cancels it. A timer
  missed by more than 10 minutes (the hub was not running) is dropped, so a hub coming back hours later does not
  turn off a TV someone is watching (found by a unit test; fixed).
- D-8: Test now runs the steps as they are in the editor, saved or not, on the real TV, everything except setting
  the timer (it says when the timer would turn the TV off). Logged as "Tested ...".
- D-9: Schedules work like playlist schedules: days and a time on the hub clock, once a day, up to 10 minutes late
  (a hub restarted later does not run a morning routine).
- D-10: The Family Album link is kept in the secret store (it opens the family's photos to anyone who has it), not
  the database. Adult PIN only. Removing it clears the copies on the hub (the photos stay in iCloud).
- D-11: Album sync: every 6 hours (setting album_sync_hours; checked every 10 minutes, PP_ALBUM_CHECK_MS), Sync now
  in Settings, and right after the link is saved. It keeps the photo copy no wider than 2048 (else the smallest)
  and the 720p copy of a clip; clips over 200 MB and photos over 40 MB are skipped and counted. An item taken out of
  the album is deleted on the hub (the cache is a copy of iCloud, so no soft delete). A sync that fails keeps what
  was copied and records the error in plain words; Settings shows it with the last good sync.
- D-12: The Family Album playlist item opens the Popcorn Pilot channel with contentId "family-album" (PP6 shows the
  photos and clips, shuffled), for its minutes or indefinitely. With no photos synced it is skipped with a note
  saying to add the link (PP3's "skipped until PP5" test inverted). For a kid it counts as screen time; in bedtime
  wind-down it is not a calm title (skipped), as before. Snap back and Send to relaunch it.
- D-13: The TV home background: GET /api/channel/home gains "background" (the album's photos, shuffled); GET
  /api/channel/album lists photos and clips; GET /api/channel/album/[id] serves a file (byte ranges for clips).
  Channel token only.
- D-14: Ad blocking: AdGuard Home's admin page listens only on the Pi (127.0.0.1:3053). The install script answers
  its first-run setup with a random login and leaves it in the data folder; the hub moves it into the secret store
  and deletes the file. Settings shows On, Off or Not answering, and "blocked today" (the hours since local midnight
  in AdGuard Home's hourly figures), with a switch to turn blocking off and on (Adult PIN, logged). The install
  script refuses to install it when something else already answers DNS on the Pi.
- D-15: Home: an Adult TV card with nothing playing gets Start routine (mockup PhoneDashboard), opening Routines for
  that TV.
- D-16: The "coming in PP5" placeholders on Settings and Playlists are replaced; the now unused placeholder
  component is removed.

## Questions

(none)

## Progress

- Step 0: branch created from origin/main c142ce1; this status file.
- Step 1 (659a904): migration 005 (12 expected objects: routines, routine_steps, routine_runs, album_items,
  album_syncs, 6 indexes, 1 trigger; plus the album_sync_hours setting; migrate reads back 56 objects, 0 missing),
  lib/routines.ts, lib/album (iCloud shared album client and sync), lib/adblock.ts, 14 API routes and 3 pages in
  the permission map; the engine plays the Family Album. PP3's "skipped until PP5" test inverted. unit 462/462.
  Note: the step 1 route files were written through a Python heredoc, against the "editor tools only" rule; every
  file after that was written with the editor tools, and those files were checked by type-check, lint and tests.
- Step 2 (96a7edf): unit routines.test (check 1) 11/11; iCloud and AdGuard Home stubs (test/stubs), album fixtures
  (scripts/make-stub-album.mjs), a volume level on the fake Roku. Found and fixed: a timer missed while the hub was
  not running would have turned the TV off days later. Controls: not stopping at a failed step failed 1 test; the
  schedule ignoring its time failed 1 test.
- Step 3 (51a2d76): unit album.test (check 2) 13/13, adblock.test (check 3) 7/7; unit 493/493. Controls: a sync that
  never removes failed 3 tests; status read from "running" instead of protection failed 3 tests.
- Step 4 (69b4fbb): screens: Routines, routine editor, Settings Family Album and Ad blocking, Playlists Routines
  button, Home Start routine.
- Step 5 (d3c15e8): install script AdGuard Home step (shellcheck 0, dry run 0), smoke check, CI branch list,
  install guide steps 8 to 10, chain.md Waits on hardware.
- Step 6 (5601441): e2e routines.spec (phone and desktop). Found: the test added a TV at an address another test
  used (fixed). e2e 67/67 (HTTP permission map 440 answers). Phone-width checks on the editor, the list and
  Settings. Control: the Routines button shown to the Guest PIN failed the Guest test (1 fail), reverted.
- Local checks before the CI push (caches removed, fresh npm ci, each exit code read on its own line): npm ci 0,
  lint 0, typecheck 0, gen-types --check 0, migrate 0 (56 expected objects, 0 missing), shellcheck 0, install dry
  run 0, unit 0 (493/493), build 0, e2e 0 (67/67; HTTP permission map 440 answers), smoke 0 on a fresh production
  build (control against a port with nothing on it: 1). The branch contains current main (c142ce1).

- CI run 1 (deliberate, run 44697841978, commit a04a848): green. test job: unit 493/493, e2e 67/67 (HTTP
  permission map 440 answers), lint, typecheck, gen-types, migrate (56 objects), shellcheck, install dry run,
  build. arm64 job (aarch64): unit 493/493, build. 1 of 5 CI runs used.
- Checks (spec section 3), all passed:
  1. A routine runs its steps in order on the fake Roku; a scheduled routine starts at its time (fake clock): unit
     routines.test 11/11 (Run: Turn on, the profile switch, Volume down 100 times then up 18 (the fake Roku ends at
     18), the playlist's first title, the timer; the timer turns the TV off at 10:45 and not before; the schedule
     starts at 7:00 on a weekday, not at 6:59, not twice, not on Saturday, not at 7:30; a step that fails stops the
     run at that step with "stopped at step 4 (Playlist): ..." and no timer; a TV that does not answer stops at step
     1; Test now does not set the timer; timers cancel and replace; the editor's refusals; edit and delete; Guest
     403; the channel only for its own TV and never in kid mode). Controls: not stopping at a failed step failed;
     the schedule ignoring its time failed.
  2. Album sync from the stub adds, updates and removes items; a broken link shows an error in Settings, not a
     crash: unit album.test 13/13 (first sync 4 added (3 photos, 1 clip); a sync with nothing new downloads
     nothing; the changed album: 1 added, 1 updated (new file and checksum), 1 removed (file deleted); a broken
     link: 200 with the error in plain words, shown in Settings with the last good sync, the 4 items kept; iCloud
     unreachable and a real iCloud address refused here; the album as a playlist item opens the channel with
     "family-album", then the next title; the home background; files with byte ranges; Guest 403). e2e at both
     widths (Save link, counts, Sync now, the broken link's error). Control: a sync that never removes failed.
  3. Ad blocking status reads from the stub; off state shows correctly: unit adblock.test 7/7 (on with 1,284
     blocked today; off; the switch off and on, logged; today counts only the hours since midnight; not answering
     and a refused login shown as unavailable in plain words; the install login file moved into the secret store;
     Guest 403). e2e at both widths (the switch turns the stub off and on). Control: status read from "running"
     failed.
  4. Browser tests reach every new screen from the menus with each PIN: e2e routines.spec 12/12 (6 phone, 6
     desktop): Playlists > Routines, New routine (every step kind, Add step, move, schedule, Test now, Save), Run,
     Cancel timer, Edit, Delete, a failed step's message, Home > Start routine, Settings > Family Album and Ad
     blocking; Guest: Routines and Start routine absent, no Settings, the pages and routes answer 403. Phone-width
     checks pass. Control: the Routines button shown to the Guest PIN failed the Guest test.
  Must stay true: no real iCloud or AdGuard Home call in tests or CI (PP_NO_OUTSIDE_CALLS=1 refuses any address but
  this machine; a unit test shows a real iCloud address refused); routine steps run in order and stop with a clear
  message (check 1).
- Landing: CI green on a branch containing current main (c142ce1, unchanged). Changed after the tested tree: only
  docs/claude/chain.md and docs/sessions/PP5-status.md (this record). Merged to main with "[Merge] PP5 (".
  Migration 005 (12 expected objects) lands with the code; the Pi updater applies it and reads back its objects.
  Deploy and smoke are the Pi updater's (the Pi is not bought yet).

## PICK UP HERE

PP5 has landed. Nothing left for PP5. Do not start PP6 from this session.
