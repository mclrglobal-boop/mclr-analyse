-- Plusieurs échantillons dans un même paiement Stripe : une commande (et un échantillon, un certificat) par échantillon
alter table public.orders add column if not exists item_index int not null default 1;
alter table public.orders add column if not exists item_count int not null default 1;
alter table public.orders drop constraint if exists orders_stripe_session_id_key;
alter table public.orders add constraint orders_stripe_session_item_key unique (stripe_session_id, item_index);
create index if not exists orders_stripe_session_idx on public.orders (stripe_session_id);
