Set oWS = WScript.CreateObject("WScript.Shell")
sLinkFile = oWS.SpecialFolders("Startup") & "\ACC-Start.lnk"
Set oLink = oWS.CreateShortcut(sLinkFile)
oLink.TargetPath = "C:\Users\Shaya\agent-command-center\start-acc.bat"
oLink.WindowStyle = 7
oLink.Description = "ACC v2 Auto-Start"
oLink.Save
WScript.Echo "Startup shortcut created: " & sLinkFile
