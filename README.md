# MCLR Analyse — mclr-analyse.com

Vente d'analyses réalisées par un laboratoire tiers, et vérification des certificats (COA) par QR code.

| Partie | Où | Rôle |
|---|---|---|
| Site (`web/`) | **GitHub Pages** → mclr-analyse.com | Pages publiques, vérification, back-office admin |
| Fonctions (`supabase/functions/`) | **Supabase Edge Functions** | Paiement Stripe, webhook, emails, génération des PDF, actions admin |
| Base (`supabase/migrations/`) | **Supabase** (projet `mclr-analyse`, Paris) | Données, sécurité RLS, stockage privé des PDF |

Aucune clé secrète n'est dans ce dépôt : elles sont stockées dans Supabase (Edge Functions › Secrets).

## Fonctionnement
1. Le client choisit une analyse → paiement Stripe (il indique produit + lot).
2. Webhook Stripe → commande `ORD-…` + échantillon `SMP-…`, emails client, **bon de commande envoyé automatiquement au laboratoire**.
3. Le client envoie l'échantillon directement au laboratoire.
4. Admin › Importer une analyse → contrôle → validation → **Generate Certificate** (PDF MCLR + QR + page `/verify/?id=COA-…`).

Le nom du laboratoire n'apparaît jamais côté client (certificat, page de vérification, emails).

## Secrets Supabase (Dashboard › Edge Functions › Secrets)
| Nom | Valeur |
|---|---|
| `STRIPE_SECRET_KEY` | Clé secrète Stripe (`sk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | Secret du webhook Stripe (`whsec_…`) |
| `SMTP_USER` | Adresse Gmail d'envoi |
| `SMTP_PASSWORD` | Mot de passe d'application Google (16 caractères) |

## Mise à jour du site
Toute modification de `web/` poussée sur `main` est publiée automatiquement (GitHub Actions → branche `gh-pages`).

## Administration
`https://mclr-analyse.com/admin/` — compte créé dans Supabase › Authentication avec l'email admin (droits attribués automatiquement).
