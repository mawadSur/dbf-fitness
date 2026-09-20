import { participantsFromPresenceState } from './presence';

describe('participantsFromPresenceState', () => {
  it('lists each person once, sorted by name', () => {
    const result = participantsFromPresenceState({
      sam: [{ user_id: 'u-sam', full_name: 'Sam Rivera' }],
      jordan: [{ user_id: 'u-jordan', full_name: 'Jordan Lee' }],
    });

    expect(result).toEqual([
      { userId: 'u-jordan', fullName: 'Jordan Lee' },
      { userId: 'u-sam', fullName: 'Sam Rivera' },
    ]);
  });

  it('collapses one person connected from several devices', () => {
    const result = participantsFromPresenceState({
      jordan: [
        { user_id: 'u-jordan', full_name: 'Jordan Lee' },
        { user_id: 'u-jordan', full_name: 'Jordan Lee' },
      ],
    });

    expect(result).toHaveLength(1);
  });

  it('keeps a real name over a blank one from another device', () => {
    const result = participantsFromPresenceState({
      a: [{ user_id: 'u-jordan', full_name: '' }],
      b: [{ user_id: 'u-jordan', full_name: 'Jordan Lee' }],
    });

    expect(result).toEqual([{ userId: 'u-jordan', fullName: 'Jordan Lee' }]);
  });

  it('shows "Member" when no name was tracked', () => {
    expect(participantsFromPresenceState({ a: [{ user_id: 'u-x' }] })).toEqual([
      { userId: 'u-x', fullName: 'Member' },
    ]);
  });

  it('ignores metas without a usable user_id and tolerates an empty state', () => {
    expect(
      participantsFromPresenceState({
        a: [{ full_name: 'No Id' }, { user_id: 42 }, { user_id: '' }],
        b: undefined,
      })
    ).toEqual([]);
    expect(participantsFromPresenceState({})).toEqual([]);
  });
});
