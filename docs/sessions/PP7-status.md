# PP7 status: hub on Windows and Mac

Branch: pp7-windows-mac-hub (from origin/main 8b5b5fe). Spec: docs/specs/PP7-BUILD-SPEC.md (brought from
origin/docs/next-builds in the first commit).

## RESUME

### Josh's words (spec section 0, verbatim)

- 2026-11-20 06:30: "can this be used without the pi? turns out a pi is more expensive than i thought. ... for now id like to control with my computer and phone straight to the roku. is that possible?"
- 2026-11-20 06:42: "i will host this on the windows machine. the mac is for building software. 1. windows is on same network 2. ok on windows 3. write script for windows and mac so it can be changed later if i want. keep the pi scripts as well because i will eventually get one 4. skip for now 5. keep pi version"
- Questions those answer (asked by the chat session at 06:30): 1 is the host on the same network as the Rokus; 2 is it OK to run the hub there; 3 write the host install as a build; 4 ad blocking on that host; 5 keep the Pi version.
- Handoff sections: 1.1, 11.4, 12. Rulings: docs/claude/chain.md.

### Starting prompt (verbatim)

Unattended run in a FRESH session, started by scripts/run_chain.py. Your job is ONLY build PP7.
1. Read CLAUDE.md, docs/claude/chain.md and the handoff sections your spec names. If docs/specs/PP7-BUILD-SPEC.md is not on main, bring it
   from origin/docs/next-builds with your first commit.
2. git fetch origin. If origin/pp7-windows-mac-hub exists: check it out, report git status (never discard uncommitted work), read
   docs/sessions/PP7-status.md and continue from PICK UP HERE. Otherwise create pp7-windows-mac-hub from origin/main and the
   status file with a RESUME block quoting the spec's section 0 and this prompt verbatim.
3. Build docs/specs/PP7-BUILD-SPEC.md per docs/process.md section 4 (decide and log; hard stops only). Commit and push the feature branch
   after every step. ONE deliberate CI run. Keep a tool call printing output at least every 20 minutes.
4. No production grant. Production is Josh's hub computer (his Windows PC for now, a Raspberry Pi later), which build sessions never touch, and no real TV is touched (handoff section 12). Migrations land with the code and the Pi updater applies them. No real outside calls: use the stubs and the fake Roku. No real email, ever. Build everything that does not need hardware; list hardware steps in chain.md under Waits on hardware. 
5. Land per the landing rule as adapted in CLAUDE.md (handoff section 12). The merge commit message MUST start with
   "[Merge] PP7 (". The Pi updater deploys and smoke-checks after the merge (handoff section 11). Record the
   landing in chain.md and the status file.
6. Then STOP. Do not start the next build. If a hard stop or a question for Josh blocks landing, write it in the status
   file's Questions section (plain text, full question, options, recommendation), push, and end. If the status file
   already holds questions with NO recorded answer, change nothing and end at once, saying so: Josh answers through the
   chat session, which records the answers in the status file.

### Grant

None (spec section 5). Production is Josh's hub computer (Windows PC for now, Pi later); never touched.

### Hard stops

- Anything that cannot be undone.
- Any real outside call (TMDB, iCloud, YouTube, AdGuard Home, a real Roku) or real email.
- Touching Josh's Windows PC, his Mac, the Pi or a real TV.

### Later rulings

(none)

## Decided without asking

(none yet)

## Questions

(none)

## Progress

- Step 0: branch from origin/main 8b5b5fe, spec brought from origin/docs/next-builds, this status file.

## PICK UP HERE

Step 1: read the app's host detection points (Settings > Hub, Settings > Ad blocking, secret store, backup, updater
request) and add the host kind and address.
