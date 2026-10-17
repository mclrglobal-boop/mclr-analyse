// Pages de liste du back-office (lecture directe via RLS admin)
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { formatDate, formatDateTime, formatMoney, ORDER_STATUS, REPORT_STATUS, SAMPLE_STATUS } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Badge, Empty, Loading, PageTitle, Stat } from '../../components/ui';

const PAID = ['payment_received', 'sample_received', 'analysis_in_progress', 'results_available', 'certificate_available'];
const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T;

export function Dashboard() {
  const { data } = useAsync(async () => {
    const c = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);
    const [orders, inProgress, reports, toValidate, certs, active, revoked, paid, scans, recent, notSent] = await Promise.all([
      c(supabase.from('orders').select('id', { count: 'exact', head: true }).in('status', PAID)),
      c(supabase.from('orders').select('id', { count: 'exact', head: true }).in('status', ['payment_received', 'sample_received', 'analysis_in_progress'])),
      c(supabase.from('laboratory_reports').select('id', { count: 'exact', head: true })),
      c(supabase.from('laboratory_reports').select('id', { count: 'exact', head: true }).eq('status', 'draft')),
      c(supabase.from('certificates').select('id', { count: 'exact', head: true })),
      c(supabase.from('certificates').select('id', { count: 'exact', head: true }).eq('status', 'active')),
      c(supabase.from('certificates').select('id', { count: 'exact', head: true }).eq('status', 'revoked')),
      supabase.from('orders').select('amount_cents').in('status', PAID).then((r) => r.data ?? []),
      c(supabase.from('verification_logs').select('id', { count: 'exact', head: true }).in('result', ['valid', 'revoked'])),
      supabase.from('orders').select('id, reference, customer_email, product_name, amount_cents, currency, status, created_at').order('created_at', { ascending: false }).limit(8).then((r) => r.data ?? []),
      c(supabase.from('orders').select('id', { count: 'exact', head: true }).in('status', PAID).is('lab_notified_at', null)),
    ]);
    return { orders, inProgress, reports, toValidate, certs, active, revoked, revenue: paid.reduce((s, o) => s + o.amount_cents, 0), scans, recent, notSent };
  });
  if (!data) return <Loading />;
  return (
    <>
      <PageTitle eyebrow="Vue d'ensemble" title="Dashboard" />
      {data.notSent > 0 && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{data.notSent} commande(s) payée(s) non transmise(s) au laboratoire — vérifiez la configuration email (Paramètres) puis renvoyez depuis la commande.</div>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Commandes" value={data.orders} /><Stat label="Chiffre d'affaires" value={formatMoney(data.revenue)} />
        <Stat label="Analyses en cours" value={data.inProgress} /><Stat label="Rapports reçus" value={data.reports} hint={data.toValidate ? `${data.toValidate} à valider` : undefined} />
        <Stat label="Certificats générés" value={data.certs} /><Stat label="Certificats actifs" value={data.active} />
        <Stat label="Certificats révoqués" value={data.revoked} /><Stat label="Scans QR" value={data.scans} />
      </div>
      <div className="card mt-8 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3"><h2 className="font-semibold">Dernières commandes</h2><Link to="/admin/commandes/" className="text-sm font-semibold text-brand">Tout voir →</Link></div>
        <OrdersTable rows={data.recent} />
      </div>
    </>
  );
}

