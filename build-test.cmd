@echo off
setlocal
title GR Command Hub - Build (NO SIGNING)

cd /d "%~dp0"

echo ================================
echo  GR Command Hub Build - NO SIGN
echo ================================
echo.

set CSC_IDENTITY_AUTO_DISCOVERY=false
set CSC_LINK=
set CSC_KEY_PASSWORD=

if exist dist (
  rmdir /s /q dist
)

call npm run dist:nosign:installer-with-portable:cmd

if errorlevel 1 (
  echo BUILD FAILED
  pause
  exit /b 1
)

echo BUILD SUCCESS
pause
endlocal
