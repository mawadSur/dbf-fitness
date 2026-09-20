/**
 * The DBF icon set (design system §4): one in-house, Lucide-style outline set.
 *
 * Every icon is a list of SVG path `d` strings on a 24×24 grid, stroked at 2px
 * with round caps/joins and no fill — so `Icon.tsx` can render any of them with
 * the same primitive and a single colour. Circles are emitted as arc paths by
 * `circle()` rather than `<Circle>` elements to keep the data one flat shape.
 *
 * NO emoji and no text glyphs are ever used as icons.
 */

/** A circle as a path, so every icon is just `d` strings. */
function circle(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`;
}

export const ICON_PATHS = {
  // navigation / tabs
  home: ['M3 10.5 12 3l9 7.5', 'M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5'],
  workout: ['M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11'],
  food: ['M7 3v8a2 2 0 0 0 2 2v8M11 3v8M15 21V3c3 1 4 4 4 8h-4'],
  community: [
    circle(9, 8, 3),
    'M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5a3 3 0 0 1 0 6M18 14c1.8.8 3 2.6 3 5',
  ],
  profile: [circle(12, 8, 4), 'M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8'],

  // time / progress
  calendar: [
    'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z',
    'M8 2v4M16 2v4M4 10h16',
  ],
  clock: [circle(12, 12, 9), 'M12 7v5l3.5 2'],
  flame: [
    'M12 22c4 0 7-2.7 7-6.5 0-4.5-4-6.5-4-10.5-2 1-3 2.5-3 4.5 0 1.5-1 2.5-2 2.5S8 11 8 9.5C6.7 11 5 12.7 5 15.5 5 19.3 8 22 12 22z',
  ],
  trophy: [
    'M7 4h10v5a5 5 0 0 1-10 0z',
    'M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3M12 14v3M9 20h6M10 20l.5-3h3l.5 3',
  ],
  crown: ['M3 7l4.5 4L12 4l4.5 7L21 7l-2 11H5z', 'M5 21h14'],
  heart: ['M12 20.5S3.5 15 3.5 9.2A4.7 4.7 0 0 1 12 6.5a4.7 4.7 0 0 1 8.5 2.7c0 5.8-8.5 11.3-8.5 11.3z'],

  // affirmative / negative
  check: ['M20 6 9 17l-5-5'],
  'check-circle': [circle(12, 12, 9), 'M8.2 12.4l2.6 2.6 5-5.4'],
  x: ['M18 6 6 18M6 6l12 12'],
  plus: ['M12 5v14M5 12h14'],
  minus: ['M5 12h14'],

  // chevrons / arrows
  'chevron-left': ['M15 6l-6 6 6 6'],
  'chevron-right': ['M9 6l6 6-6 6'],
  'chevron-down': ['M6 9l6 6 6-6'],
  'chevron-up': ['M6 15l6-6 6 6'],
  'arrow-right': ['M4 12h16M14 6l6 6-6 6'],
  'external-link': ['M15 3h6v6M10 14 21 3', 'M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5'],

  // actions
  search: [circle(11, 11, 7), 'M20 20l-4.3-4.3'],
  bell: ['M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9', 'M13.7 21a2 2 0 0 1-3.4 0'],
  settings: ['M4 7h10M18 7h2M4 17h4M12 17h8', circle(16, 7, 2.5), circle(10, 17, 2.5)],
  'log-out': ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5M21 12H9'],
  upload: ['M12 16V4M7.5 8.5 12 4l4.5 4.5', 'M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2'],
  refresh: ['M21 12a9 9 0 1 1-2.6-6.4', 'M21 3v6h-6'],
  edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z'],
  trash: [
    'M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2',
    'M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14M10 11v6M14 11v6',
  ],
  'file-text': [
    'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z',
    'M14 3v5h5M9 13h6M9 17h6',
  ],

  // live / media
  video: [
    'M15 10.5 21 7v10l-6-3.5',
    'M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  ],
  mic: ['M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z', 'M19 11a7 7 0 0 1-14 0M12 18v3M8 21h8'],
  'mic-off': [
    'M9 9v3a3 3 0 0 0 5.1 2.1M15 12V6a3 3 0 0 0-5.9-.7',
    'M19 11a7 7 0 0 1-1.2 3.9M5 11a7 7 0 0 0 11 5.7M12 18v3M8 21h8',
    'M3 3l18 18',
  ],
  'camera-off': [
    'M10.5 6H14l1.5 2H19a2 2 0 0 1 2 2v7M17 17H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h1',
    'M9.5 12.5a3 3 0 0 0 4 2.9',
    'M3 3l18 18',
  ],
  play: ['M7 4.5 19 12 7 19.5z'],
  pause: ['M9 5v14M15 5v14'],

  // status / meaning
  'alert-triangle': [
    'M10.3 4.3 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z',
    'M12 9v4M12 17h.01',
  ],
  info: [circle(12, 12, 9), 'M12 16v-5M12 8h.01'],
  lock: ['M5 11a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z', 'M8 9V7a4 4 0 0 1 8 0v2'],
  shield: ['M12 3l8 3v6c0 5-3.5 8.2-8 9-4.5-.8-8-4-8-9V6z'],

  // theme / visibility
  moon: ['M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z'],
  sun: [
    circle(12, 12, 4),
    'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  ],
  eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z', circle(12, 12, 3)],
  'eye-off': [
    'M10.6 5.2A10.9 10.9 0 0 1 12 5c6.4 0 10 7 10 7a18.5 18.5 0 0 1-3.2 4.2M6.2 6.6A18.4 18.4 0 0 0 2 12s3.6 7 10 7a10.7 10.7 0 0 0 4.2-.8',
    'M9.9 9.9a3 3 0 0 0 4.2 4.2',
    'M3 3l18 18',
  ],
} as const satisfies Record<string, readonly string[]>;

export type IconName = keyof typeof ICON_PATHS;

export const ICON_NAMES = Object.keys(ICON_PATHS) as IconName[];

/** Design system §4: 16 / 20 / 24 / 28. Tab bar uses 24. */
export const ICON_SIZES = [16, 20, 24, 28] as const;
export type IconSize = (typeof ICON_SIZES)[number];

export const ICON_VIEWBOX = 24;
export const ICON_STROKE_WIDTH = 2;

export function isIconName(value: unknown): value is IconName {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ICON_PATHS, value);
}

/**
 * Snaps an arbitrary size (a navigator handing us its own `size`, a scaled
 * value) onto the four sizes the set is drawn for, so stroke weight stays
 * optically even instead of drifting with the box.
 */
export function nearestIconSize(size: number): IconSize {
  if (!Number.isFinite(size)) return 24;
  return ICON_SIZES.reduce((best, candidate) =>
    Math.abs(candidate - size) < Math.abs(best - size) ? candidate : best,
  );
}
