import { en, type MessageKey, type Messages } from './en';
import { am } from './am';
import { om } from './om';

export type Locale = 'en' | 'am' | 'om';
export const LOCALES: readonly Locale[] = ['en', 'am', 'om'];
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', am: 'አማርኛ', om: 'Afaan Oromoo' };
export const DEFAULT_LOCALE: Locale = 'en';

const catalogs: Record<Locale, Messages> = { en, am, om };

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'am' || value === 'om';
}

export type Params = Record<string, string | number>;

/** Look up a message and fill {placeholders}. Falls back to English, then to the key (never throws). */
export function translate(locale: Locale, key: MessageKey, params?: Params): string {
  const template = catalogs[locale][key] ?? en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_m, name: string) => String(params?.[name] ?? ''));
}

export type { MessageKey, Messages };
export { en };
