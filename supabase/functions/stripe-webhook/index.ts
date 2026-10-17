// Webhook Stripe : signature vérifiée, idempotent (événement + session), commande → emails → bon de commande labo
import { db, formatMoney, getSettings, json, siteUrl, type Settings } from '../_shared/core.ts';
import { verifyStripeSignature } from '../_shared/stripe.ts';
import { emails, sendLabOrder } from '../_shared/email.ts';

type Session = {
  id: string; payment_status: string; amount_total: number | null; currency: string | null;
  payment_intent: string | { id: string } | null; metadata?: Record<string, string>;
  customer_email?: string | null; customer_details?: { email?: string | null; name?: string | null } | null;
  custom_fields?: { key: string; text?: { value?: string | null } }[];
};
type OrderRow = { id: string; reference: string; customer_email: string; product_name: string; access_token: string; amount_cents: number; currency: string };
const ORDER_COLS = 'id, reference, customer_email, product_name, access_token, amount_cents, currency';

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
        if (data?.[0]) await afterPayment(data[0] as OrderRow, site, s);
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
  const { data: product } = await base.from('products').select('id, name').eq('id', session.metadata?.product_id ?? '').maybeSingle();
  if (!product) throw new Error(`Produit introuvable (session ${session.id})`);
  const email = session.customer_details?.email || session.customer_email;
  if (!email) throw new Error(`Email client absent (session ${session.id})`);
  const paid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';

  // Idempotence niveau 2 : UNIQUE(stripe_session_id)
  const { data, error } = await base.from('orders').upsert({
    stripe_session_id: session.id,
    stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null,
    customer_email: email.toLowerCase(),
    customer_name: session.customer_details?.name ?? null,
    product_id: product.id,
    product_name: product.name,
    amount_cents: session.amount_total ?? 0,
    currency: session.currency ?? 'eur',
    status: paid ? 'payment_received' : 'pending',
  }, { onConflict: 'stripe_session_id', ignoreDuplicates: true }).select(ORDER_COLS);
  if (error) throw new Error(error.message);
  const order = data?.[0] as OrderRow | undefined;
  if (!order) return; // déjà traitée

  const field = (k: string) => session.custom_fields?.find((f) => f.key === k)?.text?.value?.trim() || null;
  await base.from('samples').update({ product_name: field('sample_name'), batch_number: field('batch_number') }).eq('order_id', order.id);

  if (paid) await afterPayment(order, site, s);
}

async function afterPayment(order: OrderRow, site: string, s: Settings) {
  const { data: smp } = await db().from('samples').select('reference').eq('order_id', order.id).single();
  const m = emails(site, s);
  await m.orderConfirmed({ ...order, amount: formatMoney(order.amount_cents, order.currency) });
  await m.shippingInstructions({ ...order, sample_reference: smp?.reference });
  const r = await sendLabOrder(site, s, order.id);
  if (!r.sent) console.warn(`[lab-order] ${order.reference} : ${r.reason}`);
}
