' Remote keys in the Popcorn Pilot channel (handoff 5.8 and 9.3; Josh 2026-11-19 21:35: "disable everything besides
' arrows, select and volume on remote").
'
' In kid mode only the arrows and OK do anything in the channel. Volume never reaches a channel: the Roku and the TV
' handle it, so it always works. Every other key the channel is given (Back, Options *, Play, Rewind, Fast forward,
' Instant replay) is taken and ignored, so Back cannot leave the channel either. Home and the Netflix, Hulu and
' Prime shortcut buttons are handled by the Roku itself before any channel sees them; the hub's snap back reverses
' them (handoff 5.7). Out of kid mode every key acts.
'
' Pure functions, no SceneGraph: MainScene's onKeyEvent (the only key handler in the channel) asks ppKeyDecision
' first, and the tests run these with the Rooibos framework and the brs interpreter (roku/tests).

' The keys that act in kid mode, as the Roku names them in onKeyEvent.
function ppKidKeys() as object
    return ["up", "down", "left", "right", "OK"]
end function

' Volume keys: never given to a channel (the Roku handles them); listed so the policy says what it allows in full.
function ppVolumeKeys() as object
    return ["VolumeUp", "VolumeDown", "VolumeMute"]
end function

' What the channel does with a key: "act" (the screen handles it) or "ignore" (taken, nothing happens).
function ppKeyDecision(key as string, kidMode as boolean) as string
    if not kidMode then return "act"
    for each k in ppKidKeys()
        if k = key then return "act"
    end for
    for each k in ppVolumeKeys()
        if k = key then return "act"
    end for
    return "ignore"
end function

' Moving focus on a grid of `count` items, `cols` across, from `index` with an arrow key. Returns the new index, or
' -1 when the key leaves the grid on that side (the screen then moves to the row above or below).
function ppGridMove(index as integer, count as integer, cols as integer, key as string) as integer
    if count <= 0 then return -1
    row = index \ cols
    col = index mod cols
    rows = (count + cols - 1) \ cols
    if key = "left" then
        if col = 0 then return -1
        return index - 1
    else if key = "right" then
        if col = cols - 1 or index = count - 1 then return -1
        return index + 1
    else if key = "up" then
        if row = 0 then return -1
        return index - cols
    else if key = "down" then
        if row = rows - 1 then return -1
        n = index + cols
        if n > count - 1 then n = count - 1
        return n
    end if
    return index
end function

' The PIN pad (mockup TvPin): 1 to 9, then Clear, 0, OK, three across. What pressing OK on a key does to the digits
' typed so far: a digit is added (up to 4), Clear removes them all, OK sends them when there are 4.
' Returns { digits, send }.
function ppPinPress(digits as string, keyIndex as integer) as object
    labels = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "Clear", "0", "OK"]
    if keyIndex < 0 or keyIndex > 11 then return { digits: digits, send: false }
    k = labels[keyIndex]
    if k = "Clear" then return { digits: "", send: false }
    if k = "OK" then return { digits: digits, send: Len(digits) = 4 }
    if Len(digits) >= 4 then return { digits: digits, send: true }
    d = digits + k
    return { digits: d, send: Len(d) = 4 }
end function
