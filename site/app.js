/* AZ Window Services lead quiz.

   INVARIANTS (see CLAUDE.md):
   - The payload keys posted to LEAD_ENDPOINT map, via netlify/functions/lead.mjs,
     onto the "Raw Estimate Data" columns of the client's sheet. Renaming one
     silently drops a column. Don't.
   - "Window amount" values must stay '<10' / '10-19' / '20+' — the sheet
     already holds rows using those exact strings.
   - fbq('track','Lead') fires ONLY on thank-you.html, with the eventID, so it
     dedupes against the Conversions API. Never add a Lead call here.
   - Every submission is ALSO posted to the hidden Netlify form 'lead-backup'. */
(function () {
  'use strict';

  var CFG   = window.AZW || {};
  var PRICE = CFG.PRICING || { perWindow: { low: 980, high: 1350 }, buckets: {}, lockDays: 30 };
  var body  = document.getElementById('quizBody');
  if (!body) return;

  var backBtn   = document.getElementById('quizBack');
  var progBar   = document.getElementById('progBar');
  var stepLabel = document.getElementById('stepLabel');

  /* ------------------------------ helpers ----------------------------- */

  function track(ev, params, opts) {
    try { if (window.fbq) window.fbq('track', ev, params || {}, opts || {}); } catch (e) {}
  }
  function trackCustom(ev, params) {
    try { if (window.fbq) window.fbq('trackCustom', ev, params || {}); } catch (e) {}
  }
  function uuid() {
    try { return crypto.randomUUID(); }
    catch (e) { return 'ev-' + Date.now() + '-' + Math.floor(Math.random() * 1e9); }
  }
  function marketingParams() {
    var out = {};
    try {
      var sp = new URLSearchParams(window.location.search);
      ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','fbclid']
        .forEach(function (k) { var v = sp.get(k); if (v) out[k] = v; });
    } catch (e) {}
    return out;
  }
  // Match the timestamp format already in the sheet: America/Phoenix, M/D/YYYY H:mm:ss
  function mstTimestamp() {
    try {
      var parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Phoenix', year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: false
      }).formatToParts(new Date());
      var g = function (t) { return (parts.find(function (p) { return p.type === t; }) || {}).value || '0'; };
      var h = g('hour') === '24' ? '0' : g('hour');
      return g('month') + '/' + g('day') + '/' + g('year') + ' ' + h + ':' + g('minute') + ':' + g('second');
    } catch (e) { return new Date().toISOString(); }
  }
  function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }

  /* ------------------------------ estimate ---------------------------- */
  /* One place decides the number the visitor sees AND the string written to
     the sheet, so the two can never drift apart. */
  function computeEstimate(amount) {
    var bucket  = (PRICE.buckets || {})[amount] || { typical: 10 };
    var n       = bucket.typical;
    var lowEach = PRICE.perWindow.low;
    var hiEach  = PRICE.perWindow.high;
    return {
      perLow:  lowEach,
      perHigh: hiEach,
      count:   n,
      total:   money(lowEach * n) + ' – ' + money(hiEach * n),
      // the literal cell value in the sheet's "Estimate" column
      sheet:   money(lowEach) + '–' + money(hiEach) + ' per window · ~' +
               money(lowEach * n) + '–' + money(hiEach * n) + ' for ' + n + ' windows'
    };
  }

  /* ------------------------------- state ------------------------------ */

  var answers = {};
  var idx     = 0;
  var eventId = uuid();

  var STEPS = [
    {
      key: 'windowAmount', type: 'choice', title: 'How many windows are you replacing?',
      help: 'A close guess is fine — we confirm on site.',
      opts: [
        { v: '<10',   ico: '🪟', label: 'Fewer than 10' },
        { v: '10-19', ico: '🏡', label: '10 to 19' },
        { v: '20+',   ico: '🏘️', label: '20 or more' }
      ]
    },
    {
      key: 'windowAge', type: 'choice', title: 'How old are your current windows?',
      help: 'Older single-pane units are where the biggest bill savings come from.',
      opts: [
        { v: 'Under 10 years', ico: '🕐', label: 'Under 10 years' },
        { v: '10–25 years',    ico: '🕑', label: '10 to 25 years' },
        { v: '25+ years',      ico: '🕒', label: 'More than 25 years' },
        { v: 'Not sure',       ico: '❓', label: "I'm not sure" }
      ]
    },
    {
      key: 'priorities', type: 'multi', title: "What matters most to you?",
      help: 'Pick as many as apply.',
      opts: [
        { v: 'Energy bills',  ico: '💡', label: 'Lower energy bills' },
        { v: 'Heat',          ico: '🔥', label: 'Blocking summer heat' },
        { v: 'Noise',         ico: '🔇', label: 'Less outside noise' },
        { v: 'UV fading',     ico: '☀️', label: 'Stopping UV fading' },
        { v: 'Curb appeal',   ico: '✨', label: 'Curb appeal' }
      ]
    },
    {
      key: 'ownership', type: 'choice', title: 'Do you own the home?',
      help: 'We can only quote for the property owner.',
      two: true,
      opts: [
        { v: 'Own',  ico: '🔑', label: 'I own it' },
        { v: 'Rent', ico: '📄', label: 'I rent' }
      ]
    },
    {
      key: 'timeline', type: 'choice', title: 'When are you looking to get this done?',
      opts: [
        { v: 'ASAP',        ico: '⚡', label: 'As soon as possible' },
        { v: '1–3 months',  ico: '📅', label: 'In the next 1–3 months' },
        { v: '3–6 months',  ico: '🗓️', label: '3 to 6 months out' },
        { v: 'Researching', ico: '🔎', label: 'Just gathering prices' }
      ]
    },
    { key: 'address', type: 'address', title: "What's the property address?",
      help: 'So we can check crew availability in your area.' },
    { key: 'contact', type: 'contact', title: 'Where should we send your estimate?',
      help: 'We’ll text it over and confirm a free measure time.' }
  ];

  /* ------------------------------ rendering --------------------------- */

  function setProgress() {
    var pct = Math.round(((idx) / STEPS.length) * 100);
    if (progBar) progBar.style.width = Math.max(8, pct) + '%';
    if (stepLabel) stepLabel.textContent = Math.min(idx + 1, STEPS.length) + ' of ' + STEPS.length;
    if (backBtn) backBtn.hidden = idx === 0;
  }

  function el(html) {
    var d = document.createElement('div');
    d.innerHTML = html.trim();
    return d.firstChild;
  }

  function optionButton(o, selected) {
    var b = el(
      '<button type="button" class="opt' + (selected ? ' sel' : '') + '">' +
        '<span class="opt-ico">' + o.ico + '</span>' +
        '<span>' + o.label + '</span>' +
        '<span class="opt-check"></span>' +
      '</button>'
    );
    b.setAttribute('data-v', o.v);
    return b;
  }

  function render() {
    var step = STEPS[idx];
    setProgress();
    body.innerHTML = '';

    var head = el('<div><h2 class="q-title">' + step.title + '</h2>' +
      (step.help ? '<p class="q-help">' + step.help + '</p>' : '') + '</div>');
    body.appendChild(head);

    if (step.type === 'choice') return renderChoice(step);
    if (step.type === 'multi')  return renderMulti(step);
    if (step.type === 'address') return renderAddress(step);
    if (step.type === 'contact') return renderContact(step);
  }

  function renderChoice(step) {
    var wrap = el('<div class="opts' + (step.two ? ' two' : '') + '"></div>');
    step.opts.forEach(function (o) {
      var b = optionButton(o, answers[step.key] === o.v);
      b.addEventListener('click', function () {
        answers[step.key] = o.v;
        trackCustom('QuizStep', { step: idx + 1, key: step.key, value: o.v });
        next();
      });
      wrap.appendChild(b);
    });
    body.appendChild(wrap);
  }

  function renderMulti(step) {
    var chosen = answers[step.key] ? String(answers[step.key]).split(', ') : [];
    var wrap = el('<div class="opts"></div>');
    step.opts.forEach(function (o) {
      var b = optionButton(o, chosen.indexOf(o.v) > -1);
      b.addEventListener('click', function () {
        var i = chosen.indexOf(o.v);
        if (i > -1) { chosen.splice(i, 1); b.classList.remove('sel'); }
        else { chosen.push(o.v); b.classList.add('sel'); }
        answers[step.key] = chosen.join(', ');
        cta.disabled = chosen.length === 0;
      });
      wrap.appendChild(b);
    });
    body.appendChild(wrap);

    var cta = el('<button type="button" class="btn btn-primary btn-jump">Continue</button>');
    cta.disabled = chosen.length === 0;
    cta.addEventListener('click', function () {
      trackCustom('QuizStep', { step: idx + 1, key: step.key, value: answers[step.key] });
      next();
    });
    body.appendChild(cta);
  }

  function field(name, label, type, ph, mode) {
    return el(
      '<div class="field" data-f="' + name + '">' +
        '<label for="f_' + name + '">' + label + '</label>' +
        '<input id="f_' + name + '" name="' + name + '" type="' + type + '"' +
          (mode ? ' inputmode="' + mode + '"' : '') +
          ' placeholder="' + (ph || '') + '" autocomplete="' + autoc(name) + '">' +
        '<p class="err"></p>' +
      '</div>'
    );
  }
  function autoc(name) {
    return { street: 'address-line1', city: 'address-level2', zip: 'postal-code',
             name: 'name', email: 'email', phone: 'tel' }[name] || 'on';
  }
  function bad(node, msg) {
    node.classList.add('bad');
    node.querySelector('.err').textContent = msg;
  }
  function clearBad(node) { node.classList.remove('bad'); }

  function renderAddress(step) {
    var f1 = field('street', 'Street address', 'text', '1364 E Joseph Way');
    var f2 = field('city',   'City',           'text', 'Gilbert');
    var f3 = field('zip',    'ZIP code',       'text', '85295', 'numeric');
    [f1, f2, f3].forEach(function (f) {
      body.appendChild(f);
      f.querySelector('input').addEventListener('input', function () { clearBad(f); });
    });

    var cta = el('<button type="button" class="btn btn-primary btn-jump">Continue</button>');
    cta.addEventListener('click', function () {
      var street = f1.querySelector('input').value.trim();
      var city   = f2.querySelector('input').value.trim();
      var zip    = f3.querySelector('input').value.trim();
      var ok = true;
      if (street.length < 4)      { bad(f1, 'Please enter the street address.'); ok = false; }
      if (city.length < 2)        { bad(f2, 'Please enter the city.'); ok = false; }
      if (!/^\d{5}$/.test(zip))   { bad(f3, 'Please enter a 5-digit ZIP code.'); ok = false; }
      if (!ok) return;

      answers.zip = zip;
      answers.address = street + ', ' + city + ', AZ ' + zip;
      trackCustom('QuizStep', { step: idx + 1, key: 'address' });
      next();
    });
    body.appendChild(cta);
  }

  function renderContact(step) {
    var fn = field('name',  'Full name',     'text',  'Jane Smith');
    var fe = field('email', 'Email address', 'email', 'jane@email.com', 'email');
    var fp = field('phone', 'Mobile number', 'tel',   '(480) 555-0134', 'tel');
    [fn, fe, fp].forEach(function (f) {
      body.appendChild(f);
      f.querySelector('input').addEventListener('input', function () { clearBad(f); });
    });

    var consent = el(
      '<label class="consent">' +
        '<input type="checkbox" id="f_consent" checked>' +
        '<span>It’s OK to contact me about my project by phone, text or email, ' +
        'including by automated means. Consent isn’t a condition of purchase.</span>' +
      '</label>'
    );
    body.appendChild(consent);

    var cta = el('<button type="button" class="btn btn-primary btn-jump">Show my price range</button>');
    cta.addEventListener('click', function () {
      var name  = fn.querySelector('input').value.trim();
      var email = fe.querySelector('input').value.trim();
      var phone = fp.querySelector('input').value.trim();
      var digits = phone.replace(/\D/g, '');
      var ok = true;
      if (name.length < 2)                          { bad(fn, 'Please enter your name.'); ok = false; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) { bad(fe, 'Please enter a valid email.'); ok = false; }
      if (digits.length < 10)                       { bad(fp, 'Please enter a 10-digit mobile number.'); ok = false; }
      if (!consent.querySelector('input').checked)  { alert('Please tick the consent box so we can send your estimate.'); ok = false; }
      if (!ok) return;

      answers.name = name;
      answers.email = email;
      answers.phone = phone;
      answers.permission = 'Yes';
      submit(cta);
    });
    body.appendChild(cta);
  }

  /* ------------------------------ navigation -------------------------- */

  function next() {
    if (idx < STEPS.length - 1) { idx++; render(); scrollTop(); }
  }
  function scrollTop() {
    try {
      var card = document.querySelector('.quiz-card');
      var y = card.getBoundingClientRect().top + window.pageYOffset - 70;
      window.scrollTo({ top: y, behavior: 'smooth' });
    } catch (e) {}
  }
  if (backBtn) {
    backBtn.addEventListener('click', function () {
      if (idx > 0) { idx--; render(); scrollTop(); }
    });
  }

  /* -------------------------------- submit ---------------------------- */

  function sending() {
    body.innerHTML = '';
    body.appendChild(el('<div class="sending"><div class="spin"></div>' +
      '<p class="q-help">Pricing your project…</p></div>'));
    if (backBtn) backBtn.hidden = true;
    if (progBar) progBar.style.width = '100%';
  }

  function encodeForm(obj) {
    return Object.keys(obj).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(obj[k] == null ? '' : obj[k]);
    }).join('&');
  }

  // Netlify Forms safety net — fire and forget, never blocks the redirect.
  function postBackup(payload) {
    var b = {};
    Object.keys(payload).forEach(function (k) { b[k] = payload[k]; });
    b['form-name'] = 'lead-backup';
    return fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: encodeForm(b)
    }).catch(function () {});
  }

  function submit(cta) {
    cta.disabled = true;
    var est = computeEstimate(answers.windowAmount);
    var mk  = marketingParams();

    var payload = {
      timestamp:    mstTimestamp(),
      address:      answers.address || '',
      windowAmount: answers.windowAmount || '',
      requested:    'window replacement',   // literal value already used in the sheet
      email:        answers.email || '',
      name:         answers.name || '',
      phone:        answers.phone || '',
      estimate:     est.sheet,
      zip:          answers.zip || '',
      windowAge:    answers.windowAge || '',
      priorities:   answers.priorities || '',
      ownership:    answers.ownership || '',
      timeline:     answers.timeline || '',
      permission:   answers.permission || 'No',
      event_id:     eventId
    };
    Object.keys(mk).forEach(function (k) { payload[k] = mk[k]; });

    sending();
    postBackup(payload);

    var done = false;
    function go() {
      if (done) return;
      done = true;
      var q = '?eid=' + encodeURIComponent(eventId) +
              '&est=' + encodeURIComponent(est.perLow + '-' + est.perHigh) +
              '&n='   + encodeURIComponent(est.count);
      window.location.href = (CFG.THANK_YOU_URL || 'thank-you.html') + q;
    }
    // Never strand someone on the spinner because the relay is slow.
    setTimeout(go, 6000);

    fetch(CFG.LEAD_ENDPOINT || '/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(go).catch(go);
  }

  /* --------------------------- page-level wiring ---------------------- */

  // Contact event on every tel: link (matches the Legacy lander's convention).
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a.js-call') : null;
    if (a) track('Contact', { source: 'tel_link' });
  });

  // Hide the sticky bar while the quiz is on screen — it covers the CTA.
  var bar = document.getElementById('stickyBar');
  var quizSection = document.getElementById('quiz');
  if (bar && quizSection && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { bar.classList.toggle('hide', en.isIntersecting); });
    }, { threshold: 0.25 }).observe(quizSection);
  }

  render();
  trackCustom('QuizStart', {});
})();
