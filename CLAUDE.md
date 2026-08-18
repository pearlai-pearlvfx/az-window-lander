# Instructions for AI sessions editing this repo

This is a **live lead-generation lander** for AZ Window Services LLC (a PearlVFX
client). Revision requests arrive via chat or iMessage (Pearl agent); edits are
made here, previewed, then deployed to Netlify.

## Invariants — do not break these

1. **The Meta Pixel base code stays in the `<head>` of every HTML page** and
   fires `PageView` on load. Pixel ID `1545426067332176`, hardcoded in
   `index.html`, `thank-you.html` and `site/config.js` — change it in all three
   together.
2. **`fbq('track','Lead')` fires only on `thank-you.html`**, carrying the
   `eventID` from `?eid=`. Don't add `Lead` calls anywhere else and don't drop
   the eventID — it dedupes against the Conversions API.
3. **A `Lead` needs the conversion gate, not just a page view.** `app.js` mints
   a one-shot token (`sessionStorage.azw_lead_ok`, or `?ok=1` where storage is
   unavailable) *only* once a write has reported success, and `thank-you.html`
   consumes it before firing. Reaching that page is not a conversion: a reload,
   a bookmark, a shared link or a submission whose writes all failed must fire
   nothing. Server-side, `sendCapiLead` runs only after `sendToSheet` resolves,
   for the same reason. Restoring either to an unconditional fire re-inflates
   the count, which is invisible in the sheet and only shows up in Ads Manager.
   `setup/gate-test.py` covers the six cases; run it after touching `app.js`,
   `thank-you.html` or the handler in `lead.mjs`.
4. **The sheet's column order is the contract.** `netlify/functions/lead.mjs`
   maps the payload onto the header names of the **Raw Estimate Data** tab, and
   the Apps Script appends by reading that live header row. That tab has a
   genuinely **blank column between `Estimate` and `Fbclid`** — the `''` key in
   `toSheetRow()` holds its place. Removing it shifts Fbclid a column left.
5. **`Window amount` values stay `<10` / `10-19` / `20+`.** The client's own
   rows use `<10` and `20+`, and the Dashboard tab pivots on this column. The
   quiz now collects an *exact* count (the rate is banded on it), so `app.js`
   derives the bucket for this column and sends the real number separately as
   `windowCount`, which lands on **Lander Detail**. Don't write the raw count
   into `Window amount`.
6. **Pricing is the client's, not ours.** `PRICING` in `site/config.js` is a
   port of `PRICE_BANDS`/`getEstimate` from AZW's own estimate form: one flat
   rate per window per band, `total = rate × count`, 20+ quoted on site with no
   total. The `Estimate` string is formatted to match what that form writes, so
   rows from both forms read alike. Don't reintroduce a low–high range, and
   don't invent numbers — if the rates need to change, they change in the
   client's repo first.
7. **`Window amount` must be written as text.** Sheets parses `10-19` as the
   date 10/19; `TEXT_COLS` in the Apps Script prefixes it with `'`. The bug only
   shows on that one bucket, so it is easy to reintroduce and hard to notice.
8. **Keep the hidden Netlify form `lead-backup`** in `index.html`, with its
   field list in sync with the payload in `app.js`. It is the safety net for
   when the Apps Script webhook fails — and, since the gate went in, one of the
   two writes that can legitimately open it.
9. Every `tel:` link needs class `js-call` (fires the `Contact` event).
10. Phone is **(480) 418-0647**, ROC **#359157**. Trust facts (600+ reviews,
   lifetime limited residential warranty, 1-year labour, Wisetack financing,
   family-owned since 2020) must stay true to azwindowservices.com.

## Workflow for revision requests

**Netlify build credits are finite and were burned to 50% in one session by
deploying after every individual change — including twice to debug a redirect.
Do not deploy to look at something.**

Review on the tailnet instead, which costs nothing and updates the moment a file
is saved:

```shell
python3 setup/preview-server.py      # http://<this Mac's tailnet ip>:8788
```

It mirrors production routing (`/preview`, and `/api/lead` answering "not
written"), so what is signed off is what ships. Send Daryn that URL, batch
everything he approves, and deploy **once**, only when he says to. Never leave a
second Netlify project lying around as a "demo": one went stale within the hour
and he spent a round reviewing pre-change work on it.

1. Edit files in `site/` (copy is marked with `<!-- EDIT: ... -->` comments).
2. Verify locally — it's static: `python3 -m http.server 8891 --directory site`.
   `/api/lead` won't exist locally, so both writes fail fast: you still land on
   the thank-you page and still see your price, but no `Lead` fires. That is the
   expected local behaviour, and `setup/gate-test.py` is the way to exercise the
   paths a plain static server can't.
3. Deploy, then re-test the real flow against the live URL before reporting done.

## Infra notes

- **No `node`, `npm` or `npx` on this Mac.** Use `deno run -A --no-lock npm:<pkg>`.
  Type-check with `deno check --no-lock <file>`.
- **Netlify env vars must be written with scope `all`.** Writing them with
  scope `["functions"]` returns "Environment variable upserted" and persists
  nothing — that silently cost a round of debugging. Always read them back after
  writing, and remember the function only picks them up after a redeploy.
- **Netlify projects default to an SSO visitor gate.** A new project must have
  `requireSSOTeamLogin` turned off or the lander sits behind a login wall.
- **The Apps Script lives on the sheet**, not in this repo — `setup/apps-script.gs`
  is the source of truth for it. Editing the code is not enough: `/exec` serves a
  pinned version, so you must also Deploy → Manage deployments → edit → **New
  version**.
- **Google/GitHub work goes through Pearl's signed-in Chrome** on CDP 9223
  (`skills/web/browse.py`). There is no PAT and no service account. If a Google
  tab dies instantly, check the host is on the 9223 allowlist in
  `bin/chrome-link-guard.py` — the guard closes anything not listed.
- **Never leave test rows in the client's sheet.** Test with an `@pearlvfx.com`
  address so the rows are trivially identifiable, then delete them.

## Tone/style for copy changes

Direct, homeowner-friendly, zero fluff. This page has one job: form fills and
calls. Every trust claim must be verifiable on the client's own site.
