' Time is up, mockup docs/mockup/TimeUp.dc.html (1280x720, x1.5). The hub turns the TV off when time runs out
' (PP4); this is what the kid sees if the TV is turned on again the same day. Earn more time; Ask a grown-up asks
' for 20 more minutes (only when the kid's rules let them ask).

sub init()
    m.i = 0
end sub

function buttons() as object
    d = m.top.data
    out = [{ label: "Earn more time", icon: "star", kind: "earn" }]
    if d <> invalid and d.kid <> invalid and d.kid.canAskForTime = true then out.push({ label: "Ask a grown-up", icon: "hand", kind: "ask" })
    return out
end function

sub render()
    d = m.top.data
    if d = invalid then return
    m.top.removeChildrenIndex(m.top.getChildCount(), 0)
    c = ppColors()
    ppBlobs(m.top)
    name = ""
    if d.kid <> invalid and d.kid.profile <> invalid then name = d.kid.profile.name
    top = 136
    ppCircle(m.top, 640 - 85, top, 170, c.blob)
    ppIcon(m.top, "moon", 640 - 40, top + 45, 80, c.yellow)
    ppText(m.top, "All done for today!", 0, top + 170 + 30, 1280, 72, "fd", 60, c.white, "center")
    words = "See you tomorrow, " + name + "."
    if d.kid <> invalid and d.kid.time <> invalid and d.kid.time.inHours <> true then words = "TV time is " + d.kid.time.viewingHours + ". See you then, " + name + "."
    ppText(m.top, words, 0, top + 170 + 30 + 72 + 30, 1280, 34, "nx", 26, c.soft, "center")
    bs = buttons()
    widths = []
    total = 0
    for each b in bs
        w = 34 * 2 + 42 + ppTextWidth(b.label, "fd", 28)
        widths.push(w)
        total = total + w
    end for
    total = total + 24 * (bs.count() - 1)
    x = (1280 - total) / 2
    y = top + 170 + 30 + 72 + 30 + 34 + 40
    for i = 0 to bs.count() - 1
        ppKidButton(m.top, x, y, bs[i].label, { icon: bs[i].icon, focused: m.i = i })
        x = x + widths[i] + 24
    end for
end sub

function handleKey(e as object) as boolean
    k = e.key
    bs = buttons()
    if m.i > bs.count() - 1 then m.i = bs.count() - 1
    if k = "OK" then
        if bs[m.i].kind = "earn" then
            m.top.action = { kind: "go", screen: "EarnTime" }
        else
            m.top.action = { kind: "ask", body: { kind: "time", minutes: 20 }, words: "+20 minutes" }
        end if
        return true
    end if
    if k = "left" and m.i > 0 then m.i = m.i - 1
    if k = "right" and m.i < bs.count() - 1 then m.i = m.i + 1
    render()
    return true
end function
