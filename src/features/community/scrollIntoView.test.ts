import { overflowToScroll } from './scrollIntoView';

describe('overflowToScroll', () => {
  const base = { windowHeight: 640, keyboardHeight: 300 };

  it('is 0 when the field already clears the keyboard', () => {
    expect(overflowToScroll({ ...base, y: 100, height: 88 })).toBe(0);
  });

  it('scrolls by the covered amount plus the margin', () => {
    expect(overflowToScroll({ ...base, y: 500, height: 88 })).toBe(264);
  });

  it('honours a custom margin and the exact boundary', () => {
    // bottom 324 + margin 16 = 340 = keyboard top -> no scroll; 1pt lower needs 1pt.
    expect(overflowToScroll({ ...base, y: 236, height: 88 })).toBe(0);
    expect(overflowToScroll({ ...base, y: 237, height: 88 })).toBe(1);
    expect(overflowToScroll({ ...base, y: 500, height: 88, margin: 0 })).toBe(248);
  });

  it('treats a negative keyboard height as no keyboard', () => {
    expect(overflowToScroll({ ...base, keyboardHeight: -5, y: 500, height: 88 })).toBe(0);
  });
});
