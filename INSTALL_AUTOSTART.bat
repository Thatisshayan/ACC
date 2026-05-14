@echo off
REM Run as Administrator ONCE to make ACC start on Windows login
echo Installing ACC v2 Windows auto-start...

schtasks /create /tn "ACC-v2-AutoStart" ^
  /tr "C:\Users\Shaya\agent-command-center\START_ACC.bat" ^
  /sc onlogon ^
  /ru "%USERNAME%" ^
  /delay 0001:30 ^
  /f

echo.
echo Done! ACC v2 starts automatically on login.
echo To remove: schtasks /delete /tn "ACC-v2-AutoStart" /f
pause
