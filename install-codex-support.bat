@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-codex-support.ps1"
exit /b %errorlevel%
