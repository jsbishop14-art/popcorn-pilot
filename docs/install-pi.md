# Installing the Popcorn Pilot hub on the Raspberry Pi

This is done once, by hand, when the Pi arrives. About 30 minutes, most of it waiting.

## What to buy

- Raspberry Pi 5, 8GB
- The official Raspberry Pi 27W USB-C power supply
- A case with a fan (the official Pi 5 case has one)
- A microSD card, 64GB or larger (or an NVMe drive with an M.2 HAT, faster but optional)
- An Ethernet cable if the Pi can sit near the router (more reliable than Wi-Fi)

## 1. Put Raspberry Pi OS on the card

1. On a computer, install **Raspberry Pi Imager** from raspberrypi.com/software.
2. Choose device **Raspberry Pi 5**, operating system **Raspberry Pi OS Lite (64-bit)**, and the microSD card.
3. When it asks to customise settings, choose **Edit settings**:
   - Hostname: `popcorn`
   - Username and password: pick your own and write them down
   - Wi-Fi: only if you are not using Ethernet
   - Services tab: turn on **SSH** with password login
4. Write the card, put it in the Pi, plug in Ethernet (if used) and power. Wait 2 minutes.

## 2. Run the install (one command)

1. On a Mac open Terminal, or on Windows open PowerShell, and type `ssh <your username>@popcorn.local`, then your
   password.
2. Paste this one line and press Enter:

   ```
   sudo apt-get install -y git && git clone https://github.com/jsbishop14-art/popcorn-pilot.git && sudo bash popcorn-pilot/scripts/install-pi.sh
   ```

3. It takes 10 to 20 minutes. It ends with "Open http://popcorn.local ...".

What it sets up: Node 20, the app (starts by itself when the Pi turns on), the database and its nightly backup
(3:00 AM), a secret store for PINs, and the updater (checks for a new version daily at 4:00 AM and when you press
**Check for updates now** in Settings; if a new version fails its checks it goes back to the previous one by itself).

If the repo has been made private by then, the clone needs a read-only deploy key. The chat session will give the
exact steps at that point.

## 3. First run

1. On a phone or computer on the home Wi-Fi, open **http://popcorn.local**.
2. Set the **Adult PIN** (full control) and the **Guest PIN** (kid mode and playlists only). Each is 4 digits and
   they must be different.
3. Sign in with the Adult PIN, then **Profiles** to add a profile for each person.

## 4. Connect the Rokus

On each Roku (Living room and Guest room):

1. **Settings > System > Advanced system settings > Control by mobile apps > Network access**: set it to
   **Default** (or **Permissive**). If it is **Disabled**, Popcorn Pilot cannot control the TV.
2. **Settings > Network > About**: note the IP address.
3. In your router, give each Roku a reserved (fixed) address so it does not change. Look for "DHCP reservation" or
   "Address reservation" in the router app.

Then in Popcorn Pilot: **Settings > Find TVs on the network**, and **Add** each Roku. If one is not found, use **Add
by address** with the IP address from step 2. Tap a TV to set its name, room and default profile.

## 5. Real titles and cover art (TMDB key)

Until this is done, Browse shows a built-in sample catalog with invented titles.

1. On a computer, make a free account at **themoviedb.org**.
2. In your account: **Settings > API**, ask for an API key (personal use). Copy the **API Key** (32 letters and
   numbers).
3. In Popcorn Pilot: **Settings > Titles and cover art**, paste it into **TMDB key**, and press **Save key**. Settings
   then says "Titles, cover art and trailers come from TMDB", and Browse shows real titles on Netflix, Prime Video
   and Hulu. The first Browse after this takes a little longer while the hub saves the titles and cover art.

## 6. Try a playlist on the TVs

1. **Playlists > New playlist**, give it a name, then **Add title**: in Browse, open a title on each of Netflix,
   Prime Video and Hulu and press **Add to playlist**.
2. Open the playlist, pick **Living room**, and press **Start**. The TV should open the first title. **Home** shows
   what is playing; **Remote** and **Queue** are on each TV's card.
3. Press **Skip** to move to the next title, and check each service opens its title. If one does not, the Home
   screen says so and moves on; note which service it was.
4. With both TVs on, press **Send to…** on the Living room card and pick **Guest room**: the Living room pauses and
   the Guest room starts the same title.

Popcorn Pilot counts the time each title plays itself (the streaming apps do not report it), so the move to the next
title can be a minute or two off the real end of an episode.

## Later steps (other builds)

- Router DNS pointing at the Pi, for ad blocking (PP5).
- Roku developer mode and installing the Popcorn Pilot channel on each Roku (PP6).
- iCloud shared album link, entered in Settings (PP5).

## If something goes wrong

- The app does not open: unplug the Pi for 10 seconds and plug it back in. Wait 2 minutes.
- Settings > Hub shows the version, the last backup and the last update result.
- Backups are in `/var/lib/popcorn-pilot/backups` on the Pi (the newest 14 nights are kept).
