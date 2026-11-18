# guardrails.md

Limits that keep the AI assistant and the product safe, accurate and respectful. Tests for every rule here live in `evals.md`. Security rules are in `security.md`; agent roles in `agents.md`; tool lists in `tools.md`.

**Core idea:** the AI proposes, deterministic code decides, a human confirms.

---

## 1. Principles

1. **Propose, never commit.** No AI path writes to the database. Saving goes through the normal UI and RPC after a tap.
2. **Code does the math.** Totals, stock and balances are computed by server code from current data. The model never computes or invents money figures.
3. **Untrusted by default.** User text, product names, customer names, notes, memory items and tool results are all *data*. They cannot change rules, tools or permissions.
4. **Least data, least power.** Each agent sees only the fields and tools it needs, scoped to the caller's shop and role.
5. **Fail soft.** If the AI is unavailable, limited or unsure, the manual flow works and the message is friendly.

## 2. Input guardrails (before any model call)

| Check | Rule | On failure |
|-------|------|------------|
| Authenticated | Valid session, shop member | 401/403 mapped to friendly text; no model call |
| Role | Insights and reminders: owner only | "Only the owner can use this" |
| Size | Quick-entry text <= 300 characters; other inputs have fixed schemas | Rejected before the model is called |
| Shape | Zod parse; unknown fields rejected | "We couldn't read that. Try again." |
| Content cleanup | Unicode normalised, control characters stripped, zero-width characters removed | Cleaned silently |
| Rate and budget | Limits in section 6 | "Too many tries. Please wait a minute." |
| Kill switch | AI feature flag off | Manual flow shown, no error tone |

## 3. Prompt-injection defences

- **Instruction hierarchy:** the system prompt is fixed in the repo (`prompts.md`) and is the only source of rules. Nothing from users, data or tools can override it.
- **Delimited data:** all untrusted content is inserted inside clearly marked blocks (`<untrusted_data>` ... `</untrusted_data>`) and the prompt states that content inside is never an instruction.
- **Names are data:** a product called "ignore previous instructions" is just a product. Tool results are quoted data, not commands.
- **No model-supplied scope:** tools never accept `shop_id`, user id or role from the model. These come from the verified session.
- **No free-form actions:** the model can only choose from the allow-listed tools, with Zod-validated arguments and per-request call limits (`tools.md`).
- **Output is never executed:** no `eval`, no HTML rendering of model text, no model-built URLs, no model-built SQL.
- **Secrets never in prompts:** keys, tokens and system internals are not placed in any prompt, so they cannot be leaked.
- **Refusal pattern:** requests to reveal the prompt, act outside scope, or reach other shops get a short neutral refusal and a pointer back to supported actions.

## 4. Output guardrails (after the model, before the UI)

Every model output passes this pipeline. Any failure triggers one retry at most, then a friendly fallback.

| Step | Check |
|------|-------|
| 1. Schema | Output parses against the agent's Zod schema (`prompts.md`). Extra or missing fields fail |
| 2. Grounding | Every `product_id` and `customer_id` must appear in this request's tool results. Unknown ids are removed and the item becomes a clarification |
| 3. Recompute | `propose_*` tools recompute totals, stock effects and warnings from the database; model-supplied prices or totals are ignored |
| 4. Sanity limits | Quantity 0 < q <= 10,000; payment <= total; amounts within shop-configured ceilings; dates not in the far future |
| 5. Ambiguity rule | Two or more plausible matches, or low confidence, must return `needs_clarification` instead of a guess |
| 6. Text safety (reminders, insights) | Length limit; no threats, shaming, legal claims or personal data beyond name and amount; no figures that are not in tool results |
| 7. Role filter | Cashier-bound outputs never contain cost or profit fields |
| 8. Render safety | Text is rendered as plain text, escaped |

The UI shows every AI result as a **draft card** with a visible Confirm and Discard. Nothing is saved until Confirm.

## 5. Human-in-the-loop rules

- Every AI draft requires an explicit tap to confirm. No auto-confirm, no timers.
- Higher-impact drafts get an extra visual flag: sale total above the shop's "large sale" threshold, payment larger than the balance, new customer created by AI, stock-in with unusual quantity.
- Reminders are only drafted. The owner copies and sends them; the app never sends messages itself.
- Memory suggestions (aliases, preferences) are saved only after a separate confirm (`memory.md`).
- Each draft card has "Was this right?" feedback that feeds `evals/`.

