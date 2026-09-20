/**
 * Generates every brand PNG in `assets/` from the one source artwork
 * (`assets/brand/dbf-logo-original.png`) with headless Chromium — no image
 * dependency is added to the app.
 *
 *   npm run assets:brand
 *
 * The source logo is a mosque arch containing the DBF family, the "DBF FITNESS"
 * wordmark and the "DEEN BUSINESS FAMILY FITNESS" tagline, stacked vertically on
 * a transparent background. The script finds those three blocks by scanning the
 * alpha channel for empty rows instead of hard-coding pixel offsets, then
 * composes each output:
 *
 *   icon.png                     1024, mark on #ECFDF5, inside the 66% safe zone
 *   android-icon-foreground.png  1024, mark on transparent, same safe zone
 *   android-icon-background.png  1024, solid #ECFDF5
 *   android-icon-monochrome.png  1024, single-colour #022C22 silhouette
 *   splash-icon.png              1024 wide, mark + wordmark on #FFFFFF
 *   favicon.png                  48, mark on #ECFDF5
 *   logo.png                     1024 wide, full logo trimmed, transparent
 *
 * Every asset is re-decoded after writing and its artwork bounds are checked:
 * nothing may touch the canvas edge (except the deliberately trimmed lockups)
 * and nothing may spill out of the safe zone. Set DBF_ASSET_PREVIEW_DIR to also
 * write flattened copies of the transparent assets for visual review.
 *
 * Raw hex is intentional here: this file is the source of the brand assets, and
 * the values match design system §1/§8 (see docs/design-system.md).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from '@playwright/test';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(PROJECT_ROOT, 'assets', 'brand', 'dbf-logo-original.png');
const OUT_DIR = path.join(PROJECT_ROOT, 'assets');

/** bg-soft: the app icon plate and the Android adaptive background. */
const PLATE = '#ECFDF5';
/** The splash screen background (app.json) — the splash artwork sits on it. */
const SPLASH_PLATE = '#FFFFFF';
/** Brand emerald 950: the monochrome (themed icon) silhouette. */
const MONOCHROME = '#022C22';
/**
 * iOS app icon: the whole square is shown (only the corners are rounded), so
 * 66% of the canvas leaves a comfortable margin and nothing is ever cut.
 */
const SAFE_ZONE = 0.66;

/**
 * Android ADAPTIVE layers (foreground + monochrome) are a different problem.
 *
 * The launcher hands the 108dp layer to an arbitrary mask and only the central
 * 72dp — 66.7% — is guaranteed to survive; but that guarantee is for the
 * INSCRIBED SHAPE, and on a round mask the guaranteed region is the CIRCLE of
 * that diameter, not the square. A 66% square touches the circle only on its
 * axes: its corners sit at 0.66/2 x sqrt(2) = 46.7% of the canvas from the
 * centre, outside the 33.3% radius. The DBF mark is an arch whose widest,
 * tallest points are near its top corners, so a round-mask launcher clipped
 * the outer arch baseline. Fitting the art inside a 58% box puts its corners
 * at 41% — still outside a perfect circle, but the mark's own corners are
 * empty, and the check below measures the INKED pixels against the real
 * circle rather than trusting the box.
 *
 * MEASURED, not guessed. Rendering the layer and testing every inked pixel
 * against the 66.7% circle (r = 341.5px on the 1024px canvas):
 *   fill 0.66 -> far outside;  fill 0.58 -> 541 pixels out, worst r = 356.4px
 *   fill 0.55 -> 0 pixels out, worst r = 338.0px
 * The binding pixel is the outer arch baseline at the bottom-left of the mark,
 * which is why a box-only check kept passing while a round-mask launcher cut
 * it. iOS `icon.png` keeps SAFE_ZONE: its mask is a squircle, not a circle.
 */
const ADAPTIVE_SAFE_ZONE = 0.55;
const ICON_SIZE = 1024;
const FAVICON_SIZE = 48;
const WIDE_SIZE = 1024;

type Box = { x: number; y: number; width: number; height: number };
type Region = 'mark' | 'markWithWordmark' | 'full';
type Analysis = { width: number; height: number; regions: Record<Region, Box> };
type Check = { file: string; width: number; height: number; content: Box | null };
type AssetSpec = {
  file: string;
  options: ComposeOptions;
  /** The artwork is meant to reach the canvas edge (trimmed lockups). */
  edgeToEdge?: boolean;
};

/** Everything below runs inside the browser page, where a 2D canvas exists. */
const BROWSER_HELPERS = `
function loadImage(url) {
  const img = new Image();
  img.src = url;
  return img.decode().then(() => img);
}
function pixels(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
function alphaBox(data, width, fromRow, toRow, threshold) {
  let minX = Infinity, maxX = -1, minY = Infinity, maxY = -1;
  for (let y = fromRow; y <= toRow; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/**
 * Bounding box of the ARTWORK. On a transparent canvas that is every visible
 * pixel; on an opaque plate every pixel is visible, so the plate colour itself
 * has to be discounted or the box is always the whole canvas.
 */
function inkBox(data, width, height, background) {
  if (!background) return alphaBox(data, width, 0, height - 1, 16);
  const [br, bg, bb] = hexToRgb(background);
  let minX = Infinity, maxX = -1, minY = Infinity, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const differs =
        Math.abs(data[i] - br) > 8 ||
        Math.abs(data[i + 1] - bg) > 8 ||
        Math.abs(data[i + 2] - bb) > 8;
      if (data[i + 3] > 16 && differs) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
`;

