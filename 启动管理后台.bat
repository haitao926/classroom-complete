@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Please install Node.js 24 or newer, then run this file again.
 pause
 exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0])<24)process.exit(1)"
if errorlevel 1 (
 echo Node.js 24 or newer is required.
 pause
 exit /b 1
)
start "" "http://localhost:3000"
node server.js
pause
