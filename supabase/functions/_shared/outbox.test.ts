import {
  chunk,
  classifyTicket,
  collectReceipts,
  constantTimeEquals,
  isRetryableHttpStatus,
  planDelivery,
  reduceOutcomes,
  rejectInvocation,
  runDrain,
  tokensByUser,
  type DrainDeps,
  type ExpoTicket,
  type OutboxRow,
} from './outbox';

const KEY = 'service-role-key';

const row = (over: Partial<OutboxRow> = {}): OutboxRow => ({
  id: 'row-1',
  user_id: 'user-1',
  kind: 'nudge',
  dedupe_key: 'nudge:1:user-1',
  title: 'Nice work',
  body: 'Keep it going.',
  payload: { route: '/(tabs)' },
  attempts: 1,
  ...over,
});

describe('rejectInvocation', () => {
  it('allows a POST with the exact service-role bearer', () => {
    expect(rejectInvocation('POST', `Bearer ${KEY}`, KEY)).toBeNull();
  });

  it('refuses non-POST before looking at credentials', () => {
    expect(rejectInvocation('GET', `Bearer ${KEY}`, KEY)).toEqual({ status: 405, error: 'method not allowed' });
  });

  it('fails closed when the key is not configured', () => {
    expect(rejectInvocation('POST', `Bearer ${KEY}`, undefined)).toEqual({
      status: 500,
      error: 'server misconfigured',
    });
  });

  it.each([
    ['a wrong key', 'Bearer nope'],
    ['a missing header', null],
    ['the raw key without the scheme', KEY],
    ['a prefix of the key', `Bearer ${KEY.slice(0, -1)}`],
  ])('rejects %s with 401', (_label, header) => {
    expect(rejectInvocation('POST', header, KEY)).toEqual({ status: 401, error: 'unauthorized' });
  });
});

describe('constantTimeEquals', () => {
  it('matches only identical strings', () => {
    expect(constantTimeEquals('abc', 'abc')).toBe(true);
    expect(constantTimeEquals('abc', 'abd')).toBe(false);
    expect(constantTimeEquals('abc', 'ab')).toBe(false);
    expect(constantTimeEquals('', '')).toBe(true);
  });
});

describe('tokensByUser / planDelivery', () => {
  it('drops blanks and duplicates, keeping one entry per device', () => {
    const byUser = tokensByUser([
      { user_id: 'u1', expo_push_token: 'ExponentPushToken[a]' },
      { user_id: 'u1', expo_push_token: ' ExponentPushToken[a] ' },
      { user_id: 'u1', expo_push_token: '' },
      { user_id: 'u1', expo_push_token: null },
      { user_id: 'u2', expo_push_token: 'ExponentPushToken[b]' },
    ]);
    expect(byUser.get('u1')).toEqual(['ExponentPushToken[a]']);
    expect(byUser.get('u2')).toEqual(['ExponentPushToken[b]']);
  });

  it('fans one row out to every device and carries the payload into data', () => {
    const tokens = new Map([['user-1', ['tok-a', 'tok-b']]]);
    const { messages, undeliverable } = planDelivery([row()], tokens);
    expect(undeliverable).toEqual([]);
    expect(messages.map((m) => m.token)).toEqual(['tok-a', 'tok-b']);
    expect(messages[0].message.data).toEqual({ route: '/(tabs)', outboxId: 'row-1', kind: 'nudge' });
  });

  it('reports a row whose user has no device as undeliverable', () => {
    const { messages, undeliverable } = planDelivery([row()], new Map());
    expect(messages).toEqual([]);
    expect(undeliverable.map((r) => r.id)).toEqual(['row-1']);
  });
});

describe('classifyTicket', () => {
  it('treats an ok ticket as sent and keeps the ticket id', () => {
    expect(classifyTicket({ status: 'ok', id: 't1' }, 'tok')).toEqual({
      kind: 'sent',
      ticketId: 't1',
      token: 'tok',
    });
  });

  it('dead-letters DeviceNotRegistered and marks the token for pruning', () => {
    expect(
      classifyTicket({ status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } }, 'tok')
    ).toEqual({ kind: 'dead', error: 'gone', pruneToken: 'tok' });
  });

  it('dead-letters our own bugs without pruning the device', () => {
    const outcome = classifyTicket(
      { status: 'error', message: 'too big', details: { error: 'MessageTooBig' } },
      'tok'
    );
    expect(outcome).toEqual({ kind: 'dead', error: 'too big', pruneToken: null });
  });

  it('retries a rate-limit and a missing ticket', () => {
    expect(
      classifyTicket({ status: 'error', message: 'slow down', details: { error: 'MessageRateExceeded' } }, 'tok').kind
    ).toBe('retry');
    expect(classifyTicket(undefined, 'tok').kind).toBe('retry');
  });
});

