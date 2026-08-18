#!/usr/bin/env python3
"""Serve the lander off this Mac, on the tailnet, for review before deploying.

Every Netlify deploy costs build credits, and reviewing a change by shipping it
to production burns them for nothing — five rounds of "make the hero orange"
should not be five deploys. This serves site/ straight off disk to Daryn's
devices over Tailscale, so a change can be looked at, argued with and fixed
before anything reaches Netlify.

Bound to the tailnet address specifically, not 0.0.0.0: on 0.0.0.0 it would also
be answering on the office LAN, which nobody asked for.

    python3 setup/preview-server.py            # http://<tailnet-ip>:8788

It mirrors production routing, so what you review is what deploys:
  /preview     -> index.html, sandboxed (app.js writes nothing, no pixel)
  /api/lead    -> answers 'partial', i.e. the relay is unreachable, so a
                  local run never opens the conversion gate and never
                  pretends a lead was captured
Nothing here writes to the client's sheet under any path.
"""

import subprocess
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = str(Path(__file__).resolve().parent.parent / "site")
PORT = 8788


def tailnet_ip() -> str:
    try:
        out = subprocess.run(
            ["/Applications/Tailscale.app/Contents/MacOS/Tailscale", "ip", "-4"],
            capture_output=True, text=True, timeout=10,
        )
        ip = out.stdout.strip().splitlines()[0].strip()
        if ip:
            return ip
    except Exception as exc:
        print(f"could not read the tailnet address: {exc}", file=sys.stderr)
    return "127.0.0.1"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(self, fmt, *a):
        print(f"  {self.address_string()} {fmt % a}")

    def do_GET(self):
        # Same rewrite Netlify's _redirects does.
        if urlparse(self.path).path.rstrip("/") == "/preview":
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        self.rfile.read(int(self.headers.get("Content-Length") or 0))
        body = b'{"status":"partial","sheet":"local preview - not written"}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    ip = tailnet_ip()
    print(f"serving {ROOT}")
    print(f"  http://{ip}:{PORT}/          the lander")
    print(f"  http://{ip}:{PORT}/preview   sandboxed")
    print("nothing here reaches Netlify, the sheet, or the pixel.\n")
    ThreadingHTTPServer((ip, PORT), Handler).serve_forever()
