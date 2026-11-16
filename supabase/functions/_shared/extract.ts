// Lecture IA d'un rapport de laboratoire (Claude, vision) → champs du formulaire d'import.
// Les valeurs sont recopiées telles quelles ; l'administrateur contrôle tout avant import et validation.
const MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-5-5';

export type Extracted = {
  product_name: string | null; batch_number: string | null; appearance: string | null; cas_number: string | null;
  received_date: string | null; analysis_date: string | null; laboratory_name: string | null; laboratory_report_number: string | null;
  method: string | null; purity_result: string | null; purity_specification: string | null;
  additional_results: { analyte: string; value: string; specification: string | null }[];
  observations: string | null;
  source_type: 'independent' | 'manufacturer' | 'unknown'; source_evidence: string | null;
  figures: { kind: 'hplc' | 'ms' | 'vial_photo'; page: number; x0: number; y0: number; x1: number; y1: number; branding_inside: boolean }[];
  warnings: string[];
};

const str = { type: ['string', 'null'] };
const SCHEMA = {
  type: 'object',
  properties: {
    product_name: { ...str, description: 'Nom du produit / échantillon tel qu’écrit sur le rapport' },
    batch_number: { ...str, description: 'Numéro de lot / batch tel qu’écrit. null si absent ou « N/A »' },
    appearance: str, cas_number: str,
    received_date: { ...str, description: 'Date de réception de l’échantillon, format AAAA-MM-JJ' },
    analysis_date: { ...str, description: 'Date d’analyse (ou à défaut date du rapport / reported / tested), format AAAA-MM-JJ' },
    laboratory_name: { ...str, description: 'Nom du laboratoire émetteur (usage interne uniquement)' },
    laboratory_report_number: { ...str, description: 'Numéro / identifiant du rapport ou du test' },
    method: { ...str, description: 'Méthode analytique telle qu’indiquée (ex. HPLC-UV / LC-MS)' },
    purity_result: { ...str, description: 'Résultat de pureté HPLC exactement comme écrit (ex. « 99.65% »)' },
    purity_specification: { ...str, description: 'Spécification de pureté si indiquée, sinon null' },
    additional_results: {
      type: 'array',
      description: 'Toutes les autres lignes de résultats (teneur nette, identité/masse, endotoxines, métaux lourds…), valeurs recopiées à l’identique, y compris « N/A »',
      items: { type: 'object', properties: { analyte: { type: 'string' }, value: { type: 'string' }, specification: str }, required: ['analyte', 'value', 'specification'] },
    },
    observations: { ...str, description: 'Commentaires / remarques du laboratoire, en résumé fidèle' },
    source_type: {
      type: 'string', enum: ['independent', 'manufacturer', 'unknown'],
      description: '« manufacturer » si le rapport indique un laboratoire interne du fabricant / autocontrôle / non accrédité tiers ; « independent » si laboratoire tiers ; « unknown » sinon',
    },
    source_evidence: { ...str, description: 'Citation courte du texte qui justifie source_type' },
    figures: {
      type: 'array',
      description: 'Cadres des graphiques et photo, en coordonnées normalisées 0–1 sur la page (x0,y0 = coin haut-gauche). Cadre serré sur le graphique (axes et légendes inclus), en excluant logos, en-têtes, tampons, filigranes et nom du laboratoire.',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['hplc', 'ms', 'vial_photo'] },
          page: { type: 'integer', description: 'Index de page à partir de 0' },
          x0: { type: 'number' }, y0: { type: 'number' }, x1: { type: 'number' }, y1: { type: 'number' },
          branding_inside: { type: 'boolean', description: 'true si un logo / filigrane / nom du labo reste dans le cadre' },
        },
        required: ['kind', 'page', 'x0', 'y0', 'x1', 'y1', 'branding_inside'],
      },
    },
    warnings: { type: 'array', items: { type: 'string' }, description: 'Incohérences ou valeurs illisibles repérées dans le rapport (en français)' },
  },
  required: ['product_name', 'batch_number', 'appearance', 'cas_number', 'received_date', 'analysis_date', 'laboratory_name',
    'laboratory_report_number', 'method', 'purity_result', 'purity_specification', 'additional_results', 'observations',
    'source_type', 'source_evidence', 'figures', 'warnings'],
};

const PROMPT = `Tu lis un rapport d'analyse de laboratoire (peptides). Remplis l'outil record_report.
Règles strictes :
- Recopie chaque valeur EXACTEMENT comme écrite (chiffres, unités, symboles, « N/A »). N'invente, n'arrondis et ne déduis rien.
- Champ absent ou illisible → null (et signale-le dans warnings s'il est important).
- Dates au format AAAA-MM-JJ.
- La ligne de pureté HPLC va dans purity_result ; toutes les autres lignes de résultats dans additional_results.
- Repère s'il s'agit d'un laboratoire interne du fabricant (mentions « in-house », « self-produced », « not an accredited third-party »…) → source_type « manufacturer ».
- Donne les cadres du chromatogramme HPLC, du spectre de masse et de la photo du flacon testé s'ils existent.
- Signale dans warnings toute incohérence (valeurs contradictoires, longueurs d'onde différentes, texte corrompu, flacon différent…).`;

export async function extractReport(pagesB64: string[]): Promise<Extracted> {
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) throw new Error('Clé ANTHROPIC_API_KEY non configurée dans Supabase (Edge Functions › Secrets)');
  const content: unknown[] = pagesB64.map((d, i) => {
    const m = /^data:(image\/(?:png|jpeg));base64,(.+)$/.exec(d);
    if (!m) throw new Error(`Page ${i + 1} : image PNG/JPEG attendue`);
    return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } };
  });
  content.push({ type: 'text', text: `${PROMPT}\nLe rapport compte ${pagesB64.length} page(s), dans l'ordre (page 0 = première).` });
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 4096,
      tools: [{ name: 'record_report', description: 'Enregistre les données lues sur le rapport', input_schema: SCHEMA }],
      tool_choice: { type: 'tool', name: 'record_report' },
      messages: [{ role: 'user', content }],
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Lecture IA : ${out?.error?.message ?? res.status}`);
  const tool = (out.content ?? []).find((c: { type: string }) => c.type === 'tool_use');
  if (!tool?.input) throw new Error('Lecture IA : réponse inattendue');
  const d = tool.input as Extracted;
  const clamp = (n: number) => Math.min(1, Math.max(0, Number(n) || 0));
  d.figures = (d.figures ?? []).filter((f) => f.page >= 0 && f.page < pagesB64.length)
    .map((f) => ({ ...f, x0: clamp(f.x0), y0: clamp(f.y0), x1: clamp(f.x1), y1: clamp(f.y1) }))
    .filter((f) => f.x1 - f.x0 > 0.03 && f.y1 - f.y0 > 0.03);
  d.additional_results = (d.additional_results ?? []).filter((r) => r?.analyte && r?.value);
  d.warnings = d.warnings ?? [];
  return d;
}
