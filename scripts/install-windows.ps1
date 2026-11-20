<#
.SYNOPSIS
  Popcorn Pilot hub install for a Windows PC (PP7). Guide: docs/install-windows.md.

.DESCRIPTION
  Run once in PowerShell as administrator (safe to run again: it keeps what is already there). It sets up, and
  changes nothing else on the PC:
    - the app and data folders under C:\ProgramData\PopcornPilot (only administrators and the hub can open them)
    - its own copy of Node 20 in that folder (and of Git, when Git is not installed), not a system-wide install
    - the app, built, with its database (migrations) and the secret store key
    - a scheduled task "Popcorn Pilot" that starts the hub when Windows starts, before anyone signs in, and every
      5 minutes starts it again if it is not running; the hub runs as the built-in Local Service account
    - inside the hub: the nightly backup (3:00 AM) and the updater (4:00 AM and Check for updates now)
    - one firewall rule: the app's port, private networks only
  No power, sleep, network or DNS setting is changed. Ad blocking is not installed on Windows.

  Uninstall: scripts\uninstall-windows.ps1 (keeps the data folder unless -RemoveData).

.PARAMETER Port
  The app's port (default 8765). Phones open http://<this PC's address>:<port>.

.PARAMETER TestMode
  For CI: installs under -Root with the task and firewall rule named "Popcorn Pilot (test)", copies Node from
  -NodeDir instead of downloading it, and clones -RepoUrl (a local checkout) at -Branch.

.PARAMETER DryRun
  Print every step without changing anything.

.EXAMPLE
  & ([scriptblock]::Create((Invoke-RestMethod https://raw.githubusercontent.com/jsbishop14-art/popcorn-pilot/main/scripts/install-windows.ps1)))
#>
[CmdletBinding()]
param(
  [string]$Root = (Join-Path $env:ProgramData 'PopcornPilot'),
  [ValidateRange(1024, 65535)][int]$Port = 8765,
  [string]$RepoUrl = 'https://github.com/jsbishop14-art/popcorn-pilot.git',
  [string]$Branch = 'main',
  [string]$NodeDir = '',
  [switch]$TestMode,
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$TaskName = 'Popcorn Pilot'
$RuleName = 'PopcornPilot-App'
$RuleDisplay = 'Popcorn Pilot'
if ($TestMode) {
  $TaskName = 'Popcorn Pilot (test)'
  $RuleName = 'PopcornPilot-App-Test'
  $RuleDisplay = 'Popcorn Pilot (test)'
}
$AppDir = Join-Path $Root 'app'
$DataDir = Join-Path $Root 'data'
$NodeHome = Join-Path $Root 'node'
$GitHome = Join-Path $Root 'git'
$LogDir = Join-Path $Root 'logs'
$NpmCache = Join-Path $Root 'npm-cache'
$KeyFile = Join-Path $DataDir 'master.key'
$ConfigFile = Join-Path $Root 'hub.json'
$RecordFile = Join-Path $Root 'install.json'
$LocalService = 'S-1-5-19'
$Utf8 = New-Object System.Text.UTF8Encoding $false

function Write-Step([string]$Text) {
  Write-Information "`n== $Text" -InformationAction Continue
}

function Write-Note([string]$Text) {
  Write-Information "  $Text" -InformationAction Continue
}

# Run a program; stop the install when it fails. In a dry run, only print it.
function Invoke-Native([string]$File, [string[]]$Arguments) {
  if ($DryRun) {
    Write-Note "[dry run] $File $($Arguments -join ' ')"
    return
  }
  # Warnings a program writes to its error output (npm does) are not failures; its exit code decides.
  $ErrorActionPreference = 'Continue'
  & $File @Arguments
  $code = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($code -ne 0) {
    throw "$File $($Arguments -join ' ') failed (exit $code)"
  }
}

# Run a change; in a dry run, print what it would do.
function Invoke-Change([string]$What, [scriptblock]$Action) {
  if ($DryRun) {
    Write-Note "[dry run] $What"
    return
  }
  & $Action
}

function Write-TextFile([string]$Path, [string]$Text) {
  Invoke-Change "write $Path" { [IO.File]::WriteAllText($Path, $Text, $Utf8) }
}

function Get-FileFromWeb([string]$Url, [string]$OutFile) {
  Invoke-WebRequest -Uri $Url -OutFile $OutFile -UseBasicParsing
}

# Ends any hub process still running from this folder (the task's Node and the app it started).
function Stop-HubProcess {
  [CmdletBinding(SupportsShouldProcess)]
  param()
  $procs = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($AppDir) })
  foreach ($p in $procs) {
    if ($PSCmdlet.ShouldProcess("node.exe $($p.ProcessId)", 'Stop')) {
      Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    }
  }
}

Write-Step 'Checking this is a 64-bit Windows PC, run as administrator'
if (-not [Environment]::Is64BitOperatingSystem) {
  throw 'This needs 64-bit Windows.'
}
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin -and -not $DryRun) {
  throw 'Open PowerShell with "Run as administrator" and run the install again.'
}
$nodeArch = 'x64'
if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') {
  $nodeArch = 'arm64'
}
Write-Note "Windows $([Environment]::OSVersion.Version), $nodeArch, app folder $Root, port $Port"

