// Starts a Paystack checkout (POST) or reports the Pro price (GET).
const PRICE = parseInt(process.env.PRO_PRICE_KES || '1500', 10);
const HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const out = (code, obj) => ({ statusCode: code, headers: HEADERS, body: JSON.stringify(obj) });

exports.handler = async (event) => {
  if (event.httpMethod === 'GET') {
    return out(200, {
      paystack: process.env.PAYSTACK_SECRET_KEY ? { price: PRICE, currency: 'KES' } : null,
      paypal: (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET)
        ? { price: parseFloat(process.env.PRO_PRICE_USD || '10'), currency: 'USD' } : null
    });
  }
  if (event.httpMethod !== 'POST') return out(405, { error: 'Method not allowed.' });

  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) return out(500, { error: 'Checkout is not set up yet.' });

  let email = '';
  try { email = String(JSON.parse(event.body || '{}').email || '').trim(); } catch (e) {}
  if (!/^\S+@\S+\.\S+$/.test(email)) return out(400, { error: 'Enter a valid email.' });

  const base = process.env.SITE_URL || event.headers.origin || ('https://' + event.headers.host);
  try {
    const r = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        amount: PRICE * 100, // Paystack amounts are in the smallest unit (KES cents)
        currency: 'KES',
        callback_url: base + '/',
        metadata: { product: 'latepayy-pro' }
      })
    });
    const d = await r.json();
    if (d && d.status && d.data && d.data.authorization_url) return out(200, { url: d.data.authorization_url });
    return out(502, { error: 'Checkout could not start. Try again.' });
  } catch (e) {
    return out(502, { error: 'Checkout could not start. Try again.' });
  }
};
