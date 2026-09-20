import { FlatList, Pressable, Text, View } from 'react-native';

import { itemSublabel } from '../../features/notes/checklist';
import { summarizeProgress } from '../../features/notes/progress';
import type { NoteChecklist } from '../../services/transcription/types';
import { colors } from '../../theme/tokens';

type Props = {
  checklist: NoteChecklist;
  checkedKeys: ReadonlySet<string>;
  onToggle: (key: string, currentlyChecked: boolean) => void;
  /** Extra header content (e.g. the class name / date). */
  subtitle?: string | null;
  errorNotice?: string | null;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Coach preview of a published note: no ticking, no progress. */
  readOnly?: boolean;
};

/** Published checklist a member can do solo, with persistent per-item checks. */
export function MemberChecklist({
  checklist,
  checkedKeys,
  onToggle,
  subtitle,
  errorNotice,
  refreshing,
  onRefresh,
  readOnly = false,
}: Props) {
  const progress = summarizeProgress(checklist.items, checkedKeys);

  return (
    <FlatList
      data={checklist.items}
      keyExtractor={(item) => item.key}
      contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 8 }}
      refreshing={refreshing}
      onRefresh={onRefresh}
      ListHeaderComponent={
        <View style={{ gap: 8, marginBottom: 8 }}>
          <Text style={{ fontSize: 22, fontWeight: '700', color: '#0F172A' }}>{checklist.title}</Text>
          {subtitle ? <Text style={{ fontSize: 13, color: '#475569' }}>{subtitle}</Text> : null}
          {readOnly ? null : (
          <Text
            accessibilityRole="progressbar"
            accessibilityLabel={progress.label}
            accessibilityValue={{ min: 0, max: progress.total, now: progress.done }}
            style={{ fontSize: 15, fontWeight: '600', color: '#047857' }}
          >
            {progress.label}
          </Text>
          )}
          {readOnly ? null : (
            <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.primaryMuted, overflow: 'hidden' }}>
              <View
                style={{
                  height: 8,
                  width: `${Math.round(progress.fraction * 100)}%`,
                  backgroundColor: colors.primary,
                }}
              />
            </View>
          )}
          {errorNotice ? (
            <Text accessibilityRole="alert" style={{ fontSize: 13, color: '#B91C1C' }}>
              {errorNotice}
            </Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <Text style={{ fontSize: 14, color: '#475569' }}>This checklist has no items.</Text>
      }
      renderItem={({ item }) => {
        const checked = checkedKeys.has(item.key);
        const sublabel = itemSublabel(item);
        return (
          <Pressable
            onPress={() => onToggle(item.key, checked)}
            disabled={readOnly}
            accessibilityRole={readOnly ? 'text' : 'checkbox'}
            accessibilityLabel={item.text}
            accessibilityState={{ checked }}
            android_ripple={{ color: '#D1FAE5' }}
            style={({ pressed }) => ({
              minHeight: 56,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              borderWidth: 1,
              borderColor: '#E2E8F0',
              backgroundColor: checked ? '#F0FDF4' : '#F8FAFC',
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            {readOnly ? null : (
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                borderWidth: 2,
                alignItems: 'center',
                justifyContent: 'center',
                borderColor: checked ? '#047857' : '#94A3B8',
                backgroundColor: checked ? '#047857' : '#FFFFFF',
              }}
            >
              {checked ? <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>✓</Text> : null}
            </View>
            )}
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: item.kind === 'exercise' ? '600' : '400',
                  color: checked ? '#475569' : '#0F172A',
                  textDecorationLine: checked ? 'line-through' : 'none',
                }}
              >
                {item.text}
              </Text>
              {sublabel ? <Text style={{ fontSize: 13, color: '#475569' }}>{sublabel}</Text> : null}
            </View>
          </Pressable>
        );
      }}
    />
  );
}