Write-Step 'Creating the app and data folders'
foreach ($dir in @($Root, $DataDir, (Join-Path $DataDir 'backups'), $LogDir, $NpmCache)) {
  if (-not (Test-Path $dir)) {
    Invoke-Change "create $dir" { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  }
}
# Only SYSTEM, administrators and the hub (Local Service) can open the folder: it holds the database and the key.
Invoke-Native 'icacls.exe' @($Root, '/inheritance:r', '/grant:r', '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F', "*${LocalService}:(OI)(CI)M", '/Q')

Write-Step 'Getting Node 20 (a copy for the hub only, in the app folder)'
$nodeExe = Join-Path $NodeHome 'node.exe'
$haveNode = $false
if (Test-Path $nodeExe) {
  $haveNode = ((& $nodeExe -v) -match '^v20\.')
}
if ($haveNode) {
  Write-Note "Node $(& $nodeExe -v) is already in $NodeHome"
} elseif ($NodeDir) {
  Invoke-Change "copy Node from $NodeDir to $NodeHome" {
    if (Test-Path $NodeHome) { Remove-Item -Recurse -Force $NodeHome }
    Copy-Item -Recurse -Path $NodeDir -Destination $NodeHome
  }
} else {
  $base = 'https://nodejs.org/dist/latest-v20.x'
  Invoke-Change "download Node 20 ($nodeArch) from $base and check it against SHASUMS256.txt" {
    $sums = (Invoke-WebRequest -Uri "$base/SHASUMS256.txt" -UseBasicParsing).Content -split "`n"
    $line = $sums | Where-Object { $_.Trim() -match "\s(node-v20\.[\d.]+-win-$nodeArch\.zip)$" } | Select-Object -First 1
    if (-not $line) { throw "Node 20 for win-$nodeArch was not found at $base" }
    $parts = $line.Trim() -split '\s+'
    $zip = Join-Path $env:TEMP $parts[1]
    Get-FileFromWeb "$base/$($parts[1])" $zip
    $got = (Get-FileHash -Algorithm SHA256 $zip).Hash.ToLower()
    if ($got -ne $parts[0]) { throw "The Node download does not match its checksum ($got)." }
    # Unpacked inside the app folder, so it gets the folder's permissions.
    $unpack = Join-Path $Root 'node-unpack'
    if (Test-Path $unpack) { Remove-Item -Recurse -Force $unpack }
    Expand-Archive -Path $zip -DestinationPath $unpack
    if (Test-Path $NodeHome) { Remove-Item -Recurse -Force $NodeHome }
    Move-Item -Path (Join-Path $unpack ($parts[1] -replace '\.zip$', '')) -Destination $NodeHome
    Remove-Item -Force $zip
    Remove-Item -Recurse -Force $unpack
  }
}
$npm = Join-Path $NodeHome 'npm.cmd'
if (-not $DryRun) {
  $v = & $nodeExe -v
  if ($v -notmatch '^v20\.') { throw "The hub needs Node 20; $nodeExe is $v." }
  Write-Note "Node $v"
}

Write-Step 'Getting Git (used by the updater)'
$gitExe = $null
$systemGit = Get-Command git.exe -ErrorAction SilentlyContinue
if ($systemGit) {
  $gitExe = $systemGit.Source
  Write-Note "Git is installed: $gitExe"
} elseif (Test-Path (Join-Path $GitHome 'cmd\git.exe')) {
  $gitExe = Join-Path $GitHome 'cmd\git.exe'
  Write-Note "Git is already in $GitHome"
} else {
  $gitExe = Join-Path $GitHome 'cmd\git.exe'
  Invoke-Change "download MinGit (portable Git for Windows, latest release) into $GitHome" {
    $rel = Invoke-RestMethod -Uri 'https://api.github.com/repos/git-for-windows/git/releases/latest' -UseBasicParsing
    $asset = $rel.assets | Where-Object { $_.name -match '^MinGit-[\d.]+-64-bit\.zip$' } | Select-Object -First 1
    if (-not $asset) { throw 'MinGit was not found in the latest Git for Windows release.' }
    $zip = Join-Path $env:TEMP $asset.name
    Get-FileFromWeb $asset.browser_download_url $zip
    $digest = $asset.PSObject.Properties['digest']
    if ($digest -and $digest.Value -match '^sha256:([0-9a-f]{64})$') {
      $got = (Get-FileHash -Algorithm SHA256 $zip).Hash.ToLower()
      if ($got -ne $Matches[1]) { throw "The Git download does not match its checksum ($got)." }
    }
    if (Test-Path $GitHome) { Remove-Item -Recurse -Force $GitHome }
    Expand-Archive -Path $zip -DestinationPath $GitHome
    Remove-Item -Force $zip
  }
}

# The install's own commands use this Node and Git, and the hub's folders.
$env:Path = "$NodeHome;$(Split-Path $gitExe);$env:Path"
$env:PP_DATA_DIR = $DataDir
$env:PP_MASTER_KEY_FILE = $KeyFile
$env:PP_HOST = 'windows'
$env:NEXT_TELEMETRY_DISABLED = '1'
$env:npm_config_cache = $NpmCache
$env:npm_config_update_notifier = 'false'
$env:npm_config_fund = 'false'

Write-Step 'Creating the secret store key'
if (Test-Path $KeyFile) {
  Write-Note 'The key exists; keeping it (PINs and secrets depend on it).'
} else {
  Invoke-Change "write $KeyFile (32 random bytes as hex; administrators and the hub only)" {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    [IO.File]::WriteAllText($KeyFile, (($bytes | ForEach-Object { $_.ToString('x2') }) -join ''), $Utf8)
  }
  Invoke-Native 'icacls.exe' @($KeyFile, '/inheritance:r', '/grant:r', '*S-1-5-18:F', '*S-1-5-32-544:F', "*${LocalService}:R", '/Q')
}

Write-Step 'Stopping the hub while it is set up (if it is running)'
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
  Invoke-Change "stop the task $TaskName" { Stop-ScheduledTask -TaskName $TaskName }
}
Invoke-Change 'end any hub process still running from the app folder' { Stop-HubProcess }

