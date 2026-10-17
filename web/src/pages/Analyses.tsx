import { Link, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { startCheckout, supabase } from '../lib/supabase';
import { formatMoney } from '../lib/format';
import { useAsync, useTitle } from '../lib/useAsync';
import { Empty, Loading, Notice } from '../components/ui';
import { loadProducts, type Product } from './Home';

export function Analyses() {
  useTitle('Catalogue des analyses');
  const { data, loading } = useAsync(loadProducts);
  return (
    <div className="container-x py-12">
      <div className="eyebrow mb-2">Catalogue</div>
      <h1 className="text-3xl font-bold tracking-tight">Analyses disponibles</h1>
      <p className="mt-3 max-w-2xl text-ink-700">Chaque analyse est réalisée par un laboratoire tiers indépendant. Vous recevez ensuite un certificat MCLR vérifiable en ligne.</p>
      <div className="mt-10 grid gap-5 md:grid-cols-2">
        {loading && <Loading />}
        {!loading && !data?.length && <Empty>Aucune analyse disponible pour le moment.</Empty>}
        {data?.map((p) => (
          <article key={p.id} className={`card relative flex flex-col p-6 ${p.highlight ? 'border-leaf ring-1 ring-leaf/40' : ''}`}>
            {p.highlight && <span className="absolute -top-3 left-6 rounded-full bg-leaf px-3 py-0.5 text-xs font-semibold text-white">{p.highlight}</span>}
            <div className="flex items-start justify-between gap-4">
              <div><div className="font-mono text-xs text-leaf">{p.method}</div><h2 className="mt-1 text-lg font-semibold">{p.name}</h2></div>
              <div className="text-right">
                <div className="text-xl font-bold">{formatMoney(p.price_cents, p.currency)}</div>
                {p.compare_at_cents ? <div className="text-xs"><s className="text-ink-500">{formatMoney(p.compare_at_cents, p.currency)}</s> <span className="font-semibold text-leaf">−{formatMoney(p.compare_at_cents - p.price_cents, p.currency)}</span></div> : <div className="text-xs text-ink-500">TTC</div>}
              </div>
            </div>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-700">{p.description}</p>
            <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
              <span className="text-xs text-ink-500">Délai indicatif : {p.turnaround}</span>
              <Link to={`/analyse/?slug=${p.slug}`} className="btn-primary">Choisir</Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function Analyse() {
  const [sp] = useSearchParams();
  const slug = sp.get('slug') ?? '';
  const { data: p, loading } = useAsync(async () => {
    const { data } = await supabase.from('products').select('*').eq('slug', slug).eq('active', true).maybeSingle();
    return data as Product | null;
  }, [slug]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useTitle(p ? `${p.name} (${p.method})` : 'Analyse');

  if (loading) return <Loading />;
  if (!p) return <div className="container-x py-16"><Empty>Analyse introuvable. <Link to="/analyses/" className="text-brand underline">Voir le catalogue</Link></Empty></div>;

  async function order() {
    setBusy(true); setErr('');
    try { window.location.href = await startCheckout(p!.id); } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <div className="container-x py-12">
      <Link to="/analyses/" className="text-sm text-ink-500 hover:text-brand">← Catalogue</Link>
      <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div>
          <div className="font-mono text-sm text-leaf">{p.method}</div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{p.name}</h1>
          <p className="mt-4 whitespace-pre-line leading-relaxed text-ink-700">{p.description}</p>
          {p.technical_info && (
            <div className="card mt-8 p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">Informations techniques</h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">{p.technical_info}</p>
            </div>
          )}
          <p className="mt-6 text-sm text-ink-500">L&apos;analyse est réalisée par un laboratoire tiers indépendant. MCLR n&apos;est pas un laboratoire.</p>
        </div>
        <aside className="card h-fit p-6 lg:sticky lg:top-24">
          {sp.get('annule') && <div className="mb-4"><Notice tone="warn">Paiement annulé. Vous pouvez réessayer.</Notice></div>}
          {p.highlight && <span className="mb-3 inline-block rounded-full bg-leaf px-3 py-0.5 text-xs font-semibold text-white">{p.highlight}</span>}
          <div className="flex items-baseline gap-3"><span className="text-3xl font-bold">{formatMoney(p.price_cents, p.currency)}</span>{p.compare_at_cents && <s className="text-ink-500">{formatMoney(p.compare_at_cents, p.currency)}</s>}</div>
          {p.compare_at_cents && <div className="mt-1 text-sm font-semibold text-leaf">Vous économisez {formatMoney(p.compare_at_cents - p.price_cents, p.currency)} par rapport aux analyses séparées</div>}
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-ink-500">Méthode</dt><dd className="font-medium">{p.method}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-ink-500">Délai</dt><dd className="text-right font-medium">{p.turnaround}</dd></div>
          </dl>
          <button onClick={order} disabled={busy} className="btn-primary mt-6 w-full py-3 text-base">{busy ? 'Redirection vers le paiement…' : 'Commander cette analyse'}</button>
          {err && <div className="mt-3"><Notice tone="error">{err}</Notice></div>}
          <p className="mt-3 text-center text-xs text-ink-500">Paiement sécurisé par Stripe. Instructions d&apos;envoi affichées après paiement.</p>
        </aside>
      </div>
    </div>
  );
}
