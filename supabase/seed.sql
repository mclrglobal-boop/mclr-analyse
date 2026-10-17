-- =====================================================================
--  Données initiales : paramètres MCLR + laboratoire PristinBio + catalogue de DÉMONSTRATION
--  (prix et descriptions à adapter avant mise en ligne)
-- =====================================================================
insert into public.products (slug, name, description, method, price_cents, turnaround, technical_info, sort_order) values
('purete-hplc', 'Pureté (HPLC-UV)', 'Détermination de la pureté chromatographique d''un échantillon par un laboratoire partenaire indépendant.', 'HPLC-UV', 14900, '7 à 10 jours ouvrés après réception', 'Colonne C18, détection UV 220 nm. Résultat exprimé en % d''aire.', 1),
('identification-lcms', 'Identification (LC-MS)', 'Confirmation de l''identité moléculaire par spectrométrie de masse couplée à la chromatographie liquide.', 'LC-MS', 19900, '10 à 14 jours ouvrés', 'Masse observée comparée à la masse théorique.', 2),
('concentration', 'Contenu net en peptide', 'Quantification du contenu net en peptide par dosage de l''azote (analyseur élémentaire).', 'Analyse élémentaire (N)', 17900, '10 jours ouvrés', 'Résultat en mg par flacon.', 3),
('pack-complet', 'Pack complet (pureté + identification + endotoxines)', 'HPLC, LC-MS et test LAL sur un même échantillon.', 'HPLC-UV + LC-MS + LAL', 29900, '10 à 14 jours ouvrés', 'Trois méthodes complémentaires, un seul envoi.', 4)
on conflict (slug) do nothing;

update public.settings set
  company_name          = 'MC.LR L.L.C.',
  company_legal_details = 'MC.LR L.L.C. — Wyoming (USA) — adresse et n° d''enregistrement à compléter',
  company_email         = 'mclr.global@gmail.com',
  -- Laboratoire partenaire : bon de commande automatique par email
  lab_name              = 'PristinBio',
  lab_email             = 'pristinbio@gmail.com',
  lab_auto_order        = true,
  lab_order_notes       = null,
  -- Adresse d'envoi des échantillons (le client envoie DIRECTEMENT au laboratoire)
  shipping_recipient    = '收样处 (Sample reception)',
  shipping_address      = '华润公元九里东区18号楼1004室',
  shipping_postal_code  = null,
  shipping_city         = '北京市大兴区 (Daxing District, Beijing)',
  shipping_country      = '中国 / China',
  shipping_phone        = '+86 130 6689 4720',
  shipping_instructions = E'Adresse à recopier EN CHINOIS sur le bordereau (exigé par les transporteurs en Chine).\nInscrivez votre référence de commande (ORD-…) et votre référence échantillon (SMP-…) sur le colis ET sur le flacon.\nFlacon fermé hermétiquement, étiqueté, protégé des chocs. Joignez une copie de votre email de confirmation.'
where id = 1;