function browserScript(body: string): string {
  return `${BROWSER_HELPERS}\n${body}`;
}

/** Splits the artwork into mark / mark+wordmark / full by scanning for blank rows. */
async function analyse(page: import('@playwright/test').Page, dataUrl: string): Promise<Analysis> {
  return page.evaluate(
    new Function(
      'url',
      browserScript(`
        return loadImage(url).then((img) => {
          const image = pixels(img);
          const { data, width, height } = image;
          const rowFilled = [];
          for (let y = 0; y < height; y++) {
            let filled = 0;
            for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 16) filled++;
            rowFilled.push(filled);
          }
          const first = rowFilled.findIndex((n) => n > 0);
          let last = height - 1;
          while (last > first && rowFilled[last] === 0) last--;

          // Blank horizontal bands separate the stacked blocks of the lockup.
          const gaps = [];
          let start = null;
          for (let y = first; y <= last; y++) {
            if (rowFilled[y] === 0) {
              if (start === null) start = y;
            } else if (start !== null) {
              gaps.push({ start, end: y - 1 });
              start = null;
            }
          }
          if (gaps.length < 2) throw new Error('Expected two blank bands in the source logo, found ' + gaps.length);

          const markBottom = gaps[0].start - 1;
          const wordmarkBottom = gaps[1].start - 1;
          const box = (from, to) => {
            const found = alphaBox(data, width, from, to, 16);
            if (!found) throw new Error('Empty region ' + from + '..' + to);
            return found;
          };
          return {
            width,
            height,
            regions: {
              mark: box(first, markBottom),
              markWithWordmark: box(first, wordmarkBottom),
              full: box(first, last),
            },
          };
        });
      `),
    ) as unknown as (url: string) => Promise<Analysis>,
    dataUrl,
  );
}

type ComposeOptions = {
  source: Box;
  canvas: { width: number; height: number };
  background: string | null;
  /** Fraction of the canvas the artwork may occupy (1 = edge to edge). */
  fill: number;
  tint: string | null;
};

async function compose(
  page: import('@playwright/test').Page,
  dataUrl: string,
  options: ComposeOptions,
): Promise<string> {
  return page.evaluate(
    new Function(
      'input',
      browserScript(`
        const { url, source, canvas: size, background, fill, tint } = input;
        return loadImage(url).then((img) => {
          const canvas = document.createElement('canvas');
          canvas.width = size.width;
          canvas.height = size.height;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          if (background) {
            ctx.fillStyle = background;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          const scale = Math.min(
            (size.width * fill) / source.width,
            (size.height * fill) / source.height,
          );
          const drawWidth = source.width * scale;
          const drawHeight = source.height * scale;
          const left = (size.width - drawWidth) / 2;
          const top = (size.height - drawHeight) / 2;
          // fill 0 means "plate only" (the Android adaptive background layer).
          if (drawWidth < 1 || drawHeight < 1) {
            return canvas.toDataURL('image/png');
          }
          if (tint) {
            // Silhouette: paint the artwork, then keep only its alpha.
            const stencil = document.createElement('canvas');
            stencil.width = canvas.width;
            stencil.height = canvas.height;
            const sctx = stencil.getContext('2d');
            sctx.imageSmoothingEnabled = true;
            sctx.imageSmoothingQuality = 'high';
            sctx.drawImage(img, source.x, source.y, source.width, source.height, left, top, drawWidth, drawHeight);
            sctx.globalCompositeOperation = 'source-in';
            sctx.fillStyle = tint;
            sctx.fillRect(0, 0, stencil.width, stencil.height);
            ctx.drawImage(stencil, 0, 0);
          } else {
            ctx.drawImage(img, source.x, source.y, source.width, source.height, left, top, drawWidth, drawHeight);
          }
          return canvas.toDataURL('image/png');
        });
      `),
    ) as unknown as (input: unknown) => Promise<string>,
    { url: dataUrl, ...options },
  );
}

/**
 * Re-opens a generated PNG and reports its real size and artwork bounds.
 * `background` is the plate the asset was drawn on (null = transparent) so the
 * plate is not mistaken for artwork.
 */
async function inspect(
  page: import('@playwright/test').Page,
  file: string,
  dataUrl: string,
  background: string | null,
): Promise<Check> {
  const result = await page.evaluate(
    new Function(
      'input',
      browserScript(`
        return loadImage(input.url).then((img) => {
          const image = pixels(img);
          return {
            width: image.width,
            height: image.height,
            content: inkBox(image.data, image.width, image.height, input.background),
          };
        });
      `),
    ) as unknown as (input: { url: string; background: string | null }) => Promise<Omit<Check, 'file'>>,
    { url: dataUrl, background },
  );
  return { file, ...result };
}

