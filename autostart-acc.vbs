' autostart-acc.vbs — runs start-acc.bat silently on login
' Does NOT kill PM2 first — just calls the smart bat that checks if already running
Set oWS = WScript.CreateObject("WScript.Shell")
oWS.Run "cmd /c C:\Users\Shaya\agent-command-center\start-acc.bat", 0, True

' Ensure startup shortcut points here
Dim sStartup
sStartup = oWS.SpecialFolders("Startup")
Dim sLink : sLink = sStartup & "\ACC-AutoStart.lnk"

' Only recreate if missing
Dim oFSO : Set oFSO = CreateObject("Scripting.FileSystemObject")
If Not oFSO.FileExists(sLink) Then
  Set oLink = oWS.CreateShortcut(sLink)
  oLink.TargetPath = "wscript.exe"
  oLink.Arguments = "//nologo """ & WScript.ScriptFullName & """"
  oLink.WorkingDirectory = "C:\Users\Shaya\agent-command-center"
  oLink.WindowStyle = 7
  oLink.Description = "ACC v2 Silent Auto-Start"
  oLink.Save
End If
