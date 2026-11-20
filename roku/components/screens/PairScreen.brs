' Pairing: until the hub pairs this TV the channel cannot ask it anything. The normal way is from the phone or
' computer (Settings, this TV, Pair the channel: the hub opens the channel with its address and a token, PP6 D-1).
' When that cannot reach the TV, the hub address and the token shown in Settings can be typed here.

sub init()
    m.i = 0
    m.hub = ""
    m.token = ""
    m.dialog = invalid
    m.typing = ""
end sub

sub render()
    d = m.top.data
    if d = invalid then return
    if m.hub = "" and d.hub <> invalid then m.hub = d.hub
    m.top.removeChildrenIndex(m.top.getChildCount(), 0)
    c = ppColors()
    ppBlobs(m.top)
    ppBox(m.top, 640 - 48, 90, 96, 96, 28, c.yellow)
    ppIcon(m.top, "popcorn", 640 - 30, 90 + 18, 60, c.navy)
    ppText(m.top, "Pair this TV with Popcorn Pilot", 0, 210, 1280, 56, "fd", 46, c.white, "center")
    ppText(m.top, "On your phone or computer: Settings, pick this TV, then Pair the channel.", 0, 280, 1280, 30, "nx", 24, c.soft, "center")
    ppText(m.top, "Or type the hub address and the token from Settings here.", 0, 316, 1280, 30, "nx", 24, c.soft, "center")
    msg = ""
    if d.params <> invalid and d.params.message <> invalid then msg = d.params.message
    if msg <> "" then ppText(m.top, msg, 0, 360, 1280, 30, "nx", 22, c.coral, "center")
    hubWords = "Hub address"
    if m.hub <> "" then hubWords = "Hub: " + m.hub
    tokWords = "Token"
    if m.token <> "" then tokWords = "Token typed"
    labels = [hubWords, tokWords, "Pair"]
    widths = []
    total = 0
    for each l in labels
        w = 34 * 2 + ppTextWidth(l, "fd", 28)
        widths.push(w)
        total = total + w
    end for
    total = total + 24 * 2
    x = (1280 - total) / 2
    for i = 0 to 2
        ppKidButton(m.top, x, 430, labels[i], { focused: m.i = i, ghost: i < 2 })
        x = x + widths[i] + 24
    end for
end sub

sub ask(which as string)
    m.typing = which
    dlg = CreateObject("roSGNode", "StandardKeyboardDialog")
    if which = "hub" then
        dlg.title = "Hub address"
        dlg.message = ["For example http://192.168.1.50:3000"]
        dlg.text = m.hub
        if dlg.text = "" then dlg.text = "http://"
    else
        dlg.title = "Token"
        dlg.message = ["The channel token from Settings, this TV"]
        dlg.text = ""
    end if
    dlg.buttons = ["OK", "Cancel"]
    dlg.observeField("buttonSelected", "onDialog")
    m.dialog = dlg
    m.top.getScene().dialog = dlg
end sub

sub onDialog()
    dlg = m.dialog
    if dlg = invalid then return
    if dlg.buttonSelected = 0 then
        v = dlg.text.Trim()
        if m.typing = "hub" then
            m.hub = v
        else
            m.token = v
        end if
    end if
    dlg.close = true
    m.dialog = invalid
    render()
end sub

function handleKey(e as object) as boolean
    k = e.key
    if k = "OK" then
        if m.i = 0 then
            ask("hub")
        else if m.i = 1 then
            ask("token")
        else
            ' Pair: with what was typed, or (paired before, the hub did not answer) try again with the kept token.
            tok = m.token
            if tok = "" and m.top.data.token <> invalid then tok = m.top.data.token
            if m.hub <> "" and tok <> "" then m.top.action = { kind: "pairWith", hub: m.hub, token: tok }
        end if
        return true
    end if
    if k = "left" and m.i > 0 then m.i = m.i - 1
    if k = "right" and m.i < 2 then m.i = m.i + 1
    if k = "back" then return false
    render()
    return true
end function
