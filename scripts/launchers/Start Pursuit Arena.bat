@echo off
rem Double-click launcher for Windows.
rem
rem Starts a small server for this folder on 127.0.0.1 (this computer only;
rem nothing is downloaded and nothing is exposed to the network) and opens
rem Pursuit Arena in the default browser. The game can't be opened by
rem double-clicking index.html: browsers block its JavaScript modules and 3D
rem files on a bare file:// page.
rem
rem It needs Python 3 or Node.js. Each is *tried*, not just looked for:
rem Windows ships a "python" that only opens the Microsoft Store, so finding
rem the command proves nothing. The servers are this folder's own serve.py /
rem serve.mjs (fixed MIME types, no packages needed).
rem
rem Flat goto flow on purpose: parenthesised if-blocks in batch break on
rem embedded parentheses.

cd /d "%~dp0"
title Pursuit Arena
echo ======================================
echo   Starting Pursuit Arena...
echo ======================================
echo.

python -c "import sys; sys.exit(0 if sys.version_info[0] == 3 else 1)" >nul 2>nul
if %ERRORLEVEL%==0 goto :python
py -3 -c "import sys" >nul 2>nul
if %ERRORLEVEL%==0 goto :pylauncher
node -e "process.exit(0)" >nul 2>nul
if %ERRORLEVEL%==0 goto :node
goto :no_runtime

:python
python serve.py
goto :stopped

:pylauncher
py -3 serve.py
goto :stopped

:node
node serve.mjs
goto :stopped

:no_runtime
echo ----------------------------------------------------------------
echo   Could not start Pursuit Arena.
echo.
echo   It needs a small local web server, and this PC has neither
echo   Python 3 nor Node.js installed for it to use.
echo.
echo   Installing either one fixes this -- you only need one:
echo     Python:  https://www.python.org/downloads/
echo     Node.js: https://nodejs.org/
echo ----------------------------------------------------------------
echo.
pause
exit /b 1

:stopped
echo.
echo Pursuit Arena has stopped. You can close this window.
pause
