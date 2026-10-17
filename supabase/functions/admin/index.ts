// API d'administration : toutes les écritures sensibles. Chaque appel vérifie que l'utilisateur est admin.
// Les lectures du back-office se font directement depuis le navigateur (RLS : lecture réservée aux admins).
import { corsHeaders, db, fail, getSettings, json, logAdmin, sha256Hex, siteUrl, UUID_RE, verifyUrl, type Settings } from '../_shared/core.ts';
import { sendLabOrder, setOrderStatus } from '../_shared/email.ts';
import { stripe } from '../_shared/stripe.ts';
import { generateCertificatePdf } from '../_shared/pdf.ts';

type Admin = { id: string; email: string };
type Input = Record<string, string | File | undefined>;

const uuid = (v: unknown, name = 'id') => {
  if (typeof v !== 'string' || !UUID_RE.test(v)) throw new Error(`${name} invalide`);
  return v;
};
const txt = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const opt = (v: unknown, max = 500) => txt(v, max) || null;
const reason = (v: unknown) => {
  const r = txt(v, 500);
  if (r.length < 5) throw new Error('Raison obligatoire (5 caractères minimum)');
  return r;
};
const isoDate = (v: unknown, required = false) => {
  const s = txt(v, 10);
  if (!s && !required) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('Date invalide (AAAA-MM-JJ)');
  return s;
};

async function requireAdmin(req: Request): Promise<Admin> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data } = await db().auth.getUser(token);
  if (!data.user) throw Object.assign(new Error('Non authentifié'), { status: 401 });
  const { data: u } = await db().from('users').select('id, email, role').eq('id', data.user.id).maybeSingle();
  if (!u || u.role !== 'admin') throw Object.assign(new Error('Accès réservé aux administrateurs'), { status: 403 });
  return { id: u.id, email: u.email };
}

async function readInput(req: Request): Promise<Input> {
  const type = req.headers.get('content-type') ?? '';
  if (type.includes('multipart/form-data')) {
    const fd = await req.formData();
    const out: Input = {};
    for (const [k, v] of fd.entries()) out[k] = v as string | File;
    return out;
  }
  return await req.json().catch(() => ({}));
}

async function pdfBytes(f: unknown, max = 15 * 1024 * 1024) {
  if (!(f instanceof File) || f.size === 0) throw new Error('Fichier PDF manquant');
  if (f.size > max) throw new Error('PDF trop volumineux (15 Mo max)');
  const b = new Uint8Array(await f.arrayBuffer());
  if (new TextDecoder().decode(b.slice(0, 5)) !== '%PDF-') throw new Error('Fichier non reconnu comme PDF');
  if (!new TextDecoder().decode(b.slice(Math.max(0, b.length - 1024))).includes('%%EOF')) throw new Error('PDF incomplet ou corrompu');
  return b;
}

async function imageBytes(f: unknown, max = 5 * 1024 * 1024) {
  if (!(f instanceof File) || f.size === 0) return null;
  if (f.size > max) throw new Error('Image trop volumineuse (5 Mo max)');
  const b = new Uint8Array(await f.arrayBuffer());
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { b, ext: 'png', type: 'image/png' };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { b, ext: 'jpg', type: 'image/jpeg' };
  throw new Error('Image invalide : PNG ou JPEG uniquement');
}

async function download(path: string | null | undefined) {
  if (!path) return null;
  const { data } = await db().storage.from('certificates').download(path);
  return data ? new Uint8Array(await data.arrayBuffer()) : null;
}

