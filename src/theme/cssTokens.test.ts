import { readFileSync } from 'fs';
import { join } from 'path';

import { parseHex } from './contrast';
import { darkTheme, lightTheme, type ThemeColors, type ThemeName } from './tokens';

/**
 * `global.css` and `tokens.ts` are the SAME palette written twice — once as
 * `rgb()` channels for the Tailwind/NativeWind utilities, once as hex for style
 * props and SVG. Nothing kept them in step, so a token added to one side (and
 * the disabled/linear-track pair added for the stage-2 fixes is exactly that
 * shape of change) could ship with the two halves of the app disagreeing about
 * a colour, in one theme only, with no test to say so.
 */

const CSS = readFileSync(join(__dirname, '../../global.css'), 'utf8');
const TAILWIND = readFileSync(join(__dirname, '../../tailwind.config.js'), 'utf8');

/** `--color-foo-bar` for the `fooBar` token. */
function cssVariableName(token: string): string {
  return `--color-${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/** The `:root` (light) and `.dark:root` (dark) blocks, separately. */
function blockFor(scheme: ThemeName): string {
  const start = CSS.indexOf(scheme === 'dark' ? '.dark:root {' : ':root {');
  expect(start).toBeGreaterThanOrEqual(0);
  const end = CSS.indexOf('\n  }', start);
  expect(end).toBeGreaterThan(start);
  return CSS.slice(start, end);
}

function declaredChannels(block: string, variable: string): [number, number, number] | null {
  const match = new RegExp(`${variable}:\\s*([0-9]+) ([0-9]+) ([0-9]+);`).exec(block);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

describe.each<[ThemeName, ThemeColors]>([
  ['light', lightTheme],
  ['dark', darkTheme],
])('global.css %s theme', (scheme, theme) => {
  const block = blockFor(scheme);

  it.each(Object.keys(theme) as (keyof ThemeColors)[])(
    'declares %s with the same value as tokens.ts',
    (token) => {
      const variable = cssVariableName(token);
      const channels = declaredChannels(block, variable);
      expect({ token, declared: channels !== null }).toEqual({ token, declared: true });
      expect({ token, channels }).toEqual({ token, channels: parseHex(theme[token]) });
    },
  );
});

describe('tailwind.config.js', () => {
  it.each(Object.keys(lightTheme) as (keyof ThemeColors)[])(
    'exposes a utility backed by the %s variable',
    (token) => {
      // The config composes them as `token('progress-track-linear')`, so the
      // variable SUFFIX is what has to appear — never the raw hex.
      const suffix = cssVariableName(token).replace('--color-', '');
      expect({ token, referenced: TAILWIND.includes(`token('${suffix}')`) }).toEqual({
        token,
        referenced: true,
      });
    },
  );

  it('never hard-codes a hex colour in a real declaration', () => {
    // Comments may name a hex to explain WHY a token exists; the config itself
    // must always go through a CSS variable so one edit moves both themes.
    const code = TAILWIND.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });
});
