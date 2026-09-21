import { mergeRosterWithPresence, onlineIdsFromPresenceState } from './roster';

const jordan = { member_id: 'u-jordan', full_name: 'Jordan Lee' };
const sam = { member_id: 'u-sam', full_name: 'Sam Rivera' };
const alex = { member_id: 'u-alex', full_name: 'alex Kim' };

describe('mergeRosterWithPresence', () => {
  it('sorts online people first, then by name within each presence group', () => {
    const result = mergeRosterWithPresence([sam, jordan, alex], new Set(['u-sam', 'u-jordan']));

    expect(result.map((entry) => entry.fullName)).toEqual(['Jordan Lee', 'Sam Rivera', 'alex Kim']);
    expect(result.map((entry) => entry.online)).toEqual([true, true, false]);
  });

  it('sorts names case-insensitively among offline people', () => {
    const result = mergeRosterWithPresence([sam, alex, jordan], new Set());

    expect(result.map((entry) => entry.fullName)).toEqual(['alex Kim', 'Jordan Lee', 'Sam Rivera']);
  });

  it('puts an online person ahead of an alphabetically earlier offline person', () => {
    const result = mergeRosterWithPresence([alex, sam], new Set(['u-sam']));

    expect(result.map((entry) => entry.memberId)).toEqual(['u-sam', 'u-alex']);
  });

  it('returns an empty list for an empty roster, whatever the presence set holds', () => {
    expect(mergeRosterWithPresence([], new Set())).toEqual([]);
    expect(mergeRosterWithPresence([], new Set(['u-sam']))).toEqual([]);
  });

  it('treats everyone as offline when nobody is present', () => {
    const result = mergeRosterWithPresence([jordan, sam], new Set());

    expect(result.every((entry) => !entry.online)).toBe(true);
  });

  it('ignores presence ids that are not on the roster', () => {
    const result = mergeRosterWithPresence([jordan], new Set(['u-blocked-person', 'u-viewer']));

    expect(result).toEqual([{ memberId: 'u-jordan', fullName: 'Jordan Lee', online: false }]);
  });

  it('breaks name ties by member id so the order is stable', () => {
    const twinA = { member_id: 'a', full_name: 'Pat Doe' };
    const twinB = { member_id: 'b', full_name: 'Pat Doe' };

    expect(mergeRosterWithPresence([twinB, twinA], new Set()).map((entry) => entry.memberId)).toEqual(['a', 'b']);
  });

  it('does not mutate the roster it was given', () => {
    const roster = [sam, jordan];
    mergeRosterWithPresence(roster, new Set());

    expect(roster).toEqual([sam, jordan]);
  });
});

describe('onlineIdsFromPresenceState', () => {
  it('collects user ids across presence keys and devices', () => {
    const ids = onlineIdsFromPresenceState({
      'u-sam': [{ user_id: 'u-sam' }, { user_id: 'u-sam' }],
      'u-jordan': [{ user_id: 'u-jordan' }],
    });

    expect([...ids].sort()).toEqual(['u-jordan', 'u-sam']);
  });

  it('returns an empty set for an empty state', () => {
    expect(onlineIdsFromPresenceState({}).size).toBe(0);
  });

  it('skips metas without a usable user_id and undefined meta lists', () => {
    const ids = onlineIdsFromPresenceState({
      a: [{}, { user_id: 42 }, { user_id: '' }, { user_id: null }],
      b: undefined,
      c: [{ user_id: 'u-ok' }],
    });

    expect([...ids]).toEqual(['u-ok']);
  });
});
