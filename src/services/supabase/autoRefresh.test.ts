import { bindAuthAutoRefresh } from './autoRefresh';

function setup(initial: string) {
  let handler: (s: never) => void = () => undefined;
  const remove = jest.fn();
  const appState = {
    currentState: initial,
    addEventListener: jest.fn((_t: string, h: (s: never) => void) => {
      handler = h;
      return { remove };
    }),
  };
  const auth = { startAutoRefresh: jest.fn(), stopAutoRefresh: jest.fn() };
  return { appState, auth, remove, emit: (s: string) => handler(s as never) };
}

describe('bindAuthAutoRefresh', () => {
  it('starts on active, stops otherwise, and cleans up (native)', () => {
    const { appState, auth, remove, emit } = setup('active');
    const cleanup = bindAuthAutoRefresh(auth, appState as never, 'ios');
    expect(auth.startAutoRefresh).toHaveBeenCalledTimes(1);
    emit('background');
    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
    emit('active');
    expect(auth.startAutoRefresh).toHaveBeenCalledTimes(2);
    cleanup();
    expect(remove).toHaveBeenCalled();
    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(2);
  });

  it('is a no-op on web', () => {
    const { appState, auth } = setup('active');
    bindAuthAutoRefresh(auth, appState as never, 'web')();
    expect(appState.addEventListener).not.toHaveBeenCalled();
    expect(auth.startAutoRefresh).not.toHaveBeenCalled();
    expect(auth.stopAutoRefresh).not.toHaveBeenCalled();
  });
});
