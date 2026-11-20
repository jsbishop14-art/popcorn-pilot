# chain.md: Popcorn Pilot build chain

## Build order

| # | Name | Branch | Spec | Handoff sections | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | PP1 | pp1-foundation | docs/specs/PP1-BUILD-SPEC.md | 1, 2, 3, 10, 11, 12, 13 | Landed 2026-11-20 |
| 2 | PP2 | pp2-browse | docs/specs/PP2-BUILD-SPEC.md | 4, 5.1, 10 | Landed 2026-11-20 |
| 3 | PP3 | pp3-playback | docs/specs/PP3-BUILD-SPEC.md | 2.4, 2.5, 6, 10 | Queued |
| 4 | PP4 | pp4-kid-safeguards | docs/specs/PP4-BUILD-SPEC.md | 5, 10 | Queued |
| 5 | PP5 | pp5-routines-album-adblock | docs/specs/PP5-BUILD-SPEC.md | 7, 8, 10.1, 11 | Queued |
| 6 | PP6 | pp6-roku-channel | docs/specs/PP6-BUILD-SPEC.md | 9, 2.4, 5.7, 5.8 | Queued |

## Grants

None. Production is the Raspberry Pi; build sessions never touch it or a real TV. No real outside calls; no real email.

## Waits on Josh

- TMDB API key (free account at themoviedb.org) for real cover art and catalog. Until then the stub is used.
- iCloud shared album link for the Family Album.

## Waits on hardware

- Buy the Raspberry Pi 5 (8GB), power supply, case with fan, storage; run the install (docs/install-pi.md, PP1).
- On each Roku: "Control by mobile apps" network access set to Default or Permissive, and a reserved address in the
  router; then Settings > Find TVs on the network (docs/install-pi.md step 4, PP1).
- If the repo is private when the Pi is installed: a read-only deploy key on the Pi for the clone and the updater
  (PP1 install script clones over HTTPS).
- Router DNS pointed at the Pi; Google DNS redirect rule if a Roku ignores it (PP5).
- Roku developer mode and "Control by mobile apps" on both Rokus; sideload the channel (PP6).
- Verify launch routes (deep link vs search launch) for Netflix, Prime Video and Hulu on the real Rokus (handoff 2.4).
  PP2's Play on a TV uses search launch for TMDB titles (no service content ids); the launch log records each route.
- Check "Trailer on TV" opens the trailer in the YouTube channel on the real Rokus (PP2 sends launch/837 with the
  YouTube video id).
- Confirm the time warning behavior over streaming apps (handoff 9.5).

## Sources

- Requirements: docs/specs/POPCORN-PILOT-HANDOFF.md (v1, 2026-11-19).
- Layout: docs/mockup/ (approved mockup, 2026-11-19 22:10).

## Repos

- jsbishop14-art/popcorn-pilot (this repo) and jsbishop14-art/build-control (shared build usage). Public until the build
  is complete, then private, as with Command Center.

## Rulings in force (Josh's words verbatim, Eastern time, 2026-11-19)

