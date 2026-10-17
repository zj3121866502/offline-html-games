@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Starting Pikafish Bridge Server...
echo Open browser: http://localhost:8080
echo.
echo Press Ctrl+C to stop
echo.
python pikafish-bridge.py 8080
pause
