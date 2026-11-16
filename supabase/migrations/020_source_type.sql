-- Origine des résultats : laboratoire tiers indépendant (défaut) ou laboratoire interne du fabricant
alter table public.laboratory_reports add column if not exists source_type text not null default 'independent' check (source_type in ('independent','manufacturer'));
alter table public.certificate_versions add column if not exists source_type text not null default 'independent' check (source_type in ('independent','manufacturer'));
