// POST: create a PayPal order and return the checkout URL.
// GET ?order=ID: capture/verify the order and return a signed Pro token.
const crypto = require('crypto');
const PRICE = parseFloat(process.env.PRO_PRICE_USD || '10');
const API = process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
const HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const out = (code, obj) => ({ statusCode: code, headers: HEADERS, body: JSON.stringify(obj) });

function sign(ref) {
  return crypto.createHmac('sha256', process.env.PRO_SIGNING_SECRET).update('latepayy-pro:' + ref).digest('hex');
}
async function accessToken() {
  const auth = Buffer.from(process.env.PAYPAL_CLIENT_ID + ':' + process.env.PAYPAL_CLIENT_SECRET).toString('base64');
  const r = await fetch(API + '/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  const d = await r.json();
  return d.access_token;
}
function paid(order) {
  const pu = order && order.purchase_units && order.purchase_units[0];
  const cap = pu && pu.payments && pu.payments.captures && pu.payments.captures[0];
  return !!(order && order.status === 'COMPLETED' && pu && pu.custom_id === 'latepayy-pro' &&
    cap && cap.status === 'COMPLETED' && cap.amount && cap.amount.currency_code === 'USD' &&
    parseFloat(cap.amount.value) >= PRICE);
}

exports.handler = async (event) => {
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET || !process.env.PRO_SIGNING_SECRET) {
    return out(500, { error: 'Checkout is not set up yet.' });
  }
  try {
    const tok = await accessToken();
    if (!tok) return out(502, { error: 'Could not reach PayPal. Try again.' });
    const auth = { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' };

    if (event.httpMethod === 'POST') {
      const base = process.env.SITE_URL || event.headers.origin || ('https://' + event.headers.host);
      const r = await fetch(API + '/v2/checkout/orders', {
        method: 'POST',
        headers: Object.assign({ 'PayPal-Request-Id': crypto.randomUUID() }, auth),
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [{
            custom_id: 'latepayy-pro',
            description: 'Latepayy Pro',
            amount: { currency_code: 'USD', value: PRICE.toFixed(2) }
          }],
          payment_source: { paypal: { experience_context: {
            brand_name: 'Latepayy',
            landing_page: 'NO_PREFERENCE',
            shipping_preference: 'NO_SHIPPING',
            user_action: 'PAY_NOW',
            return_url: base + '/',
            cancel_url: base + '/'
          } } }
        })
      });
      const d = await r.json();
      const link = (d.links || []).find(l => l.rel === 'payer-action' || l.rel === 'approve');
 return link ? out(200, { url: link.href }) : out(502, { error: 'Checkout could not start: ' + JSON.stringify(d).slice(0, 300) });

    if (event.httpMethod === 'GET') {
      const id = String((event.queryStringParameters || {}).order || '').trim();
      if (!/^[A-Za-z0-9]{8,40}$/.test(id)) return out(400, { error: 'Invalid order.' });
      let r = await fetch(API + '/v2/checkout/orders/' + id, { headers: auth });
      let order = await r.json();
      if (order && order.status === 'APPROVED') {
        r = await fetch(API + '/v2/checkout/orders/' + id + '/capture', { method: 'POST', headers: auth, body: '{}' });
        order = await r.json();
      }
      if (paid(order)) return out(200, { token: 'pp-' + id + '.' + sign('pp-' + id) });
      return out(402, { error: 'We could not confirm that payment. If you were charged, reload this page in a minute.' });
    }
    return out(405, { error: 'Method not allowed.' });
  } catch (e) {
    return out(502, { error: 'Could not reach PayPal. Try again.' });
  }
};
