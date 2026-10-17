// Pages de détail / formulaires du back-office
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { formatDate, formatDateTime, formatMoney, ORDER_STATUS, REPORT_STATUS, SAMPLE_STATUS } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Badge, Empty, Field, Flash, Loading, PageTitle } from '../../components/ui';
import { formObject, useAction } from './hooks';

const UNPAID = ['pending', 'payment_failed', 'refunded', 'cancelled'];

// ------------------------------------------------------------------ Commande
export function OrderDetail() {
  const [sp] = useSearchParams();
  const id = sp.get('id') ?? '';
  const { data, reload } = useAsync(async () => {
    const [{ data: o }, { data: sample }, { data: reports }, { data: cert }] = await Promise.all([
      supabase.from('orders').select('*').eq('id', id).maybeSingle(),
      supabase.from('samples').select('*').eq('order_id', id).maybeSingle(),
      supabase.from('laboratory_reports').select('id, status, laboratory_name, analysis_date').eq('order_id', id).order('created_at'),
      supabase.from('certificates').select('id, public_id, status, current_version').eq('order_id', id).maybeSingle(),
    ]);
    return { o, sample, reports: reports ?? [], cert };
  }, [id]);
  const { msg, busy, run } = useAction(reload);
  if (!data) return <Loading />;
  const { o, sample, reports, cert } = data;
  if (!o) return <Empty>Commande introuvable.</Empty>;
  const st = ORDER_STATUS[o.status];
  return (
    <>
      <Flash msg={msg} />
      <PageTitle eyebrow="Commande" title={o.reference}><Badge tone={st?.tone}>{st?.label}</Badge></PageTitle>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Informations</h2>
          <dl className="grid grid-cols-[130px_1fr] gap-y-2 text-sm">
            <dt className="text-ink-500">Client</dt><dd>{o.customer_name || '—'}<br /><span className="text-ink-500">{o.customer_email}</span></dd>
            <dt className="text-ink-500">Analyse</dt><dd>{o.product_name}</dd>
            <dt className="text-ink-500">Montant</dt><dd>{formatMoney(o.amount_cents, o.currency)}</dd>
            <dt className="text-ink-500">Date</dt><dd>{formatDateTime(o.created_at)}</dd>
            <dt className="text-ink-500">Laboratoire</dt>
            <dd>
              {o.lab_notified_at ? <span className="text-emerald-700">Bon de commande transmis le {formatDateTime(o.lab_notified_at)}</span> : <span className="text-danger">Bon de commande non transmis</span>}
              {!UNPAID.includes(o.status) && <button disabled={busy} onClick={() => run('order.resendLab', { order_id: o.id })} className="ml-2 text-xs font-semibold text-brand underline">{o.lab_notified_at ? 'Renvoyer' : 'Envoyer'}</button>}
            </dd>
            <dt className="text-ink-500">Lien client</dt><dd><a className="text-brand underline" target="_blank" href={`/commande/?ref=${o.reference}&t=${o.access_token}`}>Page de suivi ↗</a></dd>
          </dl>
        </section>
        {sample && (
          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Échantillon <span className="font-mono text-sm text-ink-500">{sample.reference}</span></h2><Badge tone="brand">{SAMPLE_STATUS[sample.status]}</Badge></div>
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const step = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement)?.value ?? ''; run('sample.update', { ...formObject(e.currentTarget), sample_id: sample.id, order_id: o.id, step }); }}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Produit analysé"><input name="product_name" defaultValue={sample.product_name ?? ''} className="input" /></Field>
                <Field label="Lot"><input name="batch_number" defaultValue={sample.batch_number ?? ''} className="input" /></Field>
              </div>
              <Field label="Notes internes"><textarea name="notes" defaultValue={sample.notes ?? ''} rows={2} className="input" /></Field>
              <div className="flex flex-wrap gap-2">
                <button value="" disabled={busy} className="btn-ghost">Enregistrer</button>
                {sample.status === 'awaiting' && <button value="received" disabled={busy} className="btn-primary">Reçu par le labo + email</button>}
                {sample.status === 'received' && <button value="sent_to_lab" disabled={busy} className="btn-primary">Analyse en cours + email</button>}
              </div>
            </form>
          </section>
        )}
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Rapports laboratoire</h2><Link to={`/admin/import/?order=${o.id}`} className="btn-primary !py-1.5">Importer une analyse</Link></div>
          {!reports.length ? <p className="text-sm text-ink-500">Aucun rapport importé.</p> : (
            <ul className="divide-y divide-line text-sm">{reports.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2"><Link to={`/admin/rapport/?id=${r.id}`} className="text-brand underline">{r.laboratory_name} — {formatDate(r.analysis_date)}</Link><Badge tone={r.status === 'validated' ? 'green' : r.status === 'rejected' ? 'red' : 'amber'}>{REPORT_STATUS[r.status]}</Badge></li>
            ))}</ul>
          )}
          {cert && <div className="mt-4 rounded-lg border border-line p-3 text-sm">Certificat <Link className="font-mono font-semibold text-brand" to={`/admin/certificat/?id=${cert.id}`}>{cert.public_id}</Link> · v{cert.current_version} · {cert.status === 'active' ? 'actif' : 'révoqué'}</div>}
        </section>
        {o.stripe_payment_intent_id && o.status !== 'refunded' && (
          <section className="card border-red-200 p-5">
            <h2 className="mb-2 font-semibold">Remboursement</h2>
            <p className="mb-3 text-sm text-ink-500">Remboursement intégral via Stripe. Irréversible.</p>
            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); run('order.refund', { order_id: o.id, ...formObject(e.currentTarget) }); }}>
              <input name="confirm" placeholder="Tapez REMBOURSER" className="input" autoComplete="off" /><button disabled={busy} className="btn-danger">Rembourser</button>
            </form>
          </section>
        )}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Produits
