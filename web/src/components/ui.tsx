import type { ReactNode } from 'react';
import type { Tone } from '../lib/format';

const tones: Record<Tone, string> = {
  gray: 'bg-ink-300/25 text-ink-700', brand: 'bg-brand-100 text-brand-700', amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800', green: 'bg-emerald-100 text-emerald-800',
};
export function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-500">{hint}</span>}
    </label>
  );
}
export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-500">{hint}</div>}
    </div>
  );
}
export function PageTitle({ title, eyebrow, children }: { title: string; eyebrow?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>{eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}<h1 className="text-2xl font-bold tracking-tight">{title}</h1></div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error' | 'success' | 'warn'; children: ReactNode }) {
  const cls = { info: 'border-brand-100 bg-brand-50 text-ink-800', error: 'border-red-200 bg-red-50 text-red-900', success: 'border-emerald-200 bg-emerald-50 text-emerald-900', warn: 'border-amber-200 bg-amber-50 text-amber-900' }[tone];
  return <div className={`rounded-lg border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line bg-white p-8 text-center text-sm text-ink-500">{children}</div>;
}
export function Loading() {
  return <div className="py-16 text-center text-sm text-ink-500">Chargement…</div>;
}
export function Flash({ msg }: { msg: { ok?: string; err?: string } | null }) {
  if (!msg) return null;
  return <div className="mb-5">{msg.err ? <Notice tone="error">{msg.err}</Notice> : <Notice tone="success">{msg.ok}</Notice>}</div>;
}
