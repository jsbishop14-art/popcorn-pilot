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
(3:00 AM), a secret store for PINs, ad blocking (AdGuard Home, step 8), and the updater (checks for a new version daily at 4:00 AM and when you press
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

## 7. Try kid mode on a TV

1. **Profiles**, open a kid profile, and set its safeguards (allowed ratings, minutes per day, viewing hours,
   warning, wind-down, snap back). Press **Save**.
2. On **Home**, set **Profile on this TV** for the Living room to that kid. The card says **Kid mode** and shows the
   kid's time left today.
3. Start a playlist for the kid. While it plays, press the **Hulu** button on the Roku remote: within a few seconds
   the TV goes back to the playlist's title, and **Profiles > Alerts** shows "Left the playlist". Press **Home** on
   the remote: the same, as "Pressed Home".
4. Near the end of the kid's time: **Alerts** shows the warning; at the end of the episode the TV turns off.
5. **Profiles > Earn time tasks**: add a task, then **Mark done** for the kid; the minutes are added to today.
6. To take the TV out of kid mode, set **Profile on this TV** to **No profile** with the Adult PIN.

Until the Popcorn Pilot channel is installed (a later build), snap back with nothing playing cannot open the kid home
screen; it says so in Settings > Activity history.

## 8. Ad blocking: point the router's DNS at the Pi

The install set up AdGuard Home (free) on the Pi. It blocks Roku home screen ads and tracking for every device that
asks the Pi for addresses (DNS). It does nothing until the router tells devices to use the Pi.

1. In the router app, give the Pi a reserved (fixed) address, the same way as the Rokus in step 4. Note it (for
   example 192.168.1.20).
2. Find the router's **LAN** or **DHCP** DNS setting (often "DNS server" under LAN, DHCP or Network settings; not the
   WAN or Internet DNS). Set the first DNS server to the Pi's address. Leave the second one empty if the router
   allows it (a second server lets devices skip the Pi).
3. Restart each Roku (**Settings > System > Power > System restart**) so it picks up the new DNS.
4. In Popcorn Pilot: **Settings > Ad blocking** says **On** and, after a few minutes of TV, a count of requests
   blocked today. The switch there turns blocking off and on (for example if an app stops working; turn it back on
   after).

**If the count stays at 0 while the TVs are on:** some Rokus ignore the router and ask Google's DNS (8.8.8.8 and
8.8.4.4) directly. Add a router rule so those requests go to the Pi instead:

- Routers with port forwarding for outgoing traffic (often called **DNS redirect**, **DNS hijack**, **NAT rule** or
  **Intercept DNS**): redirect outgoing port 53 (UDP and TCP) to 8.8.8.8 and 8.8.4.4 to the Pi's address, port 53.
  Make an exception for the Pi itself.
- Routers without that: add a **firewall rule** (or **parental control / block list**) that blocks the devices on the
  home network from reaching 8.8.8.8 and 8.8.4.4. The Roku then falls back to the router's DNS, which is the Pi.

Restart the Rokus again after adding the rule. Netflix, Prime Video and Hulu keep working: their own ads are not
blocked (the plans are ad free); only the Roku home screen ads and tracking are.

If the Pi is off, devices that use it cannot look up addresses. Keep the Pi on, or set the router's DNS back.

## 9. Family Album: the photos on the TV home screen

1. On an iPhone or Mac, in **Photos**, make a **Shared Album** (for example "Family TV") and add photos and short
   clips. Anyone in the family can add to it; Popcorn Pilot picks up what is added.
2. Open the album, tap **People** (on a Mac: the people button), and turn on **Public Website**. Copy the link it
   shows (it starts with `https://www.icloud.com/sharedalbum/`). Anyone with this link can see the album; Popcorn
   Pilot keeps it in its secret store.
3. In Popcorn Pilot: **Settings > Family Album**, paste the link, and press **Save link**. The hub copies the photos
   and clips; Settings then shows how many and when it last synced. It syncs again every 6 hours, and **Sync now**
   syncs at once.
