// Emails transactionnels — envoi SMTP (Gmail par défaut, port 465 TLS)
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';
import { db, orderUrl, verifyUrl, type Settings } from './core.ts';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const p = (t: string) => `<p style="margin:0 0 12px;line-height:1.55">${t}</p>`;

function layout(site: string, s: Settings, title: string, body: string, cta?: { label: string; href: string }) {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#F4F6F8;font-family:Arial,Helvetica,sans-serif;color:#0E2236">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #E2E6EA;border-radius:12px">
<tr><td style="padding:22px 28px;border-bottom:1px solid #E2E6EA">
<img src="${esc(site)}/brand/mclr-logo.png" alt="MCLR" height="36" style="height:36px;width:auto;display:block"></td></tr>
<tr><td style="padding:28px">
<h1 style="font-size:20px;margin:0 0 16px;color:#17466A">${esc(title)}</h1>
${body}
${cta ? `<p style="margin:28px 0 8px"><a href="${esc(cta.href)}" style="background:#17466A;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;display:inline-block">${esc(cta.label)}</a></p>` : ''}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #E2E6EA;font-size:12px;color:#4F6780">
${esc(s.company_name)} — analyses réalisées par des laboratoires tiers indépendants.${s.company_email ? `<br>Contact : ${esc(s.company_email)}` : ''}
</td></tr></table></td></tr></table></body></html>`;
}

/** Envoie un email. Sans identifiants SMTP configurés : journalise et renvoie ok=false. */
export async function send(to: string, subject: string, html: string, opts: { replyTo?: string | null; cc?: string | null } = {}) {
  const user = Deno.env.get('SMTP_USER');
  const pass = Deno.env.get('SMTP_PASSWORD');
  if (!user || !pass) {
    console.warn(`[email] SMTP non configuré — non envoyé : ${to} | ${subject}`);
    return { ok: false };
  }
  const client = new SMTPClient({
    connection: {
      hostname: Deno.env.get('SMTP_HOST') || 'smtp.gmail.com',
      port: Number(Deno.env.get('SMTP_PORT') || 465),
      tls: true,
      auth: { username: user, password: pass },
    },
  });
  try {
    await client.send({
      from: `MCLR <${user}>`,
      to,
      cc: opts.cc || undefined,
      replyTo: opts.replyTo || undefined,
      subject,
      content: 'Ce message nécessite un client email compatible HTML.',
      html,
    });
    return { ok: true };
  } catch (e) {
    console.error('[email] échec', to, (e as Error).message);
    return { ok: false };
  } finally {
    await client.close().catch(() => {});
  }
}

type OrderLike = { reference: string; customer_email: string; product_name: string; access_token: string };

export function emails(site: string, s: Settings) {
  const L = (title: string, body: string, cta?: { label: string; href: string }) => layout(site, s, title, body, cta);
  return {
    orderConfirmed(o: OrderLike & { amount: string }) {
      return send(o.customer_email, `Commande confirmée — ${o.reference}`, L('Commande confirmée',
        p('Merci pour votre commande. Votre paiement a bien été reçu.') +
        p(`<b>Référence :</b> <span style="font-family:monospace">${esc(o.reference)}</span><br><b>Analyse :</b> ${esc(o.product_name)}<br><b>Montant :</b> ${esc(o.amount)}`) +
        p("Les instructions d'envoi de votre échantillon vous sont transmises dans un email séparé et restent consultables sur votre page de commande."),
        { label: 'Voir ma commande', href: orderUrl(site, o) }));
    },

    shippingInstructions(o: OrderLike & { sample_reference?: string }) {
      const addr = [s.shipping_recipient, s.shipping_address, `${s.shipping_postal_code ?? ''} ${s.shipping_city ?? ''}`.trim(), s.shipping_country, s.shipping_phone ? `Tél. : ${s.shipping_phone}` : null]
        .filter(Boolean).map(esc).join('<br>');
      return send(o.customer_email, `Instructions d'expédition — ${o.reference}`, L("Instructions d'expédition de l'échantillon",
        p("Merci d'envoyer votre échantillon à l'adresse suivante :") +
        `<div style="background:#EEF4F9;border:1px solid #DCE8F2;border-radius:8px;padding:14px 16px;margin:0 0 14px;line-height:1.6">${addr}</div>` +
        p(`<b>Indiquez la référence <span style="font-family:monospace">${esc(o.reference)}</span>${o.sample_reference ? ` et la référence échantillon <span style="font-family:monospace">${esc(o.sample_reference)}</span>` : ''} sur le colis et sur le flacon.</b>`) +
        (s.shipping_instructions ? p(esc(s.shipping_instructions).replace(/\n/g, '<br>')) : ''),
        { label: 'Voir ma commande', href: orderUrl(site, o) }));
    },

    sampleReceived(o: OrderLike) {
      return send(o.customer_email, `Échantillon reçu — ${o.reference}`, L('Échantillon reçu',
        p(`Votre échantillon pour la commande <b>${esc(o.reference)}</b> a bien été reçu par le laboratoire.`),
        { label: 'Suivre ma commande', href: orderUrl(site, o) }));
    },

    analysisInProgress(o: OrderLike) {
      return send(o.customer_email, `Analyse en cours — ${o.reference}`, L('Analyse en cours',
        p(`L'analyse de votre échantillon (commande <b>${esc(o.reference)}</b>) est en cours.`),
        { label: 'Suivre ma commande', href: orderUrl(site, o) }));
    },

    resultsAvailable(o: OrderLike) {
      return send(o.customer_email, `Résultat disponible — ${o.reference}`, L('Résultat disponible',
        p(`Le rapport d'analyse de votre échantillon (commande <b>${esc(o.reference)}</b>) a été reçu. Après vérification, votre certificat vous sera envoyé.`),
        { label: 'Suivre ma commande', href: orderUrl(site, o) }));
    },

    certificateAvailable(o: OrderLike, publicId: string) {
      return send(o.customer_email, `Votre certificat de vérification est disponible — ${publicId}`, L('Votre certificat de vérification est disponible.',
        p(`Le certificat lié à votre commande <b>${esc(o.reference)}</b> est publié.`) +
        p(`<b>Identifiant :</b> <span style="font-family:monospace">${esc(publicId)}</span>`) +
        p('Il peut être vérifié à tout moment en scannant son QR code ou via le lien ci-dessous.'),
        { label: 'Vérifier mon certificat', href: verifyUrl(site, publicId) }));
    },

    /** Bon de commande au laboratoire (anglais, aucune donnée client). */
    labOrder(o: { orderReference: string; sampleReference: string; analysis: string; method: string; sampleName: string | null; batchNumber: string | null }) {
      const row = (k: string, v: string | null) =>
        `<tr><td style="padding:6px 10px;border:1px solid #E2E6EA;background:#F4F6F8;font-weight:bold;width:42%">${esc(k)}</td><td style="padding:6px 10px;border:1px solid #E2E6EA">${esc(v || '—')}</td></tr>`;
      const body =
        p(`Dear ${esc(s.lab_name)} team,`) +
        p('Please register the following test order. The sample will be shipped <b>directly to your laboratory</b> by our customer, labelled with the references below.') +
        `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px;margin:0 0 14px">` +
        row('Client / Test for', s.company_name) + row('Our order reference', o.orderReference) +
        row('Sample reference (on vial & parcel)', o.sampleReference) + row('Requested analysis', `${o.analysis} — ${o.method}`) +
        row('Sample name', o.sampleName) + row('Lot / batch number', o.batchNumber) + `</table>` +
        (s.lab_order_notes ? p(esc(s.lab_order_notes).replace(/\n/g, '<br>')) : '') +
        p(`Please issue the test report in the name of <b>${esc(s.company_name)}</b>, quote the sample reference <b>${esc(o.sampleReference)}</b>, and send it to ${esc(s.company_email || 'this address')}. Payment as per our usual terms.`) +
        p(`Thank you,<br>${esc(s.company_name)}`);
      return send(s.lab_email!, `New test order ${o.orderReference} / sample ${o.sampleReference} — ${o.analysis}`,
        L(`Test order ${o.orderReference}`, body), { replyTo: s.company_email, cc: s.company_email });
    },
  };
}

