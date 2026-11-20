' Puts each of the channel's screens up with sample hub data (the shapes the hub API sends, test/unit/channel-api),
' presses remote keys on it, and prints what the screen asked the scene to do. Run by the brs interpreter against
' the compiled channel (build/roku-staging), from test/unit/roku-screens.test.ts:
'   SCENARIO <name> <the screen's last action as JSON>
'   RENDERED <screen> <number of nodes drawn>
sub Main()
    kid = { kidMode: true, profile: { id: 2, name: "Kid one", color: "#7FC8A9", initial: "K" }, time: { leftMin: 35, limitMin: 60, percent: 58, color: "hsl(70, 72%, 45%)", warning: false, timeUp: false, inHours: true, viewingHours: "7:00 AM to 8:00 PM" }, canAskForTime: true, bonus: { usedMin: 15, capMin: 60 }, tasks: [{ id: 1, name: "Pick up toys", minutes: 15, picture: "toys", state: "pending" }, { id: 2, name: "Set the table", minutes: 10, picture: "table", state: invalid }, { id: 3, name: "Brush teeth", minutes: 5, picture: "teeth", state: "approved" }], requests: [{ id: 9, kind: "time", title: "+20 min" }] }
    homeAdult = { kidMode: false, tv: { id: 1, name: "Living room", room: "Living room" }, profile: { id: 1, name: "Family", color: "#FF8A65", initial: "F", type: "adult" }, background: [], routines: [{ id: 3, name: "Movie night", icon: "moon", summary: "" }], playlists: [{ id: 1, name: "Saturday Cartoons", count: "3 titles", meta: "Netflix · Prime Video", covers: ["/api/channel/art/stub-9001.svg"] }], keepWatching: invalid }
    homeKid = { kidMode: true, tv: { id: 1, name: "Living room", room: "Living room" }, profile: { id: 2, name: "Kid one", color: "#7FC8A9", initial: "K", type: "kid" }, background: [], routines: [], playlists: [], keepWatching: { playlistId: 1, name: "Saturday Cartoons" } }
    tiles = []
    for i = 1 to 12
        tiles.push({ key: "tv-90" + StrI(i).Trim(), name: "Show " + StrI(i).Trim(), poster: invalid, service: "netflix", serviceName: "Netflix", rating: "TV-Y" })
    end for
    kidTiles = []
    for i = 0 to 5
        kidTiles.push(tiles[i])
    end for
    np = { nowPlaying: { playlist: "Saturday Cartoons", state: "playing", position: invalid, title: invalid }, upNext: { name: "Puddle Jumpers", service: "Prime Video", poster: invalid, mode: "1 episode", minutes: 11, position: "2 of 3" }, bridge: { startsInSec: 8, warning: { leftMin: 13, lastEpisode: true } } }
    profiles = [{ id: 1, name: "Family", color: "#FF8A65", initial: "F", type: "adult" }, { id: 2, name: "Kid one", color: "#7FC8A9", initial: "K", type: "kid" }]

    base = { hub: "http://192.168.1.50:3000", token: "tok", photos: 0, slide: 0, clock: "7:12 PM", params: {}, home: homeAdult, kid: { kidMode: false }, np: invalid, board: invalid }

    ' Home (mockup Main)
    scenario("home: OK starts the first playlist", "HomeScreen", base, [], ["OK"])
    scenario("home: the last card opens the picker board", "HomeScreen", base, [], ["right", "OK"])
    scenario("home: up to Routines, OK runs it", "HomeScreen", base, [], ["up", "OK"])
    scenario("home: up twice to the profile button", "HomeScreen", base, [], ["up", "up", "OK"])

    kb = with(base, { home: homeKid, kid: kid })
    ' Kid home
    scenario("kid home: Keep watching", "KidHomeScreen", kb, [], ["OK"])
    scenario("kid home: Pick a show", "KidHomeScreen", kb, [], ["right", "OK"])
    scenario("kid home: Earn more time", "KidHomeScreen", kb, [], ["right", "right", "OK"])
    scenario("kid home: Not me", "KidHomeScreen", kb, [], ["down", "OK"])
    scenario("kid home: Back, Options and Play do nothing", "KidHomeScreen", kb, [], ["back", "options", "play"])

    ' Profile picker
    pp = with(base, { params: { profiles: profiles } })
    scenario("profiles: the kid", "ProfilePickerScreen", pp, [], ["right", "OK"])
    scenario("profiles: Guest", "ProfilePickerScreen", pp, [], ["right", "right", "OK"])
    scenario("profiles: Back button", "ProfilePickerScreen", pp, [], ["down", "OK"])
    scenario("profiles (kid mode): Family", "ProfilePickerScreen", with(kb, { params: { profiles: profiles } }), [], ["OK"])

    ' PIN
    scenario("pin: four digits are sent", "PinScreen", with(base, { params: { purpose: "profile", profileId: 1, name: "Family", needPin: "adult" } }), [], ["OK", "left", "OK", "up", "OK", "right", "right", "OK"])
    scenario("pin: Clear then OK sends nothing", "PinScreen", with(base, { params: { purpose: "profile", profileId: 1, name: "Family", needPin: "adult" } }), [], ["OK", "down", "down", "left", "OK", "right", "right", "OK"])
    scenario("pin: approve a request", "PinScreen", with(kb, { params: { purpose: "approve", requestId: 9 } }), [], ["OK", "OK", "OK", "OK"])
    scenario("pin: Back button", "PinScreen", with(kb, { params: { purpose: "profile", profileId: 1, leaving: true, needPin: "adult" } }), [], ["down", "down", "down", "OK"])

    ' Picker board
    scenario("kid board: right, down, OK plays the fifth", "KidPickerScreen", with(kb, { board: { kid: true, tiles: kidTiles } }), [], ["right", "down", "OK"])
    scenario("kid board: Earn more time in the footer", "KidPickerScreen", with(kb, { board: { kid: true, tiles: kidTiles } }), [], ["down", "down", "right", "OK"])
    scenario("kid board: Back in the footer", "KidPickerScreen", with(kb, { board: { kid: true, tiles: kidTiles } }), [], ["down", "down", "OK"])
    scenario("adult board: six across", "KidPickerScreen", with(base, { board: { kid: false, tiles: tiles } }), [], ["right", "right", "right", "right", "right", "right", "down", "OK"])

    ' Earn time
    scenario("earn: a job waiting for a grown-up does nothing", "EarnTimeScreen", kb, [], ["OK"])
    scenario("earn: I did it", "EarnTimeScreen", kb, [], ["right", "OK"])
    scenario("earn: Back", "EarnTimeScreen", kb, [], ["down", "OK"])

    ' Time up, request sent, bridge, warning
    scenario("time up: Earn more time", "TimeUpScreen", kb, [], ["OK"])
    scenario("time up: Ask a grown-up", "TimeUpScreen", kb, [], ["right", "OK"])
    scenario("request sent: Back", "RequestSentScreen", with(kb, { params: { request: { id: 9, kind: "time" }, words: "+20 minutes" } }), [], ["OK"])
    scenario("request sent: Grown-up PIN", "RequestSentScreen", with(kb, { params: { request: { id: 9, kind: "time" }, words: "+20 minutes" } }), [], ["right", "OK"])
    scenario("bridge: Play now", "NowPlayingScreen", with(kb, { np: np }), [], ["OK"])
    scenario("bridge: Skip", "NowPlayingScreen", with(kb, { np: np }), [], ["right", "OK"])
    scenario("warning: keys do nothing", "TimeWarningScreen", with(kb, { np: np }), [], ["OK", "left"])
    scenario("pair: Pair with the kept token", "PairScreen", with(base, { params: { message: "The hub did not answer." } }), [], ["right", "right", "OK"])
    scenario("album: shows", "AlbumScreen", kb, [], [])
    print "DONE"
end sub

function with(a as object, b as object) as object
    out = {}
    for each k in a
        out[k] = a[k]
    end for
    for each k in b
        out[k] = b[k]
    end for
    return out
end function

sub scenario(name as string, screen as string, data as object, unused as object, keys as object)
    s = CreateObject("roSGNode", screen)
    s.action = { kind: "none" }
    s.data = data
    print "RENDERED " + screen + " " + StrI(s.getChildCount()).Trim()
    for each k in keys
        s.callFunc("handleKey", { key: k })
    end for
    print "SCENARIO " + name + " " + FormatJson(s.action)
end sub
