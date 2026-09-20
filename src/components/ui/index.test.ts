import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import * as ui from './index';

const DIR = __dirname;

/**
 * Test-only scaffolding, which must NOT be re-exported: the barrel is what
 * screens import, and pulling jest helpers into it would drag
 * `@testing-library/react-native` into the production bundle.
 *
 * Neither file is named `*.test.tsx` — `testing.tsx` holds the shared render
 * helpers and `androidPressableMock.tsx` is the `Pressable` stand-in that
 * `pressableAndroidBox.test.tsx` feeds to `jest.mock` (a mock factory may not
 * close over out-of-scope variables, so it has to be its own module). Both are
 * therefore listed here by hand.
 */
const NOT_PUBLIC = new Set(['index.ts', 'testing.tsx', 'androidPressableMock.tsx']);

/** Every design-system module whose public surface the barrel has to re-export. */
function publicModules(): string[] {
  return readdirSync(DIR)
    .filter((file) => /\.tsx?$/.test(file))
    .filter((file) => !/\.test\.tsx?$/.test(file))
    .filter((file) => !NOT_PUBLIC.has(file))
    .sort();
}

/**
 * The names a module exports, read from its source.
 *
 * Importing each module and reading `Object.keys` would work too, but it also
 * drops every exported TYPE — and half of what a screen imports from the barrel
 * is a type. So the declarations are read from the text instead.
 */
function exportedNames(file: string): string[] {
  const source = readFileSync(join(DIR, file), 'utf8');
  const names = new Set<string>();
  const declaration = /^export\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(function|const|let|class|type|interface|enum)\s+([A-Za-z0-9_$]+)/gm;
  for (const match of source.matchAll(declaration)) names.add(match[2]);
  // `export { a, b as c }` re-export lists.
  for (const match of source.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of match[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.replace(/^type\s+/, '').trim();
      if (name) names.add(name);
    }
  }
  return [...names];
}

const barrel = readFileSync(join(DIR, 'index.ts'), 'utf8');

/** Names the barrel re-exports, values and types alike. */
const reExported = new Set<string>(
  [...barrel.matchAll(/^export\s*\{([\s\S]*?)\}\s*from/gm)].flatMap((match) =>
    match[1]
      .split(',')
      .map((part) => part.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()?.trim() ?? '')
      .filter(Boolean),
  ),
);

describe('src/components/ui barrel', () => {
  it('finds the design-system modules it is meant to cover', () => {
    // A sanity floor: if the glob silently matched nothing the suite below
    // would pass vacuously.
    expect(publicModules().length).toBeGreaterThanOrEqual(20);
  });

  it.each(publicModules())('re-exports everything %s declares', (file) => {
    const missing = exportedNames(file).filter((name) => !reExported.has(name));
    expect(missing).toEqual([]);
  });

  it('does not leak the test-only helpers into the public surface', () => {
    for (const name of [
      'renderInTheme',
      'renderWithInsets',
      'mockReducedMotion',
      'BOTH_THEMES',
      'AndroidPressable',
    ]) {
      expect(reExported.has(name)).toBe(false);
      expect(name in ui).toBe(false);
    }
  });

  it('exports every component as a callable value, not just a type', () => {
    const components = [
      'Badge', 'Banner', 'Button', 'Card', 'ChecklistRow', 'Chip', 'EmptyState', 'Eyebrow',
      'FixedFooter', 'Heading', 'HeroPanel', 'Icon', 'Input', 'ListRow', 'Logo', 'MilestoneBadge',
      'ProgressRing', 'ScreenHeader', 'ScreenShell', 'SectionHeader', 'Skeleton', 'Text',
    ] as const;
    for (const name of components) {
      expect(typeof (ui as Record<string, unknown>)[name]).toBe('function');
    }
  });
});
