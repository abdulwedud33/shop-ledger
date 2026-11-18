// Local test helper: lets Node run extensionless TypeScript imports without installing tsx.
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  try { return await next(specifier, context); }
  catch (e) {
    if (e.code === 'ERR_MODULE_NOT_FOUND' || e.code === 'ERR_UNSUPPORTED_DIR_IMPORT') {
      for (const ext of ['.ts', '/index.ts']) {
        try { return await next(specifier + ext, context); } catch {}
      }
    }
    throw e;
  }
}`), import.meta.url);
