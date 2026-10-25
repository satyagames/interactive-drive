#!/bin/bash
#
# Double-click launcher for macOS (and Linux, run from a terminal).
#
# Starts a small server for this folder on 127.0.0.1 (this computer only;
# nothing is downloaded and nothing is exposed to the network) and opens
# Pursuit Arena in the default browser. The game can't be opened by
# double-clicking index.html: browsers block its JavaScript modules and 3D
# files on a bare file:// page.
#
# It needs Python 3 or Node.js. Each is *tried*, not just looked for: a fresh
# Mac has a python3 that only offers to install the developer tools. The
# servers are this folder's own serve.py / serve.mjs (fixed MIME types, no
# packages needed).

cd "$(dirname "$0")" || exit 1

echo "======================================"
echo "  Starting Pursuit Arena..."
echo "======================================"
echo

if python3 -c 'import sys' >/dev/null 2>&1; then
  python3 serve.py
elif node -e 'process.exit(0)' >/dev/null 2>&1; then
  node serve.mjs
else
  echo "----------------------------------------------------------------"
  echo "  Could not start Pursuit Arena."
  echo
  echo "  It needs a small local web server, and this Mac has neither"
  echo "  Python 3 nor Node.js installed for it to use."
  echo
  echo "  Installing either one fixes this -- you only need one:"
  echo "    Python:  https://www.python.org/downloads/"
  echo "    Node.js: https://nodejs.org/"
  echo "----------------------------------------------------------------"
  read -r -p "Press Return to close."
  exit 1
fi

echo
echo "Pursuit Arena has stopped. You can close this window."