/** Génère et stocke le PDF d'une version (si absent). La version devient alors immuable. */
async function renderVersionPdf(versionId: string, site: string, s: Settings) {
  const { data: v } = await db().from('certificate_versions').select('*, certificates!inner(public_id)').eq('id', versionId).single();
  if (!v) throw new Error('Version introuvable');
  if (v.pdf_path) return v.pdf_path as string;
  const { data: results } = await db().from('certificate_results').select('analyte, value, unit, specification')
    .eq('certificate_version_id', versionId).order('position');
  let logo = await download(s.logo_path);
  if (!logo) logo = await fetch(`${site}/brand/mclr-logo.png`).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => (b ? new Uint8Array(b) : null)).catch(() => null);
  const publicId = (v.certificates as { public_id: string }).public_id;
  const pdf = await generateCertificatePdf({
    brandName: 'MCLR',
    company: { name: s.company_name, legalDetails: s.company_legal_details, email: s.company_email },
    logo, publicId, version: v.version, issuedAt: v.issued_at,
    productName: v.product_name, sampleReference: v.sample_reference, batchNumber: v.batch_number,
    appearance: v.appearance, casNumber: v.cas_number, receivedDate: v.received_date,
    analysisDate: v.analysis_date, method: v.method, mainResult: v.main_result, results: results ?? [],
    hplcImage: await download(v.hplc_image_path), msImage: await download(v.ms_image_path),
    verifyUrl: verifyUrl(site, publicId),
    clientName: v.client_name, hplcPeaks: v.hplc_peaks, hplcCaption: v.hplc_caption, msCaption: v.ms_caption,
  });
  const path = `${publicId}/v${v.version}-${versionId}.pdf`;
  const { error: up } = await db().storage.from('certificates').upload(path, pdf, { contentType: 'application/pdf', upsert: false });
  if (up && !/exists|duplicate/i.test(up.message)) throw new Error(`Upload PDF : ${up.message}`);
  const { error } = await db().from('certificate_versions').update({ pdf_path: path, pdf_sha256: await sha256Hex(pdf) }).eq('id', versionId);
  if (error) throw new Error(error.message);
  return path;
}

async function issue(reportId: string, actor: Admin, why: string | null, certificateId: string | null, site: string, s: Settings) {
  const { data, error } = await db().rpc('issue_certificate_version', {
    p_report_id: reportId, p_actor: actor.id, p_reason: why, p_certificate_id: certificateId, p_show_lab: false,
  });
  if (error) throw new Error(error.message);
  const row = (data as { certificate_id: string; public_id: string; version: number; version_id: string }[])[0];
  await renderVersionPdf(row.version_id, site, s);
  await logAdmin(actor.id, certificateId ? 'certificate.new_version' : 'certificate.create', 'certificate', row.certificate_id,
    { public_id: row.public_id, version: row.version, report_id: reportId, reason: why });
  return row;
}

