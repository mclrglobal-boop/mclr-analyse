import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { publicApi, publicFileUrl } from '../lib/supabase';
import { formatDate, formatDateTime } from '../lib/format';
import { useAsync, useTitle } from '../lib/useAsync';
import { Loading } from '../components/ui';

type Verification =
  | { result: 'not_found' } | { result: 'rate_limited' }
  | {
      result: 'valid' | 'revoked';
      certificate: { public_id: string; status: string; version: number; created_at: string; updated_at: string; revoked_at: string | null; revocation_reason: string | null; scan_count: number };
      data: { product_name: string; sample_reference: string; batch_number: string | null; analysis_date: string; method: string; main_result: string | null; issued_at: string; appearance: string | null; cas_number: string | null; received_date: string | null; client_name?: string | null; hplc_peaks?: { rt: string; type: string; width: string; area: string; height: string; areaPct: string }[] | null; hplc_caption?: string | null; ms_caption?: string | null; has_photo?: boolean; has_hplc: boolean; has_ms: boolean; has_pdf: boolean };
      results: { analyte: string; value: string; unit: string | null; specification: string | null }[];
      versions: { version: number; issued_at: string; reason: string | null }[];
    };

export default function Verify() {
  const [sp] = useSearchParams();
  const id = (sp.get('id') ?? '').toUpperCase().trim();
  useTitle('Vérification de certificat');
  return id ? <Result id={id} /> : <Search />;
}

function Search() {
  const [v, setV] = useState('');
  const [err, setErr] = useState(false);
  const nav = useNavigate();
  function go(e: React.FormEvent) {
    e.preventDefault();
    const id = v.toUpperCase().replace(/\s+/g, '').replace(/^COA(?!-)/, 'COA-');
    if (!/^COA-[0-9A-Z]{8}$/.test(id)) return setErr(true);
    nav(`/verify/?id=${id}`);
  }
  return (
    <div className="container-x flex justify-center py-16">
      <div className="card w-full max-w-md p-7">
        <img src="/brand/mclr-emblem.png" alt="" className="h-12 w-12" />
        <h1 className="mt-4 text-2xl font-bold">Vérifier un certificat</h1>
        <p className="mt-2 text-sm text-ink-700">Scannez le QR code du certificat ou saisissez son identifiant tel qu&apos;il figure sur le document.</p>
        <form onSubmit={go} className="mt-6 space-y-3">
          <input value={v} onChange={(e) => { setV(e.target.value); setErr(false); }} required autoComplete="off" placeholder="COA-XXXXXXXX" maxLength={14}
            className="input py-3 text-center font-mono text-lg uppercase tracking-widest" />
          {err && <p className="text-sm text-danger">Format attendu : COA- suivi de 8 caractères.</p>}
          <button className="btn-primary w-full py-3">Vérifier</button>
        </form>
      </div>
    </div>
  );
}

