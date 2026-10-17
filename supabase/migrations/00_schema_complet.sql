-- =====================================================================
--  MCLR — Plateforme de vente d'analyses & vérification de certificats
--  Schéma Supabase / PostgreSQL complet
--  À exécuter UNE fois dans Supabase > SQL Editor (projet vierge).
--  Ré-exécutable : les objets sont créés avec "if not exists" / "or replace".
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 0. Utilitaires
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.forbid_delete()
returns trigger language plpgsql as $$
begin
  raise exception 'Suppression interdite sur % (les données sont conservées pour traçabilité)', tg_table_name
    using errcode = 'P0001';
end $$;

-- ---------------------------------------------------------------------
-- 1. USERS (profils liés à auth.users)
-- ---------------------------------------------------------------------
create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  role        text not null default 'customer' check (role in ('customer','admin')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists users_email_idx on public.users (lower(email));

drop trigger if exists users_touch on public.users;
create trigger users_touch before update on public.users
  for each row execute function public.touch_updated_at();

-- Création automatique du profil à l'inscription
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', null))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Un utilisateur ne peut pas s'auto-promouvoir admin
create or replace function public.protect_user_role()
returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role
     and current_user in ('authenticated','anon') then
    raise exception 'Modification du rôle interdite';
  end if;
  return new;
end $$;
drop trigger if exists users_protect_role on public.users;
create trigger users_protect_role before update on public.users
  for each row execute function public.protect_user_role();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'admin');
$$;

-- ---------------------------------------------------------------------
-- 2. PARAMÈTRES (ligne unique) — adresse d'expédition NON publique
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  id                     int primary key default 1 check (id = 1),
  company_name           text not null default 'MCLR',
  company_legal_details  text,          -- forme juridique, siège, n° d'immatriculation…
  company_email          text,
  shipping_recipient     text,
  shipping_address       text,
  shipping_postal_code   text,
  shipping_city          text,
  shipping_country       text,
  shipping_instructions  text,
  updated_at             timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;
drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 3. PRODUCTS (catalogue des prestations)
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name            text not null,
  description     text not null default '',
  method          text not null,
  price_cents     int  not null check (price_cents >= 50),
  currency        text not null default 'eur' check (currency ~ '^[a-z]{3}$'),
  turnaround      text not null default '',     -- délai indicatif
  technical_info  text not null default '',
  active          boolean not null default true,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 4. ORDERS
-- ---------------------------------------------------------------------
create sequence if not exists public.order_number_seq start 1;
create sequence if not exists public.sample_number_seq start 1;

create or replace function public.next_order_reference()
returns text language sql volatile as $$
  select 'ORD-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.order_number_seq')::text, 6, '0');
$$;

create or replace function public.next_sample_reference()
returns text language sql volatile as $$
  select 'SMP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.sample_number_seq')::text, 6, '0');
$$;

