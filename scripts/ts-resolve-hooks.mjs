/**
 * A resolve hook that lets Node import the app's TypeScript modules unchanged.
 *
 * Metro and tsc resolve `./geometry` to `geometry.ts`; Node's ESM resolver does
 * not. Rather than write `./geometry.ts` in app source (which only exists to
 * please this script), the script registers this hook and Node's built-in type
 * stripping does the rest.
 *
 * Used only by `scripts/render-pictograms.mjs`. Never bundled.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    const base = new URL(specifier, context.parentURL ?? pathToFileURL(`${process.cwd()}/`));
    for (const candidate of ['.ts', '.tsx', '/index.ts']) {
      const withExt = new URL(`${base.href}${candidate}`);
      if (existsSync(fileURLToPath(withExt))) {
        return { url: withExt.href, format: 'module-typescript', shortCircuit: true };
      }
    }
  }
  return nextResolve(specifier, context);
}
