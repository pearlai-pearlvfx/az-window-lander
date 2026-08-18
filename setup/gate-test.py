#!/usr/bin/env python3
"""Regression test for the conversion gate (CLAUDE.md invariant 3).

A broken gate is invisible from this repo and invisible in the client's sheet —
it only shows up as a Lead count in Ads Manager that is higher than the number
of rows in "Raw Estimate Data", weeks later, after ad spend has been optimised
against it. So it gets a test.

It serves `site/` itself, fakes both write paths so their outcomes can be
switched per scenario, drives the real quiz in a real browser with `fbq` stubbed
out, and asserts on what was tracked.

    /Users/pearlvfx/Desktop/pearl/.venv/bin/python3 setup/gate-test.py

(There is no node on this Mac; that venv is the one with playwright in it.)
"""

import json
import sys
import threading
import time
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

from playwright.sync_api import sync_playwright

ROOT = str(Path(__file__).resolve().parent.parent / "site")
PORT = 8891
BASE = f"http://127.0.0.1:{PORT}"
MODE = {"relay": "ok", "backup": "ok"}


# --------------------------------------------------------------- fake Netlify

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(self, *a):
        pass

    def _send(self, code, body=b"", ctype="application/json"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/__mode":
            q = parse_qs(u.query)
            MODE.update({k: q[k][0] for k in ("relay", "backup") if k in q})
            return self._send(200, json.dumps(MODE).encode())
        return super().do_GET()

    def do_POST(self):
        u = urlparse(self.path)
        self.rfile.read(int(self.headers.get("Content-Length") or 0))

        if u.path == "/api/lead":                    # netlify/functions/lead.mjs
            m = MODE["relay"]
            if m == "hang":
                time.sleep(30)
                return
            if m == "500":
                return self._send(500, b'{"status":"error"}')
            if m == "partial":                       # reached us, sheet write failed
                return self._send(200, b'{"status":"partial","sheet":"failed"}')
            return self._send(200, b'{"status":"ok"}')

        if u.path == "/":                            # hidden Netlify form
            if MODE["backup"] == "404":
                return self._send(404, b"no form")
            return self._send(200, b"ok", "text/html")

        return self._send(404, b"nope")


# ------------------------------------------------------------------ the quiz

# Stub fbq before anything loads. The pixel snippet opens with `if(f.fbq)return;`
# so a pre-existing fbq leaves this recorder in place for the life of the page.
STUB = """
window.__fb = [];
window.fbq = function () { window.__fb.push([].slice.call(arguments)); };
window.fbq.queue = []; window.fbq.loaded = true; window._fbq = window.fbq;
"""


def mode(relay="ok", backup="ok"):
    urllib.request.urlopen(f"{BASE}/__mode?relay={relay}&backup={backup}").read()


def leads(page):
    return [c for c in page.evaluate("window.__fb")
            if c[0] == "track" and c[1] == "Lead"]


def at_step(page, n):
    page.wait_for_function(
        "want => document.getElementById('stepLabel').textContent.trim() === want",
        arg=f"{n} of 7", timeout=10000,
    )


def run_quiz(page):
    """Answer all seven steps and submit. Selectors are scoped to #quizBody:
       the hero CTA is also a .btn-jump and matches first otherwise."""
    page.goto(f"{BASE}/index.html?utm_source=test&fbclid=abc123")
    page.wait_for_selector("#countSlider")

    page.fill("#countSlider", "8")                       # window count (slider)
    page.click("#quizBody .btn-jump"); at_step(page, 2)
    page.click("#quizBody .opt"); at_step(page, 3)       # window age
    page.click("#quizBody .opt")                         # priorities (multi)
    page.click("#quizBody .btn-jump"); at_step(page, 4)
    page.click("#quizBody .opt"); at_step(page, 5)       # ownership
    page.click("#quizBody .opt"); at_step(page, 6)       # timeline

    page.fill("#f_street", "1364 E Joseph Way")
    page.fill("#f_city", "Gilbert")
    page.fill("#f_zip", "85295")
    page.click("#quizBody .btn-jump"); at_step(page, 7)

    page.fill("#f_name", "Pearl Test")
    page.fill("#f_email", "test@pearlvfx.com")           # never a real address
    page.fill("#f_phone", "4805550134")
    page.click("#quizBody .btn-jump")
    page.wait_for_url("**/thank-you.html*", timeout=25000)
    page.wait_for_timeout(400)


def main():
    threading.Thread(
        target=ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever,
        daemon=True,
    ).start()
    time.sleep(0.5)

    failed = []

    def check(name, got, want):
        ok = got == want
        print(f"  {'PASS' if ok else 'FAIL'}  {name}: fired {got}, expected {want}")
        if not ok:
            failed.append(name)

    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context()
        ctx.add_init_script(STUB)
        page = ctx.new_page()

        print("A. both writes succeed")
        mode("ok", "ok")
        run_quiz(page)
        check("Lead on a captured lead", len(leads(page)), 1)

        print("B. reload the thank-you page")
        page.reload()
        page.wait_for_timeout(300)
        check("no replay on reload", len(leads(page)), 0)

        print("C. sheet write failed AND the backup form is gone")
        mode("partial", "404")
        run_quiz(page)
        check("no Lead when nothing was recorded", len(leads(page)), 0)

        print("D. relay 500 but the backup form caught it")
        mode("500", "ok")
        run_quiz(page)
        check("Lead when the backup captured it", len(leads(page)), 1)

        print("E. thank-you.html opened cold")
        page.goto(f"{BASE}/thank-you.html?eid=made-up&est=980-1350&n=8")
        page.wait_for_timeout(300)
        check("no Lead on a direct hit", len(leads(page)), 0)

        print("F. relay hangs, backup ok (the 12s hard cap)")
        mode("hang", "ok")
        run_quiz(page)
        check("Lead once the backup lands", len(leads(page)), 1)

        browser.close()

    print("\n" + ("FAILED: " + ", ".join(failed) if failed else "all scenarios pass"))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
