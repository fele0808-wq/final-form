param(
  [string]$Root   = 'C:\Users\Laser\Documents\Default Project',
  [string]$Log    = 'C:\Users\Laser\Documents\Default Project\scripts\.file-events.log',
  [string]$Status = 'C:\Users\Laser\Documents\Default Project\scripts\.handoff-status.txt',
  [int]$Interval  = 2   # seconds between scans
)
# Pair-protocol watch (polling engine): live file-change feed + HANDOFF audit.
# Uses mtime polling (not FileSystemWatcher events) because the PowerShell event
# pump is unreliable in background/non-interactive shells. Every few seconds it
# scans the tree, logs Created/Changed/Deleted to $Log, and maintains
# $Status (scripts\.handoff-status.txt):
#   OK    = every tracked change is covered by a HANDOFF.md entry
#   STALE = a tracked file changed and HANDOFF.md hasn't been updated since
# Restart anytime:  powershell -ExecutionPolicy Bypass -File scripts\watch.ps1

$script:Root   = $Root
$script:Log    = $Log
$script:Status = $Status
$script:known  = @{}      # fullPath -> LastWriteTimeUtc ticks
$script:pending = @()     # entries awaiting a HANDOFF.md update
$script:firstScan = $true

# Tracked = files whose changes REQUIRE a HANDOFF.md entry afterwards.
function Test-Tracked([string]$full) {
  if ($full -like '*\.git\*' -or $full -like '*\node_modules\*') { return $false }
  if ($full -eq $script:Log -or $full -eq $script:Status) { return $false }
  if ($full -like '*\.file-events.log' -or $full -like '*\.handoff-status.txt') { return $false }
  if ($full -like '*\scripts\.*') { return $false }
  if ($full -notlike "$($script:Root)\*") { return $false }
  $rel = $full.Substring($script:Root.Length).TrimStart('\')
  if ($rel -eq 'HANDOFF.md') { return $false }
  if ($rel.StartsWith('scripts\') -and $rel -ne 'scripts\planning-tests.js') { return $false }
  if ($rel -like '.vscode\*' -or $rel -like '.opencode\*' -or $rel -like '.idea\*') { return $false }
  return $true
}

function Update-Status {
  $now = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  if ($script:pending.Count -eq 0) {
    Set-Content -LiteralPath $script:Status -Value (
      "HANDOFF STATUS: OK`nEvery tracked change is logged in HANDOFF.md.`nStatus updated: $now") -Encoding UTF8
  } else {
    Set-Content -LiteralPath $script:Status -Value (
      @('HANDOFF STATUS: STALE',
        'Changed but NOT yet covered by a HANDOFF.md entry:',
        '') + @($script:pending) +
      @('', "Status updated: $now",
        'ACTION: append a HANDOFF.md entry (newest first) covering these files.') -join "`n") -Encoding UTF8
  }
}

function Scan {
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  $files = Get-ChildItem -LiteralPath $script:Root -Recurse -File -ErrorAction SilentlyContinue
  $seen = @{}
  foreach ($f in $files) {
    $key = $f.FullName
    if ($key -like '*\.git\*' -or $key -like '*\node_modules\*') { continue }
    if ($key -eq $script:Log -or $key -eq $script:Status) { continue }
    $seen[$key] = $true
    $mt = $f.LastWriteTimeUtc.Ticks
    if ($script:firstScan) {
      $script:known[$key] = $mt
      continue
    }
    if ($script:known.ContainsKey($key)) {
      if ($script:known[$key] -ne $mt) {
        $script:known[$key] = $mt
        Add-Content -LiteralPath $script:Log -Value "$stamp | Changed | $key" -Encoding UTF8
        Track $stamp 'Changed' $key
      }
    } else {
      $script:known[$key] = $mt
      Add-Content -LiteralPath $script:Log -Value "$stamp | Created | $key" -Encoding UTF8
      Track $stamp 'Created' $key
    }
  }
  $script:firstScan = $false
  foreach ($k in @($script:known.Keys)) {
    if (-not $seen.ContainsKey($k)) {
      $script:known.Remove($k)
      Add-Content -LiteralPath $script:Log -Value "$stamp | Deleted | $k" -Encoding UTF8
      Track $stamp 'Deleted' $k
    }
  }
}

function Track([string]$stamp, [string]$change, [string]$full) {
  if ($full -like '*\HANDOFF.md') {
    $script:pending = @()
    Update-Status
    return
  }
  if (Test-Tracked $full) {
    $entry = "$stamp | $change | $full"
    if ($script:pending -notcontains $entry) { $script:pending += $entry }
  }
  Update-Status
}

Write-Output "Watching $Root (polling every ${Interval}s)"
Write-Output "Feed: $Log"
Write-Output "Handoff audit: $Status (OK = current, STALE = HANDOFF entry missing)"
if (Test-Path $Status) { Remove-Item $Status -Force }
Scan                                   # baseline scan: seed known map, no logging
Update-Status                          # initial state: OK
while ($true) {
  Start-Sleep -Seconds $Interval
  try { Scan } catch { Write-Output "scan error: $_" }
}