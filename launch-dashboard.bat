@echo off
taskkill /F /IM electron.exe 2>nul
timeout /t 2 /nobreak >nul
start "" "C:\Users\Shaya\agent-command-center\desktop\node_modules\.bin\electron.cmd" "C:\Users\Shaya\agent-command-center\desktop"
echo Dashboard launched!
