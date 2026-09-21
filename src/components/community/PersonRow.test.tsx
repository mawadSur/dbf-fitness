import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Keyboard, StyleSheet } from 'react-native';

import { blockUser, reportUser } from '../../features/community/api';
import { MAX_REPORT_DETAILS_LENGTH } from '../../features/community/reportReasons';
import type { RosterEntry } from '../../features/community/roster';
import { PersonRow } from './PersonRow';
import { ScrollIntoViewContext } from './ScrollIntoView';

jest.mock('../../features/community/api', () => ({
  blockUser: jest.fn().mockResolvedValue(undefined),
  reportUser: jest.fn().mockResolvedValue(undefined),
}));

const ENTRY: RosterEntry = { memberId: 'u-sam', fullName: 'Sam Rivera', online: true };

async function renderRow(scrollIntoView = jest.fn(), onNotice = jest.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  await render(
    <QueryClientProvider client={client}>
      <ScrollIntoViewContext.Provider value={scrollIntoView}>
        <PersonRow entry={ENTRY} onNotice={onNotice} />
      </ScrollIntoViewContext.Provider>
    </QueryClientProvider>
  );
  return { scrollIntoView, onNotice };
}

/** Report and Block are always-visible labelled buttons — no long-press, no hidden menu. */
async function openReportForm() {
  await fireEvent.press(screen.getByLabelText('Report Sam Rivera'));
}

/** A control clears the 44pt minimum through its own box plus its hitSlop. */
function touchTarget(node: { props: { style?: unknown; hitSlop?: unknown } }): number {
  const box = StyleSheet.flatten(node.props.style as never) as { minHeight?: number; height?: number };
  const slop = typeof node.props.hitSlop === 'number' ? node.props.hitSlop : 0;
  return (box.minHeight ?? box.height ?? 0) + 2 * slop;
}

beforeEach(() => jest.clearAllMocks());

describe('PersonRow', () => {
  it('shows presence as a dot AND a word, truncates a long name, and offers both safety actions', async () => {
    await renderRow();
    expect(screen.getByTestId('presence-online')).toBeTruthy();
    expect(screen.getByText('Online')).toBeTruthy();
    expect(screen.getByText('Sam Rivera').props.numberOfLines).toBe(1);
    expect(screen.getByText('SR')).toBeTruthy();
    expect(screen.getByLabelText('Report Sam Rivera')).toBeTruthy();
    expect(screen.getByLabelText('Block Sam Rivera')).toBeTruthy();
  });

  it('shows an offline person as Offline with the muted dot', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await render(
      <QueryClientProvider client={client}>
        <PersonRow entry={{ ...ENTRY, online: false }} onNotice={jest.fn()} />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('presence-offline')).toBeTruthy();
    expect(screen.getByText('Offline')).toBeTruthy();
  });

  it('report details field: keyboard-friendly, and the form scrolls itself into view when it opens', async () => {
    const { scrollIntoView } = await renderRow();
    await openReportForm();
    const input = screen.getByTestId('report-details');
    expect(input.props.returnKeyType).toBe('done');
    expect(input.props.multiline).toBe(true);
    expect(screen.getByText(`Up to ${MAX_REPORT_DETAILS_LENGTH} characters.`)).toBeTruthy();

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.calls[0][0]).toHaveProperty('current');
  });

  it('dismisses the keyboard on submit-editing and when sending the report', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    await renderRow();
    await openReportForm();
    await fireEvent(screen.getByTestId('report-details'), 'submitEditing');
    expect(dismiss).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByLabelText('Send report'));
    expect(dismiss).toHaveBeenCalledTimes(2);
    dismiss.mockRestore();
  });

  it('requires a reason, then sends the report and confirms', async () => {
    await renderRow();
    await openReportForm();
    await fireEvent.press(screen.getByLabelText('Send report'));
    expect(reportUser).not.toHaveBeenCalled();
    expect(await screen.findByText('Pick a reason.')).toBeTruthy();

    const chip = screen.getByTestId('report-reason-Harassment');
    expect(chip.props.accessibilityState).toMatchObject({ selected: false });
    await fireEvent.press(chip);
    expect(screen.getByTestId('report-reason-Harassment').props.accessibilityState).toMatchObject({
      selected: true,
    });
    await fireEvent.changeText(screen.getByTestId('report-details'), 'Rude in chat');
    await fireEvent.press(screen.getByLabelText('Send report'));

    await waitFor(() => expect(reportUser).toHaveBeenCalledTimes(1));
    expect((reportUser as jest.Mock).mock.calls[0][0]).toBe('u-sam');
    expect((reportUser as jest.Mock).mock.calls[0][1]).toContain('Rude in chat');
    expect(await screen.findByText('Report sent. Thanks for keeping the group safe.')).toBeTruthy();
  });

  it('says in plain words what a report does', async () => {
    await renderRow();
    await openReportForm();
    expect(screen.getByText(/never told who reported them/)).toBeTruthy();
  });

  it('reason chips and action buttons clear the 44pt minimum', async () => {
    await renderRow();
    await openReportForm();
    expect(touchTarget(screen.getByLabelText('Send report'))).toBeGreaterThanOrEqual(44);
    expect(touchTarget(screen.getByLabelText('Cancel report'))).toBeGreaterThanOrEqual(44);
    expect(touchTarget(screen.getByTestId('report-reason-Spam'))).toBeGreaterThanOrEqual(44);
  });

  it('blocks only after an inline confirmation (no Alert)', async () => {
    const { onNotice } = await renderRow();
    await fireEvent.press(screen.getByLabelText('Block Sam Rivera'));
    expect(blockUser).not.toHaveBeenCalled();
    expect(screen.getByText(/Block Sam Rivera\?/)).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Yes, block Sam Rivera'));
    await waitFor(() => expect(blockUser).toHaveBeenCalledWith('u-sam'));
    await act(async () => {});
    expect(onNotice).toHaveBeenCalledWith(expect.objectContaining({ tone: 'success' }));
  });

  it('can back out of a block', async () => {
    await renderRow();
    await fireEvent.press(screen.getByLabelText('Block Sam Rivera'));
    await fireEvent.press(screen.getByLabelText('Keep as is'));
    expect(blockUser).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Report Sam Rivera')).toBeTruthy();
  });

  it('surfaces a failed report inline', async () => {
    (reportUser as jest.Mock).mockRejectedValueOnce(new Error('rate limited'));
    await renderRow();
    await openReportForm();
    await fireEvent.press(screen.getByTestId('report-reason-Spam'));
    await fireEvent.press(screen.getByLabelText('Send report'));
    expect(await screen.findByText('Could not send the report.')).toBeTruthy();
    expect(screen.queryByText('rate limited')).toBeNull();
  });
});
