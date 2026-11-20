' TV home screen, mockup docs/mockup/Main.dc.html (1280x720, x1.5). Rows: the profile button (header), Routines,
' Playlists. The last Playlists card opens the picker board ("Pick a show", PP6 D-11).

sub init()
    m.row = 2
    m.col = { r0: 0, r1: 0, r2: 0 }
    m.first = 0
end sub

function routines() as object
    d = m.top.data
    if d = invalid or d.home = invalid or d.home.routines = invalid then return []
    return d.home.routines
end function

' The playlist cards, then "Pick a show".
function cards() as object
    d = m.top.data
    out = []
    if d <> invalid and d.home <> invalid and d.home.playlists <> invalid then
        for each p in d.home.playlists
            out.push(p)
        end for
    end if
    out.push({ id: -1, name: "Pick a show", count: "Shows and movies", meta: "Netflix · Prime Video · Hulu", covers: [] })
    return out
end function

sub render()
    d = m.top.data
    if d = invalid then return
    m.top.removeChildrenIndex(m.top.getChildCount(), 0)
    c = ppColors()
    accent = c.yellow
    if d.photos = 0 then
        ' No album photos yet: the mockup's placeholder, which says where they come from.
        ppRect(m.top, 0, 0, 1280, 720, "#3A4A6B")
        ppBox(m.top, 640 - 190, 110, 380, 98, 20, c.white, 0.12)
        ppText(m.top, "Family photo", 450, 124, 380, 26, "nx", 18, c.white, "center")
        ppText(m.top, "Slideshow from your iCloud shared album", 450, 154, 380, 22, "nb", 14, c.softer, "center")
    end if
    fade = m.top.createChild("Poster")
    fade.uri = "pkg:/images/fade.png"
    fade.translation = [0, ppS(720 - 490)]
    fade.width = ppS(1280)
    fade.height = ppS(490)
    fade.blendColor = ppC(c.navy)

    ' Header: logo, name and room; clock and the profile button.
    ppBox(m.top, 56, 32, 52, 52, 16, accent)
    ppIcon(m.top, "popcorn", 56 + 10, 32 + 10, 32, c.navy)
    ppText(m.top, "Popcorn Pilot", 122, 34, 400, 30, "fd", 28, c.white)
    room = ""
    if d.home <> invalid and d.home.tv <> invalid then room = d.home.tv.room
    if room = "" and d.home <> invalid and d.home.tv <> invalid then room = d.home.tv.name
    ppText(m.top, room, 122, 66, 400, 20, "nx", 15, c.soft)
    pname = "Guest"
    pinit = "G"
    pcolor = c.gray
    if d.home <> invalid and d.home.profile <> invalid then
        pname = d.home.profile.name
        pinit = d.home.profile.initial
        pcolor = d.home.profile.color
    end if
    bw = 8 + 38 + 10 + ppTextWidth(pname, "nx", 18) + 20
    bx = 1280 - 56 - bw
    if m.row = 0 then
        ppBox(m.top, bx - 4, 32 - 4, bw + 8, 60, 30, accent)
    else
        ppBox(m.top, bx - 2, 32 - 2, bw + 4, 56, 28, c.white, 0.35)
    end if
    ppBox(m.top, bx, 32, bw, 52, 26, c.navy, 0.9)
    ppCircle(m.top, bx + 8, 32 + 7, 38, pcolor)
    ppText(m.top, pinit, bx + 8, 32 + 7, 38, 38, "fd", 18, c.navy, "center")
    ppText(m.top, pname, bx + 8 + 38 + 10, 32, bw, 52, "nx", 18, c.white)
    clock = d.clock
    cw = ppTextWidth(clock, "fds", 30)
    ppText(m.top, clock, bx - 20 - cw - 4, 32, cw + 8, 52, "fds", 30, c.white)

    ' Routines (above Playlists; main ends 76 above the bottom).
    rs = routines()
    pTop = 720 - 76 - 234
    rTop = pTop - 24 - 95
    if rs.count() > 0 then
        ppText(m.top, "Routines", 56, rTop, 400, 27, "fds", 22, c.softer)
        x = 56
        for i = 0 to rs.count() - 1
            r = rs[i]
            w = 24 + 22 + 10 + ppTextWidth(r.name, "nx", 19) + 24
            focused = (m.row = 1 and m.col.r1 = i)
            if focused then
                ppBox(m.top, x - 3, rTop + 39 - 3, w + 6, 62, 31, accent)
                ppBox(m.top, x, rTop + 39, w, 56, 28, c.navy)
                ppBox(m.top, x, rTop + 39, w, 56, 28, c.white, 0.2)
            else
                ppBox(m.top, x - 2, rTop + 39 - 2, w + 4, 60, 30, c.white, 0.3)
                ppBox(m.top, x, rTop + 39, w, 56, 28, c.navy)
                ppBox(m.top, x, rTop + 39, w, 56, 28, c.white, 0.1)
            end if
            ppIcon(m.top, r.icon, x + 24, rTop + 39 + 17, 22, c.white)
            ppText(m.top, r.name, x + 24 + 22 + 10, rTop + 39, w, 56, "nx", 19, c.white)
            x = x + w + 14
        end for
    end if

    ' Playlists: four cards across; more scroll.
    ppText(m.top, "Playlists", 56, pTop, 400, 27, "fds", 22, c.softer)
    list = cards()
    if m.col.r2 < m.first then m.first = m.col.r2
    if m.col.r2 > m.first + 3 then m.first = m.col.r2 - 3
    colors = [c.yellow, c.coral, c.mint, c.blue]
    agent = ppAgent(d.token)
    cw4 = (1168 - 60) / 4
    for k = 0 to 3
        i = m.first + k
        if i >= list.count() then exit for
        drawCard(list[i], 56 + k * (cw4 + 20), pTop + 39, cw4, colors[i mod 4], m.row = 2 and m.col.r2 = i, agent, d.hub)
    end for

    ' Footer: the photo dots and the hint.
    n = d.photos
    if n > 4 then n = 4
    x = 56
    for i = 0 to n - 1
        if i = d.slide mod 4 then
            ppBox(m.top, x, 720 - 26 - 8, 22, 8, 4, c.white)
            x = x + 30
        else
            ppBox(m.top, x, 720 - 26 - 8, 8, 8, 4, c.white, 0.45)
            x = x + 16
        end if
    end for
    ppText(m.top, "Arrows to move · OK to start", 640, 720 - 26 - 22, 584, 22, "nb", 16, c.soft, "right")
