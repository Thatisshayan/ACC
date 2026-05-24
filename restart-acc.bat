@echo off
cd /d C:\Users\Shaya\agent-command-center
echo === Current PM2 Status ===
call C:\Users\Shaya\AppData\Roaming\npm\pm2.cmd list
echo.
echo === Attempting restart ===
call C:\Users\Shaya\AppData\Roaming\npm\pm2.cmd kill
timeout /t 3 /nobreak
call C:\Users\Shaya\AppData\Roaming\npm\pm2.cmd start pm2.config.js
timeout /t 3 /nobreak
echo.
echo === New PM2 Status ===
call C:\Users\Shaya\AppData\Roaming\npm\pm2.cmd list
