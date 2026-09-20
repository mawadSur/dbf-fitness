import {
  buildReminderMessages,
  chunk,
  EXPO_BATCH_SIZE,
  isDueForReminder,
  rejectInvocation,
  reminderWindow,
  selectClassesDueForReminder,
  uniqueTokens,
  type LiveClassRow,
} from '../../../supabase/functions/live-class-reminder/logic';

const NOW = new Date('2026-09-19T12:00:00.000Z');
const at = (minutes: number, extraMs = 0) => new Date(NOW.getTime() + minutes * 60_000 + extraMs).toISOString();

function liveClass(overrides: Partial<LiveClassRow> = {}): LiveClassRow {
  return {
    id: 'class-1',
    coach_id: 'coach-1',
    title: 'Saturday Conditioning',
    starts_at: at(10),
    status: 'scheduled',
    reminder_sent_at: null,
    ...overrides,
  };
}

describe('reminderWindow', () => {
  it('spans now to now + 15 minutes as ISO strings', () => {
    expect(reminderWindow(NOW)).toEqual({ from: NOW.toISOString(), to: at(15) });
  });
});

describe('isDueForReminder', () => {
  it('is due for a scheduled, unreminded class starting inside the window', () => {
    expect(isDueForReminder(liveClass(), NOW)).toBe(true);
  });

  it('includes both window edges: exactly now and exactly 15 minutes away', () => {
    expect(isDueForReminder(liveClass({ starts_at: at(0) }), NOW)).toBe(true);
    expect(isDueForReminder(liveClass({ starts_at: at(15) }), NOW)).toBe(true);
  });

  it('excludes a class one millisecond past the window or already started', () => {
    expect(isDueForReminder(liveClass({ starts_at: at(15, 1) }), NOW)).toBe(false);
    expect(isDueForReminder(liveClass({ starts_at: at(0, -1) }), NOW)).toBe(false);
    expect(isDueForReminder(liveClass({ starts_at: at(-30) }), NOW)).toBe(false);
  });

  it('excludes a class days away', () => {
    expect(isDueForReminder(liveClass({ starts_at: at(2 * 24 * 60) }), NOW)).toBe(false);
  });

  it('excludes a class that was already reminded (idempotency marker set)', () => {
    expect(isDueForReminder(liveClass({ reminder_sent_at: at(-1) }), NOW)).toBe(false);
  });

  it.each(['live', 'ended', 'cancelled'])('excludes a %s class', (status) => {
    expect(isDueForReminder(liveClass({ status }), NOW)).toBe(false);
  });
});

describe('selectClassesDueForReminder', () => {
  it('keeps only the due classes, in their original order', () => {
    const due1 = liveClass({ id: 'due-1', starts_at: at(5) });
    const due2 = liveClass({ id: 'due-2', starts_at: at(15) });
    const classes = [
      due1,
      liveClass({ id: 'far', starts_at: at(60) }),
      liveClass({ id: 'sent', reminder_sent_at: at(-2) }),
      liveClass({ id: 'cancelled', status: 'cancelled' }),
      due2,
    ];

    expect(selectClassesDueForReminder(classes, NOW).map((c) => c.id)).toEqual(['due-1', 'due-2']);
  });

  it('returns an empty list when nothing is due', () => {
    expect(selectClassesDueForReminder([], NOW)).toEqual([]);
  });
});

describe('chunk', () => {
  it('splits into batches of at most the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('respects the Expo limit of 100 per request', () => {
    const batches = chunk(Array.from({ length: 250 }, (_, i) => i), EXPO_BATCH_SIZE);
    expect(batches.map((b) => b.length)).toEqual([100, 100, 50]);
  });

  it('keeps an exact multiple in whole batches and returns nothing for no items', () => {
    expect(chunk(Array.from({ length: 100 }, (_, i) => i), EXPO_BATCH_SIZE)).toHaveLength(1);
    expect(chunk([], 100)).toEqual([]);
  });

  it('treats a non-positive size as 1 rather than looping forever', () => {
    expect(chunk([1, 2], 0)).toEqual([[1], [2]]);
  });
});

describe('uniqueTokens / buildReminderMessages', () => {
  it('drops blanks and duplicates, keeping first-seen order', () => {
    expect(uniqueTokens(['a', ' b ', 'a', '', '   ', null, undefined, 'b'])).toEqual(['a', 'b']);
  });

  it('builds one "Starting soon" message per unique token, carrying the class title', () => {
    const messages = buildReminderMessages(liveClass(), ['t1', 't2', 't1']);

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ to: 't1', title: 'Starting soon', sound: 'default' });
    expect(messages[0].body).toContain('Saturday Conditioning');
    expect(messages[0].data).toEqual({ liveClassId: 'class-1' });
  });

  it('builds nothing when there are no tokens', () => {
    expect(buildReminderMessages(liveClass(), [])).toEqual([]);
  });
});

describe('rejectInvocation', () => {
  const KEY = 'service-role-key';
  const BEARER = `Bearer ${KEY}`;

  it('lets an authorised POST from the scheduler through', () => {
    expect(rejectInvocation('POST', BEARER, KEY)).toBeNull();
  });

  // A stray GET (crawler, link preview, someone pasting the URL) must not fan out real pushes
  // and stamp reminder_sent_at, which would suppress the genuine reminder.
  it.each(['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS'])('rejects %s with 405', (method) => {
    expect(rejectInvocation(method, BEARER, KEY)).toEqual({ status: 405, error: 'method not allowed' });
  });

  it.each([
    ['no header', null],
    ['empty header', ''],
    ['wrong scheme', KEY],
    ['wrong key', 'Bearer not-the-key'],
    ['anon key', 'Bearer anon-key'],
    ['case-mangled scheme', `bearer ${KEY}`],
    ['trailing whitespace', `${BEARER} `],
  ])('rejects a POST with %s as 401', (_label, header) => {
    expect(rejectInvocation('POST', header, KEY)).toEqual({ status: 401, error: 'unauthorized' });
  });

  it('fails closed with 500 when the service role key is not configured', () => {
    expect(rejectInvocation('POST', BEARER, undefined)).toEqual({ status: 500, error: 'server misconfigured' });
    expect(rejectInvocation('POST', 'Bearer ', '')).toEqual({ status: 500, error: 'server misconfigured' });
  });

  it('never echoes the credential back to the caller', () => {
    for (const rejection of [
      rejectInvocation('GET', BEARER, KEY),
      rejectInvocation('POST', 'Bearer wrong', KEY),
      rejectInvocation('POST', BEARER, undefined),
    ]) {
      expect(JSON.stringify(rejection)).not.toContain(KEY);
    }
  });
});
