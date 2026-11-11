@echo off
setlocal
cd /d "%~dp0"
title Aarogya Drishti - Office Demo
if exist ".medgemma-venv\Scripts\python.exe" (
  ".medgemma-venv\Scripts\python.exe" open_demo.py %*
) else (
  python open_demo.py %*
)
if errorlevel 1 (
  echo.
  echo The demo could not start. Review the message above.
  pause
)
endlocal
