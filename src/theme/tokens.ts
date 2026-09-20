export const colors = {
  background: '#FFFFFF',
  surface: '#F8FAFC',
  border: '#E2E8F0',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  primary: '#059669',
  /** Green for TEXT and filled-button backgrounds on white: 5.5:1 (primary is only 3.77:1). */
  primaryStrong: '#047857',
  primaryMuted: '#D1FAE5',
  danger: '#DC2626',
} as const;

export const milestoneTiers = {
  // Used as TEXT (toast label) as well as border: must be the AA-safe #047857 (= colors.primaryStrong).
  firstDay: { label: 'First Day', color: '#047857' },
  sevenDayStreak: { label: '7-Day Streak', color: '#2563EB' },
  thirtyDayStreak: { label: '30-Day Streak', color: '#D97706' },
} as const;

export type MilestoneTier = keyof typeof milestoneTiers;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;
