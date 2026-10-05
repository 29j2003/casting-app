; Windows installer of the Casting-App (built by tools/build.py with NSIS).
; Installs for the current user only (no administrator rights), with start menu and desktop shortcut.
; Defines from build.py: VERSION, APP_FOLDER (PyInstaller output), OUTPUT (installer file), ICON.

Unicode true
!include "MUI2.nsh"

Name "Casting-App ${VERSION}"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\Casting-App"
RequestExecutionLevel user
SetCompressor /SOLID lzma
!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Casting-App"

VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1031 "ProductName" "Casting-App"
VIAddVersionKey /LANG=1031 "FileDescription" "Casting-App Installation"
VIAddVersionKey /LANG=1031 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1031 "CompanyName" "29_THE_P4TCH3R"
VIAddVersionKey /LANG=1031 "LegalCopyright" "© 29_THE_P4TCH3R"

!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\Casting-App.exe"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "German"

Section "Casting-App"
  ; a running Casting-App is asked to quit first (the new version would replace it anyway)
  nsExec::Exec 'powershell -NoProfile -Command "try { Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8787/api/beenden -Headers @{Host=''localhost:8787''} -TimeoutSec 2 } catch {}"'
  Sleep 1500
  SetOutPath "$INSTDIR"
  RMDir /r "$INSTDIR\_internal"
  File /r "${APP_FOLDER}\*.*"
  WriteUninstaller "$INSTDIR\Deinstallieren.exe"
  CreateShortcut "$SMPROGRAMS\Casting-App.lnk" "$INSTDIR\Casting-App.exe"
  CreateShortcut "$DESKTOP\Casting-App.lnk" "$INSTDIR\Casting-App.exe"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "Casting-App"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "29_THE_P4TCH3R"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\Casting-App.exe"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" "$\"$INSTDIR\Deinstallieren.exe$\""
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  ; settings, images and log in %APPDATA%\Casting-App and the keyring entries stay
  Delete "$SMPROGRAMS\Casting-App.lnk"
  Delete "$DESKTOP\Casting-App.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTALL_KEY}"
SectionEnd
