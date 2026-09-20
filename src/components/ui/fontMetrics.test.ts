/**
 * Keeps `GLYPH_ADVANCE_EM` honest.
 *
 * The tab-bar fit model decides whether a label is tail-truncated on a real
 * device, so its glyph widths cannot be eyeballed constants: this test parses
 * the SHIPPED Inter binaries (`hmtx` advances resolved through the format-4
 * `cmap`, over `head.unitsPerEm`) and asserts the table still matches them.
 * If the font package is upgraded and the metrics move, this goes red instead
 * of the labels quietly starting to clip.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import { FALLBACK_GLYPH_ADVANCE_EM, GLYPH_ADVANCE_EM, textAdvanceEm } from './layout';

const FONTS = [
  'node_modules/@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf',
  'node_modules/@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf',
];

/** Advance width of every printable ASCII character in `file`, in em. */
function advancesOf(file: string): Record<string, number> {
  const font = readFileSync(join(process.cwd(), file));
  const tables: Record<string, number> = {};
  const tableCount = font.readUInt16BE(4);
  for (let i = 0; i < tableCount; i += 1) {
    const record = 12 + i * 16;
    tables[font.toString('ascii', record, record + 4)] = font.readUInt32BE(record + 8);
  }

  const unitsPerEm = font.readUInt16BE(tables.head + 18);
  const hMetrics = font.readUInt16BE(tables.hhea + 34);
  const advance = (glyph: number) =>
    font.readUInt16BE(tables.hmtx + Math.min(glyph, hMetrics - 1) * 4);

  // cmap → the last unicode format-4 subtable.
  let subtable = -1;
  const subtableCount = font.readUInt16BE(tables.cmap + 2);
  for (let i = 0; i < subtableCount; i += 1) {
    const record = tables.cmap + 4 + i * 8;
    const platform = font.readUInt16BE(record);
    const offset = tables.cmap + font.readUInt32BE(record + 4);
    if (font.readUInt16BE(offset) === 4 && (platform === 3 || platform === 0)) subtable = offset;
  }
  if (subtable < 0) throw new Error(`no format-4 cmap in ${file}`);

  const segments = font.readUInt16BE(subtable + 6) / 2;
  const endAt = subtable + 14;
  const startAt = endAt + segments * 2 + 2;
  const deltaAt = startAt + segments * 2;
  const rangeAt = deltaAt + segments * 2;

  const glyphFor = (code: number): number => {
    for (let i = 0; i < segments; i += 1) {
      if (code > font.readUInt16BE(endAt + i * 2)) continue;
      const start = font.readUInt16BE(startAt + i * 2);
      if (code < start) return 0;
      const delta = font.readInt16BE(deltaAt + i * 2);
      const rangeOffset = font.readUInt16BE(rangeAt + i * 2);
      if (rangeOffset === 0) return (code + delta) & 0xffff;
      const glyph = font.readUInt16BE(rangeAt + i * 2 + rangeOffset + (code - start) * 2);
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    }
    return 0;
  };

  const out: Record<string, number> = {};
  for (let code = 0x20; code <= 0x7e; code += 1) {
    out[String.fromCharCode(code)] = advance(glyphFor(code)) / unitsPerEm;
  }
  return out;
}

describe('glyph advance table', () => {
  const measured = FONTS.map(advancesOf);
  const widest = (char: string) => Math.max(...measured.map((table) => table[char]));

  it('covers every printable ASCII character', () => {
    for (let code = 0x20; code <= 0x7e; code += 1) {
      expect(GLYPH_ADVANCE_EM).toHaveProperty([String.fromCharCode(code)]);
    }
  });

  it('matches the shipped Inter Medium/SemiBold binaries, never under-measuring', () => {
    for (const char of Object.keys(GLYPH_ADVANCE_EM)) {
      const actual = widest(char);
      const table = GLYPH_ADVANCE_EM[char];
      // Rounded up to 3dp from the wider of the two weights: never narrower
      // than the font (which would under-measure a label), never padded.
      expect({ char, under: table < actual }).toEqual({ char, under: false });
      expect(table - actual).toBeLessThan(0.001);
    }
  });

  it('charges an unknown character the widest glyph in the font', () => {
    expect(FALLBACK_GLYPH_ADVANCE_EM).toBe(Math.max(...Object.values(GLYPH_ADVANCE_EM)));
  });

  it('reproduces the label widths the tab-bar model is built on', () => {
    const inFont = (label: string) => [...label].reduce((sum, char) => sum + widest(char), 0);
    for (const label of ['Home', 'Workout', 'Food', 'Community', 'Profile']) {
      expect(textAdvanceEm(label)).toBeCloseTo(inFont(label), 2);
    }
    // 5.578em × 24pt = 134pt of glyphs — two 74pt lines on a 390pt phone.
    expect(textAdvanceEm('Community') * 24).toBeGreaterThan(74 * 1.8);
  });
});
