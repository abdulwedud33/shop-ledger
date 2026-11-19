import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const appManifest = JSON.parse(readFileSync('.next/app-build-manifest.json', 'utf8'));

console.log('=== Gzip First-Load JS per App Route (Budget: 170 KB) ===');
const budget = 170 * 1024; // 170 KB

for (const [route, files] of Object.entries(appManifest.pages)) {
  const allFiles = new Set([...files]);
  let totalRaw = 0;
  let totalGzip = 0;

  for (const f of allFiles) {
    if (!f.endsWith('.js')) continue;
    try {
      const buf = readFileSync(join('.next', f));
      totalRaw += buf.length;
      totalGzip += gzipSync(buf).length;
    } catch {
      // ignore
    }
  }

  const gzipKb = (totalGzip / 1024).toFixed(1);
  const rawKb = (totalRaw / 1024).toFixed(1);
  const pass = totalGzip <= budget ? 'PASS' : 'FAIL';
  console.log(`${route.padEnd(25)}: ${gzipKb.padStart(6)} KB gzip (${rawKb.padStart(6)} KB raw) -> ${pass}`);
}
