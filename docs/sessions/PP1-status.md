# PP1 status: foundation, PIN access, profiles, TVs and the hub

Branch: pp1-foundation (from origin/main e9dbc46). Spec: docs/specs/PP1-BUILD-SPEC.md.

## RESUME

### Josh's words (spec section 0, verbatim)

- 2026-11-19 22:10: "approved. now build it using the integrated browser. this sessions should act as the overwatch to ensure the build continues"
- 2026-11-19 22:15: "1. CC in the claude browser using github. exactly as the command center was built ... 7. build everything that doesnt need hardware 8. no budget at this time"
- Requirements: docs/specs/POPCORN-PILOT-HANDOFF.md. Rulings in force: docs/claude/chain.md. Layout: docs/mockup/.
- 2026-11-19 21:35, answers: "1. profiles can be added and changed within the system. this shouldn't be hard coded 2. no limits 3. only popcorn 4. pin"
- 2026-11-19 21:48: "2. log in should be pin only. no names or accounts. kid has none" (asked about guest scope: "1. kid mode and playlists")
- Handoff sections: 1, 1.1, 1.2, 2, 3, 10 (shell, PIN entry, Settings, Profiles list), 11, 12, 13.

### Starting prompt (verbatim)

Unattended run in a FRESH session, started by scripts/run_chain.py. Your job is ONLY build PP1.
1. Read CLAUDE.md, docs/claude/chain.md and the handoff sections your spec names. If docs/specs/PP1-BUILD-SPEC.md is not on main, bring it
   from origin/docs/next-builds with your first commit.
2. git fetch origin. If origin/pp1-foundation exists: check it out, report git status (never discard uncommitted work), read
   docs/sessions/PP1-status.md and continue from PICK UP HERE. Otherwise create pp1-foundation from origin/main and the
   status file with a RESUME block quoting the spec's section 0 and this prompt verbatim.
3. Build docs/specs/PP1-BUILD-SPEC.md per docs/process.md section 4 (decide and log; hard stops only). Commit and push the feature branch
   after every step. ONE deliberate CI run. Keep a tool call printing output at least every 20 minutes.
4. No production grant. Production is Josh's Raspberry Pi, which build sessions never touch, and no real TV is touched (handoff section 12). Migrations land with the code and the Pi updater applies them. No real outside calls: use the stubs and the fake Roku. No real email, ever. Build everything that does not need hardware; list hardware steps in chain.md under Waits on hardware. 
5. Land per the landing rule as adapted in CLAUDE.md (handoff section 12). The merge commit message MUST start with
   "[Merge] PP1 (". The Pi updater deploys and smoke-checks after the merge (handoff section 11). Record the
   landing in chain.md and the status file.
6. Then STOP. Do not start the next build. If a hard stop or a question for Josh blocks landing, write it in the status
   file's Questions section (plain text, full question, options, recommendation), push, and end. If the status file
   already holds questions with NO recorded answer, change nothing and end at once, saying so: Josh answers through the
   chat session, which records the answers in the status file.

### Grant

None (spec section 6). Production is the Pi; never touched.

### Hard stops

- Anything that cannot be undone.
- Any real outside call (TMDB, iCloud, YouTube, AdGuard Home, a real Roku) or real email.
- Touching the Pi or a real TV.

### Later rulings

(none)

## Decided without asking

(see below as added)

## Questions

(none)

## Progress

- Step 0: branch created; spec, handoff, chain.md, mockup and runner brought from origin/docs/next-builds.

## PICK UP HERE

Step 1: scaffold the Next.js 14 app (package.json, tsconfig, vitest, playwright, lint), bundled fonts.
