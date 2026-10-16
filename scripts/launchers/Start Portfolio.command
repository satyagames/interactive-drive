#!/bin/bash
#
# Double-click launcher for macOS.
#
# Starts a local static file server rooted at this script's own folder (so
# it works no matter where the recipient unzipped it), waits for it to come
# up, then opens the portfolio in the default browser. No internet access
# and no hosting account are involved -- everything happens on
# 127.0.0.1 (this computer only), on a port picked fresh each run so it
# never collides with something else already running.
#
# This has to be a real local server and not a direct file:// double-click
# on index.html: the build uses ES module <script> tags and fetch() to load
# the 3D models and textures, and browsers block both of those from a bare
# file:// page for security reasons.

cd "$(dirname "$0")" || exit 1

echo "======================================"
echo "  Starting the Driving Portfolio..."
echo "======================================"
echo

# Asks the OS for a free TCP port instead of hardcoding one, so this never
# fails just because something else on the machine is already using it.
find_free_port_python() {
  python3 - <<'PYEOF'
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.bind(('127.0.0.1', 0))
print(s.getsockname()[1])
s.close()
PYEOF
}

find_free_port_node() {
  node -e "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close();});"
}

# Opens the browser only once the server actually answers, instead of firing
# blind and racing it -- a cold `python3 -m http.server` start is usually
# instant, but is not guaranteed to be, especially on a slow disk.
open_when_ready() {
  local url="$1"
  for _ in $(seq 1 50); do
    if curl --silent --output /dev/null --max-time 1 "$url"; then
      open "$url"
      return
    fi
    sleep 0.2
  done
  # Didn't confirm readiness inside 10s -- open anyway rather than leaving a
  # non-technical recipient staring at a terminal with nothing happening.
  open "$url"
}

if command -v python3 >/dev/null 2>&1; then
  PORT="$(find_free_port_python)"
  URL="http://127.0.0.1:$PORT/"
  echo "Using: python3 (built in to macOS)"
  echo "Address: $URL"
  echo
  echo "Your browser should open automatically in a moment."
  echo "When you're done, close this window (or press Control+C) to stop the portfolio."
  echo
  open_when_ready "$URL" &
  python3 -m http.server "$PORT" --bind 127.0.0.1
  SERVER_EXIT=$?
elif command -v npx >/dev/null 2>&1; then
  echo "python3 was not found -- falling back to Node.js (npx serve)."
  PORT="$(find_free_port_node)"
  URL="http://127.0.0.1:$PORT/"
  echo "Address: $URL"
  echo
  echo "Your browser should open automatically in a moment."
  echo "When you're done, close this window (or press Control+C) to stop the portfolio."
  echo
  open_when_ready "$URL" &
  npx --yes serve --listen "$PORT" .
  SERVER_EXIT=$?
else
  echo "----------------------------------------------------------------"
  echo "  Could not start the portfolio."
  echo
  echo "  Showing it needs a small local web server, and this Mac has"
  echo "  neither Python nor Node.js installed for it to use."
  echo
  echo "  Installing either one will fix this -- you only need one:"
  echo "    Python:  https://www.python.org/downloads/"
  echo "    Node.js: https://nodejs.org/"
  echo "----------------------------------------------------------------"
  echo
  read -r -p "Press Return to close this window..."
  exit 1
fi

echo
if [ "${SERVER_EXIT:-0}" -ne 0 ]; then
  echo "The server stopped unexpectedly (exit code $SERVER_EXIT)."
else
  echo "Portfolio stopped."
fi
read -r -p "Press Return to close this window..."
