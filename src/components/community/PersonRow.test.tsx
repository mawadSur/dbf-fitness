import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Keyboard } from 'react-native';

import { blockUser, reportUser } from '../../features/community/api';
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

async function openReportForm() {
  await fireEvent.press(screen.getByLabelText('Sam Rivera, online. Show actions'));
  await fireEvent.press(screen.getByLabelText('Report'));
}

beforeEach(() => jest.clearAllMocks());

describe('PersonRow', () => {
  it('announces name, presence and expanded state, and truncates a long name', async () => {
    await renderRow();
    const row = screen.getByLabelText('Sam Rivera, online. Show actions');
    expect(row.props.accessibilityState).toMatchObject({ expanded: false });
    expect(row.props.className).toContain('min-h-[56px]');
    expect(screen.getByText('Sam Rivera').props.numberOfLines).toBe(1);
    expect(screen.getByText('Sam Rivera').props.className).toContain('flex-1');

    await fireEvent.press(row);
    expect(screen.getByLabelText('Sam Rivera, online. Show actions').props.accessibilityState).toMatchObject({
      expanded: true,
    });
  });

  it('report details input: keyboard-friendly props, scrolls itself into view on focus', async () => {
    const { scrollIntoView } = await renderRow();
    await openReportForm();
    const input = screen.getByLabelText('Report details');
    expect(input.props.returnKeyType).toBe('done');
    expect(input.props.multiline).toBe(true);
    expect(input.props.maxLength).toBeGreaterThan(0);

    await fireEvent(input, 'focus');
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.calls[0][0]).toHaveProperty('current');
  });

  it('dismisses the keyboard on submit-editing and when sending the report', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    await renderRow();
    await openReportForm();
    await fireEvent(screen.getByLabelText('Report details'), 'submitEditing');
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
    expect((await screen.findByRole('alert')).props.children).toBeTruthy();

    const reasons = screen.getAllByRole('button', { selected: false });
    const preset = reasons.find((node) => node.props.accessibilityState?.selected === false && node.props.className?.includes('rounded-full'));
    await fireEvent.press(preset!);
    await fireEvent.changeText(screen.getByLabelText('Report details'), 'Rude in chat');
    await fireEvent.press(screen.getByLabelText('Send report'));

    await waitFor(() => expect(reportUser).toHaveBeenCalledTimes(1));
    expect((reportUser as jest.Mock).mock.calls[0][0]).toBe('u-sam');
    expect((reportUser as jest.Mock).mock.calls[0][1]).toContain('Rude in chat');
    expect(await screen.findByText('Report sent. Thanks for keeping the group safe.')).toBeTruthy();
  });

  it('reason chips and action buttons are at least 44pt tall', async () => {
    await renderRow();
    await openReportForm();
    expect(screen.getByLabelText('Send report').props.className).toContain('min-h-[44px]');
    expect(screen.getByLabelText('Cancel').props.className).toContain('min-h-[44px]');
    const chip = screen
      .getAllByRole('button')
      .find((node) => node.props.className?.includes('rounded-full'));
    expect(chip?.props.className).toContain('min-h-[44px]');
  });

  it('blocks only after an inline confirmation (no Alert)', async () => {
    const { onNotice } = await renderRow();
    await fireEvent.press(screen.getByLabelText('Sam Rivera, online. Show actions'));
    await fireEvent.press(screen.getByLabelText('Block'));
    expect(blockUser).not.toHaveBeenCalled();
    expect(screen.getByText(/Block Sam Rivera\?/)).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Block'));
    await waitFor(() => expect(blockUser).toHaveBeenCalledWith('u-sam'));
    await act(async () => {});
    expect(onNotice).toHaveBeenCalledWith(expect.objectContaining({ tone: 'success' }));
  });

  it('surfaces a failed report inline', async () => {
    (reportUser as jest.Mock).mockRejectedValueOnce(new Error('rate limited'));
    await renderRow();
    await openReportForm();
    const chip = screen.getAllByRole('button').find((node) => node.props.className?.includes('rounded-full'));
    await fireEvent.press(chip!);
    await fireEvent.press(screen.getByLabelText('Send report'));
    expect(await screen.findByText('rate limited')).toBeTruthy();
  });
});
