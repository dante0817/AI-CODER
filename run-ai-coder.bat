@echo off
setlocal
cd /d "%~dp0"
echo AI-CODER legacy/reference Tkinter UI.
echo For the target Code-OSS GUI, first use prepare-ai-coder-codeoss.bat, then run-ai-coder-codeoss.bat.
echo.
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 -m ai_coder
  exit /b %errorlevel%
)
where python >nul 2>nul
if %errorlevel%==0 (
  python -m ai_coder
  exit /b %errorlevel%
)
echo Python 3 was not found. Install Python 3.11+ and ensure it is on PATH.
pause
