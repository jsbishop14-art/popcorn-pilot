' Runs the key handling cases (KeyCases.brs) against the channel's own KeyPolicy.brs and Router.brs with the brs
' interpreter (no Roku needed). Prints one line per failed case and a summary line:
'   RESULT <passed> passed <failed> failed
sub Main()
    passed = 0
    failed = 0
    for each c in ppKeyCases()
        got = ppKeyDecision(c.key, c.kid)
        if got = c.want then
            passed = passed + 1
        else
            failed = failed + 1
            print "FAIL key "; c.key; " kid "; c.kid; ": got "; got; " want "; c.want
        end if
    end for
    for each c in ppGridCases()
        got = ppGridMove(c.i, c.n, c.cols, c.key)
        if got = c.want then
            passed = passed + 1
        else
            failed = failed + 1
            print "FAIL grid "; c.i; " "; c.key; ": got "; got; " want "; c.want
        end if
    end for
    for each c in ppPinCases()
        r = ppPinPress(c.d, c.k)
        if r.digits = c.want and r.send = c.send then
            passed = passed + 1
        else
            failed = failed + 1
            print "FAIL pin "; c.d; " key "; c.k; ": got "; r.digits; " "; r.send
        end if
    end for
    for each c in ppRouteCases()
        got = ppRoute(c.s)
        if got = c.want then
            passed = passed + 1
        else
            failed = failed + 1
            print "FAIL route: got "; got; " want "; c.want
        end if
    end for
    for each c in ppScreenCases()
        got = ppScreenAllowed(c.screen, c.kid)
        if got = c.want then
            passed = passed + 1
        else
            failed = failed + 1
            print "FAIL screen "; c.screen; " kid "; c.kid
        end if
    end for
    print "RESULT"; passed; " passed"; failed; " failed"
end sub
