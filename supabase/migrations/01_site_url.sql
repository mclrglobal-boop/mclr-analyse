-- Adresse publique du site (QR codes, emails)
alter table public.settings add column if not exists site_url text;
update public.settings set site_url = 'https://mclr-analyse.com' where id = 1;
