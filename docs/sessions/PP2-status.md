# PP2 status: catalog, Browse, title details and suggestions

Branch: pp2-browse (from origin/main 84643cb). Spec: docs/specs/PP2-BUILD-SPEC.md (already on main).

## RESUME

### Josh's words (spec section 0, verbatim)

- 2026-11-19 22:10: "approved. now build it using the integrated browser. this sessions should act as the overwatch to ensure the build continues"
- 2026-11-19 22:15: "1. CC in the claude browser using github. exactly as the command center was built ... 7. build everything that doesnt need hardware 8. no budget at this time"
- Requirements: docs/specs/POPCORN-PILOT-HANDOFF.md. Rulings in force: docs/claude/chain.md. Layout: docs/mockup/.
- 2026-11-19 21:57: "4. yes. there should also be a way to scroll available shows and movie on all platforms. within the app and desktop, we should be able to pick the platform and view the titles/cover photo/trailer just like it does on the normal platform"
- 2026-11-19 22:02: "1. simplier 2. 1 per row 3. both 4. hide"
- Handoff sections: 4, 5.1, 5.11 (Tag as calm only), 10. Layout: docs/mockup/Browse, PhoneBrowse, TitleDetails, Suggestions.

### Starting prompt (verbatim)

Unattended run in a FRESH session, started by scripts/run_chain.py. Your job is ONLY build PP2.
1. Read CLAUDE.md, docs/claude/chain.md and the handoff sections your spec names. If docs/specs/PP2-BUILD-SPEC.md is not on main, bring it
   from origin/docs/next-builds with your first commit.
2. git fetch origin. If origin/pp2-browse exists: check it out, report git status (never discard uncommitted work), read
   docs/sessions/PP2-status.md and continue from PICK UP HERE. Otherwise create pp2-browse from origin/main and the
   status file with a RESUME block quoting the spec's section 0 and this prompt verbatim.
3. Build docs/specs/PP2-BUILD-SPEC.md per docs/process.md section 4 (decide and log; hard stops only). Commit and push the feature branch
   after every step. ONE deliberate CI run. Keep a tool call printing output at least every 20 minutes.
4. No production grant. Production is Josh's Raspberry Pi, which build sessions never touch, and no real TV is touched (handoff section 12). Migrations land with the code and the Pi updater applies them. No real outside calls: use the stubs and the fake Roku. No real email, ever. Build everything that does not need hardware; list hardware steps in chain.md under Waits on hardware. 
5. Land per the landing rule as adapted in CLAUDE.md (handoff section 12). The merge commit message MUST start with
   "[Merge] PP2 (". The Pi updater deploys and smoke-checks after the merge (handoff section 11). Record the
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

- D-1: The Guest PIN browses for a kid profile only. Its "Showing for" picker lists kid profiles, and the hub refuses
  catalog calls from the Guest PIN without a kid profile (403). Reason: Guest is "kid mode and playlists" (21:48);
  this narrows access, never widens it.
- D-2: Block for kids is household wide: one press hides the title from every kid profile, on top of each kid
  profile's own block list (kid_safeguards.blocked_titles, which the PP4 editor edits). Unblocked by the same button.
- D-3: Kid filtering fails closed: a title with no US rating is hidden from kid profiles, and a kid profile with no
  allowed ratings sees nothing. A forbidden title answers 404 on every route (details, More like this, Play,
  Trailer on TV).
- D-4: Play on a TV works now for one title (playlists are PP3): a direct link when the service's content id is
  known, else Roku search launch; the route used is recorded per launch (launch_log, handoff 2.4). TMDB does not
  give Netflix, Prime or Hulu content ids, so real titles use search launch until checked on the real Rokus.
  "Start from" is recorded in Activity history; the streaming app chooses the episode.
- D-5: Trailer in the app: with a TMDB key, the YouTube player (youtube-nocookie.com) loads only when Play trailer is
  pressed. With the sample catalog a stand-in panel shows instead, so no outside call is made.
- D-6: Suggestions: chips per profile ("For <name>"), "For everyone" (Adult PIN), and "Calm titles". The mockup's
  chips name playlists, which arrive in PP3. Picks are similar to what that profile played, else popular per
  service; Calm is similar to the calm titles. The add button is disabled until PP3. Reached from Browse and from
  Playlists.
- D-7: TMDB: US ratings and US subscription availability; Prime Video by provider id 9 or 119. Lists cached 6 hours,
  titles 24 hours; a stale copy is served when TMDB cannot be reached; cover art is saved on the hub
  (data/art-cache).
- D-8: Calm titles list at Settings > Calm titles (mockup Settings row "Calm titles · N tagged"), with Remove.
- D-9: PP_NO_OUTSIDE_CALLS=1 in unit tests, the browser test server and CI: the catalog refuses any address but this
  machine. Tests use a local fake TMDB.
- D-10: Desktop keeps the PP1 sidebar (PP1 D-13); Browse widens to 1440px for the rows and the details panel.
- D-11: With the Adult PIN, "Showing for" starts at "everyone (no kid filter)".
- D-12: Tag as calm and Block for kids are Adult PIN only (they are kid safeguards).
- D-13: The shows or movies filter is a select ("Shows + Movies", "Shows", "Movies").
- D-14: Phone "All" is one poster grid (handoff 4.3), each title once; desktop "All" is one row per platform.
- D-15: The sample catalog (33 invented titles, placeholder posters) is generated by scripts/make-stub-catalog.mjs
  and committed in catalog-stub/.

## Questions

(none)

## Progress

- Step 0 (see git log): branch created from origin/main 84643cb; this status file.
- Step 1 (a8a4d6a): migration 002 (10 expected objects: catalog_cache, title_tags, launch_log, 4 indexes, 1
  trigger), sample catalog (33 titles, 33 posters), TMDB client with hub cache, kid rules.
- Step 2 (e80c2c9): 10 catalog API routes, permission map, TMDB key in Settings. unit 216/216 (catalog 21/21, tmdb
  9/9, permissions 141/141). Control: kid filter letting TV-14 through gave 4 catalog fails.
- Step 3 (58582c5): screens: Browse (desktop rows and details panel, phone grid), title details, Suggestions, Calm
  titles, Settings "Titles and cover art".
- Step 4 (ad1abc1): browser tests. e2e 29/29 (browse 6 phone + 6 desktop). Control: tag buttons shown to the Guest
  PIN failed the guest test.
- Step 5 (62906da): CI branch list and PP_NO_OUTSIDE_CALLS, smoke check covers the catalog (smoke 0 on a fresh
  production build; control against the PP1 build 1), install guide step 5 (TMDB key).
- Local checks before the CI push (caches removed, fresh npm ci, each exit code read on its own line): npm ci 0,
  lint 0, typecheck 0, gen-types --check 0, migrate 0 (21 expected objects, 0 missing), shellcheck 0, install dry
  run 0, unit 0 (216/216), build 0, e2e 0 (29/29; HTTP permission map 196 answers).

## PICK UP HERE

Step 6: the deliberate CI run (push with ALLOW_CI=1, tip without [skip ci]). Then check the run, record it here and
in chain.md, and land per CLAUDE.md section 3.
