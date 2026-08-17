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
3. **The sheet's column order is the contract.** `netlify/functions/lead.mjs`
   maps the payload onto the header names of the **Raw Estimate Data** tab, and
   the Apps Script appends by reading that live header row. That tab has a
   genuinely **blank column between `Estimate` and `Fbclid`** — the `''` key in
   `toSheetRow()` holds its place. Removing it shifts Fbclid a column left.
4. **`Window amount` values stay `<10` / `10-19` / `20+`.** The client's own
   rows use `<10` and `20+`, and the Dashboard tab pivots on this column.
5. **`Window amount` must be written as text.** Sheets parses `10-19` as the
   date 10/19; `TEXT_COLS` in the Apps Script prefixes it with `'`. The bug only
   shows on that one bucket, so it is easy to reintroduce and hard to notice.
6. **Keep the hidden Netlify form `lead-backup`** in `index.html`, with its
   field list in sync with the payload in `app.js`. It is the safety net for
   when the Apps Script webhook fails.
7. Every `tel:` link needs class `js-call` (fires the `Contact` event).
8. Phone is **(480) 418-0647**, ROC **#359157**. Trust facts (600+ reviews,
   lifetime limited residential warranty, 1-year labour, Wisetack financing,
   family-owned since 2020) must stay true to azwindowservices.com.

## Workflow for revision requests

1. Edit files in `site/` (copy is marked with `<!-- EDIT: ... -->` comments).
2. Verify locally — it's static: `python3 -m http.server 8891 --directory site`.
   `/api/lead` won't exist locally; the 6s redirect still carries you to the
   thank-you page, which is the expected local behaviour.
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
