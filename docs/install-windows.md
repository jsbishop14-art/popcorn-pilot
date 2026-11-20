# Installing the Popcorn Pilot hub on the Windows PC

The hub is the part of Popcorn Pilot that runs all the time: the app you open on your phone, the database, the
schedules, kid limits and snap back. For now it runs on your Windows PC. Later it can move to a Raspberry Pi
(docs/install-pi.md); the Pi version stays.

This is done once, by hand. About 20 minutes, most of it waiting. The PC needs internet during the install.

## What the install changes on the PC, and nothing else

- One folder, **C:\ProgramData\PopcornPilot**, with the app, its own copy of Node 20 (and of Git if Git is not
  installed), the database, backups and logs. Only administrators and the hub can open it.
- One scheduled task, **Popcorn Pilot**, that starts the hub when Windows starts (before anyone signs in) and starts
  it again within 5 minutes if it stops. It runs as Windows' built-in "Local Service" account, which has few rights.
- One firewall rule, **Popcorn Pilot**: port 8765, incoming, **private networks only**.
- Inside the hub: a nightly backup at 3:00 AM and an update check at 4:00 AM.

It does **not** change power or sleep settings, network settings, DNS, or anything else. There is no restart of the
PC and no downtime for your other work. Ad blocking is not set up on Windows (Settings > Ad blocking says "Not set
up on this computer"); it comes with the Raspberry Pi.

## 1. Open PowerShell as administrator

Click **Start**, type **PowerShell**, right-click **Windows PowerShell**, choose **Run as administrator**, and
answer **Yes**.

## 2. Run the install (one line)

Paste this line and press Enter:

```
& ([scriptblock]::Create((Invoke-RestMethod https://raw.githubusercontent.com/jsbishop14-art/popcorn-pilot/main/scripts/install-windows.ps1)))
```

It takes 10 to 20 minutes. It ends with **Open http://192.168.x.x:8765 ...**: write that address down. It is the
PC's address on the home network.

If something fails, the last lines say what. Running the same line again is safe: it keeps what is already there.

If the repo has been made private by then, the line above cannot download the script. The chat session will give
the steps at that point.

## 3. Check the network is "Private"

Phones can reach the hub only when Windows treats the home network as private. If the install ended with "This PC's
network ... is set to Public":

1. **Start > Settings > Network & internet**.
2. Click **Wi-Fi** (or **Ethernet**), then the home network's name (or **Properties**).
3. Under **Network profile type**, choose **Private network**.

## 4. First run

1. On a phone or computer on the home Wi-Fi, open the address from step 2 (like **http://192.168.1.23:8765**).
2. Set the **Adult PIN** (full control) and the **Guest PIN** (kid mode and playlists only). Each is 4 digits and
   they must be different.
3. Sign in with the Adult PIN. **Settings > Hub** says **Windows PC**, shows the address, and has a QR code: point
   another phone's camera at it to open the app there. Add the page to the phone's home screen for one tap.

The address can change if the router gives the PC a new one. To keep it the same, give the PC a reserved (fixed)
address in the router ("DHCP reservation" or "Address reservation" in the router app), the same as for the Rokus.

## 5. Sleep: what happens when the PC sleeps or is off

**While the PC sleeps or is off, kid limits, snap back, schedules and routines pause until it is back.** The app on
the phone does not open either. The TVs keep working as normal Rokus.

The install never changes sleep settings. If you want the hub always on, change it yourself:
**Start > Settings > System > Power & battery** (on Windows 10: **Power & sleep**) **> Screen and sleep**, and set
**When plugged in, put my device to sleep after** to **Never**. The screen can still turn off.

The nightly backup and the update check run when the PC is back if it was asleep at 3:00 or 4:00 AM.

## 6. Connect the Rokus

Same as the Pi guide (docs/install-pi.md step 4): on each Roku set **Control by mobile apps > Network access** to
**Default**, note its address, and give it a reserved address in the router. Then in Popcorn Pilot: **Settings >
Find TVs on the network**, and **Add** each Roku.

If **Find TVs** finds nothing on Windows, use **Add by address** with the address from the Roku's **Settings >
Network > About**. (Windows' firewall can hold back the Rokus' replies to the search; the install opens only the
app's port, so adding by address is the fallback.)

## 7. Everything else in the app

These work the same as on the Pi; follow the Pi guide's steps:

- Real titles and cover art (TMDB key): docs/install-pi.md step 5.
- Playlists on the TVs: step 6.
- Kid mode: step 7.
- Family Album: step 9.
- Routines: step 10.

Step 8 (ad blocking and the router DNS) does not apply on Windows. Do not point the router's DNS at the PC.

## 8. The Popcorn Pilot channel on each Roku

1. Turn on **developer mode** on the Roku and choose a developer password, as in docs/install-pi.md step 11.1.
2. Build the channel file. In PowerShell as administrator, paste:

   ```
   cd C:\ProgramData\PopcornPilot\app; ..\node\node.exe scripts\roku-build.mjs; Copy-Item build\popcorn-pilot-channel.zip "$HOME\Downloads\"
   ```

   It ends with the channel file in your **Downloads** folder (popcorn-pilot-channel.zip).
3. In a browser on the PC, open the Roku's address (like **http://192.168.1.40**). Sign in as **rokudev** with the
   developer password. Click **Upload**, pick **popcorn-pilot-channel.zip** from Downloads, then **Install**
   (on some Rokus **Install with zip**). The TV shows the channel's "Pair this TV" screen.
4. In Popcorn Pilot on your phone: **Settings**, pick the TV, **Pair the channel**.
5. Do the same for the other Roku. What to check on each TV: docs/install-pi.md step 11.

After a later update changes the channel, do steps 2 and 3 again.

## 9. Updates and backups

- The hub checks for a new version every day at 4:00 AM, and when you press **Settings > Check for updates now**.
  It installs it, checks it, and if the new version fails its checks it goes back to the previous one by itself.
  **Settings > Hub** shows the last update and the last backup.
- Backups: **C:\ProgramData\PopcornPilot\data\backups** (the newest 14 nights, plus a copy before each update).
- Logs, if something looks wrong: **C:\ProgramData\PopcornPilot\logs** (app.log, service.log, update.log).

## 10. Removing the hub

In PowerShell as administrator:

```
powershell -ExecutionPolicy Bypass -File C:\ProgramData\PopcornPilot\app\scripts\uninstall-windows.ps1
```

It removes the scheduled task, the firewall rule and the app, and keeps the data (database, backups and the secret
store key) in **C:\ProgramData\PopcornPilot\data**. To delete the data too (this cannot be undone), add
` -RemoveData` at the end of the line.
