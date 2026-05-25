$ErrorActionPreference = 'Stop'

Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSCommandPath))
$logDir = Join-Path $repoRoot 'data/logs'
$runDir = Join-Path $repoRoot 'data/run'
$pidDir = Join-Path $runDir 'pids'
$launcherLog = Join-Path $logDir 'acc-launcher.log'

New-Item -ItemType Directory -Path $logDir -Force | Out-Null
New-Item -ItemType Directory -Path $pidDir -Force | Out-Null

function Write-LauncherLog {
  param([string]$Message)
  $line = '[{0}] {1}' -f (Get-Date).ToString('o'), $Message
  Add-Content -Path $launcherLog -Value $line
}

Write-LauncherLog 'Stop helper invoked.'

function Stop-PidFile {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return }

  try {
    $raw = (Get-Content -Path $Path -Raw).Trim()
    $pid = [int]$raw
    if ($pid -gt 0) {
      Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
      Write-LauncherLog ('Stopped pid {0} from {1}' -f $pid, $Path)
    }
  } catch {
    Write-LauncherLog ('Failed to stop from {0}: {1}' -f $Path, $_.Exception.Message)
  }
}

Stop-PidFile -Path (Join-Path $pidDir 'acc-supervisor.pid')
Stop-PidFile -Path (Join-Path $pidDir 'acc-backend.pid')
Stop-PidFile -Path (Join-Path $pidDir 'acc-bot.pid')

Write-LauncherLog 'Stop helper completed.'
