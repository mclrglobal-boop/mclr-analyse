// GitHub Pages : une copie d'index.html par route (réponse 200, liens directs et QR fonctionnels)
// + 404.html en filet de sécurité pour toute autre URL.
import { copyFileSync, mkdirSync } from 'node:fs';
const routes = ['analyses', 'analyse', 'verify', 'commande', 'commande/succes', 'faq', 'a-propos', 'contact', 'cgv', 'confidentialite',
  'admin', 'admin/login', 'admin/commandes', 'admin/commande', 'admin/clients', 'admin/produits', 'admin/produit', 'admin/echantillons',
  'admin/rapports', 'admin/rapport', 'admin/import', 'admin/certificats', 'admin/certificat', 'admin/verifications', 'admin/parametres'];
for (const r of routes) { mkdirSync(`dist/${r}`, { recursive: true }); copyFileSync('dist/index.html', `dist/${r}/index.html`); }
copyFileSync('dist/index.html', 'dist/404.html');
console.log(`postbuild: ${routes.length} routes + 404.html`);
