import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { REPORT_REASONS } from '../community/reportReasons';
import { ParticipantModeration } from './ParticipantModeration';

jest.mock('../community/api', () => ({
  blockUser: jest.fn(),
  reportUser: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('../community/api') as {
  blockUser: jest.Mock;
  reportUser: jest.Mock;
};

const PARTICIPANTS = [
  { userId: 'me', fullName: 'Jordan Lee' },
  { userId: 'other', fullName: 'Sam Reed' },
];

async function renderIt(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return await render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  api.blockUser.mockResolvedValue(undefined);
  api.reportUser.mockResolvedValue(undefined);
});

describe('ParticipantModeration (live class)', () => {
  it('offers report and block for everyone else in the class', async () => {
    await renderIt(<ParticipantModeration participants={PARTICIPANTS} currentUserId="me" />);

    await fireEvent.press(screen.getByTestId('live-moderation-open'));

    expect(screen.getByLabelText('Report Sam Reed')).toBeTruthy();
    expect(screen.getByLabelText('Block Sam Reed')).toBeTruthy();
    // Never against yourself.
    expect(screen.queryByLabelText('Report Jordan Lee')).toBeNull();
  });

  it('renders nothing when the viewer is alone', async () => {
    await renderIt(
      <ParticipantModeration participants={[PARTICIPANTS[0]]} currentUserId="me" />
    );
    expect(screen.queryByTestId('live-moderation')).toBeNull();
  });

  it('blocks with an inline confirm (no Alert) and confirms in words', async () => {
    await renderIt(<ParticipantModeration participants={PARTICIPANTS} currentUserId="me" />);

    await fireEvent.press(screen.getByTestId('live-moderation-open'));
    await fireEvent.press(screen.getByLabelText('Block Sam Reed'));
    expect(screen.getByText(/Block Sam Reed\?/)).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Yes, block Sam Reed'));

    await waitFor(() => expect(api.blockUser).toHaveBeenCalledWith('other'));
    expect(await screen.findByTestId('live-moderation-blocked')).toBeTruthy();
  });

  it('keeps the person when the confirm is declined', async () => {
    await renderIt(<ParticipantModeration participants={PARTICIPANTS} currentUserId="me" />);

    await fireEvent.press(screen.getByTestId('live-moderation-open'));
    await fireEvent.press(screen.getByLabelText('Block Sam Reed'));
    await fireEvent.press(screen.getByLabelText('Keep as is'));

    expect(api.blockUser).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Block Sam Reed')).toBeTruthy();
  });

  it('names the person in the fallback copy when the block fails for an unclassified reason', async () => {
    api.blockUser.mockRejectedValue(new Error('unexpected condition'));
    await renderIt(<ParticipantModeration participants={PARTICIPANTS} currentUserId="me" />);

    await fireEvent.press(screen.getByTestId('live-moderation-open'));
    await fireEvent.press(screen.getByLabelText('Block Sam Reed'));
    await fireEvent.press(screen.getByLabelText('Yes, block Sam Reed'));

    // A generic error falls through `friendlyErrorMessage` to our screen-specific sentence.
    expect(await screen.findByText(/Could not block Sam Reed/)).toBeTruthy();
    // Raw error text is never rendered to the member.
    expect(screen.queryByText(/unexpected condition/)).toBeNull();
  });

  it('reads a dropped connection as a network problem rather than a blame message', async () => {
    api.blockUser.mockRejectedValue(new Error('network request failed'));
    await renderIt(<ParticipantModeration participants={PARTICIPANTS} currentUserId="me" />);

    await fireEvent.press(screen.getByTestId('live-moderation-open'));
    await fireEvent.press(screen.getByLabelText('Block Sam Reed'));
    await fireEvent.press(screen.getByLabelText('Yes, block Sam Reed'));

    expect(await screen.findByText(/Can't reach the server/)).toBeTruthy();
  });

  it('reports through the same pipeline as the community roster', async () => {
    await renderIt(<ParticipantModeration participants={PARTICIPANTS} currentUserId="me" />);

    await fireEvent.press(screen.getByTestId('live-moderation-open'));
    await fireEvent.press(screen.getByLabelText('Report Sam Reed'));

    // The roster's own ReportPanel, so the reason chips are the shared ones and the
    // report goes through one pipeline rather than a live-class copy of it.
    expect(screen.getByText('Why are you reporting Sam Reed?')).toBeTruthy();
    for (const reason of REPORT_REASONS) {
      expect(screen.getByTestId(`report-reason-${reason}`)).toBeTruthy();
    }
    expect(screen.getByLabelText('Send report')).toBeTruthy();
  });
});