4. The photos become the scrolling background of the TV home screen (once the Popcorn Pilot channel is installed,
   step 11), and **Family Album** can be added to a playlist (**Playlists >** a playlist **> Edit > Family
   Album**).

If the link stops working (Public Website turned off, the album deleted), Settings says the last sync failed and why;
the photos already copied stay on the TV.

## 10. Routines

**Playlists > Routines > New routine**: one button that sets a TV up. Pick the TV, then the steps in order: **Turn
on**, **Profile**, **Volume** (0 to 100), **Playlist**, **Timer** (turns the TV off after that many minutes). **Test
now** tries the steps as they are (without the timer); **Save**, then **Run** from the list or from **Start routine**
on a TV card on Home. **Run on a schedule** runs it by itself on the days and at the time you pick.

Roku has no "set the volume to 18" command: the hub presses Volume down until the volume is at 0, then Volume up 18
times. Check on each TV that the level it ends at is right (some TVs step by 2).

## 11. The Popcorn Pilot channel on each Roku

The channel is the TV side: the Popcorn Pilot home screen, the kid screens, the profile picker with the PIN, and
Now playing between titles. It is installed on each Roku once, in developer mode (free; no Roku account change).

1. **Turn on developer mode** on the Roku. With the Roku remote, press, in order: **Home** three times, **Up** two
   times, then **Right, Left, Right, Left, Right**. A Developer settings screen opens. Write down the address it
   shows (like `http://192.168.1.40`), choose **Enable installer and restart**, accept the agreement, and choose a
   **developer password** (write it down). The Roku restarts.
2. **Install the channel from the Pi.** On a computer, `ssh <your username>@popcorn.local` (as in step 2), then
   paste this line with the Roku's address and the developer password from step 1:

   ```
   cd /opt/popcorn-pilot && sudo -u popcorn env ROKU_DEV_PASSWORD='the password' bash scripts/roku-sideload.sh 192.168.1.40
   ```

   It builds the channel the first time (about a minute) and ends with "Installed the Popcorn Pilot channel on the
   Roku at ...". The TV shows the channel's "Pair this TV" screen.
3. **Pair it.** In Popcorn Pilot on your phone: **Settings**, pick the TV, **Pair the channel**. The TV switches to
   the Popcorn Pilot home screen (room name, clock, routines, playlists, the album photos behind).
4. Do the same for the other Roku.

What to check on each TV:

- **Turn the TV off and on** with the Roku remote: it comes back on the Popcorn Pilot home screen, on the TV's
  default profile (a kid's default profile puts it in kid mode).
- **Profile button** (top right): pick a kid (no PIN), then pick Family: it asks for the Adult PIN, typed with the
  arrows and OK on the on screen pad.
- **Kid mode**: only the arrows and OK do anything in the channel; Back, Options and the play keys do nothing;
  volume works. Home, Netflix, Hulu and Prime are brought back by snap back (step 7).
- **Pick a show** shows 6 titles for a kid (only ones the kid may watch); OK starts one.
- **Earn more time**: "I did it!" on a task asks you; approve it on your phone, or with **Grown-up PIN** on the TV.
- **Between titles** of a playlist the TV shows **Up next** with a countdown; **Play now** and **Skip** work.
- **Time warning** for a kid: on the Up next screen before the last episode; if it is due in the middle of an
  episode, the warning shows for a few seconds and the show comes back (check whether Netflix, Hulu and Prime
  resume or restart the episode).

If pairing from the phone cannot reach the TV, the channel's "Pair this TV" screen also takes the hub address
(`http://<the Pi's address>`) and a token typed by hand: **Settings**, the TV, **Make channel token**.
To update the channel after a later build, run the line in step 2 again.

## If something goes wrong

- The app does not open: unplug the Pi for 10 seconds and plug it back in. Wait 2 minutes.
- Settings > Hub shows the version, the last backup and the last update result.
- Backups are in `/var/lib/popcorn-pilot/backups` on the Pi (the newest 14 nights are kept).
