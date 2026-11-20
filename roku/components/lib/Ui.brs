' Drawing helpers for every Popcorn Pilot screen. Every position and size is written in the mockup's pixels
' (docs/mockup, drawn at 1280x720) and scaled here by 1.5 to the channel's 1920x1080, so each screen's code can be
' read side by side with its mockup. Colors are the approved palette (handoff 1.2).

function ppS(v as float) as float
    return v * 1.5
end function

' "#16264A" -> "0x16264AFF"; "#16264A" with alpha 0.6 -> "0x16264A99".
function ppC(hex as string, alpha = 1.0 as float) as string
    a = StrI(Int(alpha * 255 + 0.5), 16)
    if Len(a) < 2 then a = "0" + a
    return "0x" + UCase(Mid(hex, 2)) + UCase(a)
end function

function ppColors() as object
    return {
        navy: "#0F1B33", navy2: "#16264A", blob: "#1E3260", ink: "#16264A", shadow: "#0B1630",
        yellow: "#FFC94A", coral: "#FF8A65", mint: "#7FC8A9", blue: "#8FB3FF", white: "#FFFFFF",
        soft: "#D6DDEA", softer: "#E4E9F2", gray: "#C5CEDF", meta: "#4A5878", orange: "#C2410C",
        cream: "#FFF3C4", pink: "#FDECEA", slate: "#2B3D63"
    }
end function

' Fonts: "fd" Fredoka Bold (headings), "fds" Fredoka SemiBold, "nb" Nunito Bold, "nx" Nunito ExtraBold (body).
function ppFont(face as string, size as float) as object
    f = CreateObject("roSGNode", "Font")
    uris = { fd: "pkg:/fonts/Fredoka-Bold.ttf", fds: "pkg:/fonts/Fredoka-SemiBold.ttf", nb: "pkg:/fonts/Nunito-Bold.ttf", nx: "pkg:/fonts/Nunito-ExtraBold.ttf" }
    f.uri = uris[face]
    f.size = Int(ppS(size))
    return f
end function

function ppRect(parent as object, x as float, y as float, w as float, h as float, color as string, alpha = 1.0 as float) as object
    r = parent.createChild("Rectangle")
    r.translation = [ppS(x), ppS(y)]
    r.width = ppS(w)
    r.height = ppS(h)
    r.color = ppC(color, alpha)
    return r
end function

' The rounded box image (a white 9-patch) whose corner is nearest the mockup radius x 1.5.
function ppRadiusUri(r as float) as string
    radii = [12, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51, 54, 60, 78]
    want = ppS(r)
    best = radii[0]
    for each v in radii
        if Abs(v - want) < Abs(best - want) then best = v
    end for
    return "pkg:/images/rr" + StrI(best).Trim() + ".9.png"
end function

' A rounded box (mockup border-radius r), tinted.
function ppBox(parent as object, x as float, y as float, w as float, h as float, r as float, color as string, alpha = 1.0 as float) as object
    p = parent.createChild("Poster")
    p.uri = ppRadiusUri(r)
    p.translation = [ppS(x), ppS(y)]
    p.width = ppS(w)
    p.height = ppS(h)
    p.blendColor = ppC(color)
    p.opacity = alpha
    return p
end function

' A circle of diameter d with its top left at (x, y).
function ppCircle(parent as object, x as float, y as float, d as float, color as string, alpha = 1.0 as float) as object
    p = parent.createChild("Poster")
    p.uri = "pkg:/images/circle.png"
    p.translation = [ppS(x), ppS(y)]
    p.width = ppS(d)
    p.height = ppS(d)
    p.blendColor = ppC(color)
    p.opacity = alpha
    return p
end function

function ppRing(parent as object, x as float, y as float, d as float, color as string) as object
    p = parent.createChild("Poster")
    p.uri = "pkg:/images/ring.png"
    p.translation = [ppS(x), ppS(y)]
    p.width = ppS(d)
    p.height = ppS(d)
    p.blendColor = ppC(color)
    return p
end function

