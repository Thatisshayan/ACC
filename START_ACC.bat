@echo off
title ACC v2 — Agent Command Center
color 0A
echo.
echo  =====================================================
echo   ACC v2 Starting...
echo  =====================================================

cd /d C:\Users\Shaya\agent-command-center

echo [1/3] Backend server...
start "ACC-Server" /min cmd /k "cd /d C:\Users\Shaya\agent-command-center && node scripts/start.js"
timeout /t 4 /nobreak >nul

echo [2/3] Telegram bot...
start "ACC-Bot" /min cmd /k "cd /d C:\Users\Shaya\agent-command-center && node cloud/telegram/bot.js"
timeout /t 2 /nobreak >nul

echo [3/3] Dashboard UI...
start "ACC-UI" /min cmd /k "cd /d C:\Users\Shaya\agent-command-center\ui && npm run dev"
timeout /t 3 /nobreak >nul

echo.
echo  Backend:    http://localhost:4000/api/health
echo  Dashboard:  http://localhost:5173
echo  Bot:        @OurAccbot
echo.
start "" http://localhost:5173
