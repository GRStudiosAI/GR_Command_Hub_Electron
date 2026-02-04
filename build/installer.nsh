!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "FileFunc.nsh"

Var MODE_MAIN
Var MODE_PORTABLE
Var PORTABLE_DIR
Var MODE_CHOICE
Var DIR_FIELD

; Shortcut options vars
Var OPT_DESKTOP
Var OPT_STARTMENU
Var CHK_DESKTOP
Var CHK_STARTMENU

!define PORTABLE_EXE_SOURCE "${PROJECT_DIR}\build\portable\GR Command Hub Portable.exe"

; ---------------------------
; FIRST PAGE (replaces Welcome)
; ---------------------------
!macro customWelcomePage
  Page custom GR_ModePage_Create GR_ModePage_Leave
!macroend

Function GR_ModePage_Create
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 14u "Choose Install Type"
  Pop $0
  ${NSD_CreateLabel} 0 14u 100% 16u "Select Main Install or Portable (extract-only)."
  Pop $0

  ${NSD_CreateGroupBox} 0 36u 100% 44u "Install Mode"
  Pop $0

  ${NSD_CreateRadioButton} 10u 52u 100% 10u "Main Install (recommended)"
  Pop $MODE_MAIN

  ${NSD_CreateRadioButton} 10u 66u 100% 10u "Portable (extract-only, no uninstall, no install)"
  Pop $MODE_PORTABLE

  ; Default = Main
  ${NSD_Check} $MODE_MAIN

  ${NSD_CreateGroupBox} 0 86u 100% 44u "Portable Extract Folder (only used if Portable is selected)"
  Pop $0

  StrCpy $PORTABLE_DIR "$DESKTOP\GR Command Hub Portable"

  ${NSD_CreateDirRequest} 10u 104u 78% 12u "$PORTABLE_DIR"
  Pop $DIR_FIELD

  ${NSD_CreateBrowseButton} 80% 104u 18% 12u "Browse..."
  Pop $1
  ${NSD_OnClick} $1 GR_BrowsePortableDir

  nsDialogs::Show
FunctionEnd

Function GR_BrowsePortableDir
  nsDialogs::SelectFolderDialog "Select Portable Extract Folder" "$PORTABLE_DIR"
  Pop $2
  ${If} $2 != error
    StrCpy $PORTABLE_DIR "$2"
    ${NSD_SetText} $DIR_FIELD "$PORTABLE_DIR"
  ${EndIf}
FunctionEnd

Function GR_ModePage_Leave
  ${NSD_GetState} $MODE_PORTABLE $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $MODE_CHOICE "portable"
  ${Else}
    StrCpy $MODE_CHOICE "main"
  ${EndIf}

  ; If portable selected: extract portable exe and EXIT installer
  ${If} $MODE_CHOICE == "portable"
    ${NSD_GetText} $DIR_FIELD $PORTABLE_DIR

    IfFileExists "${PORTABLE_EXE_SOURCE}" 0 +2
      Goto +3
    MessageBox MB_ICONSTOP "Portable EXE not found.`r`nBuild Portable first."
    Abort

    CreateDirectory "$PORTABLE_DIR"
    SetOutPath "$PORTABLE_DIR"

    File "/oname=GR Command Hub Portable.exe" "${PORTABLE_EXE_SOURCE}"

    ExecShell "open" "$PORTABLE_DIR"
    MessageBox MB_ICONINFORMATION "Portable extracted to:`r`n$PORTABLE_DIR"
    Quit
  ${EndIf}
FunctionEnd


; ---------------------------
; PAGE AFTER DIRECTORY (Main install only)
; Shows after user chooses install directory, before install starts.
; ---------------------------
!macro customPageAfterChangeDir
  Page custom GR_OptionsPage_Create GR_OptionsPage_Leave
!macroend

Function GR_OptionsPage_Create
  ; Only show options page for MAIN install
  ${If} $MODE_CHOICE == "portable"
    Abort
  ${EndIf}

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 14u "Shortcut Options"
  Pop $0
  ${NSD_CreateLabel} 0 14u 100% 16u "Choose which shortcuts to create."
  Pop $0

  ${NSD_CreateCheckbox} 10u 40u 100% 10u "Create Desktop Shortcut"
  Pop $CHK_DESKTOP
  ${NSD_Check} $CHK_DESKTOP

  ${NSD_CreateCheckbox} 10u 56u 100% 10u "Create Start Menu Shortcut"
  Pop $CHK_STARTMENU
  ${NSD_Check} $CHK_STARTMENU

  nsDialogs::Show
FunctionEnd

Function GR_OptionsPage_Leave
  ${NSD_GetState} $CHK_DESKTOP $OPT_DESKTOP
  ${NSD_GetState} $CHK_STARTMENU $OPT_STARTMENU
FunctionEnd


; ---------------------------
; RUN AFTER FILES ARE INSTALLED (Main install only)
; ---------------------------
!macro customInstall
  ${If} $MODE_CHOICE == "portable"
    Return
  ${EndIf}

  ; Desktop shortcut
  ${If} $OPT_DESKTOP == ${BST_CHECKED}
    CreateShortCut "$DESKTOP\GR Command Hub.lnk" "$INSTDIR\GR Command Hub.exe"
  ${EndIf}

  ; Start Menu shortcut
  ${If} $OPT_STARTMENU == ${BST_CHECKED}
    CreateDirectory "$SMPROGRAMS\GR Command Hub"
    CreateShortCut "$SMPROGRAMS\GR Command Hub\GR Command Hub.lnk" "$INSTDIR\GR Command Hub.exe"
  ${EndIf}
!macroend


; ---------------------------
; FORCE DELETE INSTALL DIR ON UNINSTALL (GUARANTEED)
; ---------------------------
!macro customUnInstall

  ; Safety: only uninstall if our EXE exists there
  IfFileExists "$INSTDIR\GR Command Hub.exe" 0 done

  ; Remove shortcuts
  Delete "$DESKTOP\GR Command Hub.lnk"
  Delete "$SMPROGRAMS\GR Command Hub\GR Command Hub.lnk"
  RMDir  "$SMPROGRAMS\GR Command Hub"

  ; Kill running app to unlock files
  nsExec::Exec 'taskkill /F /IM "GR Command Hub.exe"'
  Sleep 600

  ; Try hard delete now
  RMDir /r "$INSTDIR"
  Sleep 300
  RMDir "$INSTDIR"

  ; If anything still exists, schedule deletion at reboot (guarantees folder removal)
  IfFileExists "$INSTDIR\*.*" 0 done
    Rename /REBOOTOK "$INSTDIR" "$INSTDIR.__delete_on_reboot"

done:
!macroend