Write-Step 'Getting the app'
if (Test-Path (Join-Path $AppDir '.git')) {
  Write-Note "$AppDir already has the app; the updater keeps it current."
} else {
  Invoke-Native $gitExe @('clone', '--quiet', '--branch', $Branch, $RepoUrl, $AppDir)
}

Write-Step 'Installing, building and setting up the database'
Invoke-Change "cd $AppDir" { Push-Location $AppDir }
Invoke-Native $npm @('ci', '--no-audit', '--no-fund')
Invoke-Native $npm @('run', 'build')
Invoke-Native $nodeExe @('scripts/migrate.mjs')

Write-Step 'Writing the hub settings'
$cfg = [ordered]@{
  host     = 'windows'
  port     = $Port
  appDir   = $AppDir
  dataDir  = $DataDir
  keyFile  = $KeyFile
  logDir   = $LogDir
  npmCache = $NpmCache
  git      = $gitExe
  pathDirs = @($NodeHome, (Split-Path $gitExe))
}
Write-TextFile $ConfigFile ($cfg | ConvertTo-Json)

Write-Step "Setting up the task '$TaskName' (starts with Windows, before anyone signs in)"
$account = (New-Object Security.Principal.SecurityIdentifier $LocalService).Translate([Security.Principal.NTAccount]).Value
Invoke-Change "register the task $TaskName as $account" {
  $action = New-ScheduledTaskAction -Execute $nodeExe -Argument "`"$AppDir\scripts\hub-service.mjs`" --config `"$ConfigFile`"" -WorkingDirectory $AppDir
  $atBoot = New-ScheduledTaskTrigger -AtStartup
  # Every 5 minutes: starts the hub again if it is not running (a running hub is left alone).
  $every5 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
  $who = New-ScheduledTaskPrincipal -UserId $account -LogonType ServiceAccount -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($atBoot, $every5) -Principal $who -Settings $settings `
    -Description 'Popcorn Pilot hub: the app, nightly backup and updates. Installed by scripts\install-windows.ps1.' -Force | Out-Null
}

Write-Step "Opening port $Port on private networks only (firewall rule '$RuleDisplay')"
Invoke-Change "add the firewall rule $RuleDisplay (TCP $Port in, private networks)" {
  Get-NetFirewallRule -Name $RuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  New-NetFirewallRule -Name $RuleName -DisplayName $RuleDisplay -Description 'Popcorn Pilot hub app (scripts\install-windows.ps1)' `
    -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Private | Out-Null
}

