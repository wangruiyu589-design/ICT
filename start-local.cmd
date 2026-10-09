@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.12+ is required. Install Node.js and try again.
  pause
  exit /b 1
)
if not exist "node_modules\vite\bin\vite.js" (
  call npm install --cache ".\work\npm-cache" --no-audit --no-fund
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo LANSHU local dashboard: http://127.0.0.1:5173/
echo Keep this terminal open. Press Ctrl+C to stop.
call npm run dev
if errorlevel 1 pause
