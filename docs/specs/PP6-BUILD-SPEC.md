# PP6 build spec: the Popcorn Pilot Roku channel

## 0. Josh's words (verbatim)

- 2026-11-19 22:10: "approved. now build it using the integrated browser. this sessions should act as the overwatch to ensure the build continues"
- 2026-11-19 22:15: "1. CC in the claude browser using github. exactly as the command center was built ... 7. build everything that doesnt need hardware 8. no budget at this time"
- Requirements: docs/specs/POPCORN-PILOT-HANDOFF.md. Rulings in force: docs/claude/chain.md. Layout: docs/mockup/.
- 2026-11-19 21:44: "3. ... if we can restrict buttons on the roku, we can stop the netflix hulu etc buttons from working"
- 2026-11-19 21:35 idea 3: "can this be something that is set on the computer and then the roku remote can pick? wed have to disable everything besides arrows, select and volume on remote"
- 2026-11-19 21:57: "1. picture and title 2. 6 for kid. more for adult. whatever fits"
- Handoff sections: 9, 2.4, 5.7, 5.8. Layout: docs/mockup/Main, KidHome, ProfilePicker, TvPin, KidPicker, EarnTime,
  TimeWarning, TimeUp, RequestSent, NowPlaying.

## 1. What Josh gets

- A sideloadable Roku channel (BrightScript and SceneGraph) with every TV screen in the mockups at 1080p (the mockups
  are drawn at 1280x720; scale 1.5x), using the hub API from PP3, PP4 and PP5.
- Remote handling: in kid mode only arrows, OK and volume act; profile switching by the on screen button; adult PIN on
  the TV for approvals and leaving kid mode.
- The hub opens the channel when a TV powers on, and snap back returns to it.
- Time warning per handoff 9.5 (warn on the bridge screen before the last episode; brief warning screen if still due).
- Packaging: the channel zip is built in CI and validated with the BrighterScript compiler; a deploy script and guide
  for sideloading once developer mode is on (run later, with hardware).
- The hub pairs each channel with a per-TV channel token (no PIN stored on the TV).

## 2. Must stay true

- The channel talks only to the hub on the home network.
- No hardware steps in the build session.

## 3. Checks

1. bsc compiles the channel with zero errors; the zip contains manifest, components, source and images.
2. Key handling unit tests (BrighterScript test framework, Rooibos) for kid mode: only arrows, OK and volume act.
3. Hub API contract tests for every call the channel makes, with the channel token, deny and allow.
4. Screenshots are not possible without a Roku; layout is checked by code review against the mockups and recorded.

## 4. Not in this build

Installing on the real Rokus and checking launch routes on hardware (Waits on hardware in chain.md).

## 5. Grant

None.
