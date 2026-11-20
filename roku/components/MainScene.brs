' The channel's scene: pairing, the hub calls, which screen is up, and the remote keys.

sub init()
    m.ground = m.top.findNode("ground")
    m.slides = m.top.findNode("slides")
    m.slideA = m.top.findNode("slideA")
    m.slideB = m.top.findNode("slideB")
    m.layer = m.top.findNode("layer")
    m.toastLayer = m.top.findNode("toastLayer")
    m.toastBox = m.top.findNode("toastBox")
    m.toast = m.top.findNode("toast")
    m.toast.font = ppFont("nx", 22)
    m.poll = m.top.findNode("poll")
    m.poll.observeField("fire", "onPoll")
    m.slideTimer = m.top.findNode("slideTimer")
    m.slideTimer.observeField("fire", "onSlide")
    m.clockTimer = m.top.findNode("clockTimer")
    m.clockTimer.observeField("fire", "onClock")
    m.toastTimer = m.top.findNode("toastTimer")
    m.toastTimer.observeField("fire", "onToastDone")
    m.state = { content: "", home: invalid, kid: invalid, np: invalid, board: invalid }
    m.screen = invalid
    m.screenName = ""
    m.params = {}
    m.stack = []
    m.waiting = 0
    m.polls = 0
    m.slideIndex = 0
    reg = CreateObject("roRegistrySection", "popcorn")
    m.hub = reg.read("hub")
    m.token = reg.read("token")
    setAgent()
    m.top.setFocus(true)
    m.poll.control = "start"
    m.clockTimer.control = "start"
    m.slideTimer.control = "start"
end sub

' ------------------------------------------------------------------------------------------------ pairing

sub savePairing(hub as string, token as string)
    m.hub = hub
    m.token = token
    reg = CreateObject("roRegistrySection", "popcorn")
    reg.write("hub", hub)
    reg.write("token", token)
    reg.flush()
    setAgent()
end sub

sub forgetToken()
    m.token = ""
    reg = CreateObject("roRegistrySection", "popcorn")
    reg.delete("token")
    reg.flush()
end sub

' The background photos come from the hub with the channel token.
sub setAgent()
    for each p in [m.slideA, m.slideB]
        agent = ppAgent(m.token)
        if agent <> invalid then p.setHttpAgent(agent)
    end for
end sub

function paired() as boolean
    return m.hub <> "" and m.token <> ""
end function

' ------------------------------------------------------------------------------------------------ launch

sub onLaunchArgs()
    a = m.top.launchArgs
    if a = invalid then a = {}
    if a.pp_hub <> invalid and a.pp_token <> invalid and a.pp_hub <> "" and a.pp_token <> "" then savePairing(a.pp_hub, a.pp_token)
    c = ""
    if a.contentId <> invalid then c = a.contentId
    if c = "pair" then c = ""
    m.state.content = c
    m.stack = []
    refreshAll()
end sub

' Ask the hub for the home screen, the kid screens and now playing, then put up the right screen.
sub refreshAll()
    if not paired() then
        show("Pair", {})
        return
    end if
    m.waiting = 3
    request("GET", "/api/channel/home", invalid, "home", {})
    request("GET", "/api/channel/kid", invalid, "kid", {})
    request("GET", "/api/channel/now-playing", invalid, "np", {})
end sub

function isKid() as boolean
    if m.state.home <> invalid and m.state.home.kidMode = true then return true
    if m.state.kid <> invalid and m.state.kid.kidMode = true then return true
    return false
end function

function homeName() as string
    if isKid() then return "KidHome"
    return "Home"
end function

sub applyRoute()
    s = { paired: paired(), content: m.state.content, bridgeUp: false, kidMode: isKid(), timeUp: false }
    if m.state.np <> invalid and m.state.np.bridge <> invalid then s.bridgeUp = true
    if m.state.kid <> invalid and m.state.kid.kidMode = true and m.state.kid.time <> invalid then s.timeUp = (m.state.kid.time.timeUp = true)
    m.stack = []
    show(ppRoute(s), {})
