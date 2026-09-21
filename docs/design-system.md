# DBF Fitness design system — developer guide

The product-facing spec is "DBF Brand Emerald". This file is the version you code
against: what the tokens are, where they live, and the rules the test suite
enforces. If the two ever disagree, the tests in `src/theme/` win — they run in
CI, the spec does not.

Nothing here is optional styling advice. `npm test` fails on a contrast
regression, a missing font family or a token defined in only one theme.

## 1. Where things live

| File | What it holds |
|---|---|
| `global.css` | Semantic CSS variables. `:root` is light, `.dark:root` is dark. |
| `tailwind.config.js` | Wires those variables into Tailwind as `rgb(var(--color-x) / <alpha-value>)`, plus fonts, spacing, radii and shadows. |
| `src/theme/tokens.ts` | The same colours as hex, for React Native style props and SVG, plus `typeScale`, `space`, `layout`, `radii`, `shadows`, `motion`. |
| `src/theme/ThemeProvider.tsx` | `ThemeProvider`, `useTheme()`, `useReducedMotion()`. |
| `src/theme/contrast.ts` | WCAG contrast maths (pure, dependency-free). |
| `src/theme/contrast.test.ts` | The guard: every documented pair, in both themes. |
| `src/theme/fonts.ts` | The exact font weights the app ships, and the splash timeout. |
| `scripts/generate-brand-assets.ts` | Regenerates every PNG in `assets/` from the one source artwork. |

Two copies of the colours exist on purpose: Tailwind classes cannot be passed to
`react-native-svg`, a `shadowColor` or the status bar. They are kept in step by
`src/theme/tokens.test.ts` and `contrast.test.ts`.

## 2. Colour tokens

Use the semantic name, never the shade. `bg-brand` survives a palette change;
`bg-[#059669]` does not. Raw hex is allowed in exactly two places: inside
`src/theme/**` and in the brand asset script.

| Token | Tailwind | Light | Dark | Use it for |
|---|---|---|---|---|
| bg | `bg-bg` | `#FFFFFF` | `#011A14` | Page background |
| bg-soft | `bg-bg-soft` | `#ECFDF5` | `#022C22` | Tinted sections, hero gradient end |
| surface | `bg-surface` | `#FFFFFF` | `#0A3D30` | Cards |
| surface-raised | `bg-surface-raised` | `#FFFFFF` | `#0B4A3A` | Sheets, raised cards |
| text | `text-text` | `#022C22` | `#ECFDF5` | Primary text |
| text-secondary | `text-text-secondary` | `#047857` | `#A7F3D0` | Supporting text |
| text-muted | `text-text-muted` | `#4B5563` | `#A8B3BE` | Helper copy, timestamps |
| brand | `text-brand` / `bg-brand` | `#059669` | `#34D399` | Icons, rings, large text — **not body text in light** |
| cta | `bg-cta` | `#022C22` | `#34D399` | Primary button fill |
| on-cta | `text-on-cta` | `#FFFFFF` | `#022C22` | Label on a primary button |
| sage | `bg-sage` | `#6EE7B7` | `#6EE7B7` | Dot texture, tints (decorative) |
| progress-arc | `bg-progress-arc` | `#047857` | `#34D399` | Filled part of a progress ring/bar |
| progress-track | `bg-progress-track` | `#6EE7B7` | `#065F46` | Unfilled part of a progress ring/bar |
| border-soft | `border-border-soft` | `#A7F3D0` | `#065F46` | Decorative hairlines only |
| border-strong | `border-border-strong` | `#6B7280` | `#6EE7B7` | Inputs, selected states, essential edges |
| focus | `border-focus` | `#059669` | `#34D399` | 2px focus ring |
| success / bg | `text-success` / `bg-success-bg` | `#047857` on `#D1FAE5` | `#34D399` on `#064E3B` | Success banner |
| warning / bg | `text-warning` / `bg-warning-bg` | `#B45309` on `#FEF3C7` | `#FCD34D` on `#422006` | Warning banner |
| danger / bg | `text-danger` / `bg-danger-bg` | `#B91C1C` on `#FEE2E2` | `#FCA5A5` on `#450A0A` | Error banner, field errors |
| info / bg | `text-info` / `bg-info-bg` | `#1D4ED8` on `#DBEAFE` | `#93C5FD` on `#172554` | Info banner |

