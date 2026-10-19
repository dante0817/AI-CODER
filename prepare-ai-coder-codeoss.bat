@echo off
setlocal
cd /d "%~dp0"
echo ==========================================================
echo  AI-CODER Code-OSS Developer Setup / Launch
echo ==========================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0prepare-ai-coder-codeoss.ps1" %*
set ERR=%ERRORLEVEL%
if not "%ERR%"=="0" (
  echo.
  echo Setup failed. Review the diagnostic output above.
  echo You can rerun this file after correcting the prerequisite.
  pause
)
exit /b %ERR%
