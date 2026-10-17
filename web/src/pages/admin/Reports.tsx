// Import, contrôle et validation des rapports ; génération et gestion des certificats
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { adminApi, SITE_URL, supabase } from '../../lib/supabase';
import { formatDate, formatDateTime, REPORT_STATUS } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Badge, Empty, Field, Flash, Loading, Notice, PageTitle } from '../../components/ui';
import { formObject, useAction } from './hooks';

const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T;
type Row = { analyte: string; value: string; unit: string; specification: string };
const fileCls = 'block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-ink file:px-4 file:py-2 file:text-white';

// ------------------------------------------------------------------ Import
export function ImportReport() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { data } = useAsync(async () => {
    const [{ data: orders }, { data: s }] = await Promise.all([
      supabase.from('orders').select('id, reference, product_name, samples(reference, product_name, batch_number)')
        .in('status', ['payment_received', 'sample_received', 'analysis_in_progress', 'results_available', 'certificate_available'])
        .order('created_at', { ascending: false }).limit(500),
      supabase.from('settings').select('lab_name').eq('id', 1).single(),
    ]);
    return { orders: orders ?? [], lab: s?.lab_name ?? '' };
  });
  const [orderId, setOrderId] = useState(sp.get('order') ?? '');
  const [rows, setRows] = useState<Row[]>([
    { analyte: 'Mass Spectrum', value: '', unit: '', specification: 'Conforms to structure' },
  ]);
  const { msg, busy, run } = useAction();
  if (!data) return <Loading />;
  const order = data.orders.find((o) => o.id === orderId);
  const smp = one<{ reference: string; product_name: string | null; batch_number: string | null } | undefined>(order?.samples);
  const set = (i: number, k: keyof Row, v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  return (
    <div className="max-w-4xl">
      <Flash msg={msg} />
      <PageTitle eyebrow="Rapports laboratoire" title="Importer une analyse" />
      <div className="mb-6"><Notice>Recopiez les valeurs <b>exactement</b> comme dans le rapport du laboratoire. Le rapport devra ensuite être vérifié et validé avant de générer le certificat.</Notice></div>
      <form className="space-y-6" onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set('additional_results', JSON.stringify(rows.filter((r) => r.analyte && r.value)));
        run('report.import', fd, (r) => r.report_id && nav(`/admin/rapport/?id=${r.report_id}`));
      }}>
        <section className="card space-y-4 p-6">
          <h2 className="font-semibold">Dossier</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Commande">
              <select name="order_id" required value={orderId} onChange={(e) => setOrderId(e.target.value)} className="input font-mono">
                <option value="">— Sélectionner —</option>{data.orders.map((o) => <option key={o.id} value={o.id}>{o.reference} · {o.product_name}</option>)}
              </select>
            </Field>
            <Field label="Référence échantillon"><input readOnly value={smp?.reference ?? ''} className="input bg-paper font-mono" /></Field>
            <Field label="Produit analysé"><input key={`p${orderId}`} name="product_name" required defaultValue={smp?.product_name ?? ''} className="input" /></Field>
            <Field label="Numéro de lot"><input key={`b${orderId}`} name="batch_number" defaultValue={smp?.batch_number ?? ''} className="input font-mono" /></Field>
            <Field label="Aspect (Appearance)"><input name="appearance" placeholder="White Powder" className="input" /></Field>
            <Field label="N° CAS"><input name="cas_number" className="input font-mono" /></Field>
            <Field label="Date de réception (labo)"><input type="date" name="received_date" className="input" /></Field>
            <Field label="Date d'analyse"><input type="date" name="analysis_date" required className="input" /></Field>
          </div>
        </section>
        <section className="card space-y-4 p-6">
          <h2 className="font-semibold">Laboratoire & méthode <span className="text-xs font-normal text-ink-500">(usage interne, jamais affiché au client)</span></h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Laboratoire"><input name="laboratory_name" required defaultValue={data.lab} className="input" /></Field>
            <Field label="N° du rapport"><input name="laboratory_report_number" className="input font-mono" /></Field>
            <Field label="Méthode"><input name="method" required defaultValue="HPLC-UV / LC-MS" className="input" /></Field>
          </div>
        </section>
        <section className="card space-y-4 p-6">
          <h2 className="font-semibold">Résultats</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Pureté HPLC — résultat" hint='ex. "99.65 %"'><input name="purity_result" className="input font-semibold" /></Field>
            <Field label="Pureté HPLC — spécification" hint='ex. "≥ 98.0%"'><input name="purity_specification" defaultValue="≥ 98.0%" className="input" /></Field>
          </div>
          <div className="space-y-2">
            <div className="label">Autres lignes du rapport</div>
            {rows.map((r, i) => (
              <div key={i} className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
                <input placeholder="Paramètre" value={r.analyte} onChange={(e) => set(i, 'analyte', e.target.value)} className="input" />
                <input placeholder="Résultat" value={r.value} onChange={(e) => set(i, 'value', e.target.value)} className="input font-semibold" />
                <input placeholder="Spécification" value={r.specification} onChange={(e) => set(i, 'specification', e.target.value)} className="input" />
                <button type="button" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} className="btn-ghost !px-3" aria-label="Supprimer">✕</button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setRows((x) => [...x, { analyte: '', value: '', unit: '', specification: '' }])} className="btn-ghost">+ Ajouter une ligne</button>
              {[['Net Peptide Content', '≥ 29.5 mg'], ['Endotoxin', '≤ 0.5 EU/mg'], ['Heavy Metals', '≤ 0.5 ppm']].map(([a, s]) => (
                <button key={a} type="button" onClick={() => setRows((x) => [...x, { analyte: a, value: '', unit: '', specification: s }])} className="btn-ghost !py-1.5 text-xs">+ {a}</button>
              ))}
            </div>
          </div>
          <Field label="Observations"><textarea name="observations" rows={2} className="input" /></Field>
        </section>
        <section className="card space-y-3 p-6">
          <h2 className="font-semibold">Graphiques (facultatif)</h2>
          <p className="text-sm text-ink-500">Captures recadrées <b>uniquement sur le graphique</b> : aucun logo, en-tête, filigrane ni nom du laboratoire. PNG ou JPEG.</p>
          <Field label="Chromatogramme HPLC"><input type="file" name="hplc_image" accept="image/png,image/jpeg" className={fileCls} /></Field>
          <Field label="Spectre de masse"><input type="file" name="ms_image" accept="image/png,image/jpeg" className={fileCls} /></Field>
        </section>
        <section className="card space-y-3 p-6">
          <h2 className="font-semibold">PDF original du laboratoire</h2>
          <input type="file" name="original_pdf" accept="application/pdf,.pdf" required className={fileCls} />
          <p className="text-xs text-ink-500">Archivé tel quel dans un espace privé (jamais publié), avec son empreinte SHA-256.</p>
        </section>
        <button disabled={busy} className="btn-primary">{busy ? 'Import en cours…' : 'Importer le rapport'}</button>
      </form>
    </div>
  );
}

