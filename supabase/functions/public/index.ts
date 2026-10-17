// API publique : vérification de certificat, suivi de commande (jeton secret), retour Stripe, fichiers signés
import { corsHeaders, db, fail, getSettings, json, PUBLIC_ID_RE, sha256Hex } from '../_shared/core.ts';
import { stripe } from '../_shared/stripe.ts';

const UNPAID = ['pending', 'payment_failed', 'refunded', 'cancelled'];

function safeEq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function currentVersion(publicId: string) {
  const { data: cert } = await db().from('certificates').select('id, current_version').eq('public_id', publicId).maybeSingle();
  if (!cert || cert.current_version < 1) return null;
  const { data: v } = await db().from('certificate_versions').select('pdf_path, hplc_image_path, ms_image_path, sample_photo_path')
    .eq('certificate_id', cert.id).eq('version', cert.current_version).maybeSingle();
  return v;
}

async function signed(path: string, seconds = 300) {
  const { data, error } = await db().storage.from('certificates').createSignedUrl(path, seconds);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  try {
    // ---------- Vérification d'un certificat ----------
    if (action === 'verify') {
      const id = (url.searchParams.get('id') ?? '').toUpperCase().slice(0, 32);
      const ip = (req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('cf-connecting-ip') || 'unknown').trim();
      const ipHash = (await sha256Hex((Deno.env.get('IP_HASH_SALT') ?? 'mclr') + ip)).slice(0, 32);
      const { data, error } = await db().rpc('record_verification', {
        p_public_id: id, p_ip_hash: ipHash, p_user_agent: req.headers.get('user-agent') ?? '', p_limit_per_minute: 30,
      });
      if (error) return json({ result: 'not_found' });
      return json(data);
    }

    // ---------- Suivi de commande (lien secret envoyé par email) ----------
    if (action === 'order') {
      const ref = (url.searchParams.get('ref') ?? '').toUpperCase();
      const t = url.searchParams.get('t') ?? '';
      const { data: o } = await db().from('orders')
        .select('id, reference, access_token, product_name, amount_cents, currency, status, created_at, customer_email')
        .eq('reference', ref).maybeSingle();
      if (!o || !t || !safeEq(o.access_token, t)) return fail('Commande introuvable', 404);
      const paid = !UNPAID.includes(o.status);
      const [s, { data: sample }, { data: cert }] = await Promise.all([
        paid ? getSettings() : Promise.resolve(null),
        db().from('samples').select('reference, product_name, batch_number').eq('order_id', o.id).maybeSingle(),
        db().from('certificates').select('public_id, status').eq('order_id', o.id).maybeSingle(),
      ]);
      const { access_token: _t, id: _id, ...order } = o;
      return json({
        order, sample, certificate: cert,
        shipping: s ? {
          recipient: s.shipping_recipient, address: s.shipping_address, postal_code: s.shipping_postal_code,
          city: s.shipping_city, country: s.shipping_country, phone: s.shipping_phone, instructions: s.shipping_instructions,
        } : null,
      });
    }

    // ---------- Retour de Stripe Checkout ----------
    if (action === 'session') {
      const sid = url.searchParams.get('session_id') ?? '';
      if (!/^cs_[A-Za-z0-9_]+$/.test(sid)) return fail('Session invalide');
      const { data: o } = await db().from('orders').select('reference, access_token').eq('stripe_session_id', sid).maybeSingle();
      if (o) return json({ ready: true, ref: o.reference, t: o.access_token });
      const session = await stripe<{ payment_status: string }>('GET', `/checkout/sessions/${sid}`).catch(() => null);
      if (!session) return fail('Session inconnue', 404);
      return json({ ready: false, paid: session.payment_status === 'paid' });
    }

    // ---------- PDF du certificat (version en vigueur) ----------
    if (action === 'pdf' || action === 'image') {
      const id = (url.searchParams.get('id') ?? '').toUpperCase();
      if (!PUBLIC_ID_RE.test(id)) return fail('Introuvable', 404);
      const v = await currentVersion(id);
      const kind = url.searchParams.get('kind');
      const path = action === 'pdf' ? v?.pdf_path : kind === 'hplc' ? v?.hplc_image_path : kind === 'ms' ? v?.ms_image_path : kind === 'photo' ? v?.sample_photo_path : null;
      if (!path) return fail('Introuvable', 404);
      return new Response(null, { status: 302, headers: { ...corsHeaders, Location: await signed(path), 'Cache-Control': 'no-store' } });
    }

    return fail('Action inconnue', 404);
  } catch (e) {
    console.error('[public]', e);
    return fail('Erreur serveur', 500);
  }
});