/** Change le statut d'une commande et envoie l'email client correspondant. */
export async function setOrderStatus(site: string, s: Settings, orderId: string, status: string, publicId?: string) {
  const { data: o, error } = await db().from('orders').update({ status }).eq('id', orderId)
    .select('reference, customer_email, product_name, access_token').single();
  if (error || !o) throw new Error(error?.message || 'Commande introuvable');
  const m = emails(site, s);
  if (status === 'sample_received') await m.sampleReceived(o);
  if (status === 'analysis_in_progress') await m.analysisInProgress(o);
  if (status === 'results_available') await m.resultsAvailable(o);
  if (status === 'certificate_available' && publicId) await m.certificateAvailable(o, publicId);
}

/** Bon de commande automatique au labo (idempotent sauf renvoi forcé). */
export async function sendLabOrder(site: string, s: Settings, orderId: string, force = false) {
  if (!s.lab_email) return { sent: false, reason: 'Email du laboratoire non configuré' };
  const { data: o } = await db().from('orders').select('id, reference, product_name, status, lab_notified_at, products(method)').eq('id', orderId).single();
  if (!o) return { sent: false, reason: 'Commande introuvable' };
  if (!force && (!s.lab_auto_order || o.lab_notified_at)) return { sent: false, reason: 'déjà transmis ou désactivé' };
  if (['pending', 'payment_failed', 'refunded', 'cancelled'].includes(o.status)) return { sent: false, reason: 'commande non payée' };
  const { data: smp } = await db().from('samples').select('reference, product_name, batch_number').eq('order_id', o.id).single();
  const r = await emails(site, s).labOrder({
    orderReference: o.reference, sampleReference: smp?.reference ?? '', analysis: o.product_name,
    method: (o.products as unknown as { method: string } | null)?.method ?? '',
    sampleName: smp?.product_name ?? null, batchNumber: smp?.batch_number ?? null,
  });
  if (!r.ok) return { sent: false, reason: "Échec d'envoi (SMTP non configuré ?)" };
  await db().from('orders').update({ lab_notified_at: new Date().toISOString() }).eq('id', o.id);
  return { sent: true };
}
