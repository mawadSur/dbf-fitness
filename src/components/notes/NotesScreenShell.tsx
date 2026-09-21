import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';

import { ScreenHeader, ScreenShell } from '../ui';

type NotesScreenShellProps = {
  title: string;
  children: ReactNode;
  /** Where Back goes when there is no history (deep link / cold start). */
  fallbackHref?: string;
};

/**
 * The frame for every screen under `/notes`.
 *
 * `ScreenShell` owns the status-bar inset and the centred 640 column; `ScreenHeader` draws the
 * screen's one `h1` and the back chevron above the scroll area, so scrolled content can never run
 * under the clock (design system §6).
 *
 * The body does not scroll and is not padded: each notes screen owns a `FlatList` (with its own
 * gutter) and, where it has one, a `BottomActionBar`. `paddingBottom: 0` hands the gesture-bar
 * inset to whichever of those actually touches the bottom edge, so it is never paid twice.
 */
export function NotesScreenShell({ title, children, fallbackHref = '/(tabs)' }: NotesScreenShellProps) {
  const router = useRouter();

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(fallbackHref);
  };

  return (
    <ScreenShell
      scroll={false}
      padded={false}
      contentStyle={{ paddingBottom: 0 }}
      testID="notes-shell"
      header={<ScreenHeader title={title} onBack={goBack} />}
    >
      {children}
    </ScreenShell>
  );
}
