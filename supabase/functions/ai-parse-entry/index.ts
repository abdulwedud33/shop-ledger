// Quick entry: sentence -> DRAFT sale / payment / stock-in. Never saves anything. (docs/agents.md, prompts.md)
import { serve, runAgent, type Ctx } from '../_shared/runtime.ts';
import { entryTools } from '../_shared/tools.ts';
import { entryParserSystem } from '../_shared/prompts.ts';
import { isUuid, parseJsonLoose, sanitizeInput, looksLikeInjection } from '../_shared/guardrails.ts';

const FIELDS = ['product', 'customer', 'quantity', 'payment', 'other'];
const LANG: Record<string, string> = { en: 'English', am: 'Amharic', om: 'Afaan Oromo' };

export const handler = serve('entry_parser', async (ctx: Ctx, body) => {
  const sentence = sanitizeInput(body.sentence, 300);
  if (!sentence) return { status: 'unsupported', draft: null, clarifications: [], memorySuggestion: null, note: null };
  if (looksLikeInjection(sentence)) console.warn('injection-pattern'); // metric only; defenses do not depend on this
  const language = LANG[String(body.locale)] ?? 'English';
  const hints = (Array.isArray(body.hints) ? body.hints : []).slice(0, 5)
    .filter((h: { field?: string; id?: string }) => FIELDS.includes(String(h.field)) && isUuid(h.id))
    .map((h: { field: string; id: string }) => { ctx.seen.add(h.id.toLowerCase()); return `${h.field} id ${h.id}`; }).join('; ');

  const text = await runAgent(ctx, {
    model: 'fast', maxTokens: 600,
    system: entryParserSystem({ sentence, language, hints }),
    user: 'Process the sentence in the system prompt now.',
    tools: entryTools(ctx),
  });

  const out = parseJsonLoose(text) as Record<string, unknown> | null;
  const status = out?.status;
  if (!out || !['draft_ready', 'needs_clarification', 'unsupported'].includes(String(status))) {
    return { status: 'unsupported', draft: null, clarifications: [], memorySuggestion: null, note: null };
  }

  // Grounding: only ids a tool actually returned may be offered back to the user.
  const clarifications = (Array.isArray(out.clarifications) ? out.clarifications : []).slice(0, 4).map((c: Record<string, unknown>) => ({
    field: FIELDS.includes(String(c.field)) ? String(c.field) : 'other',
    question: String(c.question ?? '').slice(0, 140),
    options: (Array.isArray(c.options) ? c.options : []).slice(0, 5)
      .filter((o: Record<string, unknown>) => isUuid(o.id) && ctx.seen.has(String(o.id).toLowerCase()))
      .map((o: Record<string, unknown>) => ({ id: String(o.id), label: String(o.label ?? '').slice(0, 80) })),
  }));

  const ms = out.memory_suggestion as Record<string, unknown> | null;
  const memorySuggestion = ms && ms.kind === 'alias' && isUuid(ms.ref_id) && ctx.seen.has(String(ms.ref_id).toLowerCase())
    ? { kind: 'alias' as const, key: String(ms.key ?? '').slice(0, 80), value: String(ms.value ?? '').slice(0, 300) } : null;

  // The draft comes from the propose_* tool result recorded by the server, never from model text.
  if (status === 'draft_ready') {
    if (ctx.drafts.length === 1) return { status, draft: ctx.drafts[0], clarifications: [], memorySuggestion, note: null };
    return { status: 'needs_clarification', draft: null, clarifications: clarifications.length ? clarifications : [{ field: 'other', question: '', options: [] }], memorySuggestion: null, note: null };
  }
  return { status, draft: null, clarifications: status === 'needs_clarification' ? clarifications : [], memorySuggestion: null, note: typeof out.note === 'string' ? out.note.slice(0, 140) : null };
});

export default handler;
