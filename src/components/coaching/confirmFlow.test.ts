import {
  chooseCoachErrorMessage,
  confirmFlowReducer,
  initialConfirmFlow,
  isRetryable,
  type ConfirmFlowState,
} from './confirmFlow';

const confirming: ConfirmFlowState = { status: 'confirming', coachId: 'c1', coachName: 'Dana' };
const saving: ConfirmFlowState = { status: 'saving', coachId: 'c1', coachName: 'Dana' };

describe('confirmFlowReducer', () => {
  it('select opens the confirm panel', () => {
    expect(confirmFlowReducer(initialConfirmFlow, { type: 'select', coachId: 'c1', coachName: 'Dana' })).toEqual(confirming);
  });
  it('submit moves confirming and error to saving, ignores idle', () => {
    expect(confirmFlowReducer(confirming, { type: 'submit' })).toEqual(saving);
    expect(
      confirmFlowReducer({ ...confirming, status: 'error', code: 'network' }, { type: 'submit' }),
    ).toEqual(saving);
    expect(confirmFlowReducer(initialConfirmFlow, { type: 'submit' })).toBe(initialConfirmFlow);
  });
  it('fail keeps the coach and records the code; succeed completes', () => {
    expect(confirmFlowReducer(saving, { type: 'fail', code: 'coach_not_accepting' })).toEqual({
      status: 'error',
      coachId: 'c1',
      coachName: 'Dana',
      code: 'coach_not_accepting',
    });
    expect(confirmFlowReducer(saving, { type: 'succeed' })).toEqual({ status: 'done', coachName: 'Dana' });
  });
  it('cannot cancel or reselect while saving', () => {
    expect(confirmFlowReducer(saving, { type: 'cancel' })).toBe(saving);
    expect(confirmFlowReducer(saving, { type: 'select', coachId: 'c2', coachName: 'X' })).toBe(saving);
  });
  it('cancel returns to idle', () => {
    expect(confirmFlowReducer(confirming, { type: 'cancel' })).toEqual({ status: 'idle' });
  });
});

describe('error mapping', () => {
  it('has distinct copy per code and retryability', () => {
    const codes = ['coach_not_accepting', 'coach_not_found', 'not_a_member', 'not_authenticated', 'network', 'unknown'] as const;
    expect(new Set(codes.map(chooseCoachErrorMessage)).size).toBe(codes.length);
    expect(isRetryable('network')).toBe(true);
    expect(isRetryable('coach_not_accepting')).toBe(false);
  });
});
