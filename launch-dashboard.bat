@echo off
setlocal
set "ROOT=C:\Users\Shaya\agent-command-center"
set "ELECTRON=%ROOT%\desktop\node_modules\.bin\electron.cmd"

start "" "%ELECTRON%" "%ROOT%\desktop"
exit /b 0
