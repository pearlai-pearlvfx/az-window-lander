/* Lead relay: browser -> this function -> Google Apps Script -> "Raw Estimate Data".

   Also (optionally) sends a server-side Lead to the Meta Conversions API when
   META_CAPI_ACCESS_TOKEN is set, deduped against the browser pixel via event_id.

   Env vars (Netlify → Site settings → Environment variables, functions scope):
   - WEBHOOK_URL              Apps Script web-app /exec URL          [required]
   - WEBHOOK_TOKEN            shared secret, must match the script   [required]
   - META_CAPI_ACCESS_TOKEN   (optional) enables the Conversions API
   - META_PIXEL_ID            (optional) defaults to the lander's pixel

   There are deliberately NO fallback values for the two required vars. A
   hardcoded webhook is how a lander keeps "working" while quietly writing into
   the wrong spreadsheet; an unset var fails loudly instead, and the hidden
   Netlify form 'lead-backup' still captures the lead either way. */

/* Netlify's own guidance is to read env through the global `Netlify` object;
   process.env is kept as the fallback so `netlify dev` and a plain node run
   both still work. */
const env = (key, fallback = '') => {
  try {
    const v = globalThis.Netlify?.env?.get(key);
    if (v) return v;
  } catch {}
  return globalThis.process?.env?.[key] || fallback;
};

/* Read lazily, inside the request, rather than at module scope: Netlify's
   guidance is to keep logic out of the module body, and a value captured at
   cold start would also survive an env-var change until the next deploy. */
const cfg = () => ({
  url:    env('WEBHOOK_URL'),
  token:  env('WEBHOOK_TOKEN'),
  pixel:  env('META_PIXEL_ID', '1545426067332176'),
  capi:   env('META_CAPI_ACCESS_TOKEN'),
});

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function mstNow() {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Phoenix', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(new Date());
    const g = (t) => parts.find((p) => p.type === t)?.value ?? '0';
    const h = g('hour') === '24' ? '0' : g('hour');
    return `${g('month')}/${g('day')}/${g('year')} ${h}:${g('minute')}:${g('second')}`;
  } catch {
    return new Date().toISOString();
  }
}

async function sha256(str) {
  const data = new TextEncoder().encode(String(str).trim().toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* The Apps Script appends these in order onto "Raw Estimate Data". The key
   names below are the SHEET's column headers, not our internal ones — the
   mapping happens here so the browser payload can stay readable. Note the
   empty-string key: the live sheet really does have a blank column between
   "Estimate" and "Fbclid", and dropping it would shift every later column. */
function toSheetRow(d) {
  return {
    'Timestamp':    d.timestamp || mstNow(),
    'Address':      d.address || '',
    'Window amount': d.windowAmount || '',
    'requested':    d.requested || 'window replacement',
    'email':        d.email || '',
    'name':         d.name || '',
    'phone number': d.phone || '',
    'utm_source':   d.utm_source || '',
    'utm_medium':   d.utm_medium || '',
    'utm_campaign': d.utm_campaign || '',
    'Gclid':        d.gclid || '',
    'Estimate':     d.estimate || '',
    '':             '',
    'Fbclid':       d.fbclid || '',
  };
}

async function sendToSheet(d, c) {
  if (!c.url || !c.token) {
    throw new Error('WEBHOOK_URL / WEBHOOK_TOKEN not configured');
  }
  const r = await fetch(c.url, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'lead_submission',
      webhook_token: c.token,
      row: toSheetRow(d),
      /* Extra qualifying answers, appended past the known columns. windowCount
         is the exact number of windows the visitor set on the slider — the
         "Window amount" column above keeps its '<10'/'10-19'/'20+' buckets, so
         this is the only place the real count is recorded, and it is what the
         banded rate in the "Estimate" column was calculated from. */
      extra: {
        windowCount: d.windowCount == null ? '' : String(d.windowCount),
        zip: d.zip || '', windowAge: d.windowAge || '', priorities: d.priorities || '',
        ownership: d.ownership || '', timeline: d.timeline || '',
        permission: d.permission || '', utm_content: d.utm_content || '',
        utm_term: d.utm_term || '',
      },
    }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Apps Script HTTP ${r.status}: ${text.slice(0, 160)}`);
  try {
    const parsed = JSON.parse(text);
    if (parsed && parsed.status === 'error') {
      throw new Error(`Apps Script error: ${parsed.message || text.slice(0, 160)}`);
    }
  } catch (e) {
    if (String(e.message).startsWith('Apps Script error:')) throw e;
    // a non-JSON body is fine — Apps Script sometimes answers in plain text
  }
}

async function sendCapiLead(d, req, c) {
  if (!c.capi) return;
  const user_data = {};
  if (d.email) user_data.em = [await sha256(d.email)];
  if (d.phone) {
    const digits = String(d.phone).replace(/\D/g, '');
    user_data.ph = [await sha256(digits.length === 10 ? `1${digits}` : digits)];
  }
  if (d.name) {
    const [first, ...rest] = String(d.name).trim().split(/\s+/);
    if (first) user_data.fn = [await sha256(first)];
    if (rest.length) user_data.ln = [await sha256(rest.join(' '))];
  }
  if (d.zip) user_data.zp = [await sha256(d.zip)];
  user_data.country = [await sha256('us')];
  user_data.st = [await sha256('az')];

  const ip = req.headers.get('x-nf-client-connection-ip') ||
             (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  if (ip) user_data.client_ip_address = ip;
  const ua = req.headers.get('user-agent');
  if (ua) user_data.client_user_agent = ua;
  if (d.fbclid) user_data.fbc = `fb.1.${Date.now()}.${d.fbclid}`;

  const body = {
    data: [{
      event_name: 'Lead',
      event_time: Math.floor(Date.now() / 1000),
      event_id: d.event_id || undefined,
      action_source: 'website',
      event_source_url: req.headers.get('referer') || undefined,
      user_data,
      custom_data: { content_name: 'window replacement quiz' },
    }],
  };

  const r = await fetch(
    `https://graph.facebook.com/v21.0/${c.pixel}/events?access_token=${encodeURIComponent(c.capi)}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!r.ok) {
    console.error('CAPI failed:', r.status, (await r.text()).slice(0, 200));
  }
}

export default async function handler(req) {
  if (req.method !== 'POST') return json({ status: 'error', message: 'POST only' }, 405);

  let d;
  try {
    d = await req.json();
  } catch {
    return json({ status: 'error', message: 'bad JSON' }, 400);
  }

  const c = cfg();

  /* Order matters: the sheet write has to succeed before any conversion event
     goes anywhere. Running the two together (as this did) reported a Lead to
     Meta even when the lead never reached the client's spreadsheet, which is
     exactly the inflated count we are getting rid of. */
  try {
    await sendToSheet(d, c);
  } catch (e) {
    console.error('sheet write failed:', e?.message || e);
    /* 200 on purpose, but the body is the truth: the browser reads `status` to
       decide whether it captured the lead, and its own hidden-form backup may
       still have caught what we dropped. A 500 would tell it nothing more. No
       CAPI event is sent — an unrecorded lead is not a conversion. */
    return json({ status: 'partial', sheet: 'failed' });
  }

  /* The row is in the spreadsheet, so the conversion is real. Still
     best-effort: a CAPI outage must never turn a captured lead into a failure,
     and the browser pixel carries the same event_id for dedupe. */
  await sendCapiLead(d, req, c).catch((e) => {
    console.error('CAPI failed:', e?.message || e);
  });
  return json({ status: 'ok' });
}

export const config = { path: '/api/lead' };
