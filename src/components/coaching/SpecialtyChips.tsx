import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { SPECIALTY_MAX_LENGTH } from '../../features/coaching/validators';

export function SpecialtyChipList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {items.map((s) => (
        <View key={s} style={{ backgroundColor: '#D1FAE5', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Text style={{ fontSize: 13, color: '#065F46' }}>{s}</Text>
        </View>
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

/** Chip input: type a specialty and press return / Add; tap a chip to remove it. */
export function SpecialtyChipInput({ items, onChange, error, onSubmitEditing, returnKeyType = 'done' }: InputProps) {
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
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {items.map((s) => (
          <Pressable
            key={s}
            onPress={() => onChange(items.filter((i) => i !== s))}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${s}`}
            android_ripple={{ color: '#A7F3D0' }}
            style={({ pressed }) => ({
              minHeight: 44,
              justifyContent: 'center',
              backgroundColor: '#D1FAE5',
              borderRadius: 999,
              paddingHorizontal: 12,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ fontSize: 14, color: '#065F46' }}>{s}  ×</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => {
            commit();
            onSubmitEditing?.();
          }}
          blurOnSubmit={false}
          placeholder="Add a specialty"
          placeholderTextColor="#64748B"
          accessibilityLabel="Add a specialty"
          returnKeyType={returnKeyType}
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={SPECIALTY_MAX_LENGTH * 2}
          style={{
            flex: 1,
            minHeight: 44,
            borderWidth: 1,
            borderColor: error ? '#DC2626' : '#E2E8F0',
            borderRadius: 10,
            paddingHorizontal: 12,
            color: '#0F172A',
          }}
        />
        <Pressable
          onPress={commit}
          accessibilityRole="button"
          accessibilityLabel="Add specialty"
          accessibilityState={{ disabled: draft.trim().length === 0 }}
          disabled={draft.trim().length === 0}
          android_ripple={{ color: '#A7F3D0' }}
          style={({ pressed }) => ({
            minHeight: 44,
            minWidth: 64,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 10,
            backgroundColor: draft.trim() ? '#047857' : '#E2E8F0',
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ color: draft.trim() ? '#FFFFFF' : '#475569', fontWeight: '600' }}>Add</Text>
        </Pressable>
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={{ color: '#B91C1C', fontSize: 13 }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
