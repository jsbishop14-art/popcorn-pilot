<#
.SYNOPSIS
  Removes the Popcorn Pilot hub from a Windows PC (PP7). Guide: docs/install-windows.md, "Removing the hub".

.DESCRIPTION
  Run in PowerShell as administrator. Removes everything scripts\install-windows.ps1 added: the scheduled task, the
  firewall rule, the hub's processes, and the app folder (the app, its Node and Git copies, logs, settings). The data
  folder (database, backups, secret store key) is kept unless -RemoveData is given; with -RemoveData nothing is left.

.PARAMETER Root
  The install folder (default C:\ProgramData\PopcornPilot).

.PARAMETER RemoveData
  Also delete the data folder: the database, its backups and the secret store key. This cannot be undone.

.PARAMETER TestMode
  For CI: removes the test task and firewall rule ("Popcorn Pilot (test)").

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File C:\ProgramData\PopcornPilot\app\scripts\uninstall-windows.ps1
#>
[CmdletBinding()]
param(
  [string]$Root = (Join-Path $env:ProgramData 'PopcornPilot'),
  [switch]$RemoveData,
  [switch]$TestMode
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$TaskName = 'Popcorn Pilot'
$RuleName = 'PopcornPilot-App'
if ($TestMode) {
  $TaskName = 'Popcorn Pilot (test)'
  $RuleName = 'PopcornPilot-App-Test'
}
$DataDir = Join-Path $Root 'data'

function Write-Note([string]$Text) {
  Write-Information "  $Text" -InformationAction Continue
}

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Open PowerShell with "Run as administrator" and run the uninstall again.'
}

# The uninstall may be run from the app folder it deletes: work from outside it.
Set-Location $env:SystemRoot

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Note "Removed the task '$TaskName'."
} else {
  Write-Note "No task '$TaskName'."
}

$procs = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($Root) })
foreach ($p in $procs) {
  Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
}
Write-Note "Ended $($procs.Count) hub process(es)."

$rule = Get-NetFirewallRule -Name $RuleName -ErrorAction SilentlyContinue
if ($rule) {
  $rule | Remove-NetFirewallRule
  Write-Note "Removed the firewall rule '$RuleName'."
} else {
  Write-Note "No firewall rule '$RuleName'."
}

if (Test-Path $Root) {
  # A process may take a moment to let go of its files.
  for ($try = 1; $try -le 10; $try++) {
    try {
      if ($RemoveData) {
        Remove-Item -Recurse -Force $Root
      } else {
        Get-ChildItem -Force $Root | Where-Object { $_.FullName -ne $DataDir } | Remove-Item -Recurse -Force
      }
      break
    } catch {
      if ($try -eq 10) { throw }
      Start-Sleep -Seconds 2
    }
  }
  if ($RemoveData) {
    Write-Note "Removed $Root, with the data."
  } elseif (Test-Path $DataDir) {
    Write-Note "Removed the app from $Root. Kept the data in $DataDir (run again with -RemoveData to delete it)."
  } else {
    Write-Note "Removed the app from $Root."
  }
} else {
  Write-Note "No folder $Root."
}
Write-Note 'Done. Nothing else on this PC was changed by the install.'
