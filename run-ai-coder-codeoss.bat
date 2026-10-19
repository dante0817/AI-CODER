@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-ai-coder-codeoss.ps1" %*
set ERR=%ERRORLEVEL%
if not "%ERR%"=="0" (
  echo.
  echo AI-CODER Code-OSS launch failed.
  echo If the developer runtime has not been prepared yet, run prepare-ai-coder-codeoss.bat first.
  pause
)
exit /b %ERR%
