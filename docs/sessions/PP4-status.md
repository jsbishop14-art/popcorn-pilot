# PP4 status: kid safeguards, snap back, requests, earn time, watch log

Branch: pp4-kid-safeguards (from origin/main 24965d6). Spec: docs/specs/PP4-BUILD-SPEC.md (already on main).

## RESUME

### Josh's words (spec section 0, verbatim)

- 2026-11-19 22:10: "approved. now build it using the integrated browser. this sessions should act as the overwatch to ensure the build continues"
- 2026-11-19 22:15: "1. CC in the claude browser using github. exactly as the command center was built ... 7. build everything that doesnt need hardware 8. no budget at this time"
- Requirements: docs/specs/POPCORN-PILOT-HANDOFF.md. Rulings in force: docs/claude/chain.md. Layout: docs/mockup/.
- 2026-11-19 21:35: "6. anything with allowed rating but i should also be able to block 7. yes 8. give settings 9. in settings 10. warning and finish current episode 11. yes 12. yes 13. no"
- 2026-11-19 21:35, ideas: "1. approve 2. approve. we can even build in a screen that has a playful way to display things that can be done to earn more 3. approve. ... 6. yes 7. yes 8. yes"
- 2026-11-19 21:44: "8. adult sets task and time from computer or mobile. kid or adult marks done. when kid marks done adult approved 9. in app 10. i tag ... 14. in app"
- 2026-11-19 21:57: "3. both. fade from green > yellow > red"
- Handoff sections: 5, 10. Layout: docs/mockup/ProfileEditor, Requests, Alerts, Tasks, WatchLog, Profiles, PhoneDashboard.

### Starting prompt (verbatim)

Unattended run in a FRESH session, started by scripts/run_chain.py. Your job is ONLY build PP4.
1. Read CLAUDE.md, docs/claude/chain.md and the handoff sections your spec names. If docs/specs/PP4-BUILD-SPEC.md is not on main, bring it
   from origin/docs/next-builds with your first commit.
2. git fetch origin. If origin/pp4-kid-safeguards exists: check it out, report git status (never discard uncommitted work), read
   docs/sessions/PP4-status.md and continue from PICK UP HERE. Otherwise create pp4-kid-safeguards from origin/main and the
   status file with a RESUME block quoting the spec's section 0 and this prompt verbatim.
3. Build docs/specs/PP4-BUILD-SPEC.md per docs/process.md section 4 (decide and log; hard stops only). Commit and push the feature branch
   after every step. ONE deliberate CI run. Keep a tool call printing output at least every 20 minutes.
4. No production grant. Production is Josh's Raspberry Pi, which build sessions never touch, and no real TV is touched (handoff section 12). Migrations land with the code and the Pi updater applies them. No real outside calls: use the stubs and the fake Roku. No real email, ever. Build everything that does not need hardware; list hardware steps in chain.md under Waits on hardware. 
5. Land per the landing rule as adapted in CLAUDE.md (handoff section 12). The merge commit message MUST start with
   "[Merge] PP4 (". The Pi updater deploys and smoke-checks after the merge (handoff section 11). Record the
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

- D-1: Kid mode is per TV, set by the hub when something starts there for a profile (a playlist, a kid's Play on a
  TV, an approved title) or when the profile is switched (Home, "Profile on this TV"). A TV's default profile alone
  does not put it in kid mode; the Roku channel (PP6) sets the TV to its default profile when it opens at power on.
  Reason: the hub only acts on TVs someone set; PP6 completes the power-on path. Reversible.
- D-2: Switching a TV's profile: Adult PIN to any profile or none; Guest PIN to a kid profile only (so it can never
  take a TV out of kid mode; roles table "switch a TV to a kid profile"). Switching stops what was playing for another
  profile; switching to a kid with nothing playing opens the Popcorn Pilot channel.
- D-3: Episode aware stop (handoff 5.5): at each episode end, time is up when the limit is nearer this boundary than
  the next (half an episode or less left); before a title starts, when less than half an episode fits. A movie
  counts as one episode. With "Finish the current episode" off, the stop is at the limit itself. The end of viewing
  hours counts as a limit the same way (whichever comes first), and the alert then says "Viewing hours ended".
- D-4: Time counted is the hub's own count of a kid playback's playing time (paused time not counted), per title, to
  the day the title started (local time). Today's time = limit for the day of the week + minutes approved today -
  minutes watched today.
- D-5: Time up: the playback stops, the TV gets PowerOff, the adults get a "Time is up" alert, and the TV stays in
  kid mode. A new start for that kid is refused ("No time left today") until more time is approved.
- D-6: The time warning: an alert ("5 minutes left") when the time left reaches the warning, once per playback (again
  after more time is approved). The channel API reports warning true for the TV's warning screen (PP6); bringing that
  screen up over a streaming app waits on hardware (already listed).
- D-7: Bedtime wind-down: from "wind-down length" before the end; titles not tagged calm are skipped when they would
  start; a title that is not calm and already playing finishes its episode, then moves on; with no calm title left in
  the queue, a calm title from the household's calm list (one the kid may watch) is added; none at all: time is up
  early. The volume steps down one step every 3 minutes; the next start on that TV turns it back up by the same
  number of steps (logged).
