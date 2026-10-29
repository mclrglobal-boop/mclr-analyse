// Webhook Stripe : signature vérifiée, idempotent (événement + session/échantillon), commandes → emails → bons de commande labo
// Un paiement peut couvrir plusieurs échantillons : une commande (un échantillon, un certificat) est créée par échantillon.
import { db, formatMoney, getSettings, json, siteUrl, type Settings } from '../_shared/core.ts';
import { verifyStripeSignature } from '../_shared/stripe.ts';
import { emails, sendLabOrder } from '../_shared/email.ts';

type Session = {
  id: string; payment_status: string; amount_total: number | null; currency: string | null;
  payment_intent: string | { id: string } | null; metadata?: Record<string, string>;
  customer_email?: string | null; customer_details?: { email?: string | null; name?: string | null } | null;
  custom_fields?: { key: string; text?: { value?: string | null } }[];
};
type OrderRow = { id: string; reference: string; customer_email: string; product_name: string; access_token: string; amount_cents: number; currency: string; serenite: boolean; item_index: number };
const ORDER_COLS = 'id, reference, customer_email, product_name, access_token, amount_cents, currency, serenite, item_index';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const raw = await req.text();
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
  if (!secret || !(await verifyStripeSignature(raw, req.headers.get('stripe-signature'), secret))) {
    return json({ error: 'Signature invalide' }, 400);
  }
  const event = JSON.parse(raw);
  const base = db();

  // Idempotence niveau 1 : événement déjà traité
  const { data: seen } = await base.from('stripe_events').select('id').eq('id', event.id).maybeSingle();
  if (seen) return json({ received: true, duplicate: true });

  try {
    const s = await getSettings();
    const site = siteUrl(s);
    const obj = event.data.object;
    switch (event.type) {
      case 'checkout.session.completed': await onCompleted(obj as Session, site, s); break;
      case 'checkout.session.async_payment_succeeded': {
        const { data } = await base.from('orders').update({ status: 'payment_received' })
          .eq('stripe_session_id', obj.id).eq('status', 'pending').select(ORDER_COLS);
        if (data?.length) await afterPayment(data as OrderRow[], site, s);
        break;
      }
      case 'checkout.session.async_payment_failed':
        await base.from('orders').update({ status: 'payment_failed' }).eq('stripe_session_id', obj.id).eq('status', 'pending');
        break;
      case 'charge.refunded': {
        const pi = typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.payment_intent?.id;
        if (pi && obj.refunded) await base.from('orders').update({ status: 'refunded' }).eq('stripe_payment_intent_id', pi);
        break;
      }
      default: break;
    }
  } catch (e) {
    console.error('[stripe-webhook]', e);
    return json({ error: 'processing_failed' }, 500); // Stripe renverra l'événement
  }

  await base.from('stripe_events').upsert({ id: event.id, type: event.type }, { onConflict: 'id', ignoreDuplicates: true });
  return json({ received: true });
});

async function onCompleted(session: Session, site: string, s: Settings) {
  const base = db();
  const md = session.metadata ?? {};
  const { data: product } = await base.from('products').select('id, name').eq('id', md.product_id ?? '').maybeSingle();
  if (!product) throw new Error(`Produit introuvable (session ${session.id})`);
  const email = session.customer_details?.email || session.customer_email;
  if (!email) throw new Error(`Email client absent (session ${session.id})`);
  const paid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';

  // Échantillons : métadonnées s1_name… (formulaire du site) ; anciennes sessions : champs Stripe
  const field = (k: string) => session.custom_fields?.find((f) => f.key === k)?.text?.value?.trim() || null;
  const n = Math.max(1, Math.min(20, Number(md.count) || 1));
  const items = Array.from({ length: n }, (_, i) => ({
    name: md[`s${i + 1}_name`] || (i === 0 ? field('sample_name') : null),
    batch: md[`s${i + 1}_batch`] || (i === 0 ? field('batch_number') : null),
  }));

  // Montant réparti par échantillon (le reste éventuel sur le premier)
  const total = session.amount_total ?? 0;
  const unit = Math.floor(total / n);
  const created: OrderRow[] = [];
  for (let i = 0; i < n; i++) {
    // Idempotence niveau 2 : UNIQUE(stripe_session_id, item_index)
    const { data, error } = await base.from('orders').upsert({
      stripe_session_id: session.id,
      item_index: i + 1,
      item_count: n,
      stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null,
      customer_email: email.toLowerCase(),
      customer_name: session.customer_details?.name ?? null,
      product_id: product.id,
      product_name: product.name,
      amount_cents: i === 0 ? total - unit * (n - 1) : unit,
      currency: session.currency ?? 'eur',
      status: paid ? 'payment_received' : 'pending',
      serenite: md.serenite === '1',
    }, { onConflict: 'stripe_session_id,item_index', ignoreDuplicates: true }).select(ORDER_COLS);
    if (error) throw new Error(error.message);
    const order = data?.[0] as OrderRow | undefined;
    if (!order) continue; // déjà traitée
    await base.from('samples').update({ product_name: items[i].name, batch_number: items[i].batch }).eq('order_id', order.id);
    created.push(order);
  }
  if (paid && created.length) await afterPayment(created, site, s);
}

/** Emails client groupés (un seul envoi pour tout le panier) + un bon de commande labo par échantillon. */
async function afterPayment(orders: OrderRow[], site: string, s: Settings) {
  orders.sort((a, b) => a.item_index - b.item_index);
  const { data: smps } = await db().from('samples').select('order_id, reference, product_name, batch_number').in('order_id', orders.map((o) => o.id));
  const items = orders.map((o) => {
    const sm = smps?.find((x) => x.order_id === o.id);
    return { reference: o.reference, sample_reference: sm?.reference ?? '', sample_name: sm?.product_name ?? null, batch: sm?.batch_number ?? null };
  });
  const main = orders[0];
  const amount = orders.reduce((t, o) => t + o.amount_cents, 0);
  const m = emails(site, s);
  await m.orderConfirmed({ ...main, amount: formatMoney(amount, main.currency) }, items);
  await m.shippingInstructions({ ...main, sample_reference: items[0].sample_reference }, items);
  for (const o of orders) {
    const r = await sendLabOrder(site, s, o.id);
    if (!r.sent) console.warn(`[lab-order] ${o.reference} : ${r.reason}`);
  }
}
