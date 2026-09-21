import { useCallback } from 'react';
import { FlatList, View } from 'react-native';

import { itemSublabel } from '../../features/notes/checklist';
import { summarizeProgress } from '../../features/notes/progress';
import type { NoteChecklist, NoteChecklistItem } from '../../services/transcription/types';
import { Banner, Card, ChecklistRow, Heading, Text } from '../ui';
import { ChecklistProgress } from './ChecklistProgress';

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

  const keyExtractor = useCallback((item: NoteChecklistItem) => item.key, []);

  const renderItem = useCallback(
    ({ item }: { item: NoteChecklistItem }) => {
      const checked = checkedKeys.has(item.key);
      const sublabel = itemSublabel(item);
      if (readOnly) {
        // A coach previewing a published note reads it; nothing here is tickable, so the row is
        // text rather than a checkbox that lies about being pressable.
        return (
          <Card padding={16}>
            <View style={{ gap: 4 }}>
              <Text role={item.kind === 'exercise' ? 'label' : 'body'}>{item.text}</Text>
              {sublabel ? (
                <Text role="bodySm" tone="muted">
                  {sublabel}
                </Text>
              ) : null}
            </View>
          </Card>
        );
      }
      return (
        <ChecklistRow
          label={item.text}
          sublabel={sublabel ?? undefined}
          checked={checked}
          onToggle={() => onToggle(item.key, checked)}
        />
      );
    },
    [checkedKeys, onToggle, readOnly],
  );

  return (
    <FlatList
      data={checklist.items}
      keyExtractor={keyExtractor}
      contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 8 }}
      refreshing={refreshing}
      onRefresh={onRefresh}
      progressViewOffset={0}
      ListHeaderComponent={
        <View style={{ gap: 8, marginBottom: 8 }}>
          <Heading level={2}>{checklist.title}</Heading>
          {subtitle ? (
            <Text role="bodySm" tone="muted">
              {subtitle}
            </Text>
          ) : null}
          {readOnly ? null : <ChecklistProgress done={progress.done} total={progress.total} label={progress.label} />}
          {errorNotice ? <Banner tone="danger" title={errorNotice} /> : null}
        </View>
      }
      ListEmptyComponent={
        <Text role="bodySm" tone="muted">
          This checklist has no items.
        </Text>
      }
      renderItem={renderItem}
    />
  );
}
