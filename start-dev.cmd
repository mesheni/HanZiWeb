@echo off
rem Double-click launcher for start-dev.ps1 (full dev startup).
rem Passes all arguments through, e.g.: start-dev.cmd -NoBrowser
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-dev.ps1" %*
if errorlevel 1 pause
