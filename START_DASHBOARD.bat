@echo off
title ACC v2 — Agent Command Center
color 0A
cls

echo.
echo  ==========================================================
echo    ___   ____  ____     ___                          __
echo   / _ | / ___// __/  __/ _ | ____  ____ ___  ___  / /_
echo  / __ |/ /__/ /__ \ /___/ __ |/ _ `/ -_) _ \/ __/ / __/
echo /_/ |_|\___/\___/   /_/_/ |_/\_, /\__/_//_/\__/ /\__/
echo                              /___/              __v2__
echo.
echo  AGENT COMMAND CENTER  —  Starting up...
echo  ==========================================================
echo.

cd /d "%~dp0"

REM Check if backend already running
curl -s --max-time 2 http://localhost:4000/api/health 2>nul | findstr "ok" >nul
if %ERRORLEVEL%==0 (
  echo  [OK] Backend already running on :4000
  goto :openui
)

echo  [1/3] Launching backend...
start "ACC Backend" /min cmd /c "node scripts\start.js >> data\logs\backend.log 2>&1"
timeout /t 4 /nobreak >nul

:openui
REM Check if UI already running
curl -s --max-time 2 http://localhost:5173 >nul 2>&1
if %ERRORLEVEL%==0 (
  echo  [OK] UI already running on :5173
  goto :done
)

echo  [2/3] Launching UI dev server...
start "ACC UI" /min cmd /c "cd ui && npm run dev >> ..\data\logs\ui.log 2>&1"
timeout /t 4 /nobreak >nul

:done
echo  [3/3] Opening dashboard in browser...
start "" http://localhost:5173

echo.
echo  ==========================================================
echo   DASHBOARD  : http://localhost:5173
echo   BACKEND    : http://localhost:4000
echo   LOGS       : data\logs\
echo  ==========================================================
echo.
echo  Press any key to close this window (ACC keeps running)
pause >nul
