# PP5 status: routines, Family Album and ad blocking

Branch: pp5-routines-album-adblock (from origin/main c142ce1). Spec: docs/specs/PP5-BUILD-SPEC.md (already on main).

## RESUME

### Josh's words (spec section 0, verbatim)

- 2026-11-19 22:10: "approved. now build it using the integrated browser. this sessions should act as the overwatch to ensure the build continues"
- 2026-11-19 22:15: "1. CC in the claude browser using github. exactly as the command center was built ... 7. build everything that doesnt need hardware 8. no budget at this time"
- Requirements: docs/specs/POPCORN-PILOT-HANDOFF.md. Rulings in force: docs/claude/chain.md. Layout: docs/mockup/.
- 2026-11-19 21:35, ideas: "5. yes 6. yes 10. yes. does that work if this runs on a raspberry pi?"
- 2026-11-19 21:44: "6. icloud 7. all of the above. theyll be added to the icloud folder"; 2026-11-19 21:48: "3. only through streaming"
- 2026-11-19 21:35: "21. home screen and adds. homescreen should be custom. ideally scrolling pictures from an album"
- Handoff sections: 7, 8, 10.1, 11. Layout: docs/mockup/Routines, RoutineEditor, Settings.

### Starting prompt (verbatim)

Unattended run in a FRESH session, started by scripts/run_chain.py. Your job is ONLY build PP5.
1. Read CLAUDE.md, docs/claude/chain.md and the handoff sections your spec names. If docs/specs/PP5-BUILD-SPEC.md is not on main, bring it
   from origin/docs/next-builds with your first commit.
2. git fetch origin. If origin/pp5-routines-album-adblock exists: check it out, report git status (never discard uncommitted work), read
   docs/sessions/PP5-status.md and continue from PICK UP HERE. Otherwise create pp5-routines-album-adblock from origin/main and the
   status file with a RESUME block quoting the spec's section 0 and this prompt verbatim.
3. Build docs/specs/PP5-BUILD-SPEC.md per docs/process.md section 4 (decide and log; hard stops only). Commit and push the feature branch
   after every step. ONE deliberate CI run. Keep a tool call printing output at least every 20 minutes.
4. No production grant. Production is Josh's Raspberry Pi, which build sessions never touch, and no real TV is touched (handoff section 12). Migrations land with the code and the Pi updater applies them. No real outside calls: use the stubs and the fake Roku. No real email, ever. Build everything that does not need hardware; list hardware steps in chain.md under Waits on hardware. 
5. Land per the landing rule as adapted in CLAUDE.md (handoff section 12). The merge commit message MUST start with
   "[Merge] PP5 (". The Pi updater deploys and smoke-checks after the merge (handoff section 11). Record the
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

- Step 0: branch created from origin/main c142ce1; this status file.

## PICK UP HERE

Read the spec, the mockup screens Routines, RoutineEditor and Settings, and the code (lib/playback.ts, lib/hub.ts,
lib/permissions.ts, migrations/004). Next: step 1, migration 005 and lib/routines.ts.
