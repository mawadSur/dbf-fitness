import { View } from 'react-native';

import type { CoachClass } from '../../features/notes/types';
import { useOptionalTheme } from '../../theme/ThemeProvider';
import { Icon, PressableBase, Text } from '../ui';
import { formatRecordingDate } from './RecordingListItem';

type Props = {
  item: CoachClass;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
};

/**
 * One class in the upload screen's "choose the class" radio group.
 *
 * The chosen class is marked by a filled CHECK icon and a heavier border, not by its tint alone
 * (design system §9), so it still reads in dark mode and in greyscale. `accessibilityRole="radio"`
 * plus `accessibilityState.selected` is what a screen reader and the upload tests both read.
 */
export function ClassPickerRow({ item, selected, disabled, onPress }: Props) {
  const { colors, tokens } = useOptionalTheme();
  const date = formatRecordingDate(item.starts_at);

  return (
    <PressableBase
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityLabel={item.title}
      accessibilityState={{ selected, disabled }}
      android_ripple={{ color: colors.bgSoft }}
      pressFeedback={0.75}
      // Layout NEVER goes in a style callback — see `PressableBase`.
      style={{
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.cta : colors.borderSoft,
        backgroundColor: selected ? colors.bgSoft : colors.surface,
        borderRadius: tokens.radii.md,
        paddingHorizontal: 14,
        paddingVertical: 10,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Icon
        name={selected ? 'check-circle' : 'calendar'}
        size={20}
        color={selected ? colors.cta : colors.textMuted}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <Text role="label" numberOfLines={2}>
          {item.title}
        </Text>
        {date ? (
          <Text role="bodySm" tone="muted">
            {date}
          </Text>
        ) : null}
      </View>
    </PressableBase>
  );
}
