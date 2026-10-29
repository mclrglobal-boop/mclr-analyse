// POST { product_id, serenite?, samples: [{ name, batch? }] } → URL Stripe Checkout
// Les prix sont fixés côté serveur, jamais fournis par le client. Un paiement peut couvrir plusieurs échantillons :
// le webhook crée alors une commande (un échantillon, un certificat) par échantillon.
import { corsHeaders, db, fail, getSettings, json, SERENITE, siteUrl, UUID_RE } from '../_shared/core.ts';
import { stripe } from '../_shared/stripe.ts';

const MAX_SAMPLES = 20;
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('Méthode non autorisée', 405);
  try {
    const { product_id, serenite, samples } = await req.json().catch(() => ({}));
    const withSerenite = serenite === true;
    if (!UUID_RE.test(String(product_id ?? ''))) return fail('Produit invalide');
    const list = (Array.isArray(samples) ? samples : [])
      .map((s: { name?: unknown; batch?: unknown }) => ({ name: clean(s?.name, 120), batch: clean(s?.batch, 60) }));
    if (!list.length) return fail('Ajoutez au moins un échantillon');
    if (list.length > MAX_SAMPLES) return fail(`${MAX_SAMPLES} échantillons maximum par commande`);
    if (list.some((s) => s.name.length < 2)) return fail('Indiquez le nom du produit pour chaque échantillon');

    const { data: p } = await db().from('products')
      .select('id, slug, name, method, price_cents, currency, active').eq('id', product_id).maybeSingle();
    if (!p || !p.active) return fail('Produit indisponible', 404);
    const site = siteUrl(await getSettings());
    const n = list.length;

    const metadata: Record<string, string> = { product_id: p.id, serenite: withSerenite ? '1' : '0', count: String(n) };
    list.forEach((s, i) => {
      metadata[`s${i + 1}_name`] = s.name;
      if (s.batch) metadata[`s${i + 1}_batch`] = s.batch;
    });

    const session = await stripe<{ url: string }>('POST', '/checkout/sessions', {
      mode: 'payment',
      locale: 'fr',
      line_items: [{
        quantity: n,
        price_data: {
          currency: p.currency,
          unit_amount: p.price_cents,
          product_data: {
            name: n > 1 ? `${p.name} — ${n} échantillons` : p.name,
            description: `${p.method} — analyse réalisée par un laboratoire tiers indépendant`,
            metadata: { product_id: p.id },
          },
        },
      }, ...(withSerenite ? [{
        quantity: n,
        price_data: {
          currency: p.currency,
          unit_amount: SERENITE.price_cents,
          product_data: { name: SERENITE.name, description: SERENITE.description },
        },
      }] : [])],
      metadata,
      payment_intent_data: { metadata: { product_id: p.id, serenite: withSerenite ? '1' : '0', count: String(n) } },
      success_url: `${site}/commande/succes/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/analyse/?slug=${p.slug}&annule=1`,
    });
    return json({ url: session.url });
  } catch (e) {
    console.error('[checkout]', e);
    return fail((e as Error).message, 500);
  }
});