end sub

' ------------------------------------------------------------------------------------------------ screens

sub show(name as string, params as object)
    if name <> "Pair" and not ppScreenAllowed(name, isKid()) then name = homeName()
    if m.screen <> invalid then
        m.screen.unobserveField("action")
        m.layer.removeChild(m.screen)
    end if
    m.screenName = name
    m.params = params
    grounds = { Home: "#0F1B33", TimeUp: "#0F1B33", TimeWarning: "#2B3D63", Album: "#000000" }
    g = grounds[name]
    if g = invalid then g = "#16264A"
    m.ground.color = ppC(g)
    m.screen = CreateObject("roSGNode", name + "Screen")
    m.screen.observeField("action", "onAction")
    m.layer.appendChild(m.screen)
    m.screen.data = screenData()
    updateSlides()
    m.top.setFocus(true)
end sub

function screenData() as object
    return { hub: m.hub, token: m.token, home: m.state.home, kid: m.state.kid, np: m.state.np, board: m.state.board, params: m.params, clock: ppClock(), photos: photoCount(), slide: m.slideIndex }
end function

sub refreshScreen()
    if m.screen <> invalid then m.screen.data = screenData()
end sub

sub go(name as string, params as object)
    m.stack.push({ name: m.screenName, params: m.params })
    show(name, params)
end sub

function goBack() as boolean
    if m.stack.count() > 0 then
        prev = m.stack.pop()
        show(prev.name, prev.params)
        return true
    end if
    if m.screenName <> homeName() and m.screenName <> "Pair" then
        m.state.content = ""
        applyRoute()
        return true
    end if
    return false
end function

' The only key handler in the channel. In kid mode the key policy takes every key but the arrows and OK first.
function onKeyEvent(key as string, press as boolean) as boolean
    if not press then return true
    if ppKeyDecision(key, isKid()) = "ignore" then return true
    if m.screen <> invalid then
        handled = m.screen.callFunc("handleKey", { key: key })
        if ppIs(handled) then return true
    end if
    if key = "back" then return goBack()
    return false
end function

' What a screen asks for.
sub onAction()
    a = m.screen.action
    if a = invalid or a.kind = invalid then return
    k = a.kind
    params = a.params
    if params = invalid then params = {}
    if k = "go" then
        if a.screen = "KidPicker" then
            request("GET", "/api/channel/board", invalid, "board", {})
        else if a.screen = "ProfilePicker" then
            request("GET", "/api/channel/hello", invalid, "hello", {})
        else
            go(a.screen, params)
        end if
    else if k = "back" then
        goBack()
    else if k = "home" then
        m.state.content = ""
        refreshAll()
    else if k = "startPlaylist" then
        request("POST", "/api/channel/playlists/" + StrI(a.id).Trim() + "/start", {}, "started", {})
    else if k = "runRoutine" then
        request("POST", "/api/channel/routines/" + StrI(a.id).Trim() + "/run", {}, "routine", {})
    else if k = "play" then
        request("POST", "/api/channel/play", { titleKey: a.titleKey, service: a.service }, "started", {})
    else if k = "profile" then
        body = { profileId: a.profileId }
        if a.pin <> invalid then body.pin = a.pin
        request("POST", "/api/channel/profile", body, "profile", { profileId: a.profileId, name: a.name })
    else if k = "ask" then
        request("POST", "/api/channel/requests", a.body, "asked", { words: a.words })
    else if k = "approve" then
        request("POST", "/api/channel/requests/" + StrI(a.requestId).Trim(), { pin: a.pin, decision: "approve" }, "approved", {})
    else if k = "bridge" then
        request("POST", "/api/channel/bridge", { action: a.action }, "bridge", {})
    else if k = "warningDone" or k = "albumDone" then
        m.state.content = ""
        refreshAll()
    else if k = "pairWith" then
        savePairing(a.hub, a.token)
        m.state.content = ""
        refreshAll()
    end if
