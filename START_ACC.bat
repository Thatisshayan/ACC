@echo off
title ACC v2 — Agent Command Center
color 0A

set ROOT=C:\Users\Shaya\agent-command-center
set PM2=C:\Users\Shaya\AppData\Roaming\npm\pm2.cmd
set ELECTRON=%ROOT%\desktop\node_modules\.bin\electron.cmd

echo.
echo  ============================================
echo   ACC v2 — Agent Command Center
echo  ============================================
echo.

REM Ensure backend is running via PM2
echo [1/2] Starting backend services (PM2)...
%PM2% restart acc-server >nul 2>&1 || %PM2% start %ROOT%\pm2.config.js >nul 2>&1
%PM2% restart acc-bot    >nul 2>&1

echo [2/2] Launching desktop app...
timeout /t 2 /nobreak >nul

start "" "%ELECTRON%" "%ROOT%\desktop"
echo.
echo  ACC v2 is running.
echo  Server:  http://localhost:4000/api/health
echo  Bot:     @OurAccbot
echo.
