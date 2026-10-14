const SB = process.env.SUPABASE_URL, SK = process.env.SUPABASE_SERVICE_KEY;

async function getUser(event) {
  const token = (event.headers.authorization || '').replace('Bearer ', '');
  if (!token) return null;
  const r = await fetch(`${SB}/auth/v1/user`, { headers: { apikey: SK, Authorization: `Bearer ${token}` } });
  return r.ok ? r.json() : null;
}

exports.handler = async (event) => {
  const user = await getUser(event);
  if (!user) return { statusCode: 401, body: JSON.stringify({ error: 'Not signed in' }) };
  const amount = Math.round(Number(process.env.PRO_PRICE_KES || 400) * 100);
  const r = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: user.email, amount, currency: 'KES',
      callback_url: `${process.env.SITE_URL}/app.html`,
      metadata: { user_id: user.id }
    })
  });
  const d = await r.json();
  if (!d.status) return { statusCode: 400, body: JSON.stringify({ error: d.message }) };
  return { statusCode: 200, body: JSON.stringify({ url: d.data.authorization_url }) };
};
