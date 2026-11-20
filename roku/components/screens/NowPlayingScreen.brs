' The Now playing bridge, mockup docs/mockup/NowPlaying.dc.html (1280x720, x1.5): the title up next with its cover,
' where it is in the playlist, a countdown, Play now and Skip (the hub starts it when the countdown ends). For a kid,
' when the time warning is due or this is the last title today, the warning card (mockup TimeWarning) is shown on
' this screen too (handoff 9.5).

sub init()
    m.i = 0
    m.left = -1
    m.tick = m.top.findNode("tick")
    m.tick.observeField("fire", "onTick")
    m.tick.control = "start"
end sub

sub onTick()
    if m.left > 0 then
        m.left = m.left - 1
        render()
    end if
end sub

sub render()
    d = m.top.data
    if d = invalid then return
    np = d.np
    if np <> invalid and np.bridge <> invalid and (m.left < 0 or Abs(np.bridge.startsInSec - m.left) > 2) then m.left = np.bridge.startsInSec
    m.top.removeChildrenIndex(m.top.getChildCount(), 0)
    ' The tick timer is a child: keep it.
    m.top.appendChild(m.tick)
    c = ppColors()
    ppBlobs(m.top)
    up = invalid
    if np <> invalid then up = np.upNext
    if up = invalid then
        ppText(m.top, "Up next", 0, 300, 1280, 80, "fd", 56, c.white, "center")
        return
    end if
    ' Cover (360 x 540) on the left.
    ppBox(m.top, 80, 90 + 18, 360, 540, 30, c.shadow)
    ppBox(m.top, 80, 90, 360, 540, 30, c.blue)
    ppIcon(m.top, "tv", 80 + 180 - 30, 90 + 240, 60, c.ink)
    if up.poster <> invalid then
        agent = ppAgent(d.token)
        ppCover(m.top, d.hub + up.poster, 80, 90, 360, 540, agent)
    end if
    x = 80 + 360 + 70
    y = 132
    place = "Up next"
    if up.position <> invalid then place = "Up next · " + up.position
    ppText(m.top, UCase(place), x, y, 700, 29, "nx", 22, c.yellow)
    y = y + 29 + 22
    t = ppText(m.top, up.name, x, y, 720, 86, "fd", 72, c.white)
    t.wrap = false
    y = y + 72 + 22
    meta = up.service
    if up.mode <> invalid and up.mode <> "" then meta = meta + " · " + up.mode
    ppText(m.top, meta, x, y, 720, 34, "nx", 26, c.soft)
    y = y + 34 + 22 + 10
    secs = m.left
    if secs < 0 then secs = 0
    ppRing(m.top, x, y, 96, c.yellow)
    ppText(m.top, StrI(secs).Trim(), x, y, 96, 96, "fd", 40, c.white, "center")
    unit = " seconds"
    if secs = 1 then unit = " second"
    ppText(m.top, "Starting in " + StrI(secs).Trim() + unit, x + 96 + 22, y, 500, 96, "nx", 24, c.white)
    y = y + 96 + 22 + 10
    w1 = ppKidButton(m.top, x, y, "Play now", { icon: "play", focused: m.i = 0 })
    ppKidButton(m.top, x + w1 + 22, y, "Skip", { icon: "skip", ghost: true, focused: m.i = 1 })
    y = y + 72 + 22
    hint = ""
    if np.nowPlaying <> invalid then hint = np.nowPlaying.playlist
    if d.home <> invalid and d.home.tv <> invalid then hint = hint + " · " + d.home.tv.name
    ppText(m.top, hint, x, y, 700, 24, "nx", 18, c.soft)

    ' For a kid: the time warning on the bridge.
    w = np.bridge
    if w <> invalid and w.warning <> invalid then ppWarningCard(m.top, w.warning.leftMin, w.warning.lastEpisode, d)
end sub

function handleKey(e as object) as boolean
    k = e.key
    if k = "OK" then
        if m.i = 0 then
            m.top.action = { kind: "bridge", action: "play" }
        else
            m.top.action = { kind: "bridge", action: "skip" }
            m.left = -1
        end if
        return true
    end if
    if k = "back" then return false
    if k = "left" then m.i = 0
    if k = "right" then m.i = 1
    render()
    return true
end function
