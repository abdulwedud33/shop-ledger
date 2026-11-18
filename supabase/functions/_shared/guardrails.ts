// Pure guardrail helpers (no imports, no Deno APIs) so they can be unit tested in Node.
// Rules: docs/guardrails.md sections 2 to 4. Cross-check with tests/ai/guardrails.test.ts.

/** Cleans user text before any model call. Returns null when nothing usable is left. */
export function sanitizeInput(value: unknown, max = 300): string | null {
  if (typeof value !== 'string') return null;
  // deno-lint-ignore no-control-regex
  const cleaned = value.normalize('NFKC').replace(/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, max) : null;
}

/** Marks data as untrusted. The closing tag inside the data is neutralised so it cannot escape the block. */
export function wrapUntrusted(name: string, value: string): string {
  const safe = value.replace(/<\/?untrusted_data[^>]*>/gi, '[removed]');
  return `<untrusted_data name="${name.replace(/[^a-z_]/gi, '')}">\n${safe}\n</untrusted_data>`;
}

const INJECTION = /(ignore (all |any |the )?(previous|prior|above|your)|disregard (the )?(rules|instructions)|system prompt|reveal (your )?(prompt|instructions)|you are now|act as|developer message|jailbreak)/i;
/** Only used for metrics and alerts. Detection never gates safety; the design assumes injection will happen. */
export function looksLikeInjection(text: string): boolean {
  return INJECTION.test(text);
}

/** Pulls every number out of a text: "1,200.50" -> 1200.5. */
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const n = Number(m[0].replace(/,/g, ''));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/** Collects every number that appears anywhere in a JSON-like value (leaf numbers and numbers inside strings). */
export function collectNumbers(value: unknown, into: Set<number> = new Set()): Set<number> {
  if (typeof value === 'number' && Number.isFinite(value)) into.add(value);
  else if (typeof value === 'string') for (const n of numbersIn(value)) into.add(n);
  else if (Array.isArray(value)) for (const v of value) collectNumbers(v, into);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) collectNumbers(v, into);
  return into;
}

/**
 * Every number the model wrote must exist in the tool results (small whole numbers 0-10 are allowed
 * for counting words like "3 items"). Returns the offending numbers; empty means grounded.
 */
export function ungroundedNumbers(text: string, allowed: Set<number>): number[] {
  const bad: number[] = [];
  for (const n of numbersIn(text)) {
    if (allowed.has(n)) continue;
    if (Number.isInteger(n) && n >= 0 && n <= 10) continue;
    bad.push(n);
  }
  return bad;
}

const THREATS = [
  /\b(police|court|lawsuit|sue|sued|legal action|lawyer|attorney|jail|prison|arrest|report you|blacklist|shame|ashamed|expose|publicly|consequences?|or else|final warning)\b/i,
  /ፖሊስ|ፍርድ ቤት|ክስ|እስር/,
  /poolisii|mana murtii|himata|hidhaa/i,
];
/** Reminder drafts must be polite: no threats, shaming or legal claims. */
export function isSafeReminder(message: string, requiredText: string): { ok: boolean; reason?: string } {
  if (message.length === 0 || message.length > 400) return { ok: false, reason: 'length' };
  if (!message.includes(requiredText)) return { ok: false, reason: 'amount' };
  if (THREATS.some((r) => r.test(message))) return { ok: false, reason: 'tone' };
  return { ok: true };
}

/** Extracts a JSON object from model text, tolerating code fences. Returns null when it is not valid JSON. */
export function parseJsonLoose(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(t.slice(start, end + 1)); } catch { return null; }
}

export const LIMITS = { maxQty: 10_000, maxToolCalls: 6, maxTurns: 3, maxLines: 20 } as const;

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