- 21:15: "add ability to use profile. profile should have ability to set to kid, which will have safeguards. i also want to be able to connect to other rokus or smart TVs. the focus is to streamline everything, remove bloat and ads, allow remote control from anywhere, set playlists across multiple platforms."
- 21:35, answers 1 to 28: "1. profiles can be added and changed within the system. this shouldn't be hard coded 2. no limits 3. only popcorn 4. pin 5. yes 6. anything with allowed rating but i should also be able to block 7. yes 8. give settings 9. in settings 10. warning and finish current episode 11. yes 12. yes 13. no 14. 2 rokus and 2 samsung smart tvs. 2 bedrooms and living room 15. no 16. yes 17. yes 18. yes. only control from within the house on the same network. no remote access 19. nothing. removed 20. raspberry pi would be good. how much added work? 21. home screen and adds. homescreen should be custom. ideally scrolling pictures from an album 22. netflix, amazon, hulu 23. yes 24. yes 25. suggest 26. share 27. yes 28. not likely". Meaning: home network only (the 21:15 "remote control from anywhere" is superseded by 18); Pi hub.
- 21:35, ideas: "1. approve 2. approve. we can even build in a screen that has a playful way to display things that can be done to earn more 3. approve. can this be something that is set on the computer and then the roku remote can pick? wed have to disable everything besides arrows, select and volume on remote 4. no 5. yes 6. yes 7. yes 8. yes 9. yes 10. yes. does that work if this runs on a raspberry pi? 11. no"
- 21:44: "skip samsung for now 1. roku in living room and guest room. that is all we are building now 2. skip 3. not terribly worried about it now. but if we can restrict buttons on the roku, we can stop the netflix hulu etc buttons from working 4. ad free 5. 1 pin 6. icloud 7. all of the above. theyll be added to the icloud folder 8. adult sets task and time from computer or mobile. kid or adult marks done. when kid marks done adult approved 9. in app 10. i tag 11. manual 12. christine and i and then a guest 13. mockup should be done here before build. all screens should be mocked up to be sure nothing is missed and the build can be done in 1 go 14. in app 15. ill have to buy one"
- 21:48: "1. kid mode and playlists 2. log in should be pin only. no names or accounts. kid has none 3. only through streaming 4. no 5. new family/kid. first do 1 screen to establish the look 6. yes. 7. static". Meaning: Guest PIN = kid mode and playlists; no local movie files.
- 21:57: "1. colors are ok. change "home video" to "family album" 2. show cover art 3. button 4. yes 5. yes ... 1. picture and title 2. 6 for kid. more for adult. whatever fits 3. both. fade from green > yellow > red 4. yes. there should also be a way to scroll available shows and movie on all platforms. within the app and desktop, we should be able to pick the platform and view the titles/cover photo/trailer just like it does on the normal platform 5. i think that right"
- 22:02: "1. simplier 2. 1 per row 3. both 4. hide 5. build all screens"
- 22:10: "approved. now build it using the integrated browser. this sessions should act as the overwatch to ensure the build continues" and "make no mistakes please"
- 22:15: "1. CC in the claude browser using github. exactly as the command center was built 2. not mac 3. nothing has been done. you have permission to do what is needed and set up the repo as needed, assuming this is done in github. i dont know what is best 4. jsbishop-art. should already be connected 5. every 30 minutes. restart anything as needed. answer questions as needed 6. message me here. table anything that cant be answered without me and continue on something else 7. build everything that doesnt need hardware 8. no budget at this time". Meaning: account jsbishop14-art (the connected account); overwatch every 30 minutes by the chat session; no weekly budget limit.
- 22:18: "this will be unattended from here for 10 hours. please ensure the build continues"

## Decided by the chat session (2026-11-19)

- D-1: Same stack and build process as Command Center (Next.js 14, SQLite, Codespaces, runner, one CI run per build).
- D-2: Six builds in the order above; everything that needs hardware is listed under "Waits on hardware".
- D-3: Repo public until complete, as with Command Center.
- D-4: Builds that hit a question for Josh table it in the status file; the overwatch answers what it can from the
  rulings above and leaves the rest for Josh.

## Landings

- PP1 (foundation, PIN access, profiles, TVs, hub): landed 2026-11-20 by the merge commit "[Merge] PP1 (" on main.
  CI run 44673857800 green (test job and arm64 job) on the branch, which contained current main (e9dbc46). Checks
  1 to 7 passed (numbers in docs/sessions/PP1-status.md). No migration grant needed: migration 001 (13 expected
  objects) is applied by the Pi updater. The Pi does not exist yet, so the first install (docs/install-pi.md) applies
  it.
- PP2 (catalog, Browse, title details and suggestions): landed 2026-11-20 by the merge commit "[Merge] PP2 (" on
  main. CI run 44677555216 green (test job and arm64 job) on the branch, which contained current main (84643cb).
  Checks 1 to 5 passed (numbers in docs/sessions/PP2-status.md). Migration 002 (10 expected objects) lands with the
  code and is applied by the Pi updater. Until Josh enters a TMDB key (Waits on Josh), Browse shows the sample
  catalog.
