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

(none yet)

## Questions

(none)

## Progress

- Step 0: branch created from origin/main 1504db0; this status file.

## PICK UP HERE

Step 1: read the code (lib/, app/, test/), mockups named in spec section 0; write migration 003 (playlists, items,
schedules, playback sessions, queue) and the engine.
