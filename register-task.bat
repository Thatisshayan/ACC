@echo off
REM Register ACC as a Task Scheduler task (no admin needed for ONLOGON)
schtasks /delete /tn "ACC-AutoStart" /f 2>nul
schtasks /create /tn "ACC-AutoStart" /tr "wscript.exe" /sc ONLOGON /f
REM Now update the task to pass arguments via a different method
powershell -Command "$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument '\"C:\Users\Shaya\agent-command-center\autostart-acc.vbs\"'; $trigger = New-ScheduledTaskTrigger -AtLogOn; $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew; Register-ScheduledTask -TaskName 'ACC-AutoStart' -Action $action -Trigger $trigger -Settings $settings -Force" 2>&1
echo Task registered.
