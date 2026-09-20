// Entitlement filtering for the "starting soon" push. The rest of this module's behaviour
// (window, batching, message shape) is covered by src/features/liveClasses/reminders.test.ts.
import { selectEntitledMemberIds } from '../_shared/subscriptionState';
import { buildReminderMessages, tokensForMembers, type PushTokenRow } from './logic';

const NOW = new Date('2026-09-19T12:00:00.000Z');
const MS_PER_DAY = 86_400_000;
const at = (days: number) => new Date(NOW.getTime() + days * MS_PER_DAY).toISOString();

const rows: PushTokenRow[] = [
  { user_id: 'jordan', expo_push_token: 'ExponentPushToken[jordan]' },
  { user_id: 'sam', expo_push_token: 'ExponentPushToken[sam]' },
  { user_id: 'riley', expo_push_token: 'ExponentPushToken[riley]' },
  { user_id: 'nosub', expo_push_token: 'ExponentPushToken[nosub]' },
  { user_id: 'dana', expo_push_token: 'ExponentPushToken[dana]' },
];

describe('tokensForMembers', () => {
  it('keeps only tokens of entitled members', () => {
    expect(tokensForMembers(rows, ['jordan', 'sam', 'dana'])).toEqual([
      'ExponentPushToken[jordan]',
      'ExponentPushToken[sam]',
      'ExponentPushToken[dana]',
    ]);
  });

  it('sends to nobody when nobody is entitled', () => {
    expect(tokensForMembers(rows, [])).toEqual([]);
  });

  it('ignores blank tokens and de-duplicates a device registered twice', () => {
    expect(
      tokensForMembers(
        [
          { user_id: 'jordan', expo_push_token: 'ExponentPushToken[a]' },
          { user_id: 'jordan', expo_push_token: 'ExponentPushToken[a]' },
          { user_id: 'jordan', expo_push_token: '   ' },
          { user_id: 'jordan', expo_push_token: null },
        ],
        ['jordan']
      )
    ).toEqual(['ExponentPushToken[a]']);
  });

  it('never leaks a token belonging to an unentitled member with the same device string', () => {
    expect(tokensForMembers(rows, ['jordan'])).toEqual(['ExponentPushToken[jordan]']);
  });
});

describe('reminder fan-out end to end (selection -> messages)', () => {
  it('skips expired and unsubscribed members but keeps grace and staff', () => {
    const entitled = selectEntitledMemberIds(
      [
        { member_id: 'jordan', role: 'member', subscription: { status: 'active', current_period_end: at(20) } },
        { member_id: 'sam', role: 'member', subscription: { status: 'past_due', current_period_end: at(-3) } },
        { member_id: 'riley', role: 'member', subscription: { status: 'past_due', current_period_end: at(-30) } },
        { member_id: 'nosub', role: 'member', subscription: null },
        { member_id: 'dana', role: 'coach', subscription: null },
      ],
      NOW
    );
    expect(entitled).toEqual(['jordan', 'sam', 'dana']);

    const messages = buildReminderMessages(
      { id: 'class-1', title: 'Saturday Conditioning' },
      tokensForMembers(rows, entitled)
    );
    expect(messages.map((message) => message.to)).toEqual([
      'ExponentPushToken[jordan]',
      'ExponentPushToken[sam]',
      'ExponentPushToken[dana]',
    ]);
    expect(messages[0]).toEqual({
      to: 'ExponentPushToken[jordan]',
      title: 'Starting soon',
      body: 'Saturday Conditioning is about to start. Tap to join.',
      sound: 'default',
      data: { liveClassId: 'class-1' },
    });
  });
});
