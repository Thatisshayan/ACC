@echo off
cd /d C:\Users\Shaya\agent-command-center
C:\Users\Shaya\AppData\Roaming\npm\pm2.cmd kill >nul 2>&1
timeout /t 2 /nobreak >nul
C:\Users\Shaya\AppData\Roaming\npm\pm2.cmd start pm2.config.js
C:\Users\Shaya\AppData\Roaming\npm\pm2.cmd save
echo ACC started %date% %time% >> C:\Users\Shaya\agent-command-center\data\startup.log
