import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Guards the shipped `npm run screenshot:web` pipeline against UI renames.
 *
 * The redesign broke it silently: `scripts/screenshot-web.ts` drove sign-in via
 * `getByPlaceholder('Email')`, but the redesigned `AuthField` has a visible
 * label and no `placeholder`, so every authenticated screenshot timed out. The
 * same class of break hit `'‹ Back'`, `'Finish Workout'`, the roster row's
 * accessible name, `'Join'` and `'No one else is in this group yet.'`.
 *
 * Nothing type-checks a Playwright string against a React tree, so this test
 * does it: every `getByTestId('x')` the script uses must correspond to a
 * `testID` that app/ or src/ actually renders, and the script must not fall
 * back to the placeholder-based sign-in that no longer exists.
 */

const ROOT = join(__dirname, '../..');
const SCRIPT_PATH = join(ROOT, 'scripts/screenshot-web.ts');
const SOURCE_DIRS = ['app', 'src'].map((dir) => join(ROOT, dir));
const SKIP_DIRS = new Set(['node_modules', '.git', '__snapshots__']);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const script = readFileSync(SCRIPT_PATH, 'utf8');
const appSource = SOURCE_DIRS.flatMap((dir) => sourceFiles(dir))
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');

/** Every literal id in `getByTestId('id')` in the screenshot script. */
function scriptTestIds(): string[] {
  const ids = new Set<string>();
  for (const match of script.matchAll(/getByTestId\(\s*'([^']+)'\s*\)/g)) {
    ids.add(match[1]);
  }
  return [...ids].sort();
}

/**
 * True when some component can render this testID: either it is written out
 * literally (`testID="finish-workout"`), or it is built from a template whose
 * static prefix matches (`testID={`person-${entry.memberId}`}`).
 */
function isRenderable(id: string): boolean {
  if (appSource.includes(`testID="${id}"`) || appSource.includes(`testID={'${id}'}`)) return true;
  if (new RegExp(`testID=\\{?['"\`]${id}['"\`]`).test(appSource)) return true;

  for (const match of appSource.matchAll(/testID=\{`([^`$]*)\$\{/g)) {
    const prefix = match[1];
    if (prefix.length > 0 && id.startsWith(prefix)) return true;
  }
  return false;
}

/* ------------------------------------------- dynamic testID argument shape --- */

/**
 * A testID built from a template (`testID={`person-${entry.memberId}`}`) is
 * renderable for ANY suffix, so `isRenderable` waves through
 * `getByTestId('person-Sam Rivera')` — which is exactly the bug that shipped:
 * the pipeline passed a NAME where the component interpolates a UUID, so the
 * locator never matched and every community screenshot timed out after 30 s.
 *
 * These helpers recover what the component interpolates and check that the
 * script hands it a value of that shape.
 */
type Shape = 'uuid' | 'index' | 'text';

/** What `expr` in `testID={`prefix-${expr}`}` must be filled with. */
function shapeOfExpression(expr: string): Shape {
  const last = expr.split('.').pop() ?? expr;
  if (/^(index|position|i|n)$/.test(last)) return 'index';
  if (/(^|_)id$|Id$/.test(last)) return 'uuid';
  return 'text';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function matchesShape(value: string, shape: Shape): boolean {
  if (shape === 'uuid') return UUID.test(value);
  if (shape === 'index') return /^\d+$/.test(value);
  return value.length > 0;
}

/** Every `testID={`prefix-${expr}`}` the app renders, as prefix -> expression. */
function dynamicTestIdPrefixes(): Map<string, string> {
  const prefixes = new Map<string, string>();
  for (const match of appSource.matchAll(/testID=\{`([^`$]+)\$\{([^}`]+)\}`\}/g)) {
    prefixes.set(match[1], match[2].trim());
  }
  return prefixes;
}

/** The longest dynamic prefix that `id` starts with, if any. */
function prefixFor(id: string, prefixes: Map<string, string>): string | null {
  let best: string | null = null;
  for (const prefix of prefixes.keys()) {
    if (id.startsWith(prefix) && id.length > prefix.length) {
      if (best === null || prefix.length > best.length) best = prefix;
    }
  }
  return best;
}

/** Top-level `const NAME = 'value'` in the screenshot script. */
function scriptConstants(): Map<string, string> {
  const consts = new Map<string, string>();
  for (const match of script.matchAll(/^const\s+([A-Za-z_$][\w$]*)\s*=\s*'([^']*)'/gm)) {
    consts.set(match[1], match[2]);
  }
  return consts;
}