// ------------------------------------------------------------------ Rapport
export function ReportDetail() {
  const [sp] = useSearchParams();
  const id = sp.get('id') ?? '';
  const nav = useNavigate();
  const { data, reload } = useAsync(async () => {
    const { data: r } = await supabase.from('laboratory_reports').select('*, orders(id, reference, customer_email), samples(reference)').eq('id', id).maybeSingle();
    const { data: cert } = r ? await supabase.from('certificates').select('id, public_id, status, current_version').eq('sample_id', r.sample_id).maybeSingle() : { data: null };
    return { r, cert };
  }, [id]);
  const { msg, busy, run } = useAction(reload);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  if (!data) return <Loading />;
  const { r, cert } = data;
  if (!r) return <Empty>Rapport introuvable.</Empty>;
  const order = one<{ id: string; reference: string; customer_email: string }>(r.orders);
  const extras = (r.additional_results ?? []) as { analyte: string; value: string; specification?: string }[];
  const rows: [string, string | null][] = [
    ['Commande', order.reference], ['Échantillon', one<{ reference: string }>(r.samples).reference], ['Produit', r.product_name], ['Lot', r.batch_number],
    ['Aspect', r.appearance], ['N° CAS', r.cas_number], ['Réception', formatDate(r.received_date)], ["Date d'analyse", formatDate(r.analysis_date)],
    ['Laboratoire (interne)', r.laboratory_name], ['N° rapport', r.laboratory_report_number], ['Méthode', r.method],
    ['Pureté HPLC', r.purity_result ? `${r.purity_result}${r.purity_specification ? `  (spéc. ${r.purity_specification})` : ''}` : null],
    ['Graphiques', [r.hplc_image_path && 'HPLC', r.ms_image_path && 'spectre de masse'].filter(Boolean).join(', ') || null], ['Observations', r.observations],
  ];
  async function openPdf() {
    try { const { url } = await adminApi<{ url: string }>('file.lab', { report_id: r!.id }); setPdfUrl(url); } catch (e) { alert((e as Error).message); }
  }
  return (
    <>
      <Flash msg={msg} />
      <PageTitle eyebrow="Rapport laboratoire" title={`${order.reference} — ${r.product_name}`}><Badge tone={r.status === 'validated' ? 'green' : r.status === 'rejected' ? 'red' : 'amber'}>{REPORT_STATUS[r.status]}</Badge></PageTitle>
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-5">
          <section className="card overflow-hidden">
            <dl className="divide-y divide-line text-sm">{rows.map(([k, v]) => <div key={k} className="grid grid-cols-[150px_1fr] gap-3 px-4 py-2.5"><dt className="text-ink-500">{k}</dt><dd className="whitespace-pre-line font-medium">{v || '—'}</dd></div>)}</dl>
            {extras.length > 0 && <table className="table border-t border-line"><thead><tr><th>Paramètre</th><th>Spécification</th><th>Résultat</th></tr></thead><tbody>{extras.map((e, i) => <tr key={i}><td>{e.analyte}</td><td>{e.specification || '—'}</td><td className="font-semibold">{e.value}</td></tr>)}</tbody></table>}
            <div className="border-t border-line bg-paper px-4 py-3 text-xs text-ink-500">Fichier : {r.original_pdf_filename} · SHA-256 <span className="break-all font-mono">{r.original_pdf_sha256}</span>{r.validated_at && <><br />Validé le {formatDateTime(r.validated_at)}</>}{r.validation_note && <><br />Note : {r.validation_note}</>}</div>
          </section>
          {r.status === 'draft' && (
            <section className="card space-y-4 p-5">
              <h2 className="font-semibold">Contrôle avant publication</h2>
              <Notice tone="warn">Comparez chaque valeur au PDF original. Une fois validé, le rapport est figé.</Notice>
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run('report.validate', { report_id: r.id, ...formObject(e.currentTarget) }); }}>
                <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirm_identical" required className="mt-0.5" /> Chaque valeur saisie est strictement identique au rapport du laboratoire.</label>
                <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirm_source" required className="mt-0.5" /> Le PDF importé est le rapport original non modifié, pour cet échantillon.</label>
                <Field label="Note (facultatif)"><input name="note" className="input" /></Field>
                <button disabled={busy} className="btn-primary">Valider le rapport</button>
              </form>
              <form className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row" onSubmit={(e) => { e.preventDefault(); run('report.reject', { report_id: r.id, ...formObject(e.currentTarget) }); }}>
                <input name="note" placeholder="Motif du rejet (erreur de saisie…)" className="input" /><button disabled={busy} className="btn-ghost">Rejeter</button>
              </form>
            </section>
          )}
          {r.status === 'validated' && !cert && (
            <section className="card space-y-3 p-5">
              <h2 className="font-semibold">Générer le certificat</h2>
              <p className="text-sm text-ink-700">Crée l&apos;identifiant COA, le PDF MCLR avec QR code et la page publique de vérification. Les données sont copiées depuis ce rapport validé.</p>
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run('cert.generate', { report_id: r.id, ...formObject(e.currentTarget) }, (x) => x.certificate_id && nav(`/admin/certificat/?id=${x.certificate_id}`)); }}>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notify" defaultChecked /> Envoyer l&apos;email « certificat disponible » à {order.customer_email}</label>
                <button disabled={busy} className="btn-primary">{busy ? 'Génération…' : 'Generate Certificate'}</button>
              </form>
            </section>
          )}
          {cert && <Notice>Certificat <Link className="font-mono font-semibold underline" to={`/admin/certificat/?id=${cert.id}`}>{cert.public_id}</Link> (v{cert.current_version}, {cert.status === 'active' ? 'actif' : 'révoqué'}). Pour publier un rapport corrigé, créez une nouvelle version depuis le certificat.</Notice>}
        </div>
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3 text-sm"><span className="font-semibold">PDF original du laboratoire</span><button onClick={openPdf} className="text-brand underline">Afficher</button></div>
          {pdfUrl ? <iframe title="Rapport original" src={pdfUrl} className="h-[75vh] w-full bg-paper" /> : <div className="p-8 text-center text-sm text-ink-500">Cliquez sur « Afficher » (lien sécurisé, valable 60 s, accès journalisé).</div>}
        </section>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Certificat