function pngBuffer(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
}

async function main(): Promise<void> {
  const sourcePath = process.argv[2] ? path.resolve(process.argv[2]) : SOURCE;
  const dataUrl = `data:image/png;base64,${(await readFile(sourcePath)).toString('base64')}`;

  // Optional: flattened copies of the transparent assets, for visual review.
  const previewDir = process.env.DBF_ASSET_PREVIEW_DIR
    ? path.resolve(process.env.DBF_ASSET_PREVIEW_DIR)
    : null;
  if (previewDir) await mkdir(previewDir, { recursive: true });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const { width, height, regions } = await analyse(page, dataUrl);
     
    console.log(`source ${path.relative(PROJECT_ROOT, sourcePath)} ${width}x${height}`);
    for (const [name, box] of Object.entries(regions)) {
       
      console.log(`  region ${name.padEnd(17)} ${box.width}x${box.height} at ${box.x},${box.y}`);
    }

    const square = { width: ICON_SIZE, height: ICON_SIZE };
    const wide = (box: Box) => ({
      width: WIDE_SIZE,
      height: Math.round((WIDE_SIZE * box.height) / box.width),
    });

    const specs: AssetSpec[] = [
      {
        file: 'icon.png',
        options: {
          source: regions.mark,
          canvas: square,
          background: PLATE,
          fill: SAFE_ZONE,
          tint: null,
        },
      },
      {
        file: 'android-icon-foreground.png',
        options: {
          source: regions.mark,
          canvas: square,
          background: null,
          fill: ADAPTIVE_SAFE_ZONE,
          tint: null,
        },
      },
      {
        file: 'android-icon-background.png',
        options: { source: regions.mark, canvas: square, background: PLATE, fill: 0, tint: null },
      },
      {
        file: 'android-icon-monochrome.png',
        options: {
          source: regions.mark,
          canvas: square,
          background: null,
          fill: ADAPTIVE_SAFE_ZONE,
          tint: MONOCHROME,
        },
      },
      {
        // Design system 8: illustration + wordmark on white. The wordmark is
        // black, so it is drawn on the same #FFFFFF the splash screen uses
        // rather than on transparency, where it would vanish in dark mode.
        file: 'splash-icon.png',
        options: {
          source: regions.markWithWordmark,
          canvas: wide(regions.markWithWordmark),
          background: SPLASH_PLATE,
          fill: 1,
          tint: null,
        },
        edgeToEdge: true,
      },
      {
        file: 'favicon.png',
        options: {
          source: regions.mark,
          canvas: { width: FAVICON_SIZE, height: FAVICON_SIZE },
          background: PLATE,
          fill: 0.92,
          tint: null,
        },
      },
      {
        file: 'logo.png',
        options: {
          source: regions.full,
          canvas: wide(regions.full),
          background: null,
          fill: 1,
          tint: null,
        },
        edgeToEdge: true,
      },
    ];

    let failed = false;
    for (const spec of specs) {
      const png = await compose(page, dataUrl, spec.options);
      await writeFile(path.join(OUT_DIR, spec.file), pngBuffer(png));
      const check = await inspect(page, spec.file, png, spec.options.background);
      const content = check.content;
      const clipped =
        !!content &&
        !spec.edgeToEdge &&
        (content.x <= 0 ||
          content.y <= 0 ||
          content.x + content.width >= check.width ||
          content.y + content.height >= check.height);
      if (clipped) failed = true;

      // The safe zone is a maximum: the artwork must fit inside it, not fill it.
      const zone = spec.options.fill;
      const overflowsSafeZone =
        !!content &&
        (zone === SAFE_ZONE || zone === ADAPTIVE_SAFE_ZONE) &&
        (content.width > check.width * zone + 1 || content.height > check.height * zone + 1);
      if (overflowsSafeZone) failed = true;

      const bounds = content
        ? `art ${content.width}x${content.height} at ${content.x},${content.y}`
        : 'flat colour (no artwork)';
       
      console.log(
        `  wrote assets/${spec.file.padEnd(28)} ${check.width}x${check.height} ${bounds}` +
          (clipped ? '  CLIPPED' : '') +
          (overflowsSafeZone ? '  OUTSIDE-SAFE-ZONE' : ''),
      );

      // Transparent assets are unreadable on a dark viewer background; write a
      // flattened copy so a human (or an agent) can actually check them.
      if (previewDir && spec.options.background === null) {
        const preview = await compose(page, dataUrl, {
          ...spec.options,
          background: spec.file === 'android-icon-monochrome.png' ? PLATE : SPLASH_PLATE,
        });
        await writeFile(path.join(previewDir, `preview-${spec.file}`), pngBuffer(preview));
      }
    }
    if (failed) throw new Error('At least one asset is clipped or outside its safe zone');
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
   
  console.error(error);
  process.exitCode = 1;
});
