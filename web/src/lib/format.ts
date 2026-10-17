export function formatMoney(cents: number, currency = 'eur') {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
}
export function formatDate(v?: string | null) {
  if (!v) return '—';
  const dateOnly = v.length === 10;
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: dateOnly ? 'UTC' : 'Europe/Paris' })
    .format(new Date(dateOnly ? v + 'T00:00:00Z' : v));
}
export function formatDateTime(v?: string | null) {
  if (!v) return '—';
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(new Date(v));
}
export type Tone = 'gray' | 'brand' | 'amber' | 'red' | 'green';
export const ORDER_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'En attente de paiement', tone: 'gray' },
  payment_received: { label: 'Paiement reçu', tone: 'brand' },
  payment_failed: { label: 'Paiement échoué', tone: 'red' },
  sample_received: { label: 'Échantillon reçu', tone: 'amber' },
  analysis_in_progress: { label: 'Analyse en cours', tone: 'amber' },
  results_available: { label: 'Résultat disponible', tone: 'brand' },
  certificate_available: { label: 'Certificat disponible', tone: 'green' },
  refunded: { label: 'Remboursée', tone: 'gray' },
  cancelled: { label: 'Annulée', tone: 'gray' },
};
export const SAMPLE_STATUS: Record<string, string> = { awaiting: 'En attente', received: 'Reçu', sent_to_lab: 'Au laboratoire', analyzed: 'Analysé' };
export const REPORT_STATUS: Record<string, string> = { draft: 'À valider', validated: 'Validé', rejected: 'Rejeté' };
