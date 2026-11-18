# 04. UI/UX Design Brief

## 1. Design intent

**Subject:** a shop owner's counter. The product replaces the paper ledger and the exercise book of debts.
**Audience:** busy owners and cashiers, mostly on mid-range phones, often one-handed, sometimes offline.
**Primary job:** record a sale or repayment fast, and trust the numbers.

**Feeling:** calm, exact, trustworthy, quick. Like a well-kept ledger that does the arithmetic for you.
**Memorable element (one place only):** the **balance line**. Every money figure is set in tabular numerals with a clear in/out colour, so a scan of any screen tells the story. Everything else stays quiet.

## 2. Design sources and how they are applied

The machine-readable design system lives in `DESIGN.md` (Google Stitch / Awesome DESIGN.md format: tokens plus prose). This brief holds the behaviour rules. Keep both in sync.

| Source | What it is | How it is applied here |
|--------|------------|------------------------|
| Awesome DESIGN.md (VoltAgent collection of DESIGN.md files, based on Google Stitch's format) | A plain-text design system file that coding agents read | `DESIGN.md` at the repo root: YAML tokens plus prose sections; agents must read it before touching UI |
| impeccable | A design skill with a fixed-structure DESIGN.md (Overview, Colors, Typography, Elevation, Components, Do's and Don'ts) and strong anti-generic rules | Same six-section structure in `DESIGN.md`; consistent spacing; no decoration without a job |
| Taste Skill | Anti-"AI slop" frontend skill with three dials (variance, motion, density) | Dials set to 3 / 2 / 6 in `DESIGN.md`; restraint, one memorable move, real hierarchy, template-default checklist in section 12 |
| Web Interface Guidelines (Vercel) | Review rules for accessibility, forms, focus, animation, performance | Run as a review step each milestone; informs sections 7, 9 and 10 |
| UI UX Pro Max | Searchable design intelligence (styles, palettes, font pairings, UX guidelines by product type) | Used to sanity-check palette contrast, font pairing and mobile patterns for a shop-tool product |
| Also used | WCAG 2.2 AA, platform touch-target guidance, the five UX laws below | Sections 5, 9, 10 |

How coding agents use them is in `agents.md` section B ("Design skills"). Style choices here were made for this product; the skills are checks, not a template.

## 3. Design tokens

### Color

| Token | Hex | Use |
|-------|-----|-----|
| `ink` | `#11202B` | Primary text |
| `paper` | `#F6F8F7` | App background (cool, not cream) |
| `surface` | `#FFFFFF` | Cards, sheets |
| `line` | `#DDE3E1` | Dividers, input borders |
| `slate` | `#5B6B76` | Secondary text |
| `ledger` | `#0F7B5F` | Primary action, money in, success |
| `owed` | `#C77D00` | Money owed to the shop: icons, fills, bars (about 3.3:1 on white, so not for small text) |
| `owed-text` | `#8A5600` | Owed amounts as small text (about 6:1 on white) |
| `brick` | `#B3402F` | Overdue, destructive, errors |

Dark mode: derive from the same hues with checked contrast; text on `ledger` is white (4.5:1 minimum). Colour is never the only signal: pair with an icon or label.

### Typography

- **Headings:** Bricolage Grotesque (600), tight tracking, sentence case.
- **Body and UI:** Public Sans (400/500/600). Use `font-variant-numeric: tabular-nums` for all money and quantity.
- Scale (px): 12, 14, 16 (body), 20, 24, 32. Line height 1.4 body, 1.2 headings. Max line length 70 characters.
- Avoid: all-caps labels, single-word colour accents in headlines, decorative eyebrows.

### Spacing, shape, elevation

- 4 px base grid: 4, 8, 12, 16, 24, 32.
- Radius: 8 for inputs and buttons, 12 for cards, 20 for bottom sheets. Different on purpose, tied to hierarchy.
- Elevation: borders first (`line`), shadow only for sheets and the cart bar.
- Touch targets: 48 px minimum height for primary controls, 8 px gaps.

### Motion

- 120 to 180 ms ease-out for responses to taps (press, sheet open, balance change).
- One orchestrated moment only: the balance number counts to its new value after a payment.
- No scroll-triggered fade-ins. Respect `prefers-reduced-motion`.

## 4. Layout principles

- Mobile-first, single column, thumb-zone actions at the bottom.
- The cart bar and primary buttons live in the bottom 40 percent of the screen.
- Two-pane layout from 768 px up (list left, detail right).
- Money amounts right-aligned in lists so digits line up.

## 5. Mandatory UI/UX laws (apply wherever relevant)

| Law | How it applies |
|-----|----------------|
| **Jakob's Law** | Use familiar patterns: bottom tab bar, search at top, swipe back, a calculator-like quantity stepper, receipt layout shops already know |
| **Hick's Law** | 4 tabs max; sale screen shows recent/frequent tiles first; payment sheet shows 3 methods, not 8; progressive disclosure for advanced options |
| **Law of Proximity** | Group a product's name, price and stock together; group the total with the Charge button; separate destructive actions by space |
| **Miller's Law** | Lists chunked (sections by day, A-Z for customers); dashboard shows at most 5 to 7 items per card; steps in flows kept to 3 to 5 |
| **Von Restorff Effect** | One saturated element per screen: the primary action. Overdue debts and low stock are the only other coloured items, so they stand out |

## 6. UX psychology (use where it genuinely helps the user)

| Principle | Application |
|-----------|-------------|
| **Smart defaults** | Cash preselected; amount pre-filled; last-used method; today's date; last cost on restock; sample items in onboarding |
| **Goal gradient** | Onboarding progress bar; debt repayment bar moving toward zero; "3 of 5 products added" |
| **Reciprocity** | Give value first: sample data, instant daily summary after the first sale, free shareable receipts before asking for anything |
| **Endowment effect** | Once the shop's products and customers are entered, show "Your shop: 48 products, 12 customers" so the data feels owned; make export always easy |
| **Loss aversion** | Frame warnings around what would be lost: "3 items will run out this week", "Abel's 1,200 has been owed for 30 days". Never manipulate or guilt |

Ethical line: these patterns support the user's goals (accurate books, collected debts). No dark patterns, no fake urgency.

## 7. Loading, feedback and error rules (whole app)

1. **No spinning loaders.** When we know what will appear, show a **skeleton that matches the real layout** (same row heights, same card shapes). This applies to every list, card, dashboard and sheet across the whole app. A tiny inline progress indicator is only allowed for an unknown-shape wait under a button, and optimistic UI should make even that rare.
2. **Instant feedback.** Every tap responds within 100 ms: pressed state, then success state, even if the server takes longer (optimistic rendering). Show "Saved on this phone" or the sync dot for pending items.
3. **Onboarding is stable.** Buttons never move, resize or jump between steps. Fixed bottom bar, keyboard-safe layout, reserved space for validation messages.
4. **Never show backend errors.** No codes, SQL, stack traces, "500", or raw JSON. Map every failure to a short plain message and a next action. Details go to logs only.
5. Empty states give one sentence and one action.
6. Destructive actions explain the effect in plain words and are reversible where possible (void, not delete).

## 8. Core principles

- **Simplicity:** one primary action per screen; hide advanced options behind "More"; remove a feature before adding a setting.
- **Consistency:** one component per job (one money row, one customer row, one sheet pattern); same verb for the same action across button, toast, and history ("Record payment" then "Payment recorded").
- **Visual hierarchy:** size, weight and position carry importance. Order of emphasis: the number the user came for, the primary action, supporting context, metadata.

## 9. Key component specs

**Product tile (sale screen):** name (16/600), price (14, `slate`, tabular), stock chip only when low. Tap adds one. Minimum 96 x 72 px.
**Cart bar:** pinned bottom, shows item count, total (24/600 tabular), and Charge button. Total updates instantly.
**Money row:** label left, amount right, `ledger` for in, `owed-text` (with an `owed` icon) for owed, `brick` for overdue; sign and icon included.
**Customer row:** name, phone (secondary), balance right-aligned with status colour and icon.
**Bottom sheet:** 20 px top radius, drag handle, primary button anchored at bottom.
**Skeletons:** same dimensions as the real components; subtle shimmer at low contrast, disabled under reduced motion.
**Toasts:** short, confirm the action with the same verb, include Undo where possible.

## 10. Accessibility

- Contrast: 4.5:1 text, 3:1 UI components. Test in light and dark.
- Visible focus ring (2 px `ledger` with offset) on all interactive elements.
- All inputs have visible labels; numeric inputs use the right mobile keyboard.
- Screen-reader names for icon buttons; live region announces "Sale saved".
- Supports 200% text scaling without clipping.
- Language and number formats follow the shop setting; layout ready for right-to-left and longer translated text.

## 11. Copy rules

- Plain words a shopkeeper uses: "Customer owes", not "Receivable".
- Sentence case, active voice, specific buttons ("Record payment", not "Submit").
- Errors say what happened and what to do next, and never apologise vaguely.
- Currency and quantities always carry units.

## 12. What to avoid (anti-template checklist)

- Identical rounded cards everywhere with the same soft shadow.
- Gradient wash backgrounds as decoration.
- Numbered 01/02/03 labels where there is no real sequence.
- Cream-and-terracotta or black-and-neon default palettes.
- Hover-only information (this is a touch-first product).
