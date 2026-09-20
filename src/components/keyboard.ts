// 'padding' on BOTH platforms: with Android edge-to-edge the window no longer
// resizes for the keyboard, so an undefined behavior leaves fields/CTAs covered.
export const KEYBOARD_AVOIDING_BEHAVIOR = 'padding' as const;
