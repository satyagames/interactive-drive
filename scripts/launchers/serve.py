"""
Pursuit Arena's offline server (Python 3, standard library only).

Serves this folder on 127.0.0.1 -- this computer only, nothing is exposed to
the network -- on a free port, then opens the default browser. Started by the
"Start Pursuit Arena" launchers; close the window to stop it.

Why not `python -m http.server`: on Windows it takes MIME types from the
registry, and a registry that maps .js to text/plain stops the game's
JavaScript modules from loading at all. The types here are fixed.
"""

import functools
import http.server
import os
import socket
import sys
import threading
import webbrowser

TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.wasm': 'application/wasm',
    '.glb': 'model/gltf-binary',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.md': 'text/markdown; charset=utf-8',
}


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **TYPES}

    def log_message(self, *args):
        pass  # keep the window quiet for non-technical users


def main():
    root = os.path.dirname(os.path.abspath(__file__))
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    server = http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Handler, directory=root))
    url = f'http://127.0.0.1:{port}/'
    print(f'Pursuit Arena is running at {url}', flush=True)
    print('Your browser should open in a moment. Close this window to stop.', flush=True)
    if '--no-open' not in sys.argv:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
