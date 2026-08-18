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

  /* AZ Window Services' own pricing, ported from the client's estimate form
     (AZW-Estimate-Form, src/components/LeadForm.tsx — PRICE_BANDS/getEstimate).
     These are the client's real numbers; the $980–$1,350 range this lander
     shipped with was PearlVFX's guess and is gone.

     Flat-band tiering: the rate is one number per window, flat across the whole
     band, and the total is simply rate x count. There is no low/high range —
     the visitor is shown a single price per window, which is why the quiz asks
     for an exact count rather than a bucket. 20 or more is quoted on site and
     shows no total, matching the "$1,150 / window (quoted on site)" rows the
     client already has in the lead sheet.

     Editing a rate here changes what the visitor sees, what goes in the sheet's
     "Estimate" column and the savings line — nothing else depends on them. Keep
     the bands contiguous and in ascending order. */
  PRICING: {
    bands: [
      { min: 1,  max: 2,  rate: 1800 },
      { min: 3,  max: 5,  rate: 1600 },
      { min: 6,  max: 10, rate: 1400 },
      { min: 11, max: 19, rate: 1270 },
      { min: 20, max: 20, rate: 1150 }
    ],
    fallbackRate:  1150,   // count outside every band (i.e. above 20)
    baselineRate:  1800,   // single-window rate the savings line compares against
    defaultCount:  8,      // where the slider starts, as in the client's form
    maxCount:      20,     // the slider's top stop; 20 means "20 or more"
    lockDays:      90
  }
};
