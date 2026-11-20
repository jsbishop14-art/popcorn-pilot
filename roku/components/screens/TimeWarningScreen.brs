' The time warning in the middle of an episode, mockup docs/mockup/TimeWarning.dc.html (1280x720, x1.5). A channel
' cannot draw over Netflix, Hulu or Prime, so the hub opens this screen for a few seconds and then opens the title
' again (handoff 9.5; checked on hardware later). The card is the mockup's, in its place; behind it, what comes
' back. If the hub has not opened the title after 12 seconds, the channel goes to the kid home screen.

sub init()
    m.done = m.top.findNode("done")
    m.done.observeField("fire", "onDone")
    m.done.control = "start"
end sub

sub onDone()
    m.top.action = { kind: "warningDone" }
end sub

sub render()
    d = m.top.data
    if d = invalid then return
    m.top.removeChildrenIndex(m.top.getChildCount(), 0)
    m.top.appendChild(m.done)
    c = ppColors()
    ppRect(m.top, 0, 0, 1280, 720, c.slate)
    title = "Your show"
    if d.np <> invalid and d.np.nowPlaying <> invalid and d.np.nowPlaying.title <> invalid then title = d.np.nowPlaying.title.name
    ppText(m.top, title + " comes back in a moment", 0, 340, 1280, 40, "nx", 22, c.gray, "center")
    leftMin = 5
    if d.kid <> invalid and d.kid.time <> invalid then leftMin = d.kid.time.leftMin
    ppWarningCard(m.top, leftMin, true, d)
end sub

function handleKey(e as object) as boolean
    if e.key = "back" then return false
    return true
end function
