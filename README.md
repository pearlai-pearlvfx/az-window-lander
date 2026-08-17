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
   ├─→ POST /api/lead ─→ netlify/functions/lead.mjs ─┬─→ Apps Script web app ─→ "Raw Estimate Data"
   │                                                  │                          + "Lander Detail"
   │                                                  └─→ Meta Conversions API (only if META_CAPI_ACCESS_TOKEN set)
   └─→ POST / (hidden Netlify form "lead-backup")   ← safety net, always fires
                                    ↓
                     thank-you.html?eid=…&est=…&n=…
                     fires fbq('track','Lead', …, {eventID})
```

Both writes happen; the Netlify form is the fallback for when the Apps Script
webhook is down. The redirect to `thank-you.html` is on a 6-second timer, so a
slow relay never strands the visitor on the spinner.

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

## Deploying

There is no `node`/`npx` on the Mac mini — use deno:

```shell
deno run -A --no-lock npm:@netlify/mcp@latest --site-id d9a256b5-31d3-4e9b-ba2f-45cd64cdac49 --proxy-path "<proxy path from the Netlify MCP deploy tool>"
```

## Changing the estimate

Everything the visitor sees and everything written to the sheet's `Estimate`
column comes from `PRICING` in `site/config.js`:

```js
PRICING: {
  perWindow: { low: 980, high: 1350 },
  buckets: {
    '<10':   { typical: 8 },
    '10-19': { typical: 14 },
    '20+':   { typical: 22 },
  },
  lockDays: 30
}
```

`typical` is the window count each bucket is priced at. The bucket **keys** are
also the literal `Window amount` values written to the sheet — the client's
existing rows use `<10` and `20+`, so don't reword them.

## Outstanding

- `site/assets/hero.mp4` — the hero video slot is empty. Drop the file in and it
  plays automatically; no code change. Add `poster="assets/hero-poster.jpg"` to
  the `<video>` once a still exists.
- Per-window pricing (`$980–$1,350`) is PearlVFX's working assumption, derived
  from the `$1,150 / window (quoted on site)` figure in the client's existing
  lead rows. Confirm with the client before scaling ad spend.
