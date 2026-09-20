import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { BOX_STYLE_KEYS } from './testing';

/**
 * The bug this file exists to stop coming back.
 *
 * Every JSX element compiles with `jsxImportSource: 'nativewind'`, so
 * `Pressable` is the react-native-css-interop wrapper. That wrapper hands a
 * FUNCTION style straight to the host node inside an array, and React Native
 * never calls a function it finds inside a style array — so on Android every
 * box/layout/colour prop written inside `style={({ pressed }) => …}` is
 * silently dropped. Primary buttons lost their fill, chips lost their pill,
 * cards lost their border; web took another render path and looked right,
 * which is how it shipped.
 *
 * Runtime tests alone cannot hold this line: a component can be rewritten back
 * to the function form and its own test will still pass if the test asserts on
 * a child. So this scans the SOURCE and fails on the pattern itself.
 *
 * Opacity and transform inside the callback stay legal — they are not layout,
 * and losing them costs a press animation, not a visible box.
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

/** Everything the Android Pressable fix covers: the design system and its callers. */
const SCAN_ROOTS = ['src/components', 'app'];

/** Keys that MUST NOT appear inside a function-form style. */
const FORBIDDEN_KEYS = new Set<string>([
  ...BOX_STYLE_KEYS,
  'alignContent',
  'alignItems',
  'alignSelf',
  'aspectRatio',
  'borderBottomColor',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
  'borderCurve',
  'borderEndWidth',
  'borderLeftColor',
  'borderRightColor',
  'borderStartWidth',
  'borderStyle',
  'borderTopColor',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'columnGap',
  'display',
  'elevation',
  'end',
  'flexBasis',
  'flexGrow',
  'flexShrink',
  'flexWrap',
  'justifyContent',
  'marginEnd',
  'marginStart',
  'maxHeight',
  'maxWidth',
  'paddingEnd',
  'paddingStart',
  'rowGap',
  'shadowColor',
  'shadowOffset',
  'shadowOpacity',
  'shadowRadius',
  'start',
  'zIndex',
]);

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Comments and string/template literals out, so a doc comment that QUOTES the
 * broken pattern (both `PressableBase` and `TabBar` explain it at length) is
 * not read as code.
 */
export function stripNoise(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}

/**
 * The `{ … }` block at or after `from`, braces balanced, or `null` when what
 * follows is not a block (`({ pressed }) => pressed ? a : b` has no body to
 * read). One optional `(` is skipped first, because the object-returning arrow
 * form is written `=> ({ … })`.
 */
function blockAt(source: string, from: number): string | null {
  let start = from;
  while (start < source.length && /\s/.test(source[start])) start += 1;
  if (source[start] === '(') {
    start += 1;
    while (start < source.length && /\s/.test(source[start])) start += 1;
  }
  if (source[start] !== '{') return null;
  let depth = 0;
  for (let end = start; end < source.length; end += 1) {
    if (source[end] === '{') depth += 1;
    else if (source[end] === '}' && (depth -= 1) === 0) return source.slice(start + 1, end);
  }
  return null;
}

/**
 * The body of every callback that destructures `pressed` out of its argument,
 * wherever it is written.
 *
 * `functionStyleBodies` only sees the literal `style={(` spelling, so lifting
 * the callback to a name — `const box = ({ pressed }) => ({ padding: 12 })`
 * used as `style={box}` — produced exactly the Android bug while walking past
 * the guard. A `{ pressed }` parameter has one meaning in this codebase (the
 * `Pressable` render callback), so the shape itself is what gets scanned.
 */
export function pressedCallbackBodies(source: string): string[] {
  const bodies: string[] = [];
  // `({ pressed }) =>`, `({ pressed, x }: T) =>`, and `function f({ pressed }) {`.
  const marker = /\(\s*\{[^()]*\bpressed\b[^()]*\}[^()]*\)\s*(?:=>|\{)/g;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(source)) !== null) {
    const isArrow = match[0].trimEnd().endsWith('=>');
    const body = blockAt(source, isArrow ? marker.lastIndex : marker.lastIndex - 1);
    if (body !== null) bodies.push(body);
  }
  return bodies;
}

