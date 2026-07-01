@echo off
cd /d "%~dp0"
npm.cmd install
npm.cmd run portable
echo.
echo Done. Check the dist folder.
pause