end sub

sub drawCard(p as object, x as float, y as float, w as float, color as string, focused as boolean, agent as object, hub as string)
    c = ppColors()
    g = m.top.createChild("Group")
    g.translation = [ppS(x), ppS(y)]
    h = 195
    if focused then
        g.scaleRotateCenter = [ppS(w / 2), ppS(h / 2)]
        g.scale = [1.04, 1.04]
        ppBox(g, 0, 14, w, h, 22, "#000000", 0.45)
        ppBox(g, 0, 0, w, h, 22, color)
        ppBox(g, 0, 0, w, h, 22, c.yellow)
        ppBox(g, 5, 5, w - 10, h - 10, 18, c.white)
    else
        ppBox(g, 0, 0, w, h, 22, c.white, 0.92)
    end if
    ' The cover strip: up to three covers on the playlist's color, with the count badge.
    ppBox(g, 5, 5, w - 10, 118, 18, color)
    ppRect(g, 5, 60, w - 10, 63, color)
    covers = p.covers
    if covers = invalid then covers = []
    n = covers.count()
    if n = 0 then n = 3
    if n > 3 then n = 3
    cw = (w - 10 - 20 - 6 * (n - 1)) / n
    for i = 0 to n - 1
        cx = 5 + 10 + i * (cw + 6)
        ppBox(g, cx, 15, cw, 118 - 10 - 30, 8, c.navy, 0.3)
        if i < covers.count() and covers[i] <> invalid then ppCover(g, hub + covers[i], cx, 15, cw, 78, agent)
    end for
    if p.id = -1 then ppIcon(g, "play", w / 2 - 22, 30, 44, c.navy)
    bw = ppTextWidth(p.count, "nx", 13) + 20
    ppBox(g, 5 + 12, 5 + 118 - 7 - 22, bw, 22, 10, c.navy)
    ppText(g, p.count, 5 + 12, 5 + 118 - 7 - 22, bw, 22, "nx", 13, c.white, "center")
    ppText(g, p.name, 5 + 16, 5 + 118 + 12, w - 42, 27, "fds", 22, c.navy)
    ppText(g, p.meta, 5 + 16, 5 + 118 + 12 + 27 + 4, w - 42, 20, "nb", 15, c.meta)
end sub

function handleKey(e as object) as boolean
    k = e.key
    rs = routines()
    list = cards()
    if k = "OK" then
        if m.row = 0 then
            m.top.action = { kind: "go", screen: "ProfilePicker" }
        else if m.row = 1 then
            m.top.action = { kind: "runRoutine", id: rs[m.col.r1].id }
        else
            p = list[m.col.r2]
            if p.id = -1 then
                m.top.action = { kind: "go", screen: "KidPicker" }
            else
                m.top.action = { kind: "startPlaylist", id: p.id }
            end if
        end if
        return true
    end if
    if k = "up" then
        if m.row = 2 and rs.count() > 0 then
            m.row = 1
        else if m.row > 0 then
            m.row = 0
        end if
    else if k = "down" then
        if m.row = 0 and rs.count() > 0 then
            m.row = 1
        else
            m.row = 2
        end if
    else if k = "left" then
        if m.row = 1 and m.col.r1 > 0 then m.col.r1 = m.col.r1 - 1
        if m.row = 2 and m.col.r2 > 0 then m.col.r2 = m.col.r2 - 1
    else if k = "right" then
        if m.row = 1 and m.col.r1 < rs.count() - 1 then m.col.r1 = m.col.r1 + 1
        if m.row = 2 and m.col.r2 < list.count() - 1 then m.col.r2 = m.col.r2 + 1
    else
        return false
    end if
    render()
    return true
end function
