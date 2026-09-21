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

describe('every KeyboardAvoidingView call site', () => {
  const sites = [...sourceFiles(join(root, 'app')), ...sourceFiles(join(root, 'src'))]
    .map((file) => ({ file, src: readFileSync(file, 'utf8') }))
    .filter(({ src }) => /<KeyboardAvoidingView\b/.test(src));

  it('finds the known call sites (guards against this scan going blind)', () => {
    // Screens migrated onto the design system get keyboard avoidance from
    // `ScreenShell keyboardAvoiding`, so the number of RAW call sites shrinks as
    // the redesign lands. A fixed count would only record how far that has got;
    // what must never happen is the scan finding nothing (which would make every
    // assertion below pass vacuously) or losing the shell itself.
    const files = sites.map((s) => s.file.replace(root + '/', ''));
    expect(files).toContain('src/components/ui/ScreenShell.tsx');
    expect(sites.length).toBeGreaterThanOrEqual(2);
    // Whatever is left, no screen may hand-roll the behavior — asserted per file below.
    expect(files.every((file) => /\.tsx$/.test(file))).toBe(true);
    // Screens that stage 2 folded into the shell must NOT re-open a raw one: the shell
    // owns their keyboard handling now. (Regression guard from the account stream.)
    for (const migrated of ['app/(tabs)/profile.tsx', 'app/coach/profile.tsx']) {
      expect(files).not.toContain(migrated);
    }
  });

  it.each(sites.map((s) => [s.file.replace(root + '/', ''), s.src] as const))(
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
