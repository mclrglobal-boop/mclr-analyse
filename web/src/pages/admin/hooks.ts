import { useState } from 'react';
import { adminApi } from '../../lib/supabase';

/** Exécute une action admin, affiche le résultat et recharge les données. */
export function useAction(reload?: () => void) {
  const [msg, setMsg] = useState<{ ok?: string; err?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(action: string, body: Record<string, unknown> | FormData, after?: (r: Record<string, string>) => void) {
    setBusy(true); setMsg(null);
    try {
      const r = await adminApi<Record<string, string>>(action, body);
      setMsg({ ok: r.ok ?? 'OK' });
      after?.(r);
      reload?.();
    } catch (e) { setMsg({ err: (e as Error).message }); }
    finally { setBusy(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  }
  return { msg, busy, run, setMsg };
}

export function formObject(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
}
