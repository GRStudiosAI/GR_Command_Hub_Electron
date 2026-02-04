@echo off
setlocal
title GR Command Hub - Build (NO SIGNING)

cd /d "%~dp0"

echo ================================
echo  GR Command Hub Build - NO SIGN
echo  Working dir: %CD%
echo ================================
echo.

REM --- Disable Electron Builder auto-signing discovery ---
set CSC_IDENTITY_AUTO_DISCOVERY=false
REM --- Also clear any global signing vars (these override CSC_IDENTITY_AUTO_DISCOVERY) ---
set CSC_LINK=
set CSC_KEY_PASSWORD=

REM --- Optional: clean old output ---
if exist dist (
  echo Cleaning old dist folder...
  rmdir /s /q dist
)

echo.
echo Starting build (portable -> stage -> nsis)...
echo.

call npm run dist:nosign:installer-with-portable:cmd
if errorlevel 1 (
  echo.
  echo  BUILD FAILED
  pause
  exit /b 1
)

echo.
echo  BUILD SUCCESSFUL
echo Output:
echo   dist\
echo.
pause
endlocal