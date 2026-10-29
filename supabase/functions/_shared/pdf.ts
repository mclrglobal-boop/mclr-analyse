// Générateur du certificat PDF MCLR (Deno / Supabase Edge Functions)
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from 'npm:pdf-lib@1.17.1';
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1';
import QRCode from 'npm:qrcode@1.5.4';

// Polices DejaVu (licence libre), chargées une fois par instance depuis le CDN npm
const FONT_CDN = 'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/';
const fontCache = new Map<string, Uint8Array>();
async function font(name: string) {
  if (!fontCache.has(name)) {
    const r = await fetch(FONT_CDN + name);
    if (!r.ok) throw new Error(`Police ${name} indisponible (${r.status})`);
    fontCache.set(name, new Uint8Array(await r.arrayBuffer()));
  }
  return fontCache.get(name)!;
}

export type CertificatePdfInput = {
  brandName: string;
  company: { name: string; legalDetails?: string | null; email?: string | null };
  logo?: Uint8Array | null;          // PNG ou JPEG (Paramètres) — sinon logotype texte
  publicId: string;
  version: number;
  issuedAt: string;                  // ISO
  productName: string;
  sampleReference: string;
  batchNumber: string | null;
  appearance?: string | null;
  casNumber?: string | null;
  receivedDate?: string | null;      // YYYY-MM-DD
  analysisDate: string;              // YYYY-MM-DD
  method: string;
  mainResult: string | null;
  results: { analyte: string; value: string; unit: string | null; specification: string | null }[];
  hplcImage?: Uint8Array | null;     // graphique (extrait ou tracé à partir des données du rapport)
  msImage?: Uint8Array | null;
  verifyUrl: string;
  clientName?: string | null;        // « Test for » — client final
  hplcPeaks?: { rt: string; type: string; width: string; area: string; height: string; areaPct: string }[] | null; // texte exact du rapport
  hplcCaption?: string | null;
  msCaption?: string | null;
  sampleImage?: Uint8Array | null;   // photo du flacon (vignette)
};

// Identité visuelle (propre à la marque — aucun élément repris d'un laboratoire)
const NAVY = rgb(0.09, 0.275, 0.416);       // #17466A (bleu du logo MCLR)
const NAVY_SOFT = rgb(0.925, 0.945, 0.965); // fond des valeurs
const GOLD = rgb(0.267, 0.58, 0.463);       // #449476 (vert du logo MCLR)
const INK = rgb(0.09, 0.11, 0.15);
const MUTED = rgb(0.38, 0.42, 0.49);
const LINE = rgb(0.86, 0.87, 0.89);
const WHITE = rgb(1, 1, 1);

// Logo par défaut (identique au site) : hexagone + coche
export const LOGO_HEX = 'M16 2 L28.1 9 L28.1 23 L16 30 L3.9 23 L3.9 9 Z';
export const LOGO_CHECK = 'M10 16.5 L14.5 21 L22.5 12';


