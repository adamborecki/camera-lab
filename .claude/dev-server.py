# Static file server with caching disabled, so edited ES modules reload.
import http.server
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8124
directory = sys.argv[2] if len(sys.argv) > 2 else "."
handler = lambda *a, **k: NoCache(*a, directory=directory, **k)
http.server.ThreadingHTTPServer(("", port), handler).serve_forever()
