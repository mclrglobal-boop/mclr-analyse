import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const SITE_URL = (import.meta.env.VITE_SITE_URL as string).replace(/\/$/, '');

/** Client navigateur : clé publique uniquement. Les données sensibles sont protégées par la RLS. */
export const supabase = createClient(SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY as string, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'mclr-admin' },
});

const FN = `${SUPABASE_URL}/functions/v1`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/** Appel d'une fonction publique (GET). */
export async function publicApi<T>(params: Record<string, string>): Promise<T> {
  const res = await fetch(`${FN}/public?${new URLSearchParams(params)}`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data as T;
}

export function publicFileUrl(action: 'pdf' | 'image', id: string, kind?: string) {
  return `${FN}/public?${new URLSearchParams({ action, id, ...(kind ? { kind } : {}) })}`;
}

/** Option « Pack Sérénité » (le prix réel est fixé côté serveur). */
export const SERENITE_PRICE_CENTS = 1500;

export type SampleInput = { name: string; batch: string };
export async function startCheckout(productId: string, serenite = false, samples: SampleInput[] = []): Promise<string> {
  const res = await fetch(`${FN}/checkout`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: productId, serenite, samples }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) throw new Error(data.error || 'Paiement indisponible');
  return data.url;
}

/** Appel de l'API admin (JWT de l'utilisateur connecté). Accepte un objet ou un FormData. */
export async function adminApi<T = { ok?: string }>(action: string, body: Record<string, unknown> | FormData = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Session expirée — reconnectez-vous');
  let payload: BodyInit;
  const headers: Record<string, string> = { apikey: ANON, Authorization: `Bearer ${token}` };
  if (body instanceof FormData) { body.set('action', action); payload = body; }
  else { payload = JSON.stringify({ ...body, action }); headers['Content-Type'] = 'application/json'; }
  const res = await fetch(`${FN}/admin`, { method: 'POST', headers, body: payload });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || out.msg || `Erreur ${res.status}`);
  return out as T;
}
