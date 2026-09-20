import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Appearance } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import GalleryScreen from '../../app/dev/gallery';
import { ICON_NAMES } from './ui/icons';
import { ThemeProvider } from '../theme/ThemeProvider';
import { themes, type ThemeName } from '../theme/tokens';
import { BOTH_THEMES, INCLUDING_HIDDEN, PHONE_METRICS } from './ui/testing';

const mockRedirect = jest.fn();

jest.mock('expo-router', () => ({
  Redirect: (props: { href: string }) => {
    mockRedirect(props.href);
    return null;
  },
}));

async function renderGallery(scheme: ThemeName = 'light') {
  jest.spyOn(Appearance, 'getColorScheme').mockReturnValue(scheme);
  return render(
    <SafeAreaProvider initialMetrics={PHONE_METRICS}>
      <ThemeProvider>
        <GalleryScreen />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

/**
 * One representative piece of visible text per component in the gallery. If a
 * component stops rendering (or is dropped from the gallery), the screenshot QA
 * pass that this route exists for would silently lose coverage — so the list is
 * asserted rather than eyeballed.
 */
const COMPONENT_MARKERS: [component: string, text: string | RegExp][] = [
  ['ScreenHeader', 'Component gallery'],
  ['Logo', 'Logo'],
  ['Eyebrow', 'Eyebrow'],
  ['Heading display', 'Display 40'],
  ['Heading 1', 'Heading 1'],
  ['Heading 2', 'Heading 2'],
  ['Heading 3', 'Heading 3'],
  ['Text bodyLg', 'Body large 17'],
  ['Text body', 'Body 16'],
  ['Text bodySm', /Body small 14/],
  ['Text caption', /Caption 12/],
  ['SectionHeader', /^Icons \(\d+\)$/],
  ['Button primary', 'Primary'],
  ['Button secondary', 'Secondary'],
  ['Button ghost', 'Ghost'],
  ['Button danger', 'Danger'],
  ['Button sizes', 'Large'],
  ['Button loading', 'Loading'],
  ['Button disabled', 'Disabled'],
  ['Button with icons', 'With icons'],
  ['Button fullWidth', 'Full width'],
  ['Card', 'Card · surface'],
  ['Card raised', /Card · raised/],
  ['Card pressable', /Card · soft, pressable/],
  ['HeroPanel', /Transform Your Body/],
  ['Chip', 'Strength'],
  ['Badge', 'Neutral'],
  ['MilestoneBadge', 'First day'],
  ['ListRow', 'List row'],
  ['ChecklistRow', 'Back squat'],
  ['Input', 'Email'],
  ['Input error', 'Enter a valid email address.'],
  ['ProgressRing', 'Day streak'],
  ['Banner success', 'success banner'],
  ['Banner warning', 'warning banner'],
  ['Banner danger', 'danger banner'],
  ['Banner info', 'info banner'],
  ['Banner dismissible', 'Dismissible'],
  ['EmptyState', 'No notes yet'],
  ['FixedFooter', 'Primary action'],
];

describe('dev gallery route', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockRedirect.mockClear();
  });

  describe.each(BOTH_THEMES)('in the %s theme', (scheme: ThemeName) => {
    it('renders every design-system component', async () => {
      await renderGallery(scheme);
      const missing = COMPONENT_MARKERS.filter(
        ([, text]) => screen.queryAllByText(text).length === 0,
      ).map(([component]) => component);
      expect(missing).toEqual([]);
    });

    it('renders every icon in the set', async () => {
      await renderGallery(scheme);
      const drawn = new Set(
        screen
          .getAllByTestId(/^icon-/, INCLUDING_HIDDEN)
          .map((node) => String(node.props.testID).replace(/^icon-/, '')),
      );
      expect(ICON_NAMES.filter((name) => !drawn.has(name))).toEqual([]);
    });

    it('paints on the theme background rather than a hard-coded colour', async () => {
      await renderGallery(scheme);
      const flat: Record<string, unknown> = Object.assign(
        {},
        ...[screen.getByTestId('gallery').props.style].flat(3).filter(Boolean),
      );
      expect(flat.backgroundColor).toBe(themes[scheme].bg);
    });

    it('does not redirect while the bundle is a dev bundle', async () => {
      await renderGallery(scheme);
      expect(mockRedirect).not.toHaveBeenCalled();
    });
  });

  it('toggles the theme from the header control', async () => {
    await renderGallery('light');
    expect(screen.getByText(/DBF design system · light/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('gallery-theme-toggle'));
    await waitFor(() => expect(screen.getByText(/DBF design system · dark/)).toBeTruthy());
  });

  it('dismisses the dismissible banner', async () => {
    await renderGallery('light');
    expect(screen.getByText('Dismissible')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Dismiss'));
    expect(screen.queryByText('Dismissible')).toBeNull();
  });

  it('redirects to the root and renders nothing when the bundle is not __DEV__', async () => {
    // `__DEV__` is a Metro-injected global, so it is reached through a cast
    // rather than a declaration — a release bundle is exactly this case.
    const globals = globalThis as unknown as { __DEV__: boolean };
    const previous = globals.__DEV__;
    globals.__DEV__ = false;
    try {
      await renderGallery('light');
      expect(mockRedirect).toHaveBeenCalledWith('/');
      expect(screen.queryByText('Component gallery')).toBeNull();
    } finally {
      globals.__DEV__ = previous;
    }
  });
});
