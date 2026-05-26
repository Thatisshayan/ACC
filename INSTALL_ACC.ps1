#Requires -Version 5.1
<#
.SYNOPSIS
  ACC v2 — Agent Command Center  |  Full Windows Installer
  Run this once and everything is wired up, built, and ready.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File INSTALL_ACC.ps1
#>

$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'ACC v2 Installer'

# ── Colours ───────────────────────────────────────────────────────────────────
function Write-Step  { param($m) Write-Host "`n  ◆ $m" -ForegroundColor Cyan }
function Write-OK    { param($m) Write-Host "    ✓ $m" -ForegroundColor Green }
function Write-Warn  { param($m) Write-Host "    ⚠ $m" -ForegroundColor Yellow }
function Write-Fail  { param($m) Write-Host "    ✗ $m" -ForegroundColor Red }
function Write-Info  { param($m) Write-Host "    · $m" -ForegroundColor Gray }

# ── Banner ────────────────────────────────────────────────────────────────────
Clear-Host
Write-Host ""
Write-Host "  ╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "  ║                                                           ║" -ForegroundColor Green
Write-Host "  ║   ▄▄   ▄▄▄▄▄▄ ▄▄▄▄▄▄▄                                  ║" -ForegroundColor Green
Write-Host "  ║   ██   ██      ██                                        ║" -ForegroundColor Green
Write-Host "  ║   ██▄▄▄██      ██                                        ║" -ForegroundColor Green
Write-Host "  ║   ██   ██      ██                                        ║" -ForegroundColor Green
Write-Host "  ║   ██   ██████▀ ██                                        ║" -ForegroundColor Green
Write-Host "  ║                                                           ║" -ForegroundColor Green
Write-Host "  ║       AGENT COMMAND CENTER  v2  —  INSTALLER             ║" -ForegroundColor White
Write-Host "  ║       AI Operating System for Execution                  ║" -ForegroundColor Gray
Write-Host "  ║                                                           ║" -ForegroundColor Green
Write-Host "  ╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

# ── Paths ─────────────────────────────────────────────────────────────────────
$ROOT    = Split-Path -Parent $PSCommandPath
$UI_DIR  = Join-Path $ROOT 'ui'
$PUB_DIR = Join-Path $UI_DIR 'public'
$ENV_FILE = Join-Path $ROOT '.env'
$DATA_DIR = Join-Path $ROOT 'data'

Write-Info "Install root: $ROOT"
Set-Location $ROOT

# ── Step 1: Node.js ───────────────────────────────────────────────────────────
Write-Step "Checking Node.js"
try {
  $nodeVer = (node --version 2>&1).Trim()
  $major   = [int]($nodeVer -replace 'v(\d+).*','$1')
  if ($major -lt 18) {
    Write-Warn "Node $nodeVer found — ACC requires Node 18+."
    Write-Info "Download: https://nodejs.org/en/download"
    $cont = Read-Host "    Continue anyway? [y/N]"
    if ($cont -ne 'y') { exit 1 }
  } else {
    Write-OK "Node $nodeVer"
  }
} catch {
  Write-Fail "Node.js not found."
  Write-Info "Install from https://nodejs.org/en/download then re-run this script."
  pause; exit 1
}

# ── Step 2: .env file ─────────────────────────────────────────────────────────
Write-Step "Environment (.env)"
if (Test-Path $ENV_FILE) {
  Write-OK ".env exists"
} else {
  Write-Warn ".env not found — creating template"
  $template = @'
# ACC v2 — Environment Variables
PORT=4000

# ── Security ────────────────────────────────────────────────────
ACC_VAULT_MASTER_KEY=change_me_strong_random_key
ACC_APPROVAL_HMAC_SECRET=change_me_strong_random_secret

# ── Telegram ─────────────────────────────────────────────────────
TELEGRAM_BOT_TOKEN=
SHAYAN_TELEGRAM_CHAT_ID=
ACC_INSTANCE_ID=main

# ── AI Keys ──────────────────────────────────────────────────────
CLAUDE_API_KEY=
OPENAI_API_KEY=
DEEPSEEK_API_KEY=
GEMINI_API_KEY=
SERPER_API_KEY=

# ── Deployment ───────────────────────────────────────────────────
NODE_ENV=development
CORS_ALLOWED_ORIGINS=http://localhost:5173
'@
  Set-Content -Path $ENV_FILE -Value $template -Encoding utf8
  Write-OK ".env template created — edit it with your keys before running."
}

