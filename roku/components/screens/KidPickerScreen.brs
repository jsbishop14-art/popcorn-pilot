' The picker board, mockup docs/mockup/KidPicker.dc.html (1280x720, x1.5): tiles with cover art and title. A kid
' gets 3 across and 2 down (6, Josh 21:57: "6 for kid"); an adult profile 6 across and 2 down (12, "more for adult.
' whatever fits"). The hub sends only titles this profile may watch and checks again when one is picked.
' Footer: Back (PP6 D-12), Earn more time (kid), the arrows hint.

sub init()
    m.i = 0
    m.foot = -1
end sub

function tiles() as object
    d = m.top.data
    if d = invalid or d.board = invalid or d.board.tiles = invalid then return []
    return d.board.tiles
end function

function isKidBoard() as boolean
    d = m.top.data
    return d <> invalid and d.board <> invalid and d.board.kid = true
end function

function footer() as object
    if isKidBoard() then return ["Back", "Earn more time"]
    return ["Back"]
end function

sub render()
    d = m.top.data
    if d = invalid then return
    m.top.removeChildrenIndex(m.top.getChildCount(), 0)
    c = ppColors()
    ppBlobs(m.top)
    kid = isKidBoard()
    k = d.kid
    ' Header (padding 30 64).
    if kid and k <> invalid and k.profile <> invalid then
        ppAvatar(m.top, 64 + 4, 30 + 4, 68, k.profile.color, k.profile.initial, 4)
        ppText(m.top, "Pick a show!", 64 + 76 + 18, 30, 600, 76, "fd", 40, c.white)
        if k.time <> invalid then ppTimePill(m.top, 1280 - 64, 32, k.time.leftMin, k.time.percent, k.time.color, 210)
    else
        ppText(m.top, "Pick a show", 64, 30, 600, 76, "fd", 40, c.white)
    end if

    ' The board.
    list = tiles()
    cols = 6
    if kid then cols = 3
    gap = 24
    w = (1152 - (cols - 1) * gap) / cols
    h = (482 - gap) / 2
    top = 30 + 76 + 22
    colors = [c.blue, c.mint, c.coral, c.yellow, "#C9A7F5", c.softer]
    agent = ppAgent(d.token)
    if list.count() = 0 then ppText(m.top, "No shows to pick yet. A grown-up adds them to a playlist.", 64, top, 1152, 200, "nx", 24, c.soft, "center")
    n = list.count()
    if n > cols * 2 then n = cols * 2
    for i = 0 to n - 1
        t = list[i]
        x = 64 + (i mod cols) * (w + gap)
        y = top + (i \ cols) * (h + gap)
        g = m.top.createChild("Group")
        g.translation = [ppS(x), ppS(y)]
        focused = (m.foot < 0 and m.i = i)
        band = 49
        if not kid then band = 42
        if focused then
            g.scaleRotateCenter = [ppS(w / 2), ppS(h / 2)]
            g.scale = [1.05, 1.05]
            ppBox(g, -7, -7, w + 14, h + 14, 35, c.yellow, 0.35)
            ppBox(g, 0, 16, w, h, 28, c.shadow)
            ppBox(g, 0, 0, w, h, 28, c.yellow)
        else
            ppBox(g, 0, 10, w, h, 28, c.shadow)
            ppBox(g, 0, 0, w, h, 28, c.white)
        end if
        ' Cover art over the tile's color (the stub's pictures are drawings a Roku cannot show; real ones are).
        ppBox(g, 7, 7, w - 14, h - 14, 21, c.white)
        ppBox(g, 7, 7, w - 14, h - 14 - band, 21, colors[i mod 6])
        ppRect(g, 7, h - 7 - band - 21, w - 14, 21, colors[i mod 6])
        ppIcon(g, "tv", w / 2 - 16, (h - band) / 2 - 22, 32, c.ink)
        ppText(g, t.serviceName, 7, (h - band) / 2 + 12, w - 14, 20, "nx", 14, c.ink, "center")
        if t.poster <> invalid then ppCover(g, d.hub + t.poster, 7, 7, w - 14, h - 14 - band, agent)
        size = 24
        if not kid then size = 18
        ppText(g, t.name, 7 + 8, h - 7 - band, w - 30, band, "fds", size, c.ink, "center")
    end for

    ' Footer.
    fy = 720 - 28 - 64
    labels = footer()
    x = 64
    for j = 0 to labels.count() - 1
        if labels[j] = "Back" then
            w2 = ppKidButton(m.top, x, fy + 6, "Back", { ghost: true, h: 52, size: 20, padX: 22, icon: "back", focused: m.foot = j })
        else
            w2 = ppKidButton(m.top, x, fy, "Earn more time", { h: 64, size: 26, padX: 24, icon: "star", focused: m.foot = j })
        end if
        x = x + w2 + 24
    end for
    ppArrowsHint(m.top, 1280 - 64, fy + 6)
end sub

function handleKey(e as object) as boolean
    k = e.key
    list = tiles()
    cols = 6
    if isKidBoard() then cols = 3
    count = list.count()
    if count > cols * 2 then count = cols * 2
    if k = "OK" then
        if m.foot >= 0 then
            if footer()[m.foot] = "Back" then
                m.top.action = { kind: "back" }
            else
                m.top.action = { kind: "go", screen: "EarnTime" }
            end if
        else if count > 0 then
            t = list[m.i]
            m.top.action = { kind: "play", titleKey: t.key, service: t.service }
        end if
        return true
    end if
    if k = "back" then return false
    if m.foot >= 0 then
        if k = "up" and count > 0 then
            m.foot = -1
        else if k = "left" and m.foot > 0 then
            m.foot = m.foot - 1
        else if k = "right" and m.foot < footer().count() - 1 then
            m.foot = m.foot + 1
        end if
    else
        n = ppGridMove(m.i, count, cols, k)
        if n >= 0 then
            m.i = n
        else if k = "down" or count = 0 then
            m.foot = 0
        end if
    end if
    render()
    return true
end function
