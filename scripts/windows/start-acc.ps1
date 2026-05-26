$ErrorActionPreference = 'Stop'

Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSCommandPath))
$logDir = Join-Path $repoRoot 'data/logs'
$launcherLog = Join-Path $logDir 'acc-launcher.log'

New-Item -ItemType Directory -Path $logDir -Force | Out-Null

function Write-LauncherLog {
  param([string]$Message)
  $line = '[{0}] {1}' -f (Get-Date).ToString('o'), $Message
  Add-Content -Path $launcherLog -Value $line
}

Write-LauncherLog 'Launcher invoked.'

try {
  Set-Location $repoRoot
  Start-Process -FilePath 'node.exe' -ArgumentList @('scripts/windows/acc-supervisor.js') -WorkingDirectory $repoRoot -WindowStyle Hidden
  Write-LauncherLog 'Supervisor launch requested (Start-Process hidden).'
} catch {
  Write-LauncherLog ('Failed to launch supervisor: ' + $_.Exception.Message)
  throw
}

Write-LauncherLog 'Launcher completed.'