export function CertificateDetail() {
  const [sp] = useSearchParams();
  const id = sp.get('id') ?? '';
  const { data, reload } = useAsync(async () => {
    const { data: c } = await supabase.from('certificates').select('*, orders(id, reference, customer_email)').eq('id', id).maybeSingle();
    if (!c) return null;
    const [{ data: versions }, { data: reports }, { data: logs }] = await Promise.all([
      supabase.from('certificate_versions').select('*').eq('certificate_id', c.id).order('version', { ascending: false }),
      supabase.from('laboratory_reports').select('id, analysis_date, created_at').eq('sample_id', c.sample_id).eq('status', 'validated').order('created_at', { ascending: false }),
      supabase.from('verification_logs').select('id, result, created_at').eq('certificate_id', c.id).order('created_at', { ascending: false }).limit(20),
    ]);
    const current = versions?.find((v) => v.version === c.current_version);
    const { data: results } = current ? await supabase.from('certificate_results').select('*').eq('certificate_version_id', current.id).order('position') : { data: [] };
    const url = `${SITE_URL}/verify/?id=${c.public_id}`;
    const qr = await QRCode.toDataURL(url, { margin: 1, width: 320, color: { dark: '#17466A', light: '#FFFFFF' } });
    return { c, versions: versions ?? [], reports: reports ?? [], logs: logs ?? [], current, results: results ?? [], url, qr };
  }, [id]);
  const { msg, busy, run } = useAction(reload);
  if (data === null) return <Empty>Certificat introuvable.</Empty>;
  if (!data) return <Loading />;
  const { c, versions, reports, logs, current, results, url, qr } = data;
  const order = one<{ id: string; reference: string }>(c.orders);
  const active = c.status === 'active';
  async function openVersion(path: string) {
    const { data: s, error } = await supabase.storage.from('certificates').createSignedUrl(path, 120);
    if (error) return alert(error.message);
    window.open(s.signedUrl, '_blank');
  }
  return (
    <>
      <Flash msg={msg} />
      <PageTitle eyebrow="Certificat" title={c.public_id}><Badge tone={active ? 'green' : 'red'}>{active ? 'Actif' : 'Révoqué'}</Badge><a href={url} target="_blank" className="btn-ghost !py-1.5">Page publique ↗</a></PageTitle>
      {!active && <div className="mb-5"><Notice tone="error">Révoqué le {formatDateTime(c.revoked_at)} — {c.revocation_reason}</Notice></div>}
      <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          {current && (
            <section className="card p-5">
              <h2 className="mb-3 font-semibold">Version en vigueur — v{current.version}</h2>
              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {[['Commande', order.reference], ['Échantillon', current.sample_reference], ['Produit', current.product_name], ['Lot', current.batch_number || '—'],
                  ["Analyse", formatDate(current.analysis_date)], ['Résultat', current.main_result || '—'], ['Émission', formatDateTime(current.issued_at)], ['Scans', String(c.scan_count)]].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 border-b border-line py-1.5"><dt className="text-ink-500">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
                ))}
              </dl>
              {results.length > 0 && <table className="table mt-4"><thead><tr><th>Paramètre</th><th>Spécification</th><th>Résultat</th></tr></thead><tbody>{results.map((x) => <tr key={x.id}><td>{x.analyte}</td><td>{x.specification || '—'}</td><td className="font-semibold">{x.value} {x.unit}</td></tr>)}</tbody></table>}
            </section>
          )}
          <section className="card overflow-hidden">
            <h2 className="px-5 pt-4 font-semibold">Historique des versions</h2>
            <div className="overflow-x-auto"><table className="table mt-2">
              <thead><tr><th>Version</th><th>Émise le</th><th>Raison</th><th>PDF</th></tr></thead>
              <tbody>{versions.map((v) => (
                <tr key={v.id}><td className="font-semibold">v{v.version}{v.version === c.current_version && <span className="ml-2 text-xs text-leaf">en vigueur</span>}</td>
                  <td className="whitespace-nowrap">{formatDateTime(v.issued_at)}</td><td>{v.change_reason}</td>
                  <td>{v.pdf_path ? <button onClick={() => openVersion(v.pdf_path)} className="text-brand underline">Ouvrir / télécharger</button>
                    : <button disabled={busy} onClick={() => run('cert.retryPdf', { version_id: v.id })} className="text-danger underline">Générer le PDF</button>}</td></tr>
              ))}</tbody>
            </table></div>
          </section>
          {active && (
            <section className="card space-y-4 p-5">
              <div><h2 className="font-semibold">Modifier / régénérer → nouvelle version</h2><p className="text-sm text-ink-500">Une version publiée n&apos;est jamais modifiée. Pour corriger une valeur, importez et validez d&apos;abord un rapport corrigé.</p></div>
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run('cert.newVersion', { certificate_id: c.id, ...formObject(e.currentTarget) }); }}>
                <Field label="Rapport source (validé)"><select name="report_id" className="input" defaultValue={current?.report_id}>{reports.map((r) => <option key={r.id} value={r.id}>Analyse du {formatDate(r.analysis_date)} — importé le {formatDateTime(r.created_at)}{r.id === current?.report_id ? ' (actuel)' : ''}</option>)}</select></Field>
                <Field label="Raison (obligatoire, visible dans l'historique public)"><input name="reason" required minLength={5} className="input" /></Field>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notify" /> Informer le client par email</label>
                <button disabled={busy} className="btn-primary">Publier une nouvelle version</button>
              </form>
            </section>
          )}
          {active && (
            <section className="card space-y-3 border-red-200 p-5">
              <h2 className="font-semibold text-danger">Révoquer le certificat</h2>
              <p className="text-sm text-ink-500">Irréversible. Le certificat reste consultable avec le statut « Certificate revoked ».</p>
              <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run('cert.revoke', { certificate_id: c.id, ...formObject(e.currentTarget) }); }}>
                <input name="reason" required minLength={5} placeholder="Motif (affiché publiquement)" className="input" />
                <div className="flex flex-col gap-2 sm:flex-row"><input name="confirm" placeholder="Tapez REVOQUER" autoComplete="off" className="input" /><button disabled={busy} className="btn-danger">Révoquer</button></div>
              </form>
            </section>
          )}
        </div>
        <aside className="space-y-5">
          <section className="card p-5 text-center">
            <img src={qr} alt={`QR ${c.public_id}`} className="mx-auto h-44 w-44" />
            <div className="mt-2 break-all font-mono text-xs text-ink-500">{url}</div>
            <a href={qr} download={`${c.public_id}-qr.png`} className="btn-ghost mt-3 w-full">Télécharger le QR</a>
          </section>
          <section className="card p-5 text-sm">
            <h2 className="mb-2 font-semibold">Traçabilité</h2>
            <div className="flex justify-between"><span className="text-ink-500">Créé</span><span>{formatDateTime(c.created_at)}</span></div>
            <div className="flex justify-between"><span className="text-ink-500">Modifié</span><span>{formatDateTime(c.updated_at)}</span></div>
            <div className="flex justify-between"><span className="text-ink-500">Commande</span><Link className="text-brand underline" to={`/admin/commande/?id=${order.id}`}>{order.reference}</Link></div>
            <h3 className="mb-1 mt-4 font-semibold">Dernières vérifications</h3>
            {!logs.length ? <p className="text-ink-500">Aucune.</p> : <ul className="space-y-1 text-xs">{logs.map((l) => <li key={l.id} className="flex justify-between"><span>{formatDateTime(l.created_at)}</span><span className="text-ink-500">{l.result}</span></li>)}</ul>}
          </section>
        </aside>
      </div>
    </>
  );
}
