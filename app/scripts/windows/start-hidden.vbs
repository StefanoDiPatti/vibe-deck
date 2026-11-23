Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
tray = fso.BuildPath(here, "tray.ps1")
extra = ""
For Each a In WScript.Arguments
  If LCase(a) = "/panel" Then extra = " -Panel"
Next
CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File """ & tray & """" & extra, 0, False
