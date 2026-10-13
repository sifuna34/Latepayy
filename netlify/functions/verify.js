// reference -> confirms the payment with Paystack and returns a signed Pro token.
// token     -> checks a previously issued token is genuine.
const crypto = require('crypto');
const PRICE = parseInt(process.env.PRO_PRICE_KES || '1500', 10);
const HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const out = (code, obj) => ({ statusCode: code, headers: HEADERS, body: JSON.stringify(obj) });

function sign(ref) {
  return crypto.createHmac('sha256', process.env.PRO_SIGNING_SECRET).update('latepayy-pro:' + ref).digest('hex');
}
function tokenValid(token) {
  try {
    const i = token.lastIndexOf('.');
    if (i < 1) return false;
    const sig = token.slice(i + 1), expected = sign(token.slice(0, i));
    return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch (e) { return false; }
}

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!process.env.PRO_SIGNING_SECRET) return out(500, { error: 'Checkout is not set up yet.' });

  if (q.token) return out(200, { pro: tokenValid(String(q.token)) });
  if (!key) return out(500, { error: 'Checkout is not set up yet.' });

  const ref = String(q.reference || '').trim();
  if (!/^[A-Za-z0-9_-]{6,100}$/.test(ref)) return out(400, { error: 'Invalid payment reference.' });

  try {
    const r = await fetch('https://api.paystack.co/transaction/verify/' + encodeURIComponent(ref), {
      headers: { Authorization: 'Bearer ' + key }
    });
    const d = await r.json();
    const t = d && d.data;
    if (d && d.status && t && t.status === 'success' && t.currency === 'KES' &&
        t.amount >= PRICE * 100 && t.metadata && t.metadata.product === 'latepayy-pro') {
      return out(200, { token: ref + '.' + sign(ref) });
    }
    return out(402, { error: 'We could not confirm that payment. If you were charged, reload this page in a minute.' });
  } catch (e) {
    return out(502, { error: 'Could not reach Paystack. Reload this page to try again.' });
  }
};
