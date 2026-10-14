const SB = process.env.SUPABASE_URL, SK = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' };
const out = (code, o) => ({ statusCode: code, body: JSON.stringify(o) });

async function getUser(event) {
  const token = (event.headers.authorization || '').replace('Bearer ', '');
  if (!token) return null;
  const r = await fetch(`${SB}/auth/v1/user`, { headers: { apikey: SK, Authorization: `Bearer ${token}` } });
  return r.ok ? r.json() : null;
}

exports.handler = async (event) => {
  const user = await getUser(event);
  if (!user) return out(401, { error: 'Not signed in' });
  const { reference } = JSON.parse(event.body || '{}');
  if (!reference) return out(400, { error: 'No reference' });

  const v = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
  });
  const t = (await v.json()).data;
  const min = Math.round(Number(process.env.PRO_PRICE_KES || 400) * 100);
  if (!t || t.status !== 'success' || t.currency !== 'KES' || t.amount < min || t.metadata?.user_id !== user.id)
    return out(400, { error: 'Payment not valid' });

  // each payment reference can only be used once
  const ins = await fetch(`${SB}/rest/v1/payments`, {
    method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({ reference, user_id: user.id, amount: t.amount })
  });
  if (ins.status === 409) return out(200, { ok: true, already: true });
  if (!ins.ok) return out(500, { error: 'Could not record payment' });

  const cur = await (await fetch(`${SB}/rest/v1/subscriptions?user_id=eq.${user.id}&select=pro_until`, { headers: H })).json();
  const base = Math.max(Date.now(), cur[0] ? new Date(cur[0].pro_until).getTime() : 0);
  const until = new Date(base + 30 * 864e5).toISOString();
  await fetch(`${SB}/rest/v1/subscriptions`, {
    method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: user.id, pro_until: until })
  });
  return out(200, { ok: true, pro_until: until });
};
