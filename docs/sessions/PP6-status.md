# PP6 status: the Popcorn Pilot Roku channel

Branch: pp6-roku-channel (from origin/main 48fe879). Spec: docs/specs/PP6-BUILD-SPEC.md (already on main).

## RESUME

### Josh's words (spec section 0, verbatim)

- 2026-11-19 22:10: "approved. now build it using the integrated browser. this sessions should act as the overwatch to ensure the build continues"
- 2026-11-19 22:15: "1. CC in the claude browser using github. exactly as the command center was built ... 7. build everything that doesnt need hardware 8. no budget at this time"
- Requirements: docs/specs/POPCORN-PILOT-HANDOFF.md. Rulings in force: docs/claude/chain.md. Layout: docs/mockup/.
- 2026-11-19 21:44: "3. ... if we can restrict buttons on the roku, we can stop the netflix hulu etc buttons from working"
- 2026-11-19 21:35 idea 3: "can this be something that is set on the computer and then the roku remote can pick? wed have to disable everything besides arrows, select and volume on remote"
- 2026-11-19 21:57: "1. picture and title 2. 6 for kid. more for adult. whatever fits"
- Handoff sections: 9, 2.4, 5.7, 5.8. Layout: docs/mockup/Main, KidHome, ProfilePicker, TvPin, KidPicker, EarnTime,
  TimeWarning, TimeUp, RequestSent, NowPlaying.

### Starting prompt (verbatim)

Unattended run in a FRESH session, started by scripts/run_chain.py. Your job is ONLY build PP6.
1. Read CLAUDE.md, docs/claude/chain.md and the handoff sections your spec names. If docs/specs/PP6-BUILD-SPEC.md is not on main, bring it
   from origin/docs/next-builds with your first commit.
2. git fetch origin. If origin/pp6-roku-channel exists: check it out, report git status (never discard uncommitted work), read
   docs/sessions/PP6-status.md and continue from PICK UP HERE. Otherwise create pp6-roku-channel from origin/main and the
   status file with a RESUME block quoting the spec's section 0 and this prompt verbatim.
3. Build docs/specs/PP6-BUILD-SPEC.md per docs/process.md section 4 (decide and log; hard stops only). Commit and push the feature branch
   after every step. ONE deliberate CI run. Keep a tool call printing output at least every 20 minutes.
4. No production grant. Production is Josh's Raspberry Pi, which build sessions never touch, and no real TV is touched (handoff section 12). Migrations land with the code and the Pi updater applies them. No real outside calls: use the stubs and the fake Roku. No real email, ever. Build everything that does not need hardware; list hardware steps in chain.md under Waits on hardware. 
5. Land per the landing rule as adapted in CLAUDE.md (handoff section 12). The merge commit message MUST start with
   "[Merge] PP6 (". The Pi updater deploys and smoke-checks after the merge (handoff section 11). Record the
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

- D-1: Pairing. Settings > TV has "Pair the channel" (Adult PIN only): the hub makes a new channel token and opens
  the channel on that TV with the hub address and the token as launch parameters (Roku ECP launch); the channel
  keeps both in its own storage. No PIN is stored on the TV. If the TV does not answer, the old token is put back.
  The hub address is this machine's home network address and port (PP_HUB_URL overrides). The old "Make channel
  token" stays as a fallback; the channel has a screen to type the address and token by hand. Reason: no typing on
  the TV in the normal case; anyone on the home network could already control the Rokus by ECP (accepted in PP1).
- D-2: The TV profile picker: in kid mode every switch needs the Adult PIN (leaving kid mode). Out of kid mode: a
  kid profile needs no PIN; an adult profile needs the Adult PIN; "Guest" (no profile, mockup ProfilePicker) takes
  the Adult or Guest PIN. Reason: mockup ("Grown-up profiles ask for the PIN", lock badge on Family and Guest);
  handoff 3.4; the Guest PIN can never take a TV out of kid mode, so no access widens. Wrong PINs count toward the
  hub-wide lockout.
- D-3: The Kid picker board: the titles in the household's playlists that the kid may watch (set on the phone or
  computer; the remote picks, idea 3), in playlist order, then filled from the catalog's titles the kid may watch,
  taking from each platform in turn. 6 tiles for a kid, 12 for an adult profile (6 across, 2 rows at 1080p). The
  hub sends only allowed titles and refuses any other title picked (kid rules on the hub).
- D-4: Kid home "Keep watching" starts the playlist this kid played last (any TV), from the start. Reason: the hub
  does not know where a streaming app left off; starting the list again is the plain choice. Hidden when the kid
  has not played a playlist yet.
- D-5: The Now playing bridge (handoff 6.7): only on a TV with the channel paired, only when a title ends by itself
  and another is waiting. The hub opens the channel on the bridge screen and the next title starts after 8 seconds
  (the channel counts the last 5 down, mockup "Starting in 5 seconds"), or at once with Play now; Skip skips the
  title up next and counts down again for the one after. Skips from the app go straight on as before. TVs without
  the channel paired behave exactly as in PP3 to PP5 (so nothing changes until the channel is installed).
