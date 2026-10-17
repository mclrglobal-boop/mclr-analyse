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

function NotFound() {
  return <div className="container-x py-16"><Empty>Page introuvable. <Link to="/" className="text-brand underline">Retour à l&apos;accueil</Link></Empty></div>;
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
