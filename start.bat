@echo off
chcp 65001 >nul 2>&1
title Port Manager

echo ==========================================
echo   Port Manager - Desktop App
echo ==========================================
echo.

REM Check if Node.js is installed
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if node_modules exists
if not exist "%~dp0node_modules" (
    echo [INFO] Installing dependencies...
    cd /d "%~dp0"
    npm install
    echo.
)

echo [INFO] Starting Port Manager Desktop App...
echo.

REM Start the Electron app
cd /d "%~dp0"
npx electron .

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Failed to start the application
    pause
    exit /b 1
)

pause