describe('reduceOutcomes / isRetryableHttpStatus / chunk', () => {
  it('lets one retryable device outvote a delivered one', () => {
    expect(
      reduceOutcomes([
        { kind: 'sent', ticketId: 't1', token: 'tok' },
        { kind: 'retry', error: 'slow down' },
      ]).kind
    ).toBe('retry');
  });

  it('prefers sent over dead when at least one device took it', () => {
    expect(
      reduceOutcomes([
        { kind: 'dead', error: 'gone', pruneToken: 'tok' },
        { kind: 'sent', ticketId: 't1', token: 'tok2' },
      ]).kind
    ).toBe('sent');
  });

  it('classifies HTTP statuses', () => {
    expect([429, 500, 503].map(isRetryableHttpStatus)).toEqual([true, true, true]);
    expect([400, 401, 404, 200].map(isRetryableHttpStatus)).toEqual([false, false, false, false]);
  });

  it('chunks', () => {
    expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
    expect(chunk([1, 2, 3], 0)).toEqual([[1], [2], [3]]);
  });
});

// --- runDrain --------------------------------------------------------------

type Calls = {
  complete: [string, unknown][];
  fail: [string, string, boolean][];
  prune: string[][];
  pushed: number[];
};

function makeDeps(
  rows: OutboxRow[],
  tokens: { user_id: string; expo_push_token: string | null }[],
  push: DrainDeps['push']
): { deps: DrainDeps; calls: Calls } {
  const calls: Calls = { complete: [], fail: [], prune: [], pushed: [] };
  const deps: DrainDeps = {
    claim: async () => rows,
    tokensFor: async () => tokens,
    push: async (messages) => {
      calls.pushed.push(messages.length);
      return push(messages);
    },
    complete: async (id, ticket) => void calls.complete.push([id, ticket]),
    fail: async (id, error, retry) => void calls.fail.push([id, error, retry]),
    prune: async (t) => void calls.prune.push([...t]),
  };
  return { deps, calls };
}

const okTickets = (n: number): { data: ExpoTicket[] } => ({
  data: Array.from({ length: n }, (_, i) => ({ status: 'ok', id: `t${i}` })),
});

