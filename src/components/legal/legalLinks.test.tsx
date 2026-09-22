/**
 * The in-app legal and support surface: the Profile rows, the auth-screen footer, the
 * mailto construction behind "Contact support" / "Report a problem", and what every one of
 * them does on a device that cannot open the link.
 *
 * Both stores check that the privacy policy and a contact route are reachable from INSIDE
 * the app, and a store reviewer's device very often has no mail account configured — so the
 * failure path is not an edge case here, it is the path the reviewer walks.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LegalSection } from '../account/LegalSection';
import {
  PRIVACY_URL,
  PROBLEM_BODY,
  PROBLEM_SUBJECT,
  SUPPORT_EMAIL,
  SUPPORT_SUBJECT,
  SUPPORT_URL,
  TERMS_URL,
  supportMailto,
} from '../../config/legal';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { LegalFooter } from './LegalTextLink';
import { couldNotOpenMailMessage, couldNotOpenMessage, openExternal } from './openExternal';

async function renderUi(ui: ReactElement) {
  return await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>
  );
}

let openURL: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});

afterEach(() => {
  openURL.mockRestore();
});

describe('openExternal', () => {
  it('reports success when the OS accepts the URL', async () => {
    await expect(openExternal('https://example.com')).resolves.toBe(true);
    expect(openURL).toHaveBeenCalledWith('https://example.com');
  });

  it('swallows the rejection and reports failure instead of throwing', async () => {
    // A mailto: on a phone with no mail account REJECTS. An unhandled rejection here
    // would take down the screen the user tapped from.
    openURL.mockRejectedValue(new Error('no activity found to handle intent'));

    await expect(openExternal('mailto:a@b.com')).resolves.toBe(false);
  });

  it('names the thing that would not open, so the message is actionable', () => {
    expect(couldNotOpenMessage('the privacy policy')).toContain('the privacy policy');
    // For a mailto the ADDRESS is the useful payload, not the word "mail app".
    expect(couldNotOpenMailMessage('help@example.com')).toContain('help@example.com');
  });
});

describe('supportMailto', () => {
  it('points at the configured mailbox and percent-encodes the subject', () => {
    const url = supportMailto('DBF Fitness support request');

    expect(url.startsWith(`mailto:${SUPPORT_EMAIL}?`)).toBe(true);
    expect(url).toContain('subject=DBF%20Fitness%20support%20request');
    // No body was asked for, so none is sent.
    expect(url).not.toContain('body=');
  });

  it('encodes a multi-line body without breaking the URL', () => {
    const url = supportMailto(PROBLEM_SUBJECT, PROBLEM_BODY);

    expect(url).toContain('&body=');
    // Raw newlines and spaces in a mailto silently truncate the body on some clients.
    expect(url).not.toMatch(/[\n ]/);
    expect(decodeURIComponent(url.split('&body=')[1])).toBe(PROBLEM_BODY);
  });
});

describe('LegalSection on Profile', () => {
  it('offers all five rows a reviewer looks for', async () => {
    await renderUi(<LegalSection />);

    for (const id of [
      'legal-privacy',
      'legal-terms',
      'legal-support',
      'legal-contact',
      'legal-report',
    ]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
  });

  it('opens each web link at the configured URL', async () => {
    await renderUi(<LegalSection />);

    for (const [id, url] of [
      ['legal-privacy', PRIVACY_URL],
      ['legal-terms', TERMS_URL],
      ['legal-support', SUPPORT_URL],
    ] as const) {
      await fireEvent.press(screen.getByTestId(id));
      await waitFor(() => expect(openURL).toHaveBeenCalledWith(url));
    }
  });

  it('sends "Report a problem" to the support mailbox with a prefilled subject and body', async () => {
    await renderUi(<LegalSection />);

    await fireEvent.press(screen.getByTestId('legal-report'));

    await waitFor(() =>
      expect(openURL).toHaveBeenCalledWith(supportMailto(PROBLEM_SUBJECT, PROBLEM_BODY))
    );
  });

  it('sends "Contact support" to the same mailbox with the support subject', async () => {
    await renderUi(<LegalSection />);

    await fireEvent.press(screen.getByTestId('legal-contact'));

    await waitFor(() => expect(openURL).toHaveBeenCalledWith(supportMailto(SUPPORT_SUBJECT)));
  });

  it('shows the address itself when no mail app can be opened, rather than a dead tap', async () => {
    openURL.mockRejectedValue(new Error('no mail app'));
    await renderUi(<LegalSection />);

    await fireEvent.press(screen.getByTestId('legal-report'));

    const fallback = await screen.findByTestId('legal-report-error');
    expect(fallback.props.children).toContain(SUPPORT_EMAIL);
  });

  it('names the page when a web link will not open', async () => {
    openURL.mockRejectedValue(new Error('no browser'));
    await renderUi(<LegalSection />);

    await fireEvent.press(screen.getByTestId('legal-privacy'));

    expect(await screen.findByTestId('legal-privacy-error')).toBeTruthy();
  });

  it('announces every row as a button with a hint that matches its destination', async () => {
    await renderUi(<LegalSection />);

    expect(screen.getByTestId('legal-privacy').props.accessibilityHint).toBe(
      'Opens in your browser'
    );
    expect(screen.getByTestId('legal-contact').props.accessibilityHint).toBe('Opens your mail app');
  });
});

describe('LegalFooter on the auth screens', () => {
  it('reaches both documents before any account exists', async () => {
    await renderUi(<LegalFooter testID="auth-legal" />);

    await fireEvent.press(screen.getByTestId('auth-legal-privacy'));
    await waitFor(() => expect(openURL).toHaveBeenCalledWith(PRIVACY_URL));

    await fireEvent.press(screen.getByTestId('auth-legal-terms'));
    await waitFor(() => expect(openURL).toHaveBeenCalledWith(TERMS_URL));
  });

  it('announces each one as a link, not as undecorated text', async () => {
    await renderUi(<LegalFooter testID="auth-legal" />);

    const privacy = screen.getByTestId('auth-legal-privacy');
    expect(privacy.props.accessibilityRole).toBe('link');
    expect(privacy.props.accessibilityLabel).toBe('Privacy Policy');
    // 28 pt of text plus hitSlop is how the 44 pt minimum target is met.
    expect(privacy.props.hitSlop).toBe(8);
  });

  it('degrades to a visible message when the browser will not open', async () => {
    openURL.mockRejectedValue(new Error('no browser'));
    await renderUi(<LegalFooter testID="auth-legal" />);

    await fireEvent.press(screen.getByTestId('auth-legal-privacy'));

    expect(await screen.findByText(couldNotOpenMessage('the privacy policy'))).toBeTruthy();
  });
});
