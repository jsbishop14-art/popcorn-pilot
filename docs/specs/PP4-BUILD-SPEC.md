# PP4 build spec: kid safeguards, snap back, requests, earn time, watch log

## 0. Josh's words (verbatim)

- 2026-11-19 22:10: "approved. now build it using the integrated browser. this sessions should act as the overwatch to ensure the build continues"
- 2026-11-19 22:15: "1. CC in the claude browser using github. exactly as the command center was built ... 7. build everything that doesnt need hardware 8. no budget at this time"
- Requirements: docs/specs/POPCORN-PILOT-HANDOFF.md. Rulings in force: docs/claude/chain.md. Layout: docs/mockup/.
- 2026-11-19 21:35: "6. anything with allowed rating but i should also be able to block 7. yes 8. give settings 9. in settings 10. warning and finish current episode 11. yes 12. yes 13. no"
- 2026-11-19 21:35, ideas: "1. approve 2. approve. we can even build in a screen that has a playful way to display things that can be done to earn more 3. approve. ... 6. yes 7. yes 8. yes"
- 2026-11-19 21:44: "8. adult sets task and time from computer or mobile. kid or adult marks done. when kid marks done adult approved 9. in app 10. i tag ... 14. in app"
- 2026-11-19 21:57: "3. both. fade from green > yellow > red"
- Handoff sections: 5, 10. Layout: docs/mockup/ProfileEditor, Requests, Alerts, Tasks, WatchLog, Profiles, PhoneDashboard.

## 1. What Josh gets

- Profile editor with every kid safeguard (mockup ProfileEditor): ratings, block list, limits by day, viewing hours,
  warning time, finish current episode, wind-down on and length, snap back on, alert on, can ask for more time.
- Enforcement on the hub: time accounting per kid per day, viewing hours, warning, episode aware stop, TV off,
  wind-down (calm titles only, volume steps down), snap back (poll each TV's active app every 2 seconds in kid mode;
  relaunch within 5 seconds), alerts.
- Requests (more time, new title, task done) with approve and deny in the app and API for adult PIN approval on the TV.
- Earn time tasks with pictures and the weekly cap (resets Monday), watch log with weekly chart, dashboard requests
  area, time bars that fade green to yellow to red.
- Hub API for the channel's kid screens (time left, tasks, request, approve with PIN).

## 2. Must stay true

- Every rule is enforced on the hub; the UI only reflects it.
- Guest PIN cannot approve requests or change safeguards.
- No push, email or text alerts: in app only.

## 3. Checks

1. Fake clock: limit by day, viewing hours, warning at the set time, stop at the episode boundary nearest the limit,
   TV off.
2. Snap back: the fake Roku switches to Hulu (not launched by the hub) in kid mode; the hub relaunches within 5 s and
   records an alert. In adult mode nothing happens.
3. Request flow: kid asks for 20 min, adult approves, time left increases by 20; deny changes nothing; both logged.
4. Task flow: kid marks done, adult approves, minutes added up to the weekly cap and no further.
5. Wind-down plays only calm titles and steps the volume down on the fake Roku.
6. Browser tests reach every new screen from the menus with each PIN.

## 4. Not in this build

Routines and Family Album (PP5), the Roku channel (PP6).

## 5. Grant

None.
