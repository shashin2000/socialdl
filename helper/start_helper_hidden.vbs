Set ws = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptPath = WScript.ScriptFullName
repoRoot = fso.GetParentFolderName(fso.GetParentFolderName(scriptPath))
ws.CurrentDirectory = repoRoot

ws.Run "cmd /c python helper\helper.py", 0, False
