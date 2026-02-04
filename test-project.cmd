@echo off
setlocal EnableExtensions

:: -------------------------------
:: Auto Elevate To Admin
:: -------------------------------
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator rights...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

title GR Command Hub - TEST RUN (PowerShell npm start)

cd /d "%~dp0"

echo ================================
echo  GR Command Hub TEST RUN
echo  Using PowerShell npm start
echo ================================
echo.

set TEST_MODE=1
set LOGFILE=%CD%\test-run.log

echo Logging to %LOGFILE%
echo. > "%LOGFILE%"

powershell -NoProfile -ExecutionPolicy Bypass -Command "npm start" >> "%LOGFILE%" 2>&1

if errorlevel 1 (
    echo.
    echo TEST FAILED
    echo Check log:
    echo %LOGFILE%
    echo.
    pause
    exit /b 1
)

echo.
echo TEST SUCCESS
echo Log saved to:
echo %LOGFILE%
echo.
pause
endlocal