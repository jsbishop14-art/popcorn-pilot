' Earn more time, mockup docs/mockup/EarnTime.dc.html (1280x720, x1.5). The kid's tasks, four across; "I did it!"
' asks a grown-up (approved in the app or with the Adult PIN on the TV). The stars are this week's bonus, of the cap.

sub init()
    m.i = 0
    m.first = 0
    m.onBack = false
end sub

function tasks() as object
    d = m.top.data
    if d = invalid or d.kid = invalid or d.kid.tasks = invalid then return []
    return d.kid.tasks
end function

sub render()
    d = m.top.data
    if d = invalid then return
    m.top.removeChildrenIndex(m.top.getChildCount(), 0)
    c = ppColors()
    ppBlobs(m.top)
    ppIcon(m.top, "star", 64, 36, 50, c.yellow)
    ppText(m.top, "Do a job, earn more TV!", 64 + 50 + 18, 36, 800, 50, "fd", 42, c.white)
    ' Bonus stars: this week's bonus minutes of the weekly cap, as 4 stars.
    lit = 0
    if d.kid <> invalid and d.kid.bonus <> invalid and d.kid.bonus.capMin > 0 then
        lit = Int(4 * d.kid.bonus.usedMin / d.kid.bonus.capMin + 0.5)
        if lit > 4 then lit = 4
    end if
    for s = 0 to 3
        col = c.blob
        if s < lit then col = c.yellow
        ppIcon(m.top, "star", 1280 - 64 - (4 - s) * 48 + 8, 41, 40, col)
    end for

    list = tasks()
    if m.i < m.first then m.first = m.i
    if m.i > m.first + 3 then m.first = m.i - 3
    w = (1152 - 3 * 24) / 4
    h = 291
    top = 213
    if list.count() = 0 then ppText(m.top, "No jobs yet. A grown-up adds them on their phone.", 64, top, 1152, h, "nx", 26, c.soft, "center")
    for k = 0 to 3
        i = m.first + k
        if i >= list.count() then exit for
        t = list[i]
        x = 64 + k * (w + 24)
        g = m.top.createChild("Group")
        g.translation = [ppS(x), ppS(top)]
        if not m.onBack and m.i = i then
            g.scaleRotateCenter = [ppS(w / 2), ppS(h / 2)]
            g.scale = [1.05, 1.05]
            ppBox(g, 0, 10, w, h, 32, c.shadow)
            ppBox(g, 0, 0, w, h, 32, c.yellow)
            ppBox(g, 7, 7, w - 14, h - 14, 26, c.white)
        else
            ppBox(g, 0, 10, w, h, 32, c.shadow)
            ppBox(g, 0, 0, w, h, 32, c.white)
        end if
        ppCircle(g, w / 2 - 55, 26, 110, c.cream)
        pic = "task"
        if t.picture <> invalid and t.picture <> "" then pic = "pic-" + t.picture
        ppIcon(g, pic, w / 2 - 32, 26 + 23, 64, c.ink)
        ppText(g, t.name, 10, 26 + 110 + 12, w - 20, 34, "fds", 28, c.ink, "center")
        ppText(g, "+" + StrI(t.minutes).Trim() + " min", 10, 26 + 110 + 12 + 34 + 12, w - 20, 31, "fd", 26, c.orange, "center")
        chip = "I did it!"
        chipBg = c.yellow
        if ppStr(t.state) = "pending" then
            chip = "Waiting for a grown-up"
            chipBg = c.softer
        else if ppStr(t.state) = "approved" then
            chip = "Done! +" + StrI(t.minutes).Trim() + " min"
            chipBg = c.mint
        end if
        cw = ppTextWidth(chip, "nx", 18) + 36
        if cw > w - 20 then cw = w - 20
        ppBox(g, (w - cw) / 2, h - 20 - 34, cw, 34, 20, chipBg)
        ppText(g, chip, (w - cw) / 2, h - 20 - 34, cw, 34, "nx", 18, c.ink, "center")
    end for

    ppKidButton(m.top, 64, 720 - 30 - 60, "Back", { ghost: true, h: 60, size: 22, icon: "back", focused: m.onBack })
    ppArrowsHint(m.top, 1280 - 64, 720 - 30 - 56)
end sub

function handleKey(e as object) as boolean
    k = e.key
    list = tasks()
    if k = "OK" then
        if m.onBack or list.count() = 0 then
            m.top.action = { kind: "back" }
        else
            t = list[m.i]
            if t.state = invalid then m.top.action = { kind: "ask", body: { kind: "task", taskId: t.id }, words: t.name }
        end if
        return true
    end if
    if k = "back" then return false
    if k = "down" then
        m.onBack = true
    else if k = "up" then
        m.onBack = false
    else if not m.onBack and k = "left" and m.i > 0 then
        m.i = m.i - 1
    else if not m.onBack and k = "right" and m.i < list.count() - 1 then
        m.i = m.i + 1
    end if
    render()
    return true
end function
