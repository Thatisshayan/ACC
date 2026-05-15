@echo off
title ACC v2 — Agent Command Center
color 0A

set ROOT=C:\Users\Shaya\agent-command-center
set PM2=C:\Users\Shaya\AppData\Roaming\npm\pm2.cmd
set ELECTRON=%ROOT%\desktop\node_modules\.bin\electron.cmd

echo Ensuring backend services...
%PM2% restart acc-server >nul 2>&1 || %PM2% start %ROOT%\pm2.config.js >nul 2>&1
%PM2% restart acc-bot    >nul 2>&1

timeout /t 2 /nobreak >nul

echo Launching ACC v2 desktop app...
start "" "%ELECTRON%" "%ROOT%\desktop"
