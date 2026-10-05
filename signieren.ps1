# =====================================================================
#  Casting-App signieren (Authenticode)
#  Braucht: ein Code-Signing-Zertifikat (.pfx) und signtool (Windows SDK)
#  Aufruf:  .\signieren.ps1 -Zertifikat C:\pfad\zertifikat.pfx -Passwort "..." -Datei .\Casting-App.exe
#  Mit Microsoft Trusted Signing stattdessen: signtool mit /dlib + /dmdf (siehe Microsoft-Doku)
# =====================================================================
param(
  [Parameter(Mandatory = $true)][string]$Zertifikat,
  [string]$Passwort = "",
  [string]$Datei = ".\Casting-App.exe",
  [string]$Zeitstempel = "http://timestamp.digicert.com"
)
$ErrorActionPreference = "Stop"
$signtool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -match "\\x64\\" } | Sort-Object FullName | Select-Object -Last 1
if (-not $signtool) { throw "signtool.exe nicht gefunden – Windows SDK installieren (Komponente 'Signing Tools')." }
& $signtool.FullName sign /f $Zertifikat /p $Passwort /fd SHA256 /tr $Zeitstempel /td SHA256 /d "Casting-App" $Datei
& $signtool.FullName verify /pa /v $Datei
