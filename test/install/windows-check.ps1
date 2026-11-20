<#
.SYNOPSIS
  PP7 check 1 (CI Windows job): what the test-mode install left on the machine, and that the uninstall removes it.

.DESCRIPTION
  -Stage Installed: the task "Popcorn Pilot (test)" exists, starts at boot as Local Service and is running; the app
  listening on the port was started by the hub service (scripts\hub-service.mjs) under that task's account; the one
  firewall rule allows only TCP on that port, inbound, private networks only.
  -Stage KeptData: after the uninstall without -RemoveData: no task, no firewall rule, nothing listening, no hub
  process, and the install folder holds only the data folder.
  -Stage Removed: after the uninstall with -RemoveData: the same, and the install folder is gone.
  Prints one line per item checked; exit 1 if any failed.
#>
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidUsingPositionalParameters', '', Justification = 'Test-Item is this file''s own three-argument check line (what, ok, what it got).')]
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Root,
  [Parameter(Mandatory)][int]$Port,
  [Parameter(Mandatory)][ValidateSet('Installed', 'KeptData', 'Removed')][string]$Stage
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$TaskName = 'Popcorn Pilot (test)'
$RuleName = 'PopcornPilot-App-Test'
$script:failed = 0

function Test-Item([string]$What, [bool]$Ok, [string]$Got = '') {
  if ($Ok) {
    Write-Information "ok   $What" -InformationAction Continue
  } else {
    Write-Information "FAIL $What (got: $Got)" -InformationAction Continue
    $script:failed++
  }
}

$localService = (New-Object Security.Principal.SecurityIdentifier 'S-1-5-19').Translate([Security.Principal.NTAccount]).Value
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
$rule = Get-NetFirewallRule -Name $RuleName -ErrorAction SilentlyContinue
$listen = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
$hubProcs = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($Root) })

if ($Stage -eq 'Installed') {
  Test-Item 'the task exists' ($null -ne $task)
  if ($task) {
    Test-Item 'the task runs as Local Service' ($task.Principal.UserId -eq $localService -or $task.Principal.UserId -eq 'LOCAL SERVICE') $task.Principal.UserId
    Test-Item 'the task starts at boot (before anyone signs in)' (@($task.Triggers | Where-Object { $_.CimClass.CimClassName -eq 'MSFT_TaskBootTrigger' }).Count -eq 1)
    Test-Item 'the task starts the hub again every 5 minutes if it is not running' (@($task.Triggers | Where-Object { $_.Repetition.Interval -eq 'PT5M' }).Count -eq 1)
    Test-Item 'the task has no time limit' ($task.Settings.ExecutionTimeLimit -eq 'PT0S') $task.Settings.ExecutionTimeLimit
    Test-Item 'the task does not wake the PC' (-not $task.Settings.WakeToRun)
    $state = (Get-ScheduledTask -TaskName $TaskName).State
    Test-Item 'the task is running' ($state -eq 'Running') "$state"
  }
  Test-Item "something listens on port $Port" ($listen.Count -ge 1)
  if ($listen.Count -ge 1) {
    $app = Get-CimInstance Win32_Process -Filter "ProcessId = $($listen[0].OwningProcess)"
    Test-Item 'the app is next start from the app folder' ($app.CommandLine -match 'next' -and $app.CommandLine.Contains($Root)) $app.CommandLine
    $parent = Get-CimInstance Win32_Process -Filter "ProcessId = $($app.ParentProcessId)"
    Test-Item 'the app was started by the hub service' ($parent -and $parent.CommandLine -match 'hub-service\.mjs') "$($parent.CommandLine)"
    $owner = Invoke-CimMethod -InputObject $app -MethodName GetOwner
    Test-Item 'the app runs as Local Service' ("$($owner.Domain)\$($owner.User)" -eq $localService) "$($owner.Domain)\$($owner.User)"
  }
  Test-Item 'the firewall rule exists' ($null -ne $rule)
  if ($rule) {
    $pf = $rule | Get-NetFirewallPortFilter
    Test-Item 'the rule allows inbound' ("$($rule.Direction)" -eq 'Inbound' -and "$($rule.Action)" -eq 'Allow') "$($rule.Direction) $($rule.Action)"
    Test-Item 'the rule is for private networks only' ("$($rule.Profile)" -eq 'Private') "$($rule.Profile)"
    Test-Item "the rule opens only TCP $Port" ("$($pf.Protocol)" -eq 'TCP' -and "$($pf.LocalPort)" -eq "$Port") "$($pf.Protocol) $($pf.LocalPort)"
  }
  $rules = @(Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'Popcorn Pilot*' })
  Test-Item 'exactly one Popcorn Pilot firewall rule' ($rules.Count -eq 1) "$($rules.Count)"
  foreach ($f in @('app\package.json', 'node\node.exe', 'data\popcorn.db', 'data\master.key', 'hub.json', 'install.json')) {
    Test-Item "installed: $f" (Test-Path (Join-Path $Root $f))
  }
  $acl = (Get-Acl (Join-Path $Root 'data\master.key')).Access | ForEach-Object { $_.IdentityReference.Value }
  Test-Item 'the key: no access for ordinary users' (-not ($acl -match 'Users|Everyone')) ($acl -join ', ')
} else {
  Test-Item 'the task is gone' ($null -eq $task)
  Test-Item 'the firewall rule is gone' ($null -eq $rule)
  $rules = @(Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'Popcorn Pilot*' })
  Test-Item 'no Popcorn Pilot firewall rule at all' ($rules.Count -eq 0) "$($rules.Count)"
  Test-Item "nothing listens on port $Port" ($listen.Count -eq 0) "$($listen.Count)"
  Test-Item 'no hub process' ($hubProcs.Count -eq 0) "$($hubProcs.Count)"
  if ($Stage -eq 'KeptData') {
    $left = @(Get-ChildItem -Force $Root -ErrorAction SilentlyContinue | ForEach-Object { $_.Name })
    Test-Item 'only the data folder is left' (($left -join ',') -eq 'data') ($left -join ',')
    Test-Item 'the data is kept (database and key)' ((Test-Path (Join-Path $Root 'data\popcorn.db')) -and (Test-Path (Join-Path $Root 'data\master.key')))
  } else {
    Test-Item 'the install folder is gone' (-not (Test-Path $Root))
  }
}

if ($script:failed) {
  Write-Information "windows check ($Stage): $($script:failed) failed" -InformationAction Continue
  exit 1
}
Write-Information "windows check ($Stage): all passed" -InformationAction Continue
