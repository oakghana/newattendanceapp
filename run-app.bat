@echo off
REM ============================================================================
REM Loan Administration App - Development Run Script (Windows)
REM 
REM This script runs the application in development mode.
REM - Does NOT alter any database tables
REM - Does NOT modify auth/login tables  
REM - Does NOT run migrations
REM - Starts the dev server on http://localhost:3000
REM ============================================================================

echo.
echo ==========================================
echo Loan Administration App - Starting...
echo ==========================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo Error during npm install
        exit /b 1
    )
    echo.
)

REM Check if .env.local exists
if not exist ".env.local" (
    if not exist ".env.development.local" (
        echo WARNING: No .env.local or .env.development.local file found
        echo Make sure you have configured your environment variables
        echo.
    )
)

echo Prerequisites checked
echo.
echo Starting development server...
echo The app will be available at: http://localhost:3000
echo.
echo Press Ctrl+C to stop the server
echo ==========================================
echo.

REM Start the development server
call npm run dev

if errorlevel 1 (
    echo.
    echo Error occurred during app startup
    exit /b 1
)

