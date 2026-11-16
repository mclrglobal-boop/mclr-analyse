// Lecture d'un rapport de laboratoire dans le navigateur : rendu des pages (PDF ou image),
// envoi à la lecture IA (fonction admin), recadrage des graphiques / photo, conversion image → PDF pour l'archive.
import { adminApi } from './supabase';

export type Figure = { kind: 'hplc' | 'ms' | 'vial_photo'; page: number; x0: number; y0: number; x1: number; y1: number; branding_inside: boolean };
export type Extracted = {
  product_name: string | null; batch_number: string | null; appearance: string | null; cas_number: string | null;
  received_date: string | null; analysis_date: string | null; laboratory_name: string | null; laboratory_report_number: string | null;
  method: string | null; purity_result: string | null; purity_specification: string | null;
  additional_results: { analyte: string; value: string; specification: string | null }[];
  observations: string | null; source_type: 'independent' | 'manufacturer' | 'unknown'; source_evidence: string | null;
  figures: Figure[]; warnings: string[];
};

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

/** Rend chaque page (8 max) sur un canvas haute définition. */
export async function renderPages(file: File): Promise<HTMLCanvasElement[]> {
  if (isPdf(file)) {
    const pdfjs = await import('pdfjs-dist');
    const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = worker;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const out: HTMLCanvasElement[] = [];
    for (let i = 1; i <= Math.min(doc.numPages, 8); i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(3, 2400 / Math.max(base.width, base.height)) });
      const c = document.createElement('canvas');
      c.width = Math.round(viewport.width); c.height = Math.round(viewport.height);
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      out.push(c);
    }
    return out;
  }
  if (!/^image\/(png|jpeg)$/.test(file.type)) throw new Error('Format accepté : PDF, PNG ou JPEG');
  const bmp = await createImageBitmap(file);
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d')!.drawImage(bmp, 0, 0);
  return [c];
}

/** Copie réduite pour la lecture IA (côté le plus long ≤ 1568 px). */
function forAi(c: HTMLCanvasElement) {
  const k = Math.min(1, 1568 / Math.max(c.width, c.height));
  const t = document.createElement('canvas');
  t.width = Math.round(c.width * k); t.height = Math.round(c.height * k);
  const ctx = t.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, t.width, t.height);
  ctx.drawImage(c, 0, 0, t.width, t.height);
  return t.toDataURL('image/jpeg', 0.88);
}

export async function readReport(pages: HTMLCanvasElement[]) {
  const r = await adminApi<{ data: Extracted }>('report.extract', { pages: pages.map(forAi) });
  return r.data;
}

/** Découpe un cadre (coordonnées 0–1) dans la page, avec une petite marge. */
export async function cropFigure(pages: HTMLCanvasElement[], f: Figure, margin = 0.006): Promise<File> {
  const c = pages[f.page];
  const x0 = Math.max(0, f.x0 - margin) * c.width, y0 = Math.max(0, f.y0 - margin) * c.height;
  const x1 = Math.min(1, f.x1 + margin) * c.width, y1 = Math.min(1, f.y1 + margin) * c.height;
  const t = document.createElement('canvas');
  t.width = Math.max(1, Math.round(x1 - x0)); t.height = Math.max(1, Math.round(y1 - y0));
  t.getContext('2d')!.drawImage(c, x0, y0, x1 - x0, y1 - y0, 0, 0, t.width, t.height);
  const photo = f.kind === 'vial_photo';
  const blob = await new Promise<Blob>((ok) => t.toBlob((b) => ok(b!), photo ? 'image/jpeg' : 'image/png', 0.92));
  return new File([blob], `${f.kind}.${photo ? 'jpg' : 'png'}`, { type: blob.type });
}

/** PDF d'archive : le PDF tel quel, ou une image convertie en PDF (une page, sans retouche). */
export async function archivePdf(file: File): Promise<File> {
  if (isPdf(file)) return file;
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const img = file.type === 'image/png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  doc.addPage([img.width, img.height]).drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  const out = await doc.save();
  return new File([out], `${file.name.replace(/\.[^.]+$/, '')}.pdf`, { type: 'application/pdf' });
}

/** Place un fichier dans un <input type="file">. */
export function setFileInput(input: HTMLInputElement | null, file: File | null) {
  if (!input) return;
  const dt = new DataTransfer();
  if (file) dt.items.add(file);
  input.files = dt.files;
}
