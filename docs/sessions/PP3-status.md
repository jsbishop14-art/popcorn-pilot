# PP3 status: playlists, playback engine, queue, remote and dashboard

Branch: pp3-playback (from origin/main 1504db0). Spec: docs/specs/PP3-BUILD-SPEC.md (already on main).

## RESUME

### Josh's words (spec section 0, verbatim)

- 2026-11-19 22:10: "approved. now build it using the integrated browser. this sessions should act as the overwatch to ensure the build continues"
- 2026-11-19 22:15: "1. CC in the claude browser using github. exactly as the command center was built ... 7. build everything that doesnt need hardware 8. no budget at this time"
- Requirements: docs/specs/POPCORN-PILOT-HANDOFF.md. Rulings in force: docs/claude/chain.md. Layout: docs/mockup/.
- 2026-11-19 21:35: "16. yes 17. yes" (one playlist on several TVs; default profile per TV)
- Original requirements (Oct 2026): unsaved, unnamed on-the-fly playlists; per show choose number of episodes, stay on
  show, time on show, or run indefinitely; picking uses each platform's native UX, no pasting links.
- Handoff sections: 2.4, 2.5, 6, 10. Layout: docs/mockup/PhoneDashboard, Remote, Queue, Playlists, PlaylistEditor,
  ShowOptions, QuickAdd, plus Main (TV home, data only; the channel is PP6).

### Starting prompt (verbatim)

Unattended run in a FRESH session, started by scripts/run_chain.py. Your job is ONLY build PP3.
1. Read CLAUDE.md, docs/claude/chain.md and the handoff sections your spec names. If docs/specs/PP3-BUILD-SPEC.md is not on main, bring it
   from origin/docs/next-builds with your first commit.
2. git fetch origin. If origin/pp3-playback exists: check it out, report git status (never discard uncommitted work), read
   docs/sessions/PP3-status.md and continue from PICK UP HERE. Otherwise create pp3-playback from origin/main and the
   status file with a RESUME block quoting the spec's section 0 and this prompt verbatim.
3. Build docs/specs/PP3-BUILD-SPEC.md per docs/process.md section 4 (decide and log; hard stops only). Commit and push the feature branch
   after every step. ONE deliberate CI run. Keep a tool call printing output at least every 20 minutes.
4. No production grant. Production is Josh's Raspberry Pi, which build sessions never touch, and no real TV is touched (handoff section 12). Migrations land with the code and the Pi updater applies them. No real outside calls: use the stubs and the fake Roku. No real email, ever. Build everything that does not need hardware; list hardware steps in chain.md under Waits on hardware. 
5. Land per the landing rule as adapted in CLAUDE.md (handoff section 12). The merge commit message MUST start with
   "[Merge] PP3 (". The Pi updater deploys and smoke-checks after the merge (handoff section 11). Record the
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

- D-1: Guest PIN (narrower than Adult, per the roles table "start, stop, pick playlists"): sees and starts playlists
  for a kid profile only (403 otherwise, like PP2 D-1), uses the quick playlist (add and start, for a kid profile),
  and pauses, resumes, skips or stops what a TV plays. Adult only: making, editing, saving and deleting playlists,
  editing a live queue, Send to, and the TV remote. Narrows access; can be widened later.
- D-2: Modes. Number of episodes: the title plays that many episodes, then the next starts. Time on show: plays for
  the set minutes and stops at the first episode end at or after it. Stay on show and Run indefinitely: the hub never
  moves on by itself; Skip or Stop does. Movies: "Whole movie" (plays its runtime) or Run indefinitely. The Family
  Album item: minutes or Run indefinitely (it is skipped with a note until PP5). Defaults: shows 3 episodes (as in
  the mockup), movies whole.
- D-3: Timing is the hub's own count of playing time (paused time does not count); episode lengths come from the
  catalog (30 min when unknown, 90 min for a movie with no runtime). Approximate, as handoff 5.5 says.
- D-4: The live queue is a copy of the playlist made when it starts (shuffled when shuffle is on). Queue edits change
  that TV's queue only, not the saved playlist. Loop restarts the titles that were played or skipped; titles the hub
  could not play (failed launch, not allowed, Family Album) are not retried, so a loop of failing titles ends.
