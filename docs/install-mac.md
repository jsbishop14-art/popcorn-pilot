# Installing the Popcorn Pilot hub on a Mac

The hub runs on the Windows PC for now (docs/install-windows.md). This guide is for moving it to a Mac later if you
choose to; the Mac is for building software today, so nothing here needs doing now. The Raspberry Pi version stays
too (docs/install-pi.md).

Done once, by hand. About 20 minutes, most of it waiting. The Mac needs internet during the install.

## What the install changes on the Mac, and nothing else

- One folder, **/Library/PopcornPilot**, with the app, its own copy of Node 20, the database, backups and logs. It
  belongs to your Mac account and is closed to other accounts.
- One background service (launchd daemon **com.popcornpilot.hub**) that starts the hub when the Mac starts, before
  anyone logs in, and starts it again if it stops. It runs as your account.
- Only if the macOS firewall is on: the hub's own Node copy is allowed to accept connections.
- Inside the hub: a nightly backup at 3:00 AM and an update check at 4:00 AM.

It does **not** change energy or sleep settings, network settings, DNS, or anything else. Ad blocking is not set up
on a Mac (Settings > Ad blocking says "Not set up on this computer"); it comes with the Raspberry Pi.

Only one hub at a time: if the Windows PC hub is running, remove it first (docs/install-windows.md step 10), or the
TVs get two hubs.

## 1. Run the install (one line)

1. Open **Terminal** (Applications > Utilities > Terminal).
2. If Git is not there yet, run `xcode-select --install` and follow the prompts first (the install stops and says
   so if it is missing).
3. Paste this line, press Enter, and type your Mac password when asked:

   ```
   cd /tmp && git clone https://github.com/jsbishop14-art/popcorn-pilot.git pp-install && sudo bash pp-install/scripts/install-mac.sh && rm -rf pp-install
   ```

It takes 10 to 20 minutes and ends with **Open http://192.168.x.x:8765 ...**: write that address down.

## 2. First run

1. On a phone or computer on the home Wi-Fi, open the address from step 1.
2. Set the **Adult PIN** and the **Guest PIN** (4 digits each, different).
3. **Settings > Hub** says **Mac**, shows the address, and has a QR code to open it on a phone.

Give the Mac a reserved (fixed) address in the router so the address stays the same.

## 3. Connect the Rokus and everything else

The same as the Pi guide: docs/install-pi.md steps 4 (Rokus), 5 (TMDB key), 6 (playlists), 7 (kid mode),
9 (Family Album) and 10 (routines). Step 8 (ad blocking and the router DNS) does not apply on a Mac.

## 4. Sleep: what happens when the Mac sleeps or is off

**While the Mac sleeps or is off, kid limits, snap back, schedules and routines pause until it is back.** The
install never changes sleep settings. To keep the hub on, change it yourself: **System Settings > Energy** (on a
laptop: **Battery > Options**), and turn on **Prevent automatic sleeping when the display is off** (laptops: while on
the power adapter). The backup and update check run when the Mac is back if it was asleep at 3:00 or 4:00 AM.

## 5. The Popcorn Pilot channel on each Roku

1. Turn on developer mode on the Roku, as in docs/install-pi.md step 11.1.
2. In Terminal, paste this line with the Roku's address and the developer password:

   ```
   cd /Library/PopcornPilot/app && ROKU_DEV_PASSWORD='the password' PATH="/Library/PopcornPilot/node/bin:$PATH" bash scripts/roku-sideload.sh 192.168.1.40
   ```

3. In Popcorn Pilot: **Settings**, the TV, **Pair the channel**. What to check: docs/install-pi.md step 11.

## 6. Updates, backups and logs

Updates: daily at 4:00 AM and **Settings > Check for updates now**; a failed update goes back by itself.
Backups: /Library/PopcornPilot/data/backups. Logs: /Library/PopcornPilot/logs.

## 7. Removing the hub

```
sudo bash /Library/PopcornPilot/app/scripts/uninstall-mac.sh
```

It removes the background service, the firewall entry and the app, and keeps the data in
/Library/PopcornPilot/data. To delete the data too (this cannot be undone), add ` --remove-data` at the end.
