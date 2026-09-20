import type { ChooseCoachErrorCode } from '../../features/coaching/types';

export type ConfirmFlowState =
  | { status: 'idle' }
  | { status: 'confirming'; coachId: string; coachName: string }
  | { status: 'saving'; coachId: string; coachName: string }
  | { status: 'error'; coachId: string; coachName: string; code: ChooseCoachErrorCode }
  | { status: 'done'; coachName: string };

export type ConfirmFlowAction =
  | { type: 'select'; coachId: string; coachName: string }
  | { type: 'cancel' }
  | { type: 'submit' }
  | { type: 'fail'; code: ChooseCoachErrorCode }
  | { type: 'succeed' };

export const initialConfirmFlow: ConfirmFlowState = { status: 'idle' };

export function confirmFlowReducer(state: ConfirmFlowState, action: ConfirmFlowAction): ConfirmFlowState {
  switch (action.type) {
    case 'select':
      if (state.status === 'saving') return state;
      return { status: 'confirming', coachId: action.coachId, coachName: action.coachName };
    case 'cancel':
      return state.status === 'saving' ? state : { status: 'idle' };
    case 'submit':
      return state.status === 'confirming' || state.status === 'error'
        ? { status: 'saving', coachId: state.coachId, coachName: state.coachName }
        : state;
    case 'fail':
      return state.status === 'saving' ? { ...state, status: 'error', code: action.code } : state;
    case 'succeed':
      return state.status === 'saving' ? { status: 'done', coachName: state.coachName } : state;
    default:
      return state;
  }
}

export function chooseCoachErrorMessage(code: ChooseCoachErrorCode): string {
  switch (code) {
    case 'coach_not_accepting':
      return 'This coach is not accepting new members right now.';
    case 'coach_not_found':
      return 'That coach could not be found. Pull to refresh the list.';
    case 'not_a_member':
      return 'Only members can choose a coach.';
    case 'not_authenticated':
      return 'Your session has expired. Please sign in again.';
    case 'network':
      return 'Network problem. Check your connection and try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

/** Whether retrying the same request could help. */
export function isRetryable(code: ChooseCoachErrorCode): boolean {
  return code === 'network' || code === 'unknown';
}
