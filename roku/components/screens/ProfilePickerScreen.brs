' Profile picker, mockup docs/mockup/ProfilePicker.dc.html (1280x720, x1.5). Every profile, then Guest (no
' profile). A lock badge marks the ones that ask for a PIN: grown-up profiles and Guest, and in kid mode every other
' profile (leaving kid mode). The hub checks the PIN (PP6 D-2); OK on a locked one opens the PIN screen.

sub init()
    m.i = 0
    m.first = 0
    m.onBack = false
end sub

function entries() as object
    d = m.top.data
    out = []
    if d <> invalid and d.params <> invalid and d.params.profiles <> invalid then
        for each p in d.params.profiles
            out.push({ id: p.id, name: p.name, initial: p.initial, color: p.color, kid: p.type = "kid" })
        end for
    end if
    out.push({ id: invalid, name: "Guest", initial: "+", color: "#C5CEDF", kid: false })
    return out
end function

function currentId() as dynamic
    d = m.top.data
    if d = invalid or d.home = invalid or d.home.profile = invalid then return invalid
    return d.home.profile.id
end function

function kidMode() as boolean
    d = m.top.data
    return d <> invalid and d.home <> invalid and d.home.kidMode = true
end function

function locked(e as object) as boolean
    cid = currentId()
    if kidMode() then return e.id = invalid or cid = invalid or e.id <> cid
    return not e.kid
end function

sub render()
    d = m.top.data
    if d = invalid then return
    m.top.removeChildrenIndex(m.top.getChildCount(), 0)
    c = ppColors()
    ppBlobs(m.top)
    list = entries()
    if m.i < m.first then m.first = m.i
    if m.i > m.first + 4 then m.first = m.i - 4
    n = list.count() - m.first
    if n > 5 then n = 5
    top = 140
    ppText(m.top, "Who's watching?", 0, top, 1280, 62, "fd", 52, c.white, "center")
    total = n * 190 + (n - 1) * 56
    x0 = (1280 - total) / 2
    y = top + 62 + 56
    for k = 0 to n - 1
        i = m.first + k
        e = list[i]
        x = x0 + k * (190 + 56)
        g = m.top.createChild("Group")
        g.translation = [ppS(x), ppS(y)]
        if i = m.i then
            g.scaleRotateCenter = [ppS(95), ppS(95)]
            g.scale = [1.08, 1.08]
            ppCircle(g, -8, -8, 206, c.yellow, 0.3)
            ppCircle(g, 0, 0, 190, c.yellow)
            ppCircle(g, 7, 7, 176, e.color)
        else
            ppCircle(g, 0, 0, 190, e.color)
        end if
        ppText(g, e.initial, 0, 0, 190, 190, "fd", 88, c.ink, "center")
        if locked(e) then
            ppCircle(g, 190 - 48 + 4, 190 - 48 + 4, 48, c.white)
            ppIcon(g, "lock", 190 - 48 + 4 + 12, 190 - 48 + 4 + 12, 24, c.ink)
        end if
        ppText(m.top, e.name, x - 30, y + 190 + 18, 250, 36, "fds", 30, c.white, "center")
    end for
    hint = "Grown-up profiles ask for the PIN"
    if kidMode() then hint = "Leaving kid mode asks for the grown-up PIN"
    ppText(m.top, hint, 0, y + 190 + 18 + 36 + 56, 1280, 24, "nx", 18, c.soft, "center")
    ' Back (the remote's Back key does nothing in kid mode, PP6 D-12).
    ppKidButton(m.top, 56, 720 - 22 - 52, "Back", { ghost: true, h: 52, size: 20, padX: 22, icon: "back", focused: m.onBack = true })
end sub

function handleKey(e as object) as boolean
    k = e.key
    list = entries()
    if k = "OK" then
        if m.onBack = true then
            m.top.action = { kind: "back" }
            return true
        end if
        p = list[m.i]
        m.top.action = { kind: "profile", profileId: p.id, name: p.name }
        return true
    end if
    if k = "down" then
        m.onBack = true
    else if k = "up" then
        m.onBack = false
    else if m.onBack = true and (k = "left" or k = "right") then
        return true
    else if k = "left" and m.i > 0 then
        m.i = m.i - 1
    else if k = "right" and m.i < list.count() - 1 then
        m.i = m.i + 1
    else if k = "back" then
        return false
    else
        return true
    end if
    render()
    return true
end function
