# PP4 status: kid safeguards, snap back, requests, earn time, watch log

Branch: pp4-kid-safeguards (from origin/main 24965d6). Spec: docs/specs/PP4-BUILD-SPEC.md (already on main).

## RESUME

### Josh's words (spec section 0, verbatim)

- 2026-11-19 22:10: "approved. now build it using the integrated browser. this sessions should act as the overwatch to ensure the build continues"
- 2026-11-19 22:15: "1. CC in the claude browser using github. exactly as the command center was built ... 7. build everything that doesnt need hardware 8. no budget at this time"
- Requirements: docs/specs/POPCORN-PILOT-HANDOFF.md. Rulings in force: docs/claude/chain.md. Layout: docs/mockup/.
- 2026-11-19 21:35: "6. anything with allowed rating but i should also be able to block 7. yes 8. give settings 9. in settings 10. warning and finish current episode 11. yes 12. yes 13. no"
- 2026-11-19 21:35, ideas: "1. approve 2. approve. we can even build in a screen that has a playful way to display things that can be done to earn more 3. approve. ... 6. yes 7. yes 8. yes"
- 2026-11-19 21:44: "8. adult sets task and time from computer or mobile. kid or adult marks done. when kid marks done adult approved 9. in app 10. i tag ... 14. in app"
- 2026-11-19 21:57: "3. both. fade from green > yellow > red"
- Handoff sections: 5, 10. Layout: docs/mockup/ProfileEditor, Requests, Alerts, Tasks, WatchLog, Profiles, PhoneDashboard.

### Starting prompt (verbatim)

Unattended run in a FRESH session, started by scripts/run_chain.py. Your job is ONLY build PP4.
1. Read CLAUDE.md, docs/claude/chain.md and the handoff sections your spec names. If docs/specs/PP4-BUILD-SPEC.md is not on main, bring it
   from origin/docs/next-builds with your first commit.
2. git fetch origin. If origin/pp4-kid-safeguards exists: check it out, report git status (never discard uncommitted work), read
   docs/sessions/PP4-status.md and continue from PICK UP HERE. Otherwise create pp4-kid-safeguards from origin/main and the
   status file with a RESUME block quoting the spec's section 0 and this prompt verbatim.
3. Build docs/specs/PP4-BUILD-SPEC.md per docs/process.md section 4 (decide and log; hard stops only). Commit and push the feature branch
   after every step. ONE deliberate CI run. Keep a tool call printing output at least every 20 minutes.
4. No production grant. Production is Josh's Raspberry Pi, which build sessions never touch, and no real TV is touched (handoff section 12). Migrations land with the code and the Pi updater applies them. No real outside calls: use the stubs and the fake Roku. No real email, ever. Build everything that does not need hardware; list hardware steps in chain.md under Waits on hardware. 
5. Land per the landing rule as adapted in CLAUDE.md (handoff section 12). The merge commit message MUST start with
   "[Merge] PP4 (". The Pi updater deploys and smoke-checks after the merge (handoff section 11). Record the
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

- Step 0: branch created from origin/main 24965d6; this status file.

## PICK UP HERE

Read the code (lib/playback.ts, lib/profiles.ts, lib/permissions.ts, migrations/003) and start step 1: migration 004
(safeguards, requests, tasks, watch log, alerts).