/** The body of every `style={(…) => …}` callback in `source`, braces balanced. */
export function functionStyleBodies(source: string): string[] {
  const bodies: string[] = [];
  const marker = /style=\{\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(source)) !== null) {
    const open = source.indexOf('{', match.index);
    let depth = 0;
    let end = open;
    for (; end < source.length; end += 1) {
      if (source[end] === '{') depth += 1;
      else if (source[end] === '}' && (depth -= 1) === 0) break;
    }
    bodies.push(source.slice(open + 1, end));
    marker.lastIndex = end;
  }
  return bodies;
}

/** Forbidden keys used inside a function-form style, as `file:key` strings. */
export function layoutKeysInFunctionStyles(source: string): string[] {
  const hits = new Set<string>();
  const clean = stripNoise(source);
  for (const body of [...functionStyleBodies(clean), ...pressedCallbackBodies(clean)]) {
    for (const [, key] of body.matchAll(/(?:^|[{,\s])([A-Za-z_$][\w$]*)\s*:/g)) {
      if (FORBIDDEN_KEYS.has(key)) hits.add(key);
    }
  }
  return [...hits];
}

describe('no layout inside a function-form Pressable style', () => {
  const files = SCAN_ROOTS.flatMap((root) => sourceFiles(path.join(REPO_ROOT, root)));

  it('scans the design system and every screen that renders a Pressable', () => {
    expect(files.length).toBeGreaterThan(40);
    expect(files.some((file) => file.endsWith(path.join('ui', 'Button.tsx')))).toBe(true);
  });

  it.each(files.map((file) => [path.relative(REPO_ROOT, file), file] as const))(
    '%s',
    (_name, file) => {
      expect(layoutKeysInFunctionStyles(readFileSync(file, 'utf8'))).toEqual([]);
    },
  );

  it('catches the pattern it is meant to catch', () => {
    const broken = 'style={({ pressed }) => ({ backgroundColor: pressed ? a : b, padding: 12 })}';
    expect(layoutKeysInFunctionStyles(broken).sort()).toEqual(['backgroundColor', 'padding']);
    const allowed = 'style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}';
    expect(layoutKeysInFunctionStyles(allowed)).toEqual([]);
  });

  it('catches the callback after it is lifted out of the JSX', () => {
    const named = [
      'const box = ({ pressed }) => ({ padding: 12, backgroundColor: pressed ? a : b });',
      '<Pressable style={box} />',
    ].join('\n');
    expect(layoutKeysInFunctionStyles(named).sort()).toEqual(['backgroundColor', 'padding']);

    const typed = 'const box = ({ pressed }: PressableStateCallbackType) => ({ minHeight: 48 });';
    expect(layoutKeysInFunctionStyles(typed)).toEqual(['minHeight']);

    const declared = 'function box({ pressed }) {\n  return { gap: 8, opacity: pressed ? 0.6 : 1 };\n}';
    expect(layoutKeysInFunctionStyles(declared)).toEqual(['gap']);

    const feedbackOnly = 'const fade = ({ pressed }) => ({ opacity: pressed ? 0.6 : 1 });';
    expect(layoutKeysInFunctionStyles(feedbackOnly)).toEqual([]);

    const noBody = 'const pick = ({ pressed }) => (pressed ? a : b);';
    expect(layoutKeysInFunctionStyles(noBody)).toEqual([]);
  });

  it('ignores the pattern when it only appears in a comment', () => {
    const doc = '/** never write style={({ pressed }) => ({ padding: 8 })} */\nconst a = 1;';
    expect(layoutKeysInFunctionStyles(doc)).toEqual([]);
  });
});
