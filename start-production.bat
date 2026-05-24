@echo off
REM ACC v2 Production Startup & Monitor
REM This script starts ACC and keeps it alive

:START
echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║         ACC v2 PRODUCTION STARTUP & MONITOR                   ║
echo ║         Time: %date% %time%                          ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.

REM Kill any stale processes
echo [CLEANUP] Killing stale node processes...
taskkill /F /IM node.exe >nul 2>&1

REM Wait a moment
timeout /t 3 /nobreak

REM Kill PM2 daemon
echo [CLEANUP] Stopping PM2 daemon...
C:\Users\Shaya\AppData\Roaming\npm\pm2.cmd kill >nul 2>&1

REM Wait again
timeout /t 2 /nobreak

REM Start fresh PM2
echo [STARTUP] Starting ACC v2 services...
cd /d C:\Users\Shaya\agent-command-center
C:\Users\Shaya\AppData\Roaming\npm\pm2.cmd start pm2.config.js

REM Wait for services to come online
echo [STARTUP] Waiting for services to initialize (10 seconds)...
timeout /t 10 /nobreak

REM Check health
echo [HEALTH] Checking API health...
node test-health.js

REM Monitor loop
:MONITOR
echo.
echo [MONITOR] System running. Checking every 30 seconds. Press Ctrl+C to stop.
echo.
timeout /t 30 /nobreak
node test-health.js
goto MONITOR
