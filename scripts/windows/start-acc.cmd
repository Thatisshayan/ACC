@echo off
setlocal

set "REPO=C:\Users\Shaya\agent-command-center"
set "LOGDIR=%REPO%\data\logs"

if not exist "%LOGDIR%" mkdir "%LOGDIR%"

echo [%DATE% %TIME%] Launcher invoked.>>"%LOGDIR%\acc-launcher.log"

powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%REPO%\scripts\windows\start-acc.ps1"

echo [%DATE% %TIME%] Launcher completed.>>"%LOGDIR%\acc-launcher.log"

endlocal
