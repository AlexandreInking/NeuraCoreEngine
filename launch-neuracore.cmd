@echo off
setlocal
cd /d "%~dp0"
cd /d "%~dp0apps\launcher"
call npm.cmd run tauri:dev
if errorlevel 1 pause
