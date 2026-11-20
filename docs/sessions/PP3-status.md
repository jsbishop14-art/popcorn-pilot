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

## PICK UP HERE

Step 4: screens (Dashboard on Home, Playlists, playlist page, editor with Show options, Quick playlist, Live queue,
Remote; Browse Add to playlist and Start quick playlist). Then step 5 browser tests (invert the PP2 "coming in PP3"
assertions in test/e2e/browse.spec.ts and screens.spec.ts), step 6 CI list, smoke, docs, then CI and landing.
