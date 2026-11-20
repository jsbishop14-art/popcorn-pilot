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

(none yet)

## Questions

(none)

## Progress

- Step 0: branch created from origin/main 84643cb; this status file.

## PICK UP HERE

Step 1: read the mockups (Browse, PhoneBrowse, TitleDetails, Suggestions) and the PP1 code; then migration 002 and
the catalog layer (TMDB client, stub with fixtures, cache).
