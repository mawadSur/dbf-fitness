import type { LiveClassStatus } from './status';

export type CoachAction = 'start' | 'end' | 'cancel';

export const ACTION_TARGET_STATUS: Record<CoachAction, LiveClassStatus> = {
  start: 'live',
  end: 'ended',
  cancel: 'cancelled',
};

export const ACTION_LABEL: Record<CoachAction, string> = {
  start: 'Start class',
  end: 'End class',
  cancel: 'Cancel class',
};

export const ACTION_CONFIRM_TEXT: Record<CoachAction, string> = {
  start: 'Start this class now? Members will see it as live.',
  end: 'End this class for everyone?',
  cancel: 'Cancel this class? Members will no longer be able to join.',
};

/** Which controls the owning coach gets for a class in `status`. */
export function coachActionsFor(status: LiveClassStatus): CoachAction[] {
  if (status === 'scheduled') return ['start', 'cancel'];
  if (status === 'live') return ['end', 'cancel'];
  return [];
}

export function isClassOwner(memberId: string | null | undefined, coachId: string | null | undefined): boolean {
  return !!memberId && !!coachId && memberId === coachId;
}

/** Class management requires ownership AND a staff role (profiles.role), not ownership alone. */
export function canManageClass(
  member: { id?: string | null; role?: string | null } | null | undefined,
  coachId: string | null | undefined,
): boolean {
  return isClassOwner(member?.id, coachId) && (member?.role === 'coach' || member?.role === 'admin');
}

export function uploadRecordingHref(classId: string): string {
  return `/notes/upload?classId=${encodeURIComponent(classId)}`;
}
