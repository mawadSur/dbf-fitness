/**
 * Presentation table for the milestone toast — copy and skin only.
 *
 * The tier LOGIC (what counts as a milestone, which one is the headline) lives
 * in `logic.ts` and is untouched by this file. Each tier gets its own icon, its
 * own badge tone and its own sentence, so the three moments are told apart by
 * three things at once and never by the hue alone (design system §9).
 */

import type { MilestoneTone } from '../../components/ui/MilestoneBadge';
import type { IconName } from '../../components/ui/icons';
import { milestoneTiers, type MilestoneTier } from '../../theme/tokens';

export type MilestoneToastSkin = {
  /** The tier's name, from the shared token table — one source of truth. */
  title: string;
  /** How it was earned, under the title. */
  caption: string;
  /** One line of praise, in second person. */
  message: string;
  icon: IconName;
  tone: MilestoneTone;
};

export const MILESTONE_TOAST_SKINS: Record<MilestoneTier, MilestoneToastSkin> = {
  firstDay: {
    title: milestoneTiers.firstDay.label,
    caption: 'Your first workout logged',
    message: 'You started. That is the hard part.',
    icon: 'check-circle',
    tone: 'success',
  },
  sevenDayStreak: {
    title: milestoneTiers.sevenDayStreak.label,
    caption: '7 days in a row',
    message: 'A full week without a gap. Keep it rolling.',
    icon: 'flame',
    tone: 'info',
  },
  thirtyDayStreak: {
    title: milestoneTiers.thirtyDayStreak.label,
    caption: '30 days in a row',
    message: 'Thirty days straight. This is a habit now.',
    icon: 'crown',
    tone: 'warning',
  },
};

/** What a screen reader hears the moment the toast appears. */
export function milestoneAnnouncement(tier: MilestoneTier): string {
  const skin = MILESTONE_TOAST_SKINS[tier];
  return `Milestone unlocked: ${skin.title}. ${skin.caption}. ${skin.message}`;
}