- D-6: The time warning (handoff 9.5): on the bridge screen when the warning is due or the next title is the last
  one today (after it, half an episode or less would be left: PP4 D-3); that counts as the warning. Still due in the
  middle of an episode: the hub opens the channel's warning screen for 8 seconds, then opens the title again (on
  Netflix this may restart the episode or resume it; checked on hardware, already in Waits on hardware).
- D-7: Power on (handoff 9.4): the hub asks each paired TV not in kid mode whether it is on (every 2 seconds, with
  snap back); a change from standby to on sets the TV to its default profile (kid mode for a kid) and opens the
  channel, unless a routine is running there or something is playing. Kid mode TVs: snap back already opens the
  channel when they are turned on (PP4). This completes PP4 D-1.
- D-8: Things done on the TV without a PIN (a kid picking a title or a profile, starting a playlist, Play now, Skip)
  are in Activity history as the hub, with the device "<TV name> TV" and "(from the TV)".
- D-9: Migration 006 adds two columns to playback (bridge_until, warn_resume_at). The migration checker now reads
  back columns ("-- expect: column table.column"), with a control test that a dropped column is reported.
- D-10: Cover art for the channel comes from a channel route (GET /api/channel/art/[id]); the channel's home,
  board and now playing send those addresses. The two PP5 tests that expected the app's art address and the old
  now-playing shape were changed to the new rule.
- D-11: The adult picker board is reached from the TV home screen by a last card "Pick a show" in the Playlists row
  (mockup Main has no place for it; handoff 9.2 asks for it). Reason: no new row; same card shape as the mockup's.
- D-12: In kid mode the remote's Back key does nothing (check 2), so kid screens whose mockup has no on-screen way
  out (Profile picker, PIN, picker board) get a "Back" button in the footer, styled as the mockup's other footer
  buttons (EarnTime's Back, KidHome's Not me).
- D-13: Time is up (mockup TimeUp says "TV turns off in 10 seconds"): the hub turns the TV off at once (PP4 D-5),
  so the screen is what a kid sees if the TV is turned on again that day: "All done for today! See you tomorrow,
  <name>." (or the viewing hours when those ended). "Ask a grown-up" asks for 20 minutes and is shown only when the
  kid's rules allow asking.
- D-14: Kid title requests (asking for a title the kid may not watch) are not on the TV: the board only shows
  allowed titles, so there is nothing to ask for there. The hub API for them (PP4) stays.
- D-15: Fonts: Fredoka and Nunito TTF (SIL Open Font License) from the @expo-google-fonts npm packages, copied into
  the channel at build time; pictures (rounded boxes, circles, icons, the channel icon and splash) are drawn by
  scripts/roku-assets.mjs at build time. No binary files in the repo. Task pictures are drawn icons (a Roku font
  cannot show the app's emoji).
- D-16: The stub catalog's cover art is SVG, which a Roku cannot show: with the stub the tiles show their color, the
  platform and the title; real TMDB posters are JPEG and show.
- D-17: Besides Rooibos (runs on a Roku), the channel is run in CI by the brs BrightScript interpreter: the key
  policy and routing cases (test/unit/roku-keys.test.ts, the same case table as the Rooibos suite, with a control
  that a policy letting Back through fails), and every screen drawn with sample hub data and driven by remote keys
  (test/unit/roku-screens.test.ts, 33 scenarios). This found two bugs before any Roku: a variable named m in the
  color helper, and integer and float return types.
- D-18: test/unit/safeguards.test.ts (PP4, snap back with the real-time watcher) read the alert the moment the fake
  Roku saw the relaunch; the hub writes the alert just after. It failed once in the full suite under load (passes
  alone 3 of 3). The test now waits for the alert (up to 2 s). Wrong test, proven by the order in lib/snapback.ts.

## Questions

(none)

## Progress

- Step 0: branch created from origin/main 48fe879; this status file.
- Step 1: hub API for the channel: pairing, TV profile picker, playlists from the TV, picker board, picking a title,
  bridge, warning screen, power on, channel art; migration 006 (2 expected columns). test/unit/channel-api.test.ts
  (check 3, 31 tests). Unit 553/553, type-check 0, lint 0.

- Step 2a (133d785): channel scaffold, asset generator, build script, Rooibos spec, brs runner.
- Step 2b: all 12 screens (Home, KidHome, ProfilePicker, Pin, KidPicker, EarnTime, TimeUp, RequestSent,
  NowPlaying, TimeWarning, Album, Pair); roku build 0 errors in both builds, zip 94 files with manifest,
  components, source, images, fonts; screen harness 33 scenarios. Unit 566/566, type-check 0, lint 0.

## PICK UP HERE

Step 3: CI steps for the channel build, deploy script and install guide steps, TvEditor browser test, layout
review against the mockups (check 4), chain.md Waits on hardware.
