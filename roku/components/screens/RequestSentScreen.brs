' Request sent, mockup docs/mockup/RequestSent.dc.html (1280x720, x1.5). What was asked (+20 minutes, or the job
' done); Back; Grown-up PIN (approve on this TV with the Adult PIN, checked on the hub). The channel watches the
' hub and goes back when a grown-up answers.

sub init()
    m.i = 0
end sub

sub render()
    d = m.top.data
    if d = invalid then return
    m.top.removeChildrenIndex(m.top.getChildCount(), 0)
    c = ppColors()
    ppBlobs(m.top)
    p = d.params
    words = "+20 minutes"
    if p <> invalid and p.words <> invalid then words = p.words
    top = 100
    ppCircle(m.top, 640 - 85, top, 170, c.white)
    ppIcon(m.top, "hand", 640 - 40, top + 45, 80, c.ink)
    ppText(m.top, "Asked a grown-up!", 0, top + 170 + 30, 1280, 67, "fd", 56, c.white, "center")
    cw = ppTextWidth(words, "fds", 32) + 60
    ppBox(m.top, 640 - cw / 2, top + 170 + 30 + 67 + 30, cw, 68, 34, c.blob)
    ppText(m.top, words, 640 - cw / 2, top + 170 + 30 + 67 + 30, cw, 68, "fds", 32, c.white, "center")
    dy = top + 170 + 30 + 67 + 30 + 68 + 30
    dots = [c.yellow, c.coral, c.mint]
    for i = 0 to 2
        ppCircle(m.top, 640 - 47 + i * 42, dy, 26, dots[i])
    end for
    ppText(m.top, "A grown-up can say yes on their phone, or with the PIN here.", 0, dy + 26 + 30, 1280, 30, "nx", 22, c.soft, "center")
    w1 = 34 * 2 + 42 + ppTextWidth("Back", "fd", 28)
    w2 = 34 * 2 + 42 + ppTextWidth("Grown-up PIN", "fd", 28)
    x = (1280 - w1 - 24 - w2) / 2
    by = dy + 26 + 30 + 30 + 30
    ppKidButton(m.top, x, by, "Back", { icon: "back", focused: m.i = 0 })
    ppKidButton(m.top, x + w1 + 24, by, "Grown-up PIN", { icon: "lock", focused: m.i = 1 })
end sub

function handleKey(e as object) as boolean
    k = e.key
    if k = "OK" then
        if m.i = 0 then
            m.top.action = { kind: "back" }
        else
            r = m.top.data.params.request
            m.top.action = { kind: "go", screen: "Pin", params: { purpose: "approve", requestId: r.id } }
        end if
        return true
    end if
    if k = "back" then return false
    if k = "left" then m.i = 0
    if k = "right" then m.i = 1
    render()
    return true
end function
