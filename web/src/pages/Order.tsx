import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { publicApi } from '../lib/supabase';
import { formatDateTime, formatMoney, ORDER_STATUS } from '../lib/format';
import { useAsync, useTitle } from '../lib/useAsync';
import { Badge, Empty, Loading, Notice } from '../components/ui';

type OrderView = {
  order: { reference: string; product_name: string; amount_cents: number; currency: string; status: string; created_at: string; customer_email: string };
  sample: { reference: string; product_name: string | null; batch_number: string | null } | null;
  certificate: { public_id: string; status: string } | null;
  shipping: { recipient: string | null; address: string | null; postal_code: string | null; city: string | null; country: string | null; phone: string | null; instructions: string | null } | null;
};
const STEPS = ['payment_received', 'sample_received', 'analysis_in_progress', 'results_available', 'certificate_available'];

export function Order() {
  const [sp] = useSearchParams();
  const ref = sp.get('ref') ?? '', t = sp.get('t') ?? '';
  useTitle('Ma commande');
  const { data, loading, error } = useAsync(() => publicApi<OrderView>({ action: 'order', ref, t }), [ref, t]);
  if (loading) return <Loading />;
  if (error || !data) return <div className="container-x py-16"><Empty>Commande introuvable. Utilisez le lien reçu par email.</Empty></div>;
  const { order: o, sample, certificate: cert, shipping: s } = data;
  const st = ORDER_STATUS[o.status];
  const idx = STEPS.indexOf(o.status);
  return (
    <div className="container-x py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="eyebrow">Votre commande</div>
            <h1 className="mt-1 font-mono text-2xl font-bold sm:text-3xl">{o.reference}</h1>
            <p className="mt-1 text-sm text-ink-500">{o.product_name} · {formatMoney(o.amount_cents, o.currency)} · {formatDateTime(o.created_at)}</p>
          </div>
          <Badge tone={st?.tone}>{st?.label ?? o.status}</Badge>
        </div>
        {idx >= 0 && (
          <ol className="grid grid-cols-5 gap-1 text-[11px] sm:text-xs">
            {['Paiement', 'Réception', 'Analyse', 'Résultat', 'Certificat'].map((l, i) => (
              <li key={l} className="text-center"><div className={`h-1.5 rounded-full ${i <= idx ? 'bg-brand' : 'bg-line'}`} /><div className={`mt-1.5 ${i <= idx ? 'font-semibold' : 'text-ink-500'}`}>{l}</div></li>
            ))}
          </ol>
        )}
        {o.status === 'pending' && <Notice tone="warn">Paiement en cours de confirmation. Les instructions d&apos;envoi s&apos;afficheront dès sa validation.</Notice>}
        {cert && (
          <div className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div><div className="text-sm font-semibold">Certificat de vérification</div><div className="font-mono text-lg">{cert.public_id}</div></div>
            <Link className="btn-primary" to={`/verify/?id=${cert.public_id}`}>Vérifier mon certificat</Link>
          </div>
        )}
        {s && (
          <section className="card p-6">
            <h2 className="text-lg font-semibold">Instructions d&apos;expédition de l&apos;échantillon</h2>
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              <address className="rounded-lg border border-brand-100 bg-brand-50 p-4 not-italic leading-relaxed">
                <div className="font-semibold">{s.recipient}</div><div>{s.address}</div><div>{s.postal_code} {s.city}</div><div>{s.country}</div>
                {s.phone && <div className="mt-1">Tél. : {s.phone}</div>}
              </address>
              <div className="text-sm leading-relaxed">
                <p className="font-semibold">Envoyez l&apos;échantillon directement au laboratoire partenaire.</p>
                <p className="mt-2">Inscrivez sur le colis <b>et</b> sur le flacon :</p>
                <ul className="mt-1 space-y-0.5 font-mono"><li>{o.reference}</li>{sample && <li>{sample.reference}</li>}</ul>
                {sample?.product_name && <p className="mt-2 text-ink-500">Produit déclaré : {sample.product_name}{sample.batch_number ? ` — lot ${sample.batch_number}` : ''}</p>}
                {s.instructions && <p className="mt-2 whitespace-pre-line text-ink-700">{s.instructions}</p>}
              </div>
            </div>
          </section>
        )}
        <p className="text-xs text-ink-500">Conservez le lien de cette page (également envoyé à {o.customer_email}).</p>
      </div>
    </div>
  );
}

/** Retour de Stripe : attend la création de la commande par le webhook puis redirige. */
export function OrderSuccess() {
  const [sp] = useSearchParams();
  const sid = sp.get('session_id') ?? '';
  const nav = useNavigate();
  const [state, setState] = useState<'wait' | 'processing' | 'error'>('wait');
  useTitle('Paiement reçu');
  useEffect(() => {
    let stop = false, tries = 0;
    const tick = async () => {
      try {
        const r = await publicApi<{ ready: boolean; ref?: string; t?: string; paid?: boolean }>({ action: 'session', session_id: sid });
        if (r.ready) return nav(`/commande/?ref=${r.ref}&t=${r.t}`, { replace: true });
        if (!r.paid) setState('processing');
      } catch { if (++tries > 3) return setState('error'); }
      if (!stop) setTimeout(tick, 2000);
    };
    tick();
    return () => { stop = true; };
  }, [sid, nav]);
  return (
    <div className="container-x py-16">
      <div className="mx-auto max-w-lg space-y-4 text-center">
        <h1 className="text-2xl font-bold">Merci pour votre commande</h1>
        {state === 'error'
          ? <Notice tone="error">Impossible de retrouver votre paiement. Vérifiez votre email de confirmation ou contactez-nous.</Notice>
          : <Notice>{state === 'processing' ? 'Votre paiement est en cours de traitement par votre banque. Vous recevrez un email dès sa confirmation.' : 'Paiement validé — création de votre commande en cours…'}</Notice>}
      </div>
    </div>
  );
}