const SETTINGS_FIELDS = ['company_name', 'company_legal_details', 'company_email', 'shipping_recipient', 'shipping_address',
  'shipping_postal_code', 'shipping_city', 'shipping_country', 'shipping_phone', 'shipping_instructions',
  'lab_name', 'lab_email', 'lab_order_notes', 'site_url'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('Méthode non autorisée', 405);
  let admin: Admin;
  try { admin = await requireAdmin(req); } catch (e) { return fail((e as Error).message, (e as { status?: number }).status ?? 401); }

  try {
    const input = await readInput(req);
    const action = String(input.action ?? '');
    const s = await getSettings();
    const site = siteUrl(s);
    const base = db();

    switch (action) {
      case 'me':
        return json({ ok: true, email: admin.email });

      // ---------------- Paramètres ----------------
      case 'settings.save': {
        const patch: Record<string, unknown> = {};
        for (const k of SETTINGS_FIELDS) patch[k] = opt(input[k], 2000);
        if (!patch.company_name) throw new Error("Nom de l'entreprise obligatoire");
        if (!patch.lab_name) patch.lab_name = s.lab_name;
        for (const k of ['company_email', 'lab_email']) {
          if (patch[k] && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(patch[k]))) throw new Error(`Email invalide : ${k}`);
        }
        if (patch.site_url && !/^https:\/\/[^\s/]+$/.test(String(patch.site_url).replace(/\/$/, ''))) throw new Error('Adresse du site invalide (https://domaine.com)');
        patch.lab_auto_order = input.lab_auto_order === 'on' || input.lab_auto_order === 'true';
        const logo = await imageBytes(input.logo, 2 * 1024 * 1024);
        if (logo) {
          const path = `branding/logo-${Date.now()}.${logo.ext}`;
          const { error } = await base.storage.from('certificates').upload(path, logo.b, { contentType: logo.type });
          if (error) throw new Error(`Logo : ${error.message}`);
          patch.logo_path = path;
        }
        if (input.remove_logo === 'on') patch.logo_path = null;
        const { error } = await base.from('settings').update(patch).eq('id', 1);
        if (error) throw new Error(error.message);
        await logAdmin(admin.id, 'settings.update', 'settings', '1', { ...patch, logo_path: patch.logo_path ?? undefined });
        return json({ ok: 'Paramètres enregistrés' });
      }

      // ---------------- Produits ----------------
      case 'product.save': {
        const name = txt(input.name, 120), slug = txt(input.slug, 80).toLowerCase(), method = txt(input.method, 120);
        const price = Number(String(input.price_eur ?? '').replace(',', '.'));
        if (name.length < 2 || method.length < 2) throw new Error('Nom et méthode obligatoires');
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new Error('Slug : minuscules, chiffres et tirets');
        if (!(price >= 0.5 && price <= 100000)) throw new Error('Prix invalide');
        const cmpRaw = String(input.compare_eur ?? '').trim().replace(',', '.');
        const cmp = cmpRaw ? Number(cmpRaw) : null;
        if (cmp !== null && !(cmp > price && cmp <= 100000)) throw new Error('Prix barré : doit être supérieur au prix');
        const row = {
          name, slug, method, price_cents: Math.round(price * 100), description: txt(input.description, 4000),
          compare_at_cents: cmp === null ? null : Math.round(cmp * 100), highlight: txt(input.highlight, 40) || null,
          turnaround: txt(input.turnaround, 120), technical_info: txt(input.technical_info, 4000),
          active: input.active === true || input.active === 'on' || input.active === 'true', sort_order: Number(input.sort_order) || 0,
        };
        if (input.id) {
          const { error } = await base.from('products').update(row).eq('id', uuid(input.id));
          if (error) throw new Error(error.message);
        } else {
          const { error } = await base.from('products').insert(row);
          if (error) throw new Error(error.code === '23505' ? 'Ce slug existe déjà' : error.message);
        }
        await logAdmin(admin.id, input.id ? 'product.update' : 'product.create', 'product', (input.id as string) ?? null, row);
        return json({ ok: 'Produit enregistré' });
      }

      // ---------------- Commandes & échantillons ----------------
      case 'sample.update': {
        const sampleId = uuid(input.sample_id, 'sample_id'), orderId = uuid(input.order_id, 'order_id');
        const step = txt(input.step, 20);
        const patch: Record<string, unknown> = {
          product_name: opt(input.product_name, 200), batch_number: opt(input.batch_number, 120), notes: opt(input.notes, 2000),
        };
        if (step === 'received') { patch.status = 'received'; patch.received_at = new Date().toISOString(); }
        if (step === 'sent_to_lab') patch.status = 'sent_to_lab';
        const { error } = await base.from('samples').update(patch).eq('id', sampleId);
        if (error) throw new Error(error.message);
        if (step === 'received') await setOrderStatus(site, s, orderId, 'sample_received');
        if (step === 'sent_to_lab') await setOrderStatus(site, s, orderId, 'analysis_in_progress');
        await logAdmin(admin.id, `sample.${step || 'save'}`, 'sample', sampleId, patch);
        return json({ ok: step ? 'Statut mis à jour — email envoyé au client' : 'Échantillon mis à jour' });
      }

      case 'order.resendLab': {
        const orderId = uuid(input.order_id, 'order_id');
        const r = await sendLabOrder(site, s, orderId, true);
        await logAdmin(admin.id, 'lab_order.resend', 'order', orderId, r);
        return r.sent ? json({ ok: 'Bon de commande envoyé au laboratoire' }) : fail(r.reason ?? 'Échec');
      }

      case 'order.refund': {
        const orderId = uuid(input.order_id, 'order_id');
        if (input.confirm !== 'REMBOURSER') throw new Error('Tapez REMBOURSER pour confirmer');
        const { data: o } = await base.from('orders').select('stripe_payment_intent_id, status').eq('id', orderId).single();
        if (!o?.stripe_payment_intent_id) throw new Error('Aucun paiement Stripe associé');
        if (o.status === 'refunded') throw new Error('Déjà remboursée');
        await stripe('POST', '/refunds', { payment_intent: o.stripe_payment_intent_id }, `refund-${orderId}`);
        await base.from('orders').update({ status: 'refunded' }).eq('id', orderId);
        await logAdmin(admin.id, 'order.refund', 'order', orderId);
        return json({ ok: 'Remboursement effectué via Stripe' });
      }

      // ---------------- Rapports laboratoire ----------------
      case 'report.import': {
        const orderId = uuid(input.order_id, 'order_id');
        const productName = txt(input.product_name, 200), labName = txt(input.laboratory_name, 200), method = txt(input.method, 200);
        if (!productName || labName.length < 2 || method.length < 2) throw new Error('Produit, laboratoire et méthode obligatoires');
        let extra: { analyte: string; value: string; unit?: string; specification?: string }[] = [];
        try { extra = JSON.parse(String(input.additional_results || '[]')); } catch { throw new Error('Résultats complémentaires invalides'); }
        if (!Array.isArray(extra) || extra.length > 50) throw new Error('Résultats complémentaires invalides');
        extra = extra.map((r) => ({ analyte: txt(r.analyte, 200), value: txt(r.value, 200), unit: txt(r.unit, 60), specification: txt(r.specification, 200) }))
          .filter((r) => r.analyte && r.value);

        const pdf = await pdfBytes(input.original_pdf);
        const hplc = await imageBytes(input.hplc_image), ms = await imageBytes(input.ms_image);
        const { data: sample } = await base.from('samples').select('id').eq('order_id', orderId).single();
        if (!sample) throw new Error('Échantillon introuvable pour cette commande');

        const reportId = crypto.randomUUID();
        const pdfPath = `${orderId}/${reportId}.pdf`;
        const { error: upErr } = await base.storage.from('lab-reports').upload(pdfPath, pdf, { contentType: 'application/pdf', upsert: false });
        if (upErr) throw new Error(`Upload : ${upErr.message}`);
        const images: Record<string, string> = {};
        for (const [key, img] of [['hplc_image_path', hplc], ['ms_image_path', ms]] as const) {
          if (!img) continue;
          const p = `reports/${reportId}/${key.replace('_image_path', '')}.${img.ext}`;
          const { error } = await base.storage.from('certificates').upload(p, img.b, { contentType: img.type });
          if (error) throw new Error(`Upload image : ${error.message}`);
          images[key] = p;
        }
        const batch = opt(input.batch_number, 120);
        const { error } = await base.from('laboratory_reports').insert({
          id: reportId, order_id: orderId, sample_id: sample.id, product_name: productName, batch_number: batch,
          received_date: isoDate(input.received_date), analysis_date: isoDate(input.analysis_date, true),
          laboratory_name: labName, laboratory_display_authorized: false, laboratory_report_number: opt(input.laboratory_report_number, 120),
          appearance: opt(input.appearance, 120), cas_number: opt(input.cas_number, 40), purity_specification: opt(input.purity_specification, 120),
          method, purity_result: opt(input.purity_result, 200), additional_results: extra, observations: opt(input.observations, 4000),
          original_pdf_path: pdfPath, original_pdf_sha256: await sha256Hex(pdf), original_pdf_filename: (input.original_pdf as File).name.slice(0, 200),
          created_by: admin.id, ...images,
        });
        if (error) throw new Error(error.message);
        await base.from('samples').update({ status: 'analyzed', product_name: productName, batch_number: batch }).eq('id', sample.id);
        const { data: o } = await base.from('orders').select('status').eq('id', orderId).single();
        if (o && !['results_available', 'certificate_available'].includes(o.status)) await setOrderStatus(site, s, orderId, 'results_available');
        await logAdmin(admin.id, 'report.import', 'laboratory_report', reportId, { order_id: orderId });
        return json({ ok: 'Rapport importé. Vérifiez-le puis validez-le.', report_id: reportId });
      }

      case 'report.validate': {
        const id = uuid(input.report_id, 'report_id');
        if (!(input.confirm_identical === 'on' || input.confirm_identical === 'true') || !(input.confirm_source === 'on' || input.confirm_source === 'true')) {
          throw new Error('Cochez les deux confirmations de contrôle avant de valider');
        }
        const { error } = await base.rpc('validate_lab_report', { p_report_id: id, p_actor: admin.id, p_note: opt(input.note, 1000) });
        if (error) throw new Error(error.message);
        await logAdmin(admin.id, 'report.validate', 'laboratory_report', id);
        return json({ ok: 'Rapport validé — le certificat peut être généré' });
      }

      case 'report.reject': {
        const id = uuid(input.report_id, 'report_id');
        const note = reason(input.note);
        const { error } = await base.from('laboratory_reports').update({ status: 'rejected', validation_note: note }).eq('id', id);
        if (error) throw new Error(error.message);
        await logAdmin(admin.id, 'report.reject', 'laboratory_report', id, { note });
        return json({ ok: 'Rapport rejeté. Importez une version corrigée.' });
      }

      // ---------------- Certificats ----------------
      case 'cert.generate': {
        const reportId = uuid(input.report_id, 'report_id');
        const row = await issue(reportId, admin, null, null, site, s);
        if (input.notify === 'on' || input.notify === 'true') {
          const { data: r } = await base.from('laboratory_reports').select('order_id').eq('id', reportId).single();
          if (r) await setOrderStatus(site, s, r.order_id, 'certificate_available', row.public_id);
        }
        return json({ ok: `Certificat ${row.public_id} généré et publié`, certificate_id: row.certificate_id });
      }

      case 'cert.newVersion': {
        const certId = uuid(input.certificate_id, 'certificate_id');
        const row = await issue(uuid(input.report_id, 'report_id'), admin, reason(input.reason), certId, site, s);
        if (input.notify === 'on' || input.notify === 'true') {
          const { data: c } = await base.from('certificates').select('order_id').eq('id', certId).single();
          if (c) await setOrderStatus(site, s, c.order_id, 'certificate_available', row.public_id);
        }
        return json({ ok: `Version ${row.version} publiée` });
      }

      case 'cert.revoke': {
        const certId = uuid(input.certificate_id, 'certificate_id');
        const why = reason(input.reason);
        if (input.confirm !== 'REVOQUER') throw new Error('Tapez REVOQUER pour confirmer');
        const { error } = await base.rpc('revoke_certificate', { p_certificate_id: certId, p_actor: admin.id, p_reason: why });
        if (error) throw new Error(error.message);
        await logAdmin(admin.id, 'certificate.revoke', 'certificate', certId, { reason: why });
        return json({ ok: 'Certificat révoqué' });
      }

      case 'cert.retryPdf': {
        const versionId = uuid(input.version_id, 'version_id');
        await renderVersionPdf(versionId, site, s);
        await logAdmin(admin.id, 'certificate.pdf_retry', 'certificate_version', versionId);
        return json({ ok: 'PDF généré' });
      }

      case 'file.lab': {
        // Accès au PDF original du labo : URL signée 60 s, chaque accès journalisé
        const id = uuid(input.report_id, 'report_id');
        const { data: r } = await base.from('laboratory_reports').select('original_pdf_path').eq('id', id).single();
        if (!r) throw new Error('Rapport introuvable');
        const { data, error } = await base.storage.from('lab-reports').createSignedUrl(r.original_pdf_path, 60);
        if (error) throw new Error(error.message);
        await logAdmin(admin.id, 'report.original_access', 'laboratory_report', id);
        return json({ url: data.signedUrl });
      }

      default:
        return fail('Action inconnue', 404);
    }
  } catch (e) {
    console.error('[admin]', e);
    return fail((e as Error).message, 400);
  }
});
