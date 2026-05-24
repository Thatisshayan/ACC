@echo off
setlocal enabledelayedexpansion

echo === ACC Health Check ===
timeout /t 5 /nobreak
echo.
echo Testing API health...
curl http://localhost:4000/api/health
echo.
echo.
echo === Outreach CRM Health Check ===
curl -X POST http://localhost:4000/api/taskbus/workflow/outreach-crm/health
echo.
