' PIN entry, mockup docs/mockup/TvPin.dc.html (1280x720, x1.5). Left: what the PIN is for and the 4 digit boxes;
' right: the pad (1 to 9, Clear, 0, OK), picked with the arrows and OK (a Roku remote has no number keys). The
' digits are sent to the hub when 4 are in (or OK); the PIN is never kept on the TV.
' params: { purpose: "profile" | "approve", profileId, name, needPin: "adult" | "any", leaving, requestId, error }

sub init()
    m.key = 4
    m.digits = ""
    m.onBack = false
    m.lastError = -1
end sub

sub render()
    d = m.top.data
    if d = invalid then return
    p = d.params
    if p = invalid then p = {}
    if p.error <> invalid and p.nonce <> invalid and p.nonce <> m.lastError then
        ' A wrong PIN: start again.
        m.lastError = p.nonce
        m.digits = ""
    end if
    m.top.removeChildrenIndex(m.top.getChildCount(), 0)
    c = ppColors()
    ppBlobs(m.top)
    left = (1280 - 890) / 2
    top = (720 - 330) / 2
    ppCircle(m.top, left, top, 64, c.blob)
    ppIcon(m.top, "lock", left + 16, top + 16, 32, c.yellow)
    purpose = ppStr(p.purpose)
    needPin = ppStr(p.needPin)
    title = "Grown-up PIN"
    if needPin = "any" then title = "PIN"
    ppText(m.top, title, left, top + 64 + 22, 420, 56, "fd", 46, c.white)
    why = "To open Family, approve requests, or leave kid mode"
    if purpose = "approve" then
        why = "To say yes on this TV"
    else if ppIs(p.leaving) then
        why = "To leave kid mode"
    else if purpose = "profile" and needPin = "any" then
        why = "The grown-up or Guest PIN, to open Guest"
    else if purpose = "profile" and ppStr(p.name) <> "" then
        why = "To open " + p.name
    end if
    sub1 = ppText(m.top, why, left, top + 64 + 22 + 56 + 22, 420, 60, "nx", 22, c.soft)
    sub1.wrap = true
    sub1.vertAlign = "top"
    dy = top + 64 + 22 + 56 + 22 + 60 + 22
    for i = 0 to 3
        x = left + i * (70 + 14)
        if i < Len(m.digits) then
            ppBox(m.top, x, dy, 70, 84, 18, c.white)
            ppCircle(m.top, x + 24, dy + 31, 22, c.navy2)
        else
            ppBox(m.top, x, dy, 70, 84, 18, c.blob)
        end if
    end for
    if p.error <> invalid then ppText(m.top, p.error, left, dy + 84 + 14, 420, 30, "nx", 20, c.coral)

    ' The pad.
    labels = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "Clear", "0", "OK"]
    padX = left + 420 + 90
    padY = (720 - 384) / 2
    kw = (380 - 32) / 3
    for i = 0 to 11
        x = padX + (i mod 3) * (kw + 16)
        y = padY + (i \ 3) * (84 + 16)
        if i = m.key and not m.onBack then
            ppBox(m.top, x, y, kw, 84, 24, c.yellow)
            ppBox(m.top, x + 6, y + 6, kw - 12, 72, 18, c.white)
        else
            ppBox(m.top, x, y, kw, 84, 24, c.white)
        end if
        size = 36
        if Len(labels[i]) > 1 then size = 26
        ppText(m.top, labels[i], x, y, kw, 84, "fds", size, c.ink, "center")
    end for
    ' Back (the remote's Back key does nothing in kid mode, PP6 D-12).
    ppKidButton(m.top, 56, 720 - 22 - 52, "Back", { ghost: true, h: 52, size: 20, padX: 22, icon: "back", focused: m.onBack })
end sub

sub send()
    d = m.top.data
    p = d.params
    pin = m.digits
    if ppStr(p.purpose) = "approve" then
        m.top.action = { kind: "approve", requestId: p.requestId, pin: pin }
    else
        m.top.action = { kind: "profile", profileId: p.profileId, name: p.name, pin: pin }
    end if
end sub

function handleKey(e as object) as boolean
    k = e.key
    if m.onBack then
        if k = "OK" then
            m.top.action = { kind: "back" }
        else if k = "up" or k = "right" then
            m.onBack = false
            render()
        else if k = "back" then
            return false
        end if
        return true
    end if
    if k = "OK" then
        r = ppPinPress(m.digits, m.key)
        m.digits = r.digits
        render()
        if r.send then send()
        return true
    end if
    if k = "back" then return false
    n = ppGridMove(m.key, 12, 3, k)
    if n >= 0 then
        m.key = n
    else if k = "left" and m.key mod 3 = 0 then
        m.onBack = true
    else if k = "down" then
        m.onBack = true
    end if
    render()
    return true
end function