- D-5: Kid rules at the start and again at every launch: a title the TV's profile may not watch is in the queue as
  "not allowed for <name>" and is never sent to the TV; blocking a title after the start still stops its launch.
  The Family Album is shown to every profile (the household's own photos).
- D-6: Send to: the first TV is paused and keeps its paused playback; the other TV gets a copy of the queue and
  starts the current title, counting from where it was. Anything playing on the other TV stops.
- D-7: Stop sends Home to the TV (best effort). Pause and resume send Play (the Roku play/pause button). Turn off
  (remote) stops the playback.
- D-8: The quick playlist is one per household (playlists.quick = 1). Its first pick answers first: true and the app
  asks to start now and on which TV; later picks append, and also go to the end of the queue of any TV playing it.
  Save as playlist (Adult) names it and makes it a saved playlist; the next pick starts a new quick playlist. Clear
  (both PINs) soft deletes it; whatever is playing keeps playing.
- D-9: Schedules: one per playlist (days, time, TV, optional profile; no profile means the TV's default). It starts
  within 10 minutes after its time, once a day; a hub that was off at that time does not start it late.
- D-10: The Now playing bridge screen (handoff 6.7) is the Roku channel's (PP6). In PP3 the hub launches the next
  title directly and the channel API gives now playing and up next for the bridge.
- D-11: The engine timer runs every 15 seconds on the hub (instrumentation.ts; PP_ENGINE_TICK_MS sets it, 0 turns it
  off). Engine changes run one at a time.
- D-12: The fake Roku can be told to fail one service's launches (check 5), and the browser tests run a second fake
  Roku (port 18062, no discovery answer) for Send to.

## Questions

(none)

## Progress

- Step 0: branch created from origin/main 1504db0; this status file.
- Step 1 (2a15706): migration 003 (11 expected objects: playlists, playlist_items, playback, queue_items, 4 indexes,
  1 trigger; migrate reads back 30 objects, 0 missing), lib/playlists.ts, lib/playback.ts (engine).
- Step 2 (47ed92a): engine unit tests, fake clock. unit playback 19/19. Control: time on show stopping mid-episode
  failed 1 test, reverted.
- Step 3 (a26d0c4): 19 API routes, 6 pages in the permission map, channel API, engine timer. unit 318/318
  (permissions 217/217, playlists-api 7/7). Controls: unmapped routes failed the coverage test; kid filter off failed
  4 tests.
- Step 4 (f9f62df): screens: Dashboard on Home (requests placeholder until PP4), Playlists, playlist page with Start,
  New playlist, editor with Show options, Quick playlist, Live queue, Remote; Browse Add to playlist and Start quick
  playlist work.
- Step 5 (this commit): browser tests, test/e2e/playback.spec.ts at phone and desktop width (7 each). PP2's "coming
  in PP3" assertions inverted (browse.spec, screens.spec). Found and fixed: the app's router showed an earlier copy
  of the Playlists list and the editor (a playlist just made was missing; the editor could save over newer changes);
  the playlist screens now load from the hub when they open, and next.config sets staleTimes.dynamic 0.
  Control: the Remote button shown to the Guest PIN failed the Guest test (1 fail), reverted.
- Step 6 (this commit): CI branch list (pp3-playback), smoke check covers playlists and playback, install guide step
  6 (try a playlist), chain.md Waits on hardware (playlists on the real Rokus).
- Local checks before the CI push (caches removed, fresh npm ci, each exit code read on its own line): npm ci 0,
  lint 0, typecheck 0, gen-types --check 0, migrate 0 (30 expected objects, 0 missing), shellcheck 0, install dry
  run 0, unit 0 (318/318), build 0, e2e 0 (45/45; HTTP permission map 296 answers), smoke 0 on a fresh production
  build (control against a port with nothing on it: 1).

- CI run 1 (deliberate, run 44683080963, commit 5ad6969): green. test job: unit 318/318, e2e 45/45 (HTTP
  permission map 296 answers), lint, typecheck, gen-types, migrate (30 objects), shellcheck, install dry run, build.
  arm64 job (aarch64): unit 318/318, build. 1 of 5 CI runs used.
- Checks (spec section 3), all passed:
  1. A 3-title playlist plays through on the fake Roku in order with each mode, fake clock: unit playback.test
     "check 1" 6/6 (number of episodes, time on show, stay on show, run indefinitely, whole movie with pause, Family
     Album skipped with a note; launch route recorded per title). Control: time on show stopping mid-episode failed.
  2. Loop and shuffle; a scheduled playlist starts at its time on the right TV: unit "check 2" 4/4 (loop, no loop
     control, shuffle and reshuffle on loop, schedule on the Guest room TV for its kid profile, once, not late, not
     when off).
  3. Same playlist on both TVs; Send to: unit "check 3" 2/2; e2e at both widths (both fake Rokus launched; Living
     room paused with Play, Bedroom launched the same title).
  4. Quick playlist: unit "check 4" 1/1 and playlists-api "check 4 over the API" 1/1; e2e at both widths (first pick
     opens Start now?, later picks append to the list and the live queue, Save as playlist makes a 3-title playlist).
  5. A failed launch shows a message and moves on: unit "check 5" 2/2; e2e at both widths (Prime Video made to fail
     on the fake Roku; Home shows "Could not start Puddle Jumpers on Living room: the TV did not start it. Moved to
     the next title." and Bubble Bakery playing).
  6. Browser tests reach every new screen from the menus with each PIN: e2e playback.spec 14/14 (7 phone, 7
     desktop); Guest: New playlist, Edit playlist, Remote, Send to, queue edits and Save as playlist absent; those
     pages and routes answer 403. Control: Remote shown to the Guest PIN failed.
  Must stay true: kid rules on the hub (unit "kid rules" 3/3, playlists-api kid filtering and channel home; control
  with the filter off failed 4 tests); every control action in Activity history (unit, exact list of 11 entries).
- Landing: CI green on a branch containing current main (1504db0, unchanged). Changed after the tested tree: only
  docs/claude/chain.md and docs/sessions/PP3-status.md (this record). Merged to main with "[Merge] PP3 (". Migration
  003 (11 expected objects) lands with the code; the Pi updater applies it and reads back its objects. Deploy and
  smoke are the Pi updater's (the Pi is not bought yet).

## PICK UP HERE

PP3 has landed. Nothing left for PP3. Do not start PP4 from this session.
