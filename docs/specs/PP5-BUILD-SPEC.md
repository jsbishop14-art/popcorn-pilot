# PP5 build spec: routines, Family Album and ad blocking

## 0. Josh's words (verbatim)

- 2026-11-19 22:10: "approved. now build it using the integrated browser. this sessions should act as the overwatch to ensure the build continues"
- 2026-11-19 22:15: "1. CC in the claude browser using github. exactly as the command center was built ... 7. build everything that doesnt need hardware 8. no budget at this time"
- Requirements: docs/specs/POPCORN-PILOT-HANDOFF.md. Rulings in force: docs/claude/chain.md. Layout: docs/mockup/.
- 2026-11-19 21:35, ideas: "5. yes 6. yes 10. yes. does that work if this runs on a raspberry pi?"
- 2026-11-19 21:44: "6. icloud 7. all of the above. theyll be added to the icloud folder"; 2026-11-19 21:48: "3. only through streaming"
- 2026-11-19 21:35: "21. home screen and adds. homescreen should be custom. ideally scrolling pictures from an album"
- Handoff sections: 7, 8, 10.1, 11. Layout: docs/mockup/Routines, RoutineEditor, Settings.

## 1. What Josh gets

- Routines list and editor (mockup), run now, Test now, schedules by day and time. Steps: turn on, profile, volume,
  playlist, timer.
- Family Album: iCloud shared album link in Settings; scheduled sync and cache of photos and short clips; counts and
  last sync shown; the album feeds the TV home background (PP6) and plays as a playlist item (completing PP3's
  placeholder). Stub with fixtures in CI.
- Ad blocking: AdGuard Home installed by the Pi install script; Settings shows on or off and blocked today from its
  local API; install guide covers router DNS and the Google DNS redirect rule. Stub in CI.
- Install guide updated for these steps.

## 2. Must stay true

- No real iCloud or AdGuard calls in CI or build sessions.
- Routine steps run in order and stop with a clear message if a step fails.

## 3. Checks

1. A routine runs its steps in order on the fake Roku; a scheduled routine starts at its time (fake clock).
2. Album sync from the stub adds, updates and removes items; a broken link shows an error in Settings, not a crash.
3. Ad blocking status reads from the stub; off state shows correctly.
4. Browser tests reach every new screen from the menus with each PIN.

## 4. Not in this build

The Roku channel (PP6).

## 5. Grant

None.
