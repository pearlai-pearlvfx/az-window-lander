/**
 * AZ Window Services lander — lead receiver.
 *
 * Setup (2 minutes):
 * 1. Open the Google Sheet → Extensions → Apps Script, paste this file in.
 * 2. Deploy → New deployment → Web app → Execute as: Me → Who has access: Anyone.
 * 3. Copy the /exec URL into the Netlify env var WEBHOOK_URL.
 * 4. Put the TOKEN below into the Netlify env var WEBHOOK_TOKEN (same value).
 *
 * Why it maps by header name rather than by position: the client's "Dashboard"
 * tab is a pivot over "Raw Estimate Data", and that sheet has a genuinely blank
 * column between "Estimate" and "Fbclid". Appending by fixed index would put
 * Fbclid one column left the first time anyone inserts a column, and the pivot
 * would silently start counting the wrong field. Reading the live header row
 * means the sheet owner can rearrange columns and this keeps working.
 */

const SHEET_ID   = '1TprXXf4TpXwzGUJcq7J8jRrXUwErh5k-75v41_wxAe4';
const TAB_NAME   = 'Raw Estimate Data';
const DETAIL_TAB = 'Lander Detail';   // qualifying answers, kept out of the pivot
/* The live value is NOT in this repo. It is set in two places that must match:
   the deployed copy of this script on the sheet, and the Netlify env var
   WEBHOOK_TOKEN. Read it from either if you need it; never commit it here. */
const TOKEN      = 'SET_ME — must equal the Netlify env var WEBHOOK_TOKEN';

/** Columns Sheets must not "helpfully" reinterpret as a number or a date. */
const TEXT_COLS  = ['phone number', 'Zip Code', 'zip', 'Window amount'];

function doPost(e) {
  try {
    const d = JSON.parse((e.postData && e.postData.contents) || '{}');

    if (TOKEN && d.webhook_token !== TOKEN) {
      return out({ status: 'error', message: 'bad token' });
    }

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sh = ss.getSheetByName(TAB_NAME);
    if (!sh) return out({ status: 'error', message: 'missing tab: ' + TAB_NAME });

    const row = d.row || {};
    const lastCol = Math.max(sh.getLastColumn(), 1);
    const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];

    // Build the row in the sheet's own column order, forcing TEXT_COLS to stay
    // text. "Window amount" is in that list because Sheets silently parses the
    // bucket "10-19" as the date 10/19 — which then groups as a date in the
    // Dashboard pivot instead of as a window count. "<10" and "20+" survive on
    // their own, so the bug only shows up on one of the three buckets.
    const values = headers.map(function (h) {
      const key = String(h);
      let v = row[key];
      if (v === undefined || v === null) v = '';
      v = String(v);
      return v && TEXT_COLS.indexOf(key) > -1 ? "'" + v : v;
    });

    sh.appendRow(values);
    writeDetail(ss, row, d.extra || {});

    return out({ status: 'ok' });
  } catch (err) {
    return out({ status: 'error', message: String(err) });
  }
}

/** Everything the quiz collected that the client's columns have no home for. */
function writeDetail(ss, row, extra) {
  try {
    let sh = ss.getSheetByName(DETAIL_TAB);
    const headers = ['Timestamp', 'name', 'email', 'phone number', 'Address',
                     'zip', 'Window amount', 'windowAge', 'priorities',
                     'ownership', 'timeline', 'permission', 'Estimate',
                     'utm_source', 'utm_medium', 'utm_campaign',
                     'utm_content', 'utm_term'];
    if (!sh) {
      sh = ss.insertSheet(DETAIL_TAB);
      sh.appendRow(headers);
      sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    const merged = {};
    Object.keys(row).forEach(function (k) { merged[k] = row[k]; });
    Object.keys(extra).forEach(function (k) { merged[k] = extra[k]; });
    sh.appendRow(headers.map(function (h) {
      const v = merged[h];
      const s = (v === undefined || v === null) ? '' : String(v);
      return s && TEXT_COLS.indexOf(h) > -1 ? "'" + s : s;
    }));
  } catch (err) {
    // A detail-tab problem must never fail the lead itself.
    console.error('detail write failed: ' + err);
  }
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Run once from the editor to confirm the append lands where you expect. */
function selfTest() {
  const res = doPost({ postData: { contents: JSON.stringify({
    webhook_token: TOKEN,
    row: {
      'Timestamp': 'TEST — delete me', 'Address': '1 Test St, Tempe, AZ 85281',
      'Window amount': '10-19', 'requested': 'window replacement',
      'email': 'test@example.com', 'name': 'Self Test',
      'phone number': '(480) 555-0000', 'utm_source': 'test',
      'utm_medium': 'test', 'utm_campaign': 'test', 'Gclid': '',
      'Estimate': '$980–$1,350 per window', '': '', 'Fbclid': ''
    },
    extra: { zip: '85281', windowAge: '10–25 years', priorities: 'Heat, Noise',
             ownership: 'Own', timeline: 'ASAP', permission: 'Yes' }
  }) } });
  Logger.log(res.getContent());
}
