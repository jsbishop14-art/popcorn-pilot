' Which screen the channel shows (pure: tested with the key policy in roku/tests). s: { paired, content, bridgeUp,
' kidMode, timeUp }. content is what the hub opened the channel with: "bridge" (the Now playing bridge between
' titles), "time-warning", "family-album", or "" (the home screen).
function ppRoute(s as object) as string
    if not ppIs(s.paired) then return "Pair"
    if s.content = "bridge" and ppIs(s.bridgeUp) then return "NowPlaying"
    if s.content = "time-warning" and ppIs(s.kidMode) then return "TimeWarning"
    if s.content = "family-album" then return "Album"
    if ppIs(s.kidMode) and ppIs(s.timeUp) then return "TimeUp"
    if ppIs(s.kidMode) then return "KidHome"
    return "Home"
end function

' The screens a TV in kid mode may show. Home (routines, every playlist, the adult picker) is not one of them, and
' leaving kid mode goes through the profile picker and the Adult PIN (checked on the hub).
function ppKidScreens() as object
    return ["KidHome", "KidPicker", "EarnTime", "RequestSent", "TimeUp", "TimeWarning", "NowPlaying", "Album", "ProfilePicker", "Pin"]
end function

function ppScreenAllowed(screen as string, kidMode as boolean) as boolean
    if not kidMode then
        for each n in ["Home", "KidPicker", "ProfilePicker", "Pin", "NowPlaying", "Album", "Pair"]
            if n = screen then return true
        end for
        return false
    end if
    for each n in ppKidScreens()
        if n = screen then return true
    end for
    return false
end function
