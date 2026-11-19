// Daily/weekly summary for the owner. Every number must come from a tool result. (docs/agents.md)
import { serve, runAgent, HttpError, type Ctx } from '../_shared/runtime.ts';
import { insightTools } from '../_shared/tools.ts';
import { insightsSystem } from '../_shared/prompts.ts';
import { collectNumbers, isUuid, parseJsonLoose, sanitizeInput, ungroundedNumbers } from '../_shared/guardrails.ts';

const LANG: Record<string, string> = { en: 'English', am: 'Amharic', om: 'Afaan Oromo' };

export const handler = serve('insights', async (ctx: Ctx, body) => {
  if (ctx.role !== 'owner') throw new HttpError(403, 'FORBIDDEN');
  const period = ['today', 'week', 'month'].includes(String(body.period)) ? String(body.period) : 'today';
  const prefs = (await ctx.client.from('shop_memory').select('key, value').eq('shop_id', ctx.shopId).eq('kind', 'preference').limit(10)).data ?? [];

  const text = await runAgent(ctx, {
    model: 'smart', maxTokens: 700,
    system: insightsSystem({ language: LANG[String(body.locale)] ?? 'English', period, preferences: sanitizeInput(prefs.map((p: { key: string; value: string }) => `${p.key}: ${p.value}`).join('; '), 400) ?? '' }),
    user: 'Write the summary now.',
    tools: insightTools(ctx),
  });

  const out = parseJsonLoose(text) as { summary?: unknown; suggestions?: unknown; unavailable?: unknown } | null;
  if (!out || typeof out.summary !== 'string') throw new HttpError(502, 'AI_UNAVAILABLE');

  const suggestions = (Array.isArray(out.suggestions) ? out.suggestions : []).slice(0, 5).map((s: Record<string, unknown>) => ({
    kind: ['restock', 'collect_debt', 'slow_mover', 'other'].includes(String(s.kind)) ? String(s.kind) : 'other',
    text: String(s.text ?? '').slice(0, 160),
    ref_id: isUuid(s.ref_id) && ctx.seen.has(String(s.ref_id).toLowerCase()) ? String(s.ref_id) : null,
  }));

  // Numbers in the text must exist in tool results; otherwise the whole output is rejected.
  const allowed = collectNumbers(ctx.results);
  const written = [out.summary, ...suggestions.map((s) => s.text)].join(' ');
  if (ungroundedNumbers(written, allowed).length > 0) throw new HttpError(502, 'AI_UNAVAILABLE');

  return {
    summary: out.summary.slice(0, 700), suggestions,
    unavailable: (Array.isArray(out.unavailable) ? out.unavailable : []).slice(0, 4).map((u) => String(u).slice(0, 60)),
  };
});

export default handler;
