import {
  firstName,
  greeting,
  isStaffRole,
  memberHomePrimary,
  staffLinks,
  type HomePrimaryInput,
} from './homeState';
import type { PlanDay } from './planSummary';

const day: PlanDay = { id: 'd3', dayNumber: 3, blockName: 'Lower body', durationMinutes: 40 };

const input = (over: Partial<HomePrimaryInput> = {}): HomePrimaryInput => ({
  role: 'member',
  hasCoach: true,
  plan: { kind: 'next-day', day, completedCount: 2, totalDays: 30 },
  ...over,
});

describe('isStaffRole', () => {
  it('counts coaches and admins, nobody else', () => {
    expect(isStaffRole('coach')).toBe(true);
    expect(isStaffRole('admin')).toBe(true);
    expect(isStaffRole('member')).toBe(false);
    expect(isStaffRole(null)).toBe(false);
    expect(isStaffRole(undefined)).toBe(false);
  });
});

describe('memberHomePrimary', () => {
  it('waits while the role is unknown', () => {
    expect(memberHomePrimary(input({ role: null }))).toEqual({ kind: 'loading' });
    expect(memberHomePrimary(input({ role: undefined }))).toEqual({ kind: 'loading' });
  });

  it('never decides for staff — the caller branches before this', () => {
    expect(memberHomePrimary(input({ role: 'coach' }))).toEqual({ kind: 'loading' });
    expect(memberHomePrimary(input({ role: 'admin' }))).toEqual({ kind: 'loading' });
  });

  it('waits rather than flashing the coach nudge while the lookup is open', () => {
    expect(memberHomePrimary(input({ hasCoach: undefined }))).toEqual({ kind: 'loading' });
  });

  it('asks a coachless member to choose a coach', () => {
    expect(memberHomePrimary(input({ hasCoach: false }))).toEqual({ kind: 'needs-coach' });
  });

  it('waits for the plan answer before claiming anything about it', () => {
    expect(memberHomePrimary(input({ plan: undefined }))).toEqual({ kind: 'loading' });
  });

  it('says the coach is preparing the plan instead of congratulating an empty plan', () => {
    expect(memberHomePrimary(input({ plan: { kind: 'no-plan' } }))).toEqual({
      kind: 'awaiting-plan',
    });
  });

  it('celebrates a finished plan', () => {
    expect(memberHomePrimary(input({ plan: { kind: 'complete', totalDays: 30 } }))).toEqual({
      kind: 'plan-complete',
      totalDays: 30,
    });
  });

  it('leads with the next day in the normal case', () => {
    expect(memberHomePrimary(input())).toEqual({
      kind: 'next-day',
      day,
      completedCount: 2,
      totalDays: 30,
    });
  });

  it('a coachless member is asked for a coach even when a plan somehow exists', () => {
    expect(memberHomePrimary(input({ hasCoach: false }))).toEqual({ kind: 'needs-coach' });
  });
});

describe('firstName', () => {
  it('takes the first word', () => {
    expect(firstName('Jordan Lee Smith')).toBe('Jordan');
  });

  it('is null for nothing usable', () => {
    expect(firstName(null)).toBeNull();
    expect(firstName(undefined)).toBeNull();
    expect(firstName('   ')).toBeNull();
  });

  // The seeded coach is stored as "Coach Dana Reyes".
  it('skips a title the coach typed into their own name', () => {
    expect(firstName('Coach Dana Reyes')).toBe('Dana');
    expect(firstName('Dr. Sam Okafor')).toBe('Sam');
    expect(firstName('Coach')).toBeNull();
  });
});

describe('greeting', () => {
  it('greets a member by first name', () => {
    expect(greeting('Jordan Lee', 'member')).toBe('Hi, Jordan');
    expect(greeting(null, 'member')).toBe('Hi there');
  });

  it('greets staff as a coach', () => {
    expect(greeting('Dana Cruz', 'coach')).toBe('Welcome back, Coach Dana');
    expect(greeting('Ada Admin', 'admin')).toBe('Welcome back, Coach Ada');
    expect(greeting('  ', 'coach')).toBe('Welcome back, Coach');
    // Never "Welcome back, Coach Coach".
    expect(greeting('Coach Dana Reyes', 'coach')).toBe('Welcome back, Coach Dana');
  });
});

describe('staffLinks', () => {
  it('gives a coach live classes, recordings and effort review', () => {
    expect(staffLinks('coach').map((l) => l.href)).toEqual([
      '/community/live',
      '/notes',
      '/effort-review',
    ]);
  });

  it('withholds effort review from an admin, who does not score members', () => {
    expect(staffLinks('admin').map((l) => l.href)).toEqual(['/community/live', '/notes']);
  });

  it('gives every row an icon and a label', () => {
    for (const link of staffLinks('coach')) {
      expect(link.label.length).toBeGreaterThan(0);
      expect(link.icon.length).toBeGreaterThan(0);
    }
  });
});