Write-Step 'Recording what was installed (for the uninstall)'
$record = [ordered]@{
  at       = (Get-Date).ToString('o')
  root     = $Root
  dataDir  = $DataDir
  task     = $TaskName
  rule     = $RuleName
  port     = $Port
  testMode = [bool]$TestMode
}
Write-TextFile $RecordFile ($record | ConvertTo-Json)

Write-Step 'Starting the hub and checking it answers'
Invoke-Change "start the task $TaskName" { Start-ScheduledTask -TaskName $TaskName }
$env:PORT = "$Port"
$env:SMOKE_TIMEOUT = '180'
Invoke-Native $nodeExe @('scripts/smoke.mjs')
Invoke-Change 'cd back' { Pop-Location }

Write-Step 'Done'
$ip = $null
$cfgs = @(Get-NetIPConfiguration -ErrorAction SilentlyContinue | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' })
if ($cfgs.Count -gt 0) {
  $ip = @($cfgs[0].IPv4Address)[0].IPAddress
}
if (-not $ip) {
  $ip = '<this PC''s address>'
}
Write-Note "Open http://${ip}:$Port on a phone or computer on the home Wi-Fi and set the Adult PIN and the Guest PIN."
Write-Note 'Settings > Hub in the app shows this address and a QR code to open it on a phone.'
$public = @(Get-NetConnectionProfile -ErrorAction SilentlyContinue | Where-Object { $_.NetworkCategory -eq 'Public' })
if ($public.Count -gt 0) {
  Write-Note "This PC's network '$($public[0].Name)' is set to Public, so phones cannot reach the hub yet. In Windows Settings >"
  Write-Note 'Network & internet > (Wi-Fi or Ethernet) > your network, set "Network profile type" to Private (docs/install-windows.md step 3).'
}
Write-Note 'While this PC sleeps or is off, kid limits, snap back, schedules and routines pause until it is back (docs/install-windows.md step 5).'