create table if not exists public.orders (
  id                        uuid primary key default gen_random_uuid(),
  reference                 text not null unique default public.next_order_reference(),
  stripe_session_id         text unique,          -- garantit 1 commande max par session Stripe
  stripe_payment_intent_id  text,
  customer_id               uuid references public.users(id) on delete set null,
  customer_email            text not null,
  customer_name             text,
  product_id                uuid references public.products(id) on delete restrict,
  product_name              text not null,        -- instantané au moment de l'achat
  amount_cents              int  not null check (amount_cents >= 0),
  currency                  text not null default 'eur',
  status                    text not null default 'pending' check (status in (
                              'pending','payment_received','payment_failed','sample_received',
                              'analysis_in_progress','results_available','certificate_available',
                              'refunded','cancelled')),
  access_token              text not null default encode(gen_random_bytes(24), 'hex'),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index if not exists orders_email_idx  on public.orders (lower(customer_email));
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_created_idx on public.orders (created_at desc);
drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();
drop trigger if exists orders_no_delete on public.orders;
create trigger orders_no_delete before delete on public.orders
  for each row execute function public.forbid_delete();

-- Journal d'idempotence des webhooks Stripe
create table if not exists public.stripe_events (
  id            text primary key,     -- evt_…
  type          text not null,
  processed_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. SAMPLES (échantillons)
-- ---------------------------------------------------------------------
create table if not exists public.samples (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete restrict,
  reference     text not null unique default public.next_sample_reference(),
  product_name  text,                -- nom du produit analysé (déclaré par le client / admin)
  batch_number  text,
  status        text not null default 'awaiting' check (status in ('awaiting','received','sent_to_lab','analyzed')),
  received_at   timestamptz,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists samples_order_idx on public.samples (order_id);
drop trigger if exists samples_touch on public.samples;
create trigger samples_touch before update on public.samples
  for each row execute function public.touch_updated_at();
drop trigger if exists samples_no_delete on public.samples;
create trigger samples_no_delete before delete on public.samples
  for each row execute function public.forbid_delete();

-- Un échantillon est créé automatiquement pour chaque commande
create or replace function public.create_sample_for_order()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.samples (order_id) values (new.id);
  return new;
end $$;
drop trigger if exists orders_create_sample on public.orders;
create trigger orders_create_sample after insert on public.orders
  for each row execute function public.create_sample_for_order();

-- ---------------------------------------------------------------------
-- 6. LABORATORY_REPORTS (résultats reçus du laboratoire externe)
--    Les valeurs sont stockées en TEXTE, exactement comme dans le rapport source.
-- ---------------------------------------------------------------------
create table if not exists public.laboratory_reports (
  id                            uuid primary key default gen_random_uuid(),
  order_id                      uuid not null references public.orders(id) on delete restrict,
  sample_id                     uuid not null references public.samples(id) on delete restrict,
  product_name                  text not null,
  batch_number                  text,
  received_date                 date,
  analysis_date                 date not null,
  laboratory_name               text not null,
  laboratory_display_authorized boolean not null default false,  -- nom du labo affichable publiquement ?
  laboratory_report_number      text,     -- n° du rapport chez le laboratoire
  method                        text not null,
  purity_result                 text,     -- ex. "99.12 %" (texte exact)
  additional_results            jsonb not null default '[]'::jsonb,
                                -- [{ "analyte":"…", "value":"…", "unit":"…", "specification":"…" }]
  observations                  text,
  original_pdf_path             text not null,   -- bucket privé lab-reports
  original_pdf_sha256           text not null,
  original_pdf_filename         text,
  status                        text not null default 'draft' check (status in ('draft','validated','rejected')),
  validated_by                  uuid references public.users(id),
  validated_at                  timestamptz,
  validation_note               text,
  created_by                    uuid references public.users(id),
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  constraint additional_results_is_array check (jsonb_typeof(additional_results) = 'array')
);
create index if not exists reports_sample_idx on public.laboratory_reports (sample_id);
create index if not exists reports_order_idx  on public.laboratory_reports (order_id);

create or replace function public.protect_lab_report()
returns trigger language plpgsql as $$
begin
  if old.status in ('validated','rejected') then
    raise exception 'Rapport % déjà %: modification interdite. Importer un nouveau rapport corrigé.', old.id, old.status
      using errcode = 'P0001';
  end if;
  -- passage à "validated" : validateur obligatoire
  if new.status = 'validated' and (new.validated_by is null or new.validated_at is null) then
    raise exception 'Validation incomplète (validateur / date manquants)';
  end if;
  -- le fichier original ne peut jamais être remplacé
  if new.original_pdf_path is distinct from old.original_pdf_path
     or new.original_pdf_sha256 is distinct from old.original_pdf_sha256 then
    raise exception 'Le PDF original du laboratoire ne peut pas être remplacé';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists reports_protect on public.laboratory_reports;
create trigger reports_protect before update on public.laboratory_reports
  for each row execute function public.protect_lab_report();
drop trigger if exists reports_no_delete on public.laboratory_reports;
create trigger reports_no_delete before delete on public.laboratory_reports
  for each row execute function public.forbid_delete();

-- ---------------------------------------------------------------------
-- 7. CERTIFICATES + versions + résultats
-- ---------------------------------------------------------------------
-- Identifiant public non devinable : COA- + 8 caractères Crockford base32 (32^8 ≈ 1,1e12)
create or replace function public.generate_certificate_public_id()
returns text language plpgsql volatile as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  bytes bytea;
  candidate text;
  i int;
begin
  loop
    bytes := gen_random_bytes(8);
    candidate := 'COA-';
    for i in 0..7 loop
      candidate := candidate || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.certificates where public_id = candidate);
  end loop;
  return candidate;
end $$;

create table if not exists public.certificates (
  id                 uuid primary key default gen_random_uuid(),   -- UUID interne
  public_id          text not null unique,                          -- COA-XXXXXXXX
  order_id           uuid not null references public.orders(id) on delete restrict,
  sample_id          uuid not null unique references public.samples(id) on delete restrict,
  status             text not null default 'active' check (status in ('active','revoked')),
  current_version    int  not null default 0,
  revoked_at         timestamptz,
  revoked_by         uuid references public.users(id),
  revocation_reason  text,
  scan_count         bigint not null default 0,
  last_verified_at   timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()    -- dernière modification réelle (version / statut)
);
alter table public.certificates alter column public_id set default public.generate_certificate_public_id();

create or replace function public.protect_certificate()
returns trigger language plpgsql as $$
begin
  if new.public_id <> old.public_id or new.order_id <> old.order_id
     or new.sample_id <> old.sample_id or new.created_at <> old.created_at then
    raise exception 'Champs d''identité du certificat immuables';
  end if;
  if old.status = 'revoked' and new.status <> 'revoked' then
    raise exception 'Un certificat révoqué ne peut pas être réactivé';
  end if;
  if old.status = 'revoked' and new.current_version <> old.current_version then
    raise exception 'Impossible de créer une version sur un certificat révoqué';
  end if;
  if new.current_version < old.current_version then
    raise exception 'La version courante ne peut pas reculer';
  end if;
  if new.status = 'revoked' and old.status = 'active'
     and (new.revocation_reason is null or length(trim(new.revocation_reason)) < 5) then
    raise exception 'Raison de révocation obligatoire';
  end if;
  return new;
end $$;
drop trigger if exists certificates_protect on public.certificates;
create trigger certificates_protect before update on public.certificates
  for each row execute function public.protect_certificate();
drop trigger if exists certificates_no_delete on public.certificates;
create trigger certificates_no_delete before delete on public.certificates
  for each row execute function public.forbid_delete();

create table if not exists public.certificate_versions (
  id                  uuid primary key default gen_random_uuid(),
  certificate_id      uuid not null references public.certificates(id) on delete restrict,
  version             int  not null check (version >= 1),
  report_id           uuid not null references public.laboratory_reports(id) on delete restrict,
  product_name        text not null,
  sample_reference    text not null,
  batch_number        text,
  analysis_date       date not null,
  method              text not null,
  main_result         text,
  laboratory_name     text not null,
  show_laboratory_name boolean not null default false,
  issued_at           timestamptz not null default now(),
  pdf_path            text,
  pdf_sha256          text,
  change_reason       text,
  created_by          uuid references public.users(id),
  created_at          timestamptz not null default now(),
  unique (certificate_id, version)
);

-- Une version publiée est immuable ; seul le chemin du PDF peut être renseigné une fois.
create or replace function public.protect_certificate_version()
returns trigger language plpgsql as $$
begin
  if old.pdf_path is not null then
    raise exception 'Version % du certificat déjà publiée : immuable. Créer une nouvelle version.', old.version
      using errcode = 'P0001';
  end if;
  if (new.certificate_id, new.version, new.report_id, new.product_name, new.sample_reference,
      new.batch_number, new.analysis_date, new.method, new.main_result, new.laboratory_name,
      new.show_laboratory_name, new.issued_at, new.change_reason, new.created_by, new.created_at)
     is distinct from
     (old.certificate_id, old.version, old.report_id, old.product_name, old.sample_reference,
      old.batch_number, old.analysis_date, old.method, old.main_result, old.laboratory_name,
      old.show_laboratory_name, old.issued_at, old.change_reason, old.created_by, old.created_at) then
    raise exception 'Seuls pdf_path / pdf_sha256 peuvent être renseignés sur une version';
  end if;
  return new;
end $$;
drop trigger if exists cert_versions_protect on public.certificate_versions;
create trigger cert_versions_protect before update on public.certificate_versions
  for each row execute function public.protect_certificate_version();
drop trigger if exists cert_versions_no_delete on public.certificate_versions;
create trigger cert_versions_no_delete before delete on public.certificate_versions
  for each row execute function public.forbid_delete();

create table if not exists public.certificate_results (
  id                      uuid primary key default gen_random_uuid(),
  certificate_version_id  uuid not null references public.certificate_versions(id) on delete restrict,
  position                int  not null,
  analyte                 text not null,
  value                   text not null,
  unit                    text,
  specification           text,
  unique (certificate_version_id, position)
);
create or replace function public.forbid_update()
returns trigger language plpgsql as $$
begin
  raise exception 'Modification interdite sur % (données immuables)', tg_table_name using errcode = 'P0001';
end $$;
drop trigger if exists cert_results_no_update on public.certificate_results;
create trigger cert_results_no_update before update on public.certificate_results
  for each row execute function public.forbid_update();
drop trigger if exists cert_results_no_delete on public.certificate_results;
create trigger cert_results_no_delete before delete on public.certificate_results
  for each row execute function public.forbid_delete();

-- ---------------------------------------------------------------------
-- 8. VERIFICATION_LOGS (historique des scans / vérifications)
-- ---------------------------------------------------------------------
create table if not exists public.verification_logs (
  id               bigint generated always as identity primary key,
  certificate_id   uuid references public.certificates(id) on delete restrict,
  queried_id       text not null,
  result           text not null check (result in ('valid','revoked','not_found','rate_limited','invalid_format')),
  ip_hash          text,
  user_agent       text,
  created_at       timestamptz not null default now()
);
create index if not exists vlogs_cert_idx on public.verification_logs (certificate_id, created_at desc);
create index if not exists vlogs_ip_idx   on public.verification_logs (ip_hash, created_at desc);
drop trigger if exists vlogs_no_update on public.verification_logs;
create trigger vlogs_no_update before update on public.verification_logs
  for each row execute function public.forbid_update();
drop trigger if exists vlogs_no_delete on public.verification_logs;
create trigger vlogs_no_delete before delete on public.verification_logs
  for each row execute function public.forbid_delete();

-- ---------------------------------------------------------------------
-- 9. ADMIN_LOGS (journal des actions administrateur)
-- ---------------------------------------------------------------------
create table if not exists public.admin_logs (
  id           bigint generated always as identity primary key,
  actor_id     uuid references public.users(id),
  action       text not null,
  entity_type  text not null,
  entity_id    text,
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists admin_logs_created_idx on public.admin_logs (created_at desc);
drop trigger if exists admin_logs_no_update on public.admin_logs;
create trigger admin_logs_no_update before update on public.admin_logs
  for each row execute function public.forbid_update();
drop trigger if exists admin_logs_no_delete on public.admin_logs;
create trigger admin_logs_no_delete before delete on public.admin_logs
  for each row execute function public.forbid_delete();

-- ---------------------------------------------------------------------
-- 10. FONCTIONS MÉTIER
-- ---------------------------------------------------------------------

-- Validation d'un rapport (contrôle humain avant toute publication)
create or replace function public.validate_lab_report(p_report_id uuid, p_actor uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.laboratory_reports;
begin
  select * into r from public.laboratory_reports where id = p_report_id for update;
  if not found then raise exception 'Rapport introuvable'; end if;
  if r.status <> 'draft' then raise exception 'Rapport déjà traité (%)', r.status; end if;
  update public.laboratory_reports
     set status = 'validated', validated_by = p_actor, validated_at = now(), validation_note = p_note
   where id = p_report_id;
end $$;

-- Émission d'une version de certificat — les données sont COPIÉES depuis le rapport validé
-- (aucune ressaisie manuelle possible : fidélité garantie au rapport source).
create or replace function public.issue_certificate_version(
  p_report_id       uuid,
  p_actor           uuid,
  p_reason          text,
  p_certificate_id  uuid    default null,
  p_show_lab        boolean default null
)
returns table (certificate_id uuid, public_id text, version int, version_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  r        public.laboratory_reports;
  s        public.samples;
  c        public.certificates;
  v_next   int;
  v_show   boolean;
  v_id     uuid;
begin
  select * into r from public.laboratory_reports where id = p_report_id;
  if not found then raise exception 'Rapport introuvable'; end if;
  if r.status <> 'validated' then
    raise exception 'Le rapport doit être validé avant de générer un certificat';
  end if;
  select * into s from public.samples where id = r.sample_id;

  if p_certificate_id is null then
    if exists (select 1 from public.certificates x where x.sample_id = r.sample_id) then
      raise exception 'Un certificat existe déjà pour cet échantillon : créer une nouvelle version';
    end if;
    insert into public.certificates (order_id, sample_id) values (r.order_id, r.sample_id)
      returning * into c;
  else
    select * into c from public.certificates x where x.id = p_certificate_id for update;
    if not found then raise exception 'Certificat introuvable'; end if;
    if c.status = 'revoked' then raise exception 'Certificat révoqué : aucune nouvelle version possible'; end if;
    if c.sample_id <> r.sample_id then
      raise exception 'Le rapport ne correspond pas à l''échantillon de ce certificat';
    end if;
    if p_reason is null or length(trim(p_reason)) < 5 then
      raise exception 'Raison de modification obligatoire pour une nouvelle version';
    end if;
  end if;

  -- Marque blanche : le nom du laboratoire n'est jamais publié (certificat, page de vérification)
  v_show := false;

  v_next := c.current_version + 1;

  insert into public.certificate_versions (
    certificate_id, version, report_id, product_name, sample_reference, batch_number,
    analysis_date, method, main_result, laboratory_name, show_laboratory_name,
    change_reason, created_by)
  values (
    c.id, v_next, r.id, r.product_name, s.reference, r.batch_number,
    r.analysis_date, r.method, r.purity_result, r.laboratory_name, v_show,
    coalesce(nullif(trim(p_reason), ''), 'Émission initiale'), p_actor)
  returning id into v_id;

  -- Résultats : copie exacte du rapport
  if r.purity_result is not null and length(trim(r.purity_result)) > 0 then
    insert into public.certificate_results (certificate_version_id, position, analyte, value, unit, specification)
    values (v_id, 0, 'Pureté', r.purity_result, null, null);
  end if;
  insert into public.certificate_results (certificate_version_id, position, analyte, value, unit, specification)
  select v_id, e.ord::int,
         e.item->>'analyte', e.item->>'value',
         nullif(e.item->>'unit', ''), nullif(e.item->>'specification', '')
    from jsonb_array_elements(r.additional_results) with ordinality as e(item, ord)
   where coalesce(e.item->>'analyte', '') <> '' and coalesce(e.item->>'value', '') <> '';

  update public.certificates x set current_version = v_next, updated_at = now() where x.id = c.id;

  return query select c.id, c.public_id, v_next, v_id;
end $$;

create or replace function public.revoke_certificate(p_certificate_id uuid, p_actor uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.certificates
     set status = 'revoked', revoked_at = now(), revoked_by = p_actor,
         revocation_reason = p_reason, updated_at = now()
   where id = p_certificate_id and status = 'active';
  if not found then raise exception 'Certificat introuvable ou déjà révoqué'; end if;
end $$;

-- Vérification publique : rate limiting + journalisation + compteur de scans, atomique.
create or replace function public.record_verification(
  p_public_id   text,
  p_ip_hash     text,
  p_user_agent  text,
  p_limit_per_minute int default 30
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id     text := upper(trim(coalesce(p_public_id, '')));
  v_recent int;
  c        public.certificates;
  v        public.certificate_versions;
  v_res    jsonb;
  v_hist   jsonb;
begin
  select count(*) into v_recent from public.verification_logs
   where ip_hash = p_ip_hash and created_at > now() - interval '1 minute';
  if v_recent >= p_limit_per_minute then
    insert into public.verification_logs (queried_id, result, ip_hash, user_agent)
    values (left(v_id, 32), 'rate_limited', p_ip_hash, left(p_user_agent, 300));
    return jsonb_build_object('result', 'rate_limited');
  end if;

  if v_id !~ '^COA-[0-9A-HJKMNP-TV-Z]{8}$' then
    insert into public.verification_logs (queried_id, result, ip_hash, user_agent)
    values (left(v_id, 32), 'invalid_format', p_ip_hash, left(p_user_agent, 300));
    return jsonb_build_object('result', 'not_found');
  end if;

  select * into c from public.certificates where public_id = v_id;
  if not found or c.current_version = 0 then
    insert into public.verification_logs (queried_id, result, ip_hash, user_agent)
    values (v_id, 'not_found', p_ip_hash, left(p_user_agent, 300));
    return jsonb_build_object('result', 'not_found');
  end if;

  select * into v from public.certificate_versions
   where certificate_id = c.id and version = c.current_version;

  update public.certificates set scan_count = scan_count + 1, last_verified_at = now() where id = c.id
    returning * into c;

  insert into public.verification_logs (certificate_id, queried_id, result, ip_hash, user_agent)
  values (c.id, v_id, case when c.status = 'active' then 'valid' else 'revoked' end, p_ip_hash, left(p_user_agent, 300));

  select coalesce(jsonb_agg(jsonb_build_object(
           'analyte', analyte, 'value', value, 'unit', unit, 'specification', specification)
           order by position), '[]'::jsonb)
    into v_res from public.certificate_results where certificate_version_id = v.id;

  select coalesce(jsonb_agg(jsonb_build_object('version', version, 'issued_at', issued_at,
           'reason', change_reason) order by version), '[]'::jsonb)
    into v_hist from public.certificate_versions where certificate_id = c.id;

  return jsonb_build_object(
    'result', case when c.status = 'active' then 'valid' else 'revoked' end,
    'certificate', jsonb_build_object(
      'public_id', c.public_id, 'status', c.status, 'version', c.current_version,
      'created_at', c.created_at, 'updated_at', c.updated_at,
      'revoked_at', c.revoked_at, 'revocation_reason', c.revocation_reason,
      'scan_count', c.scan_count, 'last_verified_at', c.last_verified_at),
    'data', jsonb_build_object(
      'product_name', v.product_name, 'sample_reference', v.sample_reference,
      'batch_number', v.batch_number, 'analysis_date', v.analysis_date, 'method', v.method,
      'main_result', v.main_result, 'issued_at', v.issued_at,
      'has_pdf', v.pdf_path is not null),
    'results', v_res,
    'versions', v_hist
  );
end $$;

-- Ces fonctions ne sont appelables QUE côté serveur (service_role)
revoke all on function public.validate_lab_report(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.issue_certificate_version(uuid, uuid, text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.revoke_certificate(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.record_verification(text, text, text, int) from public, anon, authenticated;
grant execute on function public.validate_lab_report(uuid, uuid, text) to service_role;
grant execute on function public.issue_certificate_version(uuid, uuid, text, uuid, boolean) to service_role;
grant execute on function public.revoke_certificate(uuid, uuid, text) to service_role;
grant execute on function public.record_verification(text, text, text, int) to service_role;

-- ---------------------------------------------------------------------
-- 11. ROW LEVEL SECURITY
--   - Le frontend n'utilise que la clé anon : il ne voit que le catalogue actif
--     et, s'il est connecté, ses propres commandes.
--   - Toutes les écritures sensibles passent par le serveur (service_role)
--     APRÈS contrôle du rôle admin dans le code.
-- ---------------------------------------------------------------------
alter table public.users                 enable row level security;
alter table public.settings              enable row level security;
alter table public.products              enable row level security;
alter table public.orders                enable row level security;
alter table public.stripe_events         enable row level security;
alter table public.samples               enable row level security;
alter table public.laboratory_reports    enable row level security;
alter table public.certificates          enable row level security;
alter table public.certificate_versions  enable row level security;
alter table public.certificate_results   enable row level security;
alter table public.verification_logs     enable row level security;
alter table public.admin_logs            enable row level security;

-- users
drop policy if exists users_self_select on public.users;
create policy users_self_select on public.users for select using (id = auth.uid() or public.is_admin());
drop policy if exists users_self_update on public.users;  -- aucune mise à jour directe côté client

-- products : catalogue public (actifs seulement), admin tout
drop policy if exists products_public_read on public.products;
create policy products_public_read on public.products for select using (active or public.is_admin());
drop policy if exists products_admin_write on public.products;
create policy products_admin_write on public.products for all using (public.is_admin()) with check (public.is_admin());

-- orders : le client connecté voit ses commandes (par email vérifié), admin tout
drop policy if exists orders_owner_read on public.orders;
create policy orders_owner_read on public.orders for select using (
  public.is_admin()
  or customer_id = auth.uid()
  or lower(customer_email) = lower(coalesce(auth.jwt()->>'email', '#'))
);

-- samples : visibles par le propriétaire de la commande
drop policy if exists samples_owner_read on public.samples;
create policy samples_owner_read on public.samples for select using (
  public.is_admin() or exists (
    select 1 from public.orders o where o.id = order_id
      and (o.customer_id = auth.uid() or lower(o.customer_email) = lower(coalesce(auth.jwt()->>'email', '#'))))
);

-- certificats : propriétaire + admin (la vérification publique passe par record_verification)
drop policy if exists certificates_owner_read on public.certificates;
create policy certificates_owner_read on public.certificates for select using (
  public.is_admin() or exists (
    select 1 from public.orders o where o.id = order_id
      and (o.customer_id = auth.uid() or lower(o.customer_email) = lower(coalesce(auth.jwt()->>'email', '#'))))
);

-- Tables réservées admin (lecture) ; aucune écriture client
drop policy if exists settings_admin on public.settings;
create policy settings_admin on public.settings for select using (public.is_admin());
drop policy if exists reports_admin on public.laboratory_reports;
create policy reports_admin on public.laboratory_reports for select using (public.is_admin());
drop policy if exists versions_admin on public.certificate_versions;
create policy versions_admin on public.certificate_versions for select using (public.is_admin());
drop policy if exists results_admin on public.certificate_results;
create policy results_admin on public.certificate_results for select using (public.is_admin());
drop policy if exists vlogs_admin on public.verification_logs;
create policy vlogs_admin on public.verification_logs for select using (public.is_admin());
drop policy if exists admin_logs_admin on public.admin_logs;
create policy admin_logs_admin on public.admin_logs for select using (public.is_admin());
-- stripe_events : aucune policy => inaccessible hors service_role

-- ---------------------------------------------------------------------
-- 12. STORAGE (buckets privés)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lab-reports', 'lab-reports', false, 15728640, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 15728640, allowed_mime_types = array['application/pdf'];

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('certificates', 'certificates', false, 10485760, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = array['application/pdf'];

-- Lecture admin uniquement ; les accès publics passent par des URLs signées générées côté serveur.
drop policy if exists "admin read lab-reports" on storage.objects;
create policy "admin read lab-reports" on storage.objects for select
  using (bucket_id in ('lab-reports','certificates') and public.is_admin());

-- ---------------------------------------------------------------------
-- 13. ÉVOLUTION v2 (identique à migrations/002_coa_detaille.sql)
-- ---------------------------------------------------------------------

-- Paramètres : laboratoire partenaire + logo
alter table public.settings add column if not exists lab_name        text not null default 'PristinBio';
alter table public.settings add column if not exists lab_email       text;
alter table public.settings add column if not exists lab_auto_order  boolean not null default true;
alter table public.settings add column if not exists lab_order_notes text;     -- n° de compte client chez le labo, consignes…
alter table public.settings add column if not exists shipping_phone  text;     -- téléphone du destinataire (exigé par les transporteurs)
alter table public.settings add column if not exists logo_path       text;     -- logo (bucket privé "certificates", dossier branding/)

-- Commandes : traçabilité de la transmission au labo
alter table public.orders add column if not exists lab_notified_at timestamptz;

-- Rapports : champs du rapport source
alter table public.laboratory_reports add column if not exists appearance           text;
alter table public.laboratory_reports add column if not exists cas_number           text;
alter table public.laboratory_reports add column if not exists purity_specification text;
alter table public.laboratory_reports add column if not exists hplc_image_path      text;  -- chromatogramme (extrait du rapport labo)
alter table public.laboratory_reports add column if not exists ms_image_path        text;  -- spectre de masse (extrait du rapport labo)

-- Versions de certificat : copie figée de ces champs
alter table public.certificate_versions add column if not exists appearance           text;
alter table public.certificate_versions add column if not exists cas_number           text;
alter table public.certificate_versions add column if not exists received_date        date;
alter table public.certificate_versions add column if not exists purity_specification text;
alter table public.certificate_versions add column if not exists hplc_image_path      text;
alter table public.certificate_versions add column if not exists ms_image_path        text;

-- Immuabilité étendue aux nouveaux champs
create or replace function public.protect_certificate_version()
returns trigger language plpgsql as $$
begin
  if old.pdf_path is not null then
    raise exception 'Version % du certificat déjà publiée : immuable. Créer une nouvelle version.', old.version
      using errcode = 'P0001';
  end if;
  if (new.certificate_id, new.version, new.report_id, new.product_name, new.sample_reference,
      new.batch_number, new.analysis_date, new.method, new.main_result, new.laboratory_name,
      new.show_laboratory_name, new.issued_at, new.change_reason, new.created_by, new.created_at,
      new.appearance, new.cas_number, new.received_date, new.purity_specification,
      new.hplc_image_path, new.ms_image_path)
     is distinct from
     (old.certificate_id, old.version, old.report_id, old.product_name, old.sample_reference,
      old.batch_number, old.analysis_date, old.method, old.main_result, old.laboratory_name,
      old.show_laboratory_name, old.issued_at, old.change_reason, old.created_by, old.created_at,
      old.appearance, old.cas_number, old.received_date, old.purity_specification,
      old.hplc_image_path, old.ms_image_path) then
    raise exception 'Seuls pdf_path / pdf_sha256 peuvent être renseignés sur une version';
  end if;
  return new;
end $$;

-- Émission : copie intégrale du rapport validé (nouveaux champs inclus)
create or replace function public.issue_certificate_version(
  p_report_id       uuid,
  p_actor           uuid,
  p_reason          text,
  p_certificate_id  uuid    default null,
  p_show_lab        boolean default null
)
returns table (certificate_id uuid, public_id text, version int, version_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  r        public.laboratory_reports;
  s        public.samples;
  c        public.certificates;
  v_next   int;
  v_show   boolean;
  v_id     uuid;
begin
  select * into r from public.laboratory_reports where id = p_report_id;
  if not found then raise exception 'Rapport introuvable'; end if;
  if r.status <> 'validated' then
    raise exception 'Le rapport doit être validé avant de générer un certificat';
  end if;
  select * into s from public.samples where id = r.sample_id;

  if p_certificate_id is null then
    if exists (select 1 from public.certificates x where x.sample_id = r.sample_id) then
      raise exception 'Un certificat existe déjà pour cet échantillon : créer une nouvelle version';
    end if;
    insert into public.certificates (order_id, sample_id) values (r.order_id, r.sample_id)
      returning * into c;
  else
    select * into c from public.certificates x where x.id = p_certificate_id for update;
    if not found then raise exception 'Certificat introuvable'; end if;
    if c.status = 'revoked' then raise exception 'Certificat révoqué : aucune nouvelle version possible'; end if;
    if c.sample_id <> r.sample_id then
      raise exception 'Le rapport ne correspond pas à l''échantillon de ce certificat';
    end if;
    if p_reason is null or length(trim(p_reason)) < 5 then
      raise exception 'Raison de modification obligatoire pour une nouvelle version';
    end if;
  end if;

  -- Marque blanche : le nom du laboratoire n'est jamais publié (certificat, page de vérification)
  v_show := false;

  v_next := c.current_version + 1;

  insert into public.certificate_versions (
    certificate_id, version, report_id, product_name, sample_reference, batch_number,
    analysis_date, method, main_result, laboratory_name, show_laboratory_name,
    change_reason, created_by,
    appearance, cas_number, received_date, purity_specification, hplc_image_path, ms_image_path)
  values (
    c.id, v_next, r.id, r.product_name, s.reference, r.batch_number,
    r.analysis_date, r.method, r.purity_result, r.laboratory_name, v_show,
    coalesce(nullif(trim(p_reason), ''), 'Émission initiale'), p_actor,
    r.appearance, r.cas_number, r.received_date, r.purity_specification, r.hplc_image_path, r.ms_image_path)
  returning id into v_id;

  if r.purity_result is not null and length(trim(r.purity_result)) > 0 then
    insert into public.certificate_results (certificate_version_id, position, analyte, value, unit, specification)
    values (v_id, 0, 'Peptide Purity (HPLC)', r.purity_result, null, nullif(trim(coalesce(r.purity_specification, '')), ''));
  end if;
  insert into public.certificate_results (certificate_version_id, position, analyte, value, unit, specification)
  select v_id, e.ord::int,
         e.item->>'analyte', e.item->>'value',
         nullif(e.item->>'unit', ''), nullif(e.item->>'specification', '')
    from jsonb_array_elements(r.additional_results) with ordinality as e(item, ord)
   where coalesce(e.item->>'analyte', '') <> '' and coalesce(e.item->>'value', '') <> '';

  update public.certificates x set current_version = v_next, updated_at = now() where x.id = c.id;

  return query select c.id, c.public_id, v_next, v_id;
end $$;

-- Vérification publique : nouveaux champs exposés
create or replace function public.record_verification(
  p_public_id   text,
  p_ip_hash     text,
  p_user_agent  text,
  p_limit_per_minute int default 30
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id     text := upper(trim(coalesce(p_public_id, '')));
  v_recent int;
  c        public.certificates;
  v        public.certificate_versions;
  v_res    jsonb;
  v_hist   jsonb;
begin
  select count(*) into v_recent from public.verification_logs
   where ip_hash = p_ip_hash and created_at > now() - interval '1 minute';
  if v_recent >= p_limit_per_minute then
    insert into public.verification_logs (queried_id, result, ip_hash, user_agent)
    values (left(v_id, 32), 'rate_limited', p_ip_hash, left(p_user_agent, 300));
    return jsonb_build_object('result', 'rate_limited');
  end if;

  if v_id !~ '^COA-[0-9A-HJKMNP-TV-Z]{8}$' then
    insert into public.verification_logs (queried_id, result, ip_hash, user_agent)
    values (left(v_id, 32), 'invalid_format', p_ip_hash, left(p_user_agent, 300));
    return jsonb_build_object('result', 'not_found');
  end if;

  select * into c from public.certificates where public_id = v_id;
  if not found or c.current_version = 0 then
    insert into public.verification_logs (queried_id, result, ip_hash, user_agent)
    values (v_id, 'not_found', p_ip_hash, left(p_user_agent, 300));
    return jsonb_build_object('result', 'not_found');
  end if;

  select * into v from public.certificate_versions
   where certificate_id = c.id and version = c.current_version;

  update public.certificates set scan_count = scan_count + 1, last_verified_at = now() where id = c.id
    returning * into c;

  insert into public.verification_logs (certificate_id, queried_id, result, ip_hash, user_agent)
  values (c.id, v_id, case when c.status = 'active' then 'valid' else 'revoked' end, p_ip_hash, left(p_user_agent, 300));

  select coalesce(jsonb_agg(jsonb_build_object(
           'analyte', analyte, 'value', value, 'unit', unit, 'specification', specification)
           order by position), '[]'::jsonb)
    into v_res from public.certificate_results where certificate_version_id = v.id;

  select coalesce(jsonb_agg(jsonb_build_object('version', version, 'issued_at', issued_at,
           'reason', change_reason) order by version), '[]'::jsonb)
    into v_hist from public.certificate_versions where certificate_id = c.id;

  return jsonb_build_object(
    'result', case when c.status = 'active' then 'valid' else 'revoked' end,
    'certificate', jsonb_build_object(
      'public_id', c.public_id, 'status', c.status, 'version', c.current_version,
      'created_at', c.created_at, 'updated_at', c.updated_at,
      'revoked_at', c.revoked_at, 'revocation_reason', c.revocation_reason,
      'scan_count', c.scan_count, 'last_verified_at', c.last_verified_at),
    'data', jsonb_build_object(
      'product_name', v.product_name, 'sample_reference', v.sample_reference,
      'batch_number', v.batch_number, 'analysis_date', v.analysis_date, 'method', v.method,
      'main_result', v.main_result, 'issued_at', v.issued_at,
      'appearance', v.appearance, 'cas_number', v.cas_number, 'received_date', v.received_date,
      'has_hplc', v.hplc_image_path is not null, 'has_ms', v.ms_image_path is not null,
      'has_pdf', v.pdf_path is not null),
    'results', v_res,
    'versions', v_hist
  );
end $$;

revoke all on function public.issue_certificate_version(uuid, uuid, text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.record_verification(text, text, text, int) from public, anon, authenticated;
grant execute on function public.issue_certificate_version(uuid, uuid, text, uuid, boolean) to service_role;
grant execute on function public.record_verification(text, text, text, int) to service_role;

-- Le bucket "certificates" accepte aussi les images (graphiques, logo)
update storage.buckets set allowed_mime_types = array['application/pdf','image/png','image/jpeg']
 where id = 'certificates';

-- ---------------------------------------------------------------------
-- 14. v3 (identique à migrations/003_admin_securite.sql)
-- ---------------------------------------------------------------------
alter table public.settings add column if not exists admin_emails text[] not null default '{}';
update public.settings set admin_emails = array['mclr.global@gmail.com'] where id = 1 and admin_emails = '{}';

-- Tout compte créé avec un email listé dans settings.admin_emails devient administrateur
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_admin boolean;
begin
  select lower(new.email) = any (select lower(unnest(admin_emails)) from public.settings where id = 1) into v_admin;
  insert into public.users (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', null),
          case when coalesce(v_admin, false) then 'admin' else 'customer' end)
  on conflict (id) do nothing;
  return new;
end $$;
update public.users set role = 'admin'
 where lower(email) in (select lower(unnest(admin_emails)) from public.settings where id = 1);

alter function public.protect_user_role() set search_path = public;
alter function public.next_order_reference() set search_path = public;
alter function public.next_sample_reference() set search_path = public;
alter function public.protect_lab_report() set search_path = public;
alter function public.generate_certificate_public_id() set search_path = public, extensions;
alter function public.touch_updated_at() set search_path = public;
alter function public.forbid_delete() set search_path = public;
alter function public.protect_certificate() set search_path = public;
alter function public.protect_certificate_version() set search_path = public;
alter function public.forbid_update() set search_path = public;

revoke all on function public.create_sample_for_order() from public, anon, authenticated;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated, service_role;
