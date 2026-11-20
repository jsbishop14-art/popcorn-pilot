' The key handling cases (PP6 check 2), one table for both test runs: the Rooibos suite on a Roku
' (KeyPolicy.spec.bs) and the brs interpreter in CI (test/unit/roku-keys.test.ts runs roku/tests/run_keys.brs).
' Each case: the key as the Roku names it in onKeyEvent, kid mode on or off, and what the channel must do.

function ppKeyCases() as object
    return [
        ' Kid mode: only the arrows and OK act (Josh, 21:35: "disable everything besides arrows, select and volume").
        { key: "up", kid: true, want: "act" },
        { key: "down", kid: true, want: "act" },
        { key: "left", kid: true, want: "act" },
        { key: "right", kid: true, want: "act" },
        { key: "OK", kid: true, want: "act" },
        ' Volume is the Roku's own (never given to a channel); the policy allows it.
        { key: "VolumeUp", kid: true, want: "act" },
        { key: "VolumeDown", kid: true, want: "act" },
        { key: "VolumeMute", kid: true, want: "act" },
        ' Everything else the channel can be given is taken and ignored in kid mode. Back cannot leave the channel.
        { key: "back", kid: true, want: "ignore" },
        { key: "options", kid: true, want: "ignore" },
        { key: "play", kid: true, want: "ignore" },
        { key: "rev", kid: true, want: "ignore" },
        { key: "fwd", kid: true, want: "ignore" },
        { key: "replay", kid: true, want: "ignore" },
        { key: "playonly", kid: true, want: "ignore" },
        { key: "ok", kid: true, want: "ignore" },
        { key: "", kid: true, want: "ignore" },
        ' Out of kid mode every key acts (Back goes back, and leaves the channel from the home screen).
        { key: "up", kid: false, want: "act" },
        { key: "OK", kid: false, want: "act" },
        { key: "back", kid: false, want: "act" },
        { key: "options", kid: false, want: "act" },
        { key: "play", kid: false, want: "act" },
        { key: "rev", kid: false, want: "act" },
        { key: "fwd", kid: false, want: "act" },
        { key: "replay", kid: false, want: "act" }
    ]
end function

' Moving focus on a grid: index, count, columns, key, the index wanted (-1: leaves the grid that way).
function ppGridCases() as object
    return [
        { i: 0, n: 6, cols: 3, key: "right", want: 1 },
        { i: 2, n: 6, cols: 3, key: "right", want: -1 },
        { i: 0, n: 6, cols: 3, key: "left", want: -1 },
        { i: 1, n: 6, cols: 3, key: "down", want: 4 },
        { i: 4, n: 6, cols: 3, key: "down", want: -1 },
        { i: 4, n: 6, cols: 3, key: "up", want: 1 },
        { i: 1, n: 6, cols: 3, key: "up", want: -1 },
        { i: 2, n: 5, cols: 3, key: "down", want: 4 },
        { i: 4, n: 5, cols: 3, key: "right", want: -1 },
        { i: 0, n: 0, cols: 3, key: "right", want: -1 }
    ]
end function

' The PIN pad: digits so far, the key pressed (0 to 11: 1 to 9, Clear, 0, OK), the digits after and whether they
' are sent.
function ppPinCases() as object
    return [
        { d: "", k: 0, want: "1", send: false },
        { d: "12", k: 10, want: "120", send: false },
        { d: "123", k: 3, want: "1234", send: true },
        { d: "123", k: 9, want: "", send: false },
        { d: "12", k: 11, want: "12", send: false },
        { d: "1234", k: 11, want: "1234", send: true },
        { d: "1234", k: 4, want: "1234", send: true }
    ]
end function

' Which screen comes up: the state, and the screen wanted.
function ppRouteCases() as object
    return [
        { s: { paired: false, content: "", kidMode: false }, want: "Pair" },
        { s: { paired: true, content: "", kidMode: false }, want: "Home" },
        { s: { paired: true, content: "", kidMode: true, timeUp: false }, want: "KidHome" },
        { s: { paired: true, content: "", kidMode: true, timeUp: true }, want: "TimeUp" },
        { s: { paired: true, content: "bridge", bridgeUp: true, kidMode: true }, want: "NowPlaying" },
        { s: { paired: true, content: "bridge", bridgeUp: false, kidMode: true, timeUp: false }, want: "KidHome" },
        { s: { paired: true, content: "time-warning", kidMode: true }, want: "TimeWarning" },
        { s: { paired: true, content: "time-warning", kidMode: false }, want: "Home" },
        { s: { paired: true, content: "family-album", kidMode: true }, want: "Album" }
    ]
end function

' Screens allowed in kid mode and out of it.
function ppScreenCases() as object
    return [
        { screen: "Home", kid: true, want: false },
        { screen: "KidHome", kid: true, want: true },
        { screen: "KidPicker", kid: true, want: true },
        { screen: "EarnTime", kid: true, want: true },
        { screen: "ProfilePicker", kid: true, want: true },
        { screen: "Pin", kid: true, want: true },
        { screen: "Pair", kid: true, want: false },
        { screen: "Home", kid: false, want: true },
        { screen: "KidHome", kid: false, want: false },
        { screen: "EarnTime", kid: false, want: false },
        { screen: "RequestSent", kid: false, want: false },
        { screen: "KidPicker", kid: false, want: true }
    ]
end function
