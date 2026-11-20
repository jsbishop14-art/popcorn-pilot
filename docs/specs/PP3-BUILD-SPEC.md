# PP3 build spec: playlists, playback engine, queue, remote and dashboard

## 0. Josh's words (verbatim)

- 2026-11-19 22:10: "approved. now build it using the integrated browser. this sessions should act as the overwatch to ensure the build continues"
- 2026-11-19 22:15: "1. CC in the claude browser using github. exactly as the command center was built ... 7. build everything that doesnt need hardware 8. no budget at this time"
- Requirements: docs/specs/POPCORN-PILOT-HANDOFF.md. Rulings in force: docs/claude/chain.md. Layout: docs/mockup/.
- 2026-11-19 21:35: "16. yes 17. yes" (one playlist on several TVs; default profile per TV)
- Original requirements (Oct 2026): unsaved, unnamed on-the-fly playlists; per show choose number of episodes, stay on
  show, time on show, or run indefinitely; picking uses each platform's native UX, no pasting links.
- Handoff sections: 2.4, 2.5, 6, 10. Layout: docs/mockup/PhoneDashboard, Remote, Queue, Playlists, PlaylistEditor,
  ShowOptions, QuickAdd, plus Main (TV home, data only; the channel is PP6).

## 1. What Josh gets

- Playlists list, editor (reorder, per show mode, loop, shuffle, schedule, delete), Show options sheet, quick
  playlist (start now on a chosen TV, keep adding, save as playlist), as in the mockups. Add to playlist and Start
  quick playlist from Browse now work.
- The playback engine on the hub: plays a playlist on one or both TVs, moves through titles by mode, schedules,
  loop and shuffle, Family Album items (data source arrives in PP5; until then the item is accepted and skipped with a
  note), records which launch route each title used (§2.4).
- Live queue per TV (reorder, remove, skip, add), TV remote screen (arrows, OK, back, play/pause, skip, volume, mute,
  send to the other TV, turn off), Dashboard (requests area placeholder until PP4, each TV with now playing and
  progress).
- Hub API the Roku channel will use (PP6): home data (routines placeholder, playlists with cover art, profile), now
  playing, up next.

## 2. Must stay true

- Kid profiles only see and play titles within their rules (rules from PP2; enforcement on the hub).
- Every control action is in Activity history.

## 3. Checks

1. A 3-title playlist plays through on the fake Roku in order with each mode (number of episodes, stay on show, time on
   show, run indefinitely), using a fake clock.
2. Loop and shuffle behave; a scheduled playlist starts at its time on the right TV.
3. Same playlist on both TVs; Send to pauses one and resumes on the other.
4. Quick playlist: first pick asks to start; later picks append; Save as playlist creates a playlist.
5. A failed launch shows a message and moves to the next title.
6. Browser tests reach every new screen from the menus with each PIN.

## 4. Not in this build

Time limits and snap back (PP4), routines and Family Album source (PP5), the Roku channel (PP6).

## 5. Grant

None.
