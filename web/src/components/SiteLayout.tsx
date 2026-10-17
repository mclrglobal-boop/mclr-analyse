import { Link, Outlet } from 'react-router-dom';

const nav = [
  ['/analyses/', 'Analyses'], ['/verify/', 'Vérifier un certificat'], ['/faq/', 'FAQ'], ['/a-propos/', 'À propos'], ['/contact/', 'Contact'],
] as const;

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link to="/" className={`inline-flex items-center ${light ? 'rounded-lg bg-white px-3 py-2' : ''}`} aria-label="MCLR — accueil">
      <img src="/brand/mclr-logo.png" alt="MCLR" width={802} height={240} className="h-9 w-auto" />
    </Link>
  );
}

export function SiteLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="container-x flex h-16 items-center justify-between gap-4">
          <Logo />
          <nav className="hidden items-center gap-6 text-sm font-medium text-ink-700 md:flex">
            {nav.map(([to, l]) => <Link key={to} to={to} className="hover:text-brand">{l}</Link>)}
          </nav>
          <Link to="/analyses/" className="btn-primary !py-2">Commander</Link>
        </div>
        <nav className="container-x flex gap-5 overflow-x-auto pb-3 text-sm font-medium text-ink-700 md:hidden">
          {nav.map(([to, l]) => <Link key={to} to={to} className="whitespace-nowrap hover:text-brand">{l}</Link>)}
        </nav>
      </header>
      <main className="flex-1"><Outlet /></main>
      <footer className="mt-20 bg-ink text-ink-300">
        <div className="container-x grid gap-10 py-12 md:grid-cols-4">
          <div className="md:col-span-2">
            <Logo light />
            <p className="mt-4 max-w-md text-sm leading-relaxed">
              MCLR commercialise des prestations d&apos;analyse réalisées par des laboratoires tiers indépendants et publie des
              certificats de vérification consultables en ligne. MCLR ne réalise pas les analyses.
            </p>
          </div>
          <div className="text-sm">
            <div className="mb-3 font-semibold text-white">Services</div>
            <ul className="space-y-2">
              <li><Link to="/analyses/" className="hover:text-white">Catalogue des analyses</Link></li>
              <li><Link to="/verify/" className="hover:text-white">Vérifier un certificat</Link></li>
            </ul>
          </div>
          <div className="text-sm">
            <div className="mb-3 font-semibold text-white">Informations</div>
            <ul className="space-y-2">
              <li><Link to="/faq/" className="hover:text-white">FAQ</Link></li>
              <li><Link to="/cgv/" className="hover:text-white">Conditions générales</Link></li>
              <li><Link to="/confidentialite/" className="hover:text-white">Confidentialité</Link></li>
              <li><Link to="/contact/" className="hover:text-white">Contact</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 py-5 text-center text-xs">© {new Date().getFullYear()} MC.LR L.L.C. — Produits destinés à la recherche uniquement.</div>
      </footer>
    </div>
  );
}