function Result({ id }: { id: string }) {
  const { data: v, loading } = useAsync(() => publicApi<Verification>({ action: 'verify', id }), [id]);
  if (loading || !v) return <Loading />;
  if (v.result === 'rate_limited') return <Shell><State tone="amber" icon="…" title="Trop de requêtes" text="Veuillez patienter une minute avant de réessayer." /></Shell>;
  if (v.result === 'not_found') return (
    <Shell>
      <State tone="red" icon="✕" title="CERTIFICATE NOT FOUND" text={`Aucun certificat portant l'identifiant ${id} n'est enregistré dans notre base de données. Ce document ne peut pas être considéré comme authentique.`} />
      <div className="mt-4 text-center"><Link to="/verify/" className="text-sm font-semibold text-brand">Saisir un autre identifiant</Link></div>
    </Shell>
  );
  const { certificate: c, data: d } = v;
  const valid = v.result === 'valid';
  return (
    <Shell>
      {valid
        ? <State tone="green" icon="✓" title="CERTIFICATE VERIFIED" text="Certificat vérifié — enregistré dans notre base de données et en vigueur." />
        : <State tone="red" icon="!" title="CERTIFICATE REVOKED" text="Ce certificat a été révoqué : il n'est plus considéré comme valide et ne doit plus être utilisé comme preuve des résultats indiqués." />}
      <div className="card mt-5 overflow-hidden">
        <div className="border-b border-line bg-paper px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div><div className="text-xs font-semibold uppercase tracking-wide text-ink-500">Certificate ID</div>
            <div className="mt-1 font-mono text-2xl font-bold tracking-wider">{c.public_id}</div></div>
            {d.has_photo && <a href={publicFileUrl('image', c.public_id, 'photo')} target="_blank" rel="noopener"><img src={publicFileUrl('image', c.public_id, 'photo')} alt="Photo du flacon" className="h-20 w-auto rounded border border-line object-cover" /></a>}
          </div>
        </div>
        <dl className="divide-y divide-line">
          {d.client_name && <Row k="Client" en="Test for" v={d.client_name} strong />}
          <Row k="Produit" en="Product" v={d.product_name} />
          <Row k="Référence échantillon" en="Sample" v={d.sample_reference} mono />
          <Row k="Lot" en="Batch" v={d.batch_number || '—'} mono />
          {d.appearance && <Row k="Aspect" en="Appearance" v={d.appearance} />}
          {d.cas_number && <Row k="N° CAS" en="CAS No." v={d.cas_number} mono />}
          {d.received_date && <Row k="Réception" en="Received" v={formatDate(d.received_date)} />}
          <Row k="Date d'analyse" en="Analysis date" v={formatDate(d.analysis_date)} />
          <Row k="Méthode" en="Method" v={d.method} />
          <Row k="Résultat" en="Result" v={d.main_result || 'Voir tableau'} strong />
          <Row k="Source" en="Source" v="Laboratoire tiers indépendant — Independent laboratory report" />
          <Row k="Date d'émission" en="Issue date" v={formatDate(d.issued_at)} />
          <Row k="Statut" en="Status" v={valid ? 'VALID' : 'REVOKED'} strong tone={valid ? 'text-emerald-700' : 'text-danger'} />
          {!valid && c.revoked_at && <Row k="Révoqué le" en="Revoked" v={formatDateTime(c.revoked_at)} />}
          {!valid && c.revocation_reason && <Row k="Motif" en="Reason" v={c.revocation_reason} />}
        </dl>
      </div>
      {v.results.length > 0 && (
        <div className="card mt-5 overflow-hidden">
          <div className="px-5 pt-4 text-xs font-semibold uppercase tracking-wide text-ink-500">Résultats · Results</div>
          <div className="overflow-x-auto">
            <table className="table mt-2">
              <thead><tr><th>Paramètre</th><th>Spécification</th><th>Résultat</th></tr></thead>
              <tbody>{v.results.map((r, i) => (
                <tr key={i}><td>{r.analyte}</td><td className="text-ink-500">{r.specification || '—'}</td><td className="font-semibold text-brand">{r.value}{r.unit ? ` ${r.unit}` : ''}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
      {!!d.hplc_peaks?.length && (
        <div className="card mt-5 overflow-hidden">
          <div className="px-5 pt-4 text-xs font-semibold uppercase tracking-wide text-ink-500">Tableau des pics HPLC · HPLC peak table</div>
          <div className="overflow-x-auto">
            <table className="table mt-2 font-mono text-xs">
              <thead><tr><th>RT [min]</th><th>Type</th><th>Width [min]</th><th>Area</th><th>Height</th><th>Area %</th></tr></thead>
              <tbody>{d.hplc_peaks.map((r, i) => (
                <tr key={i}><td>{r.rt}</td><td>{r.type}</td><td>{r.width}</td><td>{r.area}</td><td>{r.height}</td><td className="font-bold text-brand">{r.areaPct}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
      {(d.has_hplc || d.has_ms) && (
        <div className="card mt-5 space-y-4 p-4">
          {d.has_hplc && <figure><figcaption className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Chromatogramme HPLC</figcaption><img src={publicFileUrl('image', c.public_id, 'hplc')} alt="Chromatogramme HPLC" className="w-full rounded border border-line" loading="lazy" /></figure>}
          {d.has_ms && <figure><figcaption className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Spectre de masse</figcaption><img src={publicFileUrl('image', c.public_id, 'ms')} alt="Spectre de masse" className="w-full rounded border border-line" loading="lazy" /></figure>}
          <p className="text-xs text-ink-500">{[d.hplc_caption, d.ms_caption].filter(Boolean).join(' ') || 'Extraits du rapport du laboratoire, reproduits sans modification.'}</p>
        </div>
      )}
      {d.has_pdf && <a href={`/pdf/?id=${c.public_id}`} target="_blank" rel="noopener" className="btn-dark mt-5 w-full py-3">Voir le document (PDF)</a>}
      <div className="mt-5 rounded-xl border border-line bg-white p-5 text-sm leading-relaxed text-ink-700">
        <p className="font-medium text-ink">Ce certificat permet de vérifier les informations enregistrées dans notre base de données.</p>
        <p className="mt-2">Les résultats proviennent du rapport d&apos;analyse d&apos;un laboratoire tiers indépendant. Le certificat de vérification est émis par MCLR et ne constitue pas un rapport émis par le laboratoire.</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs text-ink-500">
          <div><dt>Vérifications</dt><dd className="font-semibold text-ink">{c.scan_count}</dd></div>
          <div><dt>Créé le</dt><dd className="font-semibold text-ink">{formatDateTime(c.created_at)}</dd></div>
          <div><dt>Dernière modification</dt><dd className="font-semibold text-ink">{formatDateTime(c.updated_at)}</dd></div>
        </dl>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="container-x py-8 sm:py-12"><div className="mx-auto max-w-xl">{children}</div></div>;
}
function State({ tone, icon, title, text }: { tone: 'green' | 'red' | 'amber'; icon: string; title: string; text: string }) {
  const cls = { green: 'bg-emerald-600', red: 'bg-danger', amber: 'bg-amber-600' }[tone];
  return (
    <div className={`rounded-2xl ${cls} p-6 text-center text-white shadow-card`}>
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white/20 text-3xl font-bold">{icon}</div>
      <h1 className="mt-3 text-xl font-extrabold tracking-wide sm:text-2xl">{title}</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm text-white/90">{text}</p>
    </div>
  );
}
function Row({ k, en, v, mono, strong, tone }: { k: string; en: string; v: string; mono?: boolean; strong?: boolean; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <dt className="text-xs uppercase tracking-wide text-ink-500">{k} <span className="normal-case text-ink-300">· {en}</span></dt>
      <dd className={`text-base sm:text-right ${mono ? 'font-mono' : ''} ${strong ? 'font-bold' : 'font-medium'} ${tone ?? ''}`}>{v}</dd>
    </div>
  );
}
