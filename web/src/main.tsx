import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import './index.css';
import { SiteLayout } from './components/SiteLayout';
import Home from './pages/Home';
import { Analyse, Analyses } from './pages/Analyses';
import Verify from './pages/Verify';
import { Order, OrderSuccess } from './pages/Order';
import { About, Cgv, Contact, Faq, Privacy } from './pages/Static';
import AdminLayout, { AdminLogin } from './pages/admin/AdminLayout';
import { Certificates, Clients, Dashboard, Orders, Reports, Samples, Verifications } from './pages/admin/Lists';
import { OrderDetail, ProductEdit, Products, Settings } from './pages/admin/Details';
import { CertificateDetail, ImportReport, ReportDetail } from './pages/admin/Reports';
import { Empty } from './components/ui';
import { publicFileUrl } from './lib/supabase';

/** Lien permanent vers le PDF d'un certificat : mclr-analyse.com/pdf/?id=COA-XXXXXXXX */
function PdfRedirect() {
  const id = (new URLSearchParams(window.location.search).get('id') ?? '').toUpperCase().trim();
  React.useEffect(() => {
    if (/^COA-[0-9A-Z]{8}$/.test(id)) window.location.replace(publicFileUrl('pdf', id));
  }, [id]);
  if (!/^COA-[0-9A-Z]{8}$/.test(id)) return <div className="container-x py-16"><Empty>Identifiant de certificat invalide. <Link to="/verify/" className="text-brand underline">Vérifier un certificat</Link></Empty></div>;
  return <div className="container-x py-16 text-center text-sm text-ink-500">Ouverture du certificat {id}…</div>;
}

function NotFound() {
  return <div className="container-x py-16"><Empty>Page introuvable. <Link to="/" className="text-brand underline">Retour à l&apos;accueil</Link></Empty></div>;
}

// Lien de réinitialisation du mot de passe arrivé sur une autre page : renvoi vers la connexion admin
if (/type=recovery|error_code=/.test(window.location.hash) && !window.location.pathname.startsWith('/admin/login')) {
  window.location.replace('/admin/login/' + window.location.hash);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<SiteLayout />}>
          <Route index element={<Home />} />
          <Route path="analyses" element={<Analyses />} />
          <Route path="analyse" element={<Analyse />} />
          <Route path="verify" element={<Verify />} />
          <Route path="pdf" element={<PdfRedirect />} />
          <Route path="verify/:legacy" element={<Verify />} />
          <Route path="commande" element={<Order />} />
          <Route path="commande/succes" element={<OrderSuccess />} />
          <Route path="faq" element={<Faq />} />
          <Route path="a-propos" element={<About />} />
          <Route path="contact" element={<Contact />} />
          <Route path="cgv" element={<Cgv />} />
          <Route path="confidentialite" element={<Privacy />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="admin/login" element={<AdminLogin />} />
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="commandes" element={<Orders />} />
          <Route path="commande" element={<OrderDetail />} />
          <Route path="clients" element={<Clients />} />
          <Route path="produits" element={<Products />} />
          <Route path="produit" element={<ProductEdit />} />
          <Route path="echantillons" element={<Samples />} />
          <Route path="rapports" element={<Reports />} />
          <Route path="rapport" element={<ReportDetail />} />
          <Route path="import" element={<ImportReport />} />
          <Route path="certificats" element={<Certificates />} />
          <Route path="certificat" element={<CertificateDetail />} />
          <Route path="verifications" element={<Verifications />} />
          <Route path="parametres" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
