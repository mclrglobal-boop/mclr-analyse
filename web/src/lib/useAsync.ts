import { useCallback, useEffect, useState } from 'react';

/** Charge des données asynchrones ; `reload` pour rafraîchir après une action. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);
  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await run()); } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [run]);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}

export function useTitle(title: string) {
  useEffect(() => { document.title = title ? `${title} · MCLR Analyse` : 'MCLR Analyse — Analyses de peptides et certificats vérifiables'; }, [title]);
}
