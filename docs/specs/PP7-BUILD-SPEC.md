# PP7 build spec: hub on Windows and Mac

## 0. Josh's words (verbatim)

- 2026-11-20 06:30: "can this be used without the pi? turns out a pi is more expensive than i thought. ... for now id like to control with my computer and phone straight to the roku. is that possible?"
- 2026-11-20 06:42: "i will host this on the windows machine. the mac is for building software. 1. windows is on same network 2. ok on windows 3. write script for windows and mac so it can be changed later if i want. keep the pi scripts as well because i will eventually get one 4. skip for now 5. keep pi version"
- Questions those answer (asked by the chat session at 06:30): 1 is the host on the same network as the Rokus; 2 is it OK to run the hub there; 3 write the host install as a build; 4 ad blocking on that host; 5 keep the Pi version.
- Handoff sections: 1.1, 11.4, 12. Rulings: docs/claude/chain.md.

## 1. What Josh gets

- **Windows (the host for now):** docs/install-windows.md and an install script he runs once in PowerShell (as
  administrator, one pasted line). It installs Node 20 if missing, puts the app in its own folder, builds it, runs the
  migrations and seed, sets up the secret store, and makes the hub start when Windows starts (before anyone signs in)
  and restart if it stops. Nightly backup at 3:00 AM. The updater: daily at 4:00 AM and on Check for updates now in
  Settings; pulls main, installs, migrates, restarts, smoke checks, rolls back by itself on failure (same behavior as
  the Pi updater). A firewall rule opens only the app's port, only on private networks. An uninstall script removes
  everything the install added (the data folder is kept unless he asks to remove it).
- **Mac:** the same, as a shell script and docs/install-mac.md, starting at boot with launchd.
- **Pi:** unchanged. scripts/install-pi.sh and docs/install-pi.md stay.
- **Address:** the guide tells Josh the address to open on his phone (the computer's network address and port), and
  Settings > Hub shows it, with a QR code to open it on a phone. If a stable name like http://popcorn.local can be
  offered on Windows without changing system settings, use it and log the decision; otherwise the address.
- **Settings > Hub** shows which host it runs on (Windows, Mac, Pi). On Windows and Mac, Settings > Ad blocking says
  "Not set up on this computer" instead of an error.
- **The guide says plainly** that when the computer sleeps or is off, kid limits, snap back, schedules and routines pause
  until it is back; it shows where to change sleep settings but the install never changes them.
- **CI:** a Windows job and a macOS job that run the install in a dry-run or test mode, build, migrate, start the app
  and pass the smoke check, plus the existing Linux and arm64 jobs.

## 2. Must stay true

- The install changes nothing on the Windows PC beyond: its app and data folders, Node 20 if missing, the start-on-boot
  service or task, the backup and update schedules, and one firewall rule (private networks only). No power, sleep,
  network, DNS, or other system setting changes. Josh's main work PC: no downtime caused by the install.
- No ad blocking on Windows or Mac in this build.
- The Pi install and updater keep working (their tests and the arm64 CI job stay green).
- Build sessions never touch Josh's real computers, TVs or the Pi.

## 3. Checks

1. CI Windows job: install in test mode, app starts as the service would start it, smoke check passes, uninstall
   leaves nothing behind (list checked).
2. CI macOS job: the same with launchd in test mode.
3. Updater on Windows and Mac: a failed smoke check rolls back to the previous version (temp git test, as in PP1).
4. Settings > Hub shows the host and the address; the QR code encodes that address; ad blocking says not set up on
   Windows and Mac.
5. PowerShell scripts pass PSScriptAnalyzer; shell scripts pass shellcheck; Pi script tests unchanged and passing.
6. Browser tests reach Settings > Hub from the menus with the Adult PIN; absent for the Guest PIN.

## 4. Not in this build

Ad blocking on Windows or Mac. Running anything on Josh's real PC (he runs the install himself).

## 5. Grant

None.
