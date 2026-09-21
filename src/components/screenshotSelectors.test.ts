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

  it('no longer renders the removed roster-empty and back-link copy', () => {
    // These two left the app outright (unlike "Finish Workout", which lives on
    // as a lower-case label and in comments).
    expect(appSource).not.toContain('‹ Back');
    expect(appSource).not.toContain('No one else is in this group yet.');
  });
});
