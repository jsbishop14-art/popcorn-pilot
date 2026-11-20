# CLAUDE.md: Popcorn Pilot

Rules in working form. Full text: docs/process.md (how to build), docs/specs/POPCORN-PILOT-HANDOFF.md (what to build),
docs/claude/chain.md (build order, rulings, what waits on Josh). Keep this file under ~350 lines.

## 1. Project

- **What:** Popcorn Pilot, a home TV controller: custom Roku home screen, playlists across Netflix, Prime Video and
  Hulu, kid profiles with safeguards, snap back, ad blocking. One household, personal use.
- **Owner:** Josh Bishop, the only human. Contractor, not a programmer: plain words, what a change means for him.
- **Repo:** jsbishop14-art/popcorn-pilot. Public until the build is complete, then private (same as Command Center).
  Never commit secrets or real data. Plan branch: docs/next-builds.
- **Where it runs:** a Raspberry Pi 5 on the home network (not bought yet), Raspberry Pi OS 64-bit. Home network only,
  no remote access. Builds run in GitHub Codespaces and never touch the Pi or a real TV.
- **Stack:** Next.js 14 (App Router) + React 18 + TypeScript, SQLite via better-sqlite3, Vitest, Playwright, Node 20,
  Node crypto only. Roku channel: BrightScript and SceneGraph, compiled with BrighterScript. Must run on arm64 Linux.
- **Layout source of truth:** docs/mockup/ (the approved mockup). Bracketed values and show names are placeholders.

## 2. Run protocol

- Branch first. Never edit on main.
- Analyze, then ask all questions at once, then build.
- Unattended runs commit after every step and push the feature branch after every commit.
- One fresh session per build. The status file docs/sessions/<NAME>-status.md is the only memory between sessions.
- A status file with unanswered questions: change nothing and end at once.
- Decide and log (status file, "Decided without asking") when the choice changes none of Josh's rulings, widens no
  access, writes no real data and can be undone. Otherwise table the question and keep doing independent work.
- Josh (22:15, 2026-11-19): "table anything that cant be answered without me and continue on something else".

## 3. Landing and production (handoff section 12 overrides docs/process.md here)

- **Production is the Raspberry Pi.** Build sessions never touch it or a real TV.
- **Landing without Josh** when both hold:
  1. CI is green on the branch rebased onto current main (or green with only docs/ or root *.md changed since, listed
     in the merge message with the command used).
  2. Every agreed check passed, with its number stated.
- Process.md's third condition (migrations already on production) does not apply. Migrations land with the code and
  list the database objects they should produce, so the Pi updater can read them back.
- Merge message starts `[Merge] <NAME> (`. Record the landing in chain.md and the status file.
- Deploy and smoke after merge are done by the Pi updater (handoff 11), not by the build session.
- One deliberate CI run per build (budget: 1 + 2 infrastructure re-runs + 2 fix runs). Every other push carries
  `[skip ci]`; the pre-push hook enforces it (`git config core.hooksPath scripts/hooks`; ALLOW_CI=1 for the CI push).
  Each build adds its branch to the CI workflow's branch list.
- No real outside calls from CI or build sessions: TMDB, iCloud, YouTube, AdGuard Home and Roku are stubbed (the fake
  Roku ECP server). No real email, ever.
- Hardware steps are not done by build sessions; list them in chain.md under "Waits on hardware".

## 4. Quality rules (docs/process.md section 6)

- Every commit that adds or changes a test states its tally (`unit 14/14`) or says NOT RUN.
- Every new screen or button gets a browser test that signs in with each PIN (Adult, Guest) and reaches it by clicking
  from the app's own menus. No direct URL. Where it is not for that PIN, assert the entry point is absent.
- Permission tests state the answer for every role and token (section 7), deny and allow.
- Never judge a result through a pipe or wrapper: read the real exit code, state counts, run a control that must fail.
- Never reformat a file the repo doesn't already format; never apply zero-context patches.
- Measure speed only on a production build.
- Write files with the editor tools, never shell heredocs.
- When a rule changes, find tests of the old rule and invert them.
- Audit by what is actually called, not by name.
- Specs say what the user gets.
- Tech-debt numbers on a branch are `#N-<tag>`, made real at landing.
- Kid rules are enforced on the hub, never only in the UI.

## 5. Messages and questions

- Short, factual, neutral. No praise, no emotional framing. Plain words.
- Questions in plain text, all at once, in the final message (status file for build sessions). Never the picker:
  ```
  Qn. [NAME-ASK-n] <the question in full; assume no memory>
  Options: A) …  B) …  C) …
  My recommendation: <which, and why in one line>
  ```
- Verify before claiming: git and the database are the facts; say what you checked.
- No dashes in file names of documents sent to Josh.

## 6. Database and storage

- Local SQLite on the Pi. No tenant id or row security (single household).
- Explicit migrations, each listing its expected objects. Soft delete where data matters. Generated types.
- Secrets (TMDB key, session secret) only in the secret store. PINs stored hashed (scrypt). Never in code, logs or tests.

## 7. Roles and permission floors

| Role or token | Can | Cannot |
| --- | --- | --- |
| Adult PIN | Everything | Nothing withheld |
| Guest PIN | Kid mode and playlists: start, stop, pick playlists, switch a TV to a kid profile, Browse | Settings, profiles, safeguards, PINs, approvals, activity history, tasks |
| Kid profile (on the TV, no PIN) | Kid screens: pick allowed titles, ask for time or a title, mark a task done | Anything else; leaving kid mode needs the Adult PIN |
| Channel token (per TV) | The hub API calls the Roku channel needs for that TV | Every other route |
| Signed out | PIN entry and first run only | Everything else |

## 8. Hard limits

- Home network only. No remote access, no tunnel, no cloud service.
- Alerts are in app only. No push, email or text.
- No new paid services.
- No AI calls in the app. Suggestions are rule based.

## 9. References

- docs/claude/chain.md: build order, rulings in force (verbatim, with times), what waits on Josh, waits on hardware.
- docs/specs/POPCORN-PILOT-HANDOFF.md: the full requirements (v1).
- docs/specs/<NAME>-BUILD-SPEC.md: one spec per build.
- docs/process.md: the build process.

Every new Josh ruling goes into the current build's status file and chain.md in the same commit.