function ppIcon(parent as object, name as string, x as float, y as float, size as float, color as string) as object
    p = parent.createChild("Poster")
    p.uri = "pkg:/images/icon-" + name + ".png"
    p.translation = [ppS(x), ppS(y)]
    p.width = ppS(size)
    p.height = ppS(size)
    p.blendColor = ppC(color)
    return p
end function

' A line of text in a box; align "left", "center" or "right"; vertically centered in the box.
function ppText(parent as object, text as string, x as float, y as float, w as float, h as float, face as string, size as float, color as string, align = "left" as string) as object
    l = parent.createChild("Label")
    l.translation = [ppS(x), ppS(y)]
    l.width = ppS(w)
    l.height = ppS(h)
    l.font = ppFont(face, size)
    l.color = ppC(color)
    l.horizAlign = align
    l.vertAlign = "center"
    l.text = text
    return l
end function

' The width of a text in mockup pixels (for pills and buttons that fit their words).
function ppTextWidth(text as string, face as string, size as float) as float
    l = CreateObject("roSGNode", "Label")
    l.font = ppFont(face, size)
    l.text = text
    return l.boundingRect().width / 1.5
end function

' The two soft circles in the corners of the kid screens (mockup .blob).
sub ppBlobs(parent as object)
    c = ppColors()
    ppCircle(parent, 1280 - 320 + 60, -90, 320, c.blob)
    ppCircle(parent, -80, 720 + 120 - 360, 360, c.blob)
end sub

' A kid button (mockup .kbtn): white pill, 72 high, Fredoka 28, a shadow 8 below; focused: a yellow ring and 5% bigger.
' Returns its width. opts: { icon, ghost, h, size, padX, bg, fg, focused }.
function ppKidButton(parent as object, x as float, y as float, text as string, opts as object) as float
    c = ppColors()
    h = 72
    if opts.h <> invalid then h = opts.h
    size = 28
    if opts.size <> invalid then size = opts.size
    padX = 34
    if opts.padX <> invalid then padX = opts.padX
    bg = c.white
    fg = c.ink
    if opts.ghost = true then
        bg = c.blob
        fg = c.white
    end if
    if opts.bg <> invalid then bg = opts.bg
    if opts.fg <> invalid then fg = opts.fg
    iconW = 0
    if opts.icon <> invalid then iconW = size + 14
    w = padX * 2 + iconW + ppTextWidth(text, "fd", size)
    g = parent.createChild("Group")
    g.translation = [ppS(x), ppS(y)]
    if opts.focused = true then
        g.scaleRotateCenter = [ppS(w / 2), ppS(h / 2)]
        g.scale = [1.05, 1.05]
        ppBox(g, -12, -12, w + 24, h + 24, h / 2 + 12, c.yellow, 0.35)
    end if
    if opts.ghost <> true or opts.focused = true then ppBox(g, 0, 8, w, h, h / 2, c.shadow)
    ppBox(g, 0, 0, w, h, h / 2, bg)
    if opts.focused = true then
        ppBox(g, 0, 0, w, h, h / 2, c.yellow)
        ppBox(g, 6, 6, w - 12, h - 12, h / 2 - 6, bg)
    end if
    tx = padX
    if opts.icon <> invalid then
        ppIcon(g, opts.icon, padX, (h - size) / 2, size, fg)
        tx = padX + iconW
    end if
    ppText(g, text, tx, 0, w - tx - padX + 4, h, "fd", size, fg)
    return w
end function

' The time left pill (mockup KidHome and KidPicker): clock, "35 min left" and a bar fading green to yellow to red.
' Returns the pill width. pct 0 to 100; color is the hub's "hsl(h, s%, l%)" made into a Roku color.
function ppTimePill(parent as object, right as float, y as float, leftMin as integer, pct as float, hsl as string, barW = 200 as float) as float
    c = ppColors()
    words = StrI(leftMin).Trim() + " min left"
    tw = ppTextWidth(words, "fd", 28)
    if tw < barW then tw = barW
    w = 12 + 52 + 14 + tw + 26
    x = right - w
    ppBox(parent, x, y, w, 72, 36, c.white)
    ppCircle(parent, x + 12, y + 10, 52, c.cream)
    ppIcon(parent, "clock", x + 12 + 11, y + 10 + 11, 30, c.ink)
    ppText(parent, words, x + 78, y + 8, tw, 32, "fd", 28, c.ink)
    ppBox(parent, x + 78, y + 46, barW, 16, 8, c.softer)
    fw = barW * pct / 100
    if fw > 0 then
        if fw < 16 then fw = 16
        bar = ppBox(parent, x + 78, y + 46, fw, 16, 8, "#2E9E4F")
        bar.blendColor = ppHslColor(hsl)
    end if
    return w
