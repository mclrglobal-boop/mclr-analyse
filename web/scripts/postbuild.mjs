// GitHub Pages : une copie d'index.html par route (réponse 200, liens directs et QR fonctionnels)
// avec titre / description / URL canonique propres à chaque page (référencement),
// + 404.html en filet de sécurité pour toute autre URL.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const SITE = 'https://mclr-analyse.com';
const base = readFileSync('dist/index.html', 'utf8');
const pages = {
  analyses: ['Analyses de peptides : pureté HPLC, contenu net, identité · MCLR Analyse', "Catalogue MCLR Analyse : pureté HPLC, contenu net, identité par spectrométrie de masse, Formule Tranquillité. Analyses par laboratoire tiers indépendant, certificat vérifiable par QR code."],
  analyse: ['Analyse · MCLR Analyse', null],
  faq: ['Questions fréquentes · MCLR Analyse', "Délais, envoi de l'échantillon, méthodes d'analyse, certificats vérifiables : toutes les réponses sur les analyses MCLR Analyse."],
  'a-propos': ['À propos · MCLR Analyse', "MCLR Analyse commercialise des analyses de peptides réalisées par des laboratoires tiers indépendants et publie des certificats vérifiables en ligne."],
  contact: ['Contact · MCLR Analyse', 'Contactez MCLR Analyse pour toute question sur une analyse, une commande ou un certificat.'],
  cgv: ['Conditions générales de vente · MCLR Analyse', null],
  confidentialite: ['Politique de confidentialité · MCLR Analyse', null],
  verify: ['Vérifier un certificat d\'analyse · MCLR Analyse', "Vérifiez l'authenticité d'un certificat MCLR Analyse en scannant son QR code ou en saisissant son identifiant COA."],
};
const noindex = ['commande', 'commande/succes', 'admin', 'admin/login', 'admin/commandes', 'admin/commande', 'admin/clients', 'admin/produits',
  'admin/produit', 'admin/echantillons', 'admin/rapports', 'admin/rapport', 'admin/import', 'admin/certificats', 'admin/certificat',
  'admin/verifications', 'admin/parametres'];
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
function page(route, title, desc, robots) {
  let h = base;
  const url = `${SITE}/${route}/`;
  if (title) h = h.replace(/<title>.*?<\/title>/, `<title>${esc(title)}</title>`).replace(/(property="og:title" content=")[^"]*/, `$1${esc(title)}`);
  if (desc) h = h.replace(/(name="description" content=")[^"]*/, `$1${esc(desc)}`).replace(/(property="og:description" content=")[^"]*/, `$1${esc(desc)}`);
  h = h.replace(/(rel="canonical" href=")[^"]*/, `$1${url}`).replace(/(property="og:url" content=")[^"]*/, `$1${url}`);
  if (robots) h = h.replace(/(name="robots" content=")[^"]*/, `$1${robots}`);
  mkdirSync(`dist/${route}`, { recursive: true });
  writeFileSync(`dist/${route}/index.html`, h);
}
for (const [r, [t, d]] of Object.entries(pages)) page(r, t, d, null);
for (const r of noindex) page(r, null, null, 'noindex, nofollow');
writeFileSync('dist/404.html', base.replace(/(name="robots" content=")[^"]*/, '$1noindex'));
console.log(`postbuild: ${Object.keys(pages).length + noindex.length} routes + 404.html`);