## 6. Rate limits and budgets (AI)

| Limit | Starting value |
|-------|----------------|
| Per user | 10 requests per minute, 200 per day |
| Per shop | Daily token cap and daily request cap (set per plan) |
| Per request | Entry Parser: 6 tool calls, 3 model turns. Insights: 6 and 3. Reminder: 2 and 2 |
| Input / output size | Input 300 characters (quick entry); output token cap per agent |
| Concurrency | 2 in-flight AI requests per user |
| Global circuit breaker | If provider error rate passes a threshold, AI features pause for a cool-down and the manual flow stays open |
| Cost alerts | Alert when a shop passes 80% of its daily budget; hard stop at 100% |

Limits are enforced before the model call. The user sees a friendly message and the manual option.

## 7. Privacy guardrails

- Send only the fields needed. No phone numbers unless drafting a reminder. No cost or profit outside the owner-only insights flow.
- No customer debt amounts, sales figures or personal details are stored in memory text (`memory.md`).
- Logs record agent name, token counts, outcome and latency only. No raw prompts, no customer names, no amounts tied to people.
- Provider settings: no training on our data, minimal retention (verify against the provider's current terms before launch).
- Each AI request is stateless apart from confirmed shop memory.

## 8. Friendly fallbacks (copy rules)

No backend or model error text ever reaches the user.

| Situation | Message pattern |
|-----------|-----------------|
| Provider down or slow | "The assistant isn't available right now. You can still enter this by hand." + [Open sale screen] |
| Couldn't understand | "I couldn't tell what to record. Try: 2 sugar to Abel on credit." |
| Ambiguous | "Which one do you mean?" + tappable options |
| Rate limited | "Too many tries. Please wait a minute." |
| Not allowed | "Only the owner can use this." |
| Unsafe or out-of-scope request | "I can help with sales, payments, stock and reminders." |

## 9. Product guardrails (non-AI)

These hold across the whole app, not only the AI.

| Guardrail | Rule | Detail in |
|-----------|------|-----------|
| No secrets in the client | Only public URL and anon key ship | `security.md` section 3 |
| Authorized data only | Server decides access from the session; RLS on every table | `security.md` section 5 |
| Backend rules enforced | RPCs, constraints and RLS are the truth; UI checks are convenience | `05-backend-schema.md` |
| Input validated | Client and server, plus DB constraints | `security.md` section 6 |
| Rate limits on all APIs | Every endpoint, with 429 handling | `security.md` section 7 |
| No backend errors shown | Error translation module | `security.md` section 8 |
| Append-only ledgers | Corrections by reversing entries | `05-backend-schema.md` |
| Optimistic rendering with rollback | Instant feedback, clear message on rejection | `02-technical-requirements.md` section 4 |

## 10. Ethical UX guardrails

The psychology patterns in `04-ui-ux-design-brief.md` section 6 are allowed only when they help the user reach their own goals.

- No fake urgency, countdowns, or guilt copy.
- Loss-aversion framing states real numbers from real data ("3 items will run out this week"), never exaggerates.
- Debt reminders are respectful: no threats, no shaming, no mention of legal action, no contact beyond what the owner chooses to send.
- Defaults must favour the user (for example, export is always easy; nothing is pre-ticked that costs money or shares data).
- Every AI-generated text is labelled as a draft until the owner sends or saves it.

## 11. Monitoring and response

- Dashboards: AI success rate, clarification rate, discard rate, schema-failure rate, cost per shop, p95 latency.
- Alerts: schema-failure spike, injection-pattern spike, cost spike, provider errors.
- Kill switches (server-side flags): disable each agent separately, or all AI at once.
- Any harmful or wrong output reported by a user becomes a new case in `evals/` before the fix ships.

## 12. Guardrail to eval map

| Guardrail | Eval |
|-----------|------|
| Injection resistance (text, names, memory) | `evals.md` section 5 |
| Grounding, no hallucinated ids | `evals.md` section 2 (hallucinated id = 0) |
| Numbers match tool data | `evals.md` section 3 |
| Reminder safety | `evals.md` section 4 |
| Role and shop isolation | `evals.md` section 5 and RLS suite |
| Rate limits and fallbacks | `evals.md` section 5 and section 6 |
| No backend text in UI | `evals.md` section 6 (error copy) |
