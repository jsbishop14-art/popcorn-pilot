' Kid home, mockup docs/mockup/KidHome.dc.html (1280x720, x1.5). Row 0: Keep watching, Pick a show, Earn more time.
' Row 1: Not me (the profile picker; leaving kid mode needs the Adult PIN).

sub init()
    m.row = 0
    m.col = 0
end sub

function keep() as dynamic
    d = m.top.data
    if d = invalid or d.home = invalid then return invalid
    return d.home.keepWatching
end function

sub render()
    d = m.top.data
    if d = invalid then return
    m.top.removeChildrenIndex(m.top.getChildCount(), 0)
    c = ppColors()
    if d.photos = 0 then
        ppRect(m.top, 0, 0, 1280, 720, "#4A6B8F")
        ppBox(m.top, 640 - 120, 150, 240, 92, 20, c.white, 0.12)
        ppIcon(m.top, "photo", 640 - 18, 162, 36, c.white)
        ppText(m.top, "Family photo slideshow", 520, 204, 240, 26, "nx", 16, c.white, "center")
    end if
    fade = m.top.createChild("Poster")
    fade.uri = "pkg:/images/fade.png"
    fade.translation = [0, ppS(720 - 430)]
    fade.width = ppS(1280)
    fade.height = ppS(430)
    fade.blendColor = ppC(c.navy2)

    ' Header: the kid's badge and "Hi <name>!"; the time left pill.
    k = d.kid
    name = "there"
    initial = "K"
    color = c.mint
    if k <> invalid and k.profile <> invalid then
        name = k.profile.name
        initial = k.profile.initial
        color = k.profile.color
    end if
    ppAvatar(m.top, 56 + 4, 30 + 4, 68, color, initial, 4)
    ppText(m.top, "Hi " + name + "!", 56 + 76 + 18, 30, 700, 76, "fd", 44, c.white)
    if k <> invalid and k.time <> invalid then ppTimePill(m.top, 1280 - 56, 32, k.time.leftMin, k.time.percent, k.time.color)

    ' The three big buttons.
    w = (1168 - 2 * 28) / 3
    top = 720 - 90 - 190
    kw = keep()
    sub1 = "Pick a show first"
    if kw <> invalid then sub1 = kw.name
    big = [
        { label: "Keep watching", sub: sub1, bg: c.yellow, icon: "play" },
        { label: "Pick a show", sub: "", bg: c.blue, icon: "tv" },
        { label: "Earn more time", sub: "", bg: c.white, icon: "star" }
    ]
    for i = 0 to 2
        x = 56 + i * (w + 28)
        b = big[i]
        g = m.top.createChild("Group")
        g.translation = [ppS(x), ppS(top)]
        focused = (m.row = 0 and m.col = i)
        if focused then
            g.scaleRotateCenter = [ppS(w / 2), ppS(95)]
            g.scale = [1.05, 1.05]
            ppBox(g, -12, -12, w + 24, 214, 46, c.yellow, 0.35)
            ppBox(g, 0, 10, w, 190, 34, c.shadow)
            ppBox(g, 0, 0, w, 190, 34, c.yellow)
            ppBox(g, 6, 6, w - 12, 178, 28, b.bg)
        else
            ppBox(g, 0, 8, w, 190, 34, c.shadow)
            ppBox(g, 0, 0, w, 190, 34, b.bg)
        end if
        ppIcon(g, b.icon, w / 2 - 24, 34, 48, c.ink)
        if b.sub <> "" then
            ppText(g, b.label, 10, 92, w - 20, 40, "fd", 28, c.ink, "center")
            ppText(g, b.sub, 10, 132, w - 20, 26, "nx", 18, c.ink, "center")
        else
            ppText(g, b.label, 10, 104, w - 20, 40, "fd", 28, c.ink, "center")
        end if
    end for

    ' Footer: Not me (switch profile) and the arrows hint.
    ppKidButton(m.top, 56, 720 - 22 - 52, "Not me", { ghost: true, h: 52, size: 20, padX: 22, icon: "person", focused: m.row = 1 })
    ppArrowsHint(m.top, 1280 - 56, 720 - 22 - 52)
end sub

function handleKey(e as object) as boolean
    k = e.key
    if k = "OK" then
        if m.row = 1 then
            m.top.action = { kind: "go", screen: "ProfilePicker" }
        else if m.col = 0 then
            kw = keep()
            if kw <> invalid then
                m.top.action = { kind: "startPlaylist", id: kw.playlistId }
            else
                m.top.action = { kind: "go", screen: "KidPicker" }
            end if
        else if m.col = 1 then
            m.top.action = { kind: "go", screen: "KidPicker" }
        else
            m.top.action = { kind: "go", screen: "EarnTime" }
        end if
        return true
    end if
    if k = "left" and m.row = 0 and m.col > 0 then
        m.col = m.col - 1
    else if k = "right" and m.row = 0 and m.col < 2 then
        m.col = m.col + 1
    else if k = "down" then
        m.row = 1
    else if k = "up" then
        m.row = 0
    else
        return true
    end if
    render()
    return true
end function
