import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { render } from '@testing-library/react-native';
import { KeyboardAvoidingView, Platform, Text } from 'react-native';

import { TabIcon } from './navigation/tabIcons';

const root = join(__dirname, '../..');

function loadHelper() {
  let mod!: typeof import('./keyboard');
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('./keyboard');
  });
  return mod;
}

describe('keyboardAvoidingBehavior', () => {
  const original = Platform.OS;
  afterEach(() => {
    Platform.OS = original;
  });

  it.each(['ios', 'android', 'web'] as const)(
    "resolves to 'padding' on %s (Android edge-to-edge no longer resizes the window)",
    (os) => {
      Platform.OS = os;
      const { keyboardAvoidingBehavior, KEYBOARD_AVOIDING_BEHAVIOR } = loadHelper();
      expect(keyboardAvoidingBehavior()).toBe('padding');
      expect(keyboardAvoidingBehavior(os)).toBe('padding');
      expect(KEYBOARD_AVOIDING_BEHAVIOR).toBe('padding');
    },
  );

  it('is accepted by KeyboardAvoidingView', async () => {
    const { KEYBOARD_AVOIDING_BEHAVIOR } = loadHelper();
    const screen = await render(
      <KeyboardAvoidingView behavior={KEYBOARD_AVOIDING_BEHAVIOR}>
        <Text>field</Text>
      </KeyboardAvoidingView>,
    );
    expect(screen.getByText('field')).toBeTruthy();
  });
});

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * The ONLY files allowed to render a raw `<KeyboardAvoidingView>`.
 *
 * Everything else composes `ScreenShell keyboardAvoiding`, which owns the
 * behaviour, the safe-area interaction and the scroll container. This is an
 * exact allowlist ON PURPOSE: the version of this guard that shipped with
 * stage 2 had been softened to `expect(sites.length).toBeGreaterThanOrEqual(2)`
 * during a merge, which asserts nothing about a NEW call site — a screen that
 * hand-rolled its own avoider would have been counted as progress. A set
 * equality is the only shape that fails on an addition.
 *
 * Adding an entry here is a deliberate decision, not a merge accident: say why
 * the shell cannot own that screen's keyboard.
 */
const RAW_KAV_ALLOWLIST: Readonly<Record<string, string>> = {
  'src/components/ui/ScreenShell.tsx':
    'the shell itself — this is the one place the behaviour is applied',
  'src/components/notes/DraftEditor.tsx':
    'a full-height editor that is NOT inside a ScreenShell scroll container',
};

describe('every KeyboardAvoidingView call site', () => {
  const sites = [...sourceFiles(join(root, 'app')), ...sourceFiles(join(root, 'src'))]
    .map((file) => ({ file: file.replace(root + '/', ''), src: readFileSync(file, 'utf8') }))
    .filter(({ src }) => /<KeyboardAvoidingView\b/.test(src));

  it('is exactly the allowlist — a new raw call site fails here', () => {
    const found = sites.map((s) => s.file).sort();
    // Set equality, both directions at once: an UNLISTED file that opens one
    // fails, and so does an allowlist entry that no longer needs to be there.
    expect(found).toEqual(Object.keys(RAW_KAV_ALLOWLIST).sort());
  });

  it('never goes blind: the shell is always one of them', () => {
    // If the scan ever matched nothing (a renamed component, a moved folder,
    // a broken regex) every per-file assertion below would pass vacuously.
    expect(sites.length).toBeGreaterThan(0);
    expect(sites.map((s) => s.file)).toContain('src/components/ui/ScreenShell.tsx');
  });

  it('keeps the screens the shell took over free of their own avoider', () => {
    // Regression guard from the account stream: these were migrated onto
    // `ScreenShell keyboardAvoiding` and must not re-open a raw one.
    const files = sites.map((s) => s.file);
    for (const migrated of [
      'app/(tabs)/profile.tsx',
      'app/coach/profile.tsx',
      'app/(auth)/sign-in.tsx',
      'app/(auth)/sign-up.tsx',
    ]) {
      expect(files).not.toContain(migrated);
    }
  });

  it.each(sites.map((s) => [s.file, s.src] as const))(
    '%s uses the shared behavior and no local platform/constant override',
    (_file, src) => {
      expect(src).toMatch(/behavior=\{KEYBOARD_AVOIDING_BEHAVIOR\}/);
      // Every <KeyboardAvoidingView must carry the shared behavior, not just the first one.
      const opened = (src.match(/<KeyboardAvoidingView\b/g) ?? []).length;
      const shared = (src.match(/behavior=\{KEYBOARD_AVOIDING_BEHAVIOR\}/g) ?? []).length;
      expect(shared).toBe(opened);
      expect(src).toMatch(/import \{[^}]*KEYBOARD_AVOIDING_BEHAVIOR[^}]*\} from '[./]+(?:src\/components\/)?keyboard'/);
      expect(src).not.toMatch(/behavior=\{Platform/);
      expect(src).not.toMatch(/(const|let) KEYBOARD_(AVOIDING_)?BEHAVIOR\b/);
    },
  );
});

describe('tab icons', () => {
  it.each(['home', 'workout', 'food', 'community', 'profile'] as const)('renders %s icon', (n) => {
    expect(() => render(<TabIcon name={n} color="#047857" size={24} />)).not.toThrow();
  });
});
