---
version: alpha
name: Shop Ledger
description: A calm, exact, mobile-first ledger for small shops. Fast at the counter, trustworthy in the numbers.
colors:
  ink: "#11202B"
  paper: "#F6F8F7"
  surface: "#FFFFFF"
  line: "#DDE3E1"
  slate: "#5B6B76"
  ledger: "#0F7B5F"
  on-ledger: "#FFFFFF"
  owed: "#C77D00"
  owed-text: "#8A5600"
  brick: "#B3402F"
  dark:
    ink: "#E8EEF0"
    paper: "#0E1519"
    surface: "#16202A"
    line: "#26343D"
    slate: "#9AAAB4"
    ledger: "#3DBE97"
    on-ledger: "#0E1519"
    owed: "#E0A030"
    owed-text: "#E0A030"
    brick: "#E57A68"
typography:
  heading:
    fontFamily: "Bricolage Grotesque"
    fontWeight: 600
    letterSpacing: "-0.01em"
    lineHeight: 1.2
  body:
    fontFamily: "Public Sans"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "tabular-nums"
  scale: [12, 14, 16, 20, 24, 32]
rounded:
  control: 8px
  card: 12px
  sheet: 20px
spacing:
  unit: 4px
  steps: [4, 8, 12, 16, 24, 32]
components:
  button-primary:
    backgroundColor: "{colors.ledger}"
    textColor: "{colors.on-ledger}"
    rounded: "{rounded.control}"
    height: 48px
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    borderColor: "{colors.line}"
    rounded: "{rounded.control}"
    height: 48px
  button-destructive:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.brick}"
    borderColor: "{colors.brick}"
    rounded: "{rounded.control}"
    height: 48px
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    borderColor: "{colors.line}"
    rounded: "{rounded.control}"
    height: 48px
  card:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.line}"
    rounded: "{rounded.card}"
  sheet:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.sheet}"
---

# Shop Ledger design system

Read this before building or changing any screen. It is written for people and for coding agents. Where this file and `04-ui-ux-design-brief.md` differ, update both in the same change. Behaviour rules (loading, feedback, errors, UX laws, psychology) live in the brief; this file holds the visual system.

## Overview

**Subject:** a shop counter. The app replaces a paper ledger and an exercise book of debts.
**Audience:** busy owners and cashiers on mid-range phones, often one-handed, sometimes offline, sometimes in bright light.
**Primary job:** record a sale or a repayment in seconds, and trust the numbers.

**Feeling:** calm, exact, quick. A well-kept ledger that does the arithmetic for you. Quiet surfaces, strong numbers.

**Memorable element (one place only):** the **balance line**. Every money figure is set in tabular numerals, right-aligned, with a clear in/owed/overdue colour plus an icon or label. A glance at any screen should tell the story. Everything else stays restrained.