type OrderRow = { id: string; reference: string; customer_email: string; customer_name?: string | null; product_name: string; amount_cents: number; currency: string; status: string; created_at: string };
function OrdersTable({ rows }: { rows: OrderRow[] }) {
  if (!rows.length) return <div className="p-6"><Empty>Aucune commande pour le moment.</Empty></div>;
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead><tr><th>Référence</th><th>Client</th><th>Analyse</th><th>Montant</th><th>Statut</th><th>Date</th></tr></thead>
        <tbody>{rows.map((o) => (
          <tr key={o.id}>
            <td><Link className="font-mono font-semibold text-brand" to={`/admin/commande/?id=${o.id}`}>{o.reference}</Link></td>
            <td>{o.customer_name && <div>{o.customer_name}</div>}<div className="text-ink-500">{o.customer_email}</div></td>
            <td>{o.product_name}</td><td className="tabular-nums">{formatMoney(o.amount_cents, o.currency)}</td>
            <td><Badge tone={ORDER_STATUS[o.status]?.tone}>{ORDER_STATUS[o.status]?.label}</Badge></td>
            <td className="whitespace-nowrap text-ink-500">{formatDateTime(o.created_at)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export function Orders() {
  const [sp, setSp] = useSearchParams();
  const status = sp.get('status') ?? '', q = (sp.get('q') ?? '').replace(/[%,()]/g, '').slice(0, 80);
  const { data, loading } = useAsync(async () => {
    let query = supabase.from('orders').select('id, reference, customer_email, customer_name, product_name, amount_cents, currency, status, created_at').order('created_at', { ascending: false }).limit(300);
    if (status) query = query.eq('status', status);
    if (q) query = query.or(`reference.ilike.%${q}%,customer_email.ilike.%${q}%`);
    return (await query).data ?? [];
  }, [status, q]);
  return (
    <>
      <PageTitle title="Commandes" />
      <form className="mb-4 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); setSp({ q: String(f.get('q') ?? ''), status: String(f.get('status') ?? '') }); }}>
        <input name="q" defaultValue={q} placeholder="Référence ou email…" className="input sm:max-w-xs" />
        <select name="status" defaultValue={status} className="input sm:max-w-xs">
          <option value="">Tous les statuts</option>{Object.entries(ORDER_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button className="btn-ghost">Filtrer</button>
      </form>
      {loading ? <Loading /> : <div className="card overflow-hidden"><OrdersTable rows={data ?? []} /></div>}
    </>
  );
}

export function Clients() {
  const { data } = useAsync(async () => {
    const { data } = await supabase.from('orders').select('customer_email, customer_name, amount_cents, status, created_at').order('created_at', { ascending: false }).limit(2000);
    const map = new Map<string, { email: string; name: string | null; orders: number; spent: number; last: string }>();
    for (const o of data ?? []) {
      const c = map.get(o.customer_email) ?? { email: o.customer_email, name: o.customer_name, orders: 0, spent: 0, last: o.created_at };
      c.orders++; if (PAID.includes(o.status)) c.spent += o.amount_cents; c.name ||= o.customer_name; map.set(o.customer_email, c);
    }
    return [...map.values()];
  });
  return (
    <>
      <PageTitle title="Clients" />
      {!data ? <Loading /> : !data.length ? <Empty>Aucun client.</Empty> : (
        <div className="card overflow-x-auto"><table className="table">
          <thead><tr><th>Client</th><th>Commandes</th><th>Total payé</th><th>Dernière commande</th></tr></thead>
          <tbody>{data.map((c) => (
            <tr key={c.email}><td><div className="font-medium">{c.name || '—'}</div><div className="text-ink-500">{c.email}</div></td>
              <td><Link className="text-brand underline" to={`/admin/commandes/?q=${encodeURIComponent(c.email)}`}>{c.orders}</Link></td>
              <td className="tabular-nums">{formatMoney(c.spent)}</td><td className="text-ink-500">{formatDateTime(c.last)}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}

export function Samples() {
  const [sp] = useSearchParams();
  const status = sp.get('status') ?? '';
  const { data } = useAsync(async () => {
    let q = supabase.from('samples').select('id, reference, status, product_name, batch_number, received_at, created_at, orders!inner(id, reference, customer_email, status)').order('created_at', { ascending: false }).limit(300);
    q = status ? q.eq('status', status) : q.in('orders.status', PAID);
    return (await q).data ?? [];
  }, [status]);
  return (
    <>
      <PageTitle title="Échantillons">
        {Object.entries(SAMPLE_STATUS).map(([k, v]) => <Link key={k} to={`/admin/echantillons/?status=${k}`} className={`btn-ghost !py-1.5 ${status === k ? '!border-brand !text-brand' : ''}`}>{v}</Link>)}
      </PageTitle>
      {!data ? <Loading /> : !data.length ? <Empty>Aucun échantillon.</Empty> : (
        <div className="card overflow-x-auto"><table className="table">
          <thead><tr><th>Échantillon</th><th>Commande</th><th>Produit / lot</th><th>Statut</th><th>Reçu le</th></tr></thead>
          <tbody>{data.map((s) => { const o = one<{ id: string; reference: string; customer_email: string }>(s.orders); return (
            <tr key={s.id}><td className="font-mono font-semibold">{s.reference}</td>
              <td><Link className="font-mono text-brand underline" to={`/admin/commande/?id=${o.id}`}>{o.reference}</Link><div className="text-xs text-ink-500">{o.customer_email}</div></td>
              <td>{s.product_name || '—'}<div className="text-xs text-ink-500">{s.batch_number}</div></td>
              <td><Badge tone={s.status === 'awaiting' ? 'gray' : s.status === 'analyzed' ? 'green' : 'amber'}>{SAMPLE_STATUS[s.status]}</Badge></td>
              <td className="text-ink-500">{formatDateTime(s.received_at)}</td></tr>); })}</tbody>
        </table></div>
      )}
    </>
  );
}

export function Reports() {
  const { data } = useAsync(async () => (await supabase.from('laboratory_reports')
    .select('id, status, product_name, batch_number, laboratory_name, method, purity_result, analysis_date, created_at, orders(reference), samples(reference)')
    .order('created_at', { ascending: false }).limit(300)).data ?? []);
  return (
    <>
      <PageTitle title="Rapports laboratoire"><Link to="/admin/import/" className="btn-primary">Importer une analyse</Link></PageTitle>
      {!data ? <Loading /> : !data.length ? <Empty>Aucun rapport importé.</Empty> : (
        <div className="card overflow-x-auto"><table className="table">
          <thead><tr><th>Commande / échantillon</th><th>Produit</th><th>Laboratoire</th><th>Résultat</th><th>Analyse</th><th>Statut</th></tr></thead>
          <tbody>{data.map((r) => (
            <tr key={r.id}>
              <td><Link className="font-mono font-semibold text-brand" to={`/admin/rapport/?id=${r.id}`}>{one<{ reference: string }>(r.orders)?.reference}</Link><div className="font-mono text-xs text-ink-500">{one<{ reference: string }>(r.samples)?.reference}</div></td>
              <td>{r.product_name}<div className="text-xs text-ink-500">{r.batch_number}</div></td><td>{r.laboratory_name}</td>
              <td className="font-semibold">{r.purity_result || '—'}</td><td>{formatDate(r.analysis_date)}</td>
              <td><Badge tone={r.status === 'validated' ? 'green' : r.status === 'rejected' ? 'red' : 'amber'}>{REPORT_STATUS[r.status]}</Badge></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}

export function Certificates() {
  const [sp] = useSearchParams();
  const status = sp.get('status') ?? '';
  const { data } = useAsync(async () => {
    let q = supabase.from('certificates').select('id, public_id, status, current_version, scan_count, last_verified_at, updated_at, orders(reference), samples(reference)').order('created_at', { ascending: false }).limit(300);
    if (status) q = q.eq('status', status);
    return (await q).data ?? [];
  }, [status]);
  return (
    <>
      <PageTitle title="Certificats">
        <Link to="/admin/certificats/" className="btn-ghost !py-1.5">Tous</Link>
        <Link to="/admin/certificats/?status=active" className="btn-ghost !py-1.5">Actifs</Link>
        <Link to="/admin/certificats/?status=revoked" className="btn-ghost !py-1.5">Révoqués</Link>
      </PageTitle>
      {!data ? <Loading /> : !data.length ? <Empty>Aucun certificat. Générez-en un depuis un rapport validé.</Empty> : (
        <div className="card overflow-x-auto"><table className="table">
          <thead><tr><th>Certificat</th><th>Commande / échantillon</th><th>Version</th><th>Statut</th><th>Scans</th><th>Modifié</th></tr></thead>
          <tbody>{data.map((c) => (
            <tr key={c.id}>
              <td><Link className="font-mono font-semibold text-brand" to={`/admin/certificat/?id=${c.id}`}>{c.public_id}</Link></td>
              <td className="font-mono text-xs">{one<{ reference: string }>(c.orders)?.reference}<br />{one<{ reference: string }>(c.samples)?.reference}</td>
              <td>v{c.current_version}</td><td><Badge tone={c.status === 'active' ? 'green' : 'red'}>{c.status === 'active' ? 'Actif' : 'Révoqué'}</Badge></td>
              <td className="tabular-nums">{c.scan_count}</td><td className="text-ink-500">{formatDateTime(c.updated_at)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}

export function Verifications() {
  const { data } = useAsync(async () => {
    const since = new Date(Date.now() - 864e5).toISOString();
    const c = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);
    const [total, day, unknown, limited, rows] = await Promise.all([
      c(supabase.from('verification_logs').select('id', { count: 'exact', head: true })),
      c(supabase.from('verification_logs').select('id', { count: 'exact', head: true }).gte('created_at', since)),
      c(supabase.from('verification_logs').select('id', { count: 'exact', head: true }).in('result', ['not_found', 'invalid_format'])),
      c(supabase.from('verification_logs').select('id', { count: 'exact', head: true }).eq('result', 'rate_limited')),
      supabase.from('verification_logs').select('id, queried_id, result, ip_hash, user_agent, created_at, certificate_id').order('created_at', { ascending: false }).limit(200).then((r) => r.data ?? []),
    ]);
    return { total, day, unknown, limited, rows };
  });
  if (!data) return <Loading />;
  const tone = { valid: 'green', revoked: 'red', not_found: 'amber', invalid_format: 'gray', rate_limited: 'gray' } as const;
  return (
    <>
      <PageTitle title="Vérifications" />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total" value={data.total} /><Stat label="24 dernières heures" value={data.day} />
        <Stat label="Identifiants inconnus" value={data.unknown} hint="Possibles faux certificats" /><Stat label="Bloquées (anti-abus)" value={data.limited} />
      </div>
      {!data.rows.length ? <Empty>Aucune vérification.</Empty> : (
        <div className="card overflow-x-auto"><table className="table">
          <thead><tr><th>Date</th><th>Identifiant</th><th>Résultat</th><th>Visiteur</th><th>Navigateur</th></tr></thead>
          <tbody>{data.rows.map((l) => (
            <tr key={l.id}><td className="whitespace-nowrap">{formatDateTime(l.created_at)}</td>
              <td className="font-mono">{l.certificate_id ? <Link className="text-brand underline" to={`/admin/certificat/?id=${l.certificate_id}`}>{l.queried_id}</Link> : l.queried_id}</td>
              <td><Badge tone={tone[l.result as keyof typeof tone]}>{l.result}</Badge></td>
              <td className="font-mono text-xs text-ink-500">{l.ip_hash?.slice(0, 12)}</td><td className="max-w-xs truncate text-xs text-ink-500">{l.user_agent}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}
