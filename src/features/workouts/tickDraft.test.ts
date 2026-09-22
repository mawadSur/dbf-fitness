import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearTickDraft,
  hydrateTicks,
  localDateKey,
  readTickDraft,
  tickDraftKey,
  writeTickDraft,
} from './tickDraft';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const getItem = AsyncStorage.getItem as jest.Mock;
const setItem = AsyncStorage.setItem as jest.Mock;
const removeItem = AsyncStorage.removeItem as jest.Mock;

const MEMBER = '22222222-2222-2222-2222-222222222222';
const DAY = 'day-3';

beforeEach(() => {
  getItem.mockReset().mockResolvedValue(null);
  setItem.mockReset().mockResolvedValue(undefined);
  removeItem.mockReset().mockResolvedValue(undefined);
});

describe('localDateKey', () => {
  it('is the LOCAL calendar date, zero padded', () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(localDateKey(new Date(2026, 8, 21, 0, 1))).toBe('2026-09-21');
    expect(localDateKey(new Date(2026, 11, 31, 12, 0))).toBe('2026-12-31');
  });

  it('rolls over at local midnight, not at UTC midnight', () => {
    const beforeMidnight = new Date(2026, 8, 21, 23, 30);
    const afterMidnight = new Date(2026, 8, 22, 0, 30);
    expect(localDateKey(beforeMidnight)).not.toBe(localDateKey(afterMidnight));
  });
});

describe('tickDraftKey', () => {
  it('separates member, day and date so no two sessions can collide', () => {
    const key = tickDraftKey(MEMBER, DAY, '2026-09-21');
    expect(key).toBe(`dbf.workout.ticks.${MEMBER}.${DAY}.2026-09-21`);
    expect(tickDraftKey('other', DAY, '2026-09-21')).not.toBe(key);
    expect(tickDraftKey(MEMBER, 'day-4', '2026-09-21')).not.toBe(key);
    expect(tickDraftKey(MEMBER, DAY, '2026-09-22')).not.toBe(key);
  });

  it('defaults to today', () => {
    expect(tickDraftKey(MEMBER, DAY)).toBe(tickDraftKey(MEMBER, DAY, localDateKey()));
  });
});

describe('hydrateTicks', () => {
  const visible = ['e1', 'e2', 'e3'];

  it('ticks exactly the saved exercises that are on screen', () => {
    expect([...hydrateTicks(['e1', 'e3'], visible)]).toEqual(['e1', 'e3']);
  });

  it('drops ids the member cannot see, so the count can never exceed the list', () => {
    // An exercise archived by the coach keeps its completion row but no longer
    // renders (migration 20260921100000) — counting it would read "4 of 3".
    const ticks = hydrateTicks(['e1', 'archived-e9', 'unknown'], visible);
    expect([...ticks]).toEqual(['e1']);
    expect(ticks.size).toBeLessThanOrEqual(visible.length);
  });

  it('follows the list order, not the order the rows came back in', () => {
    expect([...hydrateTicks(['e3', 'e1'], visible)]).toEqual(['e1', 'e3']);
  });

  it('is empty for nothing saved, and for nothing visible', () => {
    expect(hydrateTicks([], visible).size).toBe(0);
    expect(hydrateTicks(null, visible).size).toBe(0);
    expect(hydrateTicks(undefined, visible).size).toBe(0);
    expect(hydrateTicks(['e1'], []).size).toBe(0);
  });
});

describe('readTickDraft', () => {
  it('returns the saved ids', async () => {
    getItem.mockResolvedValue(JSON.stringify(['e1', 'e2']));
    await expect(readTickDraft('k')).resolves.toEqual(['e1', 'e2']);
    expect(getItem).toHaveBeenCalledWith('k');
  });

  it('is null when nothing was ever saved', async () => {
    getItem.mockResolvedValue(null);
    await expect(readTickDraft('k')).resolves.toBeNull();
  });

  it('treats a corrupt or foreign value as no draft rather than throwing', async () => {
    for (const stored of ['not json', '{"e1":true}', '42', '""', '']) {
      getItem.mockResolvedValue(stored);
      await expect(readTickDraft('k')).resolves.toBeNull();
    }
  });

  it('keeps only the string entries of a half-valid array', async () => {
    getItem.mockResolvedValue(JSON.stringify(['e1', 7, null, 'e2']));
    await expect(readTickDraft('k')).resolves.toEqual(['e1', 'e2']);
  });

  it('is null when the store itself fails', async () => {
    getItem.mockRejectedValue(new Error('storage unavailable'));
    await expect(readTickDraft('k')).resolves.toBeNull();
  });
});

describe('writeTickDraft', () => {
  it('saves the ticked ids as JSON', async () => {
    await writeTickDraft('k', ['e1', 'e2']);
    expect(setItem).toHaveBeenCalledWith('k', JSON.stringify(['e1', 'e2']));
  });

  it('removes the entry instead of storing an empty list', async () => {
    await writeTickDraft('k', []);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).toHaveBeenCalledWith('k');
  });

  it('swallows a storage failure — the ticks on screen are unaffected', async () => {
    setItem.mockRejectedValue(new Error('disk full'));
    await expect(writeTickDraft('k', ['e1'])).resolves.toBeUndefined();
  });
});

describe('clearTickDraft', () => {
  it('removes the entry', async () => {
    await clearTickDraft('k');
    expect(removeItem).toHaveBeenCalledWith('k');
  });

  it('swallows a storage failure', async () => {
    removeItem.mockRejectedValue(new Error('nope'));
    await expect(clearTickDraft('k')).resolves.toBeUndefined();
  });
});

describe('when the native storage module is not there at all', () => {
  // Web, Expo Go and any build where the native side is not linked: the screen
  // has to work, it just does not remember ticks.
  const loadWithoutStore = () => {
    let module!: typeof import('./tickDraft');
    jest.isolateModules(() => {
      jest.doMock('@react-native-async-storage/async-storage', () => {
        throw new Error('native module not linked');
      });
      /* eslint-disable-next-line @typescript-eslint/no-require-imports -- the point of the test is the require path */
      module = require('./tickDraft');
    });
    return module;
  };

  afterEach(() => jest.dontMock('@react-native-async-storage/async-storage'));

  it('reads nothing, writes nothing and never throws', async () => {
    const { readTickDraft: read, writeTickDraft: write, clearTickDraft: clear } = loadWithoutStore();
    await expect(read('k')).resolves.toBeNull();
    await expect(write('k', ['e1'])).resolves.toBeUndefined();
    await expect(clear('k')).resolves.toBeUndefined();
  });
});
