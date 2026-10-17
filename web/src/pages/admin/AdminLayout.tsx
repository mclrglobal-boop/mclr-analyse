import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { adminApi, supabase } from '../../lib/supabase';
import { Loading } from '../../components/ui';

const items = [
  ['/admin/', 'Dashboard'], ['/admin/commandes/', 'Commandes'], ['/admin/clients/', 'Clients'], ['/admin/produits/', 'Produits'],
  ['/admin/echantillons/', 'Échantillons'], ['/admin/rapports/', 'Rapports laboratoire'], ['/admin/certificats/', 'Certificats'],
  ['/admin/verifications/', 'Vérifications'], ['/admin/parametres/', 'Paramètres'],
] as const;

export default function AdminLayout() {
  const nav = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    document.title = 'Administration · MCLR';
    adminApi<{ email: string }>('me').then((r) => setEmail(r.email)).catch(() => nav('/admin/login/', { replace: true }));
  }, [nav]);
  if (!email) return <Loading />;
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="border-b border-line bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-4 py-4 lg:px-5">
          <Link to="/admin/"><img src="/brand/mclr-logo.png" alt="MCLR" className="h-8 w-auto" /></Link>
          <Link to="/" className="text-xs text-ink-500 hover:text-brand lg:hidden">Site ↗</Link>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 text-sm lg:flex-col lg:overflow-visible">
          {items.map(([to, l]) => (
            <NavLink key={to} to={to} end={to === '/admin/'}
              className={({ isActive }) => `whitespace-nowrap rounded-lg px-3 py-2 font-medium ${isActive ? 'bg-brand text-white' : 'text-ink-700 hover:bg-paper'}`}>{l}</NavLink>
          ))}
        </nav>
        <div className="mt-auto hidden px-5 py-4 text-xs text-ink-500 lg:block">
          <div className="truncate">{email}</div>
          <button onClick={async () => { await supabase.auth.signOut(); nav('/admin/login/'); }} className="mt-1 font-semibold text-ink hover:text-brand">Se déconnecter</button>
        </div>
      </aside>
      <div className="min-w-0 px-4 py-6 sm:px-8 lg:py-8"><Outlet /></div>
    </div>
  );
}

export function AdminLogin() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setBusy(false); return setError('Identifiants invalides'); }
    try { await adminApi('me'); nav('/admin/', { replace: true }); }
    catch { await supabase.auth.signOut(); setBusy(false); setError('Ce compte n’a pas les droits administrateur'); }
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-7 shadow-card">
        <img src="/brand/mclr-logo.png" alt="MCLR" className="h-9 w-auto" />
        <div className="font-semibold">Administration</div>
        <input className="input" type="email" autoComplete="username" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="input" type="password" autoComplete="current-password" placeholder="Mot de passe" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</div>}
        <button disabled={busy} className="btn-primary w-full">{busy ? 'Connexion…' : 'Se connecter'}</button>
      </form>
    </div>
  );
}