type ScriptFn = { name: string; params: string[]; body: string };

/**
 * The script's top-level functions with their parameter names and bodies.
 *
 * The file declares every helper as a top-level `function`, closed by a `}` in
 * column 0, so the boundaries are unambiguous without a parser.
 */
function scriptFunctions(): ScriptFn[] {
  const lines = script.split('\n');
  const fns: ScriptFn[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const start = /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(lines[i]);
    if (!start) continue;
    let end = i;
    while (end < lines.length && lines[end] !== '}') end += 1;
    const text = lines.slice(i, end + 1).join('\n');
    const signature = /\(([\s\S]*?)\)\s*:/.exec(text);
    const params = (signature?.[1] ?? '')
      .split(/,(?![^<(]*[>)])/)
      .map((param) => param.trim().split(':')[0].trim())
      .filter((param) => /^[A-Za-z_$][\w$]*$/.test(param));
    fns.push({ name: start[1], params, body: text });
    i = end;
  }
  return fns;
}

/**
 * The string values each function parameter can hold, to a fixpoint.
 *
 * One hop is not enough: the community screenshots go
 * `openCommunity(jordan, SAM_ID)` -> `personCard(page, memberId)` ->
 * `getByTestId(`person-${memberId}`)`, so a wrong value at the OUTER call is
 * two forwards away from the locator. Iterating until nothing new is learned
 * propagates it the whole way. An argument that cannot be resolved (an
 * expression, a computed value) simply contributes nothing, so the guard never
 * blocks a legitimate refactor — it only fails on a value it can actually see.
 */
function parameterValues(fns: ScriptFn[], consts: Map<string, string>): Map<string, Set<string>> {
  const values = new Map<string, Set<string>>();
  const add = (key: string, value: string): boolean => {
    const set = values.get(key) ?? new Set<string>();
    const before = set.size;
    set.add(value);
    values.set(key, set);
    return set.size !== before;
  };

  for (let pass = 0; pass < 10; pass += 1) {
    let changed = false;
    for (const caller of fns) {
      for (const callee of fns) {
        const calls = new RegExp(`(?<![.\\w])${callee.name}\\(([^()]*)\\)`, 'g');
        for (const call of caller.body.matchAll(calls)) {
          const args = call[1].split(',').map((arg) => arg.trim());
          args.forEach((arg, index) => {
            const param = callee.params[index];
            if (!param) return;
            const literal = /^'([^']*)'$/.exec(arg);
            if (literal) {
              changed = add(`${callee.name}.${param}`, literal[1]) || changed;
            } else if (consts.has(arg)) {
              changed = add(`${callee.name}.${param}`, consts.get(arg)!) || changed;
            } else if (caller.params.includes(arg)) {
              for (const forwarded of values.get(`${caller.name}.${arg}`) ?? []) {
                changed = add(`${callee.name}.${param}`, forwarded) || changed;
              }
            }
          });
        }
      }
    }
    if (!changed) break;
  }
  return values;
}

/**
 * Every (id, source) pair the script can actually ask Playwright for: literal
 * ids, plus template ids resolved through the script's constants and the
 * parameter values propagated across the whole helper call graph.
 */
function resolvedScriptTestIds(): { id: string; from: string }[] {
  const consts = scriptConstants();
  const fns = scriptFunctions();
  const values = parameterValues(fns, consts);
  const resolved: { id: string; from: string }[] = [];

  for (const id of scriptTestIds()) resolved.push({ id, from: `getByTestId('${id}')` });

  for (const fn of fns) {
    for (const match of fn.body.matchAll(/getByTestId\(\s*`([^`$]*)\$\{([^}`]+)\}`\s*\)/g)) {
      const [, prefix, rawExpr] = match;
      const expr = rawExpr.trim();
      const from = `getByTestId(\`${prefix}\${${expr}}\`) in ${fn.name}()`;
      if (consts.has(expr)) {
        resolved.push({ id: prefix + consts.get(expr)!, from });
        continue;
      }
      for (const value of values.get(`${fn.name}.${expr}`) ?? []) {
        resolved.push({ id: prefix + value, from });
      }
    }
  }
  return resolved;
}

