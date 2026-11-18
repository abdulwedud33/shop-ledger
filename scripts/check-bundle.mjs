// Fails the build if anything that looks like a secret ships in the static output (docs/security.md section 3).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const problems = [];
for (const file of walk('out').filter((f) => /\.(js|html|json|map|txt|css|webmanifest)$/.test(f))) {
  const text = readFileSync(file, 'utf8');
  if (/service_role/.test(text)) problems.push(`${file}: contains "service_role"`);
  if (/sk-ant-[A-Za-z0-9_-]{10,}/.test(text)) problems.push(`${file}: looks like an Anthropic key`);
  if (/ANTHROPIC_API_KEY/.test(text)) problems.push(`${file}: mentions ANTHROPIC_API_KEY`);
  for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{15,}\.([A-Za-z0-9_-]{15,})\.[A-Za-z0-9_-]{10,}/g)) {
    try {
      const payload = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'));
      if (payload.role && payload.role !== 'anon') problems.push(`${file}: JWT with role "${payload.role}"`);
    } catch { /* not a JWT */ }
  }
}
if (problems.length) { console.error('Secret scan failed:\n' + problems.join('\n')); process.exit(1); }
console.log('Bundle secret scan passed.');
