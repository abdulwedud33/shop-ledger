// Polite payment reminder DRAFT for the owner to copy and send. The app never sends messages. (docs/agents.md)
import { serve, runAgent, HttpError, type Ctx } from '../_shared/runtime.ts';
import { reminderTools, type ReminderFacts } from '../_shared/tools.ts';
import { REMINDER_FALLBACK, reminderSystem } from '../_shared/prompts.ts';
import { isSafeReminder, isUuid, parseJsonLoose } from '../_shared/guardrails.ts';

const LANG: Record<string, string> = { en: 'English', am: 'Amharic', om: 'Afaan Oromo' };
const TONES = ['friendly', 'neutral', 'formal'];

serve('reminder', async (ctx: Ctx, body) => {
  if (ctx.role !== 'owner') throw new HttpError(403, 'FORBIDDEN');
  if (!isUuid(body.customerId)) throw new HttpError(400, 'VALIDATION');
  const tone = TONES.includes(String(body.tone)) ? String(body.tone) : 'friendly';
  const facts: { value: ReminderFacts | null } = { value: null };

  const text = await runAgent(ctx, {
    model: 'fast', maxTokens: 350,
    system: reminderSystem({ customerId: String(body.customerId), shopName: ctx.shopName, tone, language: LANG[String(body.locale)] ?? 'English' }),
    user: 'Write the reminder now.',
    tools: reminderTools(ctx, facts),
  });
  if (!facts.value) throw new HttpError(404, 'NOT_FOUND'); // no balance (or unknown customer): nothing to remind

  const out = parseJsonLoose(text) as { message?: unknown; status?: unknown } | null;
  const message = typeof out?.message === 'string' ? out.message.trim() : '';
  const check = isSafeReminder(message, facts.value.balanceText);
  // Unsafe or off-fact output is replaced by a plain template filled by code.
  return {
    message: check.ok && out?.status === 'draft_ready' ? message : REMINDER_FALLBACK(facts.value.name, ctx.shopName, facts.value.balanceText),
    tone,
  };
});
