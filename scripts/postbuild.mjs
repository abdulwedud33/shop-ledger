// Writes out/_headers with a per-page Content-Security-Policy built from the hashes of the inline scripts
// Next.js emits, so script-src needs no 'unsafe-inline'. Run after `next build` (see package.json).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const OUT = 'out';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
let connect = "'self'";
try { const u = new URL(supabaseUrl); connect += ` ${u.origin} wss://${u.host}`; } catch { connect += ' https://*.supabase.co wss://*.supabase.co'; }

const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const base = [
  `default-src 'self'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: blob:`, `font-src 'self'`,
  `connect-src ${connect}`, `manifest-src 'self'`, `worker-src 'self'`, `object-src 'none'`, `base-uri 'self'`,
  `form-action 'self'`, `frame-ancestors 'none'`,
];
const common = [
  'X-Content-Type-Options: nosniff', 'Referrer-Policy: strict-origin-when-cross-origin',
  'Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=()',
  'Strict-Transport-Security: max-age=31536000; includeSubDomains',
];

let headers = '';
for (const file of walk(OUT).filter((f) => f.endsWith('.html'))) {
  const html = readFileSync(file, 'utf8');
  const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]).filter((s) => s.trim().length > 0)
    .map((s) => `'sha256-${createHash('sha256').update(s).digest('base64')}'`);
  let route = '/' + relative(OUT, file).split(sep).join('/').replace(/index\.html$/, '');
  if (route.endsWith('.html')) route = route.replace(/\.html$/, '/');
  const csp = [`script-src 'self' ${[...new Set(hashes)].join(' ')}`, ...base].join('; ');
  headers += `${route}\n  Content-Security-Policy: ${csp}\n${common.map((h) => `  ${h}`).join('\n')}\n\n`;
}
headers += '/sw.js\n  Cache-Control: no-cache\n\n/_next/static/*\n  Cache-Control: public, max-age=31536000, immutable\n';
writeFileSync(join(OUT, '_headers'), headers);
console.log('wrote out/_headers');
