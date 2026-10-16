@echo off
rem
rem Double-click launcher for Windows.
rem
rem Starts a local static file server rooted at this script's own folder (so
rem it works no matter where the recipient unzipped it), then opens the
rem portfolio in the default browser. No internet access and no hosting
rem account are involved -- everything happens on 127.0.0.1 (this computer
rem only), on a port picked fresh each run so it never collides with
rem something else already running.
rem
rem This has to be a real local server and not a double-click on index.html
rem directly: the build uses ES module <script> tags and fetch() to load the
rem 3D models and textures, and browsers block both of those from a bare
rem file:// page for security reasons.
rem
rem Written as flat goto/label flow rather than nested `if (...)` blocks on
rem purpose: the port-picking commands below are one-line Python/Node
rem programs that contain their own parentheses (socket calls), and a
rem parenthesised if/for *block* in batch scans for its own closing paren
rem the same way -- nested unescaped parens from an embedded command can
rem close the block early and break the script. Keeping everything at the
rem top level sidesteps that entirely instead of relying on escaping.

cd /d "%~dp0"

echo ======================================
echo   Starting the Driving Portfolio...
echo ======================================
echo.

where python >nul 2>nul
if %ERRORLEVEL%==0 goto :found_python
where python3 >nul 2>nul
if %ERRORLEVEL%==0 goto :found_python3
goto :try_node

:found_python
set "PYTHON_CMD=python"
goto :have_python

:found_python3
set "PYTHON_CMD=python3"
goto :have_python

:have_python
rem Asks the OS for a free TCP port instead of hardcoding one, so this never
rem fails just because something else on the machine is already using it.
for /f "usebackq delims=" %%P in (`%PYTHON_CMD% -c "import socket; s=socket.socket(); s.bind(('127.0.0.1',0)); print(s.getsockname()[1]); s.close()"`) do set "PORT=%%P"
if not defined PORT goto :no_runtime
set "URL=http://127.0.0.1:%PORT%/"
echo Using: %PYTHON_CMD% (comes with Windows, or with the Python installer)
echo Address: %URL%
echo.
echo Your browser should open automatically in a moment.
echo When you're done, close this window to stop the portfolio.
echo.
start "" cmd /c "ping -n 3 127.0.0.1 >nul & start %URL%"
%PYTHON_CMD% -m http.server %PORT% --bind 127.0.0.1
goto :stopped

:try_node
where npx >nul 2>nul
if %ERRORLEVEL%==0 goto :have_node
goto :no_runtime

:have_node
echo python was not found -- falling back to Node.js (npx serve).
for /f "usebackq delims=" %%P in (`node -e "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close();});"`) do set "PORT=%%P"
if not defined PORT goto :no_runtime
set "URL=http://127.0.0.1:%PORT%/"
echo Address: %URL%
echo.
echo Your browser should open automatically in a moment.
echo When you're done, close this window to stop the portfolio.
echo.
start "" cmd /c "ping -n 3 127.0.0.1 >nul & start %URL%"
call npx --yes serve --listen %PORT% .
goto :stopped

:no_runtime
echo ----------------------------------------------------------------
echo   Could not start the portfolio.
echo.
echo   Showing it needs a small local web server, and this PC has
echo   neither Python nor Node.js installed for it to use.
echo.
echo   Installing either one will fix this -- you only need one:
echo     Python:  https://www.python.org/downloads/
echo     Node.js: https://nodejs.org/
echo ----------------------------------------------------------------
echo.
pause
exit /b 1

:stopped
echo.
echo Portfolio stopped.
pause
