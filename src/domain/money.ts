/**
 * Money and quantity math. No floats for money, ever.
 * Money is an integer count of the smallest unit ("minor", 1/100 of a birr).
 * Quantity is an integer count of thousandths ("milli", so 2.5 kg = 2500).
 * Rounding rule (single source of truth): half up to the nearest minor unit,
 * identical to Postgres numeric round() for positive values.
 */
export type Minor = number;
export type Milli = number;

export const MAX_MINOR = 99_999_999_999_999; // numeric(14,2)
export const MAX_QTY_MILLI = 999_999_999;

/** Parse user text like "12", "12.5", "1,200.50" into minor units. Returns null if invalid. */
export function parseMoney(input: string): Minor | null {
  const s = input.trim().replace(/[,\s]/g, '');
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(s)) return null;
  const [whole = '0', frac = ''] = s.split('.');
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(minor) && minor <= MAX_MINOR ? minor : null;
}

/** Parse a server numeric (number or string such as "120.50") into minor units. */
export function toMinor(value: number | string): Minor {
  const s = typeof value === 'number' ? value.toFixed(3) : String(value);
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(s.trim());
  if (!m) throw new Error('invalid money value');
  const sign = m[1] ? -1 : 1;
  const whole = Number(m[2]);
  const third = Number((m[3] ?? '').padEnd(3, '0').slice(0, 3));
  const cents = Math.floor(third / 10) + (third % 10 >= 5 ? 1 : 0); // half up on 3rd decimal
  return sign * (whole * 100 + cents);
}

/** Exact decimal string for sending to the server, e.g. 12050 -> "120.50". */
export function toDecimalString(minor: Minor): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export interface MoneyFormatOptions {
  locale?: string;
  symbol?: string; // "Br" for Ethiopian birr
  symbolAfter?: boolean;
  alwaysDecimals?: boolean;
}

/** "Br 1,200" or "Br 1,200.50". Decimals only when needed, unless alwaysDecimals. */
export function formatMoney(minor: Minor, opts: MoneyFormatOptions = {}): string {
  const { locale = 'en', symbol = 'Br', symbolAfter = false, alwaysDecimals = false } = opts;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const cents = abs % 100;
  const sign = minor < 0 ? '-' : '';
  const wholeText = new Intl.NumberFormat(locale, { maximumFractionDigits: 0, useGrouping: true }).format(whole);
  const decimals = cents !== 0 || alwaysDecimals ? `.${String(cents).padStart(2, '0')}` : '';
  const body = `${sign}${wholeText}${decimals}`;
  return symbolAfter ? `${body} ${symbol}` : `${symbol} ${body}`;
}

/** Parse quantity text ("2", "0.5", "2.250") into milli units. Up to 3 decimals. */
export function parseQty(input: string): Milli | null {
  const s = input.trim().replace(/,/g, '.');
  if (!/^\d{1,6}(\.\d{1,3})?$/.test(s)) return null;
  const [whole = '0', frac = ''] = s.split('.');
  const milli = Number(whole) * 1000 + Number(frac.padEnd(3, '0'));
  return milli > 0 && milli <= MAX_QTY_MILLI ? milli : null;
}

export function formatQty(milli: Milli, locale = 'en'): string {
  const sign = milli < 0 ? '-' : '';
  const abs = Math.abs(milli);
  const whole = Math.floor(abs / 1000);
  const frac = abs % 1000;
  const wholeText = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(whole);
  if (frac === 0) return `${sign}${wholeText}`;
  return `${sign}${wholeText}.${String(frac).padStart(3, '0').replace(/0+$/, '')}`;
}

export function qtyToNumber(milli: Milli): number {
  return milli / 1000;
}

export function numberToQty(value: number | string): Milli {
  return Math.round(Number(value) * 1000);
}

/** unitPrice (minor) x qty (milli) -> minor, rounded half up. BigInt avoids overflow. */
export function lineTotal(unitPrice: Minor, qty: Milli): Minor {
  const product = BigInt(unitPrice) * BigInt(qty);
  return Number((product + 500n) / 1000n);
}

export function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}
