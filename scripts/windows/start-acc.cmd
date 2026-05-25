@echo off
setlocal

set "REPO=C:\Users\Shaya\agent-command-center"
set "LOGDIR=%REPO%\data\logs"

if not exist "%LOGDIR%" mkdir "%LOGDIR%"

echo [%DATE% %TIME%] Launcher invoked.>>"%LOGDIR%\acc-launcher.log"

start "ACC Supervisor" cmd /k "cd /d %REPO% && node scripts\windows\acc-supervisor.js"

echo [%DATE% %TIME%] Launcher completed.>>"%LOGDIR%\acc-launcher.log"

endlocal
