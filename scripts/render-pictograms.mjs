/**
 * Renders every exercise pictogram to an HTML contact sheet and screenshots it,
 * so the poses can be judged by eye the way a coach would judge them.
 *
 *   node scripts/render-pictograms.mjs [outDir]
 *
 * It imports the REAL geometry, registry, drawing spec, resolver and theme
 * tokens (Node 24 strips the types), so what you look at is what the app draws.
 * Nothing here runs in the app.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { register } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

// Registered BEFORE the app modules are imported, which is why those imports are
// dynamic: a static import would be resolved before this line ran.
register('./ts-resolve-hooks.mjs', import.meta.url);

const { pictogramDrawing, keyFrameIndex, pictogramPalette } = await import(
  '../src/features/exercises/drawing.ts'
);
const { PICTOGRAM_KEYS } = await import('../src/features/exercises/pictograms.ts');
const { resolveExerciseImageKey } = await import('../src/features/exercises/resolve.ts');
const { darkTheme, lightTheme } = await import('../src/theme/tokens.ts');

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolvePath(process.argv[2] ?? join(tmpdir(), 'dbf-pictograms'));

/** The seeded exercise names — these must each land on their own pictogram. */
const SEEDED = [
  'Bodyweight Squats',
  'Burpees',
  'High Knees',
  'Mountain Climbers',
  'Plank Hold',
  'Push-Ups',
  'Walking Lunges',
];

/** Names no coach agreed on: the fallbacks must still look deliberate. */
const UNKNOWN = [
  'Jumping Jacks',
  'Dumbbell Shoulder Press',
  'Russian Twists',
  'Hip Opener Stretch',
  'Coach special',
  '',
];

/** One frame as an inline <svg>. `viewBox` is the full box for a hero, cropped for a thumb. */
function frameSvg(frame, palette, size, viewBox) {
  const shapes = frame.shapes
    .map((shape) => {
      const stroke = shape.role === 'ground' ? palette.ground : palette[shape.role];
      const opacity = shape.role === 'far' ? ` opacity="${palette.farOpacity}"` : '';
      if (shape.kind === 'circle') {
        return `<circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}" fill="${stroke}"${opacity} />`;
      }
      return `<path d="${shape.d}" stroke="${stroke}" stroke-width="${shape.width}" stroke-linecap="round" stroke-linejoin="round" fill="none"${opacity} />`;
    })
    .join('');
  return `<svg width="${size}" height="${size}" viewBox="${viewBox}">${shapes}</svg>`;
}

function heroCard(drawing, palette) {
  const box = `0 0 ${drawing.viewBox} ${drawing.viewBox}`;
  const frames = drawing.frames
    .map(
      (frame, index) =>
        `<div class="frame"><span class="step">${index + 1}</span>${frameSvg(frame, palette, 150, box)}</div>`,
    )
    .join('<span class="arrow">&rarr;</span>');
  return `<section class="card">
    <p class="key">${drawing.key}</p>
    <div class="hero">${frames}</div>
    <p class="alt">${drawing.alt}</p>
  </section>`;
}

function thumbRow(entries, palette) {
  const cells = entries
    .map(({ name, key, drawing }) => {
      const frame = drawing.frames[keyFrameIndex(drawing.frames.length)];
      return `<div class="thumbCell">
        <div class="thumb">${frameSvg(frame, palette, 52, frame.croppedViewBox)}</div>
        <div class="thumbText"><b>${name || '(no name)'}</b><br /><span>${key}</span></div>
      </div>`;
    })
    .join('');
  return `<section class="card"><p class="key">Thumbnails, 56px — as they appear beside a checklist row</p><div class="thumbs">${cells}</div></section>`;
}

function page(scheme) {
  const colors = scheme === 'dark' ? darkTheme : lightTheme;
  const palette = pictogramPalette(colors, scheme);
  const heroes = PICTOGRAM_KEYS.map((key) => heroCard(pictogramDrawing(key), palette)).join('');
  const named = [...SEEDED, ...UNKNOWN].map((name) => {
    const key = resolveExerciseImageKey({ name });
    return { name, key, drawing: pictogramDrawing(key) };
  });

  return `<!doctype html>
<html><head><meta charset="utf-8" /><style>
  :root { color-scheme: ${scheme}; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; background: ${colors.bg}; color: ${colors.text};
         font-family: -apple-system, system-ui, sans-serif; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .lede { margin: 0 0 20px; color: ${colors.textMuted}; font-size: 13px; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  .card { border: 1px solid ${colors.borderSoft}; border-radius: 16px; padding: 16px;
          background: linear-gradient(180deg, ${colors.bg} 0%, ${colors.bgSoft} 100%); }
  .key { margin: 0 0 8px; font-size: 12px; letter-spacing: 1.44px; text-transform: uppercase;
         font-weight: 600; color: ${colors.textSecondary}; }
  .hero { display: flex; align-items: flex-end; justify-content: center; gap: 4px; }
  .frame { position: relative; }
  .step { position: absolute; top: 2px; left: 2px; font-size: 11px; font-weight: 600;
          color: ${colors.textMuted}; }
  .arrow { color: ${colors.textMuted}; font-size: 18px; padding-bottom: 60px; }
  .alt { margin: 8px 0 0; font-size: 12px; line-height: 17px; color: ${colors.textMuted}; }
  .thumbs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .thumbCell { display: flex; align-items: center; gap: 12px; }
  .thumb { width: 56px; height: 56px; border-radius: 12px; overflow: hidden; flex: none;
           background: ${colors.bgSoft}; border: 1px solid ${colors.borderSoft};
           display: flex; align-items: center; justify-content: center; }
  .thumbText { font-size: 13px; line-height: 18px; }
  .thumbText span { color: ${colors.textMuted}; font-size: 11px; }
  .wide { grid-column: 1 / -1; }
</style></head><body>
  <h1>Exercise pictograms — ${scheme}</h1>
  <p class="lede">Hero (all frames, left to right) for every registry key, then the 56px thumbnails
     for the seeded names and for six names the resolver has never seen.</p>
  <div class="grid">${heroes}<div class="wide">${thumbRow(named, palette)}</div></div>
</body></html>`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();

  for (const scheme of ['light', 'dark']) {
    const html = page(scheme);
    const htmlPath = resolvePath(OUT_DIR, `contact-${scheme}.html`);
    await writeFile(htmlPath, html, 'utf8');
    const context = await browser.newContext({
      viewport: { width: 1180, height: 1400 },
      deviceScaleFactor: 2,
      colorScheme: scheme,
    });
    const pageHandle = await context.newPage();
    await pageHandle.goto(`file://${htmlPath}`);
    await pageHandle.screenshot({
      path: resolvePath(OUT_DIR, `contact-${scheme}.png`),
      fullPage: true,
    });
    await context.close();
    console.log(`wrote contact-${scheme}.png`);
  }

  await browser.close();
  console.log(`contact sheets in ${OUT_DIR} (script at ${HERE})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