### The progress ring gets its own pair

The ring was drawn as `brand` on `sage`. That is 2.47:1 in light and 1.26:1 in
dark, so a 5/30 ring and a 30/30 ring were indistinguishable — and the contrast
guard never caught it, because `sage` was typed `decorative`. The arc is the
only thing that says how far along you are, so it is an **essential UI graphic**
(SC 1.4.11) and owes 3:1 against its track. That is impossible for `brand` on a
pale track in light (the ceiling is 3.77:1 and the track still has to be visible
on white), so the ring now has its own two tokens:

| Pair | Light | Dark |
|---|---|---|
| `progress-arc` on `progress-track` | `#047857` on `#6EE7B7` — 3.59:1 | `#34D399` on `#065F46` — 3.99:1 |

Both are asserted as a `ui` pair in `contrast.test.ts`, and the track is
additionally asserted as `decorative` against all four surfaces. `sage` keeps
its decorative role (dot texture, tints).

### Four tokens differ from the original spec table

The spec's own values were run through `contrast.ts` and four of them came in
under 4.5:1, so the token was darkened or lightened one step. The spec's
intent (hue, role) is unchanged.

| Token | Spec value | Measured | Shipped value | Now |
|---|---|---|---|---|
| light `success` | `#059669` on `#D1FAE5` | 3.32:1 | `#047857` | 4.83:1 |
| light `danger` | `#DC2626` on `#FEE2E2` | 3.95:1 | `#B91C1C` | 5.29:1 |
| light `info` | `#2563EB` on `#DBEAFE` | 4.24:1 | `#1D4ED8` | 5.49:1 |
| dark `text-muted` | `#9CA3AF` on `#0B4A3A` | 4.03:1 | `#A8B3BE` | 4.79:1 |

`brand` in light (`#059669`) is 3.57:1 on white. That is deliberate and it is
typed as a `large-text` role: icons, progress rings and headings at 18.66px bold
or 24px regular and above. Body text in brand green is a bug — use
`text-text-secondary` (`#047857`, 5.48:1).

### The contrast guard

`src/theme/contrast.test.ts` builds every documented pair against all four
surfaces, in both themes, and asserts:

- `text` pairs at 4.5:1 or better,
- `large-text` and `ui` pairs (icons, focus ring, essential borders) at 3:1,
- `decorative` pairs (border-soft, sage, progress-track) merely visible at
  1.2:1 — and, at the
  same time, that `border-strong` clears 3:1, so there is always a real edge
  token available.

Tightest margins today: light 4.50:1 (warning on its tint), 3.57:1 (brand on
white) and 3.59:1 (progress arc on its track); dark 4.79:1 and 3.99:1 (progress
arc on its track). Change a colour and run
`CONTRAST_REPORT=1 npx jest src/theme/contrast.test.ts` to print the whole table.

Light cards are white on white: they are separated by the `border-soft`
hairline plus `shadow-sm`, never by fill alone. Dark cards are tonal and need no
shadow.

### A disabled control is re-coloured, never faded

`Button` keeps its shape when disabled — a filled variant stays filled, an
outlined one stays outlined — and swaps its colours for `text-muted` on
`bg-soft` (with `border-soft` where the variant had a border). It carries **no
blanket opacity**.

