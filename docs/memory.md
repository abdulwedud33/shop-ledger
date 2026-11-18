# memory.md

What the in-app AI may remember about a shop, and how. Goal: better parsing and fewer repeated corrections, without storing sensitive or unnecessary data.

## Principles

1. **Per-shop only.** Memory is scoped by `shop_id` and protected by RLS. Never shared across shops.
2. **Visible and editable.** Owners can see, edit, and delete every memory item in Settings > Assistant memory.
3. **Small and useful.** Only things that improve future accuracy. Hard caps below.
4. **User-confirmed.** The AI may *suggest* a memory ("Remember that 'Abe' means Abebe Kebede?"). It is saved only after a tap.
5. **Data, not instructions.** Memory text is passed to the model as quoted data. It can never change rules, permissions, or tools (see `guardrails.md`).

## Stored in `shop_memory`

| Kind | Examples | Used by |
|------|----------|---------|
| `alias` | "sukar" means Sugar 1kg; "Abe" means customer Abebe Kebede | Entry Parser |
| `preference` | Reminder tone is "friendly"; summaries in short form | Reminder Writer, Insights |
| `fact` | "Shop closes on Sundays"; "Main supplier delivers Tuesdays" | Insights Analyst |

Limits: 200 items per shop; key <= 80 chars; value <= 300 chars; no duplicates per `(kind, key)`.

## Never stored

- Phone numbers, addresses, ID numbers, payment details.
- Customer debt amounts or sales figures (those are live data from tools, never cached text).
- Personal opinions or sensitive facts about customers or staff.
- Anything the user did not confirm.
- Conversation transcripts. Each AI request is stateless apart from the confirmed memory above.

## Read flow

1. Edge Function loads `shop_memory` rows for the session's shop (RLS enforced).
2. Only the relevant kinds are added to the prompt, wrapped in a delimited data block.
3. Items are truncated to the caps.

## Write flow

1. Agent output includes an optional `memory_suggestion` (validated by schema).
2. UI shows a small card: "Remember this?" with the exact text.
3. On confirm, client calls an RPC that validates length, kind, and duplicates, then inserts.
4. Audit log records create/edit/delete.

## Retention and deletion

- Items persist until deleted by an owner or cashier with access.
- Deleting a shop deletes its memory (cascade).
- A "Clear assistant memory" button removes all items at once.
- Memory is excluded from analytics and never used for model training.

## Coding-agent project memory

For people or agents building the app, keep decisions in the repo, not in chat:

- `docs/decisions/` with one short file per decision (context, choice, why, date).
- `06-implementation-plan.md` tracks status.
- `prompts.md` carries a version history of every prompt change and why.
