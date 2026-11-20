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

- The full 06:30 wording (chain.md, from docs/next-builds): "can this be used without the pi? turns out a pi is more expensive than i thought. looked at the pi website and they were under 100. but the only way to buy is from a reseller and theyre nearly 200. for now id like to control with my computer and phone straight to the roku. is that possible?"
- No new rulings during this build.

## Decided without asking

- D-1: Address, not a name. Settings > Hub and the guides give http://<the computer's home network address>:<port>.
  A name like http://popcorn.local on Windows needs an mDNS responder on UDP 5353 (a second firewall rule, and it
  competes with Windows' own mDNS service), and Android phones do not reliably resolve .local names. The spec allows
  the address when a name cannot be offered without changing system settings. The address picks the real home
  adapter over virtual ones (WSL, Hyper-V, VPN, Docker), preferring 192.168.x.x, then 10.x.x.x, then 172.16 to 31.
- D-2: QR code with the package qrcode-generator (MIT, no dependencies) in the app; jsqr (Apache 2.0, no
  dependencies) only in tests, to decode the code as a phone would. Both from npm; no outside service.
- D-3: On the Pi the address drops ":80" (http://<address> instead of http://<address>:80). Same place.
- D-4: One hub service on Windows and Mac (scripts/hub-service.mjs, plain Node, nothing from node_modules) runs the
  app, restarts it (2 s, doubling to a minute while it keeps failing), runs the nightly backup at 3:00 AM and the
  updater at 4:00 AM and on Check for updates now. A time missed while the computer slept runs when it is back. The
  updater (scripts/hub-update.mjs) is the Pi updater's steps in Node, so one updater serves Windows and Mac and is
  tested on all three systems; the Pi keeps scripts/update.sh unchanged. Reason: Windows Task Scheduler does not
  restart a task whose program exits, and one process in charge of stop, start and update avoids races.
- D-5: The app stops by itself when the hub service is gone (it checks every 5 s; instrumentation.ts), because
  Windows ends a task without a signal and the app would otherwise keep the port.
- D-6: No development seed on a real hub. The spec says the install "runs the migrations and seed"; scripts/seed.mjs
  adds placeholder profiles for development, and the Pi install does not run it. The real hub's starting data is the
  migrations plus first run (PINs) and the sample catalog, which ships with the app. Same as the Pi.
- D-7: Windows install: its own Node 20 copy (and MinGit when Git is not installed) inside C:\ProgramData\PopcornPilot,
  not a system-wide Node install. Reason: fewer changes to Josh's work PC, nothing breaks if he installs another Node
  for something else, and the uninstall removes it all. Node is checked against nodejs.org's SHASUMS256.txt.
- D-8: Windows: the hub runs as the built-in Local Service account (no password to store, few rights) from a
  scheduled task with two triggers: at startup (before anyone signs in) and every 5 minutes (starts the hub if it
  is not running; a running one is left alone). No time limit, runs on battery, never wakes the PC. The folder is
  open only to SYSTEM, administrators and Local Service; the key file is read-only for Local Service.
- D-9: Port 8765 on Windows and Mac (80 needs extra rights and is often taken on a work PC). -Port changes it.
- D-10: Mac: the hub runs as the Mac account that ran the install (launchd daemon with UserName), not a new system
  account (creating one takes many directory-service commands and a hidden user). /Library/PopcornPilot is that
  account's, mode 0700, key 0600. Its own Node 20 copy, as on Windows. Git comes with the Mac's Command Line Tools;
  the install stops with "xcode-select --install" if they are missing (it does not install them).
- D-11: Mac firewall: the Mac has no per-port rule like Windows. Only when the macOS firewall is on, the install adds
  the hub's own Node copy to the allowed apps (socketfilterfw --add/--unblockapp); the uninstall removes it. When the
  firewall is off nothing is changed.
- D-12: The Roku channel from Windows: no bash on Windows for scripts/roku-sideload.sh, so the guide builds the zip
  with the hub's Node and uploads it on the Roku's own developer page in a browser (docs/install-windows.md step
  8). The Mac runs scripts/roku-sideload.sh as it is (bash 3.2 has what it uses).
- D-13: The handoff (docs/specs/POPCORN-PILOT-HANDOFF.md, the chat session's document) is not edited; the spec names
  CLAUDE.md for the wording change. Handoff section 11.4 named by the spec does not exist; 11.1 to 11.3 and the spec
  were followed.
- D-14: Browser tests: the main test hub now says it is a Pi (PP_HOST=pi), so the PP5 ad blocking tests run as on
  the Pi; a second test hub (port 3101, PP_HOST=windows, own empty data folder) runs test/e2e/hub-windows.spec.ts.
  The Mac screen is the same code path with "Mac": covered by test/unit/host.test.ts and the CI macOS job.

## Questions

(none)

## Progress

- Step 0: branch from origin/main 8b5b5fe, spec brought from origin/docs/next-builds, this status file.
- Step 1: lib/host.ts (host kind, home address, hub URL), Settings > Hub shows the host, the address and a QR code,
  ad blocking "Not set up on this computer" on Windows and Mac (GET says so, PATCH 409). Unit: host 9/9, adblock
  7/7, channel-api 32/32.
- Step 2: scripts/hub-service.mjs and scripts/hub-update.mjs, the app's service watchdog. Unit: hub-updater 6/6
  (control: with the database restore removed, the rollback test fails, 1 failed 5 passed), hub-service 4/4.
- Step 3: scripts/install-windows.ps1, scripts/uninstall-windows.ps1, test/install/windows-check.ps1 (CI: task,
  account, firewall rule, leftovers), test/install/hub-check.mjs (CI: installed hub's host, address, ad blocking,
  Guest refused). PSScriptAnalyzer 1.23.0: 0 findings on all three (control snippet: 3 findings). Not run on Windows
  here (no Windows in the codespace): the CI Windows job runs them.
- Step 4: scripts/install-mac.sh, scripts/uninstall-mac.sh, test/install/mac-check.sh. shellcheck --severity=style:
  exit 0. install-mac.sh --dry-run here: exit 0 (15 dry run lines). Real run: CI macOS job.
- Step 5: Settings > Hub browser tests (screens.spec.ts: Pi, address, QR read back at phone and desktop width;
  hub-windows.spec.ts: Windows PC, address, QR, sleep note, ad blocking not set up, Guest absent and 403),
  docs/install-windows.md, docs/install-mac.md, CLAUDE.md sections 1, 3, 6, chain.md (PP7 row, rulings and Waits
  on hardware from docs/next-builds, plus this build's hardware items), CI windows and macos jobs. Browser 70/70.
  Unit 590/590 (22 files). hub-check.mjs against a local build started as a Windows hub: all passed; control (the
  same hub checked as a Mac): 2 failed, exit 1.
- Local checks (branch contains origin/main 8b5b5fe), caches removed (.next, node_modules/.cache, build,
  tsconfig.tsbuildinfo), each exit code read on its own: lint 0; type-check 0; generated types current 0; migrate 0
  (58 expected objects, 0 missing); roku build 0; shellcheck 0 (Pi scripts and the new Mac scripts); Pi install dry
  run 0; Mac install dry run 0; unit 590/590 (--no-cache, 22 files); PSScriptAnalyzer 0 findings on the three
  PowerShell files; production build 0; browser 70/70 on the production build. Then CI run 1 (deliberate).
- CI run 1 (44734851112, 04b52cf): test green, arm64 green, windows red, macos cancelled. Classified from the logs:
  macos never started: "The configuration 'macos-14-arm64-us-default' is not supported" (infrastructure: the image
  is no longer offered; fixed by macos-latest). windows: hub-updater 6/6 and host 9/9 passed on Windows; hub-service
  3/4: "stopping the service stops the app" failed in its cleanup hook (Hook timed out in 10000ms). Wrong test,
  proven: on Windows every kill ends the process at once, so Node reports exitCode null with signalCode set, and the
  hook waited for an exit that had already happened; the same hang reproduced on Linux by killing the service with
  SIGKILL (1 failed, 3 passed). Fixed: the hook treats a set signalCode as gone; the stop test runs both SIGTERM and
  SIGKILL (SIGKILL is how Windows ends the task). Unit hub-service 5/5 here. The install steps after it did not run.
  Fix run 1 of 2 next (CI run 2).

- CI run 2 (44735974044, 5576fb1, fix run 1 of 2): all four jobs green. test: unit 591/591 (22 files), browser
  70/70; arm64 green; windows: PSScriptAnalyzer 0 findings x3, unit 20/20 (hub-updater, hub-service, host), install
  in test mode with smoke ok, 23 installed items ok, hub check all passed, app killed and back (pid 6636 -> 6280)
  with smoke ok, uninstall keeping data 7 items ok, uninstall with data 6 items ok; macos: unit 20/20, install in
  test mode with smoke ok, 19 installed items ok, hub check all passed, app killed and back (pid 4434 -> 4630) with
  smoke ok, kept data 6 items ok, removed 5 items ok. CI runs used: 2 (1 deliberate + 1 fix).
- Checks:
  1 passed: CI windows job (test-mode install; task at boot as Local Service, every 5 min, no time limit, no wake;
    app started by the hub service as Local Service; one firewall rule, inbound TCP 3999, Private only; key closed
    to ordinary users; smoke ok; restart after the app is killed; uninstall leaves only data, then nothing: task,
    rule, listener, processes, folder checked).
  2 passed: CI macos job, the same with launchd (RunAtLoad, KeepAlive, UserName the installing user, running; key
    0600, folder 0700; daemon, plist, listener, processes, folder checked after uninstall).
  3 passed: test/unit/hub-updater.test.ts 6/6 on Linux, Windows and macOS: a failed smoke check rolls back to the
    previous version and restores the database; a failed build too; control: removing the restore turns it red.
  4 passed: Settings > Hub shows the host and the address and the QR code decodes to that address (unit host 9/9;
    browser screens.spec.ts at phone and desktop width for the Pi, hub-windows.spec.ts for Windows; hub-check.mjs
    on the installed Windows and Mac hubs); ad blocking says "Not set up on this computer" on Windows and Mac (unit
    and browser; PATCH refused 409 with no call to AdGuard Home).
  5 passed: PSScriptAnalyzer 0 findings (install-windows.ps1, uninstall-windows.ps1, windows-check.ps1; locally and
    in CI on Windows PowerShell; control snippet 3 findings); shellcheck exit 0 (Pi scripts and the Mac scripts);
    Pi scripts and their tests unchanged (git diff origin/main on install-pi.sh, update.sh, deploy/, install-pi.md,
    updater.test.ts, install.test.ts: 0 lines) and passing in the 591.
  6 passed: browser tests reach Settings > Hub from the menu with the Adult PIN (screens.spec.ts, hub-windows.spec.ts);
    with the Guest PIN the Settings entry is absent and GET /settings, /api/hub/status, POST /api/hub/update, GET
    and PATCH /api/adblock answer 403.
- Landed: merge commit "[Merge] PP7 (" on main (recorded in chain.md, Landings). Changed after the tested tree:
  docs/claude/chain.md and docs/sessions/PP7-status.md only.

## PICK UP HERE

PP7 has landed. Nothing more for this build. Do not start the next build. The hub install on Josh's Windows PC waits
on Josh (docs/install-windows.md; chain.md, Waits on hardware).