type Product = { id: string; slug: string; name: string; description: string; method: string; price_cents: number; compare_at_cents: number | null; highlight: string | null; currency: string; turnaround: string; technical_info: string; active: boolean; sort_order: number };

export function Products() {
  const { data } = useAsync(async () => ((await supabase.from('products').select('*').order('sort_order')).data ?? []) as Product[]);
  return (
    <>
      <PageTitle title="Produits (analyses)"><Link to="/admin/produit/" className="btn-primary">Nouvelle analyse</Link></PageTitle>
      {!data ? <Loading /> : (
        <div className="card overflow-x-auto"><table className="table">
          <thead><tr><th>Nom</th><th>Méthode</th><th>Prix</th><th>Délai</th><th>Statut</th></tr></thead>
          <tbody>{data.map((p) => (
            <tr key={p.id}><td><Link className="font-semibold text-brand" to={`/admin/produit/?id=${p.id}`}>{p.name}</Link><div className="font-mono text-xs text-ink-500">/{p.slug}</div></td>
              <td>{p.method}</td><td className="tabular-nums">{formatMoney(p.price_cents, p.currency)}</td><td className="text-ink-500">{p.turnaround}</td>
              <td><Badge tone={p.active ? 'green' : 'gray'}>{p.active ? 'Actif' : 'Inactif'}</Badge></td></tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}

export function ProductEdit() {
  const [sp] = useSearchParams();
  const id = sp.get('id');
  const nav = useNavigate();
  const { data: p, loading } = useAsync(async () => (id ? ((await supabase.from('products').select('*').eq('id', id).maybeSingle()).data as Product | null) : null), [id]);
  const { msg, busy, run } = useAction();
  if (loading) return <Loading />;
  const v = p ?? ({} as Partial<Product>);
  return (
    <>
      <Flash msg={msg} />
      <PageTitle eyebrow="Produits" title={p?.name ?? 'Nouvelle analyse'} />
      <form className="card max-w-3xl space-y-4 p-6" onSubmit={(e) => { e.preventDefault(); const f = formObject(e.currentTarget); run('product.save', { ...f, id: id ?? undefined, active: f.active === 'on' }, () => !id && nav('/admin/produits/')); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom"><input name="name" required defaultValue={v.name} className="input" /></Field>
          <Field label="Slug (URL)" hint="ex. purete-hplc"><input name="slug" required defaultValue={v.slug} pattern="[a-z0-9]+(-[a-z0-9]+)*" className="input font-mono" /></Field>
          <Field label="Méthode"><input name="method" required defaultValue={v.method} className="input" /></Field>
          <Field label="Prix TTC (€)"><input name="price_eur" required inputMode="decimal" defaultValue={v.price_cents != null ? (v.price_cents / 100).toFixed(2) : ''} className="input" /></Field>
          <Field label="Délai indicatif"><input name="turnaround" defaultValue={v.turnaround} className="input" /></Field>
          <Field label="Ordre d'affichage"><input name="sort_order" type="number" min={0} defaultValue={v.sort_order ?? 0} className="input" /></Field>
          <Field label="Prix barré (€)" hint="Optionnel, ex. prix des analyses séparées"><input name="compare_eur" inputMode="decimal" defaultValue={v.compare_at_cents != null ? (v.compare_at_cents / 100).toFixed(2) : ''} className="input" /></Field>
          <Field label="Badge" hint="Optionnel, ex. Recommandé"><input name="highlight" maxLength={40} defaultValue={v.highlight ?? ''} className="input" /></Field>
        </div>
        <Field label="Description"><textarea name="description" rows={4} defaultValue={v.description} className="input" /></Field>
        <Field label="Informations techniques"><textarea name="technical_info" rows={3} defaultValue={v.technical_info} className="input" /></Field>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="active" defaultChecked={v.active ?? true} className="h-4 w-4 accent-[#17466A]" /> Actif (visible et commandable)</label>
        <button disabled={busy} className="btn-primary">Enregistrer</button>
      </form>
    </>
  );
}

// ------------------------------------------------------------------ Paramètres
export function Settings() {
  const { data: s, reload } = useAsync(async () => (await supabase.from('settings').select('*').eq('id', 1).single()).data);
  const { msg, busy, run } = useAction(reload);
  if (!s) return <Loading />;
  const t = (name: string, label: string, hint?: string, type = 'text') => <Field label={label} hint={hint}><input name={name} type={type} defaultValue={s[name] ?? ''} className="input" /></Field>;
  return (
    <>
      <Flash msg={msg} />
      <PageTitle title="Paramètres" />
      <form className="max-w-3xl space-y-6" onSubmit={(e) => { e.preventDefault(); run('settings.save', new FormData(e.currentTarget)); }}>
        <section className="card space-y-4 p-6">
          <h2 className="font-semibold">Entreprise (affichée sur les certificats)</h2>
          {t('company_name', "Nom de l'entreprise")}
          {t('company_legal_details', 'Mentions légales (pied de page du certificat)')}
          {t('company_email', 'Email de contact', 'Reçoit une copie des bons de commande et les réponses du labo', 'email')}
          {t('site_url', 'Adresse du site', 'Utilisée dans les QR codes et les emails — ex. https://mclr-analyse.com')}
        </section>
        <section className="card space-y-4 p-6">
          <h2 className="font-semibold">Logo des certificats</h2>
          <p className="text-sm text-ink-500">{s.logo_path ? 'Logo personnalisé actif.' : 'Logo MCLR par défaut.'}</p>
          <input type="file" name="logo" accept="image/png,image/jpeg" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-ink file:px-4 file:py-2 file:text-white" />
          {s.logo_path && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="remove_logo" /> Revenir au logo par défaut</label>}
        </section>
        <section className="card space-y-4 p-6">
          <div><h2 className="font-semibold">Laboratoire partenaire — commande automatique</h2><p className="text-sm text-ink-500">Usage interne : jamais visible par vos clients.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">{t('lab_name', 'Nom du laboratoire')}{t('lab_email', 'Email de commande du laboratoire', undefined, 'email')}</div>
          <Field label="Informations ajoutées au bon de commande"><textarea name="lab_order_notes" rows={3} defaultValue={s.lab_order_notes ?? ''} className="input" /></Field>
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="lab_auto_order" defaultChecked={s.lab_auto_order} /> Envoyer automatiquement le bon de commande après chaque paiement</label>
        </section>
        <section className="card space-y-4 p-6">
          <div><h2 className="font-semibold">Adresse d&apos;envoi des échantillons</h2><p className="text-sm text-ink-500">Visible par le client après paiement : n&apos;y mettez pas le nom du laboratoire.</p></div>
          {t('shipping_recipient', 'Destinataire')}{t('shipping_address', 'Adresse')}
          <div className="grid gap-4 sm:grid-cols-3">{t('shipping_postal_code', 'Code postal')}{t('shipping_city', 'Ville')}{t('shipping_country', 'Pays')}</div>
          {t('shipping_phone', 'Téléphone')}
          <Field label="Instructions"><textarea name="shipping_instructions" rows={4} defaultValue={s.shipping_instructions ?? ''} className="input" /></Field>
        </section>
        <button disabled={busy} className="btn-primary">{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
      </form>
    </>
  );
}
