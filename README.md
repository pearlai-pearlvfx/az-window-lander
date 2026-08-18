# AZ Window Services — window replacement lander

Meta-ads lead lander for **AZ Window Services LLC** (a PearlVFX client). A
mobile-first quiz that qualifies the visitor, shows an instant installed-price
range, and writes the lead into the client's "AZW Lead Center" spreadsheet.

- **Production:** https://az-window-lander.netlify.app
- **Netlify project:** `az-window-lander` · siteId `d9a256b5-31d3-4e9b-ba2f-45cd64cdac49` · team PearlVFX (`ai-tmcj2rw`)
- **Lead sheet:** [AZW Lead Center](https://docs.google.com/spreadsheets/d/1TprXXf4TpXwzGUJcq7J8jRrXUwErh5k-75v41_wxAe4/edit) → tab **Raw Estimate Data**
- **Meta Pixel:** `1545426067332176`

## How a lead flows

```
browser quiz (site/app.js)
   ├─→ POST /api/lead ─→ netlify/functions/lead.mjs ─→ Apps Script ─→ "Raw Estimate Data"
   │                          ↓ only if that wrote                     + "Lander Detail"
   │                     Meta Conversions API (only if META_CAPI_ACCESS_TOKEN set)
   └─→ POST / (hidden Netlify form "lead-backup")   ← safety net, always fires
                                    ↓
                     either write succeeded ─→ conversion gate opens
                                    ↓
                     thank-you.html?eid=…&est=…&n=…
                     fires fbq('track','Lead', …, {eventID}) — gate only
```

Both writes happen; the Netlify form is the fallback for when the Apps Script
webhook is down.

### The conversion gate

`Lead` must mean *we captured a lead*, so reaching `thank-you.html` is not by
itself enough to fire one. `app.js` waits for both writes and opens a one-shot
gate (`sessionStorage.azw_lead_ok`, falling back to `?ok=1` where storage is
unavailable) only if at least one reported success; `thank-you.html` consumes
the token before tracking. A reload, a bookmark, a shared link, a back-button
return or a submission that failed both writes therefore counts nothing, and one
lead can never be counted twice. Server-side the same rule applies: the
Conversions API event is sent only after the sheet write resolves.

A 12-second hard cap stops a hanging write stranding the visitor on the spinner.
It decides the *redirect* only — whatever has actually landed by then is what
opens the gate, so a slow success still counts and a timeout does not.

One residual gap, deliberately left open: the backup form's `200` means Netlify
accepted the POST, not that it kept it — a submission its spam filter drops
would still open the gate. Counting the relay alone would close that hole but
would undercount every lead the backup exists to catch, which is the worse
error. The sheet remains the number to reconcile against.

`setup/gate-test.py` drives the real quiz in a headless browser with `fbq`
stubbed and asserts on all six cases. Run it after touching `app.js`,
`thank-you.html` or the handler in `lead.mjs`:

```shell
/Users/pearlvfx/Desktop/pearl/.venv/bin/python3 setup/gate-test.py
```

## Layout

| Path | What it is |
| --- | --- |
| `site/index.html` | Lander: hero, 7-step quiz mount, trust section, sticky call bar |
| `site/app.js` | Quiz engine, estimate maths, payload build, submit |
| `site/config.js` | Pixel ID, phone, **PRICING** — the block most likely to need editing |
| `site/styles.css` | All styling; mobile-first, desktop rules at the bottom |
| `site/thank-you.html` | Conversion page — renders the range and fires `Lead` |
| `netlify/functions/lead.mjs` | Relay: maps the payload onto the sheet's columns, optional CAPI |
| `setup/apps-script.gs` | The Apps Script deployed on the sheet (source of truth for it) |
| `setup/gate-test.py` | Regression test for the conversion gate |

## Environment variables

Set on the Netlify project (**scope `all`** — a `functions`-only scope silently
fails to persist through the API):

| Var | Required | Notes |
| --- | --- | --- |
| `WEBHOOK_URL` | yes | Apps Script `/exec` URL |
| `WEBHOOK_TOKEN` | yes | Shared secret; must equal `TOKEN` in the **deployed** Apps Script |

> Neither value is committed. `setup/apps-script.gs` ships with a `SET_ME`
> placeholder — read the real token from the Netlify env vars or from the script
> deployed on the sheet, and never commit it.
| `META_CAPI_ACCESS_TOKEN` | no | Enables server-side Lead events (deduped by `event_id`) |
| `META_PIXEL_ID` | no | Defaults to the pixel above |

Env-var changes only reach the function **after a redeploy**.

## The sandboxed preview

For showing the client's owner the funnel without it counting as anything:

**https://az-window-lander.netlify.app/preview**

It is the live lander — a `netlify.toml` rewrite of the same `index.html`, not a
copy — with its three outputs disconnected:

| | Live | `/preview` |
| --- | --- | --- |
| Apps Script relay → **Raw Estimate Data** | writes | not called |
| Hidden `lead-backup` Netlify form | writes | not posted |
| Meta Pixel (`PageView`, `Lead`) | fires | never initialises |

A guard in each page's `<head>` sets `window.AZW_PREVIEW` from the path (or
`?preview=1`, which `app.js` appends when it redirects to `thank-you.html`).
It has to sit **above** the pixel snippet: once `fbevents.js` loads, a
`PageView` has already gone. `submit()` then returns before either write.

