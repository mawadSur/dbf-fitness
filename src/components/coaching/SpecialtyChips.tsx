import { useState } from 'react';
import { View } from 'react-native';

import { SPECIALTY_MAX_LENGTH } from '../../features/coaching/validators';
import { useOptionalTheme } from '../../theme/ThemeProvider';
import { Button, Chip, Icon, Input, PressableBase, Text } from '../ui';

export function SpecialtyChipList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {items.map((s) => (
        <Chip key={s} label={s} />
      ))}
    </View>
  );
}

type InputProps = {
  items: string[];
  onChange: (next: string[]) => void;
  error?: string;
  onSubmitEditing?: () => void;
  returnKeyType?: 'next' | 'done';
};

/**
 * Chip input: type a specialty and press return / Add; tap a chip to remove it.
 *
 * Each chip is a 44pt-tall button carrying an `x` icon, so removal is a target you can hit and a
 * shape you can recognise rather than a bare glyph in the label.
 */
export function SpecialtyChipInput({ items, onChange, error, onSubmitEditing, returnKeyType = 'done' }: InputProps) {
  const { colors, tokens } = useOptionalTheme();
  const [draft, setDraft] = useState('');

  const commit = () => {
    const value = draft.trim();
    if (value) {
      const exists = items.some((i) => i.toLowerCase() === value.toLowerCase());
      if (!exists) onChange([...items, value]);
    }
    setDraft('');
  };

  return (
    <View style={{ gap: 12 }}>
      {items.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {items.map((s) => (
            <PressableBase
              key={s}
              onPress={() => onChange(items.filter((i) => i !== s))}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${s}`}
              android_ripple={{ color: colors.bgSoft }}
              pressFeedback={0.7}
              // Layout NEVER goes in a style callback — see `PressableBase`.
              style={{
                minHeight: 44,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                borderRadius: tokens.radii.pill,
                borderWidth: 1,
                borderColor: colors.borderStrong,
              }}
            >
              <Text role="bodySmMedium">{s}</Text>
              <Icon name="x" size={16} color={colors.textSecondary} />
            </PressableBase>
          ))}
        </View>
      ) : null}
      {/* Field above, Add below: the pair never has to share a row, so it holds at 200% text
          without either half being squeezed (design system §9). */}
      <Input
        label="Add a specialty"
        value={draft}
        // The field itself stops well short of the limit the validator enforces, so a paste can
        // never leave the coach staring at a length error they cannot see the end of.
        onChangeText={(next) => setDraft(next.slice(0, SPECIALTY_MAX_LENGTH * 2))}
        onSubmitEditing={() => {
          commit();
          onSubmitEditing?.();
        }}
        placeholder="Strength, mobility, …"
        error={error}
        returnKeyType={returnKeyType}
        autoCapitalize="words"
      />
      <Button
        label="Add specialty"
        onPress={commit}
        disabled={draft.trim().length === 0}
        variant="secondary"
        leadingIcon="plus"
        fullWidth
      />
    </View>
  );
}