end sub

' ------------------------------------------------------------------------------------------------ hub calls

sub request(method as string, path as string, body as dynamic, cb as string, ctx as object)
    t = CreateObject("roSGNode", "HubTask")
    t.hub = m.hub
    t.token = m.token
    t.method = method
    t.path = path
    if body <> invalid then t.body = body
    t.cb = cb
    t.ctx = ctx
    t.observeField("response", "onResponse")
    t.control = "RUN"
end sub

sub onResponse(e as object)
    t = e.getRoSGNode()
    r = e.getData()
    cb = t.cb
    ctx = t.ctx
    t.unobserveField("response")
    status = r.status
    b = r.body
    if b = invalid then b = {}
    if status = 401 and (cb = "home" or cb = "kid" or cb = "np" or cb = "poll" or cb = "pollnp") then
        ' The token was replaced or the TV removed on the hub: this TV is not paired any more.
        forgetToken()
        show("Pair", { message: "This TV is not paired with the hub. On your phone: Settings, this TV, Pair the channel." })
        return
    end if
    if cb = "home" or cb = "kid" or cb = "np" then
        if status = 200 then m.state[cb] = b
        if status = 0 and m.screen = invalid then
            show("Pair", { message: "The hub at " + m.hub + " did not answer. Check the hub is on." })
            return
        end if
        m.waiting = m.waiting - 1
        if m.waiting = 0 then applyRoute()
    else if cb = "poll" then
        onPollKid(status, b)
    else if cb = "pollhome" then
        if status = 200 then
            wasKid = isKid()
            m.state.home = b
            if wasKid <> isKid() then
                refreshAll()
            else if m.screenName = "Home" or m.screenName = "KidHome" then
                refreshScreen()
                updateSlides()
            end if
        end if
    else if cb = "pollnp" then
        if status = 200 then
            m.state.np = b
            if b.bridge = invalid and m.screenName = "NowPlaying" then
                m.state.content = ""
                refreshAll()
            else
                refreshScreen()
            end if
        end if
    else if cb = "board" then
        if status = 200 then
            m.state.board = b
            go("KidPicker", {})
        else
            toast(errorWords(status, b, "The shows did not load."))
        end if
    else if cb = "hello" then
        if status = 200 then
            go("ProfilePicker", { profiles: b.profiles })
        else
            toast(errorWords(status, b, "The profiles did not load."))
        end if
    else if cb = "started" or cb = "routine" then
        if status = 200 then
            if cb = "routine" and b.result <> invalid and not ppIs(b.result.ok) then
                toast(b.result.words)
            else
                toast("Starting...")
            end if
        else
            toast(errorWords(status, b, "That did not start."))
        end if
    else if cb = "profile" then
        if status = 200 then
            m.state.content = ""
            m.stack = []
            refreshAll()
        else if status = 401 and b.needPin <> invalid then
            go("Pin", { purpose: "profile", profileId: ctx.profileId, name: ctx.name, needPin: b.needPin, leaving: isKid() })
        else
            pinError(errorWords(status, b, "That did not work."))
        end if
    else if cb = "asked" then
        if status = 201 then
            go("RequestSent", { request: b.request, words: ctx.words })
        else
            toast(errorWords(status, b, "The grown-ups could not be asked."))
        end if
    else if cb = "approved" then
        if status = 200 then
            toast(b.message)
            m.stack = []
            refreshAll()
        else
            pinError(errorWords(status, b, "That did not work."))
        end if
    else if cb = "bridge" then
        if status <> 200 then toast(errorWords(status, b, "That did not work."))
    end if
end sub

function errorWords(status as integer, b as object, fallback as string) as string
    if status = 0 then return "The hub did not answer."
    if b.error <> invalid then return b.error
    return fallback
end function