Suppressing the pixel is the part that is easy to forget. Without it an owner
clicking around for ten minutes shows up in the ad account as traffic and
conversions — exactly the pollution the conversion gate exists to prevent.

Everything else is identical: same markup, same pricing, same reveal. It is
visually indistinguishable from the live page on purpose — an earlier version
put a "Preview" strip across the top and the client hated it. Don't add one
back.

## Reviewing before you deploy

Netlify build credits are finite. Do not deploy to look at a change:

```shell
python3 setup/preview-server.py      # http://<this Mac's tailnet ip>:8788
```

Serves `site/` off this Mac over Tailscale with production's routing. Batch
approved changes and deploy once.

## Deploying

There is no `node`/`npx` on the Mac mini — use deno:

```shell
deno run -A --no-lock npm:@netlify/mcp@latest --site-id d9a256b5-31d3-4e9b-ba2f-45cd64cdac49 --proxy-path "<proxy path from the Netlify MCP deploy tool>"
```

## Changing the estimate

Everything the visitor sees and everything written to the sheet's `Estimate`
column comes from `PRICING` in `site/config.js`. These are **AZW's own numbers**,
ported from the client's estimate form (`AZW-Estimate-Form`,
`src/components/LeadForm.tsx` → `PRICE_BANDS` / `getEstimate`):

```js
PRICING: {
  bands: [
    { min: 1,  max: 2,  rate: 1800 },
    { min: 3,  max: 5,  rate: 1600 },
    { min: 6,  max: 10, rate: 1400 },
    { min: 11, max: 19, rate: 1270 },
    { min: 20, max: 20, rate: 1150 },
  ],
  fallbackRate: 1150, baselineRate: 1800,
  defaultCount: 8, maxCount: 20, lockDays: 90
}
```

Flat-band tiering: one rate per window, flat across the whole band, and
`total = rate × count`. There is no low/high range — the visitor is shown a
single price per window. **20 or more is quoted on site**: rate only, no total,
which is where the `$1,150 / window (quoted on site)` rows in the client's sheet
come from.

Because the rate is banded on the *exact* count, step 1 of the quiz is a slider
(1–20, default 8, top stop meaning "20 or more") rather than a bucket — "fewer
than 10" would have spanned three different prices. The sheet's `Window amount`
column still receives the documented `<10` / `10-19` / `20+` bucket, derived
from the count; the exact count goes to the **Lander Detail** tab as
`windowCount`.

The `Estimate` string is formatted exactly as the client's own form writes it,
so rows from both forms read the same:

```
$1,400 / window ($11,200 total)
$1,150 / window (quoted on site)
```

## Hero video

`site/assets/hero.mp4` is a 10s silent install loop, 720×1280 H.264 with
faststart (724KB), re-encoded from the client's vertical original — which was
HEVC in a `.mov` and would not have played in Chrome or Firefox. Keep any
replacement in H.264: 

```shell
ffmpeg -i <source> -an -vf "scale=720:1280:flags=lanczos" -c:v libx264 \
  -profile:v high -pix_fmt yuv420p -crf 28 -preset slow -g 60 \
  -movflags +faststart site/assets/hero.mp4
ffmpeg -ss 3 -i <source> -frames:v 1 -vf "scale=720:1280:flags=lanczos" \
  -q:v 4 site/assets/hero-poster.jpg
```

It sits behind an 86%-opacity scrim and is decoration only: the gradient carries
the section on its own, and `prefers-reduced-motion` hides the element.

## Outstanding

- Nothing on pricing: the `$980–$1,350` guess this lander shipped with has been
  replaced by AZW's real banded rates (above). The source repo isn't reachable
  from `pearlai-pearlvfx`, so it arrived as `AZW-Estimate-Form-main.zip` over
  Taildrop — if the client's rates change, that repo is still the source of
  truth and someone has to re-send it or grant access.
