@echo off
rem Double-click to play Sniff Sniff. Installs dependencies on first run.
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm install
)
start "" http://localhost:5174
call npm run dev