end function

' "hsl(70, 72%, 45%)" -> "0xRRGGBBFF" (the hub sends the time bar color as CSS hsl).
function ppHslColor(hsl as string) as string
    r = CreateObject("roRegex", "hsl\(\s*([0-9.]+)\s*,\s*([0-9.]+)%\s*,\s*([0-9.]+)%\s*\)", "")
    m = r.match(hsl)
    if m.count() < 4 then return ppC("#7FC8A9")
    h = Val(m[1]) / 360.0
    s = Val(m[2]) / 100.0
    l = Val(m[3]) / 100.0
    if l < 0.5 then q = l * (1 + s) else q = l + s - l * s
    p = 2 * l - q
    rgb = [ppHue(p, q, h + 1 / 3.0), ppHue(p, q, h), ppHue(p, q, h - 1 / 3.0)]
    out = "0x"
    for each v in rgb
        x = StrI(Int(v * 255 + 0.5), 16)
        if Len(x) < 2 then x = "0" + x
        out = out + UCase(x)
    end for
    return out + "FF"
end function

function ppHue(p as float, q as float, t as float) as float
    if t < 0 then t = t + 1
    if t > 1 then t = t - 1
    if t < 1 / 6.0 then return p + (q - p) * 6 * t
    if t < 1 / 2.0 then return q
    if t < 2 / 3.0 then return p + (q - p) * (2 / 3.0 - t) * 6
    return p
end function

' The arrows and OK hint (mockup footers): a round arrows badge and an "OK" pill, right aligned at `right`.
sub ppArrowsHint(parent as object, right as float, y as float)
    c = ppColors()
    okW = 22 * 2 + ppTextWidth("OK", "fd", 22)
    ppBox(parent, right - okW, y, okW, 52, 26, c.blob)
    ppText(parent, "OK", right - okW, y, okW, 52, "fd", 22, c.white, "center")
    ppCircle(parent, right - okW - 12 - 52, y, 52, c.blob)
    ppIcon(parent, "arrows", right - okW - 12 - 52 + 12, y + 12, 28, c.white)
end sub

' A profile badge: colored circle with the initial (mockup header avatars).
sub ppAvatar(parent as object, x as float, y as float, d as float, color as string, initial as string, ring = 0 as float)
    c = ppColors()
    if ring > 0 then ppCircle(parent, x - ring, y - ring, d + ring * 2, c.white)
    ppCircle(parent, x, y, d, color)
    ppText(parent, initial, x, y, d, d, "fd", d * 0.47, c.ink, "center")
end sub

' A cover art picture from the hub (with the channel token), loaded over a colored placeholder box.
function ppCover(parent as object, uri as dynamic, x as float, y as float, w as float, h as float, agent as object) as object
    p = parent.createChild("Poster")
    p.translation = [ppS(x), ppS(y)]
    p.width = ppS(w)
    p.height = ppS(h)
    p.loadDisplayMode = "scaleToZoom"
    if agent <> invalid then p.setHttpAgent(agent)
    if uri <> invalid and uri <> "" then p.uri = uri
    return p
end function

' Clock for the home screen header: "7:12 PM", local time.
function ppClock() as string
    d = CreateObject("roDateTime")
    d.toLocalTime()
    h = d.getHours()
    m = d.getMinutes()
    ap = "AM"
    if h >= 12 then ap = "PM"
    h = h mod 12
    if h = 0 then h = 12
    mm = StrI(m).Trim()
    if m < 10 then mm = "0" + mm
    return StrI(h).Trim() + ":" + mm + " " + ap
end function
