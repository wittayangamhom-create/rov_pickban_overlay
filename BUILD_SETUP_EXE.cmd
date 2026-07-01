@echo off
cd /d "%~dp0"
npm.cmd install
npm.cmd run dist
echo.
echo Done. Check the dist folder.
pause
