import { z } from 'zod';
import { parseMoney, parseQty } from '../domain/money';
import type { MessageKey } from '../i18n';

/** Client-side validation. Messages are i18n keys; the server re-validates everything (docs/security.md section 6). */
const text = (max: number) => z.string().trim().min(1, 'v.required').max(max, 'v.too_long');
const money = z.string().trim().refine((v) => parseMoney(v) !== null, 'v.number');
const moneyOpt = z.string().trim().refine((v) => v === '' || parseMoney(v) !== null, 'v.number');
const qty = z.string().trim().refine((v) => parseQty(v) !== null, 'v.number');
/** Like qty but zero (or empty) is allowed: opening stock and warning levels. */
const qtyZero = z.string().trim().refine((v) => v === '' || /^0([.,]0{1,3})?$/.test(v) || parseQty(v) !== null, 'v.number');
/** Text to milli units; empty or zero is 0. */
export const toQtyOrZero = (v: string): number => (v.trim() === '' ? 0 : parseQty(v) ?? 0);

export const signInSchema = z.object({
  email: z.string().trim().email('v.email').max(254, 'v.too_long'),
  password: z.string().min(10, 'v.password').max(200, 'v.too_long'),
});
export const signUpSchema = signInSchema.extend({ name: z.string().trim().max(100, 'v.too_long') });

export const shopNameSchema = z.object({ name: text(80) });
export const productSchema = z.object({
  name: text(120), unit: text(20), price: money, cost: moneyOpt, opening: qtyZero, reorder: qtyZero,
});
export const customerSchema = z.object({ name: text(100), phone: z.string().trim().max(30, 'v.too_long'), limit: moneyOpt });
export const paymentSchema = z.object({ amount: money });
export const restockSchema = z.object({ qty, cost: moneyOpt });
export const adjustSchema = z.object({ delta: z.string().trim().refine((v) => /^-?\d+([.,]\d{1,3})?$/.test(v) && Number(v.replace(',', '.')) !== 0, 'v.number'), reason: z.string().trim().min(3, 'v.required').max(200, 'v.too_long') });
export const reasonSchema = z.object({ reason: z.string().trim().min(3, 'v.required').max(200, 'v.too_long') });
export const inviteCodeSchema = z.object({ code: z.string().trim().min(8, 'v.required').max(32, 'v.too_long') });

export type FieldErrors = Record<string, MessageKey>;
export type Validated<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors };

export function validate<S extends z.ZodTypeAny>(schema: S, input: unknown): Validated<z.infer<S>> {
  const r = schema.safeParse(input);
  if (r.success) return { ok: true, data: r.data };
  const errors: FieldErrors = {};
  for (const issue of r.error.issues) {
    const key = String(issue.path[0] ?? '_');
    if (!errors[key]) errors[key] = (issue.message.startsWith('v.') ? issue.message : 'v.required') as MessageKey;
  }
  return { ok: false, errors };
}