- D-8: Snap back: the watcher asks each TV in kid mode for its app every 2 s (PP_SNAPBACK_MS; 0 turns it off); after
  the hub's own launch it waits 6 s (search launches go through the Roku search screen first); a TV that is off is
  left alone, and when it is turned on Popcorn Pilot opens without an alert; with a title playing it relaunches the
  title, otherwise the Popcorn Pilot channel (Roku id "dev", the settings key channel_app_id). A relaunch that fails
  waits 30 s and is logged once. A launch the hub made while the watcher looked is not undone. Stop in kid mode opens
  the Popcorn Pilot channel instead of pressing Home.
- D-9: Alerts are the kinds in handoff 5.10: left the playlist, pressed Home, opened another app, outside viewing
  hours, the warning, time up. The mockup's "TV offline" alert is not in this build (not a kid rule).
- D-10: Requests: more time (5 to 120 min) is the adult's own decision and is not capped by the weekly bonus cap;
  task minutes are capped (only what fits is added; "weekly cap reached"). Asking again while one is waiting does not
  make a second request. A title can only be asked for if the kid's rules allow it; approved, it plays next on that
  TV when that kid is watching there, else it starts there (the kid rules apply).
- D-11: Approving on the TV: the Adult PIN with the same lockout as signing in (wrong tries count); only requests made
  on that TV. The Guest PIN cannot approve anywhere.
- D-12: Tasks are shared by every kid profile, each done at most once a day per kid; pictures are a bundled set of
  10 (no photo uploads in this build). An adult may mark a task done for a kid in the app (added at once, capped).
  The weekly cap is set in the profile editor ("Earn more time").
- D-13: A kid's "Play on a TV" from Browse runs as a one-title playback so the kid rules apply to it (counted, warned,
  stopped, snap back); adult plays are unchanged. One-title playbacks are logged by whoever started them.
- D-14: Requests, alerts, tasks, the watch log and safeguards are Adult PIN only (roles table: Guest has no approvals,
  safeguards, activity history or tasks); the Guest Dashboard has no requests or alerts area.
- D-15: A new kid profile starts with the default safeguards; they are changed by opening the profile after saving
  (PP1's "changing them arrives in PP4" note and its test inverted).
- D-16: The PP2 and PP3 unit tests and the browser tests run on the real clock: their test kid may watch all day,
  12 hours a day (set in each file's setup); the time rules have their own fake-clock tests.

## Questions

(none)

## Progress

- Step 0: branch created from origin/main 24965d6; this status file.
- Step 1 (50a8e55): migration 004 (14 expected objects: tv_state, kid_requests, tasks, time_grants, watch_log,
  alerts, 7 indexes, 1 trigger; plus 4 playback columns and the channel_app_id setting; migrate reads back 44
  objects, 0 missing), lib/safeguards.ts, lib/tvstate.ts, lib/clock.ts, kid rules in the engine. unit 318/318.
- Step 2 (63d0cea): snap back watcher (lib/snapback.ts), requests and tasks (lib/requests.ts), 15 API routes and 4
  pages in the permission map. unit permissions 277/277.
- Step 3: unit safeguards.test (checks 1, 2, 5) 14/14. Controls: stop only at the limit failed check 1 (Tuesday);
  no relaunch failed check 2; wind-down not skipping failed check 5.
- Step 4 (5c5c53b): unit kid-api.test (checks 3, 4, PIN approval on the TV, safeguards editor, profile switch) 13/13.
  unit 405/405. Controls: uncapped tasks failed check 4; approval without a grant failed check 3 (2 tests).
- Step 5 (3b4b892): screens: profile editor safeguards, Profiles kid tools and time bars, Requests, Alerts, Earn time
  tasks, Watch log; Dashboard requests and alerts (Adult), kid time and "Profile on this TV" on each TV card.
- Step 6: e2e kid.spec (phone and desktop). Found and fixed: snap back could undo a launch the hub made while the
  watcher looked (PP3 Send to test saw a second launch); unit test added (safeguards 15/15; control without the
  check failed). The safeguard steppers were squeezed off the card at phone width; the viewing hours row overflowed
  a phone screen by 11 px.
- Step 7: e2e 55/55 (HTTP permission map 372 answers). Control: the requests area shown to the Guest PIN failed the
  Guest test (1 fail), reverted.
- Step 8: smoke check covers requests, alerts, tasks and the channel kid route; CI branch list; install guide step 7
  (kid mode); chain.md Waits on hardware.

- The Guest PIN's Dashboard gets kid profile names only (the TV profile picker).
- Local checks before the CI push (caches removed, fresh npm ci, each exit code read on its own line): npm ci 0,
  lint 0, typecheck 0, gen-types --check 0, migrate 0 (44 expected objects, 0 missing), shellcheck 0, install dry
  run 0, unit 0 (406/406), build 0, e2e 0 (55/55; HTTP permission map 372 answers), smoke 0 on a fresh production
  build (control against a port with nothing on it: 1).

## PICK UP HERE

The deliberate CI run (run 1 of 5) was pushed with ALLOW_CI=1. Check its result on GitHub Actions for the branch
pp4-kid-safeguards. Green: rebase check against origin/main, record the checks, land with "[Merge] PP4 (". Red:
classify from the log (process.md section 7) before any re-run.
