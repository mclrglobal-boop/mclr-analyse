import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatMoney } from '../lib/format';
import { useAsync, useTitle } from '../lib/useAsync';

export type Product = { id: string; slug: string; name: string; description: string; method: string; price_cents: number; currency: string; turnaround: string; technical_info: string; active: boolean; sort_order: number };

export async function loadProducts() {
  const { data, error } = await supabase.from('products').select('*').eq('active', true).order('sort_order');
  if (error) throw new Error(error.message);
  return (data ?? []) as Product[];
}

export default function Home() {
  useTitle('');
  const { data: products } = useAsync(loadProducts);
  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(#A3B3C4 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
        <div className="container-x relative grid gap-12 py-16 md:grid-cols-[1.2fr_1fr] md:py-24">
          <div>
            <div className="eyebrow mb-4">Analyses indépendantes · vérification en ligne</div>
            <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl">Analyses et vérification de résultats</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-700">
              Consultez les résultats d&apos;analyse associés à un échantillon grâce à notre système de vérification en ligne.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/analyses/" className="btn-primary px-6 py-3 text-base">Commander une analyse</Link>
              <Link to="/verify/" className="btn-ghost px-6 py-3 text-base">Vérifier un certificat</Link>
            </div>
            <p className="mt-6 text-sm text-ink-500">Les analyses sont réalisées par des laboratoires tiers indépendants. MCLR assure la commande, le suivi et la publication vérifiable des résultats.</p>
          </div>
          <div className="card self-center p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold"><img src="/brand/mclr-emblem.png" alt="" className="h-6 w-6" /> Vérification</div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">✓ VALID</span>
            </div>
            <dl className="mt-5 space-y-3 text-sm">
              {[['Certificate ID', 'COA-XXXXXXXX'], ['Méthode', 'HPLC'], ['Résultat', 'XX.X %'], ['Source', 'Independent laboratory report']].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-line pb-2">
                  <dt className="text-ink-500">{k}</dt><dd className={`font-semibold ${k === 'Certificate ID' ? 'font-mono' : ''}`}>{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-ink-500">Exemple d&apos;affichage — chaque certificat porte un QR code unique.</p>
          </div>
        </div>
      </section>

      <section className="container-x py-16">
        <div className="eyebrow mb-2">Comment ça marche</div>
        <h2 className="mb-8 text-2xl font-bold">Un parcours simple et traçable</h2>
        <ol className="grid gap-4 md:grid-cols-4">
          {[['1', 'Commande', 'Choisissez une analyse et réglez en ligne de façon sécurisée.'],
            ['2', 'Envoi', "Recevez vos références et l'adresse d'envoi de l'échantillon."],
            ['3', 'Analyse', 'Un laboratoire tiers indépendant réalise l’analyse.'],
            ['4', 'Certificat', 'Nous publions votre certificat avec QR code, vérifiable en ligne.']].map(([n, t, d]) => (
            <li key={n} className="card p-5">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand font-mono text-sm text-white">{n}</div>
              <div className="mt-4 font-semibold">{t}</div>
              <p className="mt-1 text-sm leading-relaxed text-ink-700">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      {!!products?.length && (
        <section className="container-x pb-8">
          <div className="mb-6 flex items-end justify-between">
            <h2 className="text-2xl font-bold">Analyses disponibles</h2>
            <Link to="/analyses/" className="text-sm font-semibold text-brand hover:underline">Tout le catalogue →</Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {products.slice(0, 4).map((p) => (
              <Link key={p.id} to={`/analyse/?slug=${p.slug}`} className="card group p-5 transition hover:border-brand">
                <div className="font-mono text-xs text-leaf">{p.method}</div>
                <div className="mt-2 font-semibold group-hover:text-brand">{p.name}</div>
                <div className="mt-4 text-lg font-bold">{formatMoney(p.price_cents, p.currency)}</div>
                <div className="text-xs text-ink-500">{p.turnaround}</div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
