# PP8 build spec: desktop icon and easy address

## 0. Josh's words (verbatim)

- 2026-11-20 11:29: "the desktop version should have an icon on my homescreen and have an easy way to access the ip"
- Context: the hub runs on Josh's Windows PC (PP7). "Homescreen" there is the Windows desktop; "the ip" is the
  address phones use to open the app (http://<PC address>:8765).
- Handoff sections: 1.2, 10, 11.4. Rulings: docs/claude/chain.md.

## 1. What Josh gets

- **Popcorn Pilot icon on the Windows desktop and in the Start menu**, using the Popcorn Pilot logo (the popcorn
  bucket with wings from the mockup, yellow tile). Double-click opens the app on this PC at http://localhost:8765, so
  it keeps working if the PC's network address changes. It opens in its own window without browser bars when
  Microsoft Edge is present (Edge app mode), otherwise in the default browser.
- **The Windows install adds the shortcuts.** For a PC that already ran the install: one PowerShell line in
  docs/install-windows.md adds them (and running the install line again also adds them). The uninstall removes them.
- **Mac install:** the same, an app shortcut in Applications and on the Dock is not required; a desktop alias is
  enough. Pi: nothing on a desktop.
- **Installable app.** A web app manifest and icons (192, 512, maskable, Apple touch icon, favicon) so "Add to Home
  Screen" on iPhone and Android, and "Install app" in Edge and Chrome, show the Popcorn Pilot icon and name and open
  without browser bars.
- **Easy address:**
  - The PIN entry screen shows a small "Open on your phone" link that shows the phone address and a QR code, without
    signing in (home network only; it reveals only the address).
  - Home (dashboard) for the Adult PIN has a "Phone address" card with the address, a Copy button and the QR code.
  - Settings > Hub keeps its address and QR code.
  - The address shown is the PC's current network address, re-read when it changes, never localhost.
- docs/install-windows.md, docs/install-mac.md and the README updated with the icon and the address.

## 2. Must stay true

- The install still changes nothing on the PC beyond PP7's list plus the two shortcuts (Public desktop and Start
  menu). No power, sleep, network or other system settings.
- No outside calls; the logo is drawn locally (SVG to PNG at build or in the repo).
- Guest PIN sees the address card only if it already sees Home; nothing else changes in permissions.

## 3. Checks

1. CI Windows job: the install in test mode creates both shortcuts with the icon, pointing at http://localhost:8765;
   the add-shortcuts line is idempotent; the uninstall removes them.
2. The manifest is valid (name, short_name, icons, start_url, display standalone, theme colors from the approved
   look); every icon file exists at its size.
3. Browser tests: the PIN screen "Open on your phone" shows the address and QR without signing in; the Home card shows
   address, Copy and QR for the Adult PIN; reached by clicking, at phone and desktop width.
4. The address shown is never localhost or 127.0.0.1 (unit test with a fake network list including loopback).
5. Pi and Mac install tests unchanged and passing.

## 4. Not in this build

Making the hub address fixed in the router (Josh does that), ad blocking on Windows.

## 5. Grant

None.
