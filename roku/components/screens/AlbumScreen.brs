' The Family Album as a playlist item (handoff 8.3; PP5 D-12): the hub opens the channel with "family-album"; the
' channel shows the album's photos (8 seconds each) and plays its clips, in the order the hub sends (shuffled), round
' and round, until the hub moves the playlist on. OK goes to the next one.

sub init()
    m.items = invalid
    m.i = -1
    m.photo = m.top.findNode("photo")
    m.clip = m.top.findNode("clip")
    m.note = m.top.findNode("note")
    m.note.font = ppFont("nx", 24)
    m.next = m.top.findNode("next")
    m.next.observeField("fire", "advance")
    if m.clip <> invalid then m.clip.observeField("state", "onClipState")
end sub

sub render()
    d = m.top.data
    if d = invalid or m.items <> invalid then return
    m.items = []
    agent = ppAgent(d.token)
    if agent <> invalid then m.photo.setHttpAgent(agent)
    m.note.text = "Loading the Family Album..."
    t = CreateObject("roSGNode", "HubTask")
    t.hub = d.hub
    t.token = d.token
    t.method = "GET"
    t.path = "/api/channel/album"
    t.observeField("response", "onAlbum")
    t.control = "RUN"
end sub

sub onAlbum(e as object)
    r = e.getData()
    if r.status = 200 and r.body <> invalid and r.body.items <> invalid then m.items = r.body.items
    if m.items.count() = 0 then
        m.note.text = "The Family Album has no photos yet."
        return
    end if
    m.note.text = ""
    advance()
end sub

sub advance()
    if m.items = invalid or m.items.count() = 0 then return
    m.next.control = "stop"
    m.i = (m.i + 1) mod m.items.count()
    it = m.items[m.i]
    d = m.top.data
    if it.kind = "clip" then
        m.photo.visible = false
        c = CreateObject("roSGNode", "ContentNode")
        c.url = d.hub + it.url
        c.streamFormat = "mp4"
        c.httpHeaders = ["Authorization: Bearer " + d.token]
        m.clip.content = c
        m.clip.visible = true
        m.clip.control = "play"
    else
        m.clip.control = "stop"
        m.clip.visible = false
        m.photo.uri = d.hub + it.url
        m.photo.visible = true
        m.next.control = "start"
    end if
end sub

sub onClipState()
    s = m.clip.state
    if s = "finished" or s = "error" then advance()
end sub

function handleKey(e as object) as boolean
    if e.key = "OK" then
        advance()
        return true
    end if
    if e.key = "back" then
        m.clip.control = "stop"
        return false
    end if
    return true
end function
