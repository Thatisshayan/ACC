@echo off
REM ACC v2 — Smart Start Script
REM Checks if already running, resurrects if possible, starts fresh if needed
cd /d C:\Users\Shaya\agent-command-center

echo Checking ACC status...
curl -s --max-time 3 http://localhost:4000/api/health 2>nul | find "ok" >nul
if %ERRORLEVEL% == 0 (
    echo [OK] ACC already running. Nothing to do.
    C:\Users\Shaya\AppData\Roaming\npm\pm2.cmd list
    goto :done
)

echo [..] ACC not running. Starting...

REM Try resurrect from saved state
C:\Users\Shaya\AppData\Roaming\npm\pm2.cmd resurrect 2>nul
ping -n 4 127.0.0.1 >nul

REM Check after resurrect
curl -s --max-time 3 http://localhost:4000/api/health 2>nul | find "ok" >nul
if %ERRORLEVEL% == 0 (
    echo [OK] ACC resurrected successfully.
    goto :save
)

REM Fresh start
echo [..] Fresh start...
C:\Users\Shaya\AppData\Roaming\npm\pm2.cmd start pm2.config.js

:save
C:\Users\Shaya\AppData\Roaming\npm\pm2.cmd save
echo [OK] State saved.

:done
echo %date% %time% >> C:\Users\Shaya\agent-command-center\data\startup.log
