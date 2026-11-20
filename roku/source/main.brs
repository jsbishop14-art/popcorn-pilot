' The Popcorn Pilot channel (PP6). Sideloaded (developer mode), its Roku channel id is "dev". The hub opens it at
' power on, for snap back, between titles (the Now playing bridge), for the time warning, to play the Family Album,
' and to pair it (with the hub address and the channel token as launch parameters).

sub Main(args as dynamic)
    screen = CreateObject("roSGScreen")
    port = CreateObject("roMessagePort")
    screen.setMessagePort(port)
    input = CreateObject("roInput")
    input.setMessagePort(port)
    scene = screen.CreateScene("MainScene")
    screen.show()
    scene.launchArgs = ppLaunchArgs(args)
    while true
        msg = wait(0, port)
        t = type(msg)
        if t = "roSGScreenEvent" then
            if msg.isScreenClosed() then return
        else if t = "roInputEvent" then
            ' The hub opened the channel again while it was running (ECP launch or input with parameters).
            if msg.isInput() then scene.launchArgs = ppLaunchArgs(msg.getInfo())
        end if
    end while
end sub

' Only the parameters the channel uses, as strings.
function ppLaunchArgs(args as dynamic) as object
    out = {}
    if args = invalid then return out
    for each k in ["contentId", "pp_hub", "pp_token"]
        v = args[k]
        if v <> invalid then out[k] = v.toStr()
    end for
    return out
end function