# ── Step 3: Brand assets ──────────────────────────────────────────────────────
Write-Step "Brand assets (logo + banner)"
New-Item -ItemType Directory -Path $PUB_DIR -Force | Out-Null

$logoPath  = Join-Path $PUB_DIR 'acc-logo.png'
$bannerPath = Join-Path $PUB_DIR 'acc-banner.png'
$hasPNG    = (Test-Path $logoPath) -and (Test-Path $bannerPath)

if ($hasPNG) {
  Write-OK "acc-logo.png and acc-banner.png already in public/"
} else {
  Write-Info "To use your brand images, place them in:"
  Write-Info "  $PUB_DIR\acc-logo.png"
  Write-Info "  $PUB_DIR\acc-banner.png"
  Write-Info "(SVG fallbacks are already there — the dashboard works without them)"

  # Try to find user-saved images on desktop/downloads
  $desktopPngs = @(
    "$env:USERPROFILE\Desktop\acc-logo.png",
    "$env:USERPROFILE\Desktop\acc-banner.png",
    "$env:USERPROFILE\Downloads\acc-logo.png",
    "$env:USERPROFILE\Downloads\acc-banner.png"
  )
  foreach ($p in $desktopPngs) {
    if (Test-Path $p) {
      $dest = Join-Path $PUB_DIR (Split-Path $p -Leaf)
      Copy-Item $p $dest -Force
      Write-OK "Auto-copied $(Split-Path $p -Leaf) from $(Split-Path $p -Parent)"
    }
  }
}

# ── Step 4: npm install (root) ────────────────────────────────────────────────
Write-Step "Installing backend dependencies"
Write-Info "Running npm install in $ROOT ..."
& npm install --prefer-offline 2>&1 | ForEach-Object {
  if ($_ -match 'added|updated') { Write-OK $_ }
  elseif ($_ -match 'warn') { Write-Warn $_ }
  elseif ($_ -match 'error') { Write-Fail $_ }
}
Write-OK "Backend dependencies installed"

# ── Step 5: npm install (ui) ──────────────────────────────────────────────────
Write-Step "Installing UI dependencies"
Write-Info "Running npm install in $UI_DIR ..."
Set-Location $UI_DIR
& npm install --prefer-offline 2>&1 | ForEach-Object {
  if ($_ -match 'added|updated') { Write-OK $_ }
  elseif ($_ -match 'warn') { Write-Warn $_ }
  elseif ($_ -match 'error') { Write-Fail $_ }
}
Set-Location $ROOT
Write-OK "UI dependencies installed"

# ── Step 6: Build UI ──────────────────────────────────────────────────────────
Write-Step "Building production UI"
Set-Location $UI_DIR
try {
  & npm run build 2>&1 | ForEach-Object { Write-Info $_ }
  Write-OK "UI built to ui/dist/"
} catch {
  Write-Warn "UI build had warnings (non-fatal): $_"
}
Set-Location $ROOT

# ── Step 7: Data directories ──────────────────────────────────────────────────
Write-Step "Creating data directories"
$dirs = @('data','data/logs','data/taskbus','data/users','data/messages','data/uploads')
foreach ($d in $dirs) {
  New-Item -ItemType Directory -Path (Join-Path $ROOT $d) -Force | Out-Null
}
Write-OK "Data dirs ready"

# ── Step 8: Desktop shortcut ──────────────────────────────────────────────────
Write-Step "Creating shortcuts"
$WshShell = New-Object -ComObject WScript.Shell
$desktop  = [System.Environment]::GetFolderPath('Desktop')