**Taste dials** (from the Taste Skill's three-dial model; set once, keep stable):

| Dial | Value | Meaning here |
|------|-------|--------------|
| DESIGN_VARIANCE | 3 / 10 | Conventional, predictable layouts (Jakob's Law). No experimental grids |
| MOTION_INTENSITY | 2 / 10 | Motion answers taps only. One orchestrated moment: balance count-up after a payment |
| VISUAL_DENSITY | 6 / 10 | Compact lists for scanning many products; generous spacing around primary actions |

**Layout:** mobile-first single column; primary actions in the bottom 40% of the screen (thumb zone); two-pane (list left, detail right) from 768 px. Content left-aligned; money right-aligned so digits line up. Line length at most 70 characters.

**Grid and spacing:** 4 px base. Steps: 4, 8, 12, 16, 24, 32. Page gutter 16. Related items 8, groups 16, sections 24 or 32.

**Voice:** plain words a shopkeeper uses ("Customer owes", not "Receivable"). Sentence case. Specific buttons ("Record payment", not "Submit"). The same verb in the button, the toast and the history line.

**Design sources applied:** Awesome DESIGN.md / Google Stitch format (this file: tokens plus prose, readable by agents); impeccable (consistent spacing, no decoration without a job, fixed section structure); Taste Skill (restraint, dials, anti-template rules); Web Interface Guidelines (focus, labels, forms, motion, performance, accessibility); UI UX Pro Max (pattern choices by product type, accessible palettes, mobile interaction patterns). See `04-ui-ux-design-brief.md` section 2.

## Colors

Cool, slightly green neutrals (not cream), one confident primary, and two status colours that each mean one thing.

| Token | Light | Role |
|-------|-------|------|
| `ink` | `#11202B` | Primary text |
| `paper` | `#F6F8F7` | App background |
| `surface` | `#FFFFFF` | Cards, sheets, inputs |
| `line` | `#DDE3E1` | Dividers, input borders |
| `slate` | `#5B6B76` | Secondary text, metadata |
| `ledger` | `#0F7B5F` | Primary action, money in, success |
| `owed` | `#C77D00` | Money owed to the shop: fills, icons, bars |
| `owed-text` | `#8A5600` | Owed amounts as small text (meets 4.5:1) |
| `brick` | `#B3402F` | Overdue, destructive, errors |

**Rules**

1. **One saturated element per screen:** the primary action. Overdue debts and low stock are the only other coloured items, so they stand out (Von Restorff).
2. **Colour is never the only signal.** Pair every status colour with an icon or a word ("Owes 1,200", arrow icon, "Overdue 30 days").
3. **Contrast:** text 4.5:1, UI components and large text 3:1. `owed` (`#C77D00`) is about 3.3:1 on white, so it is for icons and fills; use `owed-text` for small text.
4. **Dark mode** uses the same hues with lighter values (see front matter). Text on `ledger` is white in light mode and dark ink in dark mode. Contrast is checked in CI for both themes.
5. No gradient washes as decoration. No pure black or pure white text on tinted backgrounds beyond the tokens above.

## Typography

- **Headings and big numbers:** Bricolage Grotesque, weight 600, slight negative tracking, sentence case.
- **Body and UI:** Public Sans, weights 400, 500, 600.
- **Numbers:** `font-variant-numeric: tabular-nums` on every money and quantity value. Currency symbol smaller and lighter than the figure.
- **Scale (px):** 12 (metadata), 14 (secondary), 16 (body, minimum for inputs), 20, 24 (totals), 32 (hero number). Line height 1.4 for body, 1.2 for headings.
- **Fonts are self-hosted**, subset, `font-display: swap`, with a metric-matched system fallback to avoid layout shift. Fallbacks are bundled per script: Noto Sans Ethiopic for Amharic; Latin fonts cover English and Afaan Oromo. Ge'ez text is set slightly larger (about +1 px) and with more line height so it stays legible. Support 200% text scaling without clipping.
- **Avoid:** all-caps labels, accenting a single word in a headline, decorative eyebrows above headings, monospace for small labels.

## Elevation

Flat first. Hierarchy comes from spacing, size and weight, then borders, and only then shadow.

| Level | Use | Treatment |
|-------|-----|-----------|
| 0 | Page | `paper`, no border |
| 1 | Cards, rows, inputs | `surface` with 1 px `line` border, no shadow |
| 2 | Cart bar, bottom nav | `surface`, top border, very soft upward shadow |
| 3 | Bottom sheets, dialogs | `surface`, 20 px top radius, scrim behind, soft shadow |

**Shape:** radius differs on purpose, by hierarchy: 8 px controls, 12 px cards, 20 px sheets. Pill shapes only for status chips. Touch targets are at least 48 px high with 8 px gaps (Fitts's Law: frequent actions are big and near the thumb).

**Motion:** 120 to 180 ms ease-out for responses to a tap (press, sheet open, balance change). No scroll-triggered fade-ins, no hover-only effects (touch first). Respect `prefers-reduced-motion`: replace movement with instant state change.

## Components

Every component below has default, pressed, focused, disabled and error/loading states. One component per job; reuse, do not fork.

**Buttons.** Primary (`ledger` fill, one per screen, anchored bottom on sheets), secondary (bordered), destructive (bordered `brick`, separated by space from other actions). Label is a specific verb. Pressed state appears within 100 ms. Disabled buttons say why in helper text.

**Inputs.** Visible label above the field (never placeholder-only), 16 px text, correct mobile keyboard (numeric for money and quantity), reserved space for the validation message so layout never jumps. Error text states the fix.

**Product tile (sale screen).** Name 16/600, price 14 `slate` tabular, stock chip only when low. Tap adds one; long press or the quantity field sets a value. Minimum 96 x 72 px.

**Cart bar.** Pinned bottom. Item count, total (24/600 tabular), Charge button. Total updates instantly on every tap. This is where the balance-line idea is strongest.

**Money row.** Label left, amount right. `ledger` for money in, `owed-text` with an icon for owed, `brick` for overdue; sign and icon always present.

**Customer row.** Name, phone as secondary text, balance right-aligned with status colour and icon. Swipe actions are never the only path.

**Bottom sheet.** 20 px top radius, drag handle, content scrolls, primary button anchored at the bottom and clear of the keyboard.

**Status chips.** Low stock, Overdue, Synced / Saved on this phone. Pill shape, icon plus text.

**Skeleton loaders (whole app).** No spinners. When the content shape is known, show a skeleton with the same row heights, card shapes and spacing as the real component, so nothing shifts when data arrives. Low-contrast shimmer; static under reduced motion. A small inline progress hint is allowed only for waits of unknown shape under a button.

**Toasts.** Short, same verb as the action ("Payment recorded"), with Undo where possible, announced to screen readers. Never contain error codes.

**Banners.** Offline ("Offline. Changes are saved on this phone."), sync problems that need action. Quiet, never alarming unless the user must act.

**Empty states.** One sentence and one clear action ("Add your first product").

**Onboarding screens.** Fixed layout; the primary button and progress bar never move, resize or jump between steps; keyboard-safe; reserved space for messages.

## Do's and Don'ts

**Do**

- Give every tap an instant response, then reconcile with the server (optimistic rendering).
- Use smart defaults: cash preselected, amount pre-filled, today's date, last-used method, last cost on restock.
- Show progress toward a goal (onboarding steps, debt moving toward zero).
- Frame warnings around real loss using real numbers ("3 items will run out this week").
- Keep one primary action per screen and put it in the thumb zone.
- Group related things (name, price, stock together; total with Charge) and chunk long lists (by day, A to Z).
- Keep the same word for the same action everywhere.
- Test with 200% text, light and dark, offline, and a screen reader.
- Run the Web Interface Guidelines review and the accessibility audit before each milestone ends.

**Don't**

- Don't use spinning loaders where a layout-matched skeleton is possible.
- Don't show backend errors: no codes, SQL, stack traces, "500" or raw JSON. Plain sentence plus a next step.
- Don't move buttons during onboarding.
- Don't rely on colour alone, hover-only information, or tiny touch targets.
- Don't use identical rounded cards with the same soft shadow everywhere, gradient wash backgrounds, numbered 01/02/03 labels without a real sequence, or cream-and-terracotta / black-and-neon default palettes.
- Don't use fake urgency, guilt copy or hidden costs. Patterns from psychology must help the user reach their own goal.
- Don't add a setting when removing a feature would do (simplicity).
- Don't invent one-off components, colours or spacing; extend the tokens here first.
