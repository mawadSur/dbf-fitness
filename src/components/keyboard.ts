import { Platform, type KeyboardAvoidingViewProps } from 'react-native';

type Behavior = NonNullable<KeyboardAvoidingViewProps['behavior']>;

/**
 * The ONE place that decides KeyboardAvoidingView `behavior`; every call site uses it.
 * 'padding' on every platform: with Android edge-to-edge the window no longer resizes for the
 * keyboard, so 'height'/undefined leaves fields and CTAs covered.
 */
export function keyboardAvoidingBehavior(_os: string = Platform.OS): Behavior {
  return 'padding';
}

export const KEYBOARD_AVOIDING_BEHAVIOR: Behavior = keyboardAvoidingBehavior();
