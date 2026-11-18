/** Only public values are read here. Secrets never enter the browser bundle (docs/security.md section 3). */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const env = {
  supabaseUrl: url,
  anonKey,
  appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0',
  configured: url.startsWith('http') && anonKey.length > 20 && !url.includes('YOUR-PROJECT'),
} as const;