' A wrong PIN (or a lockout) is shown on the PIN screen; anywhere else as a message.
sub pinError(words as string)
    if m.screenName = "Pin" then
        p = m.params
        p.error = words
        p.nonce = Rnd(1000000)
        m.params = p
        refreshScreen()
    else
        toast(words)
    end if
end sub

' ------------------------------------------------------------------------------------------------ polling

sub onPoll()
    if not paired() or m.screen = invalid then return
    m.polls = m.polls + 1
    if m.screenName = "NowPlaying" then request("GET", "/api/channel/now-playing", invalid, "pollnp", {})
    if m.screenName = "Album" or m.screenName = "TimeWarning" or m.screenName = "Pair" then return
    request("GET", "/api/channel/kid", invalid, "poll", {})
    if m.polls mod 6 = 0 then request("GET", "/api/channel/home", invalid, "pollhome", {})
end sub

sub onPollKid(status as integer, b as object)
    if status <> 200 then return
    wasKid = isKid()
    before = m.state.kid
    m.state.kid = b
    if wasKid <> (b.kidMode = true) then
        ' Switched in the app (kid mode on or off): start over on the right home screen.
        m.state.content = ""
        refreshAll()
        return
    end if
    if b.kidMode <> true then return
    if b.time <> invalid and b.time.timeUp = true and m.screenName <> "TimeUp" and m.screenName <> "Pin" and m.screenName <> "RequestSent" then
        m.stack = []
        show("TimeUp", {})
        return
    end if
    if m.screenName = "TimeUp" and b.time <> invalid and b.time.timeUp <> true then
        toast("A grown-up said yes!")
        applyRoute()
        return
    end if
    if m.screenName = "RequestSent" and m.params.request <> invalid then
        waiting = false
        for each q in b.requests
            if q.id = m.params.request.id then waiting = true
        end for
        if not waiting then
            toast("A grown-up answered.")
            m.stack = []
            applyRoute()
            return
        end if
    end if
    refreshScreen()
end sub

' ------------------------------------------------------------------------------------------------ background photos

function photoCount() as integer
    if m.state.home = invalid or m.state.home.background = invalid then return 0
    return m.state.home.background.count()
end function

sub updateSlides()
    n = photoCount()
    visible = (m.screenName = "Home" or m.screenName = "KidHome") and n > 0
    m.slides.visible = visible
    if visible and m.slideA.uri = "" then
        m.slideIndex = 0
        m.slideA.uri = m.hub + m.state.home.background[0].url
        m.slideA.opacity = 1
        m.slideB.opacity = 0
    end if
end sub

sub onSlide()
    n = photoCount()
    if not m.slides.visible or n < 2 then return
    m.slideIndex = (m.slideIndex + 1) mod n
    url = m.hub + m.state.home.background[m.slideIndex].url
    if m.slideA.opacity > 0.5 then
        m.slideB.uri = url
        m.slideB.opacity = 1
        m.slideA.opacity = 0
    else
        m.slideA.uri = url
        m.slideA.opacity = 1
        m.slideB.opacity = 0
    end if
    if m.screenName = "Home" then refreshScreen()
end sub

sub onClock()
    if m.screenName = "Home" then refreshScreen()
end sub

' ------------------------------------------------------------------------------------------------ messages

sub toast(words as string)
    w = ppTextWidth(words, "nx", 22) + 60
    if w > 1100 then w = 1100
    x = (1280 - w) / 2
    m.toastBox.translation = [ppS(x), 0]
    m.toastBox.width = ppS(w)
    m.toastBox.height = ppS(56)
    m.toast.translation = [ppS(x), 0]
    m.toast.width = ppS(w)
    m.toast.height = ppS(56)
    m.toast.text = words
    m.toastLayer.visible = true
    m.toastTimer.control = "stop"
    m.toastTimer.control = "start"
end sub

sub onToastDone()
    m.toastLayer.visible = false
end sub
