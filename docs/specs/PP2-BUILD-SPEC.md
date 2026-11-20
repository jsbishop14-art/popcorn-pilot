# PP2 build spec: catalog, Browse, title details and suggestions

## 0. Josh's words (verbatim)

- 2026-11-19 22:10: "approved. now build it using the integrated browser. this sessions should act as the overwatch to ensure the build continues"
- 2026-11-19 22:15: "1. CC in the claude browser using github. exactly as the command center was built ... 7. build everything that doesnt need hardware 8. no budget at this time"
- Requirements: docs/specs/POPCORN-PILOT-HANDOFF.md. Rulings in force: docs/claude/chain.md. Layout: docs/mockup/.
- 2026-11-19 21:57: "4. yes. there should also be a way to scroll available shows and movie on all platforms. within the app and desktop, we should be able to pick the platform and view the titles/cover photo/trailer just like it does on the normal platform"
- 2026-11-19 22:02: "1. simplier 2. 1 per row 3. both 4. hide"
- Handoff sections: 4, 5.1, 5.11 (Tag as calm only), 10. Layout: docs/mockup/Browse, PhoneBrowse, TitleDetails, Suggestions.

## 1. What Josh gets

- Browse on desktop and phone exactly as the mockups: platform tabs or chips (All, Netflix, Prime Video, Hulu), search,
  shows or movies filter, "Showing for" profile picker. All shows one row per platform. Cover art, title, rating.
- Title details: trailer (plays in the app; "Trailer on TV" sends it to a chosen TV via the YouTube channel), rating,
  service, seasons, episode length, description, start from, Play on a TV, Add to playlist and Start quick playlist
  (wired in PP3; until then they show "coming in PP3"), More like this, Tag as calm, Block for kids.
- Browsing for a kid profile hides titles above its ratings and titles on its block list.
- Suggestions screen (rule based, similar titles), filtered by profile and the three services.
- TMDB client with caching and a stub with fixtures (cover art images included in the repo as small generated
  placeholders). Settings gets the TMDB key field (stored in the secret store); without a key the stub is used and
  Settings says so.

## 2. Must stay true

- No real TMDB or YouTube calls in CI or build sessions.
- Kid filtering is enforced on the hub API, not only in the UI.

## 3. Checks

1. Browser tests reach Browse, a title, and Suggestions from the menus with each PIN, at phone and desktop width.
2. A kid profile never receives a title above its ratings or on its block list from any API route.
3. All shows exactly one row per platform; platform filter returns only that service.
4. Trailer on TV sends the YouTube launch to the fake Roku.
5. Tag as calm and Block for kids persist and appear in Activity history.

## 4. Not in this build

Playlists and playback (PP3), safeguard editor (PP4).

## 5. Grant

None.
