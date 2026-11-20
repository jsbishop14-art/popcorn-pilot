sub init()
    m.top.functionName = "callHub"
end sub

sub callHub()
    m.top.response = ppHubCall(m.top.hub, m.top.token, m.top.method, m.top.path, m.top.body)
end sub

' One HTTP call to the hub; waits up to 10 seconds. Returns { status, body } (status 0: no answer).
function ppHubCall(hub as string, token as string, method as string, path as string, body as dynamic) as object
    if hub = "" then return { status: 0, body: invalid }
    port = CreateObject("roMessagePort")
    t = CreateObject("roUrlTransfer")
    t.setMessagePort(port)
    t.setUrl(hub + path)
    t.retainBodyOnError(true)
    t.addHeader("Accept", "application/json")
    if token <> "" then t.addHeader("Authorization", "Bearer " + token)
    if method = "GET" then
        ok = t.asyncGetToString()
    else
        t.addHeader("Content-Type", "application/json")
        t.setRequest(method)
        payload = "{}"
        if body <> invalid then payload = FormatJson(body)
        ok = t.asyncPostFromString(payload)
    end if
    if not ok then return { status: 0, body: invalid }
    msg = wait(10000, port)
    if type(msg) <> "roUrlEvent" then
        t.asyncCancel()
        return { status: 0, body: invalid }
    end if
    code = msg.getResponseCode()
    if code < 0 then code = 0
    text = msg.getString()
    parsed = invalid
    if text <> invalid and text <> "" then parsed = ParseJson(text)
    return { status: code, body: parsed }
end function