describe('screenshot:web selectors still exist in the app', () => {
  it('uses testIDs at all (the script is the shipped screenshot pipeline)', () => {
    expect(scriptTestIds().length).toBeGreaterThan(0);
  });

  it.each(scriptTestIds())('renders testID %s somewhere in app/ or src/', (id) => {
    expect(isRenderable(id)).toBe(true);
  });

  it('does not sign in through placeholders — AuthField renders none', () => {
    expect(script).not.toMatch(/getByPlaceholder\(\s*'(Email|Password)'\s*\)/);
    const authField = readFileSync(join(ROOT, 'src/components/auth/AuthField.tsx'), 'utf8');
    expect(authField).not.toMatch(/^\s*placeholder[=:]/m);
  });

  it.each([
    ['sign-in-email', null],
    ['sign-in-password', null],
    ['sign-in-submit', null],
    ['finish-workout', null],
    ['screen-header-back', null],
    ['call-controls-leave', null],
    ['report-sent', null],
  ])('keeps %s as a stable hook for the pipeline', (id) => {
    expect(script).toContain(`getByTestId('${id}')`);
    expect(isRenderable(id)).toBe(true);
  });

  it.each([
    ['Report ${SAM_NAME}', /accessibilityLabel=\{`Report \$\{entry\.fullName\}`\}/],
    ['Block ${SAM_NAME}', /accessibilityLabel=\{`Block \$\{entry\.fullName\}`\}/],
    ['Yes, block ${SAM_NAME}', /accessibilityLabel=\{`Yes, block \$\{entry\.fullName\}`\}/],
  ])('drives the roster action "%s" by an accessible name the app sets', (_label, pattern) => {
    const personRow = readFileSync(join(ROOT, 'src/components/community/PersonRow.tsx'), 'utf8');
    expect(personRow).toMatch(pattern);
  });

  it.each([
    'Join class',
    'Send report',
    'No one else here yet',
    'Camera preview (mock)',
    'Participant list unavailable',
    // Copy the pipeline waits on that was NOT covered before: a stage-2 rename
    // of any of these strands the run for 30 s instead of failing loudly.
    'Workout complete',
    'In this class (',
    'Why are you reporting ',
  ])('matches the copy %p that the app still renders', (copy) => {
    expect(script).toContain(copy);
    expect(appSource).toContain(copy);
  });

  // The redesign dropped this copy from the UI. It may still appear in a source
  // comment (e.g. finishWorkoutErrors.ts describes the "Finish Workout" action),
  // so only the selector call is forbidden — that is what actually times out.
  it.each(['‹ Back', 'Finish Workout', 'No one else is in this group yet.'])(
    'no longer selects on the removed copy %p',
    (removed) => {
      const literal = removed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(script).not.toMatch(new RegExp(`getBy(Text|Role|Label)\\([^)]*${literal}`));
    }
  );

  describe('dynamic testIDs get an argument of the right shape', () => {
    const prefixes = dynamicTestIdPrefixes();
    const resolved = resolvedScriptTestIds();

    it('finds the app’s template testIDs and the script’s resolved ids', () => {
      // A silent zero here would make every case below vacuous.
      expect(prefixes.get('person-')).toBe('entry.memberId');
      expect(resolved.length).toBeGreaterThan(0);
      expect(resolved.map((entry) => entry.id)).toContain(
        'person-66666666-6666-6666-6666-666666666666'
      );
    });

    it.each(resolved.map((entry) => [entry.id, entry.from] as const))(
      '%s (%s) fills its template with the value shape the component interpolates',
      (id) => {
        const prefix = prefixFor(id, prefixes);
        if (prefix === null) return; // A fully literal testID — covered above.
        const shape = shapeOfExpression(prefixes.get(prefix)!);
        const suffix = id.slice(prefix.length);
        expect({ id, prefix, shape, suffix, ok: matchesShape(suffix, shape) }).toMatchObject({
          ok: true,
        });
      }
    );

    it('rejects a name passed where a uuid belongs (the bug that shipped)', () => {
      // The regression itself: `person-<name>` instead of `person-<uuid>`.
      const shape = shapeOfExpression(prefixes.get('person-')!);
      expect(shape).toBe('uuid');
      expect(matchesShape('Sam Rivera', shape)).toBe(false);
      expect(matchesShape('66666666-6666-6666-6666-666666666666', shape)).toBe(true);
      // ...and an index template still accepts only an index.
      expect(matchesShape('2', 'index')).toBe(true);
      expect(matchesShape('two', 'index')).toBe(false);
    });
  });

  it('no longer renders the removed roster-empty and back-link copy', () => {
    // These two left the app outright (unlike "Finish Workout", which lives on
    // as a lower-case label and in comments).
    expect(appSource).not.toContain('‹ Back');
    expect(appSource).not.toContain('No one else is in this group yet.');
  });
});
