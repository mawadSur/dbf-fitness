import { createContext, useContext } from 'react';

/**
 * Safe areas are handled in exactly ONE place per screen (design system §6).
 * `ScreenShell` publishes what it has already paid for so nested pieces
 * (`ScreenHeader`, `FixedFooter`) never add the same inset a second time.
 */
export type ScreenShellState = {
  /** True once a shell has applied the status-bar / notch inset. */
  topInsetApplied: boolean;
  /** True when the screen renders inside the tab navigator. */
  insideTabShell: boolean;
};

export const DEFAULT_SCREEN_SHELL_STATE: ScreenShellState = {
  topInsetApplied: false,
  insideTabShell: false,
};

export const ScreenShellContext = createContext<ScreenShellState>(DEFAULT_SCREEN_SHELL_STATE);

export function useScreenShell(): ScreenShellState {
  return useContext(ScreenShellContext);
}