function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const dateOnly = iso.length === 10;
  const d = new Date(dateOnly ? iso + 'T00:00:00Z' : iso);
  return new Intl.DateTimeFormat('fr-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: dateOnly ? 'UTC' : 'Europe/Paris' }).format(d); // AAAA-MM-JJ
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) <= maxWidth) line = test;
      else {
        if (line) lines.push(line);
        let w = word;
        while (font.widthOfTextAtSize(w, size) > maxWidth && w.length > 1) {
          let i = w.length;
          while (i > 1 && font.widthOfTextAtSize(w.slice(0, i), size) > maxWidth) i--;
          lines.push(w.slice(0, i));
          w = w.slice(i);
        }
        line = w;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Taille de police la plus grande (≥ min) permettant de tenir sur la largeur. */
function fitSize(t: string, font: PDFFont, size: number, maxWidth: number, min = 7): number {
  let s = size;
  while (s > min && font.widthOfTextAtSize(t, s) > maxWidth) s -= 0.25;
  return s;
}

async function embedImage(doc: PDFDocument, bytes?: Uint8Array | null): Promise<PDFImage | null> {
  if (!bytes || bytes.length < 8) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return doc.embedPng(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return doc.embedJpg(bytes);
  return null;
}

export async function generateCertificatePdf(input: CertificatePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [reg, bold, mono, serif] = await Promise.all([
    font('DejaVuSans.ttf'), font('DejaVuSans-Bold.ttf'), font('DejaVuSansMono.ttf'), font('DejaVuSerif-Bold.ttf'),
  ]);
  const fReg = await doc.embedFont(reg, { subset: true });
  const fBold = await doc.embedFont(bold, { subset: true });
  const fMono = await doc.embedFont(mono, { subset: true });
  const fSerif = await doc.embedFont(serif, { subset: true });
  const [logo, hplc, ms, photo] = await Promise.all([
    embedImage(doc, input.logo).catch(() => null), embedImage(doc, input.hplcImage), embedImage(doc, input.msImage),
    embedImage(doc, input.sampleImage).catch(() => null),
  ]);

  doc.setTitle(`Certificate of Analysis Verification ${input.publicId}`);
  doc.setAuthor(input.company.name);
  doc.setCreator(input.brandName);
  doc.setProducer(input.brandName);
  doc.setSubject("Certificat de vérification d'analyse — synthèse d'un rapport de laboratoire externe");
  doc.setKeywords([input.publicId, 'verification']);

  const W = 595.28, H = 841.89, M = 40, CW = W - 2 * M;
  const FOOTER = 48;
  let page: PDFPage;
  let y = 0;

  const text = (t: string, x: number, yy: number, size: number, font: PDFFont = fReg, color = INK) =>
    page.drawText(t, { x, y: yy, size, font, color });
  const textRight = (t: string, xr: number, yy: number, size: number, font: PDFFont = fReg, color = INK) =>
    text(t, xr - font.widthOfTextAtSize(t, size), yy, size, font, color);

  // ---------- En-tête (chaque page) ----------
  const header = (first: boolean) => {
    page = doc.addPage([W, H]);
    y = H - M;
    const hH = first ? 70 : 40;
    page.drawRectangle({ x: M, y: y - hH, width: CW, height: hH, borderColor: LINE, borderWidth: 1 });
    // Logo
    const logoBoxH = first ? 46 : 24;
    let lx = M + 14;
    if (logo) {
      const sc = Math.min(logoBoxH / logo.height, (first ? 170 : 110) / logo.width);
      page.drawImage(logo, { x: lx, y: y - hH / 2 - (logo.height * sc) / 2, width: logo.width * sc, height: logo.height * sc });
      lx += logo.width * sc + 14;
    } else {
      const s = logoBoxH / 32;
      page.drawSvgPath(LOGO_HEX, { x: lx, y: y - hH / 2 + logoBoxH / 2, scale: s, color: NAVY });
      page.drawSvgPath(LOGO_CHECK, { x: lx, y: y - hH / 2 + logoBoxH / 2, scale: s, borderColor: GOLD, borderWidth: 2.6 });
      lx += logoBoxH + 8;
      text(input.brandName, lx, y - hH / 2 - (first ? 7 : 4), first ? 20 : 12, fSerif, NAVY);
      lx += fSerif.widthOfTextAtSize(input.brandName, first ? 20 : 12) + 16;
    }
    if (first) {
      textRight('CERTIFICATE OF ANALYSIS', W - M - 14, y - 30, 19, fSerif, NAVY);
      textRight("VERIFICATION  /  Certificat de vérification d'analyse", W - M - 14, y - 48, 8.5, fBold, GOLD);
    } else {
      textRight(`Certificate of Analysis Verification · ${input.publicId}`, W - M - 14, y - 24, 9, fBold, NAVY);
    }
    y -= hH + 12;
  };

  const section = (en: string, fr: string) => {
    text(en.toUpperCase(), M + 2, y - 14, 12.5, fSerif, NAVY);
    text(`/  ${fr}`, M + 8 + fSerif.widthOfTextAtSize(en.toUpperCase(), 12.5), y - 14, 10, fReg, MUTED);
    y -= 24;
  };
  const ensure = (h: number) => { if (y - h < FOOTER + 10) header(false); };

  header(true);

  // ---------- Bandeau identifiant ----------
  page!.drawRectangle({ x: M, y: y - 40, width: CW, height: 40, color: NAVY });
  text('CERTIFICATE ID', M + 14, y - 15, 7, fBold, GOLD);
  text(input.publicId, M + 14, y - 32, 15, fMono, WHITE);
  // colonnes : ID | émission | réf. échantillon (numéro de version non affiché)
  const colsBand: [string, string, number, number][] = [
    ['ISSUE DATE / ÉMISSION', fmtDate(input.issuedAt), 0.42, 0.24],
    ['SAMPLE REF. / ÉCHANTILLON', input.sampleReference, 0.68, 0.32],
  ];
  colsBand.forEach(([k, v, start, width]) => {
    const x = M + CW * start;
    text(k, x, y - 15, 6.5, fBold, GOLD);
    const size = fitSize(v, fBold, 10, CW * width - 12);
    text(v, x, y - 31, size, fBold, WHITE);
  });
  y -= 54;

  // ---------- Informations échantillon ----------
  section('Sample information', 'Informations échantillon');
  const pairs: [string, string][] = [
    ...(input.clientName ? [['Test for / Client', input.clientName] as [string, string]] : []),
    ['Sample / Produit', input.productName],
    ['Lot Number / Lot', input.batchNumber || '—'],
    ['Appearance / Aspect', input.appearance || '—'],
    ['CAS No.', input.casNumber || '—'],
    ['Received / Réception', fmtDate(input.receivedDate)],
    ['Analysis / Analyse', fmtDate(input.analysisDate)],
  ];
  const PW = photo ? 78 : 0;                 // largeur réservée à la vignette du flacon
  const GW = photo ? CW - PW - 10 : CW;
  const colW = (GW - 10) / 2, labW = photo ? 92 : 104, rowH = 22;
  pairs.forEach(([k, v], i) => {
    const x = M + (i % 2) * (colW + 10);
    const yy = y - Math.floor(i / 2) * (rowH + 4);
    page!.drawRectangle({ x, y: yy - rowH, width: labW, height: rowH, color: NAVY });
    page!.drawRectangle({ x: x + labW, y: yy - rowH, width: colW - labW, height: rowH, color: NAVY_SOFT });
    text(k, x + 7, yy - 14.5, fitSize(k, fBold, 7.5, labW - 11, 6), fBold, WHITE);
    const maxW = colW - labW - 12;
    const size = fitSize(v, fBold, 9.5, maxW, 7.5);
    const lines = wrap(v, fBold, size, maxW);
    if (lines.length === 1) text(v, x + labW + 8, yy - 15, size, fBold, INK);
    else lines.slice(0, 2).forEach((l, j) => text(l, x + labW + 8, yy - 9.5 - j * 9, Math.min(size, 7.5), fBold, INK));
  });
  const gridH = Math.ceil(pairs.length / 2) * (rowH + 4) - 4;
  if (photo) {
    const bx = M + GW + 10, bh = gridH;
    page!.drawRectangle({ x: bx, y: y - bh, width: PW, height: bh, color: NAVY_SOFT });
    const sc = Math.min((PW - 6) / photo.width, (bh - 6) / photo.height);
    const w = photo.width * sc, h = photo.height * sc;
    page!.drawImage(photo, { x: bx + (PW - w) / 2, y: y - bh + (bh - h) / 2, width: w, height: h });
  }
  y -= Math.ceil(pairs.length / 2) * (rowH + 4);
  // Source
  const src = 'Tested by an independent third-party laboratory  ·  Analysé par un laboratoire tiers indépendant';
  page!.drawRectangle({ x: M, y: y - rowH, width: labW, height: rowH, color: NAVY });
  page!.drawRectangle({ x: M + labW, y: y - rowH, width: CW - labW, height: rowH, color: NAVY_SOFT });
  text('Source', M + 7, y - 14.5, 7.5, fBold, WHITE);
  const srcSize = fitSize(src, fReg, 8.5, CW - labW - 14, 6.5);
  text(src, M + labW + 8, y - 14.5, srcSize, fReg, INK);
  y -= rowH + 18;

  // ---------- Résultats ----------
  section('Test results', 'Résultats');
  const cols = [{ h: 'Test Items / Paramètre', w: 0.40 }, { h: 'Specification / Spécification', w: 0.32 }, { h: 'Result / Résultat', w: 0.28 }];
  const drawHead = () => {
    page!.drawRectangle({ x: M, y: y - 22, width: CW, height: 22, color: NAVY_SOFT });
    page!.drawLine({ start: { x: M, y: y - 22 }, end: { x: W - M, y: y - 22 }, thickness: 1.2, color: NAVY });
    let x = M + 10;
    cols.forEach((c) => { text(c.h, x, y - 15, 8.5, fBold, NAVY); x += c.w * CW; });
    y -= 22;
  };
  drawHead();
  const rows = input.results.length ? input.results : [{ analyte: input.method, value: input.mainResult || '—', unit: null, specification: null }];
  rows.forEach((r) => {
    const cells = [r.analyte, r.specification || '—', `${r.value}${r.unit ? ` ${r.unit}` : ''}`];
    const wrapped = cells.map((c, i) => wrap(c, i === 2 ? fBold : i === 0 ? fBold : fReg, 9.5, cols[i].w * CW - 16));
    const h = Math.max(...wrapped.map((l) => l.length)) * 12.5 + 10;
    if (y - h < FOOTER + 140) { header(false); section('Test results (cont.)', 'Résultats (suite)'); drawHead(); }
    let x = M + 10;
    wrapped.forEach((lines, i) => {
      lines.forEach((ln, j) => text(ln, x, y - 15 - j * 12.5, 9.5, i === 1 ? fReg : fBold, i === 2 ? NAVY : INK));
      x += cols[i].w * CW;
    });
    y -= h;
    page!.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: LINE });
  });
  y -= 16;

  // ---------- Tableau des pics HPLC (valeurs recopiées du rapport) ----------
  if (input.hplcPeaks?.length) {
    ensure(60 + input.hplcPeaks.length * 18);
    section('HPLC peak table', 'Tableau des pics HPLC');
    const pc = [['RT [min]', 0.16], ['Type', 0.14], ['Width [min]', 0.16], ['Area', 0.20], ['Height', 0.17], ['Area %', 0.17]] as const;
    page!.drawRectangle({ x: M, y: y - 20, width: CW, height: 20, color: NAVY_SOFT });
    let hx = M + 10;
    pc.forEach(([h, w]) => { text(h, hx, y - 14, 8.5, fBold, NAVY); hx += w * CW; });
    y -= 20;
    input.hplcPeaks.forEach((r) => {
      const vals = [r.rt, r.type, r.width, r.area, r.height, r.areaPct];
      let x = M + 10;
      vals.forEach((v, i) => { text(String(v ?? ''), x, y - 13, 9, i === 5 ? fBold : fMono, i === 5 ? NAVY : INK); x += pc[i][1] * CW; });
      y -= 18;
      page!.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: LINE });
    });
    y -= 12;
    text('Valeurs recopiées sans modification depuis le rapport du laboratoire indépendant.', M + 2, y, 7, fReg, MUTED);
    y -= 18;
  }

  // ---------- Graphiques ----------
  const figure = (img: PDFImage, en: string, fr: string, caption?: string | null) => {
    const maxW = CW - 20, maxH = 250;
    const sc = Math.min(maxW / img.width, maxH / img.height);
    const w = img.width * sc, h = img.height * sc;
    ensure(h + 60);
    section(en, fr);
    page!.drawRectangle({ x: M, y: y - h - 20, width: CW, height: h + 20, borderColor: LINE, borderWidth: 1 });
    page!.drawImage(img, { x: M + (CW - w) / 2, y: y - h - 10, width: w, height: h });
    y -= h + 32;
    const cap = wrap(caption || 'Source : extrait du rapport du laboratoire indépendant — reproduit sans modification.', fReg, 7, CW - 4);
    cap.forEach((l, i) => text(l, M + 2, y + 4 - i * 9, 7, fReg, MUTED));
    y -= 12 + (cap.length - 1) * 9;
  };
  if (hplc) figure(hplc, 'HPLC chromatogram', 'Chromatogramme HPLC', input.hplcCaption);
  if (ms) figure(ms, 'Mass spectrum', 'Spectre de masse', input.msCaption);

  // ---------- Vérification + mentions ----------
  // QR code vectoriel (aucune dépendance image)
  const qrModel = QRCode.create(input.verifyUrl, { errorCorrectionLevel: 'M' });
  const drawQr = (pg: PDFPage, x0: number, y0: number, size: number) => {
    const n = qrModel.modules.size, cell = size / (n + 2);
    pg.drawRectangle({ x: x0, y: y0, width: size, height: size, color: WHITE });
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (qrModel.modules.get(r, c)) pg.drawRectangle({ x: x0 + (c + 1) * cell, y: y0 + size - (r + 2) * cell, width: cell + 0.05, height: cell + 0.05, color: NAVY });
    }
  };
  ensure(110);

  const qs = 86;
  page!.drawRectangle({ x: M, y: y - 104, width: CW, height: 104, borderColor: NAVY, borderWidth: 1.2 });
  drawQr(page!, M + 10, y - 10 - qs, qs);
  const tx = M + qs + 24;
  text('AUTHENTICITY VERIFICATION  /  VÉRIFICATION D\'AUTHENTICITÉ', tx, y - 20, 8.5, fBold, NAVY);
  wrap(`Scannez le QR code ou ouvrez le lien ci-dessous : la page affiche les données enregistrées dans la base de ${input.company.name}, le statut (valide / révoqué) et la version en vigueur. Toute différence avec ce document signale une falsification.`, fReg, 7.8, CW - qs - 36)
    .forEach((l, i) => text(l, tx, y - 34 - i * 10, 7.8, fReg, MUTED));
  text(input.verifyUrl, tx, y - 80, 8.5, fMono, NAVY);
  text(`Certificate ID : ${input.publicId}`, tx, y - 93, 8, fBold, INK);
  y -= 116;

  // ---------- Pied de page ----------
  const pages = doc.getPages();
  pages.forEach((pg, i) => {
    const legal = [input.company.name, input.company.legalDetails, input.company.email].filter(Boolean).join(' · ');
    pg.drawLine({ start: { x: M, y: 34 }, end: { x: W - M, y: 34 }, thickness: 0.6, color: GOLD });
    pg.drawText(legal.slice(0, 130), { x: M, y: 22, size: 7, font: fReg, color: MUTED });
    const right = `${input.publicId} · ${i + 1}/${pages.length}`;
    pg.drawText(right, { x: W - M - fMono.widthOfTextAtSize(right, 7), y: 22, size: 7, font: fMono, color: MUTED });
  });

  return doc.save();
}
