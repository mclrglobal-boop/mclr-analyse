// POST { product_id, serenite? } → URL Stripe Checkout (les prix sont fixés côté serveur, jamais fournis par le client)
import { corsHeaders, db, fail, getSettings, json, SERENITE, siteUrl, UUID_RE } from '../_shared/core.ts';
import { stripe } from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('Méthode non autorisée', 405);
  try {
    const { product_id, serenite } = await req.json().catch(() => ({}));
    const withSerenite = serenite === true;
    if (!UUID_RE.test(String(product_id ?? ''))) return fail('Produit invalide');
    const { data: p } = await db().from('products')
      .select('id, slug, name, method, price_cents, currency, active').eq('id', product_id).maybeSingle();
    if (!p || !p.active) return fail('Produit indisponible', 404);
    const site = siteUrl(await getSettings());

    const session = await stripe<{ url: string }>('POST', '/checkout/sessions', {
      mode: 'payment',
      locale: 'fr',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: p.currency,
          unit_amount: p.price_cents,
          product_data: {
            name: p.name,
            description: `${p.method} — analyse réalisée par un laboratoire tiers indépendant`,
            metadata: { product_id: p.id },
          },
        },
      }, ...(withSerenite ? [{
        quantity: 1,
        price_data: {
          currency: p.currency,
          unit_amount: SERENITE.price_cents,
          product_data: { name: SERENITE.name, description: SERENITE.description },
        },
      }] : [])],
      metadata: { product_id: p.id, serenite: withSerenite ? '1' : '0' },
      payment_intent_data: { metadata: { product_id: p.id, serenite: withSerenite ? '1' : '0' } },
      custom_fields: [
        { key: 'sample_name', type: 'text', label: { type: 'custom', custom: 'Nom du produit à analyser' }, text: { maximum_length: 120 } },
        { key: 'batch_number', type: 'text', optional: true, label: { type: 'custom', custom: 'Numéro de lot (facultatif)' }, text: { maximum_length: 60 } },
      ],
      success_url: `${site}/commande/succes/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/analyse/?slug=${p.slug}&annule=1`,
    });
    return json({ url: session.url });
  } catch (e) {
    console.error('[checkout]', e);
    return fail((e as Error).message, 500);
  }
});
