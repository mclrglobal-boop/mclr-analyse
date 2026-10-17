// Utilitaires communs aux Edge Functions MCLR
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  });
}

export function fail(message: string, status = 400) {
  return json({ error: message }, status);
}

let cached: SupabaseClient | null = null;
/** Client service_role (contourne la RLS) — uniquement côté serveur. */
export function db(): SupabaseClient {
  if (!cached) {
    cached = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}

export type Settings = {
  company_name: string; company_legal_details: string | null; company_email: string | null;
  shipping_recipient: string | null; shipping_address: string | null; shipping_postal_code: string | null;
  shipping_city: string | null; shipping_country: string | null; shipping_phone: string | null;
  shipping_instructions: string | null; lab_name: string; lab_email: string | null; lab_auto_order: boolean;
  lab_order_notes: string | null; logo_path: string | null; site_url: string | null;
};

export async function getSettings(): Promise<Settings> {
  const { data, error } = await db().from('settings').select('*').eq('id', 1).single();
  if (error || !data) throw new Error('Paramètres introuvables');
  return data as Settings;
}

export function siteUrl(s?: Pick<Settings, 'site_url'> | null) {
  return (s?.site_url || Deno.env.get('SITE_URL') || 'https://mclr-analyse.com').replace(/\/$/, '');
}

export function verifyUrl(site: string, publicId: string) {
  return `${site}/verify/?id=${encodeURIComponent(publicId)}`;
}

export function orderUrl(site: string, o: { reference: string; access_token: string }) {
  return `${site}/commande/?ref=${encodeURIComponent(o.reference)}&t=${o.access_token}`;
}

export const PUBLIC_ID_RE = /^COA-[0-9A-HJKMNP-TV-Z]{8}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function formatMoney(cents: number, currency = 'eur') {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
}

export async function sha256Hex(bytes: Uint8Array | string) {
  const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  const h = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function logAdmin(actorId: string | null, action: string, entityType: string, entityId: string | null, details: Record<string, unknown> = {}) {
  const { error } = await db().from('admin_logs').insert({ actor_id: actorId, action, entity_type: entityType, entity_id: entityId, details });
  if (error) console.error('[admin_logs]', error.message);
}
