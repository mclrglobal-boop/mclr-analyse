-- Requêtes HTTP sortantes depuis la base (rattrapage des sessions Stripe)
create extension if not exists pg_net with schema extensions;