A single `opacity: 0.45` on the whole control looks fine in light mode and
fails in dark. Both the fill and the label fade toward the page by the same
alpha, so the bright dark-mode `cta` (#34D399) and the near-black `onCta`
(#022C22) collapse toward `bg` (#011A14) and meet in the middle: the disabled
"Sign in" / "Create account" / "Upload recording" label measured (14,80,59) on
(24,108,79) = **1.48:1** on the Android emulator. `text-muted` on `bg-soft` is
in the contrast table above, so the disabled state is ≥ 4.5:1 in both themes
and `accessibilityState.disabled` still announces it. A *loading* button keeps
its own colours, because the spinner is drawn in the variant's content colour.

### Destructive actions carry the danger tone

`danger` is the filled, armed action ("Permanently delete"). `danger-outline`
is the same tone as an outline, for the ENTRY to a destructive flow: it is what
"Delete account" wears so it cannot be mistaken for the benign `secondary`
"Sign out" and "Change coach" sitting directly above it in the danger zone.

## 3. Typography

React Native does not synthesise bold, so every weight is its own family. Use
the `font-*` utilities or `typeScale` — never a bare `fontWeight`.

| Role | Family / class | Size / line |
|---|---|---|
| display | `font-heading` (Manrope 800) | 40 / 44 |
| h1 | `font-heading` | 30 / 36 |
| h2 | `font-heading` | 24 / 30 |
| h3 | `font-heading-bold` (Manrope 700) | 19 / 26 |
| body-lg | `font-body` (Inter 400) | 17 / 26 |
| body | `font-body` | 16 / 24 |
| body-sm | `font-body` / `font-body-medium` | 14 / 20 |
| label, button | `font-body-semibold` | 15-16 / 20 |
| eyebrow | `font-body-semibold`, uppercase, +1.44 tracking | 12 / 16 |
| caption | `font-body` | 12 / 16 |

Rules: never below 12px, body at 16px or more, no fixed-height text boxes, leave
system font scaling on, and use `fontVariant: ['tabular-nums']` for numbers and
timers.

The six families in `src/theme/fonts.ts` are the only ones bundled, imported one
weight at a time (importing the package root pulls in every weight and italic).
`src/theme/tokens.test.ts` fails if `tokens.fontFamily` names a family that
`brandFonts` does not load.

## 4. Space, radius, elevation, motion

- Spacing: 4 / 8 / 12 / 16 / 24 / 32 / 48 (`space.xs` … `space['3xl']`, or
  `p-lg`, `gap-xl`). Screen gutter 16, 24 from 600dp wide. Max content width
  640, centred.
- Radius: `rounded-sm` 4, `rounded-md` 8 (buttons, inputs), `rounded-lg` 12
  (cards), `rounded-xl` 16 (panels, sheets), `rounded-pill` 999.
- Elevation: `shadows.sm | md | lg` only, and light theme only — dark mode
  separates surfaces with borders. Each step carries an Android `elevation`
  (1 / 2 / 4). Do not invent a shadow.
- Motion: `motion.fast` 150ms, `motion.base` 250ms, `motion.slow` 350ms; exits
  run at `motion.exitRatio` (65%) of the enter duration; press feedback is
  scale 0.98 + opacity 0.92, which must not shift layout.

## 5. Theme and reduced motion

`ThemeProvider` wraps the whole app in `app/_layout.tsx`.

```tsx
const { scheme, preference, setPreference, colors, tokens } = useTheme();
```

- `preference` is `'system' | 'light' | 'dark'`, persisted in AsyncStorage under
  `dbf.themePreference`. Every read and write is wrapped: if storage is missing
  or throws, the app falls back to `system` and keeps working.
- `scheme` is what is actually in force. The provider watches `Appearance` for
  its whole lifetime, so switching the preference back to `system` shows the
  current OS theme, not a stale one.
- The provider calls NativeWind's `colorScheme.set(scheme)`, which is what makes
  `dark:` utilities flip. That is also why `darkMode: 'class'` has to stay in
  `tailwind.config.js` (NativeWind issue #1489: on web, `colorScheme.set` throws
  under the default `media` strategy).
- `colors` is the hex palette for style props and SVG. Prefer Tailwind classes
  in JSX; reach for `colors` only where a class cannot go.

```tsx
const reduced = useReducedMotion();
const duration = reduced ? 0 : tokens.motion.base;
```

Every animation checks `useReducedMotion()` and falls back to an instant state
change.

### Screens that are not migrated yet

**There are none left.** Stage 2 moved every reachable screen onto `useTheme()`,
so the light-palette pins are gone with it. The rule that produced them is worth
keeping, because it applies to any screen added from here on:

A design-system component draws its own ink but NOT its own page background, so
dropping one onto a screen that paints a hard-coded light background breaks in
dark mode. `ScoreRing` hit exactly that: on the home screen the ring's number
came out `#ECFDF5` on `#FFFFFF` (1.05:1 — invisible). The fix is to theme the
screen, never to pin the component: `src/components/ScoreRing.tsx` and
`src/components/ChecklistRow.tsx` survive only as `@deprecated` prop-compatible
adapters over `ui/ProgressRing` and `ui/ChecklistRow`, and both follow the theme.
A new screen paints its page from `useTheme()` (normally by composing
`ScreenShell`) before it uses any ui component.

### Tab bar geometry

- Every tab takes an equal share of the row, and that `flex: 1` lives on a
  **static** style object. `jsxImportSource: 'nativewind'` means `Pressable` is
  the css-interop wrapper, and the `style={({ pressed }) => …}` function form
  did not deliver layout props to Yoga on Android — the tabs came out
  content-sized and left-packed, below the 48dp minimum, with the brand pill
  stuck at x=0. Press feedback (opacity/transform only) may stay in the
  function form; layout may not.
- "Labels are never clipped at 200%" is a WIDTH statement as much as a height
  one — the label is `ellipsizeMode="tail"`. `tabBarLabelFits(barWidth,
  tabCount, fontScale, label)` in `src/components/ui/layout.ts` is the check,
  and it is asserted for every shipped label at every 5% step from 100% to
  200% on 360 / 390 / 412pt.
- The fit model is **discrete and per-character**. An "average glyph ratio"
  model is wrong twice over: it mis-measures ("Comm" is 3.17em, not 4 × 0.62)
  and, worse, it compares the total advance to `lines × lineWidth`, which
  assumes a word can be poured across two lines with no wasted width. Words
  break at character boundaries. `GLYPH_ADVANCE_EM` holds the advance of every
  printable ASCII character, measured from the shipped Inter Medium/SemiBold
  `.ttf`s and re-verified against them by `src/components/ui/fontMetrics.test.ts`;
  `wrapLabel()` then breaks the label greedily the way the platforms do.
- The label carries `maxFontSizeMultiplier={labelScale}` — the smaller of
  `TAB_BAR_LABEL_MAX_FONT_SCALE` (150%, never the app-wide 200%) and
  `tabBarLabelFitScale(barWidth, tabCount, label)`, **the largest scale at
  which the label still fits ONE line**. A tab label is a single word, so the
  only break the platform can make is BETWEEN LETTERS: at 150% "Community"
  breaks "Commu"/"nity", which clips nothing but reads as a rendering fault
  next to four single-line neighbours (measured on the Android emulator at
  font_scale 2.0). The fit cap is ~101% on 360pt, ~110% on 390pt and ~116% on
  412pt — modest growth, but the whole word on one line at every OS text size.
  It never goes below 100%: a bar too narrow for the label at 12pt falls back
  to the two-line box rather than sub-12pt glyphs. Everything else in the app
  still scales to 200%, and the full name stays in the tab's
  `accessibilityLabel` at any size.
- The **line count follows the measured fit**, not a bare "text was scaled"
  threshold: `tabBarLabelLines(fontScale, barWidth, tabCount, longestLabel)`.
  A 412pt phone keeps one line (and a 62pt bar) at 105%, where the old
  `scale > 1` rule spent 19pt of a 640pt screen on a second line nothing used.

### App chrome

The status bar, the tab bar and the root session spinner sit on top of whatever
the screen paints, so they have to agree with the SCREEN. Now that every screen
follows `useTheme()`, so do all three — `AppTabBar` passes the resolved scheme
straight to `DbfTabBar`, `ThemedStatusBar` calls `statusBarStyle(scheme)`, and
the web session gate paints `themes[scheme]`.

`src/theme/chrome.ts` is down to `statusBarStyle()`, the one rule that never
depended on the migration: glyphs contrast with the surface behind them. The
`LEGACY_SCREENS_ARE_LIGHT` / `chromeScheme()` pin is **removed**, and
`chrome.test.ts` asserts it has not come back. It existed because with the OS in
night mode the app drew white status-bar glyphs over the hard-coded white page —
the measured top band of the Android home screen was 100% (255,255,255), i.e. no
clock, wifi or battery at all — and a `rgba(1,26,20,0.9)` tab bar under the same
white page. Re-introducing a pin would silently make dark mode light again for
all three surfaces at once. The dev gallery still declares its own `<StatusBar>`
because it forces a scheme rather than reading the member's preference.

**No route turns on the native stack header.** It is the one piece of chrome
that cannot read `useTheme()`, so a route that shows it gets a hard-white bar
in dark mode whatever the page behind it paints — and the light status-bar
glyphs `statusBarStyle('dark')` asks for vanish into it. Calendar was the last
such route (`presentation: 'modal', headerShown: true, title: 'Calendar'`): its
top band measured rgb(255,255,255) against the dark-emerald page, with no
clock, wifi or battery, and in light mode it showed a system-font title and a
grey hairline where every other screen shows the letter-spaced eyebrow and
Manrope heading. Every screen now draws its own `ScreenHeader` inside a
`ScreenShell`, which pays the status-bar inset exactly once;
`rootLayout.test.tsx` asserts no `Stack.Screen` sets `headerShown`.

## 6. Brand assets

`npm run assets:brand` regenerates all of `assets/` from
`assets/brand/dbf-logo-original.png` using headless Chromium (no image library
is added to the app). It re-decodes each PNG after writing and fails if the
artwork touches the canvas edge or spills out of the 66% safe zone.

| File | Size | Content |
|---|---|---|
| `icon.png` | 1024² | Family mark on `#ECFDF5`, inside the safe zone, no wordmark |
| `android-icon-foreground.png` | 1024² | Mark on transparent, same safe zone |
| `android-icon-background.png` | 1024² | Solid `#ECFDF5` |
| `android-icon-monochrome.png` | 1024² | Single-colour `#022C22` silhouette |
| `splash-icon.png` | 1024×883 | Mark + "DBF FITNESS" wordmark on `#FFFFFF` |
| `favicon.png` | 48² | Mark on `#ECFDF5` |
| `logo.png` | 1024×974 | Full lockup with tagline, trimmed, transparent |

The wordmark and the illustration outlines are black. On any dark background the
logo must sit on a light badge (`bg-soft`, radius 24) or a light surface — that
is why the splash artwork ships on white rather than on transparency.

Set `DBF_ASSET_PREVIEW_DIR` when running the script to also write flattened
copies of the transparent assets somewhere you can look at them.

## 7. Do and do not

Do:

- use semantic tokens and `font-*` utilities;
- give every icon-only control an `accessibilityLabel` and a 44pt hit target;
- pair colour with an icon or text — colour is never the only signal;
- check `useReducedMotion()` before animating;
- run `CONTRAST_REPORT=1 npx jest src/theme/contrast.test.ts` after touching a
  colour.

Do not:

- write raw hex outside `src/theme/**` and the asset script;
- use `brand` for body text in the light theme;
- rely on `border-soft` or `sage` to separate two regions — they are below 3:1
  by design; use `border-strong`;
- put layout props (`flex`, padding, alignment) in a `style={({ pressed }) => …}`
  function — they do not reach Yoga on Android through the NativeWind wrapper;
- pass React-Native-only accessibility props (`accessible={false}`,
  `accessibilityElementsHidden`, `importantForAccessibility`) to an `<Svg>` —
  react-native-svg forwards them to the DOM on web and React logs a warning per
  render; use `svgAccessibilityProps()`;
- add a new shadow, radius or spacing step outside the scales above;
- set `fontWeight` instead of picking the family;
- disable font scaling, or give a text container a fixed height.
</content>
</invoke>
