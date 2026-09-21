import { ProgressRing } from './ui/ProgressRing';

type ScoreRingProps = {
  value: number;
  max: number;
  label: string;
};

/**
 * @deprecated Import `ProgressRing` from `src/components/ui` instead.
 *
 * Kept only so callers outside this stream keep the exact same props (and the
 * same accessible summary, `"<label> <value> of <max>"`).
 *
 * The light-palette pin is GONE. It existed because Home painted a hard-coded
 * `#FFFFFF` page, so a themed ring in dark mode drew near-white text on white
 * (1.05:1). Home is now themed, so the ring follows the theme like everything
 * else — pinning it would be the bug now, not the fix.
 */
export function ScoreRing({ value, max, label }: ScoreRingProps) {
  return <ProgressRing value={value} max={max} label={label} />;
}
