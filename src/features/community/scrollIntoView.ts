/**
 * How far the list must scroll so a focused field's bottom edge clears the keyboard.
 * `y`/`height` are window coordinates (measureInWindow); returns 0 when already visible.
 */
export function overflowToScroll(input: {
  y: number;
  height: number;
  windowHeight: number;
  keyboardHeight: number;
  margin?: number;
}): number {
  const margin = input.margin ?? 16;
  const visibleBottom = input.windowHeight - Math.max(0, input.keyboardHeight);
  return Math.max(0, Math.ceil(input.y + input.height + margin - visibleBottom));
}
