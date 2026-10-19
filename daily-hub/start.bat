@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Daily Hub
if not exist node_modules (
  echo Installing dependencies...
  call npm install --omit=dev
)
node server.js
echo.
pause