# Start shortcut
$lnk = $WshShell.CreateShortcut("$desktop\ACC Dashboard.lnk")
$lnk.TargetPath   = 'powershell.exe'
$lnk.Arguments    = "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ROOT\scripts\windows\start-acc.ps1`""
$lnk.WorkingDirectory = $ROOT
$lnk.Description  = 'Agent Command Center v2'
$lnk.WindowStyle  = 7   # minimized
$iconPath = Join-Path $PUB_DIR 'acc-logo.ico'
if (Test-Path $iconPath) { $lnk.IconLocation = $iconPath }
$lnk.Save()
Write-OK "Desktop shortcut: 'ACC Dashboard'"

# Open dashboard shortcut
$lnk2 = $WshShell.CreateShortcut("$desktop\ACC Web UI.lnk")
$lnk2.TargetPath = 'cmd.exe'
$lnk2.Arguments  = "/c start http://localhost:5173"
$lnk2.Description = 'Open ACC Dashboard in browser'
$lnk2.Save()
Write-OK "Desktop shortcut: 'ACC Web UI'"

# ── Step 9: Quick-start batch ─────────────────────────────────────────────────
Write-Step "Writing START_DASHBOARD.bat"
$bat = @"
@echo off
title ACC v2 — Agent Command Center
color 0A
echo.
echo  ╔══════════════════════════════════════╗
echo  ║   ACC v2  —  Starting up...          ║
echo  ╚══════════════════════════════════════╝
echo.

cd /d "$ROOT"
echo [1/3] Starting backend...
start "ACC Backend" /min cmd /c "node scripts/start.js"

timeout /t 3 /nobreak >nul

echo [2/3] Starting UI dev server...
start "ACC UI" /min cmd /c "cd ui && npm run dev"

timeout /t 3 /nobreak >nul

echo [3/3] Opening browser...
start http://localhost:5173

echo.
echo  ✓ ACC is running!
echo    Backend : http://localhost:4000
echo    UI      : http://localhost:5173
echo.
pause
"@
Set-Content -Path (Join-Path $ROOT 'START_DASHBOARD.bat') -Value $bat -Encoding ascii
Write-OK "START_DASHBOARD.bat written"

# ── Step 10: Run tests ────────────────────────────────────────────────────────
Write-Step "Smoke-testing installation"
try {
  $health = Invoke-RestMethod 'http://localhost:4000/api/health' -TimeoutSec 3 -ErrorAction Stop
  Write-OK "Backend already running: $($health.status)"
} catch {
  Write-Info "Backend not running yet — start with START_DASHBOARD.bat"
}

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "  ║                                                           ║" -ForegroundColor Green
Write-Host "  ║   ✓  INSTALLATION COMPLETE                                ║" -ForegroundColor Green
Write-Host "  ║                                                           ║" -ForegroundColor Green
Write-Host "  ║   How to start:                                           ║" -ForegroundColor White
Write-Host "  ║     Double-click  START_DASHBOARD.bat                     ║" -ForegroundColor Cyan
Write-Host "  ║     or Desktop shortcut  'ACC Dashboard'                  ║" -ForegroundColor Cyan
Write-Host "  ║                                                           ║" -ForegroundColor White
Write-Host "  ║   Dashboard:    http://localhost:5173                     ║" -ForegroundColor White
Write-Host "  ║   Backend API:  http://localhost:4000                     ║" -ForegroundColor White
Write-Host "  ║                                                           ║" -ForegroundColor White
Write-Host "  ║   To use brand images, copy your PNG files to:           ║" -ForegroundColor Gray
Write-Host "  ║     ui\public\acc-logo.png                                ║" -ForegroundColor Gray
Write-Host "  ║     ui\public\acc-banner.png                              ║" -ForegroundColor Gray
Write-Host "  ║   then restart the dev server.                           ║" -ForegroundColor Gray
Write-Host "  ║                                                           ║" -ForegroundColor Green
Write-Host "  ╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
pause
