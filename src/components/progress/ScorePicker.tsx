import { PixelRatio, Platform, View } from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { Icon } from '../ui/Icon';
import { minTouchTarget } from '../ui/layout';
import { PressableBase } from '../ui/PressableBase';
import { Text } from '../ui/Typography';
import { shouldStack } from './fontScale';

/** 1-10, laid out as two rows of five. */
export const SCORE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export const SCORES_PER_ROW = 5;
/** Five 44pt targets across stop fitting long before the text stops growing. */
export const SCORES_PER_ROW_LARGE_TEXT = 2;

/** Split 1-10 into fixed rows — wrapping would give 4/4/2 on a 360pt phone. */
export function scoreRows(perRow: number): number[][] {
  const rows: number[][] = [];
  for (let index = 0; index < SCORE_OPTIONS.length; index += perRow) {
    rows.push(SCORE_OPTIONS.slice(index, index + perRow));
  }
  return rows;
}

export type ScorePickerProps = {
  /** The score already saved for this completion, or `null` when unscored. */
  value: number | null;
  /** Used in each button's accessible name — a coach scores several members. */
  subjectName: string;
  disabled?: boolean;
  onSelect: (score: number) => void;
};

function ScoreButton({
  score,
  selected,
  subjectName,
  disabled,
  onSelect,
}: {
  score: number;
  selected: boolean;
  subjectName: string;
  disabled: boolean;
  onSelect: (score: number) => void;
}) {
  const { colors, tokens } = useOptionalTheme();
  const target = minTouchTarget(Platform.OS);

  return (
    <PressableBase
      testID={`score-${score}`}
      onPress={() => onSelect(score)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Score ${subjectName} ${score} out of 10`}
      accessibilityState={{ selected, disabled }}
      pressFeedback={disabled ? 'none' : 'ds'}
      android_ripple={disabled ? undefined : { color: colors.bgSoft }}
      // Layout NEVER goes in a style callback (design system §7, Android).
      style={{
        minWidth: target,
        minHeight: target,
        flexGrow: 1,
        flexShrink: 1,
        flexBasis: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        paddingVertical: tokens.space.xs,
        borderRadius: tokens.radii.md,
        borderWidth: selected ? 0 : 1,
        borderColor: colors.borderStrong,
        backgroundColor: selected ? colors.cta : colors.surface,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text role="labelSm" tabularNums color={selected ? colors.onCta : colors.text}>
        {score}
      </Text>
      {/* The check is the non-colour half of "selected": the filled box says it
          once, the glyph says it again for anyone who cannot see the fill. */}
      {selected ? <Icon name="check" size={16} color={colors.onCta} /> : null}
    </PressableBase>
  );
}

/**
 * The 1-10 effort control.
 *
 * Two rows of five with full 44/48pt targets, in place of the ten 28pt circles
 * the screen used to draw — a coach scoring on a phone was hitting the wrong
 * number. Selection is a filled box PLUS a check glyph, never the fill alone.
 *
 * The rows are FIXED, not wrapped: a percentage basis that fits five across on a
 * 390pt phone spills to 4/4/2 on a 360pt one, and the orphaned "9" and "10" then
 * stretch to half the card each. Past 130% text five across cannot hold a
 * two-digit label next to its check, so the grid drops to two per row (§9).
 */
export function ScorePicker({ value, subjectName, disabled = false, onSelect }: ScorePickerProps) {
  const { tokens } = useOptionalTheme();
  const perRow = shouldStack(PixelRatio.getFontScale())
    ? SCORES_PER_ROW_LARGE_TEXT
    : SCORES_PER_ROW;

  return (
    <View testID="score-picker" style={{ gap: tokens.space.sm }}>
      {scoreRows(perRow).map((row) => (
        <View
          key={row[0]}
          style={{ flexDirection: 'row', alignItems: 'stretch', gap: tokens.space.sm }}
        >
          {row.map((score) => (
            <ScoreButton
              key={score}
              score={score}
              selected={value === score}
              subjectName={subjectName}
              disabled={disabled}
              onSelect={onSelect}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
