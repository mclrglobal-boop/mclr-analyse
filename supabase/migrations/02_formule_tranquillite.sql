-- Prix barré + badge, et Formule Tranquillité (pureté + contenu net)
alter table public.products add column if not exists compare_at_cents integer;
alter table public.products add column if not exists highlight text;
insert into public.products (slug, name, description, method, price_cents, compare_at_cents, highlight, currency, turnaround, technical_info, active, sort_order)
values ('formule-tranquillite', 'Formule Tranquillité',
'Le duo essentiel sur un même échantillon : la pureté chromatographique (HPLC-UV) et le contenu net en peptide (analyse élémentaire de l''azote). Un seul envoi, un seul certificat MCLR vérifiable en ligne regroupant les deux résultats.',
'HPLC-UV + Analyse élémentaire (N)', 24900, 32800, 'Recommandé', 'eur', '10 jours ouvrés après réception',
E'Pureté : colonne C18, détection UV 220 nm, résultat en % d''aire.\nContenu net : dosage de l''azote, résultat en mg par flacon.', true, 0)
on conflict (slug) do nothing;
