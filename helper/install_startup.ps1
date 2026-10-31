$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$vbsPath = Join-Path $scriptDir 'start_helper_hidden.vbs'
$startupFolder = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupFolder 'SocialDL Helper.lnk'

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($shortcutPath)
$Shortcut.TargetPath = 'wscript.exe'
$Shortcut.Arguments = "\"$vbsPath\""
$Shortcut.WorkingDirectory = $repoRoot
$Shortcut.WindowStyle = 7
$Shortcut.IconLocation = 'C:\Windows\System32\SHELL32.dll, 13'
$Shortcut.Save()

Write-Host "Startup shortcut created: $shortcutPath"
Write-Host "This will launch helper.py automatically at Windows login."
