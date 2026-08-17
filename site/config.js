/* Central config for the AZ Window Services lander.

   NOTE: the Meta Pixel ID is ALSO hardcoded in the <head> pixel snippet of
   index.html and thank-you.html — change it in all three places together.

   PRICING is the one block anyone is likely to want to edit. It drives the
   instant estimate shown on the reveal screen and the "Estimate" string
   written to the sheet, and nothing else depends on these numbers. */
window.AZW = {
  PIXEL_ID: '1545426067332176',
  PHONE_DISPLAY: '(480) 418-0647',
  PHONE_TEL: '4804180647',
  LEAD_ENDPOINT: '/api/lead',        // Netlify function (netlify/functions/lead.mjs)
  THANK_YOU_URL: 'thank-you.html',

  /* Installed price per window, and the window count each bucket is priced at.
     The buckets' labels are also the literal "Window amount" values written to
     the sheet — the existing rows use "<10" and "20+", so do not reword them.
     `typical` is the count used to turn a per-window range into a job total. */
  PRICING: {
    perWindow: { low: 980, high: 1350 },
    buckets: {
      '<10':   { typical: 8,  label: 'Fewer than 10' },
      '10-19': { typical: 14, label: '10 to 19' },
      '20+':   { typical: 22, label: '20 or more' }
    },
    lockDays: 30
  }
};