describe('runDrain', () => {
  it('does nothing when nothing is claimed', async () => {
    const { deps, calls } = makeDeps([], [], async () => okTickets(0));
    await expect(runDrain(deps)).resolves.toEqual({
      claimed: 0,
      sent: 0,
      retried: 0,
      dead: 0,
      prunedTokens: 0,
    });
    expect(calls.pushed).toEqual([]);
  });

  it('delivers a claimed row and completes it with the ticket', async () => {
    const { deps, calls } = makeDeps(
      [row()],
      [{ user_id: 'user-1', expo_push_token: 'tok-a' }],
      async () => okTickets(1)
    );
    await expect(runDrain(deps)).resolves.toMatchObject({ claimed: 1, sent: 1, dead: 0, retried: 0 });
    // The token travels with the ticket: the receipt pass needs to know WHICH device a
    // DeviceNotRegistered receipt refers to in order to prune it.
    expect(calls.complete).toEqual([['row-1', { id: 't0', token: 'tok-a' }]]);
    expect(calls.fail).toEqual([]);
  });

  it('completes a row once even when it went to two devices', async () => {
    const { deps, calls } = makeDeps(
      [row()],
      [
        { user_id: 'user-1', expo_push_token: 'tok-a' },
        { user_id: 'user-1', expo_push_token: 'tok-b' },
      ],
      async () => okTickets(2)
    );
    await expect(runDrain(deps)).resolves.toMatchObject({ sent: 1 });
    expect(calls.complete).toHaveLength(1);
  });

  it('dead-letters a row whose user has no device, without calling Expo', async () => {
    const { deps, calls } = makeDeps([row()], [], async () => okTickets(0));
    await expect(runDrain(deps)).resolves.toMatchObject({ claimed: 1, dead: 1, sent: 0 });
    expect(calls.pushed).toEqual([]);
    expect(calls.fail).toEqual([['row-1', 'no registered device for this user', false]]);
  });

  it('prunes a DeviceNotRegistered token and dead-letters that row', async () => {
    const { deps, calls } = makeDeps([row()], [{ user_id: 'user-1', expo_push_token: 'tok-a' }], async () => ({
      data: [{ status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } }],
    }));
    await expect(runDrain(deps)).resolves.toMatchObject({ dead: 1, prunedTokens: 1 });
    expect(calls.prune).toEqual([['tok-a']]);
    expect(calls.fail).toEqual([['row-1', 'gone', false]]);
  });

  it('retries the whole batch on a 429 and does not prune anything', async () => {
    const { deps, calls } = makeDeps([row()], [{ user_id: 'user-1', expo_push_token: 'tok-a' }], async () => {
      throw Object.assign(new Error('rate limited'), { status: 429 });
    });
    await expect(runDrain(deps)).resolves.toMatchObject({ retried: 1, dead: 0 });
    expect(calls.fail[0][2]).toBe(true);
    expect(calls.prune).toEqual([]);
  });

  it('dead-letters the batch on a non-retryable HTTP status', async () => {
    const { deps, calls } = makeDeps([row()], [{ user_id: 'user-1', expo_push_token: 'tok-a' }], async () => {
      throw Object.assign(new Error('bad request'), { status: 400 });
    });
    await expect(runDrain(deps)).resolves.toMatchObject({ dead: 1, retried: 0 });
    expect(calls.fail[0][2]).toBe(false);
  });

  it('retries when Expo returns a body that is not a ticket array', async () => {
    const { deps, calls } = makeDeps(
      [row()],
      [{ user_id: 'user-1', expo_push_token: 'tok-a' }],
      async () => ({}) as { data?: ExpoTicket[] }
    );
    await expect(runDrain(deps)).resolves.toMatchObject({ retried: 1 });
    expect(calls.fail[0][2]).toBe(true);
  });

  it('splits more than 100 messages into separate Expo batches', async () => {
    const rows = Array.from({ length: 120 }, (_, i) => row({ id: `row-${i}`, user_id: `u${i}` }));
    const tokens = rows.map((r) => ({ user_id: r.user_id, expo_push_token: `tok-${r.user_id}` }));
    const { deps, calls } = makeDeps(rows, tokens, async (messages) => okTickets(messages.length));
    await expect(runDrain(deps)).resolves.toMatchObject({ claimed: 120, sent: 120 });
    expect(calls.pushed).toEqual([100, 20]);
  });

  it('never passes device tokens to the logger', async () => {
    const logged: string[] = [];
    const { deps } = makeDeps([row()], [{ user_id: 'user-1', expo_push_token: 'tok-secret' }], async () => {
      throw Object.assign(new Error('boom'), { status: 500 });
    });
    await runDrain({ ...deps, log: (m) => logged.push(m) });
    expect(logged.join('\n')).not.toContain('tok-secret');
    expect(logged.join('\n')).toContain('status 500');
  });
});

describe('collectReceipts', () => {
  it('prunes the token behind a DeviceNotRegistered receipt', async () => {
    const pruned: string[][] = [];
    const result = await collectReceipts(
      {
        fetchReceipts: async () => ({
          t1: { status: 'error', details: { error: 'DeviceNotRegistered' } },
          t2: { status: 'ok' },
        }),
        prune: async (tokens) => void pruned.push([...tokens]),
      },
      [
        { ticketId: 't1', token: 'tok-dead' },
        { ticketId: 't2', token: 'tok-live' },
      ]
    );
    expect(result).toEqual({ checked: 2, prunedTokens: 1 });
    expect(pruned).toEqual([['tok-dead']]);
  });

  it('is a no-op with no tickets and survives a failed lookup', async () => {
    const prune = jest.fn(async () => {});
    await expect(collectReceipts({ fetchReceipts: async () => ({}), prune }, [])).resolves.toEqual({
      checked: 0,
      prunedTokens: 0,
    });
    await expect(
      collectReceipts(
        {
          fetchReceipts: async () => {
            throw new Error('network down');
          },
          prune,
        },
        [{ ticketId: 't1', token: 'tok' }]
      )
    ).resolves.toEqual({ checked: 0, prunedTokens: 0 });
    expect(prune).not.toHaveBeenCalled();
  });
});